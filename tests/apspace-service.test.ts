import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { normalizeApspaceTimetable, type ApspaceSnapshot } from '../src/server/apspace-timetable.js';
import { settings } from '../src/server/config.js';
import { MealService } from '../src/server/domain.js';
import { AppError } from '../src/server/errors.js';
import { createApp } from '../src/server/http.js';
import { LocalStore } from '../src/server/local-database.js';
import { testDatabase } from './support/test-database.js';
import { ProductService } from '../src/server/product.js';
import type { Actor } from '../src/shared/model.js';

const owner: Actor = { id: 'apspace-student', name: 'Student', role: 'student' };
const other: Actor = { id: 'other-student', name: 'Other student', role: 'student' };
const kitchen: Actor = { id: 'kitchen', name: 'Kitchen', role: 'vendor' };
const selection = { intake: 'APU-TEST', group: 'G1' };
const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;
const day = '2026-11-16';
const nextDay = '2026-11-17';

function row(title: string, time: string, end: string, date = day, group = 'G1') {
    return {
        INTAKE: selection.intake, GROUPING: group, CLASS_CODE: title, MODULE_NAME: title,
        ROOM: 'Lab', LOCATION: 'Campus', DATESTAMP_ISO: date, TIME_FROM_ISO: `${date}T${time}:00+08:00`, TIME_TO_ISO: `${date}T${end}:00+08:00`,
    };
}
const before = [row('Morning', '09:00', '10:00'), row('Afternoon', '14:00', '15:00'), row('Tomorrow', '09:00', '10:00', nextDay)];
async function fixture(t: test.TestContext) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'breakbite-apspace-'));
    const db = testDatabase(directory);
    await db.open();
    t.after(async () => { await db.close(); await rm(directory, { recursive: true, force: true }); });
    let now = Date.parse(`${day}T08:00:00+08:00`);
    let source = normalizeApspaceTimetable(before, new Date(now).toISOString());
    let retrieve = () => Promise.resolve(source);
    const product = new ProductService(db, () => now, { get: () => retrieve() });
    return {
        db, product, directory,
        advance(ms: number) { now += ms; },
        publish(rows: typeof before) { now += 60000; source = normalizeApspaceTimetable(rows, new Date(now).toISOString()); },
        readThrough(get: () => Promise<ApspaceSnapshot>) { retrieve = get; },
        snapshot() { return source; },
    };
}

test('APSpace confirmation requires a private live preview and explicit consent', async t => {
    const { product, advance } = await fixture(t);
    assert.deepEqual(await product.apspaceOptions(owner), [{ intake: selection.intake, groups: [selection.group] }]);
    await assert.rejects(product.apspaceOptions(kitchen), code('FORBIDDEN'));
    const preview = await product.previewApspace(owner, selection);
    const choice = { previewId: preview.id, ids: [preview.events[0]!.id], consent: true };
    assert.equal(product.profile(other).profile.apspacePreview, undefined);
    await assert.rejects(product.confirmApspace(other, choice), code('PREVIEW_EXPIRED'));
    await assert.rejects(product.confirmApspace(owner, { ...choice, consent: false }), code('CONSENT_REQUIRED'));
    await assert.rejects(product.confirmApspace(owner, { ...choice, ids: ['forged'] }), code('INVALID_CLASSES'));
    advance(15 * 60000);
    await assert.rejects(product.confirmApspace(owner, choice), code('PREVIEW_EXPIRED'));
    assert.deepEqual(product.profile(owner).profile.classes, []);
});

test('confirmed APSpace classes persist privately and coexist with file and manual classes', async t => {
    const { db, directory, product, snapshot } = await fixture(t);
    await product.manualClass(owner, { title: 'Manual', startAt: `${day}T11:00:00+08:00`, endAt: `${day}T12:00:00+08:00` });
    await db.transaction(d => {
        d.profiles![owner.id]!.classes.push({ id: 'file', uid: 'file', title: 'File', location: '', startAt: `${day}T05:00:00.000Z`, endAt: `${day}T06:00:00.000Z`, source: 'import' });
    });
    const preview = await product.previewApspace(owner, selection);
    await product.confirmApspace(owner, { previewId: preview.id, ids: preview.selectedIds, consent: true });
    await db.close();
    const reopened = testDatabase(directory);
    await reopened.open();
    try {
        const persisted = new ProductService(reopened, () => Date.parse(snapshot().checkedAt), { get: async () => snapshot() });
        assert.deepEqual(persisted.profile(owner).profile.apspace?.coveredDates, [day, nextDay]);
        assert.equal(persisted.profile(other).profile.classes.length, 0);
        assert.equal(persisted.profile(owner).profile.classes.length, 5);
        await persisted.disconnectApspace(owner);
        assert.deepEqual(persisted.profile(owner).profile.classes.map(event => event.source), ['manual', 'import']);
        assert.equal(persisted.profile(owner).profile.apspace, undefined);
    } finally { await reopened.close(); }
});

test('refresh stages a move and retains reviewed exclusions and old classes until consent', async t => {
    const { product, publish } = await fixture(t);
    const preview = await product.previewApspace(owner, selection);
    await product.confirmApspace(owner, { previewId: preview.id, ids: preview.events.filter(event => event.title !== 'Tomorrow').map(event => event.id), consent: true });
    publish([before[0]!, row('Afternoon', '15:00', '16:00'), before[2]!]);
    await product.refreshApspace();
    const { classes, apspace, apspacePreview } = product.profile(owner).profile;
    assert.equal(apspace?.status, 'review');
    assert.ok(apspacePreview);
    assert.deepEqual(apspacePreview.affectedDates, [day]);
    assert.deepEqual(classes.map(event => event.startAt), [`${day}T01:00:00.000Z`, `${day}T06:00:00.000Z`]);
    assert.equal(apspacePreview.selectedIds.length, 2);
    await product.confirmApspace(owner, { previewId: apspacePreview.id, ids: apspacePreview.selectedIds, consent: true });
    assert.deepEqual(product.profile(owner).profile.classes.map(event => event.startAt), [`${day}T01:00:00.000Z`, `${day}T07:00:00.000Z`]);
    assert.equal(product.profile(owner).profile.apspace?.status, 'current');
});

test('a midday connection preserves the morning class that bounds the current gap', async t => {
    const { product, advance, publish } = await fixture(t);
    advance(3 * 3600000);
    publish(before);
    const preview = await product.previewApspace(owner, selection);
    assert.deepEqual(preview.events.map(event => event.title), ['Morning', 'Afternoon', 'Tomorrow']);
    await product.confirmApspace(owner, { previewId: preview.id, ids: preview.selectedIds, consent: true });
    publish(before);
    await product.refreshApspace();
    assert.deepEqual(product.profile(owner).profile.classes.map(event => event.title), ['Morning', 'Afternoon', 'Tomorrow']);
    const replacement = await product.previewApspace(owner, selection);
    await product.discardApspacePreview(owner, { previewId: replacement.id });
    assert.equal(product.profile(owner).profile.apspacePreview, undefined);
    assert.equal(product.profile(owner).profile.apspace?.status, 'current');
    assert.equal(product.profile(owner).profile.classes.length, 3);
});

test('missing dates and provider failures preserve accepted classes without implying free time', async t => {
    const { product, publish, readThrough } = await fixture(t);
    const preview = await product.previewApspace(owner, selection);
    await product.confirmApspace(owner, { previewId: preview.id, ids: preview.selectedIds, consent: true });
    publish(before.slice(0, 2));
    await product.refreshApspace();
    const current = product.profile(owner).profile;
    assert.deepEqual(current.apspace?.coveredDates, [day]);
    assert.equal(current.apspacePreview, undefined);
    assert.equal(current.classes.length, 3);
    readThrough(async () => { throw new AppError(502, 'SOURCE_DOWN', 'Source unavailable.'); });
    await assert.rejects(product.refreshApspace(owner), code('SOURCE_DOWN'));
    const failed = product.profile(owner).profile;
    assert.equal(failed.apspace?.status, 'unavailable');
    assert.deepEqual(failed.classes, current.classes);
    assert.equal(failed.apspace?.lastSuccessfulAt, current.apspace?.lastSuccessfulAt);
});

test('a superseded preview cannot apply and a new review preserves the prior connection on failure', async t => {
    const { product, publish } = await fixture(t);
    const preview = await product.previewApspace(owner, selection);
    await product.confirmApspace(owner, { previewId: preview.id, ids: preview.selectedIds, consent: true });
    const oldProfile = product.profile(owner).profile;
    const stale = await product.previewApspace(owner, selection);
    publish([before[0]!, row('Afternoon', '15:00', '16:00')]);
    await assert.rejects(product.confirmApspace(owner, { previewId: stale.id, ids: stale.selectedIds, consent: true }), code('APSPACE_CHANGED'));
    assert.deepEqual(product.profile(owner).profile.classes, oldProfile.classes);
    assert.deepEqual(product.profile(owner).profile.apspace, oldProfile.apspace);
    await product.discardApspacePreview(owner, { previewId: stale.id });
    await product.refreshApspace();
    const update = product.profile(owner).profile.apspacePreview!;
    await product.confirmApspace(owner, { previewId: update.id, ids: [], consent: true });
    const confirmed = product.profile(owner).profile;
    assert.deepEqual(confirmed.apspace?.coveredDates, [day]);
    assert.deepEqual(confirmed.classes.map(event => event.title), ['Tomorrow']);
});

test('an expired pending change is regenerated from the same checked source', async t => {
    const { product, advance, publish } = await fixture(t);
    const preview = await product.previewApspace(owner, selection);
    await product.confirmApspace(owner, { previewId: preview.id, ids: preview.selectedIds, consent: true });
    publish([before[0]!, row('Afternoon', '15:00', '16:00'), before[2]!]);
    await product.refreshApspace();
    const expired = product.profile(owner).profile.apspacePreview!;
    advance(15 * 60000);
    await product.refreshApspace();
    const active = product.profile(owner).profile.apspacePreview!;
    assert.notEqual(active.id, expired.id);
    assert.deepEqual(active.affectedDates, expired.affectedDates);
    await assert.rejects(product.confirmApspace(owner, { previewId: expired.id, ids: expired.selectedIds, consent: true }), code('PREVIEW_EXPIRED'));
});

test('disconnect fences pending fetches and prevents reinstating the prior connection', async t => {
    const { product, publish, readThrough, snapshot } = await fixture(t);
    const preview = await product.previewApspace(owner, selection);
    await product.confirmApspace(owner, { previewId: preview.id, ids: preview.selectedIds, consent: true });
    publish([before[0]!, row('Afternoon', '15:00', '16:00')]);
    let resolve!: (source: ApspaceSnapshot) => void;
    const pending = new Promise<ApspaceSnapshot>(done => { resolve = done; });
    readThrough(() => pending);
    const refreshing = product.refreshApspace();
    const previewing = product.previewApspace(owner, selection);
    await product.disconnectApspace(owner);
    resolve(snapshot());
    await refreshing;
    await assert.rejects(previewing, code('APSPACE_CHANGED'));
    const profile = product.profile(owner).profile;
    assert.equal(profile.apspace, undefined);
    assert.equal(profile.apspacePreview, undefined);
    assert.deepEqual(profile.classes, []);
});

test('HTTP APSpace options require a session and writes require its CSRF token', async t => {
    const { db, directory, product } = await fixture(t);
    const config = settings({ DATA_DIR: directory });
    const app = createApp(config, new MealService(new LocalStore(db)), db, undefined, product);
    app.listen(0, '127.0.0.1');
    await once(app, 'listening');
    t.after(() => new Promise<void>(resolve => { app.closeAllConnections(); app.close(() => resolve()); }));
    const origin = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    config.allowedOrigins = [origin];
    const prefix = '/api/product/timetable/apspace';
    assert.equal((await fetch(origin + prefix + '/options')).status, 401);
    const registered = await fetch(origin + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test student', email: 'apspace@example.test', password: 'Fixture-password-123' }),
    });
    assert.equal(registered.status, 200);
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    const { csrfToken } = await registered.json() as { csrfToken: string };
    assert.equal((await fetch(origin + prefix + '/options', { headers: { Cookie: cookie } })).status, 200);
    const request = (csrf: string) => fetch(origin + prefix + '/preview', {
        method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
        body: JSON.stringify(selection),
    });
    assert.equal((await request('wrong')).status, 403);
    assert.equal((await request(csrfToken)).status, 200);
});
