// Run after build. Keys are private runtime data, not source or public environment values.
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { generatePushKeys } from '../dist/server/web-push.js';
const subject = process.argv.find(x => x.startsWith('--subject='))?.slice(10);
if (!subject) { console.error('Usage: npm run push:keys -- --subject=mailto:YOUR_CONTACT_EMAIL'); process.exit(1); }
const directory = process.env.DATA_DIR || '.data';
const keys = generatePushKeys(subject);
await mkdir(directory, { recursive: true, mode: 0o700 });
const filename = path.join(directory, 'web-push-keys.json');
try {
    const f = await open(filename, 'wx', 0o600);
    try { await f.writeFile(JSON.stringify(keys, null, 2)); await f.sync(); } finally { await f.close(); }
    console.log('Private push keys created in DATA_DIR. Set PUSH_ENABLED=true in .env and restart. Do not commit or share the key file.');
} catch (e) {
    if (e.code === 'EEXIST') { console.error('Keys already exist; left unchanged. Reuse them. Rotating keys requires browsers to subscribe again.'); process.exitCode = 1; }
    else throw e;
}
