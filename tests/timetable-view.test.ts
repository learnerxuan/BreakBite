import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimetableEvent } from '../src/shared/model.js';
import { initialState } from '../src/web/state.js';
import { basket } from '../src/web/views/student.js';
import { timetableSection } from '../src/web/views/timetable.js';

const events: TimetableEvent[] = [
    { id: 'one', summary: '<script>alert(1)</script>', location: '<img src=x>', startAt: '2026-11-16T02:00:00.000Z', endAt: '2026-11-16T04:00:00.000Z' },
    { id: 'two', summary: 'Alternative class', location: '', startAt: '2026-11-16T02:30:00.000Z', endAt: '2026-11-16T04:00:00.000Z' },
    { id: 'three', summary: 'Afternoon class', location: '', startAt: '2026-11-16T08:00:00.000Z', endAt: '2026-11-16T09:00:00.000Z' },
];
const now = Date.parse('2026-11-16T01:00:00.000Z');
function studentState() {
    const s = initialState();
    s.actor = { id: 'student-test', name: 'Test student', role: 'student' };
    return s;
}
test('the import panel is optional and its actions are outside the planner form', () => {
    const s = studentState();
    assert.doesNotMatch(basket(s), /Import APSpace timetable/);
    s.fitBreak = true;
    const html = basket(s);
    assert.match(html, /Import APSpace timetable[\s\S]*<\/section>\s*<form id="plan-form"/);
    assert.match(html, /Available from \(MYT\)/);
    assert.match(html, /Next commitment \(MYT\)/);
    assert.match(html, /Food budget \(RM\)/);
    assert.doesNotMatch(html, /Afternoon class/);
});

test('preview escapes class data and requires both included classes and consent', () => {
    const s = studentState();
    s.timetable.preview = {
        actorId: s.actor!.id, fileName: '<img src=file>.ics', importedAt: new Date(now).toISOString(),
        events, warnings: ['<script>warning</script>'], selected: new Set(events.map(e => e.id)), consent: false,
    };
    const render = () => timetableSection(s, now);
    const confirmDisabled = /id="apspace-confirm"[^>]+disabled/;
    assert.match(render(), confirmDisabled);
    assert.doesNotMatch(render(), /<script>|<img/);
    assert.match(render(), /&lt;img src=file&gt;\.ics/);
    assert.match(render(), /Alternative class/);
    assert.equal(render().match(/Overlapping class/g)?.length, 2);
    s.timetable.preview.consent = true;
    assert.doesNotMatch(render(), confirmDisabled);
    s.timetable.preview.selected.clear();
    assert.match(render(), confirmDisabled);
});

test('the approved date shows future gaps, but applying requires a commitment within 24 hours', () => {
    const s = studentState();
    s.timetable.accepted = { actorId: s.actor!.id, fileName: 'test.ics', importedAt: new Date(now).toISOString(), events };
    s.timetable.date = '2026-11-16';
    const disabled = /data-action="apspace-use"[^>]+disabled/;
    assert.match(timetableSection(s, now - 86400000), disabled);
    assert.match(timetableSection(s, now - 86400000), /Free between selected classes/);
    assert.doesNotMatch(timetableSection(s, now), disabled);
    s.uncertain = true;
    assert.match(timetableSection(s, now), disabled);
});
