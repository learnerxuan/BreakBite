import type { LocalData } from './local-database.js';
import { seededData, upgradeSeedKitchens, validateLocalData, type Database } from './local-database.js';
import { AppError, requireThat } from './errors.js';

/** Firestore layout for the same LocalData that database.json holds.
 *
 * ROOT                                 meta: format, schemaVersion, revision, nextSeq, updatedAt
 * ROOT/{accounts|sessions|checkouts|profiles|notices|pushDevices|pushJobs}/{id}
 * ROOT/vendors/{vendorId}              VendorState without orders and requests
 * ROOT/vendors/{vendorId}/orders/{orderId}
 * ROOT/vendors/{vendorId}/requests/{key}
 *
 * Every record document is { key, seq, payload }: payload is the record's exact JSON, key is the
 * original id and seq preserves array/insertion order. Every commit also updates ROOT with an
 * updateTime precondition, so all writes are serialised and a multi-kitchen checkout is one atomic commit.
 */
export type StoredDoc = { key: string; seq: number; payload: string };
export type RootMeta = { format: 'breakbite-firestore'; schemaVersion: 2; revision: number; nextSeq: number; updatedAt: string };
/** Opaque Firestore updateTime. */
export type Version = string;
export type DocWrite =
    | { path: string; set: StoredDoc | RootMeta; precondition?: { exists: false } | { updateTime: Version } }
    | { path: string; delete: true };
export interface DocumentStore {
    get(path: string): Promise<{ data: Record<string, unknown>; version: Version } | null>;
    /** Every document directly inside a collection. */
    list(collection: string): Promise<{ id: string; data: Record<string, unknown> }[]>;
    /** Includes missing parent document references that still have descendant documents. */
    listDocumentIds(collection: string): Promise<string[]>;
    /** Atomic: all writes apply or none. Returns each written document's new version; throws FirestoreConflict on a failed precondition. */
    commit(writes: DocWrite[]): Promise<Version[]>;
    close?(): Promise<void>;
}
export class FirestoreConflict extends Error { constructor() { super('Firestore precondition failed.'); } }

const RECORD_GROUPS = ['accounts', 'sessions', 'checkouts', 'profiles', 'notices', 'pushDevices', 'pushJobs'] as const;
const MAX_PAYLOAD = 1_000_000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Firestore document IDs cannot contain "/", be "." or "..", or match __.*__. Other keys are base64url-encoded behind "~". */
export function encodeId(key: string): string {
    requireThat(typeof key === 'string' && key.length > 0, 'INVALID_STORE', 'A stored record has no id.', 500);
    if (/^[A-Za-z0-9_.-]{1,700}$/.test(key) && key !== '.' && key !== '..' && !/^__.*__$/.test(key)) return key;
    const encoded = `~${Buffer.from(key, 'utf8').toString('base64url')}`;
    requireThat(encoded.length <= 1500, 'INVALID_STORE', 'A stored record id is too long for Firestore.', 500);
    return encoded;
}

export interface FlatDoc { path: string; group: string; key: string; payload: string }
/** All documents for one LocalData, in the application's iteration order. */
export function flatten(data: LocalData, root: string): FlatDoc[] {
    const docs: FlatDoc[] = [];
    const seen = new Set<string>();
    const add = (group: string, key: string, value: unknown) => {
        const path = `${root}/${group}/${encodeId(key)}`;
        requireThat(!seen.has(path), 'INVALID_STORE', `Two ${group} records share an id; storage refused.`, 500);
        seen.add(path);
        const payload = JSON.stringify(value);
        requireThat(Buffer.byteLength(payload) <= MAX_PAYLOAD, 'STORE_LIMIT', `A ${group.split('/').at(-1)} record is larger than Firestore's 1 MB document limit. Archive old data before continuing.`, 503);
        docs.push({ path, group, key, payload });
    };
    for (const a of data.accounts) add('accounts', a.id, a);
    for (const [key, value] of Object.entries(data.sessions)) add('sessions', key, value);
    for (const [key, value] of Object.entries(data.checkouts)) add('checkouts', key, value);
    for (const [key, value] of Object.entries(data.profiles ?? {})) add('profiles', key, value);
    for (const n of data.notices ?? []) add('notices', n.id, n);
    for (const [key, value] of Object.entries(data.pushDevices ?? {})) add('pushDevices', key, value);
    for (const [key, value] of Object.entries(data.pushJobs ?? {})) add('pushJobs', key, value);
    for (const [id, state] of Object.entries(data.vendors)) {
        const { orders, requests, ...kitchen } = state;
        add('vendors', id, kitchen);
        const group = `vendors/${encodeId(id)}`;
        for (const o of orders) add(`${group}/orders`, o.id, o);
        for (const [key, value] of Object.entries(requests)) add(`${group}/requests`, key, value);
    }
    return docs;
}

/** Keeps a document's previous seq while it is still in order within its group, so appends never rewrite older documents. */
export function assignSequence(docs: FlatDoc[], previous: ReadonlyMap<string, number>, nextSeq: number): { seqs: number[]; nextSeq: number } {
    const last = new Map<string, number>();
    const seqs = docs.map(doc => {
        const prior = previous.get(doc.path);
        const seq = prior !== undefined && prior > (last.get(doc.group) ?? 0) ? prior : nextSeq++;
        last.set(doc.group, seq);
        return seq;
    });
    return { seqs, nextSeq };
}

function storedDoc(id: string, data: Record<string, unknown>): StoredDoc {
    requireThat(typeof data.key === 'string' && Number.isSafeInteger(data.seq) && typeof data.payload === 'string' && encodeId(data.key) === id,
        'INVALID_STORE', 'Unrecognised Firestore document. Check FIRESTORE_ROOT; the application will not overwrite it.', 500);
    return { key: data.key, seq: data.seq as number, payload: data.payload };
}
function parsePayload(doc: StoredDoc): unknown {
    try { return JSON.parse(doc.payload); }
    catch { throw new AppError(500, 'INVALID_STORE', 'A Firestore document contains malformed data.'); }
}

/** Groups are keyed like flatten(): "accounts", "vendors", "vendors/{id}/orders". */
export function rebuild(groups: ReadonlyMap<string, StoredDoc[]>): LocalData {
    const sorted = (group: string) => [...(groups.get(group) ?? [])].sort((a, b) => a.seq - b.seq);
    const list = <T>(group: string) => sorted(group).map(d => parsePayload(d) as T);
    const record = <T>(group: string) => Object.fromEntries(sorted(group).map(d => [d.key, parsePayload(d) as T])) as Record<string, T>;
    const vendors: LocalData['vendors'] = {};
    for (const doc of sorted('vendors')) {
        const group = `vendors/${encodeId(doc.key)}`;
        vendors[doc.key] = { ...(parsePayload(doc) as object), orders: list(`${group}/orders`), requests: record(`${group}/requests`) } as LocalData['vendors'][string];
    }
    const data: LocalData = { schemaVersion: 2, vendors, accounts: list('accounts'), sessions: record('sessions'), checkouts: record('checkouts') };
    // Optional collections stay absent until used, matching a new database.json.
    if (groups.get('profiles')?.length) data.profiles = record('profiles');
    if (groups.get('notices')?.length) data.notices = list('notices');
    if (groups.get('pushDevices')?.length) data.pushDevices = record('pushDevices');
    if (groups.get('pushJobs')?.length) data.pushJobs = record('pushJobs');
    validateLocalData(data);
    return data;
}

function rootMeta(data: Record<string, unknown>): RootMeta {
    requireThat(data.format === 'breakbite-firestore' && data.schemaVersion === 2 && Number.isSafeInteger(data.revision) && Number.isSafeInteger(data.nextSeq),
        'INVALID_STORE', 'FIRESTORE_ROOT points at a document that is not BreakBite data.', 500);
    return data as RootMeta;
}

export interface FirestoreDatabaseOptions {
    /** Document path such as envs/production. */
    root: string;
    /** DATA_DIR for photos and push keys. */
    directory: string;
    /** How often requests check ROOT for writes by another process; 0 turns checking off. */
    refreshMs?: number;
    clock?: () => number;
    log?: (message: string) => void;
}

/** LocalDatabase semantics backed by Firestore: synchronous reads from an in-memory copy, serialised optimistic transactions. */
export class FirestoreDatabase implements Database {
    readonly directory: string;
    private readonly root: string;
    private readonly refreshMs: number;
    private readonly clock: () => number;
    private readonly log: (message: string) => void;
    private value!: LocalData;
    private stored = new Map<string, StoredDoc>();
    private meta!: RootMeta;
    private version: Version = '';
    private tail: Promise<unknown> = Promise.resolve();
    private opened = false;
    private stale = false;
    private checkedAt = 0;
    constructor(private readonly docs: DocumentStore, options: FirestoreDatabaseOptions) {
        const segments = options.root.split('/');
        requireThat(segments.length >= 2 && segments.length % 2 === 0 && segments.every(s => /^[A-Za-z0-9_-]{1,100}$/.test(s)), 'CONFIG', 'FIRESTORE_ROOT must be a document path such as envs/production.', 500);
        this.root = options.root;
        this.directory = options.directory;
        this.refreshMs = options.refreshMs ?? 0;
        this.clock = options.clock ?? Date.now;
        this.log = options.log ?? (() => undefined);
    }
    async open(): Promise<void> {
        try {
            await this.load(true);
            this.opened = true;
            this.checkedAt = Date.now();
            if (upgradeSeedKitchens(structuredClone(this.value))) await this.transaction(d => { upgradeSeedKitchens(d); });
        } catch (error) {
            this.opened = false;
            // A serverless startup retry creates a new SDK app. Release this failed
            // instance too, including failures before opened was set.
            try { await this.docs.close?.(); } catch { /* Preserve the original startup failure. */ }
            throw error;
        }
    }
    read(): LocalData { return structuredClone(this.value); }
    async transaction<T>(work: (draft: LocalData) => T | Promise<T>): Promise<T> {
        requireThat(this.opened, 'STORE_CLOSED', 'The database is closed.', 503);
        const task = this.tail.then(() => this.commitWork(work));
        this.tail = task.catch(() => undefined);
        return task;
    }
    async refresh(): Promise<void> {
        if (!this.opened || (!this.stale && (this.refreshMs <= 0 || Date.now() - this.checkedAt < this.refreshMs))) return;
        const task = this.tail.then(async () => {
            // Concurrent requests queue here; only the first one re-reads.
            if (!this.stale && Date.now() - this.checkedAt < this.refreshMs) return;
            try {
                const current = await this.docs.get(this.root);
                if (this.stale || current?.version !== this.version) await this.load();
                this.checkedAt = Date.now();
            } catch (error) {
                this.stale = true;
                throw error;
            }
        });
        this.tail = task.catch(() => undefined);
        return task;
    }
    async close(): Promise<void> {
        await this.tail;
        if (!this.opened) return;
        this.opened = false;
        await this.docs.close?.();
    }

    private async commitWork<T>(work: (draft: LocalData) => T | Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt++) {
            if (this.stale) await this.load();
            const draft = structuredClone(this.value);
            const result = await work(draft);
            validateLocalData(draft);
            const docs = flatten(draft, this.root);
            const { seqs, nextSeq } = assignSequence(docs, new Map([...this.stored].map(([path, d]) => [path, d.seq])), this.meta.nextSeq);
            const next = new Map<string, StoredDoc>();
            const writes: DocWrite[] = [];
            docs.forEach((doc, i) => {
                const stored: StoredDoc = { key: doc.key, seq: seqs[i]!, payload: doc.payload };
                next.set(doc.path, stored);
                const old = this.stored.get(doc.path);
                if (!old || old.seq !== stored.seq || old.payload !== stored.payload) writes.push({ path: doc.path, set: stored });
            });
            for (const path of this.stored.keys()) if (!next.has(path)) writes.push({ path, delete: true });
            if (!writes.length) {
                // Even read-only/no-op work must observe password resets, revocation
                // and idempotency records committed by another process.
                let current;
                try { current = await this.docs.get(this.root); }
                catch (error) { this.stale = true; throw error; }
                if (current?.version === this.version) { this.value = draft; return structuredClone(result); }
                this.stale = true;
                requireThat(attempt < 7, 'CONTENTION', 'Many changes are happening at once. Retry your request.', 409);
                await sleep(20 * 2 ** attempt + Math.random() * 20);
                continue;
            }
            const meta: RootMeta = { ...this.meta, revision: this.meta.revision + 1, nextSeq, updatedAt: new Date(this.clock()).toISOString() };
            try {
                const versions = await this.docs.commit([...writes, { path: this.root, set: meta, precondition: { updateTime: this.version } }]);
                this.value = draft; this.stored = next; this.meta = meta; this.version = versions.at(-1)!;
                return structuredClone(result);
            } catch (error) {
                // A lost response may still have committed: reload before trusting the cache again.
                this.stale = true;
                if (!(error instanceof FirestoreConflict)) throw error;
                requireThat(attempt < 7, 'CONTENTION', 'Many changes are happening at once. Retry your request.', 409);
                await sleep(20 * 2 ** attempt + Math.random() * 20);
            }
        }
    }
    private async load(create = false): Promise<void> {
        for (let attempt = 0; attempt < 5; attempt++) {
            const before = await this.docs.get(this.root);
            if (!before) {
                requireThat(create, 'NOT_INITIALIZED', `No BreakBite data at FIRESTORE_ROOT=${this.root}. Check the setting, then restart the server to create it.`, 503);
                if (await this.initialize()) return;
                continue;
            }
            const meta = rootMeta(before.data);
            const groups = await this.readAll();
            const after = await this.docs.get(this.root);
            // Another process committed while the collections were being read: read them again.
            if (after?.version !== before.version) { await sleep(20 * 2 ** attempt); continue; }
            this.value = rebuild(groups);
            this.stored = new Map([...groups].flatMap(([group, docs]) => docs.map((d): [string, StoredDoc] => [`${this.root}/${group}/${encodeId(d.key)}`, d])));
            this.meta = meta; this.version = before.version; this.stale = false;
            return;
        }
        throw new AppError(503, 'CLOUD_STORE', 'Firestore kept changing while loading. Retry shortly.');
    }
    private async readAll(): Promise<Map<string, StoredDoc[]>> {
        const groups = new Map<string, StoredDoc[]>();
        const read = async (group: string) => {
            groups.set(group, (await this.docs.list(`${this.root}/${group}`)).map(d => storedDoc(d.id, d.data)));
        };
        await Promise.all([...RECORD_GROUPS, 'vendors'].map(read));
        await Promise.all(groups.get('vendors')!.flatMap(v => [`vendors/${encodeId(v.key)}/orders`, `vendors/${encodeId(v.key)}/requests`]).map(read));
        return groups;
    }
    /** Creates the seeded dataset and ROOT in one commit. Returns false if another process created it first. */
    private async initialize(): Promise<boolean> {
        // A normal collection query omits deleted parent documents with surviving children.
        // List document references instead, so orphan orders/requests cannot be reseeded over.
        const leftovers = (await Promise.all([...RECORD_GROUPS, 'vendors'].map(group => this.docs.listDocumentIds(`${this.root}/${group}`)))).flat().length;
        // Another process may have initialized atomically while this scan was in flight.
        if (leftovers && await this.docs.get(this.root)) return false;
        requireThat(leftovers === 0, 'STALE_DOCUMENTS', `Firestore has ${leftovers} leftover documents under ${this.root} but no root document. Delete the whole ${this.root} path, including subcollections, and restart.`, 503);
        const data = seededData();
        const docs = flatten(data, this.root);
        const { seqs, nextSeq } = assignSequence(docs, new Map(), 1);
        const meta: RootMeta = { format: 'breakbite-firestore', schemaVersion: 2, revision: 1, nextSeq, updatedAt: new Date(this.clock()).toISOString() };
        const stored = docs.map((doc, i): [string, StoredDoc] => [doc.path, { key: doc.key, seq: seqs[i]!, payload: doc.payload }]);
        try {
            const versions = await this.docs.commit([...stored.map(([path, set]) => ({ path, set })), { path: this.root, set: meta, precondition: { exists: false } }]);
            this.value = data; this.stored = new Map(stored); this.meta = meta; this.version = versions.at(-1)!; this.stale = false;
            this.log(`Created a new Firestore dataset at ${this.root} with ${Object.keys(data.vendors).length} sample kitchens.`);
            return true;
        } catch (error) {
            if (error instanceof FirestoreConflict) return false;
            throw error;
        }
    }
}
