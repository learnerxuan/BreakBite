import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { Accounts } from '../src/server/accounts.js';
import { CheckoutService } from '../src/server/checkout.js';
import { FirestoreDatabase } from '../src/server/firestore-database.js';
import { accountActor } from '../src/server/local-database.js';
import { AppError } from '../src/server/errors.js';
import { MemoryFirestore } from './support/memory-firestore.js';
import type { BasketGroup } from '../src/shared/model.js';

const ROOT = 'envs/cache-regression';
const NOW = Date.parse('2026-11-11T04:00:00Z');
const email = 'cache-test@example.test';
const oldPassword = 'old-cache-test-password';
const newPassword = 'new-cache-test-password';
const isCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

async function instance(t: test.TestContext, docs: MemoryFirestore, refreshMs = 0) {
    const db = new FirestoreDatabase(docs, {root:ROOT, directory:os.tmpdir(), refreshMs});
    await db.open();
    t.after(() => db.close());
    return {db, accounts:new Accounts(db), checkout:new CheckoutService(db)};
}

test('a stale no-op login cannot authenticate a password reset by another process', async t => {
    t.mock.method(Date, 'now', () => NOW);
    const docs = new MemoryFirestore();
    const a = await instance(t, docs);
    const account = await a.accounts.register({name:'Cache Student', email, password:oldPassword});
    const b = await instance(t, docs);
    assert.equal(b.db.read().accounts[0]!.failures, 0, 'successful old-password login would otherwise produce no changed fields');
    await a.accounts.resetPassword(email, newPassword);
    await assert.rejects(b.accounts.login({email, password:oldPassword}), isCode('BAD_LOGIN'));
    assert.equal((await b.accounts.login({email, password:newPassword})).id, account.id);
});

for (const phase of ['probe', 'load'] as const) {
    test(`failed ${phase} refresh keeps immediate requests closed until revoked sessions are revalidated`, async t => {
        let wall = NOW;
        t.mock.method(Date, 'now', () => wall);
        const docs = new MemoryFirestore();
        const a = await instance(t, docs);
        const account = await a.accounts.register({name:'Cache Student', email, password:oldPassword});
        let cookie = '';
        await a.accounts.start(account, {setHeader: (_name: string, value: string) => {cookie=value.split(';')[0]!;}} as never);
        const b = await instance(t, docs, 5000);
        const req = {headers:{cookie}} as never;
        assert.equal(b.accounts.session(req).actor.id, account.id);
        await a.accounts.resetPassword(email, newPassword);
        wall += 5001;
        const get = docs.get.bind(docs);
        const list = docs.list.bind(docs);
        let offline = true;
        t.mock.method(docs, 'get', async (path: string) => {
            if (offline && phase === 'probe') throw new Error('test Firestore offline');
            return get(path);
        });
        t.mock.method(docs, 'list', async (path: string) => {
            if (offline && phase === 'load') throw new Error('test Firestore offline');
            return list(path);
        });
        await assert.rejects(b.db.refresh(), /test Firestore offline/);
        // No clock advance: this is inside the five-second refresh interval.
        await assert.rejects(b.db.refresh(), /test Firestore offline/);
        offline = false;
        await b.db.refresh();
        assert.deepEqual(b.db.read().sessions, {});
        assert.throws(() => b.accounts.session(req), isCode('UNAUTHORIZED'));
    });
}

test('a lost successful Firestore commit response recovers the same checkout without reserving twice', async t => {
    t.mock.method(Date, 'now', () => NOW);
    const docs = new MemoryFirestore();
    const a = await instance(t, docs);
    const account = await a.accounts.register({name:'Cache Student', email, password:oldPassword});
    const actor = accountActor(account);
    const groups: BasketGroup[] = [
        {vendorId:'asian-cuisine', items:[{itemId:'nasi-lemak',quantity:1}]},
        {vendorId:'bobanika', items:[{itemId:'brown-sugar-milk-tea',quantity:1}]},
    ];
    const plan = {mode:'pickup',budgetSen:50000};
    const quote = await a.checkout.quote(actor, {groups,plan});
    assert.equal(quote.totalSen, 1900);
    const asian = quote.groups.find(g=>g.vendorId==='asian-cuisine')!.slots[0]!;
    const boba = quote.groups.find(g=>g.vendorId==='bobanika')!.slots.find(s=>Date.parse(s.startAt)>=Date.parse(asian.startAt)+3*60000)!;
    assert.ok(asian && boba, 'fixture must have staggered capacity');
    const payload = {groups:groups.map(g=>({...g,slotId:g.vendorId==='asian-cuisine'?asian.id:boba.id})),plan,
        transferMinutes:2,expectedTotalSen:quote.totalSen,menuVersions:quote.menuVersions};
    const key = 'lost-firestore-response';
    const commit = docs.commit.bind(docs);
    let loseOnce = true;
    t.mock.method(docs, 'commit', async (...args: Parameters<MemoryFirestore['commit']>) => {
        const versions = await commit(...args);
        if (loseOnce) {loseOnce=false;throw new Error('test commit response lost after success');}
        return versions;
    });
    await assert.rejects(a.checkout.submit(actor,payload,key), /response lost after success/);
    const fresh = await instance(t, docs);
    const committed = fresh.checkout.lookup(actor,key);
    assert.ok(committed);
    assert.equal(committed.orders.length,2);
    const committedWrites = docs.commits.length;
    const resources = (db: FirestoreDatabase) => {
        const state=db.read();
        return Object.fromEntries(groups.map(g=>{
            const kitchen=state.vendors[g.vendorId]!;
            return [g.vendorId, {orderIds:kitchen.orders.map(o=>o.id), stock:kitchen.items.map(i=>[i.id,i.stock]),
                reservations:kitchen.slots.map(s=>[s.id,s.reservedUnits,s.reservedHandovers])}];
        }));
    };
    const savedResources = resources(fresh.db);
    const recovered = await a.checkout.submit(actor,payload,key);
    assert.deepEqual(recovered,committed);
    assert.deepEqual(resources(a.db),savedResources);
    assert.equal(docs.commits.length,committedWrites,'read-only checkout replay must not create another commit');
    assert.equal(Object.keys(a.db.read().checkouts).length,1);
    for (const group of groups) assert.equal(a.db.read().vendors[group.vendorId]!.orders.length,1);
});
