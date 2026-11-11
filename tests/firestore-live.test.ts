import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { FirestoreDatabase } from '../src/server/firestore-database.js';
import { adminDocumentStore, adminFirestore } from '../src/server/firestore-admin.js';
import { LocalStore, accountActor } from '../src/server/local-database.js';
import { Accounts } from '../src/server/accounts.js';
import { CheckoutService } from '../src/server/checkout.js';
import { AppError } from '../src/server/errors.js';
import type { Actor, BasketGroup } from '../src/shared/model.js';

/** Opt-in check against a REAL Firestore project, e.g.
 *   BREAKBITE_LIVE_FIRESTORE=1 GOOGLE_CLOUD_PROJECT=... GOOGLE_APPLICATION_CREDENTIALS=... npm run test:firestore-live
 * Uses a throwaway envs/livecheck-* root and deletes it afterwards; never touches envs/production.
 */
const live = process.env.BREAKBITE_LIVE_FIRESTORE === '1';
const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? '';
const databaseId = process.env.FIRESTORE_DATABASE || '(default)';
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

test('real Firestore: creation, services, atomic checkout, cross-process conflict and reload', { skip: !live && 'set BREAKBITE_LIVE_FIRESTORE=1 to run against a real project', timeout: 180000 }, async t => {
    const root = `envs/livecheck-${randomUUID().slice(0, 8)}`;
    const admin = await adminFirestore({ projectId, databaseId });
    t.after(async () => {
        assert.match(root, /^envs\/livecheck-[0-9a-f]{8}$/);
        await admin.db.recursiveDelete(admin.db.doc(root));
        assert.equal((await admin.db.doc(root).get()).exists, false, 'throwaway data removed');
        await admin.close();
    });
    const open = async (refreshMs = 0) => {
        const db = new FirestoreDatabase(await adminDocumentStore({ projectId, databaseId }), { root, directory: os.tmpdir(), refreshMs });
        await db.open();
        t.after(() => db.close());
        return { db, store: new LocalStore(db), accounts: new Accounts(db), checkout: new CheckoutService(db) };
    };
    const a = await open();
    const b = await open(1);
    assert.ok((await admin.db.doc(`${root}/vendors/bowl-lab`).get()).exists, 'seeded kitchens written');

    const alex = await a.accounts.register({ name: 'Live Check', email: `live-${randomUUID().slice(0, 6)}@example.com`, password: 'live check password' });
    await new Promise(resolve => setTimeout(resolve, 5));
    await b.db.refresh();
    await assert.rejects(b.accounts.register({ name: 'Duplicate', email: alex.email, password: 'another password' }), (e: unknown) => e instanceof AppError && e.code === 'EMAIL_EXISTS');

    const d = a.db.read();
    const groups: BasketGroup[] = [
        { vendorId: 'bowl-lab', items: [{ itemId: 'chicken-rice', quantity: 1 }], slotId: d.vendors['bowl-lab']!.slots[0]!.id },
        { vendorId: 'noodle-co', items: [{ itemId: 'lemon-water', quantity: 1 }], slotId: d.vendors['noodle-co']!.slots[1]!.id },
    ];
    const payload = { groups, plan: { mode: 'pickup', budgetSen: 50000 }, transferMinutes: 2, expectedTotalSen: 1250 };
    const result = await a.checkout.submit(accountActor(alex), payload, 'live-checkout-1');
    assert.equal(result.orders.length, 2);
    for (const o of result.orders) assert.ok((await admin.db.doc(`${root}/vendors/${o.vendorId}/orders/${o.id}`).get()).exists);

    // Last item, two processes, real preconditions.
    await a.store.transact('bowl-lab', s => { s.items.find(i => i.id === 'chicken-rice')!.stock = 1; });
    const actor = (name: string): Actor => ({ id: randomUUID(), name, role: 'student' });
    const raced = await Promise.allSettled([a.checkout.submit(actor('A'), payload, 'live-race-a'), b.checkout.submit(actor('B'), payload, 'live-race-b')]);
    assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1);
    const loser = raced.find(r => r.status === 'rejected') as PromiseRejectedResult;
    assert.ok(loser.reason instanceof AppError && loser.reason.status === 409, `the loser retried and saw the item sold out (got ${(loser.reason as AppError).code})`);

    // A process that never refreshes must still write safely: the precondition fails, it reloads and retries.
    const stale = await open();
    await a.accounts.register({ name: 'Written by A', email: `a-${randomUUID().slice(0, 6)}@example.com`, password: 'live check password' });
    const fromStale = await stale.accounts.register({ name: 'Written by stale', email: `s-${randomUUID().slice(0, 6)}@example.com`, password: 'live check password' });
    assert.ok(stale.db.read().accounts.some(x => x.id === fromStale.id) && stale.db.read().accounts.length === 3);

    const fresh = await open();
    assert.deepEqual(fresh.db.read(), json(stale.db.read()), 'a new process sees exactly what the last writer committed');
    assert.equal(fresh.db.read().vendors['bowl-lab']!.items.find(i => i.id === 'chicken-rice')!.stock, 0);
    assert.equal(fresh.db.read().vendors['noodle-co']!.orders.length, 2, 'no partial order from the losing checkout');
});
