import assert from 'node:assert/strict';
import test from 'node:test';
import { findTimetableBreaks, parseApspaceCalendar } from '../src/shared/timetable.js';

const event = (start = '20261116T023000Z', end = '20261116T043000Z', extra = 'SUMMARY:TEST-MODULE') =>
    ['BEGIN:VEVENT', `DTSTART:${start}`, `DTEND:${end}`, extra, 'END:VEVENT'].join('\r\n');
const calendar = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');

test('reads the APSpace shape, folded lines and text escapes without changing UTC instants', () => {
    const input = calendar(event(undefined, undefined,
        String.raw`summary:TEST\,MODULE\;A` + '\r\n\t' + String.raw`\\next\nline` + '\r\nLOCATION;ALTREP="https://example.com/a;b":Room A'))
        .replace('DTSTART:', 'dtstart;value="date-time":').replaceAll('\r\n', '\n');
    const { events } = parseApspaceCalendar('\uFEFF' + input);
    assert.equal(events[0]!.summary, 'TEST,MODULE;A\\next\nline');
    assert.equal(events[0]!.location, 'Room A');
    assert.equal(events[0]!.startAt, '2026-11-16T02:30:00.000Z');
    assert.equal(events[0]!.endAt, '2026-11-16T04:30:00.000Z');
    assert.equal(parseApspaceCalendar(calendar(event('20280229T000000Z', '20280229T000001Z'))).events.length, 1);
});

test('rejects incomplete calendars, unsupported semantics and invalid times atomically', () => {
    for (const extra of ['RRULE:FREQ=DAILY', 'RDATE:20261116T023000Z', 'EXDATE:20261116T023000Z',
        'RECURRENCE-ID:20261116T023000Z', 'STATUS:CANCELLED', 'TRANSP:TRANSPARENT', 'DTSTART:20261116T023000Z', 'DURATION:PT2H']) {
        assert.throws(() => parseApspaceCalendar(calendar(event(), event(undefined, undefined, extra))), /./, extra);
    }
    for (const date of ['20260230T023000Z', '20261116T243000Z', '20261116T023000', '20261116', '20261116T023060Z']) {
        assert.throws(() => parseApspaceCalendar(calendar(event(date))), /./, date);
    }
    for (const text of [calendar(), calendar(event()).replace('DTSTART:', 'DTSTART;TZID=Asia/Kuala_Lumpur:'),
        calendar(event()).replace('DTSTART:', 'DTSTART;VALUE=DATE:'),
        calendar(event()).replace('VERSION:2.0', 'VERSION:2.0\r\nMETHOD:CANCEL'),
        calendar(event()).replace(/DTEND:[^\r]+\r\n/, ''), calendar(event()).replace('END:VEVENT', ''),
        calendar(event()).repeat(2), calendar(event('20261116T043001Z'))]) {
        assert.throws(() => parseApspaceCalendar(text));
    }
});

test('exact duplicates collapse, conflicting UIDs fail and overlapping classes remain', () => {
    const first = event(undefined, undefined, 'SUMMARY:<script>test</script>\r\nUID:first');
    const second = first.replace('UID:first', 'UID:second');
    const overlap = event('20261116T030000Z', '20261116T040000Z');
    const { events, warnings } = parseApspaceCalendar(calendar(first, second, overlap));
    assert.equal(events.length, 2);
    assert.match(warnings.join(' '), /duplicate.*overlap/i);
    assert.equal(events[0]!.summary, '<script>test</script>');
    assert.equal(events[0]!.id, parseApspaceCalendar(calendar(second)).events[0]!.id);
    assert.throws(() => parseApspaceCalendar(calendar(first, first.replace('test', 'changed'))), /UID/);
    const alarm = 'BEGIN:VALARM\r\nDTSTART:alarm\r\nSUMMARY:alarm\r\nEND:VALARM';
    assert.equal(parseApspaceCalendar(calendar(first.replace('END:VEVENT', alarm + '\r\nEND:VEVENT'))).events[0]!.id, events[0]!.id);
});

test('enforces byte, unfolded line, character and event limits at the boundary', () => {
    const withLines = (lines: string) => calendar(event()).replace('VERSION:2.0', 'VERSION:2.0\r\n' + lines);
    const longLine = 'X:' + 'é'.repeat(4095);
    assert.doesNotThrow(() => parseApspaceCalendar(withLines(longLine)));
    assert.throws(() => parseApspaceCalendar(withLines(longLine + '\r\n x')), /line/i);
    for (const [name, limit] of [['SUMMARY', 200], ['LOCATION', 300]] as const) {
        const text = `${name}:${'x'.repeat(limit)}`;
        assert.doesNotThrow(() => parseApspaceCalendar(calendar(event(undefined, undefined, text))));
        assert.throws(() => parseApspaceCalendar(calendar(event(undefined, undefined, text + 'x'))), /long/i);
    }
    assert.doesNotThrow(() => parseApspaceCalendar(calendar(...Array<string>(500).fill(event()))));
    assert.throws(() => parseApspaceCalendar(calendar(...Array<string>(501).fill(event()))), /500/);
    const padding = Array<string>(31).fill(longLine).join('\r\n');
    const base = withLines(padding + '\r\nX:');
    const exact = withLines(padding + '\r\nX:' + 'a'.repeat(256 * 1024 - Buffer.byteLength(base)));
    assert.doesNotThrow(() => parseApspaceCalendar(exact));
    assert.throws(() => parseApspaceCalendar(exact + '\n'), /256/);
});

test('merges touching and overlapping classes, clamps to now, and omits outer gaps', () => {
    const later = event('20261116T083000Z', '20261116T093000Z');
    const { events } = parseApspaceCalendar(calendar(event(), event('20261116T033000Z', '20261116T040000Z'),
        event('20261116T020000Z', '20261116T023000Z'), event(), later));
    const endAt = '2026-11-16T08:30:00.000Z';
    assert.deepEqual(findTimetableBreaks(events, '2026-11-16', 0), [{ startAt: '2026-11-16T04:30:00.000Z', endAt }]);
    const now = '2026-11-16T05:00:00.000Z';
    assert.deepEqual(findTimetableBreaks(events, '2026-11-16', Date.parse(now)), [{ startAt: now, endAt }]);
    assert.deepEqual(findTimetableBreaks(events, '2026-11-16', Date.parse(endAt)), []);
    assert.deepEqual(findTimetableBreaks(events, '2026-11-17', 0), []);
    assert.deepEqual(findTimetableBreaks(events.slice(0, 1), '2026-11-16', 0), []);
    assert.throws(() => findTimetableBreaks(events, '2026-02-30', 0), /date/i);
});

test('clips an overnight class at Malaysia calendar boundaries', () => {
    const { events } = parseApspaceCalendar(calendar(event(),
        event('20261115T153000Z', '20261115T163000Z')));
    assert.deepEqual(findTimetableBreaks(events, '2026-11-15', 0), []);
    assert.deepEqual(findTimetableBreaks(events, '2026-11-16', 0), [{
        startAt: '2026-11-15T16:30:00.000Z', endAt: '2026-11-16T02:30:00.000Z',
    }]);
});
