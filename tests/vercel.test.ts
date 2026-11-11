import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { settings } from '../src/server/config.js';
import { clientAddress } from '../src/server/client-address.js';
import { createHandler } from '../src/server/http.js';
import { createRuntime } from '../src/server/runtime.js';
import { blobMedia, fileMedia } from '../src/server/media-store.js';
import { LocalStore } from '../src/server/local-database.js';
import { MealService } from '../src/server/domain.js';
import { maintenance } from '../src/server/maintenance.js';
import { ProductService } from '../src/server/product.js';
import { generatePushKeys, loadPushKeys } from '../src/server/web-push.js';
import { testDatabase } from './support/test-database.js';

const env = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'breakbite-abc.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'breakbite.vercel.app', GOOGLE_CLOUD_PROJECT: 'breakbite-test' };
test('Vercel selects shared storage and secure exact origins; unsafe settings fail closed', () => {
    const config = settings(env);
    assert.equal(config.store, 'firestore'); assert.equal(config.secureCookie, true);
    assert.deepEqual(config.allowedOrigins, ['https://breakbite-abc.vercel.app', 'https://breakbite.vercel.app']);
    for (const patch of [{ STORE: 'file' }, { AUTH_MODE: 'demo' }, { AUTH_MODE: 'firebase' }, { COOKIE_SECURE: 'false' }, { FIRESTORE_REFRESH_MS: '0' }, { ALLOWED_ORIGINS: 'http://localhost:8080' }, { GOOGLE_CLOUD_PROJECT: '' }]) assert.throws(() => settings({ ...env, ...patch }));
    assert.throws(() => settings({ ...env, VERCEL_ENV: 'preview' }), /separate FIRESTORE_ROOT/);
    const preview = settings({ ...env, VERCEL_ENV: 'preview', FIRESTORE_ROOT: 'envs/preview' });
    assert.equal(preview.allowedOrigins.includes('https://breakbite.vercel.app'), false);
    assert.equal(settings({}).store, 'file'); assert.equal(settings({}).secureCookie, false);
});
test('forwarding headers affect limits only on Vercel; malformed values fail back to socket address', () => {
    const request = { headers: { 'x-vercel-forwarded-for': '203.0.113.20', 'x-forwarded-for': '203.0.113.30' }, socket: { remoteAddress: '127.0.0.1' } } as unknown as IncomingMessage;
    assert.equal(clientAddress(request, false), '127.0.0.1'); assert.equal(clientAddress(request, true), '203.0.113.20');
    request.headers['x-vercel-forwarded-for'] = '203.0.113.1, evil';
    assert.equal(clientAddress(request, true), '127.0.0.1');
});
test('serverless-compatible handler awaits maintenance and rejects unknown origins and scheduler credentials', async t => {
    let normal = 0, forced = 0;
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bb-vercel-http-'));
    const db = await testDatabase(dir); await db.open();
    const config = settings({});
    const handler = createHandler(config, new MealService(new LocalStore(db)), db, undefined, undefined, { maintenance: async force => { await new Promise(resolve => setTimeout(resolve, 2)); if (force) forced++; else normal++; }, maintenanceSecret: 'test-maintenance-secret' });
    const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    config.allowedOrigins = [base];
    t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.close(); await rm(dir, { recursive: true, force: true }); });
    assert.equal((await fetch(base + '/api/catalog')).status, 200); assert.equal(normal, 1);
    assert.equal((await fetch(base + '/api/catalog', { headers: { Origin: 'https://evil.test' } })).status, 403); assert.equal(normal, 1);
    for (const authorization of ['', 'Bearer wrong']) assert.equal((await fetch(base + '/api/internal/maintenance', { headers: { authorization } })).status, 403);
    assert.equal(forced, 0);
    const response = await fetch(base + '/api/internal/maintenance', { headers: { authorization: 'Bearer test-maintenance-secret' } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true }); assert.equal(forced, 1);
});
test('maintenance recovers expired pickup windows without timers and preserves closed kitchens and operator allocations', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bb-maintenance-'));
    const db = await testDatabase(dir); await db.open();
    t.after(async () => { await db.close(); await rm(dir, { recursive: true, force: true }); });
    const ids = Object.keys(db.read().vendors).slice(0, 2); const [open, closed] = ids as [string, string];
    await db.transaction(d => {
        for (const id of ids) d.vendors[id]!.slots = [];
        d.vendors[open]!.vendor.onlineKitchenCapacity = 3; d.vendors[open]!.vendor.onlinePickupCapacity = 2;
        d.vendors[closed]!.vendor.open = false;
    });
    const service = new MealService(new LocalStore(db));
    await maintenance(db, service, new ProductService(db))();
    assert.ok(db.read().vendors[open]!.slots.length); assert.equal(db.read().vendors[closed]!.slots.length, 0);
    assert.ok(db.read().vendors[open]!.slots.every(s => s.kitchenCapacity === 3 && s.pickupCapacity === 2));
    // A stale instance passes old values after the kitchen has already changed.
    await db.transaction(d => { d.vendors[open]!.slots = []; d.vendors[open]!.vendor.onlineKitchenCapacity = 6; });
    await service.openPickupWindows({ id: 'scheduler', name: 'Scheduler', role: 'vendor', vendorId: open }, open, { kitchenCapacity: 99, pickupCapacity: 49 }, true);
    assert.equal(db.read().vendors[open]!.vendor.onlineKitchenCapacity, 6);
    assert.ok(db.read().vendors[open]!.slots.every(s => s.kitchenCapacity === 6 && s.pickupCapacity === 2));
});
test('maintenance retries failed work and coalesces simultaneous requests', async () => {
    let refreshes = 0, ticks = 0, fail = true, now = 100000;
    const run = maintenance({ async refresh() { refreshes++; await Promise.resolve(); if (fail) throw new Error('offline'); } } as never, { store: { async ids() { return []; } } } as never, { async tick() { ticks++; } } as never, undefined, () => now);
    await assert.rejects(run(), /offline/); fail = false;
    await Promise.all([run(), run(), run()]); assert.equal(ticks, 1); assert.equal(refreshes, 2);
    await run(); assert.equal(ticks, 1); now += 16000; await run(); assert.equal(ticks, 2);
});
test('media paths cannot escape storage and cloud uploads never fall back to temporary disk', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bb-media-')); t.after(() => rm(dir, { recursive: true, force: true }));
    const store = fileMedia(dir); const filename = 'a'.repeat(64) + '.png';
    await store.put(filename, Buffer.from('raster-test')); assert.equal((await store.get(filename)).toString(), 'raster-test');
    await assert.rejects(store.get('../database.json'), /Invalid photo name/);
    await assert.rejects(blobMedia('envs/test', undefined).put(filename, Buffer.from('image')), /Connect a private Vercel Blob/);
});
test('Web Push can use stable hosting keys without reading or writing the filesystem', async () => {
    const keys = generatePushKeys('mailto:test@example.test');
    assert.deepEqual(await loadPushKeys('/does-not-exist', true, JSON.stringify(keys)), keys);
    assert.equal(await loadPushKeys('/does-not-exist', false), undefined);
    await assert.rejects(loadPushKeys('/does-not-exist', true, 'bad-json'), /valid VAPID/);
});
test('shared runtime serves ordinary ordering APIs without a listener or timers', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bb-runtime-'));
    const runtime = await createRuntime({ DATA_DIR: dir });
    t.after(async () => { await runtime.close(); await rm(dir, { recursive: true, force: true }); });
    assert.equal(runtime.config.store, 'file');
    await runtime.runMaintenance();
    assert.equal(Object.values(runtime.db!.read().vendors).filter(s => !s.vendor.archived).length, 9);
});
test('Vercel pre-parsed JSON supports account requests while preserving content-type and size checks', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bb-parsed-body-'));
    const runtime = await createRuntime({ DATA_DIR: dir });
    const server = createServer(async (req, res) => {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        // Model the real Vercel helper consuming the incoming stream before invocation.
        Object.defineProperty(req, 'body', { get() { return JSON.parse(Buffer.concat(chunks).toString()); } });
        await runtime.handler(req, res);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; runtime.config.allowedOrigins = [base];
    t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await runtime.close(); await rm(dir, { recursive: true, force: true }); });
    const post = (body: string, type = 'application/json') => fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': type }, body });
    assert.equal((await post(JSON.stringify({ name: 'Vercel Student', email: 'vercel@example.test', password: 'Fixture-only-password-2026' }))).status, 200);
    assert.equal((await post('bad-json')).status, 400);
    assert.equal((await post('{}', 'text/plain')).status, 415);
    assert.equal((await post(JSON.stringify({ name: 'x'.repeat(33000) }))).status, 413);
});
