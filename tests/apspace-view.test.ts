import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClassEvent } from '../src/shared/features.js';
import { initialState } from '../src/web/state.js';
import { apspaceConnectionSection, savedBreaksSection, savedTimetableBreaks } from '../src/web/views/apspace.js';

const now = Date.parse('2026-11-16T04:00:00Z');
const date = '2026-11-16';
const events: ClassEvent[] = [
    { id: 'early', uid: 'early', title: '<svg onload=alert(1)>', location: 'Room A', startAt: '2026-11-16T02:00:00Z', endAt: '2026-11-16T03:00:00Z', source: 'apspace' },
    { id: 'late', uid: 'late', title: 'Later class', location: 'Room B', startAt: '2026-11-16T06:00:00Z', endAt: '2026-11-16T08:00:00Z', source: 'apspace' },
];
function connected() {
    const s = initialState();
    s.actor = { id: 'student', name: 'Student', role: 'student' };
    s.config = { mode: 'local', firebaseApiKey: '', enterpriseConfigured: false, demoIdentities: [], apspaceConfigured: true };
    s.serverClock = { time: now, sampledAt: performance.now() };
    s.profile.classes = events;
    s.profile.apspace = {
        intake: 'TEST', group: 'G1', revision: 'reviewed', sourceRevision: 'snapshot', firstDate: date, lastDate: date,
        coveredDates: [date], lastCheckedAt: new Date(now).toISOString(), lastSuccessfulAt: new Date(now).toISOString(), status: 'current',
    };
    return s;
}

test('the basket and planner suggest a saved gap without selecting a file or date', () => {
    const s = connected();
    assert.deepEqual(savedTimetableBreaks(s, now), [{ startAt: '2026-11-16T04:00:00.000Z', endAt: '2026-11-16T06:00:00.000Z' }]);
    assert.match(savedBreaksSection(s, true), /Use this break/);
    assert.match(savedBreaksSection(s, false), /Fit a meal/);
});

test('a manually saved class still offers time before the first commitment', () => {
    const s = connected();
    delete s.profile.apspace;
    s.profile.classes = [{ ...events[1]!, source: 'manual' }];
    assert.deepEqual(savedTimetableBreaks(s, now), [{ startAt: '2026-11-16T04:00:00.000Z', endAt: events[1]!.startAt }]);
});

test('unavailable, out-of-coverage, or changed dates cannot be used as free time', () => {
    const s = connected();
    const connection = s.profile.apspace!;
    connection.status = 'unavailable';
    assert.deepEqual(savedTimetableBreaks(s, now), []);
    connection.status = 'current';
    connection.coveredDates = [];
    assert.deepEqual(savedTimetableBreaks(s, now), []);
    connection.coveredDates = [date];
    connection.status = 'review';
    s.profile.apspacePreview = {
        ...connection, id: 'pending', kind: 'update', checkedAt: connection.lastCheckedAt, expiresAt: '2026-11-16T04:15:00Z',
        events, selectedIds: ['late'], affectedDates: [date],
    };
    assert.deepEqual(savedTimetableBreaks(s, now), []);
    const html = apspaceConnectionSection(s);
    assert.match(html, /name="consent" required/);
    assert.match(html, /&lt;svg onload=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<svg onload/);
    assert.match(html, /value="early"\s*>/);
    assert.match(html, /value="late" checked/);
    s.profile.apspacePreview.affectedDates = ['2026-11-17'];
    assert.equal(savedTimetableBreaks(s, now).length, 1);
});
