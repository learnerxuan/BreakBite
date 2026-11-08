import { revokePush, pushDigest } from './push.js';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { accountActor, LocalDatabase, type LocalAccount, type LocalSession } from './local-database.js';
import { object, requireThat, text } from './errors.js';
import type { Actor } from '../shared/model.js';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const COOKIE = 'bb_session';
const HOURS = 12 * 60 * 60 * 1000;
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, key) => e ? reject(e) : resolve(key)));
function emailOf(value: unknown): string { const e = text(value, 'Email', 3, 254).toLowerCase(); requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), 'INVALID_EMAIL', 'Enter a valid email address.'); return e; }
function passwordOf(value: unknown): string { requireThat(typeof value === 'string' && value.length >= 10 && value.length <= 128, 'INVALID_PASSWORD', 'Use a password of 10–128 characters.'); return value; }
export class Accounts {
    constructor(private db: LocalDatabase, private secureCookie = false, private clock = Date.now) {}
    async register(input: unknown): Promise<LocalAccount> {
        const b = object(input);
        requireThat(b.role === undefined && b.vendorId === undefined, 'INVALID_ROLE', 'Kitchen accounts are created by the operator administrator.', 403);
        return this.create({ name: text(b.name, 'Name', 2, 60), email: emailOf(b.email), password: passwordOf(b.password), role: 'student' });
    }
    async create(input: { email: string; password: string; name: string; role: 'student' | 'vendor'; vendorId?: string }): Promise<LocalAccount> {
        const email = emailOf(input.email); const password = passwordOf(input.password); const name = text(input.name, 'Name', 2, 60);
        requireThat(input.role === 'student' || (input.role === 'vendor' && input.vendorId && this.db.read().vendors[input.vendorId]), 'INVALID_VENDOR', 'Choose an existing kitchen.');
        const salt = randomBytes(16).toString('hex'); const passwordHash = (await derive(password, salt)).toString('hex');
        return this.db.transaction(d => {
            requireThat(!d.accounts.some(a => a.email === email), 'EMAIL_EXISTS', 'An account already uses this email. Sign in or ask the administrator for help.', 409);
            const a: LocalAccount = { id: randomUUID(), name, email, role: input.role, ...(input.role === 'vendor' ? { vendorId: input.vendorId } : {}), salt, passwordHash, failures: 0, lockedUntil: 0, createdAt: new Date(this.clock()).toISOString() };
            d.accounts.push(a); return a;
        });
    }
    async login(input: unknown): Promise<LocalAccount> {
        const b = object(input); const email = emailOf(b.email);
        requireThat(typeof b.password === 'string' && b.password.length > 0 && b.password.length <= 128, 'BAD_LOGIN', 'Email or password is incorrect.', 401);
        const saved = this.db.read().accounts.find(a => a.email === email);
        // Run the same expensive KDF for unknown emails; don't log passwords or credentials.
        const hash = await derive(b.password, saved?.salt ?? 'breakbite-unknown-account-salt');
        const correct = !!saved && timingSafeEqual(hash, Buffer.from(saved.passwordHash, 'hex'));
        const account = await this.db.transaction(d => {
            const a = d.accounts.find(x => x.email === email);
            if (!a || a.lockedUntil > this.clock()) return null;
            if (!correct || a.passwordHash !== saved?.passwordHash) {
                a.failures++; if (a.failures >= 5) { a.lockedUntil = this.clock() + 5 * 60000; a.failures = 0; } return null;
            }
            a.failures = 0; a.lockedUntil = 0; return a;
        });
        requireThat(account, 'BAD_LOGIN', 'Email or password is incorrect, or sign-in is temporarily locked. Try again later.', 401);
        return account;
    }
    async start(account: LocalAccount, res: ServerResponse): Promise<{ actor: Actor; csrfToken: string }> {
        const token = randomBytes(32).toString('base64url'); const csrfToken = randomBytes(24).toString('base64url');
        await this.db.transaction(d => {
            for (const [key, s] of Object.entries(d.sessions)) if (s.expiresAt <= this.clock()) delete d.sessions[key];
            const mine = Object.entries(d.sessions).filter(([, s]) => s.accountId === account.id).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
            for (const [key] of mine.slice(0, Math.max(0, mine.length - 4))) delete d.sessions[key];
            d.sessions[digest(token)] = { accountId: account.id, expiresAt: this.clock() + HOURS, csrfToken };
        });
        res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${HOURS / 1000}${this.secureCookie ? '; Secure' : ''}`);
        return { actor: accountActor(account), csrfToken };
    }
    private token(req: IncomingMessage): string { return (req.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? ''; }
    session(req: IncomingMessage): { actor: Actor; session: LocalSession } {
        const token = this.token(req); requireThat(/^[A-Za-z0-9_-]{43}$/.test(token), 'UNAUTHORIZED', 'Sign in to continue.', 401);
        const d = this.db.read(); const session = d.sessions[digest(token)];
        const a = session && d.accounts.find(a => a.id === session.accountId);
        requireThat(session && session.expiresAt > this.clock() && a, 'UNAUTHORIZED', 'Your session expired. Please sign in again.', 401);
        return { actor: accountActor(a), session };
    }
    authorize(req: IncomingMessage): Actor {
        const { actor, session } = this.session(req);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET')) {
            const given = req.headers['x-csrf-token'];
            requireThat(typeof given === 'string' && given.length === session.csrfToken.length && timingSafeEqual(Buffer.from(given), Buffer.from(session.csrfToken)), 'CSRF', 'Refresh the page and try again.', 403);
        }
        return actor;
    }
    async logout(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const token = this.token(req); await this.db.transaction(d => { const session = d.sessions[digest(token)]; if (session) revokePush(d, session.accountId, pushDigest(session.csrfToken)); delete d.sessions[digest(token)]; });
        res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.secureCookie ? '; Secure' : ''}`);
    }
    async resetPassword(email: string, password: string): Promise<void> {
        const normalized = emailOf(email); passwordOf(password);
        const salt = randomBytes(16).toString('hex'); const passwordHash = (await derive(password, salt)).toString('hex');
        await this.db.transaction(d => {
            const a = d.accounts.find(x => x.email === normalized); requireThat(a, 'NOT_FOUND', 'Account not found.', 404);
            revokePush(d, a.id);
            a.salt = salt; a.passwordHash = passwordHash; a.failures = 0; a.lockedUntil = 0;
            for (const [key, s] of Object.entries(d.sessions)) if (s.accountId === a.id) delete d.sessions[key];
        });
    }
}
