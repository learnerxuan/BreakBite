import test from 'node:test';
import { addLegacyTestKitchens } from './fixtures.js';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { LocalDatabase, LocalStore, accountActor } from '../src/server/local-database.js';
import { jsonFile, storedText, testDatabase } from './support/test-database.js';
import { Accounts } from '../src/server/accounts.js';
import { CheckoutService } from '../src/server/checkout.js';
import { MealService } from '../src/server/domain.js';
import { AppError } from '../src/server/errors.js';
import { createApp } from '../src/server/http.js';
import { settings } from '../src/server/config.js';
import type { Actor, BasketGroup, PickupPlan } from '../src/shared/model.js';
import { findTimetableBreaks, malaysiaDate, parseApspaceCalendar } from '../src/shared/timetable.js';
const alex: Actor = { id: 'local-alex', name: 'Alex', role: 'student' };
const sam: Actor = { id: 'local-sam', name: 'Sam', role: 'student' };
const bowl: Actor = { id: 'op-bowl', name: 'Bowl operator', role: 'vendor', vendorId: 'bowl-lab' };
const noodle: Actor = { id: 'op-noodle', name: 'Noodle operator', role: 'vendor', vendorId: 'noodle-co' };
const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;
async function fixture(t: test.TestContext) {
    const dir=await mkdtemp(path.join(os.tmpdir(),'breakbite-v2-')); const db=testDatabase(dir);await db.open();await addLegacyTestKitchens(db);
    t.after(async()=>{await db.close();await rm(dir,{recursive:true,force:true});});
    const store=new LocalStore(db); const service=new MealService(store,Date.now,'pay_at_pickup');const checkout=new CheckoutService(db);
    const groups: BasketGroup[]=[{vendorId:'bowl-lab',items:[{itemId:'chicken-rice',quantity:1}],slotId:db.read().vendors['bowl-lab']!.slots[0]!.id},{vendorId:'noodle-co',items:[{itemId:'lemon-water',quantity:1}],slotId:db.read().vendors['noodle-co']!.slots[1]!.id}];
    const plan: PickupPlan={mode:'pickup',budgetSen:50000};const payload={groups,plan,transferMinutes:2,expectedTotalSen:1250};
    return {dir,db,store,service,checkout,groups,plan,payload};
}
test('default configuration is real local accounts; public binding needs explicit setup',()=>{
    assert.equal(settings({}).mode,'local');
    assert.throws(()=>settings({HOST:'0.0.0.0'}),/HTTPS/);
    assert.equal(settings({HOST:'0.0.0.0',ALLOW_INSECURE_LAN:'true',ALLOWED_ORIGINS:'http://192.168.1.5:8080'}).host,'0.0.0.0');
});
test('ordinary pickup has no class requirement; quotes add the combined total',async t=>{
    const f=await fixture(t);const q=await f.checkout.quote(alex,{groups:f.groups,plan:f.plan});
    assert.equal(q.groups.length,2);assert.equal(q.totalSen,1250);assert.equal(q.reasons.length,0);assert.ok(q.groups.every(g=>g.slots.length));
});
test('an APSpace-derived gap preserves checkout deadlines, atomic retries and single-use pickup', async t => {
    const f = await fixture(t);
    const now = Date.now();
    const checkout = new CheckoutService(f.db, () => now);
    const asIcs = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');
    const event = (start: number, end: number) => ['BEGIN:VEVENT', 'SUMMARY:Synthetic class',
        `DTSTART:${asIcs(start)}`, `DTEND:${asIcs(end)}`, 'END:VEVENT'].join('\n');
    const date = malaysiaDate(new Date(now + 2 * 3600000).toISOString());
    const midnight = Date.parse(`${date}T00:00:00+08:00`);
    const firstEnd = Math.max(midnight + 60000, now - 60000);
    const next = Math.max(now + 2 * 3600000, midnight + 3600000);
    const input = ['BEGIN:VCALENDAR', 'VERSION:2.0', event(firstEnd - 3600000, firstEnd),
        event(next, next + 3600000), 'END:VCALENDAR'].join('\n');
    const { events } = parseApspaceCalendar(input);
    const [gap] = findTimetableBreaks(events, date, now);
    assert.ok(gap);
    const plan = { breakStartAt: gap.startAt, nextClassAt: gap.endAt, budgetSen: 2500,
        walkToMinutes: 0, eatMinutes: 5, returnMinutes: 2, bufferMinutes: 1 };
    const q = await checkout.quote(alex, { groups: f.groups, plan });
    const first = q.groups[0]!.slots[0]!;
    const second = q.groups[1]!.slots.find(s => Date.parse(s.startAt) >= Date.parse(first.startAt) + 3 * 60000)!;
    assert.ok(first && second);
    const payload = { ...f.payload, groups: f.groups.map((g, i) => ({ ...g, slotId: i === 0 ? first.id : second.id })), plan };
    const [c, retry] = await Promise.all([
        checkout.submit(alex, payload, 'apspace-checkout'),
        checkout.submit(alex, payload, 'apspace-checkout'),
    ]);
    assert.equal(c.orders.length, 2);
    assert.ok(c.orders.every(o => 'nextClassAt' in o.plan && o.plan.nextClassAt === gap.endAt && o.latestPickupAt < gap.endAt));
    assert.deepEqual(retry, c);
    assert.equal(checkout.lookup(sam, 'apspace-checkout'), null);
    const future = { ...payload, plan: { ...plan, nextClassAt: new Date(now + 86400001).toISOString() } };
    await assert.rejects(checkout.quote(alex, future), isCode('INVALID_PLAN'));
    await assert.rejects(checkout.submit(alex, future, 'apspace-outside-horizon'), isCode('INVALID_PLAN'));
    await f.store.transact('noodle-co', state => { state.items.find(i => i.id === 'lemon-water')!.stock = 0; });
    const before = f.db.read();
    await assert.rejects(checkout.submit(alex, payload, 'apspace-sold-out'), isCode('NO_AVAILABLE_SLOT'));
    assert.deepEqual(f.db.read(), before);

    const order = c.orders.find(o => o.vendorId === bowl.vendorId)!;
    await f.service.changeStatus(bowl, order.vendorId, order.id, { status: 'preparing' });
    await f.service.changeStatus(bowl, order.vendorId, order.id, { status: 'ready' });
    const handover = { code: order.pickupCode, paymentReceived: true };
    await f.service.collect(bowl, order.vendorId, order.id, handover);
    await assert.rejects(f.service.collect(bowl, order.vendorId, order.id, handover), isCode('NOT_READY'));
    assert.equal(checkout.lookup(alex, 'apspace-checkout')!.orders.find(o => o.vendorId === noodle.vendorId)!.status, 'confirmed');
});
test('one checkout creates two scoped child orders with independent codes',async t=>{
    const f=await fixture(t);const c=await f.checkout.submit(alex,f.payload,'checkout-one');
    assert.equal(c.orders.length,2);assert.ok(c.orders.every(o=>o.checkoutId===c.id));assert.notEqual(c.orders[0]!.pickupCode,c.orders[1]!.pickupCode);
    assert.ok(c.orders.every(o=>o.payment==='pay_at_pickup'&&o.paymentStatus==='unpaid'));
    assert.equal((await f.service.snapshot(bowl,'local')).orders.length,1);
    assert.equal((await f.service.snapshot(sam,'local')).orders.length,0);
    assert.ok(!(await f.service.snapshot(bowl,'local')).orders[0]!.pickupCode);
});
test('second kitchen failing rolls back the first kitchen, stock and idempotency record',async t=>{
    const f=await fixture(t);await f.store.transact('noodle-co',s=>{s.items.find(i=>i.id==='lemon-water')!.stock=0;});
    const before=f.db.read();await assert.rejects(f.checkout.submit(alex,f.payload,'rollback-basket'),isCode('NO_AVAILABLE_SLOT'));
    assert.deepEqual(f.db.read(),before);
});
test('multi-kitchen retries reuse the same child orders, even after the pickup time',async t=>{
    const f=await fixture(t);const first=await f.checkout.submit(alex,f.payload,'retry-key-123');
    const future=new CheckoutService(f.db,()=>Date.now()+86400000);const again=await future.submit(alex,f.payload,'retry-key-123');
    assert.deepEqual(again,first);assert.equal(f.db.read().vendors['bowl-lab']!.orders.length,1);
    assert.equal(f.checkout.lookup(alex,'retry-key-123')!.id,first.id);assert.equal(f.checkout.lookup(sam,'retry-key-123'),null);
});
test('idempotency rejects changes to the kitchen set or quantity',async t=>{
    const f=await fixture(t);await f.checkout.submit(alex,f.payload,'payload-key-123');
    await assert.rejects(f.checkout.submit(alex,{...f.payload,groups:[f.groups[0]]},'payload-key-123'),isCode('IDEMPOTENCY_CONFLICT'));
});
test('twenty concurrent multi-kitchen checkouts cannot oversell the last drink',async t=>{
    const f=await fixture(t);await f.store.transact('noodle-co',s=>{s.items.find(i=>i.id==='lemon-water')!.stock=1;});
    const result=await Promise.allSettled(Array.from({length:20},(_,i)=>f.checkout.submit({...alex,id:`student-${i}`},f.payload,`concurrent-${i}`)));
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(f.db.read().vendors['bowl-lab']!.orders.length,1);assert.equal(f.db.read().vendors['bowl-lab']!.items[0]!.stock,19);
});
test('aggregate budget is checked, not just one budget per kitchen',async t=>{
    const f=await fixture(t);const payload={...f.payload,plan:{mode:'pickup',budgetSen:1000}};
    assert.ok((await f.checkout.quote(alex,payload)).reasons.some(r=>r.includes('combined')));
    await assert.rejects(f.checkout.submit(alex,payload,'budget-key-123'),isCode('BUDGET_EXCEEDED'));
    assert.equal(f.db.read().vendors['bowl-lab']!.orders.length,0);
});
test('changed prices require a new review and do not create partial orders',async t=>{
    const f=await fixture(t);await f.store.transact('bowl-lab',s=>{s.items[0]!.priceSen+=50;});
    await assert.rejects(f.checkout.submit(alex,f.payload,'new-price-key'),isCode('PRICE_CHANGED'));
    assert.equal(f.db.read().vendors['noodle-co']!.orders.length,0);
});
test('overlapping pickup windows must allow time between counters',async t=>{
    const f=await fixture(t);f.groups[1]!.slotId=f.db.read().vendors['noodle-co']!.slots[0]!.id;
    await assert.rejects(f.checkout.submit(alex,f.payload,'overlap-key-123'),isCode('PICKUP_OVERLAP'));
});
test('cancelling one kitchen leaves the other order and reservation intact',async t=>{
    const f=await fixture(t);const c=await f.checkout.submit(alex,f.payload,'cancel-key-123');
    const o=c.orders.find(o=>o.vendorId==='bowl-lab')!;
    await f.service.cancel(alex,o.vendorId,o.id);
    assert.equal(f.db.read().vendors['bowl-lab']!.items[0]!.stock,20);
    assert.equal(f.db.read().vendors['noodle-co']!.orders[0]!.status,'confirmed');
    assert.equal(f.db.read().vendors['noodle-co']!.slots[1]!.reservedHandovers,1);
});
test('collection requires the code, payment confirmation and the correct operator',async t=>{
    const f=await fixture(t);const c=await f.checkout.submit(alex,f.payload,'collect-key-123');const o=c.orders[0]!;
    await assert.rejects(f.service.changeStatus(noodle,o.vendorId,o.id,{status:'preparing'}),isCode('FORBIDDEN'));
    await f.service.changeStatus(bowl,o.vendorId,o.id,{status:'preparing'});await f.service.changeStatus(bowl,o.vendorId,o.id,{status:'ready'});
    await assert.rejects(f.service.collect(bowl,o.vendorId,o.id,{code:o.pickupCode}),isCode('PAYMENT_REQUIRED'));
    await f.service.collect(bowl,o.vendorId,o.id,{code:o.pickupCode,paymentReceived:true});
    const saved=f.db.read().vendors['bowl-lab']!.orders[0]!;assert.equal(saved.status,'collected');assert.equal(saved.paymentStatus,'paid');assert.equal(saved.pickupCode,'');
    await assert.rejects(f.service.collect(bowl,o.vendorId,o.id,{code:o.pickupCode,paymentReceived:true}),isCode('NOT_READY'));
});
test('JSON checkout survives close/reopen and retains a previous snapshot',async t=>{
    const f=await fixture(t);const c=await f.checkout.submit(alex,f.payload,'restart-key-123');await f.db.close();
    const reopened=testDatabase(f.dir);await reopened.open();
    try{assert.equal(new CheckoutService(reopened).lookup(alex,'restart-key-123')!.id,c.id);if(jsonFile)assert.ok(JSON.parse(await readFile(path.join(f.dir,'database.previous.json'),'utf8')).schemaVersion===2);}
    finally{await reopened.close();}
});
test('JSON storage refuses a second writer',{skip:!jsonFile&&'JSON-file lock only; Firestore allows several processes'},async t=>{
    const f=await fixture(t);await assert.rejects(new LocalDatabase(f.dir).open(),isCode('STORE_LOCKED'));
});
test('corrupt JSON is not silently reseeded or replaced',{skip:!jsonFile&&'JSON-file handling only'},async t=>{
    const f=await fixture(t);await f.db.close();await writeFile(path.join(f.dir,'database.json'),'{broken');
    await assert.rejects(new LocalDatabase(f.dir).open());assert.equal(await readFile(path.join(f.dir,'database.json'),'utf8'),'{broken');
});
test('registration hashes passwords and does not accept self-assigned vendor roles',async t=>{
    const f=await fixture(t);const accounts=new Accounts(f.db);const a=await accounts.register({name:'Student A',email:'A@Example.test',password:'A-strong-password-123'});
    assert.equal(a.role,'student');assert.equal(a.email,'a@example.test');
    assert.ok(!(await storedText(f.db)).includes('A-strong-password-123'));
    await assert.rejects(accounts.register({name:'Attacker',email:'x@example.test',password:'A-strong-password-123',role:'vendor'}),isCode('INVALID_ROLE'));
    await assert.rejects(accounts.register({name:'Student A',email:'a@example.test',password:'A-strong-password-123'}),isCode('EMAIL_EXISTS'));
});
test('bad login attempts lock an account; password reset restores access',async t=>{
    const f=await fixture(t);const accounts=new Accounts(f.db);await accounts.register({name:'Student A',email:'a@example.test',password:'A-strong-password-123'});
    for(let i=0;i<5;i++)await assert.rejects(accounts.login({email:'a@example.test',password:'wrong'}),isCode('BAD_LOGIN'));
    await assert.rejects(accounts.login({email:'a@example.test',password:'A-strong-password-123'}),isCode('BAD_LOGIN'));
    await accounts.resetPassword('a@example.test','New-strong-password-456');
    assert.equal((await accounts.login({email:'a@example.test',password:'New-strong-password-456'})).role,'student');
});
test('operators can create/edit a menu but cannot edit another kitchen',async t=>{
    const f=await fixture(t);const fields={name:'New lime drink',description:'Made fresh at the counter.',category:'Drinks',art:'drink',priceSen:450,stock:10,prepMinutes:1,prepUnits:1,enabled:true};
    const item=await f.service.addItem(bowl,'bowl-lab',fields);
    await f.service.updateItem(bowl,'bowl-lab',item.id,{...fields,priceSen:500});
    assert.equal(f.db.read().vendors['bowl-lab']!.items.find(i=>i.id===item.id)!.priceSen,500);
    await assert.rejects(f.service.addItem(noodle,'bowl-lab',fields),isCode('FORBIDDEN'));
});
test('pickup-first recovery can propose a later meal but cannot change the order without consent',async t=>{
    const f=await fixture(t);const c=await f.checkout.submit(alex,f.payload,'rescue-key-123');const o=c.orders[0]!;
    await f.service.reportIncident(bowl,'bowl-lab',{itemIds:['chicken-rice'],reason:'Rice preparation delayed',delayMinutes:20});
    const option=(await f.service.evaluateRecovery(bowl,'bowl-lab',o.id)).options[0]!;assert.ok(option);
    const proposal=await f.service.createProposal(bowl,'bowl-lab',{orderId:o.id,itemId:option.itemId,slotId:option.slotId,reason:'An available alternative'});
    await assert.rejects(f.service.respondProposal(alex,'bowl-lab',proposal.id,{accept:true}),isCode('APPROVAL_REQUIRED'));
    await f.service.approveProposal(bowl,'bowl-lab',proposal.id,{approve:true});await f.service.respondProposal(alex,'bowl-lab',proposal.id,{accept:true});
    const updated=f.db.read().vendors['bowl-lab']!.orders[0]!;assert.equal(updated.latestPickupAt,option.readyAt);assert.notEqual(updated.pickupCode,o.pickupCode);
    assert.equal(f.db.read().vendors['noodle-co']!.orders[0]!.lines[0]!.itemId,'lemon-water');
});
async function httpFixture(t:test.TestContext){
    const f=await fixture(t);const config=settings({DATA_DIR:f.dir});const app=createApp(config,f.service,f.db);app.listen(0,'127.0.0.1');await once(app,'listening');
    const origin=`http://127.0.0.1:${(app.address() as AddressInfo).port}`;config.allowedOrigins=[origin];
    t.after(()=>new Promise<void>(resolve=>{app.closeAllConnections();app.close(()=>resolve());}));
    let cookie='';let csrf='';
    const request=async(p:string,method='GET',data?:unknown,extra:Record<string,string>={})=>{
        const r=await fetch(origin+p,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(data!==undefined?{body:JSON.stringify(data)}:{})});
        const json=await r.json();if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0]!;if(json.csrfToken)csrf=json.csrfToken;
        return {status:r.status,data:json,headers:r.headers};
    };
    return {...f,request,origin,app,cookie:()=>cookie};
}
test('HTTP local mode exposes a browsable catalog but no account switcher or demo login',async t=>{
    const f=await httpFixture(t);const c=await f.request('/api/config');assert.equal(c.data.mode,'local');assert.deepEqual(c.data.demoIdentities,[]);
    const catalog=await f.request('/api/catalog');assert.equal(catalog.data.items.length,55);
    const locations=Object.fromEntries(catalog.data.vendors.map((vendor:{id:string;location:string})=>[vendor.id,vendor.location]));
    assert.equal(locations['asian-cuisine'],'Cafeteria (Level 3)');assert.equal(locations.nelson,'Atrium (Level 3)');assert.equal(locations.subway,'Above Centre Point (Level 5)');assert.equal(locations.bobanika,'Above Centre Point (Level 5)');
    const sample=f.db.read().vendors['asian-cuisine']!.items[0]!;assert.match(sample.photoPath!,/^\/images\/menu\/[a-z0-9-]+\.jpg$/);assert.match(sample.photoCredit!,/AI-generated illustrative sample/);
    assert.equal((await f.request('/api/state')).status,401);
    assert.equal((await f.request('/api/demo/login','POST',{id:'student-alex'})).status,404);
});
test('HTTP cookie sessions are HttpOnly, CSRF-protected, persistent and revocable',async t=>{
    const f=await httpFixture(t);const reg=await f.request('/api/auth/register','POST',{name:'Browser student',email:'browser@example.test',password:'Browser-password-123'});
    assert.equal(reg.status,200);assert.match(reg.headers.get('set-cookie')!,/HttpOnly/);assert.match(reg.headers.get('set-cookie')!,/SameSite=Strict/);
    assert.equal((await f.request('/api/session')).data.actor.role,'student');
    assert.equal((await f.request('/api/checkout/quote','POST',f.payload,{'X-CSRF-Token':'wrong'})).status,403);
    const quote=await f.request('/api/checkout/quote','POST',f.payload);assert.equal(quote.status,200);
    const created=await f.request('/api/checkouts','POST',f.payload,{'Idempotency-Key':'http-checkout-123'});assert.equal(created.status,201);assert.equal(created.data.orders.length,2);
    assert.equal((await f.request('/api/checkouts/http-checkout-123')).data.checkout.id,created.data.id);
    const oldCookie=f.cookie();await f.request('/api/auth/logout','POST',{});assert.equal((await f.request('/api/session','GET',undefined,{Cookie:oldCookie})).status,401);
});
test('HTTP rejects cross-site writes, legacy bypass routes and cross-kitchen changes',async t=>{
    const f=await httpFixture(t);await f.request('/api/auth/register','POST',{name:'Browser student',email:'b@example.test',password:'Browser-password-123'});
    assert.equal((await f.request('/api/checkouts','POST',f.payload,{Origin:'https://evil.invalid'})).status,403);
    assert.equal((await f.request('/api/orders','POST',{})).status,409);
    assert.equal((await f.request('/api/vendors/bowl-lab/open','PATCH',{open:false})).status,403);
});
test('session data persists across database reopen; plaintext tokens are not stored',async t=>{
    const f=await httpFixture(t);const reg=await f.request('/api/auth/register','POST',{name:'Persistent student',email:'p@example.test',password:'Persistent-password-123'});
    const token=f.cookie().split('=')[1]!;assert.ok(!(await storedText(f.db)).includes(token));
    await f.db.close();const db=testDatabase(f.dir);await db.open();
    try{const accounts=new Accounts(db);const req={method:'GET',headers:{cookie:f.cookie()}} as import('node:http').IncomingMessage;assert.equal(accounts.session(req).actor.id,reg.data.actor.id);}
    finally{await db.close();}
});
test('privileged account provisioning does not rely on a shared password or browser role selection',async t=>{
    const f=await fixture(t);const accounts=new Accounts(f.db);const operator=await accounts.create({name:'Operator',email:'op@example.test',password:'Operator-password-123',role:'vendor',vendorId:'bowl-lab'});
    assert.equal(accountActor(operator).vendorId,'bowl-lab');assert.notEqual(operator.passwordHash,'Operator-password-123');
});
test('a replacement cannot silently conflict with another active kitchen pickup',async t=>{
    const f=await fixture(t);const c=await f.checkout.submit(alex,f.payload,'route-rescue-123');const o=c.orders[0]!;
    await f.service.reportIncident(bowl,'bowl-lab',{itemIds:['chicken-rice'],reason:'Rice delayed',delayMinutes:20});
    const sibling=f.db.read().vendors['noodle-co']!.slots[1]!;
    const option=(await f.service.evaluateRecovery(bowl,'bowl-lab',o.id)).options.find(option=>f.db.read().vendors['bowl-lab']!.slots.find(w=>w.id===option.slotId)?.startAt===sibling.startAt)!;
    assert.ok(option);
    const p=await f.service.createProposal(bowl,'bowl-lab',{orderId:o.id,itemId:option.itemId,slotId:option.slotId});await f.service.approveProposal(bowl,'bowl-lab',p.id,{approve:true});
    const before=f.db.read();await assert.rejects(f.service.respondProposal(alex,'bowl-lab',p.id,{accept:true}),isCode('PICKUP_OVERLAP'));assert.deepEqual(f.db.read(),before);
});

test('HTTP product profile, favourites and timetable require owned sessions and CSRF',async t=>{
    const f=await httpFixture(t);
    assert.equal((await f.request('/api/product/profile')).status,401);
    await f.request('/api/auth/register','POST',{name:'Profile owner',email:'profile@example.test',password:'Profile-password-123'});
    assert.equal((await f.request('/api/product/favourite','POST',{itemId:'chicken-rice',saved:true},{'X-CSRF-Token':'invalid'})).status,403);
    assert.equal((await f.request('/api/product/favourite','POST',{itemId:'chicken-rice',saved:true})).status,200);
    assert.deepEqual((await f.request('/api/product/profile')).data.profile.favourites,['chicken-rice']);
    assert.equal((await f.request('/api/product/timetable/manual','POST',{title:'Future class',location:'Room',startAt:new Date(Date.now()+3600000).toISOString(),endAt:new Date(Date.now()+7200000).toISOString(),weeks:1})).status,200);
    assert.equal((await f.request('/api/product/profile')).data.profile.classes.length,1);
    await f.request('/api/auth/logout','POST',{});
    await f.request('/api/auth/register','POST',{name:'Other profile',email:'otherprofile@example.test',password:'Profile-password-123'});
    const other=await f.request('/api/product/profile');assert.equal(other.data.profile.favourites.length,0);assert.equal(other.data.profile.classes.length,0);
});
test('HTTP student QR stays private and camera policy permits same-origin access only',async t=>{
    const f=await httpFixture(t);await f.request('/api/auth/register','POST',{name:'QR owner',email:'qr@example.test',password:'Profile-password-123'});
    const created=await f.request('/api/checkouts','POST',f.payload,{'Idempotency-Key':'http-qr-checkout'});const o=created.data.orders[0];
    const qr=await f.request('/api/product/pickup/qr','POST',{vendorId:o.vendorId,orderId:o.id});assert.equal(qr.status,200);assert.match(qr.data.payload,/^BB1:/);
    assert.equal((await f.request('/api/product/pickup/resolve','POST',{payload:qr.data.payload})).status,403);
    assert.match(qr.headers.get('permissions-policy')!,/camera=\(self\)/);
    assert.ok(!JSON.stringify((await f.request('/api/state')).data).includes('qrToken'));
    await f.request('/api/auth/logout','POST',{});await f.request('/api/auth/register','POST',{name:'QR stranger',email:'qrstranger@example.test',password:'Profile-password-123'});
    assert.equal((await f.request('/api/product/pickup/qr','POST',{vendorId:o.vendorId,orderId:o.id})).status,404);
});
