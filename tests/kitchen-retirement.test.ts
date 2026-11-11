import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { LocalDatabase, LocalStore } from '../src/server/local-database.js';
import { MealService } from '../src/server/domain.js';
import { CheckoutService } from '../src/server/checkout.js';
import { createApp } from '../src/server/http.js';
import { settings } from '../src/server/config.js';
import { AppError } from '../src/server/errors.js';
import { seedVendor } from '../src/server/seed.js';
import { addLegacyTestKitchens } from './fixtures.js';

async function fixture(t: test.TestContext) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'breakbite-retirement-'));
    const db = new LocalDatabase(directory);
    await db.open();
    t.after(async () => { await db.close(); await rm(directory, { recursive: true, force: true }); });
    return db;
}

test('fresh installations and migrated catalogues expose only nine campus kitchens and 45 menu items', async t => {
    const db = await fixture(t);
    assert.equal(Object.keys(db.read().vendors).length, 9);
    assert.equal(db.read().vendors['bowl-lab'], undefined);
    assert.equal(db.read().vendors['noodle-co'], undefined);
    await addLegacyTestKitchens(db);
    await db.close(); await db.open();
    assert.equal(db.read().vendors['bowl-lab']!.vendor.archived, true);
    assert.equal(db.read().vendors['noodle-co']!.vendor.archived, true);
    const config = settings();
    const server = createApp(config, new MealService(new LocalStore(db)), db);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    config.allowedOrigins = [origin];
    t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
    const response = await fetch(origin + '/api/catalog');
    const catalog = await response.json() as { vendors: { id: string }[]; items: unknown[] };
    assert.equal(response.status, 200);
    assert.equal(catalog.vendors.length, 9);
    assert.equal(catalog.items.length, 45);
});

test('retirement preserves historical checkout recovery and one-use pickup while blocking new orders', async t => {
    const db = await fixture(t); await addLegacyTestKitchens(db);
    const actor = { id: 'retirement-student', name: 'Student', role: 'student' as const };
    const operator = { id: 'retirement-operator', name: 'Operator', role: 'vendor' as const, vendorId: 'bowl-lab' };
    const payload = { plan: { mode: 'pickup', budgetSen: 2500 }, expectedTotalSen: 950,
        groups: [{ vendorId: 'bowl-lab', items: [{ itemId: 'chicken-rice', quantity: 1 }], slotId: db.read().vendors['bowl-lab']!.slots[3]!.id }] };
    const original = await new CheckoutService(db).submit(actor, payload, 'retired-original');
    const before = db.read();
    await db.close(); await db.open();
    const legacy = db.read().vendors['bowl-lab']!;
    assert.equal(legacy.vendor.archived, true);
    assert.equal(legacy.vendor.open, false);
    assert.deepEqual(legacy.orders, before.vendors['bowl-lab']!.orders);
    assert.deepEqual(legacy.items, before.vendors['bowl-lab']!.items);
    assert.deepEqual(legacy.slots, before.vendors['bowl-lab']!.slots);
    const checkout = new CheckoutService(db);
    assert.deepEqual(await checkout.submit(actor, payload, 'retired-original'), original);
    await assert.rejects(checkout.submit(actor, payload, 'retired-new-order'), (error: unknown) => error instanceof AppError && error.code === 'NO_AVAILABLE_SLOT');
    const meals = new MealService(new LocalStore(db), Date.now, 'pay_at_pickup');
    const order = original.orders[0]!;
    await meals.changeStatus(operator, 'bowl-lab', order.id, { status: 'preparing' });
    await meals.changeStatus(operator, 'bowl-lab', order.id, { status: 'ready' });
    await meals.collect(operator, 'bowl-lab', order.id, { code: order.pickupCode, paymentReceived: true });
    await assert.rejects(meals.collect(operator, 'bowl-lab', order.id, { code: order.pickupCode, paymentReceived: true }), (error: unknown) => error instanceof AppError && error.code === 'NOT_READY');
    assert.deepEqual(db.read().checkouts, before.checkouts);
});

test('old per-kitchen files are imported and retired without deleting the source files', async t => {
    const db = await fixture(t);
    const directory = db.directory;
    await db.close();
    await rm(path.join(directory, 'database.json'));
    const original = seedVendor('bowl-lab');
    original.vendor.name = 'Previously reviewed kitchen';
    original.vendor.synthetic = false;
    original.vendor.menuReviewedAt = '2026-11-10T00:00:00.000Z';
    original.items[0]!.stock = 4;
    const source = JSON.stringify(original);
    await writeFile(path.join(directory, 'bowl-lab.json'), source);
    await db.open();
    const imported = db.read().vendors['bowl-lab']!;
    assert.equal(imported.vendor.archived, true);
    assert.equal(imported.vendor.open, false);
    assert.equal(imported.vendor.name, original.vendor.name);
    assert.deepEqual(imported.items, original.items);
    assert.equal(await readFile(path.join(directory, 'bowl-lab.json'), 'utf8'), source);
});
