import type { Settings } from './config.js';
import { LocalDatabase, type Database } from './local-database.js';
import { FirestoreDatabase } from './firestore-database.js';

/** STORE=file keeps the locked JSON file; STORE=firestore keeps the same data in Firestore. Returned unopened. */
export async function createDatabase(config: Settings, env: NodeJS.ProcessEnv = process.env): Promise<Database> {
    if (config.store !== 'firestore') return new LocalDatabase(config.dataDir);
    // Loaded only when needed, so JSON installations never load the Firebase SDK.
    const { adminDocumentStore } = await import('./firestore-admin.js');
    const docs = await adminDocumentStore({ projectId: config.projectId, databaseId: config.firestoreDatabase, env });
    return new FirestoreDatabase(docs, { root: config.firestoreRoot, directory: config.dataDir, refreshMs: config.firestoreRefreshMs, log: message => console.log(message) });
}

export function storageLabel(config: Settings): string {
    return config.store === 'firestore' ? `Firestore ${config.projectId}/${config.firestoreDatabase} at ${config.firestoreRoot}` : `JSON in ${config.dataDir}`;
}
