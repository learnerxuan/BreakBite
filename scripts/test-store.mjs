// Runs the compiled test suite on another storage backend: node scripts/test-store.mjs firestore-memory|firestore
// "firestore" uses GOOGLE_CLOUD_PROJECT / FIRESTORE_DATABASE / credentials from the environment (.env), writes only
// under envs/suite-* and deletes those roots afterwards, even when tests fail. envs/production is never touched.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const mode = process.argv[2];
if (!['firestore-memory', 'firestore'].includes(mode)) { console.error('Usage: node scripts/test-store.mjs firestore-memory|firestore'); process.exit(2); }
if (mode === 'firestore' && !process.env.GOOGLE_CLOUD_PROJECT) { console.error('Set GOOGLE_CLOUD_PROJECT, FIRESTORE_DATABASE and GOOGLE_APPLICATION_CREDENTIALS (for example in .env).'); process.exit(2); }

// A fresh namespace per invocation prevents concurrent teammates' cleanup from crossing runs.
process.env.BREAKBITE_TEST_RUN_ID = randomBytes(12).toString('hex');
process.env.BREAKBITE_TEST_STORE = mode;
const run = spawnSync(process.execPath, ['--test', 'dist-tests/tests/*.test.js'], { stdio: 'inherit', env: { ...process.env } });

if (mode === 'firestore') {
    const { adminFirestore } = await import('../dist-tests/src/server/firestore-admin.js');
    const { SUITE_ROOT_PREFIX } = await import('../dist-tests/tests/support/test-database.js');
    const { db, close } = await adminFirestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT, databaseId: process.env.FIRESTORE_DATABASE || '(default)' });
    const [collection, prefix] = SUITE_ROOT_PREFIX.split('/');
    try {
        const roots = (await db.collection(collection).listDocuments()).filter(ref => ref.id.startsWith(prefix));
        for (const ref of roots) await db.recursiveDelete(ref);
        console.log(`Removed ${roots.length} throwaway test roots owned by this run (${SUITE_ROOT_PREFIX}*).`);
    } finally { await close(); }
}
process.exit(run.status ?? 1);
