import type { AppConfig, BasketGroup, BasketQuote, CheckoutResult, MenuItem, RecoveryOption, Snapshot, Vendor } from '../shared/model.js';
import { api, ApiError, restore, signIn, signOut } from './client.js';
import { initialState } from './state.js';
import { esc, fromLocal } from './ui.js';
import { explore, orders, checkoutDialog } from './views/student.js';
import { vendor, menuDialog } from './views/vendor.js';
const root=document.querySelector<HTMLDivElement>('#app')!;
const s=initialState();
let timer: ReturnType<typeof setTimeout>; let refreshing=false;
let attempt: { key: string; serialized: string; actorId: string } | null=null;
try { attempt=JSON.parse(sessionStorage.getItem('breakbite-checkout-v2')??'null'); } catch { /* New checkout. */ }
function notify(message: string, error=false): void {
    const el=document.querySelector<HTMLDivElement>('#toast')!;
    el.textContent=message;el.className=`show ${error?'error':''}`;clearTimeout(timer);timer=setTimeout(()=>el.className='',6000);
}
const requestId=():string => Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
const groupCart=(): BasketGroup[] => [...new Set(s.cart.map(c=>c.vendorId))].sort().map(vendorId=>({vendorId,items:s.cart.filter(c=>c.vendorId===vendorId).map(({itemId,quantity})=>({itemId,quantity})).sort((a,b)=>a.itemId.localeCompare(b.itemId))}));
const plan=()=>s.fitBreak?s.plan:{mode:'pickup',budgetSen:50000};
const vendorPath=(part: string,id=s.actor?.vendorId??'')=>`/api/vendors/${encodeURIComponent(id)}/${part}`;
function invalidate(): void { s.quote=null;s.chosen={};s.checkoutError='';s.uncertain=false;attempt=null;sessionStorage.removeItem('breakbite-checkout-v2');sessionStorage.setItem('breakbite-cart-v2',JSON.stringify(s.cart)); }
async function refresh(): Promise<void> {
    if(s.actor){s.snapshot=await api<Snapshot>('/api/state');s.actor=s.snapshot.actor;s.vendors=s.snapshot.vendors;s.items=s.snapshot.items;}
    else {const c=await api<{vendors:Vendor[];items:MenuItem[]}>('/api/catalog');s.vendors=c.vendors;s.items=c.items;s.snapshot=null;}
    s.offline=false;
}
function authDialog(): string {
    if(!s.auth)return '';
    const register=s.auth==='register';
    return `<dialog id="auth-dialog" class="bb-dialog auth" aria-labelledby="auth-title"><button class="bb-close" data-action="close-auth" aria-label="Close sign in">×</button><p class="bb-kicker">WELCOME TO YOUR CAMPUS TABLE</p><h2 id="auth-title">${register?'A better lunch starts here.':'Good to see you again.'}</h2><p class="bb-muted">${register?'Create your student account to pre-order across kitchens.':'Sign in to order ahead or manage your kitchen.'}</p><form id="auth-form">${register?'<label>Your name<input name="name" autocomplete="name" minlength="2" maxlength="60" required></label>':''}<label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>Password<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="${register?'10':'1'}" maxlength="128" required></label>${register?'<p class="bb-small">Use at least 10 characters. Kitchen access is assigned by the operator administrator, not through registration.</p>':''}${s.authError?`<p class="bb-error" role="alert">${esc(s.authError)}</p>`:''}<button class="bb-button primary wide" type="submit" ${s.busy?'disabled':''}>${s.busy?'Please wait…':register?'Create student account':'Sign in'}</button></form><button class="bb-text-button" data-action="switch-auth">${register?'Already have an account? Sign in':'New here? Create an account'}</button><p class="bb-footnote">Accounts and orders are saved on this installation. For a forgotten password, contact its administrator. Email verification and email resets are not enabled.</p></dialog>`;
}
function render(): void {
    const active=document.activeElement as HTMLInputElement|null;
    const focusId=active?.id; const selection=active?.tagName==='INPUT' && ['text','search'].includes(active.type)?active.selectionStart:null;
    const student=s.actor?.role!=='vendor';
    root.innerHTML=`<header class="bb-header"><a href="/" class="bb-brand" aria-label="BreakBite home"><span>b</span>BreakBite<i>.</i></a><nav aria-label="Main navigation">${student?`<button data-view="explore" class="${s.view==='explore'?'active':''}">Explore</button>${s.actor?`<button data-view="orders" class="${s.view==='orders'?'active':''}">My orders</button>`:''}`:'<span class="bb-kicker">KITCHEN WORKSPACE</span>'}</nav><div class="bb-header-right">${s.actor?`<span class="bb-user">${esc(s.actor.name)}</span><button class="bb-button secondary" data-action="logout">Sign out</button>`:'<button class="bb-button primary" data-action="login">Sign in</button>'}</div></header>
    ${s.offline?'<div class="bb-offline" role="status">Connection interrupted. Retrying… Your confirmed orders are saved. Do not submit a new checkout for an uncertain request.</div>':''}
    ${s.uncertain?'<div class="bb-pending" role="alert">Your last checkout needs confirmation. Keep the same request to avoid duplicate orders. <button class="bb-button secondary" data-action="retry-checkout">Check / retry original checkout</button></div>':''}
    <main id="main" class="bb-main">${s.actor?.role==='vendor'?vendor(s):s.view==='orders'?orders(s):explore(s)}</main><footer class="bb-footer"><strong>BreakBite<span>Order ahead. Enjoy your break.</span></strong><span>Pay at the counter · Pickup times are estimates · MYT (UTC+8)</span></footer>${authDialog()}${checkoutDialog(s)}${menuDialog(s)}`;
    for(const dialog of root.querySelectorAll<HTMLDialogElement>('dialog')) {
        dialog.showModal();dialog.addEventListener('cancel',e=>{e.preventDefault();if(!s.busy){s.auth=null;s.editing=null;s.quote=null;render();}});
    }
    root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{if(s.busy)b.disabled=true;});
    if(focusId){const el=document.getElementById(focusId) as HTMLInputElement|null;if(el){el.focus({preventScroll:true});if(selection!==null&&selection!==undefined)try{el.setSelectionRange(selection,selection);}catch{/* Non-text input. */}}}
}
async function work(fn: ()=>Promise<void>): Promise<void> {
    if(s.busy)return;s.busy=true;
    // Avoid replacing an active form and losing typed credentials while a request is running.
    root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);
    try{await fn();}
    catch(e){
        const message=e instanceof Error?e.message:'Request failed. Please retry.';
        if(e instanceof ApiError&&e.status===401){s.actor=null;s.snapshot=null;s.auth='login';s.authError=message;}
        else if(s.auth)s.authError=message;
        else if(s.quote)s.checkoutError=message;
        notify(message,true);
    }finally{s.busy=false;render();}
}
function confirmed(result: CheckoutResult): void {
    s.cart=[];invalidate();s.view='orders';s.success=`Order placed across ${result.orders.length} kitchen${result.orders.length>1?'s':''}. Pay and collect separately at each counter.`;
}
async function sendAttempt(): Promise<void> {
    if(!attempt||attempt.actorId!==s.actor?.id)throw new Error('Sign in with the account used for this checkout.');
    try {
        const existing=await api<{checkout:CheckoutResult|null}>(`/api/checkouts/${encodeURIComponent(attempt.key)}`);
        const result=existing.checkout??await api<CheckoutResult>('/api/checkouts','POST',JSON.parse(attempt.serialized),{'Idempotency-Key':attempt.key});
        confirmed(result);await refresh();window.scrollTo({top:0});
    } catch(e) {
        if(attempt) {
            if(e instanceof ApiError&&[400,403,404,409,422].includes(e.status)) { attempt=null;s.uncertain=false;sessionStorage.removeItem('breakbite-checkout-v2'); }
            else {s.uncertain=true;s.quote=null;}
        }
        throw e;
    }
}
async function review(): Promise<void> {
    if(s.uncertain){await sendAttempt();return;}

    if(!s.actor){s.auth='login';s.authError='';return;}
    if(s.actor.role!=='student')throw new Error('Use a student account to order.');
    s.checkoutError='';
    const q=await api<BasketQuote>('/api/checkout/quote','POST',{groups:groupCart(),plan:plan()});
    s.quote=q;s.chosen={};
    // Default to a staggered route; the server independently validates the final selection.
    let end=0;
    for(const g of q.groups){const window=g.slots.find(w=>Date.parse(w.startAt)>=(end?end+s.transferMinutes*60000:0));s.chosen[g.vendorId]=window?.id??'';if(window)end=Date.parse(window.startAt)+60000;}
}
root.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLElement>('button');if(!target||s.busy)return;
    const action=target.dataset.action;const id=target.dataset.id??'';const vid=target.dataset.vendor??s.actor?.vendorId??'';
    if(target.dataset.view){s.view=target.dataset.view as typeof s.view;if(s.view==='orders'&&!s.actor)s.auth='login';render();return;}
    if(target.dataset.vendorTab){s.vendorTab=target.dataset.vendorTab as typeof s.vendorTab;render();return;}
    if(target.dataset.category){s.category=target.dataset.category;render();return;}
    if(action==='login'){s.auth='login';s.authError='';render();return;}
    if(action==='switch-auth'){s.auth=s.auth==='login'?'register':'login';s.authError='';render();return;}
    if(action==='close-auth'){s.auth=null;s.authError='';render();return;}
    if(action==='close-checkout'){s.quote=null;s.checkoutError='';render();return;}
    if(action==='close-editor'){s.editing=null;render();return;}
    if(action==='show-basket'){document.getElementById('basket')?.scrollIntoView({behavior:'smooth'});document.getElementById('basket')?.focus({preventScroll:true});return;}
    if(action==='new-item'){s.editing='new';render();return;}
    if(action==='edit-item'){s.editing=s.items.find(i=>i.id===id&&i.vendorId===vid)??null;render();return;}
    if(action==='add'||action==='plus'||action==='minus'){
        if(s.uncertain){notify('Confirm the previous checkout before changing this basket.',true);return;}
        const item=s.items.find(i=>i.id===id&&i.vendorId===vid);const line=s.cart.find(c=>c.itemId===id&&c.vendorId===vid);
        if(action!=='minus'&&(!item||!item.enabled||!s.vendors.find(v=>v.id===vid)?.open)){notify('This item is not available.',true);return;}
        const count=s.cart.filter(c=>c.vendorId===vid).reduce((n,c)=>n+c.quantity,0);
        if(action!=='minus'&&(count>=5||item!.stock<=(line?.quantity??0))){notify('This kitchen allows up to five portions per order, within available stock.',true);return;}
        if(action==='minus'){if(line)line.quantity--;s.cart=s.cart.filter(c=>c.quantity>0);}
        else if(line)line.quantity++;else s.cart.push({vendorId:vid,itemId:id,quantity:1});
        invalidate();render();if(action==='add')notify('Added to your basket. You can add items from other kitchens too.');return;
    }
    if(!action)return;
    void work(async()=>{
        if(action==='logout'){await signOut();s.actor=null;s.view='explore';s.cart=[];s.recovery={};s.success='';invalidate();await refresh();}
        else if(action==='review')await review();
        else if(action==='retry-checkout')await sendAttempt();
        else if(action==='cancel'){
            if(!window.confirm('Cancel this kitchen’s order? Other kitchen orders will stay active.'))return;
            await api(vendorPath(`orders/${encodeURIComponent(id)}/cancel`,vid),'POST',{});await refresh();notify('Kitchen order cancelled. No online payment was taken.');
        }
        else if(action==='status'){await api(vendorPath(`orders/${encodeURIComponent(id)}/status`),'POST',{status:target.dataset.status});await refresh();}
        else if(action==='toggle-open'){const v=s.vendors.find(v=>v.id===vid)!;await api(vendorPath('open'),'PATCH',{open:!v.open});await refresh();}
        else if(action==='toggle-item'){const i=s.items.find(i=>i.id===id&&i.vendorId===vid)!;await api(vendorPath(`items/${encodeURIComponent(id)}`),'PATCH',{enabled:!i.enabled});await refresh();}
        else if(action==='resolve'){await api(vendorPath(`incidents/${encodeURIComponent(id)}/resolve`),'POST',{});s.recovery={};await refresh();}
        else if(action==='evaluate'){s.recovery[id]=await api<{options:RecoveryOption[];message:string}>(vendorPath('recovery/evaluate'),'POST',{orderId:id});}
        else if(action==='propose'){const option=s.recovery[id]?.options[Number(target.dataset.index)];if(!option)throw new Error('Recheck alternatives.');await api(vendorPath('proposals'),'POST',{orderId:id,itemId:option.itemId,slotId:option.slotId,reason:'Kitchen-checked alternative. Please review the meal and pickup time.'});await refresh();notify('Proposal saved. Approve it to ask the student.');}
        else if(action==='approve'||action==='reject'){await api(vendorPath(`proposals/${encodeURIComponent(id)}/approve`,vid),'POST',{approve:action==='approve'});await refresh();}
        else if(action==='accept'||action==='decline'){await api(vendorPath(`proposals/${encodeURIComponent(id)}/respond`,vid),'POST',{accept:action==='accept'});await refresh();notify(action==='accept'?'Alternative accepted. Use the new pickup code.':'Your original order is unchanged.');}
    });
});
root.addEventListener('change',event=>{
    const el=event.target as HTMLInputElement|HTMLSelectElement;
    if(s.uncertain){notify('Confirm the original checkout before changing preferences.',true);render();return;}
    if(el.id==='fit-toggle'){s.fitBreak=(el as HTMLInputElement).checked;invalidate();render();}
    else if(el.id==='kitchen-filter'){s.vendorFilter=el.value;render();}
    else if(el.dataset.slotVendor)s.chosen[el.dataset.slotVendor]=el.value;
    else if(el.name==='transferMinutes')s.transferMinutes=Number(el.value);
});
root.addEventListener('submit',event=>{
    event.preventDefault();const form=event.target as HTMLFormElement;const f=new FormData(form);
    if(form.id==='search-form'){s.search=String(f.get('search')??'');render();return;}
    void work(async()=>{
        if(form.id==='auth-form'){
            s.actor=await signIn({email:f.get('email'),password:f.get('password'),...(s.auth==='register'?{name:f.get('name')}:{})},s.auth==='register');s.auth=null;s.authError='';s.view=s.actor.role==='vendor'?'vendor':'explore';await refresh();
            notify('Signed in.');
        }else if(form.id==='plan-form'){
            if(s.uncertain)throw new Error('Confirm the original checkout before changing preferences.');
            s.plan={breakStartAt:fromLocal(f.get('breakStartAt')),nextClassAt:fromLocal(f.get('nextClassAt')),walkToMinutes:Number(f.get('walkToMinutes')),returnMinutes:Number(f.get('returnMinutes')),eatMinutes:Number(f.get('eatMinutes')),bufferMinutes:Number(f.get('bufferMinutes')),budgetSen:Math.round(Number(f.get('budget'))*100)};invalidate();notify('Time preferences applied.');
        }else if(form.id==='checkout-form'){
            if(!s.quote)throw new Error('Review your basket first.');
            const payload={groups:groupCart().map(g=>({...g,slotId:String(f.get(`slot:${g.vendorId}`)??'')})),plan:plan(),transferMinutes:s.transferMinutes,expectedTotalSen:s.quote.totalSen};
            const serialized=JSON.stringify(payload);
            if(!attempt||attempt.serialized!==serialized){attempt={key:requestId(),serialized,actorId:s.actor!.id};sessionStorage.setItem('breakbite-checkout-v2',JSON.stringify(attempt));}
            await sendAttempt();
        }else if(form.dataset.collect){await api(vendorPath(`orders/${encodeURIComponent(form.dataset.collect)}/collect`),'POST',{code:f.get('code'),paymentReceived:f.get('paymentReceived')==='on'});await refresh();notify('Pickup completed and counter payment recorded.');}
        else if(form.id==='incident-form'){const itemId=String(f.get('itemId')??'');await api(vendorPath('incidents'),'POST',{itemIds:itemId?[itemId]:[],reason:f.get('reason'),delayMinutes:Number(f.get('delayMinutes'))});s.recovery={};await refresh();notify('Delay reported. Affected order estimates updated.');}
        else if(form.id==='capacity-form'){await api(vendorPath('slots'),'POST',{kitchenCapacity:Number(f.get('kitchenCapacity')),pickupCapacity:Number(f.get('pickupCapacity'))});await refresh();notify('Capacity saved for future pickup windows.');}
        else if(form.id==='vendor-profile'){await api(vendorPath('profile'),'PATCH',{name:f.get('name'),location:f.get('location'),description:f.get('description'),confirmMenu:f.get('confirmMenu')==='on'});await refresh();notify('Kitchen profile saved.');}
        else if(form.id==='item-form'){
            const editing=s.editing;const payload={name:f.get('name'),description:f.get('description'),category:f.get('category'),art:f.get('art'),priceSen:Math.round(Number(f.get('price'))*100),stock:Number(f.get('stock')),prepMinutes:Number(f.get('prepMinutes')),prepUnits:Number(f.get('prepUnits')),enabled:f.get('enabled')==='on'};
            await api(vendorPath(editing&&editing!=='new'?`items/${encodeURIComponent(editing.id)}`:'items'),editing&&editing!=='new'?'PATCH':'POST',payload);s.editing=null;await refresh();notify('Menu item saved.');
        }
    });
});
async function boot(): Promise<void> {
    try {
        s.config=await api<AppConfig>('/api/config');
        if(s.config.mode!=='local')throw new Error('This release uses AUTH_MODE=local and JSON storage. Cloud and Enterprise migration is deferred; see docs/LOCAL_MVP.md.');
        s.actor=await restore();if(s.actor?.role==='vendor')s.view='vendor';await refresh();
        if(attempt&&attempt.actorId===s.actor?.id){const prior=await api<{checkout:CheckoutResult|null}>(`/api/checkouts/${encodeURIComponent(attempt.key)}`);if(prior.checkout){confirmed(prior.checkout);await refresh();}else s.uncertain=true;}
        render();
        setInterval(()=>{if(refreshing||s.busy||document.hidden)return;refreshing=true;
            const before=JSON.stringify({orders:s.snapshot?.orders,items:s.items,vendors:s.vendors,proposals:s.snapshot?.proposals,incidents:s.snapshot?.incidents,offline:s.offline});
            void refresh().then(()=>{const after=JSON.stringify({orders:s.snapshot?.orders,items:s.items,vendors:s.vendors,proposals:s.snapshot?.proposals,incidents:s.snapshot?.incidents,offline:s.offline});const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName??'');if(before!==after&&!editing&&!s.quote&&!s.auth&&!s.editing)render();}).catch(e=>{if(e instanceof ApiError&&e.status===401){s.actor=null;s.snapshot=null;s.auth='login';s.authError='Your session expired. Please sign in again.';render();}else{if(!s.offline){s.offline=true;if(!s.auth&&!s.quote&&!s.editing)render();}}}).finally(()=>refreshing=false);
        },5000);
    }catch(e){root.innerHTML=`<main class="bb-empty"><h1>Unable to open BreakBite</h1><p>${esc(e instanceof Error?e.message:'Please restart the application.')}</p><a href="/" class="bb-button primary">Try again</a></main>`;}
}
void boot();
