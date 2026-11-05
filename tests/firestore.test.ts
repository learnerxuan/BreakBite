import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FirestoreStore } from '../src/server/store.js';
import { MealService } from '../src/server/domain.js';
import { seedVendor, DEMO_IDENTITIES } from '../src/server/seed.js';
import { AppError } from '../src/server/errors.js';
/** In-memory REST double, not a real Firebase project/emulator. Verifies the
 * compare-and-swap contract, retry path and document payload size guard.
 */
function mockFirestore() {
    const docs = new Map<string, {
        fields: unknown;
        updateTime: string;
    }>();
    let revision = 0;
    let conflicts = 0;
    const transport: typeof fetch = async (input, init) => {
        const url = String(input);
        assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-access-token');
        if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body));
            const write = body.writes[0];
            const id = write.update.name.split('/').pop();
            const current = docs.get(id);
            const precondition = write.currentDocument;
            if ((precondition.exists === false && current) || (precondition.updateTime && current?.updateTime !== precondition.updateTime)) {
                conflicts++;
                return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 });
            }
            docs.set(id, { fields: write.update.fields, updateTime: `v${++revision}` });
            return Response.json({ writeResults: [{ updateTime: `v${revision}` }] });
        }
        const id = url.split('/').pop()!;
        const current = docs.get(id);
        if (!current)
            return Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 });
        const copy = structuredClone(current);
        await new Promise(resolve => setTimeout(resolve, 2));
        return Response.json(copy);
    };
    return { transport, docs, conflicts: () => conflicts };
}
test('Firestore REST CAS retries contention and prevents double reservation', async (t) => {
    const mock = mockFirestore();
    const original = globalThis.fetch;
    globalThis.fetch = mock.transport;
    t.after(() => { globalThis.fetch = original; });
    const now = Date.parse('2026-11-05T04:00:00Z');
    const store = new FirestoreStore('test-project', ['bowl-lab'], 'test-access-token');
    const seed = seedVendor('bowl-lab', now);
    seed.slots[0]!.pickupCapacity = 1;
    await store.initialize(seed);
    const service = new MealService(store, () => now);
    const input = { vendorId: 'bowl-lab', slotId: seed.slots[0]!.id, items: [{ itemId: 'chicken-rice', quantity: 1 }], plan: { breakStartAt: new Date(now).toISOString(), nextClassAt: new Date(now + 40 * 60000).toISOString(), walkToMinutes: 3, eatMinutes: 12, returnMinutes: 5, bufferMinutes: 3, budgetSen: 1500 } };
    const results = await Promise.allSettled([service.createOrder(DEMO_IDENTITIES[0]!, input, randomUUID()), service.createOrder(DEMO_IDENTITIES[1]!, input, randomUUID())]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.ok(mock.conflicts() >= 1);
    const state = await store.read('bowl-lab');
    assert.equal(state.orders.length, 1);
    assert.equal(state.items[0]!.stock, 19);
    await store.initialize(seed);
    assert.equal((await store.read('bowl-lab')).orders.length, 1, 'seeding cannot overwrite existing records');
});
test('Firestore adapter rejects cloud reset and oversized aggregates', async (t) => {
    const mock = mockFirestore();
    const original = globalThis.fetch;
    globalThis.fetch = mock.transport;
    t.after(() => { globalThis.fetch = original; });
    const store = new FirestoreStore('test-project', ['bowl-lab'], 'test-access-token');
    const seed = seedVendor('bowl-lab');
    await assert.rejects(store.initialize(seed, true), (e: unknown) => e instanceof AppError && e.code === 'UNSAFE_RESET');
    seed.vendor.description = 'x'.repeat(800000);
    await assert.rejects(store.initialize(seed), (e: unknown) => e instanceof AppError && e.code === 'STORE_LIMIT');
});
