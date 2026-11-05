import { settings } from './config.js';
import { FileStore, FirestoreStore, type Store } from './store.js';
import { seedVendor, VENDOR_IDS } from './seed.js';
import { MealService } from './domain.js';
import { createApp } from './http.js';
const config = settings();
let store: Store;
if (config.cloud)
    store = new FirestoreStore(config.projectId, [...VENDOR_IDS], config.accessToken);
else {
    const local = new FileStore(config.dataDir);
    await local.load();
    store = local;
    for (const id of VENDOR_IDS)
        await store.initialize(seedVendor(id));
}
const server = createApp(config, new MealService(store));
server.listen(config.port, config.host, () => console.log(`BreakBite ${config.mode} mode · http://${config.host}:${config.port} · ${config.cloud ? 'Firestore' : 'durable local demo'} · payment simulated`));
server.on('error', error => { console.error('Could not start server:', error.message); process.exit(1); });
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
