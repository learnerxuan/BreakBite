import { foodRevision } from '../src/server/food.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { FirestoreConflict, FirestoreDatabase, assignSequence, encodeId, flatten, rebuild, type StoredDoc } from '../src/server/firestore-database.js';
import { MemoryFirestore } from './support/memory-firestore.js';
import { expandHome, serviceAccountFrom, translate } from '../src/server/firestore-admin.js';
import { LocalStore, accountActor, seededData } from '../src/server/local-database.js';
import { Accounts } from '../src/server/accounts.js';
import { CheckoutService } from '../src/server/checkout.js';
import { MealService } from '../src/server/domain.js';
import { AppError } from '../src/server/errors.js';
import { settings } from '../src/server/config.js';
import type { Actor, BasketGroup } from '../src/shared/model.js';

const ROOT = 'envs/test';
const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;
async function instance(t: test.TestContext, docs: MemoryFirestore, refreshMs = 0) {
    const db = new FirestoreDatabase(docs, { root: ROOT, directory: os.tmpdir(), refreshMs });
    await db.open();
    t.after(() => db.close());
    const store = new LocalStore(db);
    return { db, store, accounts: new Accounts(db), checkout: new CheckoutService(db), service: new MealService(store, Date.now, 'pay_at_pickup') };
}
function basket(db: FirestoreDatabase) {
    const d = db.read();
    const groups: BasketGroup[] = [
        { vendorId: 'asian-cuisine', items: [{ itemId: 'nasi-lemak', quantity: 1 }], slotId: d.vendors['asian-cuisine']!.slots[0]!.id },
        { vendorId: 'bobanika', items: [{ itemId: 'brown-sugar-milk-tea', quantity: 1 }], slotId: d.vendors['bobanika']!.slots[1]!.id },
    ];
    const menuVersions = Object.fromEntries(groups.flatMap(g=>g.items.map(l=>[`${g.vendorId}:${l.itemId}`,foodRevision(d.vendors[g.vendorId]!.items.find(i=>i.id===l.itemId)!.foodInfo!)])));
    return { groups, menuVersions, plan: { mode: 'pickup', budgetSen: 50000 }, transferMinutes: 2, expectedTotalSen: 1900 };
}
const student = (name: string): Actor => ({ id: randomUUID(), name, role: 'student' });
/** What is actually stored: JSON drops undefined fields, exactly as database.json does. */
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

test('document ids keep plain keys and safely encode odd ones', () => {
    assert.equal(encodeId('asian-cuisine'), 'asian-cuisine');
    assert.equal(encodeId('a1b2.c3_d-4'), 'a1b2.c3_d-4');
    for (const odd of ['a/b c', '.', '..', '__x__', 'device:notice', 'kopi☕']) {
        const id = encodeId(odd);
        assert.ok(id.startsWith('~') && !id.includes('/'), odd);
        assert.equal(Buffer.from(id.slice(1), 'base64url').toString('utf8'), odd);
    }
});

test('sequence numbers survive appends and deletions without rewriting older documents', () => {
    const doc = (key: string) => ({ path: `r/g/${key}`, group: 'g', key, payload: '{}' });
    const first = assignSequence(['a', 'b', 'c'].map(doc), new Map(), 1);
    assert.deepEqual(first.seqs, [1, 2, 3]);
    const previous = new Map([['r/g/a', 1], ['r/g/b', 2], ['r/g/c', 3]]);
    assert.deepEqual(assignSequence(['a', 'c', 'd'].map(doc), previous, first.nextSeq).seqs, [1, 3, 4], 'delete + append keep old seqs');
    assert.deepEqual(assignSequence(['c', 'a'].map(doc), previous, 4).seqs, [3, 4], 'a moved after c gets a new seq');
});

test('a fresh Firestore root is created once with the seeded kitchens, then reloaded identically', async t => {
    const docs = new MemoryFirestore();
    const a = await instance(t, docs);
    assert.equal(docs.commits.length, 1, 'one atomic creation commit');
    assert.ok(docs.docs.has(ROOT) && docs.docs.has(`${ROOT}/vendors/asian-cuisine`));
    assert.deepEqual(Object.keys(a.db.read().vendors), Object.keys(seededData().vendors));
    const b = await instance(t, docs);
    assert.equal(docs.commits.length, 1, 'a second process loads instead of re-creating');
    assert.deepEqual(b.db.read(), json(a.db.read()));
});

test('leftover documents without a root are refused instead of mixed with new data', async t => {
    const docs = new MemoryFirestore();
    docs.docs.set(`${ROOT}/accounts/old`, { data: { key: 'old', seq: 1, payload: '{}' }, version: 'v0' });
    const db = new FirestoreDatabase(docs, { root: ROOT, directory: os.tmpdir() });
    await assert.rejects(db.open(), isCode('STALE_DOCUMENTS'));
    assert.equal(docs.docs.has(ROOT), false);
    t.after(() => db.close());
});

test('services on Firestore: accounts, sessions, two-kitchen checkout and exact reload', async t => {
    const docs = new MemoryFirestore();
    const a = await instance(t, docs);
    const alex = await a.accounts.register({ name: 'Alex Tan', email: 'alex@example.com', password: 'correct horse battery' });
    await assert.rejects(a.accounts.register({ name: 'Alex Again', email: 'ALEX@example.com', password: 'another long password' }), isCode('EMAIL_EXISTS'));
    assert.equal((await a.accounts.login({ email: 'alex@example.com', password: 'correct horse battery' })).id, alex.id);
    const headers = () => { const set: string[] = []; return { setHeader: (_: string, v: string) => set.push(v), set }; };
    for (let i = 0; i < 3; i++) await a.accounts.start(alex, headers() as never);
    const sessionKeys = Object.keys(a.db.read().sessions);
    assert.equal(sessionKeys.length, 3);

    const before = docs.commits.length;
    const result = await a.checkout.submit(accountActor(alex), basket(a.db), 'firestore-checkout-1');
    assert.equal(docs.commits.length, before + 1, 'a multi-kitchen checkout is exactly one commit');
    assert.equal(result.orders.length, 2);
    for (const o of result.orders) assert.ok(docs.docs.has(`${ROOT}/vendors/${o.vendorId}/orders/${o.id}`), 'orders are subcollection documents');
    const retry = await a.checkout.submit(accountActor(alex), basket(a.db), 'firestore-checkout-1');
    assert.deepEqual(retry, result, 'the same idempotency key returns the original orders');

    // Out-of-order notices and an id that is not a valid Firestore document id.
    await a.db.transaction(d => {
        d.notices = [
            { id: 'n-late', key: 'k2', studentId: alex.id, orderId: result.orders[0]!.id, vendorId: 'asian-cuisine', message: 'second', at: '2026-11-11T10:00:00.000Z' },
            { id: 'n-early', key: 'k1', studentId: alex.id, orderId: result.orders[0]!.id, vendorId: 'asian-cuisine', message: 'first', at: '2026-11-11T09:00:00.000Z' },
        ];
        d.vendors['asian-cuisine']!.requests['a/b c'] = { fingerprint: 'f', orderId: result.orders[0]!.id, createdAt: '2026-11-11T09:00:00.000Z' };
    });
    assert.ok(docs.docs.has(`${ROOT}/vendors/asian-cuisine/requests/${encodeId('a/b c')}`));

    const fresh = await instance(t, docs);
    assert.deepEqual(fresh.db.read(), json(a.db.read()));
    assert.deepEqual(fresh.db.read().notices!.map(n => n.id), ['n-late', 'n-early'], 'array order preserved');
    assert.deepEqual(Object.keys(fresh.db.read().sessions), sessionKeys, 'session insertion order preserved');

    // Logging out every session deletes their documents.
    await a.db.transaction(d => { d.sessions = {}; });
    assert.equal([...docs.docs.keys()].filter(p => p.startsWith(`${ROOT}/sessions/`)).length, 0);
});

test('unchanged transactions and rejected work write nothing', async t => {
    const docs = new MemoryFirestore();
    const a = await instance(t, docs);
    const before = docs.commits.length;
    await a.db.transaction(() => 'read only');
    await assert.rejects(a.db.transaction(d => { d.accounts.push({} as never); throw new AppError(409, 'NOPE', 'Rejected.'); }), isCode('NOPE'));
    assert.equal(docs.commits.length, before);
});

test('a stale second process conflicts, reloads and keeps both writes', async t => {
    const docs = new MemoryFirestore();
    const a = await instance(t, docs);
    const b = await instance(t, docs);
    await a.accounts.register({ name: 'From A', email: 'a@example.com', password: 'long password a' });
    await b.accounts.register({ name: 'From B', email: 'b@example.com', password: 'long password b' });
    assert.ok(docs.conflicts >= 1, 'B was stale and had to retry');
    await assert.rejects(b.accounts.register({ name: 'Dup', email: 'a@example.com', password: 'long password c' }), isCode('EMAIL_EXISTS'));
    const fresh = await instance(t, docs);
    assert.deepEqual(fresh.db.read().accounts.map(x => x.email).sort(), ['a@example.com', 'b@example.com']);
});

test('the last item cannot be sold twice by two server processes at once', async t => {
    const docs = new MemoryFirestore();
    const a = await instance(t, docs);
    const b = await instance(t, docs);
    await a.store.transact('asian-cuisine', s => { s.items.find(i => i.id === 'nasi-lemak')!.stock = 1; });
    const results = await Promise.allSettled([
        a.checkout.submit(student('Alex'), basket(a.db), 'last-item-alex'),
        b.checkout.submit(student('Sam'), basket(a.db), 'last-item-sam'),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const fresh = await instance(t, docs);
    const d = fresh.db.read();
    assert.equal(d.vendors['asian-cuisine']!.items.find(i => i.id === 'nasi-lemak')!.stock, 0);
    assert.equal(d.vendors['asian-cuisine']!.orders.length, 1);
    assert.equal(d.vendors['bobanika']!.orders.length, 1, 'the losing checkout left no partial order at the other kitchen');
});

test('refresh picks up writes from another process', async t => {
    const docs = new MemoryFirestore();
    const server = await instance(t, docs, 1);
    const cli = await instance(t, docs);
    await cli.accounts.create({ name: 'Bowl operator', email: 'op@example.com', password: 'operator password', role: 'vendor', vendorId: 'asian-cuisine' });
    assert.equal(server.db.read().accounts.length, 0);
    await new Promise(resolve => setTimeout(resolve, 5));
    await server.db.refresh();
    assert.equal((await server.accounts.login({ email: 'op@example.com', password: 'operator password' })).vendorId, 'asian-cuisine');
});

test('documents over the 1 MB Firestore limit are refused without writing', async t => {
    const docs = new MemoryFirestore();
    const a = await instance(t, docs);
    const before = docs.commits.length;
    await assert.rejects(a.db.transaction(d => { d.vendors['asian-cuisine']!.vendor.description = 'x'.repeat(1_100_000); }), isCode('STORE_LIMIT'));
    assert.equal(docs.commits.length, before);
    assert.notEqual(a.db.read().vendors['asian-cuisine']!.vendor.description.length, 1_100_000);
});

test('layout round trip keeps every record and duplicate ids are refused', () => {
    const data = seededData();
    data.accounts.push({ id: 'x', email: 'x@example.com', name: 'X', role: 'student', salt: 's', passwordHash: 'h', createdAt: 'c', failures: 0, lockedUntil: 0 });
    const docs = flatten(data, ROOT);
    const { seqs } = assignSequence(docs, new Map(), 1);
    const groups = new Map<string, StoredDoc[]>();
    docs.forEach((d, i) => groups.set(d.group, [...(groups.get(d.group) ?? []), { key: d.key, seq: seqs[i]!, payload: d.payload }]));
    const rebuilt = rebuild(groups);
    assert.deepEqual(rebuilt, json(data));
    data.accounts.push({ ...data.accounts[0]! });
    assert.throws(() => flatten(data, ROOT), isCode('INVALID_STORE'));
});

test('Firestore configuration guards', () => {
    assert.throws(() => settings({ STORE: 'firestore' }), /GOOGLE_CLOUD_PROJECT/);
    const config = settings({ STORE: 'firestore', GOOGLE_CLOUD_PROJECT: 'breakbite-514410' });
    assert.equal(config.store, 'firestore');
    assert.equal(config.firestoreRoot, 'envs/production');
    assert.equal(config.firestoreDatabase, '(default)');
    assert.equal(config.firestoreRefreshMs, 5000);
    assert.equal(settings({}).store, 'file');
    assert.throws(() => settings({ STORE: 'firestore', GOOGLE_CLOUD_PROJECT: 'breakbite-514410', FIRESTORE_ROOT: 'envs' }), /document path/);
    assert.throws(() => settings({ STORE: 'firestore', GOOGLE_CLOUD_PROJECT: 'breakbite-514410', FIRESTORE_REFRESH_MS: '-1' }), /FIRESTORE_REFRESH_MS/);
    assert.throws(() => settings({ AUTH_MODE: 'demo', STORE: 'firestore' }), /requires/);
    assert.throws(() => settings({ K_SERVICE: 'api', COOKIE_SECURE: 'true', ALLOWED_ORIGINS: 'https://example.com' }), /STORE=firestore/);
});

test('SDK errors map to retryable conflicts or clear operator messages', t => {
    t.mock.method(console, 'error', () => undefined);
    const sdk = (code: number | string, message = 'x') => Object.assign(new Error(message), { code });
    // Seen against real Firestore over REST when another process committed first.
    assert.ok(translate(sdk(3, 'the stored version (17944) does not match the required base version (17943)'), true) instanceof FirestoreConflict);
    assert.ok(translate(sdk(9), true) instanceof FirestoreConflict);
    assert.ok(translate(sdk('ABORTED'), true) instanceof FirestoreConflict);
    assert.ok(translate(sdk(5), true) instanceof FirestoreConflict, 'ROOT deleted during commit');
    assert.ok(isCode('CLOUD_STORE')(translate(sdk(5), false)), 'missing database on read');
    assert.ok(isCode('CLOUD_PERMISSION')(translate(sdk(7), false)));
    assert.ok(isCode('CLOUD_AUTH')(translate(sdk(16), false)));
    assert.ok(isCode('CLOUD_STORE')(translate(sdk(3, 'some other invalid argument'), true)));
});

test('service-account keys are validated against the project without echoing secrets', () => {
    const key = { type: 'service_account', project_id: 'breakbite-514410', client_email: 'server@breakbite-514410.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n' };
    assert.equal(serviceAccountFrom(JSON.stringify(key), 'breakbite-514410').clientEmail, key.client_email);
    assert.equal(serviceAccountFrom(Buffer.from(JSON.stringify(key)).toString('base64'), 'breakbite-514410').projectId, 'breakbite-514410');
    assert.throws(() => serviceAccountFrom(JSON.stringify(key), 'another-project'), (e: unknown) => e instanceof AppError && /another-project/.test(e.message) && !/secret/.test(e.message));
    assert.throws(() => serviceAccountFrom('{"type":"authorized_user"}', 'breakbite-514410'), isCode('CONFIG'));
    assert.equal(expandHome('~/secrets/key.json'), path.join(os.homedir(), 'secrets/key.json'));
    assert.equal(expandHome('C:\\keys\\k.json'), 'C:\\keys\\k.json');
});
