import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { settings } from './config.js';
import { LocalDatabase } from './local-database.js';
import { Accounts } from './accounts.js';
/** Password input is masked on a terminal; environment input is for local automation only. */
async function secret(label: string): Promise<string> {
    if (!stdin.isTTY) throw new Error('Use an interactive terminal, or set BREAKBITE_OPERATOR_PASSWORD for non-interactive local setup.');
    stdout.write(label); stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    return new Promise((resolve, reject) => {
        let value = '';
        const finish = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); };
        const onData = (chunk: string) => {
            for (const c of chunk) {
                if (c === '\u0003') { finish(); reject(new Error('Cancelled.')); return; }
                if (c === '\r' || c === '\n') { finish(); resolve(value); return; }
                if (c === '\u007f' || c === '\b') { if (value) { value = value.slice(0, -1); stdout.write('\b \b'); } }
                else if (c >= ' ') { value += c; stdout.write('*'); }
            }
        };
        stdin.on('data', onData);
    });
}
const config = settings();
if (config.mode !== 'local') throw new Error('Operator setup is for AUTH_MODE=local only.');
const db = new LocalDatabase(config.dataDir); await db.open();
try {
    const reset = process.argv.includes('--reset');
    const emailArg = process.argv.find(x => x.startsWith('--email='))?.slice(8);
    const vendorArg = process.argv.find(x => x.startsWith('--vendor='))?.slice(9);
    const nameArg = process.argv.find(x => x.startsWith('--name='))?.slice(7);
    const rl = createInterface({ input: stdin, output: stdout });
    let email: string; let name = ''; let vendorId = '';
    try {
        email = emailArg ?? await rl.question('Account email: ');
        if (!reset) {
            console.log('Kitchens:', Object.keys(db.read().vendors).join(', '));
            name = nameArg ?? await rl.question('Operator name: ');
            vendorId = vendorArg ?? await rl.question('Kitchen ID: ');
        }
    } finally { rl.close(); }
    const password = process.env.BREAKBITE_OPERATOR_PASSWORD ?? await secret('Password (at least 10 characters): ');
    if (!process.env.BREAKBITE_OPERATOR_PASSWORD && password !== await secret('Confirm password: ')) throw new Error('Passwords do not match.');
    const accounts = new Accounts(db);
    if (reset) await accounts.resetPassword(email, password);
    else await accounts.create({ email, name, password, role: 'vendor', vendorId });
    console.log(reset ? 'Password reset; all sessions revoked.' : 'Operator created. Start the server and sign in with this email and password.');
} finally { await db.close(); }
