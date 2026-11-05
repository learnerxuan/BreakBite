import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MealService } from '../src/server/domain.js';
import { FileStore, MemoryStore } from '../src/server/store.js';
import { seedVendor, DEMO_IDENTITIES } from '../src/server/seed.js';
import { AppError } from '../src/server/errors.js';
import { atRisk, type Actor, type BreakPlan, type Proposal, type PublicOrder } from '../src/shared/model.js';
const NOW = Date.parse('2026-11-05T04:00:00.000Z');
const alex = DEMO_IDENTITIES[0]!;
const sam = DEMO_IDENTITIES[1]!;
const vendor = DEMO_IDENTITIES[2]!;
const otherVendor = DEMO_IDENTITIES[3]!;
const agent: Actor = { id: 'agent', role: 'agent', name: 'Agent', vendorId: 'bowl-lab' };
const errorCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
async function fixture() {
    const store = new MemoryStore();
    let now = NOW;
    await store.initialize(seedVendor('bowl-lab', now));
    await store.initialize(seedVendor('noodle-co', now));
    const service = new MealService(store, () => now);
    const plan: BreakPlan = { breakStartAt: new Date(now).toISOString(), nextClassAt: new Date(now + 40 * 60000).toISOString(), walkToMinutes: 3, eatMinutes: 12, returnMinutes: 5, bufferMinutes: 3, budgetSen: 1500 };
    const input = { vendorId: 'bowl-lab', items: [{ itemId: 'chicken-rice', quantity: 1 }], slotId: (await store.read('bowl-lab')).slots[0]!.id, plan };
    const order = (who = alex, key = randomUUID()) => service.createOrder(who, input, key);
    const incident = () => service.reportIncident(vendor, 'bowl-lab', { itemIds: ['chicken-rice'], delayMinutes: 15, reason: 'Rice cooker delayed' });
    async function proposal(): Promise<{
        order: PublicOrder;
        proposal: Proposal;
    }> {
        const o = await order();
        await incident();
        const option = (await service.evaluateRecovery(vendor, 'bowl-lab', o.id)).options[0]!;
        assert.ok(option, 'fixture must have a valid replacement');
        const p = await service.createProposal(agent, 'bowl-lab', { orderId: o.id, itemId: option.itemId, slotId: option.slotId, reason: 'Verified alternative' });
        return { order: o, proposal: p };
    }
    return { store, service, plan, input, order, incident, proposal, advance: (ms: number) => { now += ms; } };
}
test('quotes account for eating, both walking legs, and buffer', async () => {
    const f = await fixture();
    const q = await f.service.quote(alex, f.input);
    assert.equal(q.latestPickupAt, '2026-11-05T04:20:00.000Z');
    assert.equal(q.earliestPickupAt, '2026-11-05T04:03:00.000Z');
    assert.ok(q.slots.length > 0);
    assert.ok(q.slots.every(s => s.endAt <= q.latestPickupAt));
});
test('short breaks, low budgets, sold-out food and closed vendors return no slots', async () => {
    const f = await fixture();
    assert.equal((await f.service.quote(alex, { ...f.input, plan: { ...f.plan, budgetSen: 200 } })).slots.length, 0);
    assert.equal((await f.service.quote(alex, { ...f.input, plan: { ...f.plan, nextClassAt: new Date(NOW + 10 * 60000).toISOString() } })).slots.length, 0);
    await f.service.updateItem(vendor, 'bowl-lab', 'chicken-rice', { stock: 0 });
    assert.equal((await f.service.quote(alex, f.input)).slots.length, 0);
    await f.service.updateItem(vendor, 'bowl-lab', 'chicken-rice', { stock: 20 });
    await f.service.setOpen(vendor, 'bowl-lab', { open: false });
    assert.equal((await f.service.quote(alex, f.input)).slots.length, 0);
});
test('server-authoritative prices, inventory, workload and pickup handovers', async () => {
    const f = await fixture();
    const o = await f.service.createOrder(alex, { ...f.input, totalSen: 1, studentId: 'someone-else', status: 'collected' }, randomUUID());
    assert.equal(o.totalSen, 950);
    assert.equal(o.studentId, alex.id);
    assert.equal(o.status, 'confirmed');
    const s = await f.store.read('bowl-lab');
    assert.equal(s.items[0]!.stock, 19);
    assert.equal(s.slots[0]!.reservedUnits, 2);
    assert.equal(s.slots[0]!.reservedHandovers, 1);
});
test('concurrent requests for the final slot admit exactly one order', async () => {
    const f = await fixture();
    await f.store.transact('bowl-lab', s => { s.slots[0]!.pickupCapacity = 1; });
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => f.order({ ...alex, id: `student-${i}` })));
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    const s = await f.store.read('bowl-lab');
    assert.equal(s.orders.length, 1);
    assert.equal(s.items[0]!.stock, 19);
    assert.equal(s.slots[0]!.reservedHandovers, 1);
});
test('concurrent idempotent retries create one order and reject changed payloads', async () => {
    const f = await fixture();
    const key = randomUUID();
    const orders = await Promise.all(Array.from({ length: 15 }, () => f.order(alex, key)));
    assert.equal(new Set(orders.map(o => o.id)).size, 1);
    assert.equal((await f.store.read('bowl-lab')).orders.length, 1);
    await assert.rejects(f.service.createOrder(alex, { ...f.input, items: [{ itemId: 'egg-toast', quantity: 1 }] }, key), errorCode('IDEMPOTENCY_CONFLICT'));
});
test('kitchen workload is enforced independently of handover count', async () => {
    const f = await fixture();
    await f.store.transact('bowl-lab', s => { s.slots[0]!.kitchenCapacity = 2; s.slots[0]!.pickupCapacity = 10; });
    await f.order();
    await assert.rejects(f.order(sam), errorCode('NO_AVAILABLE_SLOT'));
    assert.equal((await f.store.read('bowl-lab')).slots[0]!.reservedUnits, 2);
});
test('malformed quantities, duplicate selections, mixed vendors and invalid timestamps are rejected', async () => {
    const f = await fixture();
    for (const quantity of [-1, 0, 1.5, 6, '1'])
        await assert.rejects(f.service.quote(alex, { ...f.input, items: [{ itemId: 'chicken-rice', quantity }] }), errorCode('INVALID_INPUT'));
    await assert.rejects(f.service.quote(alex, { ...f.input, items: [f.input.items[0], f.input.items[0]] }), errorCode('INVALID_ITEMS'));
    await assert.rejects(f.service.quote(alex, { ...f.input, items: [{ itemId: 'mee-goreng', quantity: 1 }] }), errorCode('NOT_FOUND'));
    await assert.rejects(f.service.quote(alex, { ...f.input, plan: { ...f.plan, nextClassAt: 'tomorrow' } }), errorCode('INVALID_INPUT'));
});
test('cancellation restores unprepared stock and both reservations exactly once', async () => {
    const f = await fixture();
    const o = await f.order();
    await f.service.cancel(alex, 'bowl-lab', o.id);
    const s = await f.store.read('bowl-lab');
    assert.equal(s.items[0]!.stock, 20);
    assert.equal(s.slots[0]!.reservedUnits, 0);
    assert.equal(s.slots[0]!.reservedHandovers, 0);
    await assert.rejects(f.service.cancel(alex, 'bowl-lab', o.id), errorCode('ALREADY_PREPARING'));
});
test('preparing food cannot be cancelled and silently restocked', async () => {
    const f = await fixture();
    const o = await f.order();
    await f.service.changeStatus(vendor, 'bowl-lab', o.id, { status: 'preparing' });
    await assert.rejects(f.service.cancel(alex, 'bowl-lab', o.id), errorCode('ALREADY_PREPARING'));
    assert.equal((await f.store.read('bowl-lab')).items[0]!.stock, 19);
});
test('cross-student, cross-vendor and agent privilege escalation fail', async () => {
    const f = await fixture();
    const o = await f.order();
    await assert.rejects(f.service.cancel(sam, 'bowl-lab', o.id), errorCode('NOT_FOUND'));
    for (const who of [alex, otherVendor, agent])
        await assert.rejects(f.service.changeStatus(who, 'bowl-lab', o.id, { status: 'preparing' }), errorCode('FORBIDDEN'));
    await assert.rejects(f.service.setOpen(otherVendor, 'bowl-lab', { open: false }), errorCode('FORBIDDEN'));
});
test('pickup secrets are visible only to the owning student, never vendor or MCP', async () => {
    const f = await fixture();
    const o = await f.order();
    assert.ok(o.pickupCode);
    assert.equal((await f.service.snapshot(alex, 'demo')).orders[0]!.pickupCode, o.pickupCode);
    assert.equal((await f.service.snapshot(sam, 'demo')).orders.length, 0);
    assert.equal((await f.service.snapshot(vendor, 'demo')).orders[0]!.pickupCode, undefined);
    assert.equal((await f.service.snapshot(otherVendor, 'demo')).orders.length, 0);
    const mcp = JSON.stringify(await f.service.agentState(agent));
    assert.ok(!mcp.includes(o.pickupCode!));
    assert.ok(!mcp.includes(alex.id));
});
test('valid state transitions and one-time collection', async () => {
    const f = await fixture();
    const o = await f.order();
    await assert.rejects(f.service.changeStatus(vendor, 'bowl-lab', o.id, { status: 'ready' }), errorCode('INVALID_TRANSITION'));
    await assert.rejects(f.service.collect(vendor, 'bowl-lab', o.id, { code: o.pickupCode }), errorCode('NOT_READY'));
    await f.service.changeStatus(vendor, 'bowl-lab', o.id, { status: 'preparing' });
    await f.service.changeStatus(vendor, 'bowl-lab', o.id, { status: 'ready' });
    await f.service.collect(vendor, 'bowl-lab', o.id, { code: o.pickupCode });
    await assert.rejects(f.service.collect(vendor, 'bowl-lab', o.id, { code: o.pickupCode }), errorCode('NOT_READY'));
    assert.equal((await f.service.snapshot(alex, 'demo')).orders[0]!.pickupCode, undefined);
    assert.ok(!JSON.stringify((await f.store.read('bowl-lab')).audit).includes(o.pickupCode!));
});
test('incorrect pickup attempts persist and temporarily lock verification', async () => {
    const f = await fixture();
    const o = await f.order();
    await f.service.changeStatus(vendor, 'bowl-lab', o.id, { status: 'preparing' });
    await f.service.changeStatus(vendor, 'bowl-lab', o.id, { status: 'ready' });
    for (let i = 0; i < 5; i++)
        await assert.rejects(f.service.collect(vendor, 'bowl-lab', o.id, { code: 'WRONG' }), errorCode('INVALID_CODE'));
    await assert.rejects(f.service.collect(vendor, 'bowl-lab', o.id, { code: o.pickupCode }), errorCode('PICKUP_LOCKED'));
    f.advance(61000);
    await f.service.collect(vendor, 'bowl-lab', o.id, { code: o.pickupCode });
});
test('incidents update estimates and resolution clears the additional delay', async () => {
    const f = await fixture();
    const o = await f.order();
    await f.incident();
    const s = await f.store.read('bowl-lab');
    assert.ok(atRisk(s.orders[0]!));
    assert.equal(s.orders[0]!.version, 2);
    await f.service.resolveIncident(vendor, 'bowl-lab', s.incidents[0]!.id);
    assert.equal((await f.store.read('bowl-lab')).orders[0]!.estimatedReadyAt, o.estimatedReadyAt);
});
test('recovery requires operator approval and student consent; proposal alone changes nothing', async () => {
    const f = await fixture();
    const { order: o, proposal: p } = await f.proposal();
    const original = await f.store.read('bowl-lab');
    assert.equal(original.orders[0]!.lines[0]!.itemId, 'chicken-rice');
    assert.equal(original.items[0]!.stock, 19);
    await assert.rejects(f.service.respondProposal(alex, 'bowl-lab', p.id, { accept: true }), errorCode('APPROVAL_REQUIRED'));
    await assert.rejects(f.service.approveProposal(agent, 'bowl-lab', p.id, { approve: true }), errorCode('FORBIDDEN'));
    await f.service.approveProposal(vendor, 'bowl-lab', p.id, { approve: true });
    await assert.rejects(f.service.respondProposal(sam, 'bowl-lab', p.id, { accept: true }), errorCode('NOT_FOUND'));
    await f.service.respondProposal(alex, 'bowl-lab', p.id, { accept: true });
    const s = await f.store.read('bowl-lab');
    assert.equal(s.orders[0]!.lines[0]!.itemId, p.option.itemId);
    assert.equal(s.items[0]!.stock, 20);
    assert.equal(s.proposals[0]!.status, 'accepted');
    assert.ok(s.orders[0]!.totalSen <= o.totalSen);
    assert.ok(!atRisk(s.orders[0]!));
    assert.notEqual(s.orders[0]!.pickupCode, o.pickupCode);
});
test('repeated proposal requests are idempotent within the same order version', async () => {
    const f = await fixture();
    const { order, proposal } = await f.proposal();
    const again = await f.service.createProposal(agent, 'bowl-lab', { orderId: order.id, itemId: proposal.option.itemId, slotId: proposal.option.slotId, reason: 'Retry' });
    assert.equal(again.id, proposal.id);
    assert.equal((await f.store.read('bowl-lab')).proposals.length, 1);
});
test('student decline leaves inventory and original order unchanged', async () => {
    const f = await fixture();
    const { proposal: p } = await f.proposal();
    await f.service.approveProposal(vendor, 'bowl-lab', p.id, { approve: true });
    const before = await f.store.read('bowl-lab');
    await f.service.respondProposal(alex, 'bowl-lab', p.id, { accept: false });
    const after = await f.store.read('bowl-lab');
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.items, before.items);
    assert.equal(after.proposals[0]!.status, 'declined');
});
test('expired proposals cannot be approved or accepted', async () => {
    const f = await fixture();
    const { proposal: p } = await f.proposal();
    await f.service.approveProposal(vendor, 'bowl-lab', p.id, { approve: true });
    f.advance(6 * 60000);
    await assert.rejects(f.service.respondProposal(alex, 'bowl-lab', p.id, { accept: true }), errorCode('EXPIRED'));
    assert.equal((await f.service.snapshot(alex, 'demo')).proposals[0]!.status, 'expired');
});
test('changed orders invalidate proposals and prohibit stale acceptance', async () => {
    const f = await fixture();
    const { proposal: p, order: o } = await f.proposal();
    await f.service.approveProposal(vendor, 'bowl-lab', p.id, { approve: true });
    await f.service.changeStatus(vendor, 'bowl-lab', o.id, { status: 'preparing' });
    await assert.rejects(f.service.respondProposal(alex, 'bowl-lab', p.id, { accept: true }), errorCode('STALE_PROPOSAL'));
});
test('stock is revalidated on acceptance without partially releasing the original reservation', async () => {
    const f = await fixture();
    const { proposal: p } = await f.proposal();
    await f.service.approveProposal(vendor, 'bowl-lab', p.id, { approve: true });
    await f.service.updateItem(vendor, 'bowl-lab', p.option.itemId, { stock: 0 });
    const before = await f.store.read('bowl-lab');
    await assert.rejects(f.service.respondProposal(alex, 'bowl-lab', p.id, { accept: true }), errorCode('UNAVAILABLE_ALTERNATIVE'));
    const after = await f.store.read('bowl-lab');
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.slots, before.slots);
    assert.deepEqual(after.items, before.items);
});
test('capacity is revalidated when accepting a previously valid proposal', async () => {
    const f = await fixture();
    const { proposal: p } = await f.proposal();
    await f.service.approveProposal(vendor, 'bowl-lab', p.id, { approve: true });
    await f.store.transact('bowl-lab', s => { const slot = s.slots.find(x => x.id === p.option.slotId)!; slot.pickupCapacity = 0; });
    await assert.rejects(f.service.respondProposal(alex, 'bowl-lab', p.id, { accept: true }), errorCode('UNAVAILABLE_ALTERNATIVE'));
});
test('no rescue is invented for prepared food or impossible deadlines', async () => {
    const f = await fixture();
    const o = await f.order();
    await f.incident();
    await f.service.changeStatus(vendor, 'bowl-lab', o.id, { status: 'preparing' });
    const result = await f.service.evaluateRecovery(vendor, 'bowl-lab', o.id);
    assert.equal(result.options.length, 0);
    assert.match(result.message, /Preparation/);
});
test('throwing inside a transaction never persists partial stock mutations', async () => {
    const f = await fixture();
    await assert.rejects(f.store.transact('bowl-lab', s => { s.items[0]!.stock = -10; throw new Error('abort'); }));
    assert.equal((await f.store.read('bowl-lab')).items[0]!.stock, 20);
});
test('local file data survives a fresh store instance and concurrent writes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'breakbite-test-'));
    try {
        const store = new FileStore(dir);
        await store.load();
        await store.initialize(seedVendor('bowl-lab', NOW));
        await Promise.all(Array.from({ length: 20 }, () => store.transact('bowl-lab', s => { s.items[0]!.stock++; })));
        const reopened = new FileStore(dir);
        await reopened.load();
        assert.equal((await reopened.read('bowl-lab')).items[0]!.stock, 40);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('operators open fresh windows without rewriting existing reservations', async () => {
    const f = await fixture();
    const o = await f.order();
    const before = (await f.store.read('bowl-lab')).slots.find(x => x.id === o.slotId)!;
    f.advance(4 * 60 * 60000);
    const result = await f.service.openPickupWindows(vendor, 'bowl-lab', { kitchenCapacity: 6, pickupCapacity: 2 });
    assert.equal(result.added, 36);
    const state = await f.store.read('bowl-lab');
    assert.deepEqual(state.slots.find(x => x.id === o.slotId), before);
    assert.equal(state.orders.length, 1);
    assert.equal(state.items[0]!.stock, 19);
    assert.ok(state.slots.filter(x => x.id !== o.slotId).every(x => x.kitchenCapacity === 6 && x.pickupCapacity === 2));
    assert.equal((await f.service.openPickupWindows(vendor, 'bowl-lab', { kitchenCapacity: 6, pickupCapacity: 2 })).added, 0);
});
test('students, agents and other vendors cannot open vendor pickup windows', async () => {
    const f = await fixture();
    for (const who of [alex, agent, otherVendor])
        await assert.rejects(f.service.openPickupWindows(who, 'bowl-lab', { kitchenCapacity: 8, pickupCapacity: 4 }), errorCode('FORBIDDEN'));
    await assert.rejects(f.service.openPickupWindows(vendor, 'bowl-lab', { kitchenCapacity: -1, pickupCapacity: 4 }), errorCode('INVALID_INPUT'));
});
