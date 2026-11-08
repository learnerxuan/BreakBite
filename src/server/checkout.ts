import { foodRevision } from './food.js';
import { foodCheck, isClosed, emptyProfile } from '../shared/features.js';
import { createHash, randomUUID } from 'node:crypto';
import type { Actor, BasketGroup, BasketQuote, CheckoutResult, PublicOrder } from '../shared/model.js';
import { MealService, parsePlan, parseSelections } from './domain.js';
import { DraftStore, LocalDatabase, assertPickupItinerary } from './local-database.js';
import { integer, object, requireThat, text } from './errors.js';

function groupsFor(input: unknown, withSlots: boolean): BasketGroup[] {
    requireThat(Array.isArray(input) && input.length > 0 && input.length <= 5, 'INVALID_CART', 'Choose between one and five kitchens.');
    const groups = input.map(x => { const b = object(x); return {
        vendorId: text(b.vendorId, 'Kitchen', 1, 60), items: parseSelections(b.items),
        ...(withSlots ? { slotId: text(b.slotId, 'Pickup window', 1, 100) } : {}),
    }; }).sort((a, b) => a.vendorId.localeCompare(b.vendorId));
    requireThat(new Set(groups.map(x => x.vendorId)).size === groups.length, 'INVALID_CART', 'Combine items from the same kitchen.');
    return groups;
}
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
    return JSON.stringify(value) ?? 'null';
}
function visible(o: PublicOrder): PublicOrder {
    const { qrToken: _qr, collectionFailures: _failures, collectionLockedUntil: _lock, ...safe } = o as PublicOrder & { qrToken?: string; collectionFailures?: number; collectionLockedUntil?: unknown };
    if (isClosed(safe.status)) delete safe.pickupCode;
    return safe;
}
export class CheckoutService {
    constructor(private db: LocalDatabase, private clock = Date.now) {}
    async quote(actor: Actor, input: unknown): Promise<BasketQuote> {
        requireThat(actor.role === 'student', 'FORBIDDEN', 'A student account is required.', 403);
        const b = object(input); const groups = groupsFor(b.groups, false);
        const plan = parsePlan(b.plan, this.clock());
        const service = new MealService(new DraftStore(this.db.read().vendors), this.clock, 'pay_at_pickup');
        const quotes = await Promise.all(groups.map(g => service.quote(actor, { ...g, plan })));
        const totalSen = quotes.reduce((sum, q) => sum + q.totalSen, 0);
        const data = this.db.read(); const preferences = data.profiles?.[actor.id]?.preferences ?? emptyProfile().preferences;
        const dietaryReasons = groups.flatMap(g => g.items.flatMap(l => { const i = data.vendors[g.vendorId]!.items.find(i => i.id === l.itemId)!; return foodCheck(i.foodInfo, preferences, this.clock()).reasons.map(r => `${i.name}: ${r}`); }));
        const menuVersions = Object.fromEntries(groups.flatMap(g => g.items.map(l => [`${g.vendorId}:${l.itemId}`, foodRevision(data.vendors[g.vendorId]!.items.find(i => i.id === l.itemId)!.foodInfo)])));
        return { groups: quotes, menuVersions, totalSen, reasons: [...dietaryReasons, ...quotes.flatMap(q => q.reasons), ...(totalSen > plan.budgetSen ? ['The combined basket exceeds your budget.'] : [])] };
    }
    lookup(actor: Actor, key: string): CheckoutResult | null {
        requireThat(actor.role === 'student', 'FORBIDDEN', 'A student account is required.', 403);
        requireThat(/^[A-Za-z0-9_-]{8,100}$/.test(key), 'INVALID_KEY', 'Invalid checkout key.');
        const d = this.db.read(); const requestKey = createHash('sha256').update(`${actor.id}:${key}`).digest('hex');
        const record = d.checkouts[requestKey]; if (!record) return null;
        const orders = record.orders.map(r => {
            const o = d.vendors[r.vendorId]?.orders.find(o => o.id === r.orderId);
            requireThat(o?.studentId === actor.id, 'INVARIANT', 'Checkout records are inconsistent.', 500); return visible(o);
        });
        return { id: record.id, orders, totalSen: orders.reduce((n, o) => n + o.totalSen, 0) };
    }
    async submit(actor: Actor, input: unknown, key: string): Promise<CheckoutResult> {
        requireThat(actor.role === 'student', 'FORBIDDEN', 'A student account is required.', 403);
        requireThat(/^[A-Za-z0-9_-]{8,100}$/.test(key), 'IDEMPOTENCY_REQUIRED', 'Send a unique Idempotency-Key.');
        const b = object(input); const groups = groupsFor(b.groups, true); const rawPlan = object(b.plan);
        const transferMinutes = integer(b.transferMinutes ?? 2, 'Walk between counters', 0, 15);
        const expectedTotalSen = integer(b.expectedTotalSen, 'Reviewed total', 1, 50000);
        const fingerprint = createHash('sha256').update(canonical({ groups, plan: rawPlan, transferMinutes, expectedTotalSen, menuVersions: b.menuVersions })).digest('hex');
        const requestKey = createHash('sha256').update(`${actor.id}:${key}`).digest('hex');
        return this.db.transaction(async draft => {
            const previous = draft.checkouts[requestKey];
            if (previous) {
                requireThat(previous.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 'This checkout key was used for another basket.', 409);
                const orders = previous.orders.map(ref => {
                    const o = draft.vendors[ref.vendorId]?.orders.find(x => x.id === ref.orderId);
                    requireThat(o?.studentId === actor.id, 'INVARIANT', 'Checkout records are inconsistent.', 500);
                    return visible(o);
                });
                return { id: previous.id, orders, totalSen: orders.reduce((n, o) => n + o.totalSen, 0) };
            }
            const preferences = draft.profiles?.[actor.id]?.preferences ?? emptyProfile().preferences;
            for (const g of groups) for (const l of g.items) {
                const item = draft.vendors[g.vendorId]?.items.find(i => i.id === l.itemId);
                requireThat(item, 'NOT_FOUND', 'Menu item not found.', 404);
                const check = foodCheck(item.foodInfo, preferences, this.clock());
                requireThat(check.suitable, 'DIETARY_CONFLICT', `${item.name}: ${check.reasons.join(' ')}`, 409);
                if (item.foodInfo) requireThat(object(b.menuVersions ?? {})[`${g.vendorId}:${l.itemId}`] === foodRevision(item.foodInfo), 'MENU_CHANGED', 'Ingredient information changed. Review the latest basket before ordering.', 409);
            }
            const now = this.clock(); const plan = parsePlan(rawPlan, now);
            const service = new MealService(new DraftStore(draft.vendors), () => now, 'pay_at_pickup');
            // Validate one pickup itinerary. A counter handover takes one minute; walking is user-supplied.
            const windows = groups.map(g => {
                const slot = draft.vendors[g.vendorId]?.slots.find(s => s.id === g.slotId);
                requireThat(slot, 'NO_AVAILABLE_SLOT', 'A pickup window is no longer available.', 409);
                return slot;
            }).sort((a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt));
            assertPickupItinerary(windows, transferMinutes);
            const checkoutId = randomUUID(); const orders: PublicOrder[] = [];
            for (const group of groups) {
                const order = await service.createOrder(actor, { ...group, plan }, `checkout-${checkoutId}`);
                const saved = draft.vendors[group.vendorId]!.orders.find(o => o.id === order.id)!;
                saved.checkoutId = checkoutId; saved.dietary = structuredClone(preferences);
                orders.push({ ...order, checkoutId, dietary: structuredClone(preferences) });
            }
            const totalSen = orders.reduce((n, o) => n + o.totalSen, 0);
            requireThat(totalSen <= plan.budgetSen, 'BUDGET_EXCEEDED', 'The combined basket exceeds your budget.', 409);
            requireThat(totalSen === expectedTotalSen, 'PRICE_CHANGED', 'A menu price changed. Review the latest basket total before confirming.', 409);
            draft.checkouts[requestKey] = { id: checkoutId, studentId: actor.id, fingerprint, createdAt: new Date(now).toISOString(), transferMinutes, orders: orders.map(o => ({ vendorId: o.vendorId, orderId: o.id })) };
            return { id: checkoutId, orders, totalSen };
        });
    }
}
