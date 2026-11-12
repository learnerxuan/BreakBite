import test from 'node:test';
import { addLegacyTestKitchens } from './fixtures.js';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, copyFile } from 'node:fs/promises';
import { createECDH, createPublicKey, verify, createDecipheriv, hkdfSync } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { LocalStore, accountActor } from '../src/server/local-database.js';
import { testDatabase } from './support/test-database.js';
import { Accounts } from '../src/server/accounts.js';
import { CheckoutService } from '../src/server/checkout.js';
import { MealService } from '../src/server/domain.js';
import { ProductService } from '../src/server/product.js';
import { PushService, pushDigest } from '../src/server/push.js';
import { endpointOf, subscriptionOf, encryptPush, generatePushKeys, vapidAuthorization, validatePushKeys, transport, type PushResponse } from '../src/server/web-push.js';
import { createApp } from '../src/server/http.js';
import { settings } from '../src/server/config.js';
import { AppError } from '../src/server/errors.js';
import type { Actor } from '../src/shared/model.js';

test('generated VAPID keys retain the leading zero bytes of a P-256 scalar', t => {
    const curve = createECDH('prime256v1');
    const scalar = Buffer.alloc(32);
    scalar[31] = 1;
    curve.setPrivateKey(scalar);
    t.mock.method(Object.getPrototypeOf(curve), 'generateKeys', function (this: typeof curve) {
        this.setPrivateKey(scalar);
        return this.getPublicKey();
    });
    const keys = generatePushKeys('mailto:operator@example.test');
    assert.deepEqual(Buffer.from(keys.privateKey, 'base64url'), scalar);
    assert.equal(keys.publicKey, curve.getPublicKey().toString('base64url'));
});

const op: Actor = { id:'op',name:'Kitchen',role:'vendor',vendorId:'bowl-lab' };
const rejected = (code:string)=>(e:unknown)=>e instanceof AppError && e.code===code;
function subscription(suffix='device') { const e=createECDH('prime256v1');e.generateKeys();return { endpoint:`https://fcm.googleapis.com/fcm/send/${suffix}`,keys:{p256dh:e.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,23).toString('base64url')},privateKey:e.getPrivateKey() }; }
async function fixture(t:test.TestContext) {
    const dir=await mkdtemp(path.join(os.tmpdir(),'bb-push-'));const db=testDatabase(dir);await db.open();await addLegacyTestKitchens(db);
    let now=Date.now();const clock=()=>now;const accountService=new Accounts(db,false,clock);
    const account=await accountService.register({name:'Push Student',email:'push@example.test',password:'Fixture-long-password'});const actor=accountActor(account);
    const keys=generatePushKeys('mailto:operator@example.test');const sent:{payload:string;endpoint:string;ttl:number}[]=[];
    let response:PushResponse={status:201};const sender=async(sub:{endpoint:string},payload:string,ttl:number)=>{sent.push({payload,endpoint:sub.endpoint,ttl});return response;};
    const push=new PushService(db,keys,sender,clock);const product=new ProductService(db,clock);const meals=new MealService(new LocalStore(db),clock,'pay_at_pickup');const checkout=new CheckoutService(db,clock);
    const sub=subscription();
    const register=()=>push.subscribe(actor,{subscription:sub,label:'Test browser'},'session-one');
    const order=async()=>{const d=db.read();return (await checkout.submit(actor,{plan:{mode:'pickup',budgetSen:50000},groups:[{vendorId:'bowl-lab',items:[{itemId:'chicken-rice',quantity:1}],slotId:d.vendors['bowl-lab']!.slots[4]!.id}],transferMinutes:2,expectedTotalSen:950},'push-test-order')).orders[0]!;};
    const ready=async()=>{const o=await order();await meals.changeStatus(op,'bowl-lab',o.id,{status:'preparing'});await meals.changeStatus(op,'bowl-lab',o.id,{status:'ready'});await product.tick();return o;};
    t.after(async()=>{await push.settle();await db.close();await rm(dir,{recursive:true,force:true});});
    return {dir,db,actor,account,accountService,keys,push,product,meals,checkout,sub,register,ready,order,sent,clock,advance:(n:number)=>{now+=n;},respond:(r:PushResponse)=>{response=r;},sender};
}
test('RFC 8291 published encryption vector matches byte-for-byte',()=>{
    const ua='BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
    const encrypted=encryptPush({endpoint:'https://fcm.googleapis.com/fcm/send/vector',keys:{p256dh:ua,auth:'BTBZMqHH6r4Tts7J_aSIgg'}},Buffer.from('When I grow up, I want to be a watermelon'),{privateKey:Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw','base64url'),salt:Buffer.from('DGv6ra1nlYgDCS1FRnbzlw','base64url')});
    assert.equal(encrypted.toString('base64url'),'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});
test('VAPID audience, expiry and P1363 signature verify independently',()=>{
    const keys=generatePushKeys('mailto:admin@example.test');const value=vapidAuthorization('https://fcm.googleapis.com/fcm/send/a',keys,1000000000000);const jwt=value.split('t=')[1]!.split(',')[0]!;
    const [header,claims,sig]=jwt.split('.');const p=JSON.parse(Buffer.from(claims!,'base64url').toString());assert.equal(p.aud,'https://fcm.googleapis.com');assert.equal(p.exp,1000000000+3600);
    const raw=Buffer.from(keys.publicKey,'base64url');const pub=createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:raw.subarray(1,33).toString('base64url'),y:raw.subarray(33).toString('base64url')}});
    assert.ok(verify('sha256',Buffer.from(`${header}.${claims}`),{key:pub,dsaEncoding:'ieee-p1363'},Buffer.from(sig!,'base64url')));
    assert.throws(()=>validatePushKeys({...keys,privateKey:generatePushKeys(keys.subject).privateKey}));
});
test('push subscriptions reject SSRF destinations, URL credentials, ports and invalid EC points',()=>{
    for(const endpoint of ['http://fcm.googleapis.com/fcm/send/x','https://127.0.0.1/push','https://169.254.169.254/push','https://fcm.googleapis.com.evil.test/push','https://evil.test/push','https://u:p@fcm.googleapis.com/push','https://fcm.googleapis.com:444/push','https://fcm.googleapis.com/push#frag'])assert.throws(()=>endpointOf(endpoint));
    const s=subscription();assert.deepEqual(subscriptionOf(s),{endpoint:s.endpoint,keys:s.keys});assert.throws(()=>subscriptionOf({...s,keys:{...s.keys,p256dh:Buffer.alloc(65,4).toString('base64url')}}));
    assert.ok(endpointOf('https://web.push.apple.com/Q123'));assert.ok(endpointOf('https://updates.push.services.mozilla.com/wpush/v2/123'));
});
test('native transport encrypts, signs, caps TTL, sets timeout and rejects redirects',async t=>{
    const sub=subscription(),keys=generatePushKeys('mailto:admin@example.test');let options:RequestInit|undefined;
    t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{options=init;return new Response(null,{status:201});});
    assert.equal((await transport(keys)(sub,'{"title":"Test"}',99999,'a'.repeat(32))).status,201);
    assert.equal(options!.redirect,'error');assert.ok(options!.signal);const headers=options!.headers as Record<string,string>;assert.equal(headers.TTL,'900');assert.equal(headers['Content-Encoding'],'aes128gcm');assert.ok(headers.Authorization!.startsWith('vapid '));
    // Decrypt with receiver private key to verify salt/key layout and payload interoperability.
    const encrypted=Buffer.from(options!.body as Uint8Array);const sender=encrypted.subarray(21,86),salt=encrypted.subarray(0,16);const ec=createECDH('prime256v1');ec.setPrivateKey(sub.privateKey);
    const ikm=Buffer.from(hkdfSync('sha256',ec.computeSecret(sender),Buffer.from(sub.keys.auth,'base64url'),Buffer.concat([Buffer.from('WebPush: info\0'),ec.getPublicKey(),sender]),32));
    const cek=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16));const nonce=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12));const dec=createDecipheriv('aes-128-gcm',cek,nonce);dec.setAuthTag(encrypted.subarray(-16));assert.equal(Buffer.concat([dec.update(encrypted.subarray(86,-16)),dec.final()]).toString(),'{"title":"Test"}\x02');
});
test('subscription requires student, configuration, ownership; responses contain no private endpoints',async t=>{
    const f=await fixture(t);await assert.rejects(new PushService(f.db).subscribe(f.actor,{subscription:f.sub},'x'),rejected('PUSH_NOT_CONFIGURED'));
    await assert.rejects(f.push.subscribe(op,{subscription:f.sub},'x'),rejected('FORBIDDEN'));const {id}=await f.register();
    await assert.rejects(f.push.subscribe({...f.actor,id:'other'},{subscription:f.sub},'x'),rejected('PUSH_DEVICE_IN_USE'));
    await assert.rejects(f.push.unsubscribe({...f.actor,id:'other'},{id}),rejected('NOT_FOUND'));
    const output=JSON.stringify(f.push.status(f.actor));assert.ok(!output.includes(f.sub.endpoint)&&!output.includes(f.sub.keys.auth)&&!output.includes(f.keys.privateKey));
});
test('server sends Ready notice without a browser polling, and suppresses duplicate pump deliveries',async t=>{
    const f=await fixture(t);await f.register();f.advance(1);const order=await f.ready();await Promise.all([f.push.pump(),f.push.pump()]);await f.push.pump();assert.equal(f.sent.length,1);const p=JSON.parse(f.sent[0]!.payload);
    assert.equal(p.title,'Your pickup is ready');assert.ok(!f.sent[0]!.payload.includes(order.pickupCode!));assert.ok(!f.sent[0]!.payload.includes(f.actor.name));assert.equal(p.url,'/?view=inbox');
});
test('enabling notifications never dumps the existing inbox to a new device',async t=>{
    const f=await fixture(t);await f.ready();await f.register();await f.push.pump();assert.equal(f.sent.length,0);
});
test('unsubscribed and other-student notices are not delivered',async t=>{
    const f=await fixture(t);const {id}=await f.register();f.advance(1);await f.ready();await f.push.unsubscribe(f.actor,{id});await f.push.pump();assert.equal(f.sent.length,0);assert.equal(Object.keys(f.db.read().pushDevices!).length,0);
});
test('delivery retries persist across restart and honor Retry-After',async t=>{
    const f=await fixture(t);await f.register();f.advance(1);await f.ready();f.respond({status:429,retryAfter:'120'});await f.push.pump();assert.equal(f.sent.length,1);await f.db.close();await f.db.open();
    const restarted=new PushService(f.db,f.keys,f.sender,f.clock);f.advance(119000);await restarted.pump();assert.equal(f.sent.length,1);f.respond({status:201});f.advance(1001);await restarted.pump();assert.equal(f.sent.length,2);await restarted.pump();assert.equal(f.sent.length,2);
});
test('expired endpoint is removed after 410, including pending jobs',async t=>{
    const f=await fixture(t);await f.register();f.advance(1);await f.ready();f.respond({status:410});await f.push.pump();assert.equal(f.push.status(f.actor).devices.length,0);assert.equal(Object.keys(f.db.read().pushJobs!).length,0);
});
test('permanent errors do not loop forever and remain visible as sanitized status',async t=>{
    const f=await fixture(t);await f.register();f.advance(1);await f.ready();f.respond({status:403});await f.push.pump();f.advance(60000);await f.push.pump();assert.equal(f.sent.length,1);assert.match(f.push.status(f.actor).devices[0]!.lastError!,/403/);
});
test('read notices, collected orders and stale pending reminders are not sent',async t=>{
    const f=await fixture(t);await f.register();f.advance(1);const o=await f.ready();await f.product.markRead(f.actor);await f.push.pump();assert.equal(f.sent.length,0);
    await f.db.transaction(d=>{d.notices![0]!.readAt=undefined;d.vendors['bowl-lab']!.orders.find(x=>x.id===o.id)!.status='collected';});await f.push.pump();assert.equal(f.sent.length,0);
});
test('test notifications are owned, rate-limited and separate from order updates',async t=>{
    const f=await fixture(t);const {id}=await f.register();await f.push.test(f.actor,{id});await assert.rejects(f.push.test(f.actor,{id}),rejected('PUSH_COOLDOWN'));await f.push.pump();assert.equal(JSON.parse(f.sent[0]!.payload).title,'BreakBite test notification');
});
test('revoked browser subscriptions disappear on logout; password reset removes all account devices',async t=>{
    const f=await fixture(t);let cookie='';const res={setHeader:(_k:string,v:string)=>{cookie=v;}} as unknown as ServerResponse;const session=await f.accountService.start(f.account,res);const req={headers:{cookie:cookie.split(';')[0]}} as IncomingMessage;
    await f.push.subscribe(f.actor,{subscription:f.sub},pushDigest(session.csrfToken));await f.push.subscribe(f.actor,{subscription:subscription('second')},'other-session');await f.accountService.logout(req,res);assert.equal(f.push.status(f.actor).devices.length,1);
    await f.accountService.resetPassword(f.account.email,'Another-long-test-password');assert.equal(f.push.status(f.actor).devices.length,0);
});
test('expired consent/key rotation removes devices and cannot silently resubscribe',async t=>{
    const f=await fixture(t);await f.register();f.advance(31*86400000);await f.push.pump();assert.equal(f.push.status(f.actor).devices.length,0);
    await f.register();const rotated=new PushService(f.db,generatePushKeys('mailto:admin@example.test'),f.sender,f.clock);await rotated.pump();assert.equal(Object.keys(f.db.read().pushDevices!).length,0);
});
test('lease from an interrupted send is retried, and stable tag coalesces uncertain duplicate delivery',async t=>{
    const f=await fixture(t);await f.register();f.advance(1);await f.ready();f.respond({status:503});await f.push.pump();const first=JSON.parse(f.sent[0]!.payload);await f.db.transaction(d=>{const j=Object.values(d.pushJobs!)[0]!;j.status='sending';j.nextAt=f.clock()+60000;});f.advance(60001);f.respond({status:201});await f.push.pump();assert.equal(JSON.parse(f.sent[1]!.payload).tag,first.tag);
});
test('HTTP push endpoints enforce session and CSRF, serve SW correctly and expose no private key',async t=>{
    const f=await fixture(t);const config=settings({PORT:'8080'});const server=createApp(config,f.meals,f.db,f.push);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;config.allowedOrigins=[base];t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
    const publicResult=await (await fetch(base+'/api/push/config')).json() as {publicKey:string};assert.equal(publicResult.publicKey,f.keys.publicKey);assert.ok(!JSON.stringify(publicResult).includes(f.keys.privateKey));
    assert.equal((await fetch(base+'/api/push/status')).status,401);
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({email:f.account.email,password:'Fixture-long-password'})});const cookie=login.headers.get('set-cookie')!.split(';')[0]!;const {csrfToken}=await login.json() as {csrfToken:string};
    assert.equal((await fetch(base+'/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:base},body:JSON.stringify({subscription:f.sub})})).status,403);
    assert.equal((await fetch(base+'/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:base,'X-CSRF-Token':csrfToken},body:JSON.stringify({subscription:f.sub})})).status,200);
    const deviceId=f.push.status(f.actor).devices[0]!.id;
    const testResponse=await fetch(base+'/api/push/test',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:base,'X-CSRF-Token':csrfToken},body:JSON.stringify({id:deviceId})});
    assert.equal(testResponse.status,200);assert.equal(f.sent.length,1,'Test delivery must be attempted before the response; serverless has no timer');
    await mkdir('dist-tests/src/public',{recursive:true});await copyFile('public/sw.js','dist-tests/src/public/sw.js');
    const worker=await fetch(base+'/sw.js');assert.equal(worker.status,200);assert.match(worker.headers.get('content-type')!,/javascript/);assert.equal(worker.headers.get('service-worker-allowed'),'/');assert.match(worker.headers.get('cache-control')!,/no-cache/);
});
test('worker handles real push event with page closed, and click can only open same-origin Inbox',async()=>{
    const source=await readFile('public/sw.js','utf8');const events:Record<string,(event:unknown)=>void>={};const shown:{title:string;options:Record<string,unknown>}[]=[];const opened:string[]=[];let pending:Promise<unknown>=Promise.resolve();
    const self={addEventListener:(n:string,fn:(e:unknown)=>void)=>events[n]=fn,registration:{showNotification:async(title:string,options:Record<string,unknown>)=>{shown.push({title,options});}},location:{origin:'https://breakbite.example'},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async(url:string)=>{opened.push(url);}},skipWaiting:async()=>{}};
    vm.runInNewContext(source,{self,URL,Date});events.push!({data:{json:()=>({title:'Ready',body:'Open Inbox',expiresAt:Date.now()+5000,tag:'bb-'+'a'.repeat(32),url:'https://evil.test'})},waitUntil:(p:Promise<unknown>)=>pending=p});await pending;assert.equal(shown[0]!.title,'Ready');
    events.notificationclick!({notification:{close:()=>{},data:{url:'https://evil.test'}},waitUntil:(p:Promise<unknown>)=>pending=p});await pending;assert.deepEqual(opened,['https://breakbite.example/?view=inbox']);
    events.push!({data:{json:()=>({title:'Stale Ready',expiresAt:0})},waitUntil:(p:Promise<unknown>)=>pending=p});await pending;assert.equal(shown[1]!.title,'BreakBite update');
});
async function browserFixture() {
    const { webcrypto, createHash } = await import('node:crypto');
    const pub=generatePushKeys('mailto:admin@example.test').publicKey;let browserSub: Record<string,unknown>|null=null;let devices:Record<string,unknown>[]=[];const calls:string[]=[];let fail=false, failStatus=false;
    const subscriptionInput=subscription();const id=createHash('sha256').update(subscriptionInput.endpoint).digest('hex');
    const reg={pushManager:{getSubscription:async()=>browserSub,subscribe:async(options:{applicationServerKey:Uint8Array})=>{calls.push('browser-subscribe');browserSub={endpoint:subscriptionInput.endpoint,options:{applicationServerKey:options.applicationServerKey.buffer},toJSON:()=>subscriptionInput,unsubscribe:async()=>{calls.push('browser-unsubscribe');browserSub=null;return true;}};return browserSub;}},getNotifications:async()=>[]};
    const notifications={permission:'default',requestPermission:async()=>{calls.push('permission');notifications.permission='granted';return 'granted';}};
    const navigator={userAgent:'Android Test Browser',platform:'Linux',maxTouchPoints:1,serviceWorker:{getRegistration:async()=>reg,register:async()=>{calls.push('register');return reg;},ready:Promise.resolve(reg)}};
    const api=async(route:string,_method?:string,input?:Record<string,unknown>)=>{
        calls.push(route);
        if(route==='/api/push/config')return {configured:true,publicKey:pub};
        if(route==='/api/push/status'){if(failStatus)throw new Error('Status unavailable');return {configured:true,publicKey:pub,devices:structuredClone(devices)};}
        if(route==='/api/push/subscribe'){if(fail)throw new Error('Server unavailable');devices=[{id,label:input?.label,expiresAt:Date.now()+86400000}];return {id};}
        if(route==='/api/push/unsubscribe'){devices=[];return {ok:true};}
        return {queued:true};
    };
    const source=(await readFile('dist-tests/src/web/push-client.js','utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
    const sandbox:Record<string,unknown>={api,esc:(s:unknown)=>String(s??''),isSecureContext:true,window:{Notification:notifications,PushManager:{}},Notification:notifications,navigator,matchMedia:()=>({matches:false}),crypto:webcrypto,TextEncoder,Uint8Array,ArrayBuffer,atob,Date,setTimeout,clearTimeout,console};
    vm.runInNewContext(source+'\nglobalThis.functions={refreshPush,pushAction,pushPanel,detachPush};',sandbox);
    type Client={refreshPush:(a:Actor|null)=>Promise<void>;pushAction:(action:string,id:string|undefined,a:Actor|null)=>Promise<string>;pushPanel:()=>string;detachPush:()=>Promise<void>};
    return {client:sandbox.functions as Client,calls,notifications,sandbox,id,fail:()=>{fail=true;},failStatus:(value:boolean)=>{failStatus=value;},hasSub:()=>!!browserSub};
}
test('browser flow asks permission only on click and confirms server registration before enabled state',async()=>{
    const f=await browserFixture();const actor:Actor={id:'a',name:'Student',role:'student'};
    await f.client.refreshPush(actor);assert.ok(!f.calls.includes('permission'));assert.match(f.client.pushPanel(),/Get updates after/);
    const start=f.calls.length;await f.client.pushAction('push-enable',undefined,actor);assert.equal(f.calls[start],'permission');assert.ok(f.calls.includes('browser-subscribe'));assert.match(f.client.pushPanel(),/Push enabled on this browser/);
    await f.client.pushAction('push-test',undefined,actor);assert.ok(f.calls.includes('/api/push/test'));
    await f.client.pushAction('push-disable',f.id,actor);assert.equal(f.hasSub(),false);assert.doesNotMatch(f.client.pushPanel(),/Push enabled on this browser/);
});
test('browser subscription is rolled back if saving it fails; no false enabled confirmation',async()=>{
    const f=await browserFixture();const actor:Actor={id:'a',name:'Student',role:'student'};await f.client.refreshPush(actor);f.fail();await assert.rejects(f.client.pushAction('push-enable',undefined,actor),/unavailable/);assert.equal(f.hasSub(),false);assert.ok(f.calls.includes('browser-unsubscribe'));
});
test('insecure and denied browser states explain why push cannot be enabled',async()=>{
    const f=await browserFixture();await f.client.refreshPush({id:'a',name:'Student',role:'student'});f.sandbox.isSecureContext=false;assert.match(f.client.pushPanel(),/HTTPS version/);f.sandbox.isSecureContext=true;f.notifications.permission='denied';assert.match(f.client.pushPanel(),/blocked for this site/);
});
test('failed settings refresh never announces success and a successful guest refresh clears the error',async()=>{
    const f=await browserFixture();const actor:Actor={id:'a',name:'Student',role:'student'};
    await f.client.refreshPush(actor);f.failStatus(true);
    await assert.rejects(f.client.pushAction('push-refresh',undefined,actor),/Could not load/);
    assert.match(f.client.pushPanel(),/Could not load/);
    await f.client.refreshPush(null);
    assert.doesNotMatch(f.client.pushPanel(),/Could not load/);
});
test('phone HTTP uses public configuration and explains HTTPS instead of a failed authenticated refresh',async()=>{
    const f=await browserFixture();f.sandbox.isSecureContext=false;
    await f.client.refreshPush({id:'a',name:'Student',role:'student'});
    assert.ok(!f.calls.includes('/api/push/status'));
    assert.match(f.client.pushPanel(),/HTTPS version/);
    assert.doesNotMatch(f.client.pushPanel(),/Could not load/);
});
