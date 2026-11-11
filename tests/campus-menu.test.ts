import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalStore } from '../src/server/local-database.js';
import { jsonFile, testDatabase } from './support/test-database.js';
import { CheckoutService } from '../src/server/checkout.js';
import { VENDOR_IDS, seedVendor } from '../src/server/seed.js';
import { foodCheck } from '../src/shared/features.js';
import { initialState } from '../src/web/state.js';
import { basket, explore } from '../src/web/views/student.js';

async function fixture(t: test.TestContext) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'breakbite-campus-'));
    const db = testDatabase(directory);
    await db.open();
    t.after(async () => { await db.close(); await rm(directory, { recursive: true, force: true }); });
    return db;
}

test('adding campus kitchens preserves existing orders and checkout retry records across reopen', async t => {
    const db = await fixture(t);
    const actor = { id: 'migration-student', name: 'Student', role: 'student' as const };
    const checkout = new CheckoutService(db);
    const groups = ['bowl-lab', 'noodle-co'].map((vendorId, index) => ({ vendorId,
        items: [{ itemId: index ? 'lemon-water' : 'chicken-rice', quantity: 1 }],
        slotId: db.read().vendors[vendorId]!.slots[index]!.id }));
    const payload = { groups, plan: { mode: 'pickup', budgetSen: 2500 }, expectedTotalSen: 1250 };
    const order = await checkout.submit(actor, payload, 'migration-checkout');
    await db.transaction(d => {
        for (const id of VENDOR_IDS) if (id !== 'bowl-lab' && id !== 'noodle-co') delete d.vendors[id];
        d.vendors['bowl-lab']!.vendor.name = 'Operator-owned kitchen';
        d.vendors['bowl-lab']!.items[0]!.stock = 7;
    });
    const original = db.read();
    await db.close();
    await db.open();
    const migrated = db.read();
    assert.equal(Object.keys(migrated.vendors).length, VENDOR_IDS.length);
    assert.deepEqual(migrated.vendors['bowl-lab'], original.vendors['bowl-lab']);
    assert.deepEqual(migrated.vendors['noodle-co'], original.vendors['noodle-co']);
    assert.deepEqual(migrated.checkouts, original.checkouts);
    assert.deepEqual(new CheckoutService(db).lookup(actor, 'migration-checkout'), order);
    if (jsonFile) assert.deepEqual(JSON.parse(await readFile(path.join(db.directory, 'database.previous.json'), 'utf8')), original);
    await db.close();
    await db.open();
    assert.deepEqual(db.read(), migrated);
    assert.equal((await new LocalStore(db).ids()).length, VENDOR_IDS.length);
});

test('catalogue migration preserves reviewed operator locations and photos', async t => {
    const db = await fixture(t);
    await db.transaction(d => {
        const kitchen = d.vendors['asian-cuisine']!;
        kitchen.vendor.synthetic = false;
        kitchen.vendor.menuReviewedAt = '2026-11-11T00:00:00.000Z';
        kitchen.vendor.location = 'APU Food Court · Asian Cuisine';
        kitchen.items[0]!.photoPath = '/images/cafeterias/asian-cuisine.jpg';
        kitchen.items[0]!.photoCredit = 'Photo supplied by the project team; menu item shown may differ.';
    });
    const reviewed = db.read().vendors['asian-cuisine'];
    await db.close();
    await db.open();
    assert.deepEqual(db.read().vendors['asian-cuisine'], reviewed);
});

test('sample dietary declarations fail closed until an operator reviews them', () => {
    const sample = seedVendor('asian-cuisine').items.find(item => item.id === 'vegetable-fried-rice')!;
    const preferences = { diets: [], avoid: ['peanuts' as const], hideUnsuitable: true };
    assert.equal(foodCheck(sample.foodInfo, preferences).suitable, false);
    const state = initialState();
    state.vendors = [seedVendor('asian-cuisine').vendor];
    state.items = [sample];
    state.allergenFilters = ['peanuts'];
    assert.doesNotMatch(explore(state), /<article class="bb-meal">/);
    sample.foodInfo = { ...sample.foodInfo!, reviewedBy: 'operator' };
    assert.match(explore(state), /<article class="bb-meal">/);
    sample.foodInfo.mayContain = ['peanuts'];
    assert.doesNotMatch(explore(state), /<article class="bb-meal">/);
});

test('the combined basket has one checkout action and preserves optional timetable controls', () => {
    const state = initialState();
    state.fitBreak = true;
    state.uncertain = true;
    const html = basket(state);
    assert.equal(html.match(/data-action="review"/g)?.length, 1);
    assert.match(html, /class="bb-basket-scroll"/);
    assert.match(html, /class="bb-basket-actions"/);
    assert.match(html, /id="fit-toggle"[^>]*disabled/);
    assert.match(html, /Import APSpace timetable/);
    assert.match(html, /id="plan-form"/);
});
