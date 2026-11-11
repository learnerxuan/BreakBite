import { createHash } from 'node:crypto';
import type { ClassEvent } from '../shared/features.js';
import { malaysiaDate } from '../shared/timetable.js';
import { AppError, requireThat } from './errors.js';

const TIMETABLE_URL = 'https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable';
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface ApspaceSnapshot {
    revision: string;
    checkedAt: string;
    publishedAt?: string;
    options: { intake: string; groups: string[] }[];
    select(intake: string, group: string): { events: ClassEvent[]; firstDate: string; lastDate: string };
}

export interface ApspaceProvider {
    get(force?: boolean): Promise<ApspaceSnapshot>;
}

function invalidSource(): AppError {
    return new AppError(502, 'APSPACE_SOURCE', 'The APSpace timetable source returned invalid or unsupported data.');
}

function field(row: Record<string, unknown>, key: string, limit: number): string {
    const value = row[key];
    if (typeof value !== 'string' || !value.trim() || value.length > limit) throw invalidSource();
    return value.trim();
}

function instant(value: string): string {
    const match = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d)(Z|[+-]\d\d:\d\d)$/.exec(value);
    if (!match) throw invalidSource();
    const wallTime = `${match[1]}T${match[2]}`;
    const wall = Date.parse(`${wallTime}Z`);
    const epoch = Date.parse(value);
    if (!Number.isFinite(epoch) || !Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 19) !== wallTime) {
        throw invalidSource();
    }
    return new Date(epoch).toISOString();
}

export function normalizeApspaceTimetable(data: unknown, checkedAt: string, publishedAt?: string): ApspaceSnapshot {
    if (!Array.isArray(data) || !data.length || data.length > MAX_ROWS) throw invalidSource();
    const intakes = new Map<string, Map<string, Map<string, ClassEvent>>>();
    for (const item of data) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalidSource();
        const row = item as Record<string, unknown>;
        const intake = field(row, 'INTAKE', 64);
        const group = field(row, 'GROUPING', 4);
        if (!/^[A-Z0-9][A-Z0-9 ()_./&-]*$/i.test(intake) || !/^G[1-9]\d{0,2}$/.test(group)) throw invalidSource();

        const startAt = instant(field(row, 'TIME_FROM_ISO', 25));
        const endAt = instant(field(row, 'TIME_TO_ISO', 25));
        if (Date.parse(endAt) - Date.parse(startAt) > 24 * HOUR || endAt <= startAt ||
            field(row, 'DATESTAMP_ISO', 10) !== malaysiaDate(startAt)) throw invalidSource();
        const code = field(row, 'CLASS_CODE', 120);
        const title = field(row, 'MODULE_NAME', 120);
        const location = `${field(row, 'ROOM', 80)} · ${field(row, 'LOCATION', 32)}`;
        // The source repeats class codes across dates. A changed occurrence gets a new ID for review.
        const id = createHash('sha256').update(JSON.stringify([intake, code, startAt, endAt, title, location])).digest('hex');
        if (!intakes.has(intake)) intakes.set(intake, new Map());
        const groups = intakes.get(intake)!;
        if (!groups.has(group)) groups.set(group, new Map());
        groups.get(group)!.set(id, { id, uid: id, startAt, endAt, title, location, source: 'apspace' });
    }

    const options = [...intakes.keys()].sort().map(intake => ({ intake, groups: [...intakes.get(intake)!.keys()].sort() }));
    const fingerprint = createHash('sha256');
    for (const { intake, groups } of options) {
        for (const group of groups) {
            fingerprint.update(JSON.stringify([intake, group, [...intakes.get(intake)!.get(group)!.keys()].sort()]));
        }
    }
    return {
        revision: fingerprint.digest('hex'), checkedAt, publishedAt, options,
        select(intake, group) {
            const selected = intakes.get(intake)?.get(group);
            requireThat(selected?.size && selected.size <= 1000, 'APSPACE_SELECTION', 'No supported timetable is available for that intake and group.', 422);
            const events = [...selected.values()]
                .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id))
                .map(event => ({ ...event }));
            return { events, firstDate: malaysiaDate(events[0]!.startAt), lastDate: malaysiaDate(events.at(-1)!.startAt) };
        },
    };
}

async function readSnapshot(response: Response): Promise<unknown> {
    const declaredSize = Number(response.headers.get('content-length'));
    if (!response.body || declaredSize > MAX_BYTES || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
        await response.body?.cancel();
        throw invalidSource();
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const pieces: string[] = [];
    let bytes = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_BYTES) throw invalidSource();
            pieces.push(decoder.decode(value, { stream: true }));
        }
        pieces.push(decoder.decode());
        return JSON.parse(pieces.join('')) as unknown;
    } catch {
        await reader.cancel().catch(() => {});
        throw invalidSource();
    } finally {
        reader.releaseLock();
    }
}

export class ApspaceTimetableProvider implements ApspaceProvider {
    private snapshot?: ApspaceSnapshot;
    private etag?: string;
    private lastModified?: string;
    private pending?: Promise<ApspaceSnapshot>;
    private retryAt = 0;
    private failures = 0;
    private nextCheck = 0;
    private nextForcedCheck = 0;

    constructor(private readonly fetcher: typeof fetch = fetch, private readonly clock = Date.now, private readonly interval = 6 * HOUR) {}

    async get(force = false): Promise<ApspaceSnapshot> {
        if (this.pending) return this.pending;
        const now = this.clock();
        if (now < this.retryAt) throw new AppError(503, 'APSPACE_UNAVAILABLE', 'The APSpace timetable source is temporarily unavailable.');
        if (this.snapshot && now < (force ? this.nextForcedCheck : this.nextCheck)) return this.snapshot;

        this.pending = this.load();
        try {
            const snapshot = await this.pending;
            this.failures = 0;
            this.retryAt = 0;
            this.nextCheck = this.clock() + Math.max(MINUTE, this.interval);
            this.nextForcedCheck = this.clock() + MINUTE;
            return snapshot;
        } catch (error) {
            this.retryAt = this.clock() + MINUTE * 2 ** Math.min(this.failures++, 5);
            throw error;
        } finally {
            this.pending = undefined;
        }
    }

    private async load(): Promise<ApspaceSnapshot> {
        const headers = new Headers({ Accept: 'application/json' });
        if (this.etag) headers.set('If-None-Match', this.etag);
        else if (this.lastModified) headers.set('If-Modified-Since', this.lastModified);
        let response: Response;
        try {
            response = await this.fetcher(TIMETABLE_URL, { headers, redirect: 'error', signal: AbortSignal.timeout(15_000) });
        } catch {
            throw new AppError(503, 'APSPACE_UNAVAILABLE', 'The APSpace timetable source could not be reached.');
        }
        if (response.redirected || (response.url && response.url !== TIMETABLE_URL)) {
            await response.body?.cancel();
            throw invalidSource();
        }
        if (response.status === 304 && this.snapshot) {
            this.snapshot = { ...this.snapshot, checkedAt: new Date(this.clock()).toISOString() };
            return this.snapshot;
        }
        if (response.status !== 200) {
            await response.body?.cancel();
            throw new AppError(503, 'APSPACE_UNAVAILABLE', 'The APSpace timetable source is temporarily unavailable.');
        }
        const data = await readSnapshot(response);
        const modified = response.headers.get('last-modified');
        const published = modified ? Date.parse(modified) : NaN;
        const publishedAt = Number.isFinite(published) ? new Date(published).toISOString() : undefined;
        const snapshot = normalizeApspaceTimetable(data, new Date(this.clock()).toISOString(), publishedAt);
        this.snapshot = snapshot;
        this.etag = response.headers.get('etag') || undefined;
        this.lastModified = publishedAt ? modified! : undefined;
        return snapshot;
    }
}
