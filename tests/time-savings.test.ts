import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { estimatedPreparationSavedMinutes, preparationSavings, type SavingsOrder } from '../src/shared/savings.js';
import { LocalDatabase, LocalStore } from '../src/server/local-database.js';
import { CheckoutService } from '../src/server/checkout.js';
import { MealService } from '../src/server/domain.js';
import { ProductService } from '../src/server/product.js';
import { initialState } from '../src/web/state.js';
import { explore } from '../src/web/views/student.js';

const order = (changes: Partial<SavingsOrder> = {}): SavingsOrder => ({ id: 'one', checkoutId: 'checkout', studentId: 'alice',
    status: 'collected', createdAt: '2026-11-11T03:00:00Z', readyAt: '2026-11-11T03:10:00Z',
    preparationBaseline: { minutes: 8, pickupStartAt: '2026-11-11T03:15:00Z' }, ...changes });

test('on-time collected orders earn only their snapshotted preparation estimate', () => {
    assert.equal(estimatedPreparationSavedMinutes(order()), 8);
    assert.equal(estimatedPreparationSavedMinutes(order({ readyAt: '2026-11-11T03:18:00Z' })), 5);
    assert.equal(estimatedPreparationSavedMinutes(order({ readyAt: '2026-11-11T03:25:00Z' })), 0);
});
test('avoided waiting is capped at the order-ahead lead time and rounded down', () => {
    assert.equal(estimatedPreparationSavedMinutes(order({ createdAt: '2026-11-11T03:13:00Z', readyAt: '2026-11-11T03:14:00Z' })), 2);
    assert.equal(estimatedPreparationSavedMinutes(order({ readyAt: '2026-11-11T03:15:30Z' })), 7);
});
test('visits, uncollected/cancelled orders and legacy or invalid snapshots earn no savings', () => {
    for (const status of ['confirmed', 'preparing', 'ready', 'cancelled', 'uncollected'] as const)
        assert.equal(estimatedPreparationSavedMinutes(order({ status })), null);
    assert.equal(estimatedPreparationSavedMinutes(order({ preparationBaseline: undefined })), null);
    assert.equal(estimatedPreparationSavedMinutes(order({ readyAt: undefined })), null);
    assert.equal(estimatedPreparationSavedMinutes(order({ preparationBaseline: { minutes: NaN, pickupStartAt: 'invalid' } })), null);
    assert.equal(estimatedPreparationSavedMinutes(order({ readyAt: '2026-11-11T02:00:00Z' })), null);
});
test('a multi-kitchen checkout counts its largest saving once and totals remain student-scoped', () => {
    const orders = [order(), order({ id: 'two', preparationBaseline: { minutes: 3, pickupStartAt: '2026-11-11T03:20:00Z' } }),
        order({ id: 'three', checkoutId: 'second' }), order({ id: 'private', studentId: 'bob', checkoutId: 'other' })];
    assert.deepEqual(preparationSavings(orders, 'alice'), { minutes: 16, checkouts: 2 });
    assert.deepEqual(preparationSavings(orders, 'bob'), { minutes: 8, checkouts: 1 });
    assert.deepEqual(preparationSavings(orders, 'charlie'), { minutes: 0, checkouts: 0 });
});
test('a replacement can earn only the lead time since it was accepted', () => {
    const replacement = order({ readyAt: '2026-11-11T03:15:00Z',
        preparationBaseline: { minutes: 8, pickupStartAt: '2026-11-11T03:15:00Z', orderedAt: '2026-11-11T03:10:00Z' } });
    assert.equal(estimatedPreparationSavedMinutes(replacement), 5);
});
test('the server snapshots menu estimates, credits collection once and preserves totals across restart', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'breakbite-savings-'));
    const db = new LocalDatabase(dir); await db.open();
    t.after(async () => { await db.close(); await rm(dir, { recursive: true, force: true }); });
    let now = Date.now(); const clock = () => now;
    const service = new MealService(new LocalStore(db), clock, 'pay_at_pickup');
    const checkout = new CheckoutService(db, clock); const product = new ProductService(db, clock);
    const actor = { id: 'alice', role: 'student' as const, name: 'Alice' };
    const operator = { id: 'operator', role: 'vendor' as const, vendorId: 'asian-cuisine', name: 'Kitchen' };
    const slot = db.read().vendors['asian-cuisine']!.slots[3]!;
    const info = db.read().vendors['asian-cuisine']!.items.find(i => i.id === 'nasi-lemak')!.foodInfo;
    const quote = await checkout.quote(actor, { groups: [{ vendorId: 'asian-cuisine', items: [{ itemId: 'nasi-lemak', quantity: 2 }] }], plan: { mode: 'pickup', budgetSen: 5000 } });
    const payload = { groups: [{ vendorId: 'asian-cuisine', items: [{ itemId: 'nasi-lemak', quantity: 2 }], slotId: slot.id }],
        plan: { mode: 'pickup', budgetSen: 5000 }, expectedTotalSen: 2100, menuVersions: quote.menuVersions,
        preparationBaseline: { minutes: 120 } };
    assert.ok(info);
    const created = (await checkout.submit(actor, payload, 'savings-checkout')).orders[0]!;
    assert.deepEqual(created.preparationBaseline, { minutes: 8, pickupStartAt: slot.startAt, orderedAt: new Date(now).toISOString() });
    assert.deepEqual(product.profile(actor).savings, { minutes: 0, checkouts: 0 });
    await db.transaction(d => { d.vendors['asian-cuisine']!.items.find(i => i.id === 'nasi-lemak')!.prepMinutes = 120; });
    now = Date.parse(slot.startAt) - 60000;
    await service.changeStatus(operator, 'asian-cuisine', created.id, { status: 'preparing' });
    await service.changeStatus(operator, 'asian-cuisine', created.id, { status: 'ready' });
    await service.collect(operator, 'asian-cuisine', created.id, { code: created.pickupCode, paymentReceived: true });
    assert.deepEqual(product.profile(actor).savings, { minutes: 8, checkouts: 1 });
    await assert.rejects(service.collect(operator, 'asian-cuisine', created.id, { code: created.pickupCode, paymentReceived: true }));
    assert.deepEqual(product.profile(actor).savings, { minutes: 8, checkouts: 1 });
    assert.deepEqual(product.profile({ ...actor, id: 'bob' }).savings, { minutes: 0, checkouts: 0 });
    await db.close(); await db.open();
    assert.deepEqual(new ProductService(db, clock).profile(actor).savings, { minutes: 8, checkouts: 1 });
    assert.equal((await checkout.submit(actor, payload, 'savings-checkout')).orders.length, 1);
    assert.deepEqual(product.profile(actor).savings, { minutes: 8, checkouts: 1 });
});
test('the impact display is prominent, explicitly estimated and never promises measured queue savings', () => {
    const state = initialState(); state.actor = { id: 'alice', role: 'student', name: 'Alice' };
    state.savings = { minutes: 16, checkouts: 2 };
    const html = explore(state);
    assert.match(html, /aria-label="Your estimated time saved"/);
    assert.match(html, /16/);
    assert.match(html, /Estimated preparation wait avoided/);
    assert.match(html, /How is this estimated/);
    assert.match(html, /queue|walking/);
    assert.ok(html.indexOf('Your estimated time saved') < html.indexOf('Explore the menu'));
});
test('accepted replacements reset the saved preparation baseline and its effective order time', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'breakbite-savings-replacement-'));
    const db = new LocalDatabase(dir); await db.open();
    t.after(async () => { await db.close(); await rm(dir, { recursive: true, force: true }); });
    let now = Date.now(); const clock = () => now;
    const service = new MealService(new LocalStore(db), clock, 'pay_at_pickup');
    const actor = { id: 'replacement-student', role: 'student' as const, name: 'Student' };
    const operator = { id: 'replacement-operator', role: 'vendor' as const, vendorId: 'asian-cuisine', name: 'Kitchen' };
    const vendor = db.read().vendors['asian-cuisine']!;
    const target = vendor.slots[3]!;
    const checkout = new CheckoutService(db, clock);
    const groups = [{ vendorId: 'asian-cuisine', items: [{ itemId: 'nasi-lemak', quantity: 1 }], slotId: vendor.slots[8]!.id }];
    const plan = { mode: 'pickup', budgetSen: 2500 };
    const quote = await checkout.quote(actor, { groups, plan });
    const original = (await checkout.submit(actor, { groups, plan, expectedTotalSen: 1050, menuVersions: quote.menuVersions }, 'replacement-baseline')).orders[0]!;
    now = Date.parse(target.startAt) - 5 * 60000;
    const result = await service.requestAssistance(actor, 'asian-cuisine', original.id);
    const option = result.options.find(option => option.itemId === 'char-kuey-teow' && option.slotId === target.id)!;
    assert.ok(option);
    const proposal = await service.createProposal(operator, 'asian-cuisine', { orderId: original.id, itemId: option.itemId, slotId: option.slotId, reason: 'Test reviewed alternative' });
    await service.approveProposal(operator, 'asian-cuisine', proposal.id, { approve: true });
    await service.respondProposal(actor, 'asian-cuisine', proposal.id, { accept: true });
    const changed = db.read().vendors['asian-cuisine']!.orders.find(order => order.id === original.id)!;
    assert.deepEqual(changed.preparationBaseline, { minutes: 8, pickupStartAt: target.startAt, orderedAt: new Date(now).toISOString() });
    now = Date.parse(target.startAt);
    await service.changeStatus(operator, 'asian-cuisine', original.id, { status: 'preparing' });
    await service.changeStatus(operator, 'asian-cuisine', original.id, { status: 'ready' });
    await service.collect(operator, 'asian-cuisine', original.id, { code: changed.pickupCode, paymentReceived: true });
    assert.deepEqual(new ProductService(db, clock).profile(actor).savings, { minutes: 5, checkouts: 1 });
});
