import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingLoad } from '../src/server/policy.js';
import { seedVendor, DEMO_IDENTITIES } from '../src/server/seed.js';
import { MealService } from '../src/server/domain.js';
import { MemoryStore } from '../src/server/store.js';
const now = Date.parse('2026-11-11T04:00:00Z');

test('per-item pickup estimates use quote capacity, preparation, delays and cutoff without mutating reservations', async () => {
    const state = seedVendor('bowl-lab', now);
    state.vendor.policies = {cutoffMinutes:3,cancellationMinutes:0,holdMinutes:15,delayGraceMinutes:5};
    const item = state.items[0]!;
    item.prepUnits = 3;
    state.slots[0]!.reservedUnits = state.slots[0]!.kitchenCapacity - 2;
    state.slots[1]!.reservedHandovers = state.slots[1]!.pickupCapacity;
    state.incidents.push({id:'delay',itemIds:[item.id],reason:'Test delay',delayMinutes:9,active:true,createdAt:new Date(now).toISOString()});
    const before=structuredClone(state);
    const load = bookingLoad(state, now);
    assert.deepEqual(state,before);
    const store = new MemoryStore(); await store.initialize(state);
    const quote = await new MealService(store,()=>now).quote(DEMO_IDENTITIES[0]!,{vendorId:state.vendor.id,items:[{itemId:item.id,quantity:1}],plan:{mode:'pickup',budgetSen:50000}});
    const estimate=load.itemEstimates!.find(e=>e.itemId===item.id)!;
    assert.ok(estimate);
    assert.equal(estimate.endAt,quote.slots[0]!.endAt);
    assert.equal(estimate.startAt,new Date(Math.max(Date.parse(quote.slots[0]!.startAt),now+(item.prepMinutes+9)*60000)).toISOString());
    assert.equal(load.delayed,true);
    assert.ok(load.nextAvailableAt);
});

test('closed, sold out and unbookable kitchens do not advertise an item pickup estimate', () => {
    const state=seedVendor('bowl-lab',now);
    state.items[0]!.stock=0;
    state.items[1]!.enabled=false;
    assert.ok(bookingLoad(state,now).itemEstimates!.every(e=>![state.items[0]!.id,state.items[1]!.id].includes(e.itemId)));
    state.vendor.open=false;
    assert.deepEqual(bookingLoad(state,now).itemEstimates,[]);
    state.vendor.open=true;
    state.slots.forEach(s=>s.reservedHandovers=s.pickupCapacity);
    assert.equal(bookingLoad(state,now).nextAvailableAt,null);
});

test('public kitchen activity aggregates states without exposing order identity or pickup credentials', () => {
    const state=seedVendor('bowl-lab',now);
    // Only status is read by the activity counter; no order data may escape.
    state.orders=['confirmed','confirmed','preparing','ready','collected','cancelled','uncollected'].map((status,i)=>({status,id:`private-${i}`,pickupCode:'private-code'})) as typeof state.orders;
    const load=bookingLoad(state,now);
    assert.deepEqual(load.activity,{scheduled:2,preparing:1,ready:1});
    assert.doesNotMatch(JSON.stringify(load),/private-/);
});
