import { pushAction, refreshPush, pushFingerprint, detachPush } from './push-client.js';
import { foodCheck, emptyProfile, type StudentProfile, type Notice, type BookingLoad } from '../shared/features.js';
import { productActions, stopCamera } from './product-actions.js';
import { personalView, productDialogs, availabilityView } from './views/personal.js';
import type { Actor, AppConfig, BasketGroup, BasketQuote, CheckoutResult, MenuItem, RecoveryOption, Snapshot, Vendor } from '../shared/model.js';
import { api, ApiError, restore, signIn, signOut } from './client.js';
import { defaultBreakPlan, initialState } from './state.js';
import { esc } from './ui.js';
import { timetableActions } from './timetable-actions.js';
import { explore, orders, checkoutDialog } from './views/student.js';
import { vendor, menuDialog } from './views/vendor.js';
const root=document.querySelector<HTMLDivElement>('#app')!;
const s=initialState();
let noticeIds = new Set<string>();
let noticesInitialised = false;
let timer: ReturnType<typeof setTimeout>; let refreshing=false;
const checkoutCache = 'breakbite-checkout-v2';
const checkoutCacheFor = (actorId: string) => `${checkoutCache}:${actorId}`;
type CheckoutAttempt = { key: string; serialized: string; actorId: string; storageKey: string };
let attempt: CheckoutAttempt | null = null;
let actorGeneration = 0;

function restoreAttempt(actor: Actor | null): CheckoutAttempt | null {
    if (actor?.role !== 'student') return null;
    for (const storageKey of [checkoutCacheFor(actor.id), checkoutCache]) {
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
            if (saved?.actorId === actor.id && typeof saved.key === 'string' && typeof saved.serialized === 'string') {
                return { key: saved.key, serialized: saved.serialized, actorId: actor.id, storageKey };
            }
        } catch { /* Check the other cache key if the entry is unreadable. */ }
    }
    return null;
}

function clearAttempt(): void {
    if (attempt) sessionStorage.removeItem(attempt.storageKey);
    attempt = null;
    s.uncertain = false;
}
function notify(message: string, error=false): void {
    const el=document.querySelector<HTMLDivElement>('#toast')!;
    el.textContent=message;el.className=`show ${error?'error':''}`;clearTimeout(timer);timer=setTimeout(()=>el.className='',6000);
}
const requestId=():string => Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
const groupCart=(): BasketGroup[] => [...new Set(s.cart.map(c=>c.vendorId))].sort().map(vendorId=>({vendorId,items:s.cart.filter(c=>c.vendorId===vendorId).map(({itemId,quantity})=>({itemId,quantity})).sort((a,b)=>a.itemId.localeCompare(b.itemId))}));
const plan=()=>s.fitBreak?s.plan:{mode:'pickup',budgetSen:50000};
const vendorPath=(part: string,id=s.actor?.vendorId??'')=>`/api/vendors/${encodeURIComponent(id)}/${part}`;
function invalidate(): void { s.quote=null;s.chosen={};s.checkoutError='';clearAttempt();sessionStorage.setItem('breakbite-cart-v2',JSON.stringify(s.cart)); }
const timetable = timetableActions(s, render, invalidate, notify);
function navigate(view: typeof s.view): void {
    if (view !== 'explore' && s.timetable.loading) timetable.cancelPreview();
    s.view = view;
}
function setActor(actor: Actor | null): void {
    if (s.actor?.id !== actor?.id || s.actor?.role !== actor?.role) {
        actorGeneration++;
        attempt = restoreAttempt(actor);
        s.uncertain = Boolean(attempt);
        timetable.reset();
        delete s.apspaceSetup;
        delete s.apspaceFeedback;
        delete s.apspaceReview;
        s.fitBreak = false; s.plan = defaultBreakPlan(); s.planDraft = {}; s.manualPlan = false;
        s.quote = null; s.chosen = {}; s.checkoutError = ''; s.snapshot = null; s.serverClock = null;
        s.profile = emptyProfile(); s.notices = []; noticeIds.clear(); noticesInitialised = false;
    }
    s.actor = actor;
}
async function refresh(): Promise<void> {
    let generation = actorGeneration;
    if(s.actor){
        try {
            const snapshot = await api<Snapshot>('/api/state');
            if (generation !== actorGeneration) return;
            setActor(snapshot.actor);
            generation = actorGeneration;
            const time = Date.parse(snapshot.serverTime);
            s.serverClock = Number.isFinite(time) ? { time, sampledAt: performance.now() } : null;
            const loads = await api<BookingLoad[]>('/api/product/loads');
            if (generation !== actorGeneration) return;
            if (snapshot.actor.role === 'student') {
                const p = await api<{profile:StudentProfile;notices:Notice[]}>('/api/product/profile');
                if (generation !== actorGeneration) return;
                const fresh = p.notices.filter(n => !n.readAt && !noticeIds.has(n.id));
                if (noticesInitialised && fresh.length) notify(fresh[0]!.message);
                noticesInitialised = true;
                noticeIds = new Set(p.notices.map(n => n.id)); s.profile = p.profile; s.notices = p.notices;
                timetable.clearStaleSavedBreak();
            }
            s.snapshot = snapshot; s.vendors = snapshot.vendors; s.items = snapshot.items; s.loads = loads;
        } catch (error) {
            if (generation !== actorGeneration) return;
            if (error instanceof ApiError && [401, 403].includes(error.status)) {
                setActor(null);
                s.view = 'explore'; s.auth = 'login'; s.authError = 'Your session expired. Please sign in again.';
            }
            throw error;
        }
    }
    else {const c=await api<{vendors:Vendor[];items:MenuItem[];loads:BookingLoad[]}>('/api/catalog');if(generation!==actorGeneration)return;s.vendors=c.vendors;s.items=c.items;s.loads=c.loads;}
    if(s.view==='inbox') await refreshPush(s.actor);
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
    const planDetailsOpen = root.querySelector<HTMLDetailsElement>('#plan-form details')?.open;
    const student=s.actor?.role!=='vendor';
    const surface=s.actor?.role==='vendor'?`vendor-${s.vendorTab}`:s.view;
    root.innerHTML=`<a class="bb-skip-link" href="#main">Skip to main content</a><header class="bb-header ${student?'student':'vendor'}"><a href="/" class="bb-brand" aria-label="BreakBite home"><img src="/favicon.svg" alt="">BreakBite<i>.</i></a><nav aria-label="Main navigation">${student?`<button data-view="explore" class="${s.view==='explore'?'active':''}" ${s.view==='explore'?'aria-current="page"':''}>Explore</button><button data-view="availability" class="${s.view==='availability'?'active':''}" ${s.view==='availability'?'aria-current="page"':''}>Availability</button>${s.actor?`<button data-view="orders" class="${s.view==='orders'?'active':''}" ${s.view==='orders'?'aria-current="page"':''}>My orders</button><button data-view="saved" class="${s.view==='saved'?'active':''}" ${s.view==='saved'?'aria-current="page"':''}>Saved</button><button data-view="planner" class="${s.view==='planner'?'active':''}" ${s.view==='planner'?'aria-current="page"':''}>My planner</button><button data-view="inbox" class="${s.view==='inbox'?'active':''}" ${s.view==='inbox'?'aria-current="page"':''}>Inbox${s.notices.filter(n=>!n.readAt).length?` (${s.notices.filter(n=>!n.readAt).length})`:''}</button>`:''}`:'<span class="bb-workspace-label">Kitchen workspace</span>'}</nav><div class="bb-header-right">${s.actor?`<span class="bb-user">${esc(s.actor.name)}</span><button class="bb-button secondary" data-action="logout">Sign out</button>`:'<button class="bb-button primary" data-action="login">Sign in</button>'}</div></header>
    ${s.offline?'<div class="bb-offline" role="status">Connection interrupted. Retrying… Your confirmed orders are saved. Do not submit a new checkout for an uncertain request.</div>':''}
    ${s.uncertain?'<div class="bb-pending" role="alert">Your last checkout needs confirmation. Keep the same request to avoid duplicate orders. <button class="bb-button secondary" data-action="retry-checkout">Check / retry original checkout</button></div>':''}
    <main id="main" class="bb-main" data-surface="${esc(surface)}">${s.actor?.role==='vendor'?vendor(s):s.view==='orders'?orders(s):s.view==='availability'?availabilityView(s):['saved','planner','inbox'].includes(s.view)?personalView(s):explore(s)}</main><footer class="bb-footer"><strong><span class="bb-footer-brand"><img src="/favicon.svg" alt="">BreakBite.</span><span>Order ahead for your campus break.</span></strong><span>APU student project · Pay at the counter · Pickup estimates shown in MYT (UTC+8)</span></footer>${authDialog()}${checkoutDialog(s)}${menuDialog(s)}${productDialogs(s)}`;
    const nav = root.querySelector<HTMLElement>('.bb-header nav');
    const selected = nav?.querySelector<HTMLElement>('button.active');
    if(nav && selected){const n=nav.getBoundingClientRect(),b=selected.getBoundingClientRect();if(b.left<n.left)nav.scrollLeft-=n.left-b.left;else if(b.right>n.right)nav.scrollLeft+=b.right-n.right;}
    for(const dialog of root.querySelectorAll<HTMLDialogElement>('dialog')) {
        dialog.showModal();dialog.addEventListener('cancel',e=>{e.preventDefault();if(!s.busy){stopCamera();s.scanner=false;s.qr=null;s.detailItem=null;s.auth=null;s.editing=null;s.quote=null;render();}});
    }
    root.querySelectorAll<HTMLInputElement>('button,input,select,textarea').forEach(b=>{if(s.busy)b.disabled=true;});
    if (planDetailsOpen) {
        const details = root.querySelector<HTMLDetailsElement>('#plan-form details');
        if (details) details.open = true;
    }
    if(focusId){const el=document.getElementById(focusId) as HTMLInputElement|null;if(el){el.focus({preventScroll:true});if(selection!==null&&selection!==undefined)try{el.setSelectionRange(selection,selection);}catch{/* Non-text input. */}}}
}
async function work(fn: ()=>Promise<void>): Promise<void> {
    if(s.busy)return;s.busy=true;
    if (s.timetable.loading) timetable.cancelPreview();
    // Avoid replacing an active form and losing typed credentials while a request is running.
    root.querySelectorAll<HTMLInputElement>('button,input,select,textarea').forEach(b=>b.disabled=true);
    try{await fn();}
    catch(e){
        const message=e instanceof Error?e.message:'Request failed. Please retry.';
        if(e instanceof ApiError&&e.status===401){setActor(null);s.view='explore';s.auth='login';s.authError=message;}
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
    const original = attempt;
    const generation = actorGeneration;
    try {
        const existing=await api<{checkout:CheckoutResult|null}>(`/api/checkouts/${encodeURIComponent(original.key)}`);
        if (generation !== actorGeneration) throw new Error('Sign in with the account used for this checkout.');
        const result=existing.checkout??await api<CheckoutResult>('/api/checkouts','POST',JSON.parse(original.serialized),{'Idempotency-Key':original.key});
        if (generation !== actorGeneration) throw new Error('Sign in with the account used for this checkout.');
        confirmed(result);await refresh();window.scrollTo({top:0});
    } catch(e) {
        if(attempt === original) {
            if(generation === actorGeneration && e instanceof ApiError&&[400,404,409,422].includes(e.status)) clearAttempt();
            else {s.uncertain=true;s.quote=null;}
        }
        throw e;
    }
}
async function checkSavedBreak(generation: number): Promise<boolean> {
    if (s.fitBreak && s.timetable.appliedSaved) {
        const { profile } = await api<{ profile: StudentProfile }>('/api/product/profile');
        if (generation !== actorGeneration) return false;
        s.profile = profile;
        if (timetable.clearStaleSavedBreak()) throw new Error(s.checkoutError);
    }
    timetable.validateBreak();
    return true;
}
async function review(): Promise<void> {
    if(s.uncertain){await sendAttempt();return;}

    if(!s.actor){s.auth='login';s.authError='';return;}
    if(s.actor.role!=='student')throw new Error('Use a student account to order.');
    s.checkoutError='';
    const generation = actorGeneration;
    let q: BasketQuote;
    try {
        if (!await checkSavedBreak(generation)) return;
        const requestedPlan = plan();
        q = await api<BasketQuote>('/api/checkout/quote','POST',{groups:groupCart(),plan:requestedPlan});
        if (generation === actorGeneration) {
            if (s.fitBreak && requestedPlan !== s.plan) throw new Error(s.checkoutError || 'Your break changed. Check pickup times again.');
            timetable.validateBreak();
        }
    } catch (error) {
        if (generation === actorGeneration && error instanceof Error) s.checkoutError = error.message;
        throw error;
    }
    if (generation !== actorGeneration) return;
    s.quote=q;s.chosen={};
    // Default to a staggered route; the server independently validates the final selection.
    let end=0;
    for(const g of q.groups){const window=g.slots.find(w=>Date.parse(w.startAt)>=(end?end+s.transferMinutes*60000:0));s.chosen[g.vendorId]=window?.id??'';if(window)end=Date.parse(window.startAt)+60000;}
}
const extra=productActions(s,{work,render,refresh,invalidate,notify});
root.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLElement>('button');if(!target||s.busy)return;
    const action=target.dataset.action;
    if(action==='saved-break'){
        if (s.uncertain) return;
        const quoteBasket = Boolean(target.closest('#basket') && s.cart.length);
        try {
            timetable.useSavedBreak(target.dataset.end);
            if (quoteBasket) void work(review);
        }
        catch (error) { notify((error as Error).message,true); }
        return;
    }
    if(extra.click(target))return;
    if(timetable.click(target))return;
    if(action?.startsWith('push-')){void work(async()=>{notify(await pushAction(action,target.dataset.id,s.actor));});return;}const id=target.dataset.id??'';const vid=target.dataset.vendor??s.actor?.vendorId??'';
    if(target.dataset.view){
        navigate(target.dataset.view as typeof s.view);
        if(['orders','saved','planner','inbox'].includes(s.view)&&!s.actor)s.auth='login';
        render();
        if(target.id==='apspace-open-planner')document.getElementById('apspace-connect-heading')?.focus();
        if(s.view==='inbox')void refreshPush(s.actor).then(()=>render());
        return;
    }
    if(target.dataset.vendorTab){s.vendorTab=target.dataset.vendorTab as typeof s.vendorTab;render();return;}
    if(target.dataset.category){s.category=target.dataset.category;render();return;}
    if(target.dataset.allergenFilter){
        const allergen=target.dataset.allergenFilter as typeof s.allergenFilters[number];
        s.allergenFilters=s.allergenFilters.includes(allergen)?s.allergenFilters.filter(a=>a!==allergen):[...s.allergenFilters,allergen];
        render();return;
    }
    if(action==='login'){s.auth='login';s.authError='';render();return;}
    if(action==='switch-auth'){s.auth=s.auth==='login'?'register':'login';s.authError='';render();return;}
    if(action==='close-auth'){s.auth=null;s.authError='';render();return;}
    if(action==='close-checkout'){s.quote=null;s.checkoutError='';render();return;}
    if(action==='close-editor'){s.editing=null;render();return;}
    if(action==='clear-allergen-filters'){s.allergenFilters=[];render();return;}
    if(action==='show-basket'){document.getElementById('basket')?.scrollIntoView({behavior:'smooth'});document.getElementById('basket')?.focus({preventScroll:true});return;}
    if(action==='new-item'){s.editing='new';render();return;}
    if(action==='edit-item'){s.editing=s.items.find(i=>i.id===id&&i.vendorId===vid)??null;render();return;}
    if(action==='add'||action==='plus'||action==='minus'){
        if(s.uncertain){notify('Confirm the previous checkout before changing this basket.',true);return;}
        const item=s.items.find(i=>i.id===id&&i.vendorId===vid);const line=s.cart.find(c=>c.itemId===id&&c.vendorId===vid);
        if(action!=='minus'&&item&&!foodCheck(item.foodInfo,s.profile.preferences).suitable){notify('This meal does not match your saved dietary restrictions. Review its ingredients or your preferences.',true);return;}
        if(action!=='minus'&&(!item||!item.enabled||!s.vendors.find(v=>v.id===vid)?.open)){notify('This item is not available.',true);return;}
        const count=s.cart.filter(c=>c.vendorId===vid).reduce((n,c)=>n+c.quantity,0);
        if(action!=='minus'&&(count>=5||item!.stock<=(line?.quantity??0))){notify('This kitchen allows up to five portions per order, within available stock.',true);return;}
        if(action==='minus'){if(line)line.quantity--;s.cart=s.cart.filter(c=>c.quantity>0);}
        else if(line)line.quantity++;else s.cart.push({vendorId:vid,itemId:id,quantity:1});
        invalidate();render();if(action==='add')notify('Added to your basket. You can add items from other kitchens too.');return;
    }
    if(!action)return;
    if(action==='review' && s.actor?.role==='student' && s.fitBreak && !s.uncertain && Object.keys(s.planDraft).length){
        const form = document.querySelector<HTMLFormElement>('#plan-form')!;
        try { timetable.applyForm(form); }
        catch (error) { notify((error as Error).message, true); return; }
    }
    void work(async()=>{
        if(action==='logout'){
            await signOut();setActor(null);s.view='explore';s.cart=[];s.recovery={};s.success='';
            sessionStorage.removeItem('breakbite-cart-v2');
            await detachPush().catch(()=>undefined);await refresh();
        }
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
    if(s.busy||timetable.change(el))return;
    if(s.uncertain && (el.id==='fit-toggle'||el.dataset.slotVendor||el.name==='transferMinutes')){
        notify('Confirm the original checkout before changing preferences.',true);render();return;
    }
    if(el.id==='fit-toggle'){s.fitBreak=(el as HTMLInputElement).checked;if(!s.fitBreak)timetable.cancelPreview();invalidate();render();}
    else if(el.id==='kitchen-filter'){s.vendorFilter=el.value;render();}
    else if(el.dataset.slotVendor)s.chosen[el.dataset.slotVendor]=el.value;
    else if(el.name==='transferMinutes')s.transferMinutes=Number(el.value);
});
root.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if(extra.input(input))return;
    if (!s.busy && !s.uncertain && input.form?.id === 'plan-form') s.planDraft[input.name] = input.value;
});
root.addEventListener('submit',event=>{
    event.preventDefault();const form=event.target as HTMLFormElement;const f=new FormData(form);if(extra.submit(form))return;
    if(form.id==='search-form'){s.search=String(f.get('search')??'');render();return;}
    if(form.id==='plan-form'){
        if(s.busy||s.uncertain)return;
        try { timetable.applyForm(form); render(); notify('Time preferences applied.'); }
        catch (error) { notify((error as Error).message, true); }
        return;
    }
    void work(async()=>{
        if(form.id==='auth-form'){
            const actor=await signIn({email:f.get('email'),password:f.get('password'),...(s.auth==='register'?{name:f.get('name')}:{})},s.auth==='register');setActor(actor);s.auth=null;s.authError='';s.view=actor.role==='vendor'?'vendor':new URLSearchParams(location.search).get('view')==='inbox'?'inbox':'explore';await refresh();await refreshPush(s.actor);
            notify('Signed in.');
        }else if(form.id==='checkout-form'){
            if(s.uncertain){await sendAttempt();return;}
            if (!await checkSavedBreak(actorGeneration)) return;
            if(!s.quote)throw new Error('Review your basket first.');
            const payload={groups:groupCart().map(g=>({...g,slotId:String(f.get(`slot:${g.vendorId}`)??'')})),plan:plan(),transferMinutes:s.transferMinutes,expectedTotalSen:s.quote.totalSen,menuVersions:s.quote.menuVersions};
            const serialized=JSON.stringify(payload);
            if(!attempt||attempt.serialized!==serialized){
                const actorId = s.actor!.id;
                const stored = { key: requestId(), serialized, actorId };
                const storageKey = checkoutCacheFor(actorId);
                sessionStorage.setItem(storageKey, JSON.stringify(stored));
                attempt = { ...stored, storageKey };
            }
            await sendAttempt();
        }else if(form.dataset.collect){await api(vendorPath(`orders/${encodeURIComponent(form.dataset.collect)}/collect`),'POST',{code:f.get('code'),paymentReceived:f.get('paymentReceived')==='on'});await refresh();notify('Pickup completed and counter payment recorded.');}
        else if(form.id==='incident-form'){const itemId=String(f.get('itemId')??'');await api(vendorPath('incidents'),'POST',{itemIds:itemId?[itemId]:[],reason:f.get('reason'),delayMinutes:Number(f.get('delayMinutes'))});s.recovery={};await refresh();notify('Delay reported. Affected order estimates updated.');}
        else if(form.id==='capacity-form'){await api(vendorPath('slots'),'POST',{kitchenCapacity:Number(f.get('kitchenCapacity')),pickupCapacity:Number(f.get('pickupCapacity'))});await refresh();notify('Capacity saved for future pickup windows.');}
        else if(form.id==='vendor-profile'){await api(vendorPath('profile'),'PATCH',{name:f.get('name'),location:f.get('location'),description:f.get('description'),confirmMenu:f.get('confirmMenu')==='on',menuSource:f.get('menuSource'),campus:f.get('campus'),policies:{cutoffMinutes:Number(f.get('cutoffMinutes')),cancellationMinutes:Number(f.get('cancellationMinutes')),holdMinutes:Number(f.get('holdMinutes')),delayGraceMinutes:Number(f.get('delayGraceMinutes'))}});await refresh();notify('Kitchen profile saved.');}
        else if(form.id==='item-form'){
            const editing=s.editing;const payload={name:f.get('name'),description:f.get('description'),category:f.get('category'),art:f.get('art'),priceSen:Math.round(Number(f.get('price'))*100),stock:Number(f.get('stock')),prepMinutes:Number(f.get('prepMinutes')),prepUnits:Number(f.get('prepUnits')),enabled:f.get('enabled')==='on',foodInfo:{ingredients:f.get('ingredients'),allergensKnown:f.get('allergensKnown')==='on',allergens:f.getAll('allergens'),mayContain:f.getAll('mayContain'),diets:f.getAll('diets'),spice:f.get('spice'),confirmed:f.get('foodConfirmed')==='on',...(String(f.get('halalReference')??'').trim()?{halalEvidence:{reference:f.get('halalReference'),expiresOn:f.get('halalExpiry')}}:{}),...(String(f.get('glutenReference')??'').trim()?{glutenFreeEvidence:{reference:f.get('glutenReference'),expiresOn:f.get('glutenExpiry')}}:{})}};
            await api(vendorPath(editing&&editing!=='new'?`items/${encodeURIComponent(editing.id)}`:'items'),editing&&editing!=='new'?'PATCH':'POST',payload);s.editing=null;await refresh();notify('Menu item saved.');
        }
    });
});
async function boot(): Promise<void> {
    try {
        s.config=await api<AppConfig>('/api/config');
        if(s.config.mode!=='local')throw new Error('This release uses AUTH_MODE=local and JSON storage. Cloud and Enterprise migration is deferred; see docs/LOCAL_MVP.md.');
        setActor(await restore());if(s.actor?.role==='vendor')s.view='vendor';else if(new URLSearchParams(location.search).get('view')==='inbox'){s.view=s.actor?'inbox':'explore';if(!s.actor)s.auth='login';}await refresh();await refreshPush(s.actor);
        if(attempt&&attempt.actorId===s.actor?.id){const prior=await api<{checkout:CheckoutResult|null}>(`/api/checkouts/${encodeURIComponent(attempt.key)}`);if(prior.checkout){confirmed(prior.checkout);await refresh();}else s.uncertain=true;}
        render();
        setInterval(()=>{if(refreshing||s.busy||s.scanner)return;refreshing=true;
            const generation=actorGeneration;
            const before=JSON.stringify({orders:s.snapshot?.orders,items:s.items,vendors:s.vendors,proposals:s.snapshot?.proposals,incidents:s.snapshot?.incidents,offline:s.offline,notices:s.notices,loads:s.loads,push:pushFingerprint(),profile:s.profile,checkoutError:s.checkoutError});
            void refresh().then(()=>{
                if(generation!==actorGeneration){if(!s.busy)render();return;}
                const after=JSON.stringify({orders:s.snapshot?.orders,items:s.items,vendors:s.vendors,proposals:s.snapshot?.proposals,incidents:s.snapshot?.incidents,offline:s.offline,notices:s.notices,loads:s.loads,push:pushFingerprint(),profile:s.profile,checkoutError:s.checkoutError});
                const active=document.activeElement;
                const editing=['INPUT','TEXTAREA','SELECT'].includes(active?.tagName??'')||Boolean(active?.closest('.bb-timetable, #plan-form'));
                if(before!==after&&!editing&&!s.busy&&!s.quote&&!s.auth&&!s.editing&&!s.qr&&!s.detailItem&&!document.hidden)render();
            }).catch(e=>{
                if(e instanceof ApiError&&[401,403].includes(e.status)&&s.auth==='login')render();
                else if(!s.offline){s.offline=true;if(!s.busy&&!s.auth&&!s.quote&&!s.editing&&!s.qr&&!s.detailItem&&!document.hidden)render();}
            }).finally(()=>refreshing=false);
        },5000);
    }catch(e){root.innerHTML=`<main class="bb-empty"><h1>Unable to open BreakBite</h1><p>${esc(e instanceof Error?e.message:'Please restart the application.')}</p><a href="/" class="bb-button primary">Try again</a></main>`;}
}
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', event => {
    if(event.data?.type==='OPEN_INBOX'){if(s.actor?.role==='vendor')return;navigate(s.actor?'inbox':'explore');if(!s.actor)s.auth='login';void refreshPush(s.actor).then(()=>render());render();}
});
void boot();
