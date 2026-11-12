import { menuResults, pickupAreas } from '../menu-browse.js';
import { areaStrip, browseFilters, prepFilter } from './menu-filters.js';
import { mealPickup } from './kitchen-status.js';
import { savingsPanel } from './savings.js';
import { estimatedPreparationSavedMinutes } from '../../shared/savings.js';
import { foodCheck, isClosed } from '../../shared/features.js';
import { foodSummary, photo, favouriteStrip, policySummary } from './personal.js';
import { money, time, atRisk, type Proposal, type PublicOrder } from '../../shared/model.js';
import type { ViewState } from '../state.js';
import { esc, icon, localValue, short, statusLabel } from '../ui.js';
import { timetableSection } from './timetable.js';
import { savedBreaksSection } from './apspace.js';

export const mobileBasket = (): boolean => typeof matchMedia === 'function' && matchMedia('(max-width: 860px)').matches;

function mobileBasketDock(s: ViewState): string {
    const count = s.cart.reduce((n, c) => n + c.quantity, 0);
    const total = s.cart.reduce((n, c) => n + (s.items.find(i => i.id === c.itemId && i.vendorId === c.vendorId)?.priceSen ?? 0) * c.quantity, 0);
    return `<div class="bb-mobile-dock" aria-label="Meal planning shortcuts"><button id="mobile-basket-button" class="bb-mobile-cart" data-action="show-basket" aria-haspopup="dialog" aria-expanded="${s.mobileBasketOpen}">${icon('bag')}<span>Your basket<small>${count ? `${count} ${count === 1 ? 'item' : 'items'} · ${money(total)}` : 'Add your next meal'}</small></span>${icon('arrow')}</button><button id="mobile-break-button" class="bb-mobile-break" data-action="open-break-plan" aria-haspopup="dialog" ${s.uncertain?'disabled':''}>${icon('clock')}<span>Fit my break<small>${s.fitBreak?'Preferences on':'Plan your time'}</small></span></button></div>`;
}

function breakForm(s: ViewState): string {
    const value = (name: string, fallback: string | number) => esc(s.planDraft[name] ?? fallback);
    return `<form id="plan-form" class="bb-plan">
        ${s.timetable.applied ? `<p class="bb-small">Times from your ${s.timetable.appliedSaved ? 'saved' : 'APSpace'} timetable.</p>` : s.manualPlan ? '<p class="bb-small">Manually edited time preferences.</p>' : ''}
        <label>Available from (MYT)<input id="plan-start" name="breakStartAt" type="datetime-local" step="0.001" value="${value('breakStartAt', localValue(s.plan.breakStartAt, true))}" required></label>
        <label>Next commitment (MYT)<input name="nextClassAt" type="datetime-local" step="0.001" value="${value('nextClassAt', localValue(s.plan.nextClassAt, true))}" required></label>
        <div class="bb-two"><label>Food budget (RM)<input name="budget" type="number" min="1" max="500" step=".01" value="${value('budget', s.plan.budgetSen / 100)}" required></label>
        <label>Time to eat (min)<input name="eatMinutes" type="number" min="0" max="60" value="${value('eatMinutes', s.plan.eatMinutes)}" required></label></div>
        <button class="bb-button secondary" type="submit" ${s.uncertain ? 'disabled' : ''}>Apply time preferences</button></form>`;
}

export function basket(s: ViewState): string {
    const ids = [...new Set(s.cart.map(c => c.vendorId))];
    const potential = Math.max(0, ...s.cart.map(c => s.items.find(i => i.id === c.itemId && i.vendorId === c.vendorId)?.prepMinutes ?? 0));
    const total = s.cart.reduce((n, c) => n + (s.items.find(i => i.id === c.itemId && i.vendorId === c.vendorId)?.priceSen ?? 0) * c.quantity, 0);
    const content = `<aside id="basket" class="bb-basket" tabindex="-1"><div class="bb-section-head"><div><h2 id="basket-title">Your basket <span class="bb-badge">${s.cart.reduce((n,c)=>n+c.quantity,0)}</span></h2><p class="bb-basket-caption">One basket. Separate kitchen pickups.</p></div><button class="bb-basket-close" data-action="close-basket" aria-label="Close basket">${icon('x')}</button><span class="bb-basket-icon">${icon('bag')}</span></div><div class="bb-basket-scroll">
    ${!ids.length ? '<div class="bb-empty-mini">A little hungry?<br><small>Add something you love. Mix food and drinks from different kitchens.</small></div>' : ids.map(id => `<section class="bb-cart-group"><h3>${icon('store')}${esc(s.vendors.find(v=>v.id===id)?.name)}</h3>${s.cart.filter(c=>c.vendorId===id).map(c=>{
        const i = s.items.find(i=>i.id===c.itemId && i.vendorId===id);
        return `<div class="bb-cart-line"><div><strong>${esc(i?.name ?? 'Unavailable item')}</strong><small>${i ? money(i.priceSen) : 'Remove this item'}</small></div><div class="bb-stepper"><button aria-label="Remove one ${esc(i?.name)}" data-action="minus" data-vendor="${esc(id)}" data-id="${esc(c.itemId)}">−</button><span>${c.quantity}</span><button aria-label="Add one ${esc(i?.name)}" data-action="plus" data-vendor="${esc(id)}" data-id="${esc(c.itemId)}">+</button></div></div>`;
    }).join('')}</section>`).join('')}
    ${ids.length ? `<div class="bb-total"><span>Estimated total</span><strong>${money(total)}</strong></div><p class="bb-small">Pay separately at each kitchen when you collect. No online charge.</p>` : ''}
    ${ids.length && potential ? `<p class="bb-prep-preview">${icon('clock')} Estimated food waiting time you could save: up to <strong>~${potential} min</strong>.<small>Based on food preparation; actual savings depend on when it is ready. Kitchens may prepare in parallel.</small></p>` : ''}
    <label class="bb-toggle"><input id="fit-toggle" type="checkbox" ${s.fitBreak?'checked':''} ${s.uncertain?'disabled':''}> <span>Fit my break <small>Optional time and budget helper</small></span></label>
    ${s.fitBreak ? savedBreaksSection(s, true) + (s.config?.apspaceConfigured && s.actor ? '' : timetableSection(s)) + breakForm(s) : ''}
    ${s.basketMessages.map(message=>`<p class="bb-warning">${esc(message)}</p>`).join('')}
    <p class="bb-footnote">Kitchen availability is checked before confirmation.</p></div><div class="bb-basket-actions">${s.checkoutError ? `<p class="bb-error" role="alert">${esc(s.checkoutError)}</p>`:''}
    <button class="bb-button primary wide" data-action="review" ${!ids.length||s.busy?'disabled':''}>${s.busy?'Checking…':s.actor?'Choose pickup times':'Sign in to order'} ${icon('arrow')}</button>
    ${s.cart.length&&s.actor?'<button class="bb-text-button" data-action="save-usual">Save basket as a usual order</button>':''}</div></aside>`;
    return mobileBasket() && s.mobileBasketOpen ? `<dialog id="mobile-basket-dialog" class="bb-mobile-basket" aria-labelledby="basket-title">${content}</dialog>` : content;
}
export function explore(s: ViewState): string {
    const activeVendors = s.vendors.filter(v => !v.archived && v.open);
    const filtered = menuResults(s);
    const prepItems = menuResults(s, false);
    const areas = pickupAreas(s.vendors);
    const emptyMessage = s.allergenFilters.length ? 'No meals have reviewed information that passes every selected allergy filter. Try clearing a filter or ask the kitchen directly.' : s.menuDiet!=='all' ? 'No meals with reviewed information match this diet. Clear the diet filter or ask the kitchen for reviewed details.' : 'Try clearing an area, preparation-time, category or search filter.';
    return `<header class="bb-explore-intro"><div><h1>Find food for<br>this break.</h1><p>Compare preparation time, campus location and dietary information before you add a meal.</p></div><div class="bb-explore-facts"><span><strong>${areas.length}</strong> pickup areas</span><span><strong>${filtered.length}</strong> menu items shown</span><span><strong>MYT</strong> pickup times</span></div></header>
    ${savingsPanel(s)}
    <form id="search-form" class="bb-filter-row bb-search-workspace bb-campus-search"><label class="bb-search"><span class="sr-only">Search meals</span>${icon('search')}<input id="search-input" name="search" type="search" placeholder="Search meals or kitchens" value="${esc(s.search)}"></label><label class="bb-kitchen-filter"><span class="sr-only">Kitchen</span><select id="kitchen-filter"><option value="all">All open kitchens</option>${activeVendors.filter(v=>!s.areaFilter||v.location===s.areaFilter).map(v=>`<option value="${esc(v.id)}" ${s.vendorFilter===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label><button class="bb-button primary" type="submit">Find meals</button></form>
    ${areaStrip(s)}
    <div class="bb-page-grid bb-explore-grid"><section class="bb-menu-workspace" aria-label="Campus menu">
    ${browseFilters(s)}
    ${prepFilter(s,prepItems,mobileBasket())}
    ${favouriteStrip(s)}
    <div class="bb-menu-heading"><div><h2>Explore the menu</h2><p>${filtered.length} menu item${filtered.length===1?'':'s'} shown · stock and pickup estimates below</p></div><span>Prep</span><span>Price</span></div>
    <div class="bb-menu-grid bb-meal-register">${filtered.map(i=>{const v=s.vendors.find(v=>v.id===i.vendorId)!;const check=foodCheck(i.foodInfo,s.profile.preferences);const available=v.open&&i.enabled&&i.stock>0&&check.suitable;return `<article class="bb-meal"><div class="bb-meal-art">${photo(i)}<button class="bb-heart ${s.profile.favourites.includes(i.id)?'saved':''}" data-action="favourite" data-id="${esc(i.id)}" aria-label="${s.profile.favourites.includes(i.id)?'Remove favourite':'Favourite'} ${esc(i.name)}" aria-pressed="${s.profile.favourites.includes(i.id)}">${s.profile.favourites.includes(i.id)?'♥':'♡'}</button></div><div class="bb-meal-body"><span class="bb-kitchen-name">${esc(v.name)} · ${esc(v.location)}</span><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p>${foodSummary(i)}<button class="bb-text-button" data-action="food-details" data-id="${esc(i.id)}">Ingredients & dietary details</button>${!check.suitable?`<p class="bb-warning">${esc(check.reasons.join(' '))}</p>`:''}<span class="bb-availability">${!v.open?'Kitchen closed':!i.enabled||i.stock===0?'Currently unavailable':`${i.stock} available`}</span>${mealPickup(s,i)}</div><div class="bb-meal-time"><strong>${i.prepMinutes}</strong><span>min</span></div><div class="bb-card-bottom"><strong>${money(i.priceSen)}</strong><button class="bb-add" data-action="add" data-vendor="${esc(i.vendorId)}" data-id="${esc(i.id)}" ${!available||s.busy?'disabled':''} aria-label="Add ${esc(i.name)}">${available?'+ Add':!check.suitable?'Check diet':'Unavailable'}</button></div></article>`;}).join('') || `<div class="bb-empty"><h3>No meals match.</h3><p>${emptyMessage}</p></div>`}</div>
    <p class="bb-footnote">Preparation and pickup times are estimates. Ask the kitchen about allergens before ordering. Availability is confirmed at checkout.</p></section>${basket(s)}</div>
    ${mobileBasketDock(s)}`;
}
export function proposalCard(p: Proposal, forStudent: boolean): string {
    return `<div class="bb-proposal"><p class="bb-kicker">${forStudent?'A CHOICE FOR YOU':'RECOVERY PROPOSAL'}</p><strong>${esc(p.option.itemName)} × ${p.option.quantity} · ${money(p.option.totalSen)}</strong><p>Proposed pickup: ${time(p.option.readyAt)} · ${esc(p.reason)}</p><small>${p.option.foodInfo?.allergensKnown ? `Contains: ${esc(p.option.foodInfo.allergens.join(', ') || 'none declared')}. May contain: ${esc(p.option.foodInfo.mayContain.join(', ') || 'none declared')}. Ingredients: ${esc(p.option.foodInfo.ingredients)}.` : 'Ingredient/allergen information is incomplete; check with the kitchen.'}</small><div class="bb-actions">${forStudent&&p.status==='approved'?`<button class="bb-button primary" data-action="accept" data-id="${esc(p.id)}" data-vendor="${esc(p.vendorId)}">Accept alternative</button><button class="bb-button secondary" data-action="decline" data-id="${esc(p.id)}" data-vendor="${esc(p.vendorId)}">Keep my order</button>`:!forStudent&&p.status==='pending_vendor'?`<button class="bb-button primary" data-action="approve" data-id="${esc(p.id)}" data-vendor="${esc(p.vendorId)}">Approve for student</button><button class="bb-button secondary" data-action="reject" data-id="${esc(p.id)}" data-vendor="${esc(p.vendorId)}">Reject</button>`:`<span class="bb-tag">${esc(p.status.replaceAll('_',' '))}</span>`}</div></div>`;
}
function orderCard(o: PublicOrder, s: ViewState): string {
    const saved = estimatedPreparationSavedMinutes(o);
    const v=s.vendors.find(v=>v.id===o.vendorId); const slot=s.snapshot?.slots.find(w=>w.id===o.slotId); const closed=isClosed(o.status);
    const now=Date.parse(s.snapshot?.serverTime??new Date().toISOString());
    const delayDeadline=Date.parse(o.promisedPickupEndAt??o.latestPickupAt)+(o.policy?.delayGraceMinutes??5)*60000;
    const vendorLate=!closed&&(Date.parse(o.estimatedReadyAt)>delayDeadline||(o.readyAt?Date.parse(o.readyAt)>delayDeadline:now>delayDeadline));
    const cancellable=vendorLate||(o.status==='confirmed'&&(!o.cancelBeforeAt||now<Date.parse(o.cancelBeforeAt)));
    return `<article class="bb-order"><div class="bb-section-head"><div><h3>${esc(v?.name)}</h3><span class="bb-small">Order ${short(o.id)} · ${esc(v?.location)}</span></div><span class="bb-status ${o.status}">${statusLabel(o.status)}</span></div>
    ${o.lines.map(l=>`<div class="bb-receipt-line"><span>${l.quantity} × ${esc(l.name)}${l.foodInfo?`<small>Declared allergens: ${esc(l.foodInfo.allergens.join(', ')||'none declared')}${l.foodInfo.mayContain.length?`; may contain ${esc(l.foodInfo.mayContain.join(', '))}`:''}</small>`:''}</span><strong>${money(l.unitPriceSen*l.quantity)}</strong></div>`).join('')}
    <div class="bb-order-meta"><div><small>Pickup window</small><strong>${slot?`${time(slot.startAt)}–${time(slot.endAt)}`:time(o.estimatedReadyAt)}</strong></div><div><small>${o.paymentStatus==='paid'?'Paid at counter':o.status==='cancelled'?'Cancelled · no amount due':'Due at this counter'}</small><strong>${o.status==='cancelled'?money(0):money(o.totalSen)}</strong></div></div>
    ${saved !== null ? `<p class="bb-order-saving">${icon('clock')} Estimated prep wait avoided: <strong>~${saved} min</strong></p>` : ''}
    ${atRisk(o)?`<p class="bb-warning">Kitchen update: expected ready at ${time(o.estimatedReadyAt)}. Check here for alternatives or contact the counter.</p>`:''}
    ${!closed?`<div class="bb-pickup-code"><div><small>Show this code to the kitchen</small><strong>${esc(o.pickupCode)}</strong></div><button class="bb-button secondary" data-action="qr" data-id="${esc(o.id)}" data-vendor="${esc(o.vendorId)}">Show pickup QR</button></div><p class="bb-small">Each kitchen has its own pickup code. Pay for this order at this counter.</p>`:''}
    ${s.snapshot?.proposals.filter(p=>p.orderId===o.id&&p.status==='approved').map(p=>proposalCard(p,true)).join('')??''}
    ${cancellable?`<button class="bb-text-button" data-action="cancel" data-id="${esc(o.id)}" data-vendor="${esc(o.vendorId)}">Cancel this kitchen’s order</button>`:''}
    ${o.collectionDueAt&&!closed?`<p class="${o.overdueAt?'bb-warning':'bb-small'}">${o.overdueAt?'Pickup overdue. Contact the kitchen.':'Collection grace ends at'} ${time(o.collectionDueAt)}. This is a collection policy, not a food-safety guarantee.</p>`:''}
    ${o.status==='uncollected'?`<p class="bb-warning">Marked uncollected: ${esc(o.closedReason)}. Contact the kitchen to dispute the record. No automatic penalty.</p>`:''}
    ${o.status==='confirmed'?`<button class="bb-button secondary" data-action="help-order" data-id="${esc(o.id)}" data-vendor="${esc(o.vendorId)}">Need a faster option?</button>`:''}
    ${s.earlier[o.id]?`<section class="bb-help-options"><p>${esc(s.earlier[o.id]!.message)}</p>${s.earlier[o.id]!.slots.slice(0,4).map(w=>`<button class="bb-button secondary" data-action="move-earlier" data-id="${esc(o.id)}" data-vendor="${esc(o.vendorId)}" data-slot="${esc(w.id)}">Same meal · ${time(w.startAt)}–${time(w.endAt)}</button>`).join('')}${s.recovery[o.id]?.options.slice(0,4).map((option,index)=>`<div class="bb-option"><div><strong>${esc(option.itemName)}</strong><small>${money(option.totalSen)} · ${time(option.readyAt)}</small></div><button class="bb-button secondary" data-action="ask-alternative" data-id="${esc(o.id)}" data-vendor="${esc(o.vendorId)}" data-index="${index}">Request alternative</button></div>`).join('')??''}<p class="bb-small">Alternative meals need kitchen approval and your confirmation. No other order is moved.</p></section>`:''}</article>`;
}
export function orders(s: ViewState): string {
    const orders=s.snapshot?.orders??[]; const groups=[...new Set(orders.map(o=>o.checkoutId??o.id))];
    return savingsPanel(s) + `<section class="bb-page-heading"><p class="bb-kicker">FROM KITCHEN TO COUNTER</p><h1>Your orders</h1><p>One basket. Separate kitchen pickups. Updates refresh every five seconds.</p></section>${s.success?`<p class="bb-success" role="status">${esc(s.success)}</p>`:''}
    ${!groups.length?'<div class="bb-empty"><h2>Your next meal starts here.</h2><p>No orders yet. Explore the menu and choose a pickup time.</p><button class="bb-button primary" data-view="explore">Find something good</button></div>':groups.map(id=>{const children=orders.filter(o=>(o.checkoutId??o.id)===id);const total=children.filter(o=>o.status!=='cancelled').reduce((n,o)=>n+o.totalSen,0);return `<section class="bb-order-group"><div class="bb-section-head"><div><p class="bb-kicker">CHECKOUT ${short(id)}</p><h2>${children.length} kitchen${children.length>1?'s':''} · ${money(total)}</h2></div><span class="bb-small">${new Intl.DateTimeFormat('en-MY',{dateStyle:'medium',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(children[0]!.createdAt))}</span></div><button class="bb-button secondary" data-action="reorder" data-id="${esc(id)}">Order again · review first</button><div class="bb-order-grid">${children.map(o=>orderCard(o,s)).join('')}</div></section>`;}).join('')}`;
}
export function checkoutDialog(s: ViewState): string {
    if(!s.quote)return '';
    return `<dialog id="checkout-dialog" class="bb-dialog" aria-labelledby="checkout-title"><button class="bb-close" data-action="close-checkout" aria-label="Close checkout">×</button><p class="bb-kicker">MAKE IT YOUR PICKUP</p><h2 id="checkout-title">Choose a time for each kitchen.</h2><p class="bb-muted">Your basket becomes separate kitchen orders. If any kitchen cannot accept it, none of this checkout is placed.</p><form id="checkout-form">${s.quote.groups.map(q=>{const v=s.vendors.find(v=>v.id===q.vendorId)!;return `<section class="bb-checkout-kitchen"><div class="bb-section-head"><h3>${esc(v.name)}</h3><strong>${money(q.totalSen)}</strong></div><p class="bb-small">${esc(v.location)}</p>${policySummary(s,q.vendorId)}${s.cart.filter(l=>l.vendorId===q.vendorId).map(l=>{const i=s.items.find(i=>i.id===l.itemId);return i?`<details><summary>${l.quantity} × ${esc(i.name)} · ingredient information</summary><p>${esc(i.foodInfo?.ingredients||'Ingredients not provided')}</p>${foodSummary(i)}</details>`:'';}).join('')}<label>Pickup window (MYT)<select name="slot:${esc(q.vendorId)}" data-slot-vendor="${esc(q.vendorId)}" required><option value="">Choose a pickup time</option>${q.slots.map(w=>`<option value="${esc(w.id)}" ${s.chosen[q.vendorId]===w.id?'selected':''}>${time(w.startAt)}–${time(w.endAt)}</option>`).join('')}</select></label>${q.reasons.map(r=>`<p class="bb-error">${esc(r)}</p>`).join('')}</section>`;}).join('')}
    ${s.quote.groups.length>1?`<label>Walking between counters (minutes)<input name="transferMinutes" type="number" min="0" max="15" value="${s.transferMinutes}" required></label><p class="bb-small">Pick staggered windows. We allow one minute per counter handover plus your walking estimate; this is not indoor navigation.</p>`:''}
    <div class="bb-total"><span>Total due at pickup</span><strong>${money(s.quote.totalSen)}</strong></div><p class="bb-small">Pay each kitchen separately. Nothing is charged online. Cancellation follows each kitchen’s displayed cutoff, preparation state and vendor-delay policy.</p>
    ${s.checkoutError?`<p class="bb-error" role="alert">${esc(s.checkoutError)}</p>`:''}${s.quote.reasons.length?`<p class="bb-error">${esc(s.quote.reasons.join(' '))}</p>`:''}
    <button class="bb-button primary wide" type="submit" ${s.busy||s.quote.reasons.length?'disabled':''}>${s.busy?'Confirming…':'Confirm all kitchen orders'}</button></form></dialog>`;
}
