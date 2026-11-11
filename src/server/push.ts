import { createHash, randomUUID } from 'node:crypto';
import type { Actor } from '../shared/model.js';
import type { Notice } from '../shared/features.js';
import { isClosed } from '../shared/features.js';
import type { PushKeys, PushStatus } from '../shared/push.js';
import type { Database, LocalData } from './local-database.js';
import { object, requireThat, text } from './errors.js';
import { subscriptionOf, transport, type PushTransport } from './web-push.js';
const minute = 60000, day = 86400000;
export const pushDigest = (value: string): string => createHash('sha256').update(value).digest('hex');
const student = (a: Actor) => requireThat(a.role === 'student', 'FORBIDDEN', 'Student notifications only.', 403);
/** Delete subscriptions AND unsent jobs on sign-out/reset; never expose browser endpoints in logs. */
export function revokePush(d: LocalData, accountId: string, sessionTag?: string): void {
    for (const [id, device] of Object.entries(d.pushDevices ?? {})) if (device.accountId === accountId && (!sessionTag || device.sessionTag === sessionTag)) {
        delete d.pushDevices![id];
        for (const [key, job] of Object.entries(d.pushJobs ?? {})) if (job.deviceId === id) delete d.pushJobs![key];
    }
}
function noticeKind(n: Notice): string { return n.key.slice(n.orderId.length + 1).split('-')[0] ?? ''; }
function message(n: Notice): { title: string; body: string } {
    const kind = noticeKind(n);
    const titles: Record<string, string> = { ready: 'Your pickup is ready', due: 'Pickup reminder', overdue: 'Check your pickup', delay: 'Kitchen delay', uncollected: 'Pickup status updated', collected: 'Pickup completed' };
    // Intentionally generic: no pickup credentials, student names, dietary data, timetable or order IDs on lock screens.
    return { title: titles[kind] ?? 'BreakBite order update', body: 'Open your BreakBite inbox for the latest details. Sign in if requested.' };
}
function applicable(d: LocalData, n: Notice, now: number): boolean {
    if (n.readAt) return false;
    const o = d.vendors[n.vendorId]?.orders.find(o => o.id === n.orderId);
    if (!o) return false;
    const k = noticeKind(n);
    if (['ready', 'due', 'overdue', 'delay'].includes(k) && isClosed(o.status)) return false;
    if (k === 'delay' && !o.vendorDelayed) return false;
    if (k === 'ready' || k === 'due') return o.status === 'ready' && (!o.collectionDueAt || now < Date.parse(o.collectionDueAt));
    return true;
}
export class PushService {
    private running: Promise<void> | null = null;
    private send: PushTransport;
    constructor(readonly db: Database, private keys?: PushKeys, send?: PushTransport, private clock = Date.now) {
        this.send = send ?? (keys ? transport(keys) : async () => ({ status: 503 }));
    }
    publicConfig() { return { configured: !!this.keys, publicKey: this.keys?.publicKey ?? '' }; }
    status(actor: Actor): PushStatus {
        student(actor);
        const now = this.clock();
        return { ...this.publicConfig(), devices: Object.values(this.db.read().pushDevices ?? {}).filter(d => d.accountId === actor.id && d.expiresAt > now && d.publicKey === this.keys?.publicKey)
            .map(d => ({ id: d.id, label: d.label, expiresAt: d.expiresAt, lastAcceptedAt: d.lastAcceptedAt, lastError: d.lastError })) };
    }
    async subscribe(actor: Actor, input: unknown, sessionTag: string): Promise<{ id: string }> {
        student(actor); requireThat(this.keys, 'PUSH_NOT_CONFIGURED', 'The operator must configure Web Push keys before enabling device alerts.', 503);
        const b = object(input), sub = subscriptionOf(b.subscription), id = pushDigest(sub.endpoint), now = this.clock();
        const label = text(b.label ?? 'This browser', 'Device label', 1, 60);
        return this.db.transaction(d => {
            d.pushDevices ??= {}; d.pushJobs ??= {};
            const old = d.pushDevices[id];
            requireThat(!old || old.accountId === actor.id, 'PUSH_DEVICE_IN_USE', 'This browser subscription belongs to another account. Reset the browser subscription and enable again.', 409);
            requireThat(old || Object.keys(d.pushDevices).length < 1000, 'PUSH_LIMIT', 'This installation has reached its notification device limit.', 503);
            requireThat(old || Object.values(d.pushDevices).filter(v => v.accountId === actor.id).length < 8, 'PUSH_LIMIT', 'Remove an old notification device before adding another.', 409);
            const same = old && old.publicKey === this.keys!.publicKey && old.keys.p256dh === sub.keys.p256dh && old.keys.auth === sub.keys.auth && old.expiresAt > now;
            d.pushDevices[id] = { ...sub, id, accountId: actor.id, sessionTag, label, publicKey: this.keys!.publicKey,
                createdAt: same ? old.createdAt : now, updatedAt: now, expiresAt: now + 30 * day,
                ignoreNoticeIds: same ? old.ignoreNoticeIds : (d.notices ?? []).filter(n => n.studentId === actor.id && Date.parse(n.at) >= now).map(n => n.id),
                ...(same ? { lastAcceptedAt: old.lastAcceptedAt, lastTestAt: old.lastTestAt } : {}) };
            if (!same) for (const [key, job] of Object.entries(d.pushJobs)) if (job.deviceId === id) delete d.pushJobs[key];
            return { id };
        });
    }
    async unsubscribe(actor: Actor, input: unknown): Promise<void> {
        student(actor); const id = text(object(input).id, 'Device ID', 64, 64);
        await this.db.transaction(d => {
            const device = d.pushDevices?.[id];
            requireThat(!device || device.accountId === actor.id, 'NOT_FOUND', 'Device not found.', 404);
            if (device) { delete d.pushDevices![id]; for (const [key, job] of Object.entries(d.pushJobs ?? {})) if (job.deviceId === id) delete d.pushJobs![key]; }
        });
    }
    async test(actor: Actor, input: unknown): Promise<{ queued: true }> {
        student(actor); requireThat(this.keys, 'PUSH_NOT_CONFIGURED', 'Web Push is not configured.', 503);
        const id = text(object(input).id, 'Device ID', 64, 64), now = this.clock();
        await this.db.transaction(d => {
            const device = d.pushDevices?.[id];
            requireThat(device && device.accountId === actor.id && device.expiresAt > now && device.publicKey === this.keys!.publicKey, 'NOT_FOUND', 'Active device not found.', 404);
            requireThat(!device.lastTestAt || now - device.lastTestAt >= minute, 'PUSH_COOLDOWN', 'Wait one minute between test notifications.', 429);
            device.lastTestAt = now; const key = randomUUID(); d.pushJobs ??= {};
            d.pushJobs[key] = { id: key, deviceId: id, createdAt: now, expiresAt: now + 5 * minute, status: 'pending', attempts: 0, nextAt: now,
                title: 'BreakBite test notification', body: 'Device alerts are connected. Order details stay in your private inbox.' };
        });
        return { queued: true };
    }
    /** Independently running durable outbox. Network requests never hold the database transaction. */
    pump(): Promise<void> {
        if (!this.keys) return Promise.resolve();
        if (!this.running) this.running = this.run().finally(() => { this.running = null; });
        return this.running;
    }
    async settle(): Promise<void> { await this.running; }
    private async run(): Promise<void> {
        const now = this.clock(), snapshot = this.db.read();
        // Avoid rewriting a large JSON database on every idle tick.
        if (!Object.keys(snapshot.pushDevices ?? {}).length && !Object.keys(snapshot.pushJobs ?? {}).length) return;
        const prepare = (d: LocalData) => {
            d.pushDevices ??= {}; d.pushJobs ??= {};
            for (const [id, device] of Object.entries(d.pushDevices)) {
                if (device.expiresAt <= now || device.publicKey !== this.keys!.publicKey || !d.accounts.some(a => a.id === device.accountId)) { delete d.pushDevices[id]; continue; }
                // Baseline IDs only need to cover the same-millisecond subscription boundary.
                device.ignoreNoticeIds = device.ignoreNoticeIds.filter(id => d.notices?.some(n => n.id === id && Date.parse(n.at) >= device.createdAt));
                for (const n of d.notices ?? []) {
                    const at = Date.parse(n.at), key = `${id}:${n.id}`;
                    if (n.studentId !== device.accountId || at < device.createdAt || at < now - 15 * minute || device.ignoreNoticeIds.includes(n.id) || d.pushJobs[key] || !applicable(d, n, now)) continue;
                    if (Object.keys(d.pushJobs).length >= 4000) break; // Bounded local MVP queue, retried next tick after cleanup.
                    let expiresAt = at + 15 * minute;
                    const o = d.vendors[n.vendorId]?.orders.find(o => o.id === n.orderId);
                    if (['ready', 'due'].includes(noticeKind(n)) && o?.collectionDueAt) expiresAt = Math.min(expiresAt, Date.parse(o.collectionDueAt));
                    d.pushJobs[key] = { id: key, deviceId: id, noticeId: n.id, createdAt: now, expiresAt, status: 'pending', attempts: 0, nextAt: now, ...message(n) };
                }
            }
            for (const [id, job] of Object.entries(d.pushJobs)) {
                if (!d.pushDevices[job.deviceId] || job.createdAt < now - day) { delete d.pushJobs[id]; continue; }
                if (!['pending', 'sending'].includes(job.status)) continue;
                const n = job.noticeId ? d.notices?.find(n => n.id === job.noticeId) : undefined;
                if (job.expiresAt <= now || (job.noticeId && (!n || !applicable(d, n, now)))) job.status = 'skipped';
            }
        };
        const preview = structuredClone(snapshot); prepare(preview);
        if (JSON.stringify(snapshot) !== JSON.stringify(preview)) await this.db.transaction(prepare);
        const candidates = Object.values(this.db.read().pushJobs ?? {}).filter(j => ['pending', 'sending'].includes(j.status) && j.nextAt <= now).sort((a, b) => a.createdAt - b.createdAt).slice(0, 20);
        // Four parallel sends keep one unreachable endpoint from blocking every student.
        for (let offset = 0; offset < candidates.length; offset += 4) await Promise.all(candidates.slice(offset, offset + 4).map(j => this.deliver(j.id)));
    }
    private async deliver(id: string): Promise<void> {
        const claim = await this.db.transaction(d => {
            const job = d.pushJobs?.[id], device = job && d.pushDevices?.[job.deviceId];
            if (!job || !device || !['pending', 'sending'].includes(job.status) || job.nextAt > this.clock() || device.expiresAt <= this.clock()) return null;
            if (job.expiresAt <= this.clock() || job.attempts >= 6) { job.status = 'failed'; return null; }
            const n = job.noticeId ? d.notices?.find(n => n.id === job.noticeId) : undefined;
            if (job.noticeId && (!n || !applicable(d, n, this.clock()))) { job.status = 'skipped'; return null; }
            job.status = 'sending'; job.attempts++; job.nextAt = this.clock() + minute; // Lease permits restart recovery.
            return { job, device };
        });
        if (!claim) return;
        const { job, device } = claim;
        let status = 0, retryAfter: string | null | undefined;
        try {
            const topic = pushDigest(job.id).slice(0, 32);
            const payload = JSON.stringify({ title: job.title, body: job.body, tag: `bb-${topic}`, url: '/?view=inbox', expiresAt: job.expiresAt });
            const response = await this.send(device, payload, Math.ceil((job.expiresAt - this.clock()) / 1000), topic);
            status = response.status; retryAfter = response.retryAfter;
        } catch { /* Error messages may contain private push endpoint tokens. Keep only sanitized categories. */ }
        await this.db.transaction(d => {
            const current = d.pushJobs?.[id], live = d.pushDevices?.[device.id];
            if (!current || !live || live.createdAt !== device.createdAt || live.accountId !== device.accountId) return;
            if (status >= 200 && status < 300) { current.status = 'accepted'; live.lastAcceptedAt = this.clock(); delete live.lastError; return; }
            if (status === 404 || status === 410) {
                delete d.pushDevices![device.id];
                for (const [key, item] of Object.entries(d.pushJobs ?? {})) if (item.deviceId === device.id) delete d.pushJobs![key];
                return;
            }
            const transient = !status || status === 408 || status === 429 || status >= 500;
            const error = status ? `Push service returned ${status}.` : 'Push service temporarily unreachable.';
            live.lastError = error; current.lastError = error;
            if (!transient || current.attempts >= 6) { current.status = 'failed'; return; }
            const seconds = Number(retryAfter); const retry = retryAfter ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - this.clock()) : 0;
            current.nextAt = this.clock() + Math.max(Math.min(5 * minute, 15000 * 2 ** (current.attempts - 1)), Number.isFinite(retry) ? Math.max(0, retry) : 0);
            current.status = current.nextAt < current.expiresAt ? 'pending' : 'failed';
        });
    }
}
