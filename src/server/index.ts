import { ProductService } from './product.js';
import { settings } from './config.js';
import { FileStore, FirestoreStore, type Store } from './store.js';
import { LocalDatabase, LocalStore } from './local-database.js';
import { seedVendor, VENDOR_IDS } from './seed.js';
import { MealService } from './domain.js';
import { createApp } from './http.js';
const config = settings();
let store: Store; let db: LocalDatabase | undefined;
if (config.mode === 'local') {
    db = new LocalDatabase(config.dataDir); await db.open(); store = new LocalStore(db);
} else if (config.cloud) store = new FirestoreStore(config.projectId, [...VENDOR_IDS], config.accessToken);
else {
    const local = new FileStore(config.dataDir); await local.load(); store = local;
    for (const id of VENDOR_IDS) await store.initialize(seedVendor(id));
}
const product = db ? new ProductService(db) : undefined;
const service = new MealService(store, Date.now, config.mode === 'local' ? 'pay_at_pickup' : 'simulated');
// Rolling capacity windows use each operator's configured online allocation. They never reset reservations.
let refreshing = false;
async function refreshWindows(): Promise<void> {
    if (!db || refreshing) return; refreshing = true;
    try {
        for (const id of await store.ids()) {
            const s = await store.read(id);
            if (s.vendor.open && !s.slots.some(w => Date.parse(w.startAt) > Date.now() + 165 * 60000))
                await service.openPickupWindows({ id: 'scheduler', name: 'Pickup scheduler', role: 'vendor', vendorId: id }, id, { kitchenCapacity: s.vendor.onlineKitchenCapacity ?? 8, pickupCapacity: s.vendor.onlinePickupCapacity ?? 4 });
        }
    } finally { refreshing = false; }
}
await refreshWindows(); await product?.tick();
const reminderTimer = setInterval(() => { void product?.tick().catch(e => console.error('Collection reminders:', e.message)); }, 15000); reminderTimer.unref();
const timer = setInterval(() => { void refreshWindows().catch(e => console.error('Pickup schedule:', e.message)); }, 60000);
timer.unref();
const server = createApp(config, service, db);
server.listen(config.port, config.host, () => console.log(`BreakBite · http://${config.host}:${config.port} · ${config.mode === 'local' ? 'JSON accounts and orders; pay at each counter' : config.mode + ' adapter'}\nOperator setup: stop the server, then run npm run operator`));
server.on('error', async error => { console.error('Could not start server:', error.message); clearInterval(timer); clearInterval(reminderTimer); await db?.close(); process.exitCode = 1; });
let closing = false;
const shutdown = () => {
    if (closing) return; closing = true; clearInterval(timer); clearInterval(reminderTimer);
    server.close(async () => { await db?.close(); process.exit(0); });
    server.closeIdleConnections();
};
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
