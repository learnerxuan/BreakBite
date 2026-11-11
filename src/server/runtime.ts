import { settings } from './config.js';
import { createDatabase } from './database-factory.js';
import { FileStore, FirestoreStore, type Store } from './store.js';
import { LocalStore, type Database } from './local-database.js';
import { VENDOR_IDS, seedVendor } from './seed.js';
import { loadPushKeys } from './web-push.js';
import { PushService } from './push.js';
import { ProductService } from './product.js';
import { MealService } from './domain.js';
import { ApspaceTimetableProvider } from './apspace-timetable.js';
import { blobMedia, fileMedia } from './media-store.js';
import { maintenance } from './maintenance.js';
import { createHandler } from './http.js';
import { requireThat } from './errors.js';

export async function createRuntime(env: NodeJS.ProcessEnv = process.env) {
    const config = settings(env);
    let store: Store; let db: Database | undefined;
    if (config.mode === 'local') {
        db = await createDatabase(config, env); await db.open(); store = new LocalStore(db);
    } else if (config.cloud) store = new FirestoreStore(config.projectId, [...VENDOR_IDS], config.accessToken);
    else {
        const local = new FileStore(config.dataDir); await local.load(); store = local;
        for (const id of VENDOR_IDS) await store.initialize(seedVendor(id));
    }
    try {
        requireThat(!config.vercel || env.PUSH_ENABLED !== 'true' || !!env.WEB_PUSH_KEYS_JSON, 'CONFIG', 'Vercel Web Push requires stable WEB_PUSH_KEYS_JSON; files on hosting disks are not persistent.', 500);
        const push = db ? new PushService(db, await loadPushKeys(config.dataDir, env.PUSH_ENABLED === 'true', env.WEB_PUSH_KEYS_JSON)) : undefined;
        const apspace = db && env.BREAKBITE_APSPACE === 'true' ? new ApspaceTimetableProvider() : undefined;
        const media = config.vercel || env.MEDIA_STORE === 'blob' ? blobMedia(config.firestoreRoot, env.BLOB_READ_WRITE_TOKEN) : fileMedia(config.dataDir);
        const product = db ? new ProductService(db, Date.now, apspace, media) : undefined;
        const service = new MealService(store, Date.now, config.mode === 'local' ? 'pay_at_pickup' : 'simulated');
        const runMaintenance = maintenance(db, service, product, push);
        const handler = createHandler(config, service, db, push, product, { media, maintenance: config.vercel ? runMaintenance : undefined, maintenanceSecret: env.CRON_SECRET });
        return { config, store, db, push, product, service, apspace, handler, runMaintenance,
            async close() { await push?.settle(); await db?.close(); } };
    } catch (error) { await db?.close(); throw error; }
}
