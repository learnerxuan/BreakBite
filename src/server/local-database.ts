import type { PushDevice, PushJob } from '../shared/push.js';
import type { StudentProfile, Notice } from '../shared/features.js';
import { isClosed, foodCheck } from '../shared/features.js';
import { open, mkdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Actor, Slot, VendorState } from '../shared/model.js';
import type { Store } from './store.js';
import { requireThat } from './errors.js';
import { seedVendor, VENDOR_IDS } from './seed.js';

export interface LocalAccount {
    id: string; email: string; name: string; role: 'student' | 'vendor'; vendorId?: string;
    salt: string; passwordHash: string; createdAt: string; failures: number; lockedUntil: number;
}
export interface LocalSession { accountId: string; expiresAt: number; csrfToken: string; }
export interface CheckoutRecord {
    id: string; studentId: string; fingerprint: string; createdAt: string; transferMinutes?: number;
    orders: { vendorId: string; orderId: string }[];
}
export interface LocalData {
    pushDevices?: Record<string, PushDevice>; pushJobs?: Record<string, PushJob>;
    schemaVersion: 2; profiles?: Record<string, StudentProfile>; notices?: Notice[]; vendors: Record<string, VendorState>; accounts: LocalAccount[];
    sessions: Record<string, LocalSession>; checkouts: Record<string, CheckoutRecord>;
}
export const accountActor = (a: LocalAccount): Actor => ({ id: a.id, name: a.name, role: a.role, ...(a.vendorId ? { vendorId: a.vendorId } : {}) });

export function assertPickupItinerary(windows: Slot[], transferMinutes: number): void {
    const sorted = [...windows].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt));
    let previousEnd = 0;
    for (const w of sorted) {
        const start = Math.max(Date.parse(w.startAt), previousEnd ? previousEnd + transferMinutes * 60000 : 0);
        requireThat(start + 60000 <= Date.parse(w.endAt), 'PICKUP_OVERLAP', 'Choose staggered pickup windows so there is time to walk between counters. This change may conflict with another kitchen order.', 409);
        previousEnd = start + 60000;
    }
}

/** Single-process durable store. A whole checkout is one file replacement, not N kitchen writes. */
export class LocalDatabase {
    private value!: LocalData;
    private tail: Promise<unknown> = Promise.resolve();
    private lockToken = randomUUID();
    private acquired = false;
    constructor(readonly directory: string) {}
    private file(name: string): string { return path.join(this.directory, name); }
    async open(): Promise<void> {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const handle = await open(this.file('server.lock'), 'wx', 0o600);
                this.acquired = true;
                await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), token: this.lockToken }));
                await handle.close();
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
                let stale = false;
                try {
                    const lock = JSON.parse(await readFile(this.file('server.lock'), 'utf8')) as { pid: number; host: string };
                    if (lock.host === os.hostname() && Number.isInteger(lock.pid) && lock.pid > 0) {
                        try { process.kill(lock.pid, 0); }
                        catch (e) { stale = (e as NodeJS.ErrnoException).code === 'ESRCH'; }
                    }
                } catch { /* An unknown/corrupt lock is not safe to steal. */ }
                requireThat(stale && attempt === 0, 'STORE_LOCKED', 'This data directory is already in use. Stop the other server before opening it. Do not share JSON storage between processes.', 503);
                await unlink(this.file('server.lock'));
            }
        }
        try {
            try {
                const data: unknown = JSON.parse(await readFile(this.file('database.json'), 'utf8'));
                this.validate(data);
                this.value = data;
                // Add newly introduced sample kitchens without replacing existing operator data.
                const migrated = structuredClone(this.value);
                let changed = false;
                for (const id of VENDOR_IDS) {
                    if (!migrated.vendors[id]) { migrated.vendors[id] = seedVendor(id); changed = true; }
                    else {
                        const fresh = seedVendor(id);
                        const vendor = migrated.vendors[id]!.vendor;
                        if (vendor.location === `APU Food Court · ${fresh.vendor.name}`) {
                            vendor.location = fresh.vendor.location;
                            changed = true;
                        }
                        for (const item of migrated.vendors[id]!.items) {
                            if (item.photoCredit !== 'Photo supplied by the project team; menu item shown may differ.') continue;
                            const replacement = fresh.items.find(candidate => candidate.id === item.id);
                            if (!replacement?.photoPath) continue;
                            item.photoPath = replacement.photoPath;
                            item.photoCredit = replacement.photoCredit;
                            changed = true;
                        }
                    }
                }
                if (changed) { await this.persist(migrated, true); this.value = migrated; }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                const vendors: Record<string, VendorState> = {};
                for (const id of VENDOR_IDS) {
                    try {
                        const old = JSON.parse(await readFile(this.file(`${id}.json`), 'utf8')) as VendorState;
                        requireThat(old.schemaVersion === 1 && old.vendor.id === id, 'INVALID_STORE', 'Invalid legacy vendor file. Restore from backup; no data has been reset.', 500);
                        vendors[id] = old;
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                        vendors[id] = seedVendor(id);
                    }
                }
                this.value = { schemaVersion: 2, vendors, accounts: [], sessions: {}, checkouts: {} };
                await this.persist(this.value, false);
            }
        } catch (error) { await this.close(); throw error; }
    }
    private validate(data: unknown): asserts data is LocalData {
        const d = data as LocalData;
        requireThat(d && d.schemaVersion === 2 && d.vendors && Array.isArray(d.accounts) && d.sessions && d.checkouts, 'INVALID_STORE', 'Unrecognised database.json. Restore a checked backup; the application will not overwrite it.', 500);
        for (const [id, s] of Object.entries(d.vendors))
            requireThat(s.schemaVersion === 1 && s.vendor.id === id && Array.isArray(s.orders) && Array.isArray(s.items), 'INVALID_STORE', 'Invalid kitchen data.', 500);
    }
    read(): LocalData { return structuredClone(this.value); }
    async transaction<T>(work: (draft: LocalData) => T | Promise<T>): Promise<T> {
        requireThat(this.acquired, 'STORE_CLOSED', 'The database is closed.', 503);
        const task = this.tail.then(async () => {
            const draft = this.read();
            const result = await work(draft);
            await this.persist(draft, true);
            this.value = draft;
            return structuredClone(result);
        });
        this.tail = task.catch(() => undefined);
        return task;
    }
    private async atomicFile(name: string, contents: string): Promise<void> {
        const temporary = this.file(`${name}.${randomUUID()}.tmp`);
        try {
            const handle = await open(temporary, 'wx', 0o600);
            try { await handle.writeFile(contents, 'utf8'); await handle.sync(); } finally { await handle.close(); }
            await rename(temporary, this.file(name));
        } finally { await unlink(temporary).catch(() => undefined); }
    }
    private async persist(next: LocalData, backup: boolean): Promise<void> {
        this.validate(next);
        const payload = JSON.stringify(next);
        requireThat(Buffer.byteLength(payload) <= 20 * 1024 * 1024, 'STORE_LIMIT', 'Local storage is full. Archive orders before continuing.', 503);
        if (backup) await this.atomicFile('database.previous.json', JSON.stringify(this.value));
        await this.atomicFile('database.json', payload);
    }
    async close(): Promise<void> {
        await this.tail;
        if (!this.acquired) return;
        this.acquired = false;
        const lock = await readFile(this.file('server.lock'), 'utf8').catch(() => '');
        if (lock && JSON.parse(lock).token === this.lockToken) await unlink(this.file('server.lock'));
    }
}

/** Reuses the original order domain while putting all kitchens in the same durable transaction. */
export class LocalStore implements Store {
    constructor(readonly db: LocalDatabase) {}
    async ids(): Promise<string[]> { return Object.keys(this.db.read().vendors); }
    async read(id: string): Promise<VendorState> {
        const d = this.db.read(); const s = d.vendors[id];
        requireThat(s, 'NOT_FOUND', 'Kitchen not found.', 404);
        for (const order of s.orders) if (!isClosed(order.status) && d.profiles?.[order.studentId]) order.dietary = structuredClone(d.profiles[order.studentId]!.preferences);
        return s;
    }
    async initialize(state: VendorState, replace = false): Promise<void> {
        requireThat(!replace, 'RESET_DISABLED', 'Reset is not available in local account mode.', 403);
        if (this.db.read().vendors[state.vendor.id]) return;
        await this.db.transaction(d => { d.vendors[state.vendor.id] ??= structuredClone(state); });
    }
    async transact<T>(id: string, work: (s: VendorState) => T): Promise<T> {
        return this.db.transaction(d => {
            const s = d.vendors[id];
            requireThat(s, 'NOT_FOUND', 'Kitchen not found.', 404);
            const before = new Map(s.orders.map(o => [o.id, o.slotId]));
            const lineVersions = new Map(s.orders.map(o => [o.id, JSON.stringify(o.lines)]));
            for (const order of s.orders) if (!isClosed(order.status) && d.profiles?.[order.studentId]) order.dietary = structuredClone(d.profiles[order.studentId]!.preferences);
            const result = work(s);
            for (const order of s.orders) {
                const preferences = d.profiles?.[order.studentId]?.preferences;
                if (preferences && lineVersions.get(order.id) !== JSON.stringify(order.lines)) {
                    for (const line of order.lines) {
                        const item = s.items.find(i => i.id === line.itemId)!;
                        const check = foodCheck(item.foodInfo, preferences);
                        requireThat(check.suitable, 'DIETARY_CONFLICT', 'Current dietary restrictions do not match this replacement. ' + check.reasons.join(' '), 409);
                    }
                    order.dietary = structuredClone(preferences);
                }
                if (!order.checkoutId || before.get(order.id) === order.slotId) continue;
                const checkout = Object.values(d.checkouts).find(c => c.id === order.checkoutId);
                if (!checkout) continue;
                const windows = checkout.orders.flatMap(ref => {
                    const state = d.vendors[ref.vendorId]; const child = state?.orders.find(o => o.id === ref.orderId);
                    if (!child || isClosed(child.status)) return [];
                    const slot = state!.slots.find(w => w.id === child.slotId);
                    requireThat(slot, 'INVARIANT', 'Missing pickup window.', 500); return [slot];
                });
                assertPickupItinerary(windows, checkout.transferMinutes ?? 2);
            }
            s.revision++; return result;
        });
    }
}

/** Private draft adapter: never writes to disk until the outer checkout transaction succeeds. */
export class DraftStore implements Store {
    constructor(readonly vendors: Record<string, VendorState>) {}
    async ids(): Promise<string[]> { return Object.keys(this.vendors); }
    async read(id: string): Promise<VendorState> { const s = this.vendors[id]; requireThat(s, 'NOT_FOUND', 'Kitchen not found.', 404); return structuredClone(s); }
    async initialize(state: VendorState): Promise<void> { this.vendors[state.vendor.id] ??= structuredClone(state); }
    async transact<T>(id: string, work: (s: VendorState) => T): Promise<T> {
        const s = await this.read(id); const result = work(s); s.revision++; this.vendors[id] = s; return structuredClone(result);
    }
}
