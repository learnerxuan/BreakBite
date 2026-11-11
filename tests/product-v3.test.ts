import test from 'node:test';
import { addLegacyTestKitchens } from './fixtures.js';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LocalDatabase, LocalStore } from '../src/server/local-database.js';
import { CheckoutService } from '../src/server/checkout.js';
import { MealService } from '../src/server/domain.js';
import { ProductService } from '../src/server/product.js';
import { parseCalendar } from '../src/server/timetable.js';
import { parseFoodInfo } from '../src/server/food.js';
import { foodCheck, emptyProfile } from '../src/shared/features.js';
import { bookingLoad } from '../src/server/policy.js';
import { qrMatrix, qrSvg } from '../src/shared/qr.js';
import { AppError } from '../src/server/errors.js';
import type { Actor, MenuItem } from '../src/shared/model.js';
const a: Actor = { id:'student-a', role:'student', name:'Student A' };
const b: Actor = { id:'student-b', role:'student', name:'Student B' };
const op: Actor = { id:'operator-a', role:'vendor', vendorId:'bowl-lab', name:'Kitchen A' };
const otherOp: Actor = { id:'operator-b', role:'vendor', vendorId:'noodle-co', name:'Kitchen B' };
const code = (c:string) => (e:unknown) => e instanceof AppError && e.code===c;
const food = (extra={}) => ({ingredients:'Rice, chicken, oil and soy sauce',allergensKnown:true,allergens:['soy'],mayContain:['sesame'],diets:[],spice:'mild',confirmed:true,...extra});
async function setup(t:test.TestContext) {
    const dir=await mkdtemp(path.join(os.tmpdir(),'breakbite-v3-'));const db=new LocalDatabase(dir);await db.open();await addLegacyTestKitchens(db);
    let now=Date.now();const clock=()=>now; const store=new LocalStore(db);const service=new MealService(store,clock,'pay_at_pickup');const checkout=new CheckoutService(db,clock);const product=new ProductService(db,clock);
    t.after(async()=>{await db.close();await rm(dir,{recursive:true,force:true});});
    const groups=[{vendorId:'bowl-lab',items:[{itemId:'chicken-rice',quantity:1}],slotId:db.read().vendors['bowl-lab']!.slots[3]!.id}];
    const payload={groups,plan:{mode:'pickup',budgetSen:50000},transferMinutes:2,expectedTotalSen:950};
    const order=async(key='checkout-product')=>(await checkout.submit(a,payload,key)).orders[0]!;
    const ready=async(id:string)=>{await service.changeStatus(op,'bowl-lab',id,{status:'preparing'});await service.changeStatus(op,'bowl-lab',id,{status:'ready'});};
    return {dir,db,store,service,checkout,product,payload,order,ready,clock,setNow:(n:number)=>now=n};
}
function fields(i:MenuItem){return {name:i.name,description:i.description,category:i.category,art:i.art,priceSen:i.priceSen,stock:i.stock,prepMinutes:i.prepMinutes,prepUnits:i.prepUnits,enabled:i.enabled};}
function ics(body:string){return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;}
function event(body:string){return `BEGIN:VEVENT\r\n${body}\r\nEND:VEVENT`;}
const CAL_NOW=Date.parse('2026-11-01T00:00:00Z');

test('QR matrix is version 5-L with four-module quiet zone and no payload in SVG markup',()=>{
    const m=qrMatrix('BB1:12345678-1234-1234-1234-123456789abc:1234567890abcdef1234567890abcdef');
    assert.equal(m.length,37);assert.ok(m.every(r=>r.length===37&&r.every(v=>typeof v==='boolean')));
    assert.ok(qrSvg('private-credential').includes('viewBox="0 0 45 45"'));assert.ok(!qrSvg('private-credential').includes('private-credential'));
    assert.throws(()=>qrMatrix('a'.repeat(107)),/too long/);
});
test('student QR is private and unavailable to other students or kitchen operators',async t=>{
    const f=await setup(t);const o=await f.order();const qr=await f.product.pickupQr(a,o.vendorId,o.id);assert.match(qr.payload,/^BB1:[a-f0-9-]{36}:[a-f0-9]{32}$/);
    await assert.rejects(f.product.pickupQr(b,o.vendorId,o.id),code('NOT_FOUND'));await assert.rejects(f.product.pickupQr(op,o.vendorId,o.id),code('FORBIDDEN'));
    const snapshot=JSON.stringify(await f.service.snapshot(op,'local'));assert.ok(!snapshot.includes(qr.payload.split(':')[2]!));
    assert.ok(!JSON.stringify(f.checkout.lookup(a,'checkout-product')).includes('qrToken'));
});
test('QR collection requires correct kitchen, ready state and explicit payment; one-use even on race',async t=>{
    const f=await setup(t);const o=await f.order();const q=await f.product.pickupQr(a,o.vendorId,o.id);
    assert.throws(()=>f.product.resolveQr(op,q),code('NOT_READY'));await f.ready(o.id);
    assert.throws(()=>f.product.resolveQr(otherOp,q),code('NOT_FOUND'));assert.throws(()=>f.product.resolveQr(a,q),code('FORBIDDEN'));
    await assert.rejects(f.product.collectQr(op,q),code('PAYMENT_REQUIRED'));
    const results=await Promise.allSettled([f.product.collectQr(op,{...q,paymentReceived:true}),f.product.collectQr(op,{...q,paymentReceived:true})]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.db.read().vendors['bowl-lab']!.orders[0]!.paymentStatus,'paid');
    assert.throws(()=>f.product.resolveQr(op,q),code('NOT_READY'));await assert.rejects(f.product.pickupQr(a,o.vendorId,o.id),code('ORDER_CLOSED'));
});
test('QR tampering and arbitrary URLs are rejected',async t=>{
    const f=await setup(t);const o=await f.order();await f.ready(o.id);const q=await f.product.pickupQr(a,o.vendorId,o.id);
    assert.throws(()=>f.product.resolveQr(op,{payload:'https://example.test'}),code('INVALID_QR'));
    assert.throws(()=>f.product.resolveQr(op,{payload:q.payload.slice(0,-32)+'0'.repeat(32)}),code('INVALID_QR'));
});
test('favourites are per account, deduplicated, persistent and removable',async t=>{
    const f=await setup(t);await f.product.favourite(a,{itemId:'chicken-rice',saved:true});await f.product.favourite(a,{itemId:'chicken-rice',saved:true});
    assert.deepEqual(f.product.profile(a).profile.favourites,['chicken-rice']);assert.equal(f.product.profile(b).profile.favourites.length,0);
    await f.db.close();await f.db.open();assert.equal(f.product.profile(a).profile.favourites.length,1);
    await f.product.favourite(a,{itemId:'chicken-rice',saved:false});assert.equal(f.product.profile(a).profile.favourites.length,0);
});
test('usual order save/rename/reorder uses live price and never submits an order',async t=>{
    const f=await setup(t);await f.product.usual(a,{name:'Tuesday lunch',lines:[{vendorId:'bowl-lab',itemId:'chicken-rice',quantity:1},{vendorId:'noodle-co',itemId:'lemon-water',quantity:1}]});
    const id=f.product.profile(a).profile.usuals[0]!.id;await f.product.usual(a,{id,name:'Lunch and drink'});
    await f.store.transact('bowl-lab',s=>{s.items[0]!.priceSen+=100;});const result=f.product.reorder(a,{usualId:id});assert.equal(result.basket.length,2);assert.ok(result.warnings.some(w=>w.includes('price changed')));
    assert.equal(f.db.read().vendors['bowl-lab']!.orders.length,0);assert.throws(()=>f.product.reorder(b,{usualId:id}),code('NOT_FOUND'));
    await f.product.usual(a,{id,remove:true});assert.equal(f.product.profile(a).profile.usuals.length,0);
});
test('repeat from historical checkout excludes unavailable meals and reports what changed',async t=>{
    const f=await setup(t);const o=await f.order();await f.store.transact('bowl-lab',s=>{s.items[0]!.stock=0;});
    const r=f.product.reorder(a,{checkoutId:o.checkoutId});assert.equal(r.basket.length,0);assert.ok(r.warnings.some(w=>w.includes('unavailable')));
    assert.throws(()=>f.product.reorder(b,{checkoutId:o.checkoutId}),code('NOT_FOUND'));
});
test('usual baskets validate per-kitchen portion limits and duplicate lines',async t=>{
    const f=await setup(t);await assert.rejects(f.product.usual(a,{name:'Invalid',lines:[{vendorId:'bowl-lab',itemId:'chicken-rice',quantity:5},{vendorId:'bowl-lab',itemId:'chicken-rice',quantity:1}]}),code('INVALID_ITEMS'));
    await assert.rejects(f.product.usual(op,{name:'Bad',lines:[]}),code('FORBIDDEN'));
});
test('unknown allergen information does not pass an active avoidance preference',()=>{
    const p={...emptyProfile().preferences,avoid:['peanuts' as const]};assert.equal(foodCheck(undefined,p).suitable,false);
    const f=parseFoodInfo(food(),op.id,CAL_NOW);assert.equal(foodCheck(f,p).suitable,true);assert.equal(foodCheck(f,{...p,avoid:['sesame']}).suitable,false);
});
test('halal and gluten-free require evidence and expiry validation; vegan contradictions rejected',()=>{
    assert.throws(()=>parseFoodInfo(food({diets:['halal']}),op.id,CAL_NOW),code('EVIDENCE_REQUIRED'));
    assert.throws(()=>parseFoodInfo(food({diets:['gluten_free'],allergens:['wheat'],glutenFreeEvidence:{reference:'Verified recipe and process',expiresOn:'2026-12-31'}}),op.id,CAL_NOW),code('EVIDENCE_REQUIRED'));
    assert.throws(()=>parseFoodInfo(food({diets:['vegan'],allergens:['eggs']}),op.id,CAL_NOW),code('INVALID_FOOD_INFO'));
    const f=parseFoodInfo(food({diets:['halal'],halalEvidence:{reference:'Kitchen certificate reference',expiresOn:'2026-10-01'}}),op.id,CAL_NOW);
    assert.equal(foodCheck(f,{...emptyProfile().preferences,diets:['halal']},CAL_NOW).suitable,false);
});
test('vendor metadata is saved with reviewer and old order ingredient snapshots stay immutable',async t=>{
    const f=await setup(t);const i=f.db.read().vendors['bowl-lab']!.items[0]!;await f.service.updateItem(op,'bowl-lab',i.id,{...fields(i),foodInfo:food()});
    const q=await f.checkout.quote(a,f.payload);const c=await f.checkout.submit(a,{...f.payload,menuVersions:q.menuVersions},'reviewed-menu');
    assert.equal(c.orders[0]!.lines[0]!.foodInfo!.allergens[0],'soy');
    f.setNow(f.clock()+1000);await f.service.updateItem(op,'bowl-lab',i.id,{...fields(i),foodInfo:food({allergens:['milk']})});
    assert.equal(f.db.read().vendors['bowl-lab']!.orders[0]!.lines[0]!.foodInfo!.allergens[0],'soy');
});
test('dietary restrictions are enforced in authoritative checkout, not only UI',async t=>{
    const f=await setup(t);await f.product.preferences(a,{diets:[],avoid:['peanuts'],hideUnsuitable:false});
    assert.ok((await f.checkout.quote(a,f.payload)).reasons.some(r=>r.includes('incomplete')));
    await assert.rejects(f.checkout.submit(a,f.payload,'diet-unknown'),code('DIETARY_CONFLICT'));assert.equal(f.db.read().vendors['bowl-lab']!.orders.length,0);
});
test('changed ingredient metadata invalidates checkout review',async t=>{
    const f=await setup(t);const i=f.db.read().vendors['bowl-lab']!.items[0]!;await f.service.updateItem(op,'bowl-lab',i.id,{...fields(i),foodInfo:food()});const q=await f.checkout.quote(a,f.payload);
    f.setNow(f.clock()+1000);await f.service.updateItem(op,'bowl-lab',i.id,{...fields(i),foodInfo:food({ingredients:'Rice, milk and chicken',allergens:['milk']})});
    await assert.rejects(f.checkout.submit(a,{...f.payload,menuVersions:q.menuVersions},'changed-ingredients'),code('MENU_CHANGED'));
});
test('cutoff prevents orders after deadline but existing retries stay idempotent',async t=>{
    const f=await setup(t);const o=await f.order();const v=f.db.read().vendors['bowl-lab']!.vendor;
    await f.service.updateVendor(op,v.id,{...v,policies:{cutoffMinutes:120,cancellationMinutes:5,holdMinutes:15,delayGraceMinutes:5}});
    assert.equal((await f.checkout.submit(a,f.payload,'checkout-product')).orders[0]!.id,o.id);
    await assert.rejects(f.checkout.submit(a,f.payload,'after-cutoff'),code('NO_AVAILABLE_SLOT'));
});
test('cancellation cutoff is snapshotted and locked even before preparation',async t=>{
    const f=await setup(t);const v=f.db.read().vendors['bowl-lab']!.vendor;
    await f.service.updateVendor(op,v.id,{...v,policies:{cutoffMinutes:0,cancellationMinutes:8,holdMinutes:15,delayGraceMinutes:5}});const o=await f.order();
    f.setNow(Date.parse(o.cancelBeforeAt!));await assert.rejects(f.service.cancel(a,o.vendorId,o.id),code('CANCELLATION_LOCKED'));
});
test('vendor-late prepared cancellation does not restock consumed food or punish student',async t=>{
    const f=await setup(t);const o=await f.order();await f.service.changeStatus(op,o.vendorId,o.id,{status:'preparing'});const stock=f.db.read().vendors['bowl-lab']!.items[0]!.stock;
    await f.service.reportIncident(op,o.vendorId,{reason:'Equipment issue',delayMinutes:20,itemIds:[]});await f.service.cancel(a,o.vendorId,o.id);
    const current=f.db.read().vendors['bowl-lab']!.orders[0]!;assert.equal(current.status,'cancelled');assert.equal(current.closedReason,'vendor_delay');assert.equal(f.db.read().vendors['bowl-lab']!.items[0]!.stock,stock);assert.ok(!current.noShowRecorded);
});
test('early ready does not expire before scheduled pickup; reminders are durable and deduplicated',async t=>{
    const f=await setup(t);const o=await f.order();await f.ready(o.id);const current=f.db.read().vendors['bowl-lab']!.orders[0]!;
    assert.equal(Date.parse(current.collectionDueAt!),Date.parse(current.promisedPickupEndAt!)+15*60000);
    await f.product.tick();await f.product.tick();assert.equal(f.product.profile(a).notices.length,1);
    f.setNow(Date.parse(current.collectionDueAt!)-4*60000);await f.product.tick();assert.equal(f.product.profile(a).notices.length,2);
    await f.db.close();await f.db.open();assert.equal(f.product.profile(a).notices.length,2);assert.equal(f.product.profile(b).notices.length,0);
    await f.product.markRead(a);assert.ok(f.product.profile(a).notices.every(n=>n.readAt));
});
test('overdue processing requires kitchen confirmation and never automatically releases resources',async t=>{
    const f=await setup(t);const o=await f.order();await f.ready(o.id);const before=f.db.read().vendors['bowl-lab']!;
    f.setNow(Date.parse(before.orders[0]!.collectionDueAt!)+1000);await f.product.tick();assert.equal(f.db.read().vendors['bowl-lab']!.orders[0]!.status,'ready');
    await assert.rejects(f.product.closeUncollected(otherOp,{orderId:o.id,reason:'Not collected'}),code('NOT_FOUND'));
    await f.product.closeUncollected(op,{orderId:o.id,reason:'Counter checked; meal not collected'});const after=f.db.read().vendors['bowl-lab']!;
    assert.equal(after.orders[0]!.status,'uncollected');assert.deepEqual(after.items,before.items);assert.deepEqual(after.slots,before.slots);
    assert.equal(after.orders[0]!.noShowRecorded,true);await f.product.correctNoShow(op,{orderId:o.id,reason:'Student provided evidence of collection'});assert.equal(f.db.read().vendors['bowl-lab']!.orders[0]!.noShowRecorded,false);
});
test('vendor delays exclude uncollected orders from no-show record',async t=>{
    const f=await setup(t);const o=await f.order();await f.service.reportIncident(op,o.vendorId,{reason:'Rice delay',delayMinutes:20,itemIds:[]});
    f.setNow(Date.parse(o.promisedPickupEndAt!)+20*60000);await f.ready(o.id);f.setNow(f.clock()+16*60000);await f.product.tick();await f.product.closeUncollected(op,{orderId:o.id,reason:'Student could not wait'});
    assert.equal(f.db.read().vendors['bowl-lab']!.orders[0]!.noShowRecorded,false);
});
test('load indicators measure capacity utilisation and closed cutoff, not physical queue size',async t=>{
    const f=await setup(t);const s=f.db.read().vendors['bowl-lab']!;s.slots[0]!.reservedUnits=s.slots[0]!.kitchenCapacity;
    const load=bookingLoad(s,f.clock());assert.equal(load.slots[0]!.level,'full');assert.equal(load.slots[0]!.percent,100);
    s.vendor.open=false;assert.ok(bookingLoad(s,f.clock()).slots.every(w=>w.level==='closed'));
});
test('deadline assistance only selects free earlier capacity and rotates pickup credentials',async t=>{
    const f=await setup(t);const o=await f.order();const qr=await f.product.pickupQr(a,o.vendorId,o.id);const candidates=await f.product.earlierOptions(a,o.vendorId,o.id);assert.ok(candidates.slots.length);
    const before=f.db.read().vendors['noodle-co'];await f.product.moveEarlier(a,{vendorId:o.vendorId,orderId:o.id,slotId:candidates.slots[0]!.id});
    assert.deepEqual(f.db.read().vendors['noodle-co'],before);const after=f.db.read().vendors['bowl-lab']!.orders[0]!;assert.ok(after.estimatedReadyAt<o.estimatedReadyAt);assert.notEqual(after.pickupCode,o.pickupCode);
    await f.ready(o.id);assert.throws(()=>f.product.resolveQr(op,qr),code('INVALID_QR'));
});
test('earlier moves are ownership checked and never interrupt preparation',async t=>{
    const f=await setup(t);const o=await f.order();await assert.rejects(f.product.earlierOptions(b,o.vendorId,o.id),code('NOT_FOUND'));
    await f.service.changeStatus(op,o.vendorId,o.id,{status:'preparing'});assert.equal((await f.product.earlierOptions(a,o.vendorId,o.id)).slots.length,0);
    await assert.rejects(f.product.moveEarlier(a,{vendorId:o.vendorId,orderId:o.id,slotId:f.payload.groups[0]!.slotId}),code('ALREADY_PREPARING'));
});
test('students can request a faster alternative but cannot approve it',async t=>{
    const f=await setup(t);const o=await f.order();const options=await f.service.requestAssistance(a,o.vendorId,o.id);assert.ok(options.options.length);
    const option=options.options[0]!;const p=await f.service.createProposal(a,o.vendorId,{orderId:o.id,itemId:option.itemId,slotId:option.slotId,reason:'Need a faster meal'});
    assert.equal(p.source,'student');assert.equal(p.status,'pending_vendor');await assert.rejects(f.service.approveProposal(a,o.vendorId,p.id,{approve:true}),code('FORBIDDEN'));
    assert.equal(f.db.read().vendors['bowl-lab']!.orders[0]!.lines[0]!.itemId,'chicken-rice');
});
test('manual timetable is account-private, bounded, deduplicated and removable',async t=>{
    const f=await setup(t);const input={title:'Algorithms',location:'Room 2',startAt:new Date(f.clock()+3600000).toISOString(),endAt:new Date(f.clock()+7200000).toISOString(),weeks:3};
    await f.product.manualClass(a,input);await f.product.manualClass(a,input);assert.equal(f.product.profile(a).profile.classes.length,3);assert.equal(f.product.profile(b).profile.classes.length,0);
    await f.product.deleteClass(a,{id:f.product.profile(a).profile.classes[0]!.id});assert.equal(f.product.profile(a).profile.classes.length,2);
    await f.product.deleteClass(a,{all:true});assert.equal(f.product.profile(a).profile.classes.length,0);
});
test('ICS weekly RRULE applies COUNT, BYDAY, EXDATE, RDATE and UTC+8',()=>{
    const calendar=ics(event('UID:weekly\r\nDTSTART;TZID=Asia/Kuala_Lumpur:20261102T090000\r\nDTEND;TZID=Asia/Kuala_Lumpur:20261102T100000\r\nSUMMARY:Data Structures\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4\r\nEXDATE;TZID=Asia/Kuala_Lumpur:20261104T090000\r\nRDATE;TZID=Asia/Kuala_Lumpur:20261106T090000'));
    const r=parseCalendar(calendar,CAL_NOW);assert.deepEqual(r.events.map(e=>e.startAt),['2026-11-02T01:00:00.000Z','2026-11-06T01:00:00.000Z','2026-11-09T01:00:00.000Z','2026-11-11T01:00:00.000Z']);
});
test('ICS folded titles, UTC times, escaped text and cancelled recurrence overrides',()=>{
    const calendar=ics(event('UID:repeat\r\nDTSTART:20261102T010000Z\r\nDTEND:20261102T020000Z\r\nSUMMARY:Long\\, folded\r\n  title\r\nRRULE:FREQ=DAILY;COUNT=3')+'\r\n'+event('UID:repeat\r\nRECURRENCE-ID:20261103T010000Z\r\nSTATUS:CANCELLED'));
    const r=parseCalendar(calendar,CAL_NOW);assert.equal(r.events.length,2);assert.equal(r.events[0]!.title,'Long, folded title');
});
test('ICS rescheduled individual instance replaces rather than duplicates it',()=>{
    const calendar=ics(event('UID:repeat\r\nDTSTART:20261102T010000Z\r\nDTEND:20261102T020000Z\r\nSUMMARY:Base\r\nRRULE:FREQ=DAILY;COUNT=2')+'\r\n'+event('UID:repeat\r\nRECURRENCE-ID:20261103T010000Z\r\nDTSTART:20261103T030000Z\r\nDTEND:20261103T040000Z\r\nSUMMARY:Moved'));
    const r=parseCalendar(calendar,CAL_NOW);assert.equal(r.events.length,2);assert.equal(r.events[1]!.title,'Moved');assert.equal(r.events[1]!.startAt,'2026-11-03T03:00:00.000Z');
});
test('ICS does not silently turn unsupported recurrence or timezone into a one-off class',()=>{
    const r=parseCalendar(ics(event('UID:monthly\r\nDTSTART:20261102T010000Z\r\nDTEND:20261102T020000Z\r\nRRULE:FREQ=MONTHLY\r\nSUMMARY:Monthly')+'\r\n'+event('UID:zone\r\nDTSTART;TZID=Europe/London:20261102T090000\r\nDTEND;TZID=Europe/London:20261102T100000\r\nSUMMARY:Other zone')),CAL_NOW);
    assert.equal(r.events.length,0);assert.ok(r.warnings.some(w=>w.includes('series was skipped')));assert.ok(r.warnings.some(w=>w.includes('Unsupported timezone')));
});
test('ICS all-day and impossible dates warn; file and occurrence limits are bounded',()=>{
    const r=parseCalendar(ics(event('UID:all-day\r\nDTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261103')+'\r\n'+event('UID:invalid\r\nDTSTART:20260230T010000Z\r\nDTEND:20260230T020000Z')),CAL_NOW);assert.equal(r.events.length,0);assert.ok(r.warnings.length>=3);
    assert.throws(()=>parseCalendar('a'.repeat(262145),CAL_NOW),code('ICS_TOO_LARGE'));
});
test('calendar import requires an owned, unexpired preview and explicit confirmation',async t=>{
    const f=await setup(t);f.setNow(CAL_NOW);const content=ics(event('UID:one\r\nDTSTART:20261102T010000Z\r\nDTEND:20261102T020000Z\r\nSUMMARY:Class'));
    const preview=await f.product.previewTimetable(a,{content});assert.equal(f.product.profile(a).profile.classes.length,0);
    await assert.rejects(f.product.confirmTimetable(b,{previewId:preview.id,ids:preview.events.map(e=>e.id),replaceImported:true}),code('PREVIEW_EXPIRED'));
    await f.product.confirmTimetable(a,{previewId:preview.id,ids:preview.events.map(e=>e.id),replaceImported:true});assert.equal(f.product.profile(a).profile.classes.length,1);
    const again=await f.product.previewTimetable(a,{content});await f.product.confirmTimetable(a,{previewId:again.id,ids:again.events.map(e=>e.id),replaceImported:false});assert.equal(f.product.profile(a).profile.classes.length,1);
    const stale=await f.product.previewTimetable(a,{content});f.setNow(CAL_NOW+16*60000);await assert.rejects(f.product.confirmTimetable(a,{previewId:stale.id,ids:stale.events.map(e=>e.id),replaceImported:true}),code('PREVIEW_EXPIRED'));
});
test('photographs require vendor ownership, permission and a raster signature',async t=>{
    const f=await setup(t);await assert.rejects(f.product.photo(a,'chicken-rice',{}),code('FORBIDDEN'));
    await assert.rejects(f.product.photo(otherOp,'chicken-rice',{}),code('NOT_FOUND'));
    await assert.rejects(f.product.photo(op,'chicken-rice',{permission:true,credit:'Our own photo',data:Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64')}),code('INVALID_PHOTO'));
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1cAAAAASUVORK5CYII=','base64');await f.product.photo(op,'chicken-rice',{permission:true,credit:'Fixture owned by project',data:png.toString('base64')});
    const i=f.db.read().vendors['bowl-lab']!.items[0]!;assert.match(i.photoPath!,/^\/media\/[a-f0-9]{64}\.png$/);assert.deepEqual(await readFile(path.join(f.dir,i.photoPath!)),png);
});

test('invalid evidence dates return a validation error, not an internal exception',()=>{
    assert.throws(()=>parseFoodInfo(food({diets:['halal'],halalEvidence:{reference:'Vendor evidence',expiresOn:'2026-99-99'}}),op.id,Date.now()),code('INVALID_FOOD_INFO'));
});
test('same-millisecond ingredient edits invalidate checkout review fingerprints',async t=>{
    const f=await setup(t);const i=f.db.read().vendors['bowl-lab']!.items[0]!;
    await f.service.updateItem(op,'bowl-lab',i.id,{...fields(i),foodInfo:food()});const q=await f.checkout.quote(a,f.payload);
    await f.service.updateItem(op,'bowl-lab',i.id,{...fields(i),foodInfo:food({ingredients:'Chicken rice and milk',allergens:['milk']})});
    await assert.rejects(f.checkout.submit(a,{...f.payload,menuVersions:q.menuVersions},'same-time-review'),code('MENU_CHANGED'));
});
test('recovery checks current saved restrictions and never silently accepts changed ingredients',async t=>{
    const f=await setup(t);const o=await f.order();const state=f.db.read().vendors['bowl-lab']!;
    for(const i of state.items.filter(i=>i.category!=='Drinks'))await f.service.updateItem(op,'bowl-lab',i.id,{...fields(i),foodInfo:food()});
    await f.product.preferences(a,{diets:[],avoid:['soy'],hideUnsuitable:false});
    assert.equal((await f.service.requestAssistance(a,o.vendorId,o.id)).options.length,0);
    await f.product.preferences(a,{diets:[],avoid:[],hideUnsuitable:false});
    const option=(await f.service.requestAssistance(a,o.vendorId,o.id)).options[0]!;assert.ok(option);
    const p=await f.service.createProposal(a,o.vendorId,{orderId:o.id,itemId:option.itemId,slotId:option.slotId,reason:'Faster option'});
    await f.service.approveProposal(op,o.vendorId,p.id,{approve:true});
    const i=f.db.read().vendors['bowl-lab']!.items.find(i=>i.id===option.itemId)!;
    await f.service.updateItem(op,'bowl-lab',i.id,{...fields(i),foodInfo:food({ingredients:'Updated recipe contains milk',allergens:['milk']})});
    await assert.rejects(f.service.respondProposal(a,o.vendorId,p.id,{accept:true}),code('UNAVAILABLE_ALTERNATIVE'));
    assert.equal(f.db.read().vendors['bowl-lab']!.orders[0]!.lines[0]!.itemId,'chicken-rice');
});
test('earlier pickup rejects changed workload and leaves original reservations intact',async t=>{
    const f=await setup(t);const o=await f.order();const candidate=(await f.product.earlierOptions(a,o.vendorId,o.id)).slots[0]!;assert.ok(candidate);
    await f.store.transact(o.vendorId,s=>{s.items[0]!.prepUnits++;});
    const before=JSON.stringify(f.db.read().vendors[o.vendorId]!.slots);
    await assert.rejects(f.product.moveEarlier(a,{vendorId:o.vendorId,orderId:o.id,slotId:candidate.id}),code('MENU_CHANGED'));
    assert.equal(JSON.stringify(f.db.read().vendors[o.vendorId]!.slots),before);assert.equal((await f.product.earlierOptions(a,o.vendorId,o.id)).slots.length,0);
});
test('actual late Ready without an incident is not recorded as a student no-show',async t=>{
    const f=await setup(t);const o=await f.order();f.setNow(Date.parse(o.estimatedReadyAt)+10*60000);await f.ready(o.id);
    const ready=f.db.read().vendors[o.vendorId]!.orders[0]!;f.setNow(Date.parse(ready.collectionDueAt!)+1000);
    await f.product.closeUncollected(op,{orderId:o.id,reason:'Student did not collect after the kitchen was late'});
    assert.equal(f.db.read().vendors[o.vendorId]!.orders[0]!.noShowRecorded,false);
});
test('malformed recurrence override rejects the entire series with a warning',()=>{
    const r=parseCalendar(ics(event('UID:bad\r\nDTSTART:20261102T010000Z\r\nDTEND:20261102T020000Z\r\nSUMMARY:Bad override\r\nRRULE:FREQ=DAILY;COUNT=3')+'\r\n'+event('UID:bad\r\nRECURRENCE-ID:20261103T010000Z\r\nDTSTART:20261103T030000Z\r\nDTEND:20261103T020000Z')),CAL_NOW);
    assert.equal(r.events.length,0);assert.ok(r.warnings.some(w=>w.includes('duration')||w.includes('last')));
});
test('quoted UTC timezone recurrence has the correct weekdays',()=>{
    const r=parseCalendar(ics(event('UID:quoted\r\nDTSTART;TZID="UTC":20261102T230000\r\nDTEND;TZID="UTC":20261103T000000\r\nRRULE:FREQ=WEEKLY;COUNT=2;BYDAY=MO')),CAL_NOW);
    assert.deepEqual(r.events.map(e=>e.startAt),['2026-11-02T23:00:00.000Z','2026-11-09T23:00:00.000Z']);
});
