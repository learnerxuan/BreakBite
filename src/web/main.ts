import type { AppConfig, BreakPlan, MenuItem, Proposal, PublicOrder, Quote, RecoveryOption, Selection, Snapshot } from '../shared/model.js';
import { atRisk, money, time } from '../shared/model.js';
import { api, configure, demoLogin, firebaseLogin, hasSession, logout } from './client.js';
const root = document.querySelector<HTMLDivElement>('#app')!;
const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const minutes = (n: number): string => `${n} min`;
const localValue = (iso: string): string => new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 16);
const fromLocal = (value: FormDataEntryValue | null): string => new Date(`${String(value)}+08:00`).toISOString();
const short = (id: string) => id.slice(0, 8).toUpperCase();
const pill = (label: string, kind = '') => `<span class="pill ${kind}">${esc(label)}</span>`;
const icons: Record<string, string> = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    leaf: '<path d="M20 4C7 2 2 9 6 16c6 6 15 0 14-12Z"/><path d="M4 20 15 9"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    store: '<path d="M4 10v11h16V10M3 4h18l1 6a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2l1-6Z"/><path d="M9 21v-6h6v6"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v1"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-7-4h11"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.grid}</svg>`;
const art = (kind: MenuItem['art'], large = false) => `<div class="food-art art-${kind} ${large ? 'large' : ''}" aria-hidden="true"><div class="food-shadow"></div><div class="plate"><div class="grain"></div><div class="topping one"></div><div class="topping two"></div><div class="topping three"></div><div class="greens"></div><div class="garnish"></div></div><div class="art-dot dot-one"></div><div class="art-dot dot-two"></div></div>`;
let config: AppConfig;
let snapshot: Snapshot | null = null;
let plan: BreakPlan;
let view: 'explore' | 'orders' | 'vendor' = 'explore';
let vendorTab: 'queue' | 'menu' | 'rescue' | 'activity' = 'queue';
let category = 'All meals';
let vendorFilter = 'all';
let search = '';
let fitsOnly = false;
let cart: Selection[] = [];
let cartVendor = '';
let quotes: Record<string, Quote> = {};
let recovery: Record<string, {
    options: RecoveryOption[];
    message: string;
}> = {};
let checkout: {
    quote: Quote;
    key: string;
    slotId: string;
} | null = null;
let busy = false;
let offline = false;
let fingerprint = '';
let toastTimer: ReturnType<typeof setTimeout>;
let quoteGeneration = 0;
function notify(message: string, error = false): void {
    const toast = document.querySelector<HTMLDivElement>('#toast')!;
    toast.textContent = message;
    toast.className = `show ${error ? 'error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = ''; }, 5500);
}
function defaultPlan(now: string): BreakPlan {
    const start = Math.ceil((Date.parse(now) + 5 * 60000) / 300000) * 300000;
    return { breakStartAt: new Date(start).toISOString(), nextClassAt: new Date(start + 65 * 60000).toISOString(), walkToMinutes: 3, eatMinutes: 12, returnMinutes: 5, bufferMinutes: 3, budgetSen: 1500 };
}
async function refreshQuotes(): Promise<void> {
    if (!snapshot || snapshot.actor.role !== 'student')
        return;
    const generation = ++quoteGeneration;
    const results = await Promise.all(snapshot.items.map(async (item) => {
        try {
            return [item.id, await api<Quote>('/api/quote', 'POST', { vendorId: item.vendorId, items: [{ itemId: item.id, quantity: 1 }], plan })] as const;
        }
        catch {
            return [item.id, undefined] as const;
        }
    }));
    if (generation === quoteGeneration)
        quotes = Object.fromEntries(results.filter((x): x is readonly [
            string,
            Quote
        ] => !!x[1]));
}
async function refresh(force = false): Promise<void> {
    const next = await api<Snapshot>('/api/state');
    offline = false;
    const changed = JSON.stringify({ ...next, serverTime: '' });
    const needsUpdate = fingerprint !== changed || force;
    snapshot = next;
    if (!plan)
        plan = defaultPlan(next.serverTime);
    if (snapshot.actor.role === 'vendor')
        view = 'vendor';
    else if (view === 'vendor')
        view = 'explore';
    if (needsUpdate) {
        fingerprint = changed;
        await refreshQuotes();
    }
    if (needsUpdate || force)
        render();
}
async function act(work: () => Promise<void>, success = ''): Promise<void> {
    if (busy)
        return;
    busy = true;
    render();
    try {
        await work();
        await refresh(true);
        if (success)
            notify(success);
    }
    catch (error) {
        notify(error instanceof Error ? error.message : 'Please retry.', true);
        if (!hasSession())
            snapshot = null;
    }
    finally {
        busy = false;
        render();
    }
}
function loginView(): string {
    return `<main id="main" class="login-page"><section class="login-story"><a class="brand" href="/"><span class="brand-mark">b</span>BreakBite<span class="brand-dot">.</span></a><div><p class="eyebrow">A BETTER KIND OF LUNCH BREAK</p><h1>Less waiting.<br>More living.</h1><p class="lede">Good food should fit your day.<br>Find your meal. Pick your moment. Get back to you.</p></div>${art('rice', true)}<p class="small">Smart Campus & Student Experience · ByteShift (working team name)</p></section><section class="login-panel"><div class="login-card"><span class="small-icon">${icon('bag')}</span><h2>Your next break<br>starts here.</h2><p class="muted">${config.mode === 'demo' ? 'Explore the complete workflow with synthetic students, kitchens and meals. No account or payment required.' : 'Sign in to plan a meal around your class break.'}</p>${config.mode === 'demo' ? `<div class="notice">Local demo only. Accounts below are intentionally switchable; no real student data or payments.</div><div class="demo-options">${config.demoIdentities.map(a => `<button class="demo-person" data-action="login" data-id="${esc(a.id)}" ${busy ? 'disabled' : ''}><span class="avatar ${a.role}">${icon(a.role === 'student' ? 'bag' : 'store')}</span><span><strong>${esc(a.name)}</strong><small>${a.role === 'student' ? 'Browse, pre-order and review alternatives' : 'Prepare orders, report delays and approve rescue'}</small></span>${icon('arrow')}</button>`).join('')}</div>` : `<form id="login-form"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" required></label><button class="btn primary full" type="submit" value="login" ${busy ? 'disabled' : ''}>Sign in ${icon('arrow')}</button><button class="btn subtle full" type="submit" value="signup" ${busy ? 'disabled' : ''}>Create student account</button></form><p class="small muted">Vendor access is assigned by the project administrator, never by a role selector.</p>`}<p class="fineprint">All displayed kitchens and menus are pilot fixtures. Preparation and pickup times are estimates, not guarantees.</p></div></section></main>`;
}
function shell(content: string): string {
    const actor = snapshot!.actor;
    const active = snapshot!.orders.filter(o => !['collected', 'cancelled'].includes(o.status)).length;
    return `<div class="app-shell"><aside class="sidebar"><a href="/" class="brand"><span class="brand-mark">b</span>BreakBite<span class="brand-dot">.</span></a><p class="sidebar-tag">Your break. Your bite.</p><span class="nav-label">YOUR CAMPUS TABLE</span><nav aria-label="Main navigation">${actor.role === 'student' ? `<button data-view="explore" class="nav-link ${view === 'explore' ? 'active' : ''}">${icon('grid')}Explore meals</button><button data-view="orders" class="nav-link ${view === 'orders' ? 'active' : ''}">${icon('bag')}My orders ${active ? `<span class="count">${active}</span>` : ''}</button>` : `<button data-view="vendor" class="nav-link active">${icon('store')}Kitchen workspace</button>`}</nav><div class="sidebar-help"><div class="tiny-spark">${icon('spark')}</div><strong>A little planning.<br>A better break.</strong><p>We check your time window and the kitchen’s capacity before confirming.</p></div><div class="sidebar-bottom"><span class="green-dot"></span> Built for campus life<small>Prototype · simulated payments</small></div></aside><div class="page-shell"><header class="topbar"><div class="campus-label">${icon('pin')}<span>Campus food court<small>Two demo kitchens · Malaysia time</small></span></div><div class="topbar-right"><span class="sync-status ${offline ? 'disconnected' : ''}"><span class="green-dot"></span>${offline ? 'Reconnecting' : 'Updates every 5s'}</span>${config.mode === 'demo' ? `<label class="account-label"><span class="sr-only">Switch demo account</span><select id="account-switch" aria-label="Switch demo account">${config.demoIdentities.map(a => `<option value="${esc(a.id)}" ${a.id === actor.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : `<span class="account-name">${esc(actor.name)}</span>`}<button class="icon-btn" data-action="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button></div></header><div class="mobile-nav">${actor.role === 'student' ? `<button data-view="explore" class="${view === 'explore' ? 'selected' : ''}">Explore meals</button><button data-view="orders" class="${view === 'orders' ? 'selected' : ''}">My orders ${active ? `(${active})` : ''}</button>` : '<strong>Kitchen workspace</strong>'}${pill(config.mode === 'demo' ? 'Local demo' : 'Pilot', 'neutral')}</div><main id="main" class="page-content">${content}</main><footer class="page-footer"><span>BreakBite · Meals that fit your class break.</span><span>Synthetic menus. No real payments. ${config.mode === 'demo' ? 'Local demo mode.' : 'Firebase sign-in.'}</span></footer></div></div>${checkout ? checkoutDialog() : ''}`;
}
function planPanel(): string {
    const latest = new Date(Date.parse(plan.nextClassAt) - (plan.eatMinutes + plan.returnMinutes + plan.bufferMinutes) * 60000).toISOString();
    const total = cart.reduce((n, line) => n + (snapshot!.items.find(x => x.id === line.itemId)?.priceSen ?? 0) * line.quantity, 0);
    return `<aside class="planner-column"><section class="panel break-planner"><div class="panel-heading"><span class="square-icon">${icon('clock')}</span><div><h2>Make it fit.</h2><p>Your class comes first.</p></div></div><form id="plan-form"><label>My break starts at <span>MYT</span><input type="datetime-local" id="break-start" name="breakStartAt" value="${localValue(plan.breakStartAt)}" required></label><label>My next class is at <span>MYT</span><input type="datetime-local" id="next-class" name="nextClassAt" value="${localValue(plan.nextClassAt)}" required></label><div class="input-row"><label>Meal budget <span>RM</span><input type="number" id="budget" name="budget" min="1" max="500" step="0.5" value="${plan.budgetSen / 100}" required></label><label>Time to eat <span>min</span><input type="number" id="eating" name="eatMinutes" min="0" max="60" value="${plan.eatMinutes}" required></label></div><details class="time-details"><summary>Walking time & safety buffer</summary><div class="three-inputs">${[['walkToMinutes', 'To food', plan.walkToMinutes], ['returnMinutes', 'To class', plan.returnMinutes], ['bufferMinutes', 'Buffer', plan.bufferMinutes]].map(([name, label, value]) => `<label>${label}<input type="number" name="${name}" value="${value}" min="${name === 'bufferMinutes' ? 1 : 0}" max="${name === 'bufferMinutes' ? 15 : 30}" required></label>`).join('')}</div><p class="small muted">Minutes. Enter 0 eating time for takeaway. No full timetable is collected.</p></details><div class="deadline"><span>${icon('check')}Latest planned pickup</span><strong>${time(latest)}</strong><small>Leaves time to eat, walk back and breathe.</small></div><button type="submit" class="btn primary full" ${busy ? 'disabled' : ''}>Find my pickup windows ${icon('arrow')}</button></form></section><section class="panel basket-panel"><div class="section-line"><h2>Your lunch bag</h2>${pill(`${cart.reduce((n, x) => n + x.quantity, 0)} items`, 'neutral')}</div>${cart.length ? `<div class="basket-items">${cart.map(line => { const item = snapshot!.items.find(x => x.id === line.itemId)!; return `<div class="basket-line"><div><strong>${esc(item.name)}</strong><small>${money(item.priceSen)}</small></div><div class="quantity"><button data-action="remove" data-id="${esc(item.id)}" aria-label="Remove one ${esc(item.name)}">−</button><span>${line.quantity}</span><button data-action="add" data-id="${esc(item.id)}" aria-label="Add one ${esc(item.name)}">+</button></div></div>`; }).join('')}</div><div class="basket-total"><span>Simulated total</span><strong>${money(total)}</strong></div><button class="btn dark full" data-action="checkout" ${busy ? 'disabled' : ''}>Choose pickup time ${icon('arrow')}</button><p class="fineprint">One kitchen per order. No charge is made.</p>` : `<div class="empty-basket">${icon('bag')}<p>A good break starts<br>with something delicious.</p></div>`}</section><div class="quiet-note">${icon('leaf')}<p>Pickup, not delivery.<br><strong>More of your break belongs to you.</strong></p></div></aside>`;
}
function mealCard(item: MenuItem): string {
    const q = quotes[item.id];
    const slot = q?.slots[0];
    const vendor = snapshot!.vendors.find(x => x.id === item.vendorId)!;
    const unavailable = !item.enabled || item.stock < 1 || !vendor.open;
    return `<article class="meal-card ${unavailable ? 'unavailable' : ''}"><div class="meal-visual visual-${item.art}">${art(item.art)}<span class="meal-tag">${esc(item.tags[0] ?? 'Campus meal')}</span>${slot && !unavailable ? `<span class="fit-badge">${icon('check')}Fits your break</span>` : ''}</div><div class="meal-info"><div class="meal-vendor">${esc(vendor.name)}<span>•</span>${esc(item.category)}</div><h3>${esc(item.name)}</h3><p class="meal-description">${esc(item.description)}</p><div class="meal-pickup">${icon('clock')}<span>${unavailable ? 'Currently unavailable' : slot ? `Pickup ${time(slot.startAt)}–${time(slot.endAt)}` : 'Adjust your break to find a slot'}</span></div><div class="meal-bottom"><strong>${money(item.priceSen)}</strong><button class="add-btn" data-action="add" data-id="${esc(item.id)}" aria-label="Add ${esc(item.name)}" ${unavailable || busy ? 'disabled' : ''}>Add <span>+</span></button></div></div></article>`;
}
function filteredItems(): MenuItem[] {
    return snapshot!.items.filter(x => (category === 'All meals' || x.category === category) && (vendorFilter === 'all' || x.vendorId === vendorFilter) && (!fitsOnly || !!quotes[x.id]?.slots.length) && `${x.name} ${x.description}`.toLowerCase().includes(search.toLowerCase()));
}
function explore(): string {
    const matches = filteredItems();
    return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="green-dot"></span> YOUR BREAK, BETTER</p><h1>Good food.<br><em>Right on time.</em></h1><p>Pre-order your campus favourites.<br>Spend your break eating, not waiting.</p><div class="hero-points"><span>${icon('check')}Capacity-checked pickup</span><span>${icon('check')}No delivery detours</span></div></div><div class="hero-art">${art('rice', true)}<div class="floating-label">${icon('clock')}<div><strong>Made for your schedule</strong><small>Time to eat. Time to get back.</small></div></div><span class="hero-doodle">a little break<br>goes a long way ↗</span></div></section><div class="explore-grid"><section class="menu-section"><div class="section-heading"><div><p class="eyebrow">ON THE MENU</p><h2>What sounds good?</h2></div><label class="search-box">${icon('search')}<input id="meal-search" type="search" placeholder="Find your next bite" value="${esc(search)}" aria-label="Search meals"></label></div><div class="categories" role="group" aria-label="Meal categories">${['All meals', 'Rice', 'Noodles', 'Light bites', 'Drinks'].map(c => `<button data-category="${c}" class="${category === c ? 'active' : ''}">${c === 'All meals' ? icon('grid') : ''}${c}</button>`).join('')}</div><div class="menu-tools"><label><select id="vendor-filter" aria-label="Filter by kitchen"><option value="all">All kitchens</option>${snapshot!.vendors.map(v => `<option value="${v.id}" ${vendorFilter === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label><label class="checkbox-label"><input id="fits-only" type="checkbox" ${fitsOnly ? 'checked' : ''}>Only meals that fit</label><span id="meal-count" class="small muted">${matches.length} choices</span></div><div class="meal-grid" id="meal-grid">${matches.length ? matches.map(mealCard).join('') : '<div class="empty-state"><h3>No meals match just yet.</h3><p>Try another category, increase your break window, or clear the time filter.</p></div>'}</div><p class="menu-disclaimer">Illustrated demo menus, not actual APU vendors. Allergy information is unverified; ask the operator before ordering.</p></section>${planPanel()}</div>`;
}
const statusLabel = (status: string) => ({ confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready to collect', collected: 'Collected', cancelled: 'Cancelled' })[status] ?? status;
function proposalCard(p: Proposal, studentView: boolean): string {
    return `<div class="proposal-card"><div class="section-line"><span class="rescue-label">${icon('spark')}Meal Rescue</span>${pill(p.status.replace('_', ' '), p.status === 'accepted' ? 'green' : 'amber')}</div><h4>${esc(p.option.itemName)} <span>× ${p.option.quantity}</span></h4><p>Ready by ${time(p.option.readyAt)} · ${money(p.option.totalSen)} · expires ${time(p.expiresAt)}</p><p class="small muted">${esc(p.reason)}</p><p class="small">${p.option.allergens === null ? 'Allergen information unknown. Check with the vendor.' : `Vendor-listed allergens: ${esc(p.option.allergens.join(', '))}`}</p>${studentView && p.status === 'approved' ? `<div class="button-row"><button class="btn primary small-btn" data-action="respond" data-id="${p.id}" data-vendor="${p.vendorId}" data-accept="true" ${busy ? 'disabled' : ''}>Accept replacement</button><button class="btn subtle small-btn" data-action="respond" data-id="${p.id}" data-vendor="${p.vendorId}" data-accept="false" ${busy ? 'disabled' : ''}>Keep original</button></div><small class="muted">Availability is checked again when you accept. Simulated totals only.</small>` : !studentView && p.status === 'pending_vendor' ? `<div class="button-row"><button class="btn primary small-btn" data-action="approve" data-id="${p.id}" data-accept="true" ${busy ? 'disabled' : ''}>Approve & send</button><button class="btn subtle small-btn" data-action="approve" data-id="${p.id}" data-accept="false" ${busy ? 'disabled' : ''}>Reject</button></div>` : ''}${!studentView ? `<small class="muted">Source: ${p.source === 'mcp' ? 'Authenticated MCP tool' : 'Manual rules-based preview'} · order ${short(p.orderId)}</small>` : ''}</div>`;
}
function studentOrder(order: PublicOrder): string {
    const vendor = snapshot!.vendors.find(x => x.id === order.vendorId)!;
    const isRisk = atRisk(order);
    const completed = ['cancelled', 'collected'].includes(order.status);
    const steps = ['confirmed', 'preparing', 'ready', 'collected'];
    const progress = steps.indexOf(order.status);
    return `<article class="order-card"><div class="order-top"><div><span class="small muted">${esc(vendor.name)} · #${short(order.id)}</span><h3>${order.lines.map(x => `${esc(x.name)}${x.quantity > 1 ? ` × ${x.quantity}` : ''}`).join(' + ')}</h3></div>${pill(statusLabel(order.status), order.status === 'ready' || order.status === 'collected' ? 'green' : 'neutral')}</div>${order.status !== 'cancelled' ? `<div class="order-steps" aria-label="Order progress">${steps.map((step, i) => `<div class="${i <= progress ? 'done' : ''}"><span>${i <= progress ? icon('check') : i + 1}</span><small>${statusLabel(step)}</small></div>`).join('')}</div>` : ''}<div class="order-details"><div><small>Estimated ready</small><strong>${time(order.estimatedReadyAt)}</strong></div><div><small>Your pickup deadline</small><strong>${time(order.latestPickupAt)}</strong></div><div><small>Simulated total</small><strong>${money(order.totalSen)}</strong></div></div>${isRisk ? `<div class="warning">${icon('alert')}<p><strong>Your pickup window is at risk.</strong><br>The kitchen reported a delay. A replacement requires your confirmation; your meal will not change automatically.</p></div>` : ''}${!completed && order.pickupCode ? `<div class="pickup-pass"><div><span>YOUR ONE-TIME PICKUP CODE</span><strong>${esc(order.pickupCode)}</strong><small>Show only to the operator when your order is ready.</small></div><button class="btn subtle small-btn" data-action="copy" data-code="${esc(order.pickupCode)}">Copy code</button></div>` : ''}<div class="order-foot"><span>${icon('pin')}${esc(vendor.location)}</span>${order.status === 'confirmed' ? `<button class="text-btn danger-text" data-action="cancel" data-id="${order.id}" data-vendor="${order.vendorId}" ${busy ? 'disabled' : ''}>Cancel before preparation</button>` : ''}</div>${snapshot!.proposals.filter(p => p.orderId === order.id && ['approved', 'accepted'].includes(p.status)).map(p => proposalCard(p, true)).join('')}</article>`;
}
function orders(): string {
    return `<div class="page-title"><div><p class="eyebrow">YOUR BREAK IS BOOKED</p><h1>From kitchen to you.</h1><p>Follow your meal, review changes, and collect when it is ready.</p></div><button class="btn subtle" data-view="explore">Explore more meals ${icon('arrow')}</button></div><div class="orders-layout"><section class="order-list">${snapshot!.orders.length ? snapshot!.orders.map(studentOrder).join('') : `<div class="empty-state big">${icon('bag')}<h2>Your first bite is waiting.</h2><p>Choose a meal and a pickup window to see your order here.</p><button class="btn primary" data-view="explore">Explore meals ${icon('arrow')}</button></div>`}</section><aside class="panel order-tips"><span class="square-icon">${icon('clock')}</span><h2>A smoother pickup.</h2><p>Wait for <strong>Ready to collect</strong>, then head to your kitchen’s counter.</p><hr><p>Your code works once. Sharing it can let someone else collect your food.</p><hr><p>Need to cancel? You can do so before the kitchen starts preparing.</p><span class="small muted">No real payment or refund is processed in this prototype.</span></aside></div>`;
}
function vendorOrder(order: PublicOrder): string {
    const options = recovery[order.id];
    return `<article class="kitchen-order ${atRisk(order) ? 'risk-order' : ''}"><div class="section-line"><strong>#${short(order.id)}</strong>${pill(atRisk(order) ? 'Deadline at risk' : statusLabel(order.status), atRisk(order) ? 'amber' : order.status === 'ready' ? 'green' : 'neutral')}</div><h3>${order.lines.map(x => `${x.quantity} × ${esc(x.name)}`).join('<br>')}</h3><div class="kitchen-times"><span>Estimated ready <strong>${time(order.estimatedReadyAt)}</strong></span><span>Student deadline <strong>${time(order.latestPickupAt)}</strong></span></div><div class="button-row">${order.status === 'confirmed' ? `<button class="btn dark small-btn" data-action="status" data-id="${order.id}" data-status="preparing" ${busy ? 'disabled' : ''}>Start preparing</button>` : order.status === 'preparing' ? `<button class="btn primary small-btn" data-action="status" data-id="${order.id}" data-status="ready" ${busy ? 'disabled' : ''}>Mark ready</button>` : ''}${atRisk(order) && order.status === 'confirmed' ? `<button class="btn rescue-btn small-btn" data-action="evaluate" data-id="${order.id}" ${busy ? 'disabled' : ''}>${icon('spark')}Evaluate rescue</button>` : ''}</div>${order.status === 'ready' ? `<form class="collect-form" data-order="${order.id}"><label class="sr-only" for="collect-${order.id}">Pickup code for ${short(order.id)}</label><input id="collect-${order.id}" name="code" placeholder="Student’s pickup code" autocomplete="off" maxlength="10" required><button class="btn primary small-btn" ${busy ? 'disabled' : ''}>Verify & collect</button></form>` : ''}${options ? `<div class="recovery-options"><p class="small muted">Rules-based preview · not an AI execution</p><p class="small">${esc(options.message)}</p>${options.options.map((option, i) => `<div class="recovery-option"><span><strong>${esc(option.itemName)} × ${option.quantity}</strong><small>${time(option.readyAt)} · ${money(option.totalSen)}</small></span><button class="btn subtle small-btn" data-action="proposal" data-id="${order.id}" data-index="${i}" ${busy ? 'disabled' : ''}>Create proposal</button></div>`).join('')}</div>` : ''}</article>`;
}
function incidentPanel(): string {
    const vendorId = snapshot!.actor.vendorId!;
    return `<aside class="kitchen-side"><section class="panel"><div class="section-line"><h2>Something changed?</h2>${icon('alert')}</div><p class="muted small">Report a real kitchen delay. Estimates update immediately; existing meals are never swapped automatically.</p><form id="incident-form"><label>Affected item<select name="itemId"><option value="">Entire kitchen</option>${snapshot!.items.filter(x => x.vendorId === vendorId).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>Additional delay <span>minutes</span><input name="delayMinutes" type="number" value="15" min="1" max="120" required></label><label>What happened?<input name="reason" placeholder="e.g. Rice cooker delayed" minlength="3" maxlength="240" required></label><button class="btn dark full" ${busy ? 'disabled' : ''}>Report delay ${icon('arrow')}</button></form>${snapshot!.incidents.filter(x => x.active).map(x => `<div class="active-incident"><strong>${esc(x.reason)}</strong><span>+${x.delayMinutes} min · ${x.itemIds.length ? 'Selected meals' : 'Whole kitchen'}</span><button class="text-btn" data-action="resolve" data-id="${x.id}" ${busy ? 'disabled' : ''}>Mark resolved</button></div>`).join('')}</section><section class="agent-panel"><span class="agent-orb">${icon('spark')}</span><h2>Meal Rescue Agent</h2>${pill(config.enterpriseConfigured ? 'Connection configured, verify tenant' : 'Gemini access pending', 'neutral')}<p>Three scoped tools. Operator approval. Student consent. The backend always has the final check.</p><p class="small">${config.enterpriseConfigured ? 'Run the workflow in Gemini Enterprise. Its proposals appear here for review.' : 'Use the rules-based preview now. Connect Gemini Enterprise when the organiser provides access.'}</p><code>/mcp</code></section><section class="panel"><h2>Pickup windows</h2><p class="small muted">Open the next 3 hours. Capacity applies to new windows only; existing reservations stay unchanged. Reserve additional capacity for walk-ins.</p><form id="slots-form"><label>Online prep units per window<input name="kitchenCapacity" type="number" min="1" max="100" value="8" required></label><label>Online handovers per window<input name="pickupCapacity" type="number" min="1" max="50" value="4" required></label><button class="btn subtle full" ${busy ? 'disabled' : ''}>Open next 3 hours</button></form></section>${config.mode === 'demo' ? `<button class="text-btn muted" data-action="reset">Reset this kitchen’s demo data</button>` : ''}</aside>`;
}
function vendor(): string {
    const owned = snapshot!.vendors.find(x => x.id === snapshot!.actor.vendorId)!;
    const active = snapshot!.orders.filter(o => !['collected', 'cancelled'].includes(o.status));
    const pending = snapshot!.proposals.filter(p => p.status === 'pending_vendor');
    let content = '';
    if (vendorTab === 'queue')
        content = `<div class="kitchen-orders">${active.length ? active.map(vendorOrder).join('') : '<div class="empty-state big"><h2>A calm kitchen, for now.</h2><p>Student pre-orders will appear here. Switch to a student demo account to place one.</p></div>'}</div>`;
    if (vendorTab === 'menu')
        content = `<div class="vendor-menu">${snapshot!.items.filter(x => x.vendorId === owned.id).map(item => `<article class="menu-edit-card"><div class="mini-art">${art(item.art)}</div><div class="menu-edit-info"><h3>${esc(item.name)}</h3><p>${money(item.priceSen)} · ${minutes(item.prepMinutes)} prep · ${item.prepUnits} workload units</p><small class="muted">Stock below means available, unreserved portions.</small></div><form class="stock-form" data-item="${item.id}"><label class="sr-only" for="stock-${item.id}">Stock for ${esc(item.name)}</label><input id="stock-${item.id}" name="stock" type="number" min="0" max="500" value="${item.stock}" required><button class="btn subtle small-btn" ${busy ? 'disabled' : ''}>Save stock</button></form><button class="toggle ${item.enabled ? 'on' : ''}" role="switch" aria-checked="${item.enabled}" aria-label="Enable ${esc(item.name)}" data-action="toggle-item" data-id="${item.id}" ${busy ? 'disabled' : ''}><span></span></button></article>`).join('')}</div>`;
    if (vendorTab === 'rescue')
        content = `<div class="rescue-intro"><h3>Human-approved. Student-controlled.</h3><p>No proposal reserves stock. Acceptance rechecks the current order, expiry, inventory and pickup window.</p></div>${snapshot!.proposals.length ? snapshot!.proposals.slice().reverse().map(p => proposalCard(p, false)).join('') : '<div class="empty-state"><h3>No rescue proposals yet.</h3><p>Report a delay, then evaluate an at-risk order from the queue.</p></div>'}`;
    if (vendorTab === 'activity')
        content = `<div class="panel activity-panel"><h3>Operational audit trail</h3><p class="small muted">Most recent 50 events. Tokens and pickup codes are never included.</p>${snapshot!.audit.length ? snapshot!.audit.map(event => `<div class="audit-row"><span class="audit-dot"></span><div><strong>${esc(event.action)}</strong><p>${esc(event.detail)}</p><small>${esc(event.actorId)} · ${time(event.at)} · ${short(event.subjectId)}</small></div></div>`).join('') : '<p class="muted">Events will appear as you use the application.</p>'}</div>`;
    return `<div class="page-title"><div><p class="eyebrow">KITCHEN WORKSPACE</p><h1>${esc(owned.name)}<span class="orange-dot">.</span></h1><p>A clear view of the next pickup, and the one after that.</p></div><button class="btn ${owned.open ? 'subtle' : 'primary'}" data-action="toggle-open" ${busy ? 'disabled' : ''}><span class="${owned.open ? 'green-dot' : 'orange-dot-small'}"></span>${owned.open ? 'Open · pause new orders' : 'Paused · resume orders'}</button></div><div class="stats-grid"><div><span>In the kitchen</span><strong>${active.length}</strong><small>Active orders</small></div><div><span>Ready for pickup</span><strong>${active.filter(o => o.status === 'ready').length}</strong><small>Awaiting one-time code</small></div><div><span>Need attention</span><strong class="${active.some(atRisk) ? 'danger-text' : ''}">${active.filter(atRisk).length}</strong><small>Student deadline at risk</small></div><div><span>Review requests</span><strong>${pending.length}</strong><small>Operator approval needed</small></div></div><div class="kitchen-layout"><section><nav class="workspace-tabs" aria-label="Kitchen sections">${[['queue', 'Order queue'], ['menu', 'Menu & stock'], ['rescue', `Meal Rescue${pending.length ? ` (${pending.length})` : ''}`], ['activity', 'Activity']].map(([tab, label]) => `<button data-tab="${tab}" class="${vendorTab === tab ? 'active' : ''}">${label}</button>`).join('')}</nav>${content}</section>${incidentPanel()}</div>`;
}
function checkoutDialog(): string {
    const q = checkout!.quote;
    return `<dialog id="checkout-dialog" aria-labelledby="checkout-title"><div class="dialog-header"><span class="eyebrow">ONE LESS THING TO QUEUE FOR</span><button class="icon-btn" data-action="close-checkout" aria-label="Close checkout">${icon('x')}</button></div><h2 id="checkout-title">Pick your moment.</h2><p class="muted">A capacity-checked window for your meal. Estimates can change if the kitchen is delayed.</p><div class="checkout-summary">${cart.map(line => `<p><span>${line.quantity} × ${esc(snapshot!.items.find(x => x.id === line.itemId)!.name)}</span><strong>${money(snapshot!.items.find(x => x.id === line.itemId)!.priceSen * line.quantity)}</strong></p>`).join('')}</div>${q.slots.length ? `<form id="checkout-form"><fieldset><legend>Available pickup windows</legend><div class="slot-options">${q.slots.slice(0, 8).map(slot => `<label class="slot-option"><input name="slotId" type="radio" value="${slot.id}" ${checkout!.slotId === slot.id ? 'checked' : ''} required><span><strong>${time(slot.startAt)}–${time(slot.endAt)}</strong><small>${slot.pickupCapacity - slot.reservedHandovers} handover spaces available</small></span>${icon('check')}</label>`).join('')}</div></fieldset><p class="small">Latest planned pickup: <strong>${time(q.latestPickupAt)}</strong>. Leave time to eat and walk back.</p><div class="notice small">This is a synthetic menu. Allergen information is unknown. Payment is simulated: no card or bank details are requested.</div><div class="checkout-total"><span>Simulated total</span><strong>${money(q.totalSen)}</strong></div><button class="btn primary full" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Confirming…' : 'Confirm pre-order'} ${icon('arrow')}</button></form>` : `<div class="warning">${icon('alert')}<p>${esc(q.reasons.join(' '))}</p></div><button class="btn primary full" data-action="close-checkout">Adjust my break or basket</button>`}</dialog>`;
}
function render(): void {
    const active = document.activeElement as HTMLInputElement | null;
    const focusId = active?.id;
    const selection = active && ['text', 'search'].includes(active.type) ? active.selectionStart : null;
    root.innerHTML = snapshot ? shell(view === 'vendor' ? vendor() : view === 'orders' ? orders() : explore()) : loginView();
    if (checkout && snapshot) {
        const dialog = document.querySelector<HTMLDialogElement>('#checkout-dialog')!;
        dialog.showModal();
        dialog.addEventListener('cancel', e => { e.preventDefault(); if (!busy) {
            checkout = null;
            render();
        } });
    }
    if (focusId) {
        const replacement = document.getElementById(focusId) as HTMLInputElement | null;
        replacement?.focus({ preventScroll: true });
        if (selection !== null && replacement && ['text', 'search'].includes(replacement.type))
            replacement.setSelectionRange(selection, selection);
    }
}
function vendorPath(part: string, vendorId = snapshot!.actor.vendorId!): string { return `/api/vendors/${encodeURIComponent(vendorId)}/${part}`; }
async function switchAccount(id: string): Promise<void> {
    await demoLogin(id);
    cart = [];
    cartVendor = '';
    checkout = null;
    recovery = {};
    quotes = {};
    fingerprint = '';
    await refresh(true);
}
root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled)
        return;
    if (button.dataset.view) {
        view = button.dataset.view as typeof view;
        render();
        return;
    }
    if (button.dataset.category) {
        category = button.dataset.category;
        render();
        return;
    }
    if (button.dataset.tab) {
        vendorTab = button.dataset.tab as typeof vendorTab;
        render();
        return;
    }
    const { action, id, vendor: vendorId } = button.dataset;
    if (!action)
        return;
    if (action === 'login') {
        void act(() => switchAccount(id!));
        return;
    }
    if (action === 'logout') {
        logout();
        snapshot = null;
        checkout = null;
        cart = [];
        render();
        return;
    }
    if (action === 'close-checkout') {
        checkout = null;
        render();
        return;
    }
    if (action === 'copy') {
        void navigator.clipboard.writeText(button.dataset.code!).then(() => notify('Pickup code copied.')).catch(() => notify('Select the code to copy it manually.'));
        return;
    }
    if (action === 'add' || action === 'remove') {
        const item = snapshot!.items.find(x => x.id === id)!;
        if (action === 'add' && cart.length && cartVendor !== item.vendorId) {
            notify('One kitchen per order. Finish or clear the current basket first.', true);
            return;
        }
        if (action === 'add' && cart.reduce((n, x) => n + x.quantity, 0) >= 5) {
            notify('The pilot supports up to five portions per order.', true);
            return;
        }
        const line = cart.find(x => x.itemId === id);
        if (line)
            line.quantity += action === 'add' ? 1 : -1;
        else if (action === 'add')
            cart.push({ itemId: id!, quantity: 1 });
        cart = cart.filter(x => x.quantity > 0);
        cartVendor = cart.length ? item.vendorId : '';
        render();
        if (action === 'add')
            notify(`${item.name} added to your bag.`);
        return;
    }
    if (action === 'checkout') {
        void act(async () => { const quote = await api<Quote>('/api/quote', 'POST', { vendorId: cartVendor, items: cart, plan }); checkout = { quote, slotId: quote.slots[0]?.id ?? '', key: crypto.randomUUID() }; });
        return;
    }
    if (action === 'cancel') {
        if (confirm('Cancel this order before preparation? No real payment or refund is involved.'))
            void act(async () => { await api(vendorPath(`orders/${id}/cancel`, vendorId), 'POST', {}); }, 'Order cancelled.');
        return;
    }
    if (action === 'status') {
        void act(async () => { await api(vendorPath(`orders/${id}/status`), 'POST', { status: button.dataset.status }); }, 'Preparation status updated.');
        return;
    }
    if (action === 'toggle-open') {
        const vendor = snapshot!.vendors.find(x => x.id === snapshot!.actor.vendorId)!;
        void act(async () => { await api(vendorPath('open'), 'PATCH', { open: !vendor.open }); }, 'Kitchen availability updated.');
        return;
    }
    if (action === 'toggle-item') {
        const item = snapshot!.items.find(x => x.id === id)!;
        void act(async () => { await api(vendorPath(`items/${id}`), 'PATCH', { enabled: !item.enabled }); }, 'Menu updated.');
        return;
    }
    if (action === 'resolve') {
        void act(async () => { await api(vendorPath(`incidents/${id}/resolve`), 'POST', {}); }, 'Incident resolved; estimates recalculated.');
        return;
    }
    if (action === 'evaluate') {
        void act(async () => { recovery[id!] = await api(vendorPath('recovery/evaluate'), 'POST', { orderId: id }); });
        return;
    }
    if (action === 'proposal') {
        const option = recovery[id!]!.options[Number(button.dataset.index)]!;
        void act(async () => { await api(vendorPath('proposals'), 'POST', { orderId: id, itemId: option.itemId, slotId: option.slotId, reason: 'Kitchen delay affects the original meal. This alternative fits the recorded pickup deadline.' }); vendorTab = 'rescue'; }, 'Proposal created. Operator approval is still required.');
        return;
    }
    if (action === 'approve') {
        void act(async () => { await api(vendorPath(`proposals/${id}/approve`), 'POST', { approve: button.dataset.accept === 'true' }); }, 'Proposal review recorded.');
        return;
    }
    if (action === 'respond') {
        void act(async () => { await api(vendorPath(`proposals/${id}/respond`, vendorId), 'POST', { accept: button.dataset.accept === 'true' }); }, 'Your decision was recorded. Check the updated order and pickup code.');
        return;
    }
    if (action === 'reset' && confirm('Reset only this demo kitchen? Its orders, incidents and proposals will be removed.')) {
        void act(async () => { await api(vendorPath('reset-demo'), 'POST', {}); recovery = {}; }, 'Demo kitchen reset with fresh pickup windows.');
    }
});
root.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.id === 'account-switch')
        void act(() => switchAccount(input.value));
    if (input.id === 'vendor-filter') {
        vendorFilter = input.value;
        render();
    }
    if (input.id === 'fits-only') {
        fitsOnly = input.checked;
        render();
    }
    if (input.name === 'slotId' && checkout) {
        checkout.slotId = input.value;
        checkout.key = crypto.randomUUID();
    }
});
root.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (input.id === 'meal-search') {
        search = input.value;
        const matches = filteredItems();
        document.getElementById('meal-grid')!.innerHTML = matches.length ? matches.map(mealCard).join('') : '<div class="empty-state"><h3>No meals match.</h3><p>Try another search.</p></div>';
        document.getElementById('meal-count')!.textContent = `${matches.length} choices`;
    }
});
root.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    if (form.id === 'login-form') {
        const signup = (event.submitter as HTMLButtonElement)?.value === 'signup';
        void act(async () => { await firebaseLogin(String(data.get('email')), String(data.get('password')), signup); fingerprint = ''; await refresh(true); });
        return;
    }
    if (form.id === 'plan-form') {
        try {
            plan = { breakStartAt: fromLocal(data.get('breakStartAt')), nextClassAt: fromLocal(data.get('nextClassAt')), budgetSen: Math.round(Number(data.get('budget')) * 100), eatMinutes: Number(data.get('eatMinutes')), walkToMinutes: Number(data.get('walkToMinutes')), returnMinutes: Number(data.get('returnMinutes')), bufferMinutes: Number(data.get('bufferMinutes')) };
            void act(async () => { const item = snapshot!.items[0]!; await api('/api/quote', 'POST', { vendorId: item.vendorId, items: [{ itemId: item.id, quantity: 1 }], plan }); await refreshQuotes(); }, 'Pickup windows updated for your break.');
        }
        catch {
            notify('Enter valid break and class times.', true);
        }
        return;
    }
    if (form.id === 'checkout-form' && checkout) {
        const pending = checkout;
        const items = structuredClone(cart);
        const vendorId = cartVendor;
        void act(async () => { await api('/api/orders', 'POST', { vendorId, items, plan, slotId: pending.slotId }, { 'Idempotency-Key': pending.key }); cart = []; cartVendor = ''; checkout = null; view = 'orders'; }, 'You’re booked. The kitchen has your order.');
        return;
    }
    if (form.id === 'slots-form') {
        void act(async () => { await api(vendorPath('slots'), 'POST', { kitchenCapacity: Number(data.get('kitchenCapacity')), pickupCapacity: Number(data.get('pickupCapacity')) }); }, 'New windows opened. Existing reservations were preserved.');
        return;
    }
    if (form.id === 'incident-form') {
        void act(async () => { await api(vendorPath('incidents'), 'POST', { itemIds: data.get('itemId') ? [data.get('itemId')] : [], delayMinutes: Number(data.get('delayMinutes')), reason: String(data.get('reason')) }); }, 'Delay recorded. At-risk orders are highlighted.');
        return;
    }
    if (form.classList.contains('collect-form')) {
        const id = form.dataset.order;
        void act(async () => { await api(vendorPath(`orders/${id}/collect`), 'POST', { code: String(data.get('code')) }); }, 'Pickup verified. Enjoy your break!');
        return;
    }
    if (form.classList.contains('stock-form')) {
        const id = form.dataset.item;
        void act(async () => { await api(vendorPath(`items/${id}`), 'PATCH', { stock: Number(data.get('stock')) }); }, 'Available stock updated.');
    }
});
async function boot(): Promise<void> {
    try {
        const response = await fetch('/api/config');
        if (!response.ok)
            throw new Error('Cannot reach the application server.');
        config = await response.json() as AppConfig;
        configure(config);
        if (hasSession()) {
            try {
                await refresh(true);
            }
            catch {
                logout();
                snapshot = null;
            }
        }
        render();
        setInterval(() => {
            const focused = document.activeElement;
            if (!snapshot || busy || checkout || (focused && ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName)))
                return;
            void refresh().catch(() => { offline = true; if (!hasSession()) {
                snapshot = null;
                render();
            }
            else {
                const status = document.querySelector('.sync-status');
                if (status) {
                    status.classList.add('disconnected');
                    status.textContent = 'Connection lost · retrying';
                }
            } });
        }, 5000);
    }
    catch (error) {
        root.innerHTML = `<main class="boot"><h1>Let’s reconnect.</h1><p>${esc(error instanceof Error ? error.message : 'Start the backend and reload.')}</p><button class="btn primary" id="reload">Try again</button></main>`;
        document.getElementById('reload')!.onclick = () => location.reload();
    }
}
void boot();
