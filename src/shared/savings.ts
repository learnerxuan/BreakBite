import type { Order } from './model.js';
export type SavingsOrder = Pick<Order, 'id' | 'checkoutId' | 'studentId' | 'status' | 'createdAt' | 'readyAt' | 'preparationBaseline'>;
export interface SavingsSummary { minutes: number; checkouts: number; }
/** A preparation-only estimate at the booked pickup start, not a measured queue saving. */
export function estimatedPreparationSavedMinutes(order: SavingsOrder): number | null {
    const baseline = order.preparationBaseline;
    if (order.status !== 'collected' || !baseline || !order.readyAt ||
        !Number.isFinite(baseline.minutes) || baseline.minutes < 1 || baseline.minutes > 120) return null;
    const created = Date.parse(baseline.orderedAt ?? order.createdAt), pickup = Date.parse(baseline.pickupStartAt), ready = Date.parse(order.readyAt);
    if (![created, pickup, ready].every(Number.isFinite) || ready < created || pickup <= created) return null;
    const lead = (pickup - created) / 60000;
    const late = Math.max(0, (ready - pickup) / 60000);
    return Math.floor(Math.max(0, Math.min(lead, baseline.minutes - late)));
}
export function preparationSavings(orders: readonly SavingsOrder[], studentId: string): SavingsSummary {
    const checkouts = new Map<string, number>();
    for (const order of orders) {
        if (order.studentId !== studentId) continue;
        const minutes = estimatedPreparationSavedMinutes(order);
        if (minutes === null) continue;
        const key = order.checkoutId ?? order.id;
        // Kitchens can prepare simultaneously. Never add parallel child estimates together.
        checkouts.set(key, Math.max(checkouts.get(key) ?? 0, minutes));
    }
    return { minutes: [...checkouts.values()].reduce((total, minutes) => total + minutes, 0), checkouts: checkouts.size };
}
