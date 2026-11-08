import type { Order, Vendor, VendorState } from '../shared/model.js';
import { DEFAULT_POLICY, type BookingLoad, type PickupPolicy } from '../shared/features.js';
import { integer, object } from './errors.js';
export const policies = (v: Vendor): PickupPolicy => ({ ...DEFAULT_POLICY, ...v.policies });
export function parsePolicy(input: unknown): PickupPolicy {
    const p = object(input);
    return { cutoffMinutes: integer(p.cutoffMinutes, 'Order cutoff', 0, 120), cancellationMinutes: integer(p.cancellationMinutes, 'Cancellation cutoff', 0, 120), holdMinutes: integer(p.holdMinutes, 'Collection grace period', 5, 120), delayGraceMinutes: integer(p.delayGraceMinutes, 'Vendor lateness grace', 0, 30) };
}
export function delayedCancellation(o: Order, now: number): boolean {
    if (!['confirmed', 'preparing', 'ready'].includes(o.status)) return false;
    const deadline = Date.parse(o.promisedPickupEndAt ?? o.latestPickupAt) + (o.policy?.delayGraceMinutes ?? 5) * 60000;
    return Date.parse(o.estimatedReadyAt) > deadline || (o.readyAt ? Date.parse(o.readyAt) > deadline : now > deadline);
}
export function bookingLoad(s: VendorState, now: number): BookingLoad {
    const p = policies(s.vendor); const minPrep = Math.min(...s.items.filter(i => i.enabled && i.stock > 0).map(i => i.prepMinutes + s.incidents.filter(x => x.active && (!x.itemIds.length || x.itemIds.includes(i.id))).reduce((sum, x) => sum + x.delayMinutes, 0)));
    const slots = s.slots.filter(w => Date.parse(w.endAt) > now).slice(0, 36).map(w => {
        const percent = Math.round(100 * Math.max(w.reservedUnits / Math.max(1, w.kitchenCapacity), w.reservedHandovers / Math.max(1, w.pickupCapacity)));
        const closed = !s.vendor.open || Date.parse(w.startAt) - p.cutoffMinutes * 60000 <= now || Date.parse(w.endAt) < now + minPrep * 60000;
        return { id: w.id, startAt: w.startAt, endAt: w.endAt, level: closed ? 'closed' as const : percent >= 100 ? 'full' as const : percent >= 60 ? 'filling' as const : 'available' as const, percent };
    });
    return { vendorId: s.vendor.id, updatedAt: new Date(now).toISOString(), open: s.vendor.open, nextAvailableAt: slots.find(w => w.level === 'available' || w.level === 'filling')?.startAt ?? null, slots };
}
