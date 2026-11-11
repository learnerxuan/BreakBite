import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LocalDatabase, type Database } from '../../src/server/local-database.js';
import { FirestoreDatabase, type DocumentStore } from '../../src/server/firestore-database.js';
import { adminDocumentStore } from '../../src/server/firestore-admin.js';
import { MemoryFirestore } from './memory-firestore.js';

/** Which backend the service tests run on. Default: the JSON file.
 *   BREAKBITE_TEST_STORE=firestore-memory  in-memory Firestore stand-in (offline)
 *   BREAKBITE_TEST_STORE=firestore         the real project in GOOGLE_CLOUD_PROJECT / FIRESTORE_DATABASE,
 *                                          under throwaway envs/suite-* roots (see scripts/test-store.mjs)
 */
export const storeUnderTest = (process.env.BREAKBITE_TEST_STORE ?? 'file') as 'file' | 'firestore-memory' | 'firestore';
if (!['file', 'firestore-memory', 'firestore'].includes(storeUnderTest)) throw new Error(`Unknown BREAKBITE_TEST_STORE=${storeUnderTest}`);
/** JSON-file behaviour (lock, previous snapshot, corrupt-file handling) only exists on the file backend. */
export const jsonFile = storeUnderTest === 'file';
/** Only a runner-generated nonce may scope destructive real-database cleanup. */
export function suiteRootPrefix(runId: string): string {
    if (!/^[a-f0-9]{24}$/.test(runId)) throw new Error('BREAKBITE_TEST_RUN_ID must be a 24-character lowercase hexadecimal run token. Use scripts/test-store.mjs.');
    return `envs/suite-${runId}-`;
}
const configuredRunId = process.env.BREAKBITE_TEST_RUN_ID;
if (storeUnderTest === 'firestore' && !configuredRunId) throw new Error('Real Firestore suite requires a per-run BREAKBITE_TEST_RUN_ID. Use scripts/test-store.mjs.');
export const SUITE_ROOT_PREFIX = suiteRootPrefix(configuredRunId ?? randomBytes(12).toString('hex'));

const memory = new MemoryFirestore();
/** One SDK app per database; recreated after close so a closed database can be reopened like LocalDatabase. */
function lazyAdminStore(): DocumentStore {
    let current: Promise<DocumentStore> | undefined;
    const store = () => current ??= adminDocumentStore({ projectId: process.env.GOOGLE_CLOUD_PROJECT ?? '', databaseId: process.env.FIRESTORE_DATABASE || '(default)' });
    return {
        get: async p => (await store()).get(p),
        list: async c => (await store()).list(c),
        listDocumentIds: async c => (await store()).listDocumentIds(c),
        commit: async w => (await store()).commit(w),
        close: async () => { const open = current; current = undefined; await (await open)?.close?.(); },
    };
}

/** Same directory, same data: reopening a test directory reopens its Firestore root, like database.json. */
export function testDatabase(directory: string): Database {
    if (jsonFile) return new LocalDatabase(directory);
    const root = SUITE_ROOT_PREFIX + createHash('sha256').update(path.resolve(directory)).digest('hex').slice(0, 16);
    return new FirestoreDatabase(storeUnderTest === 'firestore' ? lazyAdminStore() : memory, { root, directory });
}

/** What the backend stores: database.json, or the JSON payloads Firestore holds (they are exactly the data). */
export async function storedText(db: Database): Promise<string> {
    return jsonFile ? readFile(path.join(db.directory, 'database.json'), 'utf8') : JSON.stringify(db.read());
}
