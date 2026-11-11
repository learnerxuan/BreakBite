/** Prepare throwaway local fixtures only. Never point this at an existing installation. */
import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { LocalDatabase } from '../dist/server/local-database.js';
import { Accounts } from '../dist/server/accounts.js';
const directory = process.argv[2];
if (!directory) throw new Error('Pass a NEW empty test directory: node tests/setup-browser.mjs /tmp/breakbite-ui-test');
const full = path.resolve(directory);
await mkdir(full, { recursive: true });
if ((await readdir(full)).length) throw new Error('Refusing to change a non-empty directory. Use a new disposable directory.');
const db = new LocalDatabase(full);
await db.open();
try {
    const accounts = new Accounts(db);
    for (const [vendorId, email] of [['asian-cuisine', 'operator.bowl@example.test'], ['bobanika', 'operator.noodle@example.test']]) {
        await accounts.create({ vendorId, email, name: 'Test kitchen operator', role: 'vendor', password: process.env.TEST_OPERATOR_PASSWORD ?? 'Fixture-only-password-2026' });
    }
} finally { await db.close(); }
console.log(`Local test accounts created in ${full}. Do not publish this test database or its passwords.`);
