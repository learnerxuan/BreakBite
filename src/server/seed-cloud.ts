import { settings } from './config.js';
import { FirestoreStore } from './store.js';
import { VENDOR_IDS, seedVendor } from './seed.js';
const config = settings();
if (!config.cloud || config.mode !== 'firebase')
    throw new Error('Set STORE=firestore and AUTH_MODE=firebase before seeding.');
const store = new FirestoreStore(config.projectId, [...VENDOR_IDS], config.accessToken);
for (const id of VENDOR_IDS) {
    await store.initialize(seedVendor(id));
    console.log(`Initialised ${id} if missing. Existing data is never overwritten.`);
}
