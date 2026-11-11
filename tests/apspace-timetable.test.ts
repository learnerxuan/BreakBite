import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApspaceTimetableProvider, normalizeApspaceTimetable } from '../src/server/apspace-timetable.js';

const stamp = '2026-11-16T08:00:00.000Z';
const minute = 60_000;
const expectedUrl = 'https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable';

const row = {
    INTAKE: 'APU-TEST', GROUPING: 'G1', CLASS_CODE: 'TEST-1', MODULE_NAME: 'Example class',
    ROOM: 'B-01', LOCATION: 'Campus', DATESTAMP_ISO: '2026-11-17',
    TIME_FROM_ISO: '2026-11-17T00:15:00+08:00', TIME_TO_ISO: '2026-11-17T01:15:00+08:00',
    NAME: 'PRIVATE_NAME', LECTID: 'PRIVATE_ID', SAMACCOUNTNAME: 'PRIVATE_ACCOUNT',
};

function jsonResponse(data: unknown, headers?: Record<string, string>): Response {
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', ...headers } });
}

test('APSpace normalizes Malaysia dates and selects only the requested intake and group', () => {
    const otherDate = {
        ...row, DATESTAMP_ISO: '2026-11-19',
        TIME_FROM_ISO: '2026-11-19T10:00:00+08:00', TIME_TO_ISO: '2026-11-19T11:00:00+08:00',
    };
    const groupTwo = { ...row, GROUPING: 'G2', CLASS_CODE: 'TEST-2', MODULE_NAME: 'Different class' };
    const rows = [otherDate, row, groupTwo, row, { ...row, INTAKE: 'OTHER' }];
    const result = normalizeApspaceTimetable(rows, stamp);
    const selected = result.select('APU-TEST', 'G1');
    assert.deepEqual(result.options, [{ intake: 'APU-TEST', groups: ['G1', 'G2'] }, { intake: 'OTHER', groups: ['G1'] }]);
    assert.equal(selected.events.length, 2);
    assert.notEqual(selected.events[0]!.id, selected.events[1]!.id);
    assert.equal(selected.firstDate, '2026-11-17');
    assert.equal(selected.lastDate, '2026-11-19');
    assert.equal(selected.events[0]!.startAt, '2026-11-16T16:15:00.000Z');
    assert.equal(selected.events[0]!.endAt, '2026-11-16T17:15:00.000Z');
    assert.equal(selected.events[0]!.source, 'apspace');
    assert.equal(result.select('APU-TEST', 'G2').events[0]!.title, 'Different class');
    assert.doesNotMatch(JSON.stringify(selected), /PRIVATE_/);
    assert.throws(() => result.select('APU-TEST', 'G3'), { code: 'APSPACE_SELECTION' });
    assert.throws(() => result.select('UNKNOWN', 'G1'), { code: 'APSPACE_SELECTION' });
    assert.equal(result.revision, normalizeApspaceTimetable([...rows].reverse(), stamp).revision);
    const changedRows = rows.map(value => value === row ? { ...value, ROOM: 'C-01' } : value);
    assert.notEqual(result.revision, normalizeApspaceTimetable(changedRows, stamp).revision);
    assert.notEqual(result.select('APU-TEST', 'G1').events[0]!.id,
        normalizeApspaceTimetable([{ ...row, ROOM: 'C-01' }], stamp).select('APU-TEST', 'G1').events[0]!.id);
});

test('APSpace refuses malformed dates, unknown group semantics and missing or excessive rows', () => {
    const malformed = [
        undefined, [], {}, [null], Array(50_001).fill(row),
        [{ ...row, GROUPING: 'G1/G2' }], [{ ...row, DATESTAMP_ISO: '2026-11-16' }],
        [{ ...row, TIME_FROM_ISO: '2026-11-17T00:15:00' }],
        [{ ...row, TIME_FROM_ISO: '2026-02-30T00:15:00+08:00' }],
        [{ ...row, TIME_TO_ISO: row.TIME_FROM_ISO }], [{ ...row, MODULE_NAME: '' }],
    ];
    for (const value of malformed) assert.throws(() => normalizeApspaceTimetable(value, stamp), { code: 'APSPACE_SOURCE' });
    const hugeGroup = normalizeApspaceTimetable(Array.from({ length: 1001 }, (_, i) => ({ ...row, CLASS_CODE: `TEST-${i}` })), stamp);
    assert.throws(() => hugeGroup.select('APU-TEST', 'G1'), { code: 'APSPACE_SELECTION' });
});

test('APSpace coalesces requests, caches a snapshot and revalidates it with the ETag', async () => {
    let now = Date.parse(stamp);
    let calls = 0;
    let respond!: (response: Response) => void;
    const initial = new Promise<Response>(resolve => { respond = resolve; });
    const provider = new ApspaceTimetableProvider(async (url, options) => {
        calls++;
        assert.equal(url, expectedUrl);
        assert.equal(options?.redirect, 'error');
        assert.ok(options?.signal instanceof AbortSignal);
        const headers = new Headers(options.headers);
        if (calls === 1) {
            assert.equal(headers.get('if-none-match'), null);
            return initial;
        }
        assert.equal(headers.get('if-none-match'), '"source-revision"');
        return new Response(null, { status: 304 });
    }, () => now);

    const pending = Promise.all([provider.get(), provider.get(), provider.get(true)]);
    assert.equal(calls, 1);
    respond(jsonResponse([row], { etag: '"source-revision"', 'last-modified': 'Mon, 16 Nov 2026 06:00:00 GMT' }));
    const [snapshot, second, third] = await pending;
    assert.equal(second, snapshot);
    assert.equal(third, snapshot);
    assert.equal(snapshot.checkedAt, stamp);
    assert.equal(snapshot.publishedAt, '2026-11-16T06:00:00.000Z');

    now += minute / 2;
    assert.equal(await provider.get(true), snapshot);
    now += minute;
    assert.equal(await provider.get(), snapshot);
    assert.equal(calls, 1);
    const revalidated = await provider.get(true);
    assert.equal(revalidated.checkedAt, new Date(now).toISOString());
    assert.equal(revalidated.revision, snapshot.revision);
    assert.equal(revalidated.publishedAt, snapshot.publishedAt);
    assert.equal(calls, 2);
    now += 6 * 60 * minute;
    await provider.get();
    assert.equal(calls, 3);
});

test('APSpace backs off after a timeout or bad update and retains conditional validation state', async () => {
    let now = Date.parse(stamp);
    let calls = 0;
    const provider = new ApspaceTimetableProvider(async (_url, options) => {
        calls++;
        if (calls === 1) throw new DOMException('Timed out', 'TimeoutError');
        if (calls === 2) return jsonResponse([row], { 'last-modified': 'Mon, 16 Nov 2026 06:00:00 GMT' });
        assert.equal(new Headers(options?.headers).get('if-modified-since'), 'Mon, 16 Nov 2026 06:00:00 GMT');
        if (calls === 3) return new Response('truncated JSON', { headers: { 'content-type': 'application/json' } });
        return new Response(null, { status: 304 });
    }, () => now);

    await assert.rejects(provider.get(), { code: 'APSPACE_UNAVAILABLE' });
    await assert.rejects(provider.get(true), { code: 'APSPACE_UNAVAILABLE' });
    assert.equal(calls, 1);
    now += minute;
    const cached = await provider.get();
    now += minute;
    await assert.rejects(provider.get(true), { code: 'APSPACE_SOURCE' });
    await assert.rejects(provider.get(), { code: 'APSPACE_UNAVAILABLE' });
    assert.equal(calls, 3);
    now += minute;
    const revalidated = await provider.get(true);
    assert.equal(revalidated.revision, cached.revision);
    assert.equal(revalidated.checkedAt, new Date(now).toISOString());
});

test('APSpace rejects redirects, non-JSON responses, and both declared and decoded oversized bodies', async () => {
    const oversized = 24 * 1024 * 1024 + 1;
    const chunk = new Uint8Array(1024 * 1024);
    let chunks = 0;
    const responses = [
        { response: new Response(null, { status: 302, headers: { location: 'https://example.test' } }), code: 'APSPACE_UNAVAILABLE' },
        { response: new Response(null, { status: 304 }), code: 'APSPACE_UNAVAILABLE' },
        { response: new Response('<html/>'), code: 'APSPACE_SOURCE' },
        { response: new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }), code: 'APSPACE_SOURCE' },
        { response: jsonResponse([row], { 'content-length': String(oversized) }), code: 'APSPACE_SOURCE' },
        { response: new Response(new ReadableStream({ pull(controller) {
            if (chunks++ < 25) controller.enqueue(chunk);
            else controller.close();
        } }), { headers: { 'content-type': 'application/json' } }), code: 'APSPACE_SOURCE' },
    ];
    for (const { response, code } of responses) {
        const provider = new ApspaceTimetableProvider(async () => response);
        await assert.rejects(provider.get(), { code });
    }
    assert.ok(chunks >= 25);
});
