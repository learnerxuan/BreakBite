import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Actor, MenuItem, Order, PublicOrder, Selection, Slot } from '../shared/model.js';
import { emptyProfile, foodCheck, isClosed, type Notice, type StudentProfile } from '../shared/features.js';
import { LocalDatabase, DraftStore, assertPickupItinerary, type LocalData } from './local-database.js';
import { MealService, safeOrder, parseSelections } from './domain.js';
import { integer, iso, object, requireThat, text } from './errors.js';
import { parsePreferences, foodRevision } from './food.js';
import { parseCalendar } from './timetable.js';
import { bookingLoad, delayedCancellation } from './policy.js';
const minute = 60000;
const stamp = (now: number) => new Date(now).toISOString();
const student = (a: Actor) => requireThat(a.role === 'student', 'FORBIDDEN', 'A student account is required.', 403);
function profile(d: LocalData, actor: Actor): StudentProfile { student(actor); d.profiles ??= {}; return d.profiles[actor.id] ??= emptyProfile(); }
function owned(d: LocalData, a: Actor, vendorId: string, orderId: string): Order {
    const order = d.vendors[vendorId]?.orders.find(o => o.id === orderId);
    requireThat(order && (a.role === 'student' ? order.studentId === a.id : a.role === 'vendor' && a.vendorId === vendorId), 'NOT_FOUND', 'Order not found.', 404);
    return order;
}
function notice(d: LocalData, o: Order, kind: string, message: string, now: number): void {
    d.notices ??= []; const key = `${o.id}:${kind}`;
    if (d.notices.some(n => n.key === key)) return;
    d.notices.push({ id: randomUUID(), key, studentId: o.studentId, orderId: o.id, vendorId: o.vendorId, message, at: stamp(now) });
}
function log(d: LocalData, a: Actor, o: Order, action: string, detail: string, now: number): void {
    const s = d.vendors[o.vendorId]!;
    s.audit.push({ id: randomUUID(), at: stamp(now), actorId: a.id, action, subjectId: o.id, detail });
    if (s.audit.length > 200) s.audit.splice(0, s.audit.length - 200);
}
function itinerary(d: LocalData, o: Order): void {
    const checkout = Object.values(d.checkouts).find(c => c.id === o.checkoutId);
    if (!checkout) return;
    const windows: Slot[] = checkout.orders.flatMap(ref => {
        const state = d.vendors[ref.vendorId]; const child = state?.orders.find(x => x.id === ref.orderId);
        if (!child || isClosed(child.status)) return [];
        return [state!.slots.find(w => w.id === child.slotId)!];
    });
    assertPickupItinerary(windows, checkout.transferMinutes ?? 2);
}
export class ProductService {
    constructor(readonly db: LocalDatabase, private clock = Date.now) {}
    profile(a: Actor): { profile: StudentProfile; notices: Notice[] } {
        const d = this.db.read(); const p = profile(d, a);
        // Preview data is private to this account; never exposed to kitchens or other students.
        return { profile: p, notices: (d.notices ?? []).filter(n => n.studentId === a.id).slice(-100).reverse() };
    }
    loads() { return Object.values(this.db.read().vendors).map(s => bookingLoad(s, this.clock())); }
    async preferences(a: Actor, input: unknown): Promise<void> {
        const value = parsePreferences(input); await this.db.transaction(d => { profile(d, a).preferences = value; });
    }
    async favourite(a: Actor, input: unknown): Promise<void> {
        const b = object(input); const id = text(b.itemId, 'Item ID', 1, 60);
        requireThat(typeof b.saved === 'boolean', 'INVALID_INPUT', 'Specify whether to save the favourite.');
        await this.db.transaction(d => {
            const p = profile(d, a);
            requireThat(!b.saved || Object.values(d.vendors).some(s => s.items.some(i => i.id === id)), 'NOT_FOUND', 'Menu item not found.', 404);
            p.favourites = p.favourites.filter(x => x !== id);
            if (b.saved) { requireThat(p.favourites.length < 100, 'LIMIT', 'Save up to 100 favourites.'); p.favourites.push(id); }
        });
    }
    async usual(a: Actor, input: unknown): Promise<void> {
        const b = object(input); const id = b.id ? text(b.id, 'Saved basket ID', 1, 60) : randomUUID();
        await this.db.transaction(d => {
            const p = profile(d, a); const old = p.usuals.find(x => x.id === id);
            if (b.remove === true) { requireThat(old, 'NOT_FOUND', 'Saved basket not found.', 404); p.usuals = p.usuals.filter(x => x.id !== id); return; }
            const name = text(b.name, 'Saved basket name', 1, 60);
            if (old && b.lines === undefined) { old.name = name; old.updatedAt = stamp(this.clock()); return; }
            requireThat(Array.isArray(b.lines) && b.lines.length > 0 && b.lines.length <= 25, 'INVALID_ITEMS', 'Save a basket of 1–25 lines.');
            const groups = new Map<string, Selection[]>();
            const lines = b.lines.map(v => {
                const x = object(v); const vendorId = text(x.vendorId, 'Kitchen ID', 1, 60); const itemId = text(x.itemId, 'Item ID', 1, 60); const quantity = integer(x.quantity, 'Quantity', 1, 5);
                const item = d.vendors[vendorId]?.items.find(i => i.id === itemId); requireThat(item, 'NOT_FOUND', 'A basket item was removed.', 404);
                const g = groups.get(vendorId) ?? []; g.push({ itemId, quantity }); groups.set(vendorId, g);
                return { vendorId, itemId, quantity, name: item.name, priceSen: item.priceSen, foodRevision: foodRevision(item.foodInfo) };
            });
            requireThat(groups.size <= 5, 'LIMIT', 'Save up to five kitchens.'); for (const g of groups.values()) parseSelections(g);
            requireThat(old || p.usuals.length < 20, 'LIMIT', 'Save up to 20 usual orders.');
            p.usuals = [...p.usuals.filter(x => x.id !== id), { id, name, lines, updatedAt: stamp(this.clock()) }];
        });
    }
    reorder(a: Actor, input: unknown) {
        const d = this.db.read(); const p = profile(d, a); const b = object(input);
        let lines: { vendorId: string; itemId: string; quantity: number; name: string; priceSen: number; foodRevision?: string }[];
        if (b.usualId) {
            const saved = p.usuals.find(u => u.id === b.usualId); requireThat(saved, 'NOT_FOUND', 'Saved basket not found.', 404); lines = saved.lines;
        } else {
            const orders = Object.values(d.vendors).flatMap(s => s.orders.filter(o => o.studentId === a.id && (o.checkoutId ?? o.id) === b.checkoutId));
            requireThat(orders.length, 'NOT_FOUND', 'Previous checkout not found.', 404);
            lines = orders.flatMap(o => o.lines.map(l => ({ vendorId: o.vendorId, itemId: l.itemId, quantity: l.quantity, name: l.name, priceSen: l.unitPriceSen, foodRevision: foodRevision(l.foodInfo) })));
        }
        const warnings: string[] = []; const basket: { vendorId: string; itemId: string; quantity: number }[] = [];
        for (const line of lines) {
            const s = d.vendors[line.vendorId]; const i = s?.items.find(x => x.id === line.itemId);
            if (!i || !i.enabled || !s?.vendor.open || i.stock < line.quantity) { warnings.push(`${line.name}: unavailable or insufficient stock; not added.`); continue; }
            const check = foodCheck(i.foodInfo, p.preferences, this.clock());
            if (!check.suitable) { warnings.push(`${i.name}: ${check.reasons.join(' ')} Not added.`); continue; }
            if ((line.foodRevision ?? '') !== foodRevision(i.foodInfo)) warnings.push(`${i.name}: ingredient/dietary information changed. Review the current details before confirming.`);
            if (i.priceSen !== line.priceSen) warnings.push(`${i.name}: price changed from RM ${(line.priceSen / 100).toFixed(2)} to RM ${(i.priceSen / 100).toFixed(2)}.`);
            basket.push({ vendorId: line.vendorId, itemId: i.id, quantity: line.quantity });
        }
        return { basket, warnings: [...warnings, 'Review the latest ingredient information and choose NEW pickup times. Nothing has been ordered.'] };
    }
    async markRead(a: Actor): Promise<void> {
        student(a); await this.db.transaction(d => { for (const n of d.notices ?? []) if (n.studentId === a.id && !n.readAt) n.readAt = stamp(this.clock()); });
    }
    async previewTimetable(a: Actor, input: unknown) {
        student(a); const b = object(input); const content = text(b.content, 'Calendar file', 1, 262144);
        const result = parseCalendar(content, this.clock());
        const preview = { ...result, id: randomUUID(), expiresAt: stamp(this.clock() + 15 * minute) };
        await this.db.transaction(d => { profile(d, a).preview = preview; }); return preview;
    }
    async confirmTimetable(a: Actor, input: unknown): Promise<void> {
        const b = object(input); requireThat(typeof b.replaceImported === 'boolean', 'INVALID_INPUT', 'Choose merge or replace.');
        await this.db.transaction(d => {
            const p = profile(d, a); const preview = p.preview;
            requireThat(preview && preview.id === b.previewId && Date.parse(preview.expiresAt) > this.clock(), 'PREVIEW_EXPIRED', 'Preview the calendar again before importing.', 409);
            requireThat(Array.isArray(b.ids) && b.ids.length > 0 && b.ids.every(x => typeof x === 'string' && preview.events.some(e => e.id === x)), 'INVALID_CLASSES', 'Select valid preview classes.');
            const chosen = preview.events.filter(e => (b.ids as string[]).includes(e.id));
            const keep = b.replaceImported ? p.classes.filter(e => e.source !== 'import') : p.classes;
            const classes = new Map(keep.map(e => [e.id, e])); for (const e of chosen) classes.set(e.id, e);
            requireThat(classes.size <= 1000, 'LIMIT', 'The timetable supports 1,000 occurrences.');
            p.classes = [...classes.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)); p.importedAt = stamp(this.clock()); p.importHorizonEnd = preview.horizonEnd; delete p.preview;
        });
    }
    async manualClass(a: Actor, input: unknown): Promise<void> {
        const b = object(input); const startAt = iso(b.startAt, 'Class start'); const endAt = iso(b.endAt, 'Class end'); const weeks = integer(b.weeks ?? 1, 'Weeks', 1, 13);
        requireThat(endAt > startAt && Date.parse(endAt) - Date.parse(startAt) <= 86400000, 'INVALID_CLASS', 'Use a positive class duration of at most one day.');
        requireThat(Date.parse(startAt) >= this.clock() - 86400000 && Date.parse(startAt) <= this.clock() + 90 * 86400000, 'INVALID_CLASS', 'Choose a class in the next 90 days.');
        const title = text(b.title, 'Class title', 1, 120); const location = text(b.location ?? '', 'Location', 0, 120);
        await this.db.transaction(d => {
            const p = profile(d, a); requireThat(p.classes.length + weeks <= 1000, 'LIMIT', 'The timetable is full.'); const uid = randomUUID();
            for (let w = 0; w < weeks; w++) {
                const start = stamp(Date.parse(startAt) + w * 7 * 86400000); const end = stamp(Date.parse(endAt) + w * 7 * 86400000);
                if (p.classes.some(e => e.title === title && e.startAt === start && e.endAt === end)) continue;
                p.classes.push({ id: randomUUID(), uid, title, location, source: 'manual', startAt: start, endAt: end });
            }
            p.classes.sort((a, b) => a.startAt.localeCompare(b.startAt));
        });
    }
    async deleteClass(a: Actor, input: unknown): Promise<void> {
        const b = object(input); await this.db.transaction(d => {
            const p = profile(d, a);
            if (b.all === true) { p.classes = []; delete p.importedAt; delete p.importHorizonEnd; delete p.preview; }
            else { const id = text(b.id, 'Class ID'); p.classes = p.classes.filter(e => e.id !== id); }
        });
    }
    async pickupQr(a: Actor, vendorId: string, orderId: string): Promise<{ payload: string }> {
        student(a); return this.db.transaction(d => {
            const o = owned(d, a, vendorId, orderId); requireThat(!isClosed(o.status), 'ORDER_CLOSED', 'This order has closed.', 409);
            o.qrToken ||= randomBytes(16).toString('hex'); return { payload: `BB1:${o.id}:${o.qrToken}` };
        });
    }
    private scanned(d: LocalData, a: Actor, input: unknown): Order {
        requireThat(a.role === 'vendor' && a.vendorId, 'FORBIDDEN', 'Only a kitchen operator can scan pickup credentials.', 403);
        const payload = text(object(input).payload, 'Pickup QR', 1, 110); const match = /^BB1:([a-f0-9-]{36}):([a-f0-9]{32})$/.exec(payload);
        requireThat(match, 'INVALID_QR', 'Not a BreakBite pickup QR.');
        const o = owned(d, a, a.vendorId, match[1]!);
        requireThat(o.status === 'ready', 'NOT_READY', 'This order is not ready, is closed, or has already been collected.', 409);
        requireThat(o.qrToken && o.qrToken.length === match[2]!.length && timingSafeEqual(Buffer.from(o.qrToken), Buffer.from(match[2]!)), 'INVALID_QR', 'This QR is invalid or was replaced.', 400);
        return o;
    }
    resolveQr(a: Actor, input: unknown): PublicOrder { return safeOrder(this.scanned(this.db.read(), a, input), a); }
    async collectQr(a: Actor, input: unknown): Promise<void> {
        const b = object(input);
        await this.db.transaction(async d => {
            const o = this.scanned(d, a, b);
            const service = new MealService(new DraftStore(d.vendors), this.clock, 'pay_at_pickup');
            await service.collect(a, o.vendorId, o.id, { code: o.pickupCode, paymentReceived: b.paymentReceived });
            o.qrToken = ''; notice(d, o, 'collected', 'Pickup completed at your kitchen.', this.clock());
        });
    }
    /** Runs independently of any browser. Notifications remain in the account inbox after restart. */
    async tick(): Promise<void> {
        const now = this.clock(); const snapshot = this.db.read();
        const needs = Object.values(snapshot.vendors).some(s => s.orders.some(o => !isClosed(o.status) && (o.status === 'ready' || o.vendorDelayed)));
        if (!needs) return;
        const all = (d: LocalData) => {
            for (const s of Object.values(d.vendors)) for (const o of s.orders) {
                if (isClosed(o.status)) continue;
                if (delayedCancellation(o, now)) o.vendorDelayed = true;
                if (o.vendorDelayed) notice(d, o, `delay-${o.estimatedReadyAt}`, `${s.vendor.name} reported a delay. Review alternatives or eligible cancellation.`, now);
                if (o.status !== 'ready') continue;
                o.readyAt ??= stamp(now); // Legacy ready orders receive a fresh grace period on upgrade.
                o.collectionDueAt ??= stamp(Math.max(Date.parse(s.slots.find(w => w.id === o.slotId)!.endAt), Date.parse(o.readyAt)) + (o.policy?.holdMinutes ?? 15) * minute);
                notice(d, o, `ready-${o.readyAt}`, `${s.vendor.name}: your order is ready. Collect by ${new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' }).format(new Date(o.collectionDueAt))}.`, now);
                if (now >= Date.parse(o.collectionDueAt) - 5 * minute) notice(d, o, `due-${o.collectionDueAt}`, `${s.vendor.name}: collection grace period is ending. Contact the kitchen if you cannot collect.`, now);
                if (now >= Date.parse(o.collectionDueAt)) { o.overdueAt ??= stamp(now); notice(d, o, 'overdue', `${s.vendor.name}: pickup is overdue. The kitchen must confirm any uncollected closure; no automatic penalty.`, now); }
            }
        };
        const preview = structuredClone(snapshot); all(preview);
        if (JSON.stringify(preview) !== JSON.stringify(snapshot)) await this.db.transaction(d => { all(d); });
    }
    async closeUncollected(a: Actor, input: unknown): Promise<void> {
        requireThat(a.role === 'vendor' && a.vendorId, 'FORBIDDEN', 'Kitchen access required.', 403);
        const b = object(input); const id = text(b.orderId, 'Order ID'); const reason = text(b.reason, 'Closure note', 3, 240);
        await this.db.transaction(d => {
            const o = owned(d, a, a.vendorId!, id);
            requireThat(o.status === 'ready' && o.collectionDueAt && this.clock() >= Date.parse(o.collectionDueAt), 'NOT_OVERDUE', 'Only overdue, ready orders can be closed as uncollected.', 409);
            const checkout = Object.values(d.checkouts).find(c => c.id === o.checkoutId);
            const siblingDelayed = checkout?.orders.some(r => d.vendors[r.vendorId]?.orders.find(x => x.id === r.orderId)?.vendorDelayed);
            const vendorWasLate = o.vendorDelayed || delayedCancellation(o, this.clock());
            o.status = 'uncollected'; o.closedReason = reason; o.noShowRecorded = !vendorWasLate && !siblingDelayed;
            o.pickupCode = ''; o.qrToken = ''; o.version++; o.updatedAt = stamp(this.clock());
            // Do not restore ingredients, already-used kitchen workload, or historical pickup capacity.
            for (const p of d.vendors[o.vendorId]!.proposals) if (p.orderId === o.id && ['approved', 'pending_vendor'].includes(p.status)) p.status = 'stale';
            notice(d, o, 'uncollected', `Kitchen marked this order uncollected: ${reason}. No charge was collected online and no automatic penalty was applied. Contact the kitchen to dispute.`, this.clock());
            log(d, a, o, 'order.uncollected', `${reason} No food restocked; no automatic penalty.`, this.clock());
        });
    }
    async correctNoShow(a: Actor, input: unknown): Promise<void> {
        requireThat(a.role === 'vendor' && a.vendorId, 'FORBIDDEN', 'Kitchen access required.', 403); const b = object(input);
        await this.db.transaction(d => { const o = owned(d, a, a.vendorId!, text(b.orderId, 'Order ID')); const note = text(b.reason, 'Correction note', 3, 240); requireThat(o.status === 'uncollected', 'INVALID_STATUS', 'Only an uncollected record can be corrected.'); o.noShowRecorded = false; log(d, a, o, 'no_show.corrected', note, this.clock()); });
    }
    async earlierOptions(a: Actor, vendorId: string, orderId: string) {
        student(a); const d = this.db.read(); const o = owned(d, a, vendorId, orderId);
        if (o.status !== 'confirmed') return { slots: [], message: 'Preparation has started or the order has closed. Ask the kitchen about a delay; other students will not be displaced.' };
        const s = d.vendors[vendorId]!;
        if (o.lines.some(l => { const i = s.items.find(i => i.id === l.itemId); return !i || i.prepUnits !== l.prepUnits || foodRevision(i.foodInfo) !== foodRevision(l.foodInfo); })) return { slots: [], message: 'Menu information changed since this order. Keep the original pickup or review a replacement with the kitchen.' };
        const previous = s.slots.find(w => w.id === o.slotId)!;
        for (const l of o.lines) s.items.find(i => i.id === l.itemId)!.stock += l.quantity;
        previous.reservedUnits -= o.lines.reduce((n, l) => n + l.prepUnits * l.quantity, 0); previous.reservedHandovers--;
        const q = await new MealService(new DraftStore(d.vendors), this.clock).quote(a, { vendorId, items: o.lines.map(l => ({ itemId: l.itemId, quantity: l.quantity })), plan: o.plan });
        const slots = q.slots.filter(w => w.id !== o.slotId && w.endAt < o.estimatedReadyAt).filter(w => {
            const old = o.slotId; o.slotId = w.id; try { itinerary(d, o); return true; } catch { return false; } finally { o.slotId = old; }
        });
        return { slots, message: slots.length ? 'Earlier unreserved capacity exists. No other student is moved. Rechecked when you confirm.' : 'No earlier slot fits the kitchen and your other pickups. Keep your order, request an alternative, or use eligible cancellation.' };
    }
    async moveEarlier(a: Actor, input: unknown): Promise<void> {
        student(a); const b = object(input); const vendorId = text(b.vendorId, 'Kitchen ID'); const id = text(b.orderId, 'Order ID'); const slotId = text(b.slotId, 'Pickup slot', 1, 100);
        await this.db.transaction(async d => {
            const o = owned(d, a, vendorId, id); requireThat(o.status === 'confirmed', 'ALREADY_PREPARING', 'The kitchen already started this order.', 409);
            const s = d.vendors[vendorId]!;
            requireThat(o.lines.every(l => { const i = s.items.find(i => i.id === l.itemId); return i && i.prepUnits === l.prepUnits && foodRevision(i.foodInfo) === foodRevision(l.foodInfo); }), 'MENU_CHANGED', 'Menu information changed. Your original order stays unchanged; request a freshly reviewed alternative.', 409);
            const previous = s.slots.find(w => w.id === o.slotId)!;
            for (const l of o.lines) s.items.find(i => i.id === l.itemId)!.stock += l.quantity;
            previous.reservedUnits -= o.lines.reduce((n, l) => n + l.prepUnits * l.quantity, 0); previous.reservedHandovers--;
            const q = await new MealService(new DraftStore(d.vendors), this.clock).quote(a, { vendorId, items: o.lines.map(l => ({ itemId: l.itemId, quantity: l.quantity })), plan: o.plan });
            const next = q.slots.find(w => w.id === slotId && w.id !== o.slotId && w.endAt < o.estimatedReadyAt);
            requireThat(next && q.totalSen === o.totalSen, 'UNAVAILABLE', 'That earlier slot or price changed. Your original order is unchanged.', 409);
            const p = profile(d, a); for (const l of o.lines) requireThat(foodCheck(s.items.find(i => i.id === l.itemId)!.foodInfo, p.preferences, this.clock()).suitable, 'DIETARY_CONFLICT', 'Current dietary preferences do not match this meal.', 409);
            for (const l of o.lines) s.items.find(i => i.id === l.itemId)!.stock -= l.quantity;
            const slot = s.slots.find(w => w.id === next.id)!; slot.reservedUnits += o.lines.reduce((n, l) => n + l.prepUnits * l.quantity, 0); slot.reservedHandovers++;
            o.slotId = slot.id; o.estimatedReadyAt = slot.endAt; o.promisedPickupEndAt = slot.endAt; if (!('nextClassAt' in o.plan)) o.latestPickupAt = slot.endAt;
            o.cancelBeforeAt = stamp(Date.parse(slot.startAt) - (o.policy?.cancellationMinutes ?? 0) * minute);
            o.qrToken = ''; o.pickupCode = randomBytes(5).toString('hex').toUpperCase(); o.version++; o.updatedAt = stamp(this.clock());
            itinerary(d, o); for (const p of s.proposals) if (p.orderId === o.id && ['approved', 'pending_vendor'].includes(p.status)) p.status = 'stale';
            log(d, a, o, 'order.earlier', 'Student selected genuinely available capacity; no other order moved.', this.clock());
        });
    }
    async photo(a: Actor, itemId: string, input: unknown): Promise<void> {
        requireThat(a.role === 'vendor' && a.vendorId, 'FORBIDDEN', 'Kitchen access required.', 403); const b = object(input);
        requireThat(this.db.read().vendors[a.vendorId]?.items.some(i => i.id === itemId), 'NOT_FOUND', 'Menu item not found.', 404);
        if (b.remove === true) { await this.db.transaction(d => { const i = d.vendors[a.vendorId!]!.items.find(i => i.id === itemId)!; delete i.photoPath; delete i.photoCredit; }); return; }
        requireThat(b.permission === true, 'PHOTO_PERMISSION', 'Confirm you own or have permission to use this photograph.');
        const credit = text(b.credit, 'Photo source / credit', 3, 240); const encoded = text(b.data, 'Photo data', 1, 2800000);
        requireThat(/^[A-Za-z0-9+/]+={0,2}$/.test(encoded), 'INVALID_PHOTO', 'Use a JPEG, PNG or WebP image.'); const bytes = Buffer.from(encoded, 'base64');
        requireThat(bytes.length <= 2 * 1024 * 1024 && bytes.length >= 24, 'PHOTO_SIZE', 'Use a photo smaller than 2 MB.');
        let ext = '';
        if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext = 'png';
        else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ext = 'jpg';
        else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') ext = 'webp';
        requireThat(ext, 'INVALID_PHOTO', 'Only raster JPEG, PNG and WebP photos are accepted. SVG and HTML are not allowed.');
        const filename = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
        await mkdir(path.join(this.db.directory, 'media'), { recursive: true }); await writeFile(path.join(this.db.directory, 'media', filename), bytes, { mode: 0o600 });
        await this.db.transaction(d => { const i: MenuItem = d.vendors[a.vendorId!]!.items.find(i => i.id === itemId)!; i.photoPath = `/media/${filename}`; i.photoCredit = credit; });
    }
}
