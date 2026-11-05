import { mkdir, readFile, rename, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { VendorState } from '../shared/model.js';
import { AppError, requireThat } from './errors.js';
export interface Store {
    ids(): Promise<string[]>;
    read(id: string): Promise<VendorState>;
    transact<T>(id: string, fn: (state: VendorState) => T): Promise<T>;
    initialize(state: VendorState, replace?: boolean): Promise<void>;
}
const clone = <T>(value: T): T => structuredClone(value);
const validateId = (id: string) => requireThat(/^[a-z0-9-]{1,60}$/.test(id), 'INVALID_VENDOR', 'Invalid vendor identifier.');
const sizeCheck = (s: VendorState): string => {
    const payload = JSON.stringify(s);
    requireThat(Buffer.byteLength(payload) < 750000, 'STORE_LIMIT', 'This pilot store needs archival before accepting more data.', 503);
    return payload;
};
/** Per-vendor serialisation. Production uses Firestore compare-and-swap instead. */
export class MemoryStore implements Store {
    protected values = new Map<string, VendorState>();
    private tails = new Map<string, Promise<void>>();
    protected async exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
        const previous = this.tails.get(id) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>(resolve => { release = resolve; });
        this.tails.set(id, current);
        await previous;
        try {
            return await work();
        }
        finally {
            release();
            if (this.tails.get(id) === current)
                this.tails.delete(id);
        }
    }
    async ids(): Promise<string[]> { return [...this.values.keys()]; }
    async read(id: string): Promise<VendorState> {
        validateId(id);
        const state = this.values.get(id);
        requireThat(state, 'NOT_FOUND', 'Vendor not found.', 404);
        return clone(state);
    }
    protected async persist(state: VendorState): Promise<void> { sizeCheck(state); this.values.set(state.vendor.id, clone(state)); }
    async initialize(state: VendorState, replace = false): Promise<void> {
        await this.exclusive(state.vendor.id, async () => { if (replace || !this.values.has(state.vendor.id))
            await this.persist(state); });
    }
    async transact<T>(id: string, fn: (state: VendorState) => T): Promise<T> {
        validateId(id);
        return this.exclusive(id, async () => {
            const state = await this.read(id);
            const result = fn(state);
            state.revision++;
            await this.persist(state);
            return clone(result);
        });
    }
}
/** Durable local demo. One process only; do not mount this on multiple instances. */
export class FileStore extends MemoryStore {
    constructor(private directory: string) { super(); }
    async load(): Promise<void> {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        for (const file of await readdir(this.directory)) {
            if (!/^[a-z0-9-]+\.json$/.test(file))
                continue;
            const state = JSON.parse(await readFile(path.join(this.directory, file), 'utf8')) as VendorState;
            requireThat(state.schemaVersion === 1 && state.vendor.id === file.slice(0, -5), 'INVALID_STORE', 'Unrecognised local data format.', 500);
            this.values.set(state.vendor.id, state);
        }
    }
    protected override async persist(state: VendorState): Promise<void> {
        const payload = sizeCheck(state);
        const target = path.join(this.directory, `${state.vendor.id}.json`);
        const temp = `${target}.${randomUUID()}.tmp`;
        await writeFile(temp, payload, { encoding: 'utf8', mode: 0o600 });
        await rename(temp, target);
        this.values.set(state.vendor.id, clone(state));
    }
}
/** Firestore REST adapter: one small aggregate/document per vendor, CAS on updateTime.
 * All ordering resources for a vendor change atomically. This is a bounded pilot
 * design, not a campus-scale database layout. No SDK or service-account key needed.
 */
export class FirestoreStore implements Store {
    private base: string;
    private documentPrefix: string;
    private tokenCache: {
        value: string;
        until: number;
    } | null = null;
    constructor(private projectId: string, private vendorIds: string[], private fixedToken = '') {
        requireThat(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId), 'CONFIG', 'Set a valid GOOGLE_CLOUD_PROJECT.', 500);
        this.documentPrefix = `projects/${projectId}/databases/(default)/documents`;
        this.base = `https://firestore.googleapis.com/v1/${this.documentPrefix}`;
    }
    async ids(): Promise<string[]> { return [...this.vendorIds]; }
    private async token(): Promise<string> {
        if (this.fixedToken)
            return this.fixedToken;
        if (this.tokenCache && this.tokenCache.until > Date.now())
            return this.tokenCache.value;
        const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) });
        requireThat(response.ok, 'CLOUD_AUTH', 'Cloud service-account token is unavailable.', 503);
        const data = await response.json() as {
            access_token: string;
            expires_in: number;
        };
        requireThat(typeof data.access_token === 'string', 'CLOUD_AUTH', 'Invalid metadata token response.', 503);
        this.tokenCache = { value: data.access_token, until: Date.now() + Math.max(0, data.expires_in - 60) * 1000 };
        return data.access_token;
    }
    private async request(url: string, init: RequestInit = {}): Promise<Response> {
        const token = await this.token();
        return fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    }
    private async versioned(id: string): Promise<{
        state: VendorState;
        updateTime: string;
    }> {
        validateId(id);
        const response = await this.request(`${this.base}/vendorStates/${id}`);
        if (response.status === 404)
            throw new AppError(404, 'NOT_FOUND', 'Vendor data is missing. Run the seed command once.');
        requireThat(response.ok, 'CLOUD_STORE', 'Unable to read Firestore.', 503);
        const data = await response.json() as {
            fields: {
                payload: {
                    stringValue: string;
                };
            };
            updateTime: string;
        };
        const state = JSON.parse(data.fields.payload.stringValue) as VendorState;
        requireThat(state.schemaVersion === 1 && state.vendor.id === id, 'INVALID_STORE', 'Unrecognised cloud data format.', 500);
        return { state, updateTime: data.updateTime };
    }
    async read(id: string): Promise<VendorState> { return (await this.versioned(id)).state; }
    private async commit(state: VendorState, precondition: {
        exists: boolean;
    } | {
        updateTime: string;
    }): Promise<Response> {
        const payload = sizeCheck(state);
        return this.request(`${this.base}:commit`, { method: 'POST', body: JSON.stringify({ writes: [{
                        update: { name: `${this.documentPrefix}/vendorStates/${state.vendor.id}`, fields: { payload: { stringValue: payload } } },
                        currentDocument: precondition,
                    }] }) });
    }
    async initialize(state: VendorState, replace = false): Promise<void> {
        requireThat(!replace, 'UNSAFE_RESET', 'Cloud reset is intentionally disabled.', 403);
        const response = await this.commit(state, { exists: false });
        if (response.ok || response.status === 409)
            return;
        const body = await response.json() as {
            error?: {
                status?: string;
            };
        };
        if (body.error?.status === 'ALREADY_EXISTS' || body.error?.status === 'FAILED_PRECONDITION')
            return;
        throw new AppError(503, 'CLOUD_STORE', `Could not initialise vendor data for project ${this.projectId}.`);
    }
    async transact<T>(id: string, fn: (state: VendorState) => T): Promise<T> {
        for (let attempt = 0; attempt < 7; attempt++) {
            const { state, updateTime } = await this.versioned(id);
            const result = fn(state); // Must remain synchronous and have no external side effects.
            state.revision++;
            const response = await this.commit(state, { updateTime });
            if (response.ok)
                return clone(result);
            const body = await response.json() as {
                error?: {
                    status?: string;
                };
            };
            if (!['ABORTED', 'FAILED_PRECONDITION'].includes(body.error?.status ?? ''))
                throw new AppError(503, 'CLOUD_STORE', 'Firestore write failed.');
            await new Promise(resolve => setTimeout(resolve, 15 * 2 ** attempt + Math.random() * 15));
        }
        throw new AppError(409, 'CONTENTION', 'This vendor is busy. Retry your request with the same idempotency key.');
    }
}
