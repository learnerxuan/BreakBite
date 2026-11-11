import type { Database } from './local-database.js';
import type { MealService } from './domain.js';
import type { ProductService } from './product.js';
import type { PushService } from './push.js';

/** Awaited by serverless requests; no work depends on a surviving instance timer. */
export function maintenance(db: Database | undefined, service: MealService, product?: ProductService, push?: PushService, clock = Date.now) {
    let pending: Promise<void> | undefined;
    let nextRun = 0, nextWindows = 0, nextApspace = 0;
    async function run(force: boolean): Promise<void> {
        if (!db || (!force && clock() < nextRun)) return;
        await db.refresh();
        if (force || clock() >= nextWindows) {
            for (const id of await service.store.ids()) {
                const state = await service.store.read(id);
                if (state.vendor.open && !state.vendor.archived && !state.slots.some(w => Date.parse(w.startAt) > clock() + 165 * 60000))
                    await service.openPickupWindows({ id: 'scheduler', name: 'Pickup scheduler', role: 'vendor', vendorId: id }, id, { kitchenCapacity: state.vendor.onlineKitchenCapacity ?? 8, pickupCapacity: state.vendor.onlinePickupCapacity ?? 4 }, true);
            }
            nextWindows = clock() + 60000;
        }
        await product?.tick();
        await push?.pump();
        if (product?.apspaceConfigured && clock() >= nextApspace) {
            await product.refreshApspace(); nextApspace = clock() + 6 * 60 * 60000;
        }
        nextRun = clock() + 15000;
    }
    return (force = false): Promise<void> => {
        if (pending) return pending;
        pending = run(force).finally(() => { pending = undefined; });
        return pending;
    };
}
