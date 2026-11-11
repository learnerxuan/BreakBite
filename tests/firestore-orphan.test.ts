import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { FirestoreDatabase } from '../src/server/firestore-database.js';
import { MemoryFirestore } from './support/memory-firestore.js';
import { AppError } from '../src/server/errors.js';
import { VENDOR_IDS } from '../src/server/seed.js';

const root = 'envs/orphan-review';
test('failed startup releases its SDK resources before a serverless retry', async () => {
    const docs = new MemoryFirestore(); let closed = 0;
    const db = new FirestoreDatabase({ ...docs, get: async () => { throw new Error('unavailable'); }, list: docs.list.bind(docs), listDocumentIds: docs.listDocumentIds.bind(docs), commit: docs.commit.bind(docs), close: async () => { closed++; } }, { root, directory: os.tmpdir() });
    await assert.rejects(db.open(), /unavailable/); assert.equal(closed, 1);
    await db.close(); assert.equal(closed, 1);
});
const record = { data: { key: 'orphan', seq: 1, payload: '{}' }, version: 'v1' };

test('document reference listing includes deleted parents with surviving descendants', async () => {
    const docs = new MemoryFirestore();
    docs.docs.set(`${root}/vendors/normal`, record);
    docs.docs.set(`${root}/vendors/custom-kitchen/orders/one`, record);
    docs.docs.set(`${root}/vendors/custom-kitchen/requests/two`, record);
    docs.docs.set(`${root}/vendors/another-kitchen/orders/three`, record);
    assert.deepEqual((await docs.list(`${root}/vendors`)).map(d => d.id), ['normal']);
    assert.deepEqual((await docs.listDocumentIds(`${root}/vendors`)).sort(), ['another-kitchen', 'custom-kitchen', 'normal']);
    assert.deepEqual(await docs.listDocumentIds(`${root}/accounts`), []);
});

test('initialization refuses orphan order/request data even when ROOT and every vendor parent are absent', async () => {
    for (const vendor of ['asian-cuisine', 'custom-kitchen']) {
        for (const collection of ['orders', 'requests']) {
            const docs = new MemoryFirestore();
            const orphan = `${root}/vendors/${vendor}/${collection}/orphan`;
            docs.docs.set(orphan, structuredClone(record));
            const before = structuredClone(docs.docs);
            const db = new FirestoreDatabase(docs, { root, directory: os.tmpdir() });
            await assert.rejects(db.open(), (error: unknown) => error instanceof AppError && error.code === 'STALE_DOCUMENTS', `${vendor}/${collection}`);
            assert.equal(docs.docs.has(root), false);
            assert.equal(docs.commits.length, 0, 'no seed commit may overwrite orphan data');
            assert.deepEqual(docs.docs, before, 'existing descendants must remain untouched');
            await db.close();
        }
    }
});

test('an actually empty root still seeds exactly the nine active kitchens once', async () => {
    const docs = new MemoryFirestore();
    const db = new FirestoreDatabase(docs, { root, directory: os.tmpdir() });
    await db.open();
    try {
        assert.equal(Object.keys(db.read().vendors).length, 9);
        assert.deepEqual(Object.keys(db.read().vendors).sort(), [...VENDOR_IDS].sort());
        assert.equal(docs.commits.length, 1);
    } finally { await db.close(); }
});

test('a root initialized by another process during the orphan scan is loaded rather than rejected', async () => {
    const docs = new MemoryFirestore();
    const initializer = new FirestoreDatabase(docs, { root, directory: os.tmpdir() });
    const original = docs.listDocumentIds.bind(docs);
    let initializeDuringScan = true;
    docs.listDocumentIds = async collection => {
        if (initializeDuringScan && collection === `${root}/vendors`) {
            initializeDuringScan = false;
            await initializer.open();
        }
        return original(collection);
    };
    const db = new FirestoreDatabase(docs, { root, directory: os.tmpdir() });
    await db.open();
    try {
        assert.equal(docs.commits.length, 1, 'only the winning process initializes');
        assert.deepEqual(db.read(), initializer.read());
    } finally { await Promise.all([db.close(), initializer.close()]); }
});
