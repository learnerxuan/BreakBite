/** Bounded iCalendar importer. Unsupported recurrences/zones are rejected with warnings, never guessed. */
import { createHash } from 'node:crypto';
import type { ClassEvent } from '../shared/features.js';
import { requireThat } from './errors.js';
const DAY = 86400000;
type Property = { name: string; params: Record<string, string>; value: string };
type Event = Property[];
const unescapeText = (v: string) => v.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1');
const prop = (e: Event, name: string) => e.find(p => p.name === name);
const propText = (e: Event, name: string) => unescapeText(prop(e, name)?.value ?? '').slice(0, 120);
export function calendarTime(p: Property): number {
    const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)?(Z)?$/.exec(p.value);
    requireThat(m, 'ICS_DATE', 'Only timed events are imported; all-day or invalid dates are not classes.');
    const zone = (p.params.TZID ?? '').replace(/^"|"$/g, '');
    requireThat(!zone || ['Asia/Kuala_Lumpur', 'Asia/Singapore', 'UTC', 'Etc/UTC', 'GMT'].includes(zone), 'ICS_ZONE', `Unsupported timezone ${zone}. Export in UTC or Asia/Kuala_Lumpur.`);
    const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
    const d = new Date(wall);
    requireThat(d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]! && d.getUTCHours() === +m[4]! && d.getUTCMinutes() === +m[5]! && d.getUTCSeconds() === +(m[6] ?? 0), 'ICS_DATE', 'Invalid calendar date.');
    return wall - (m[7] || ['UTC', 'Etc/UTC', 'GMT'].includes(zone) ? 0 : 8 * 3600000);
}
function parameters(line: string): Property {
    // Split only outside quoted parameter values.
    let quote = false; let colon = -1;
    for (let i = 0; i < line.length; i++) { if (line[i] === '"') quote = !quote; else if (line[i] === ':' && !quote) { colon = i; break; } }
    requireThat(colon > 0, 'ICS_FORMAT', 'Malformed iCalendar property.');
    const parts = line.slice(0, colon).split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const name = parts.shift()!.toUpperCase(); const params: Record<string, string> = {};
    for (const part of parts) { const i = part.indexOf('='); if (i > 0) params[part.slice(0, i).toUpperCase()] = part.slice(i + 1); }
    return { name, params, value: line.slice(colon + 1) };
}
function timeList(e: Event, name: string): number[] {
    return e.filter(p => p.name === name).flatMap(p => p.value.split(',').map(value => calendarTime({ ...p, value })));
}
export function parseCalendar(text: string, now = Date.now()): { events: ClassEvent[]; warnings: string[]; horizonEnd: string } {
    requireThat(Buffer.byteLength(text, 'utf8') <= 256 * 1024, 'ICS_TOO_LARGE', 'Use an .ics file smaller than 256 KB.');
    requireThat(text.includes('BEGIN:VCALENDAR') && text.includes('END:VCALENDAR'), 'ICS_FORMAT', 'Select a valid .ics calendar file.');
    const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const raw: Event[] = []; let current: Event | null = null; let nested = 0;
    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') { requireThat(!current, 'ICS_FORMAT', 'Nested events are invalid.'); current = []; nested = 0; }
        else if (line === 'END:VEVENT') { if (current) raw.push(current); current = null; }
        else if (current && line.startsWith('BEGIN:')) nested++;
        else if (current && line.startsWith('END:')) nested--;
        else if (current && !nested && line) current.push(parameters(line));
    }
    requireThat(!current && raw.length <= 1000, 'ICS_LIMIT', 'The calendar is incomplete or contains too many events.');
    const warnings: string[] = ['Floating times are interpreted as Malaysia time (UTC+8). Import is a snapshot, not live APSpace sync.'];
    const startHorizon = now - DAY; const endHorizon = now + 90 * DAY;
    const events = new Map<string, ClassEvent>(); const originals = new Map<string, Event>(); const overrides = new Map<string, Event[]>();
    for (const e of raw) {
        const uid = prop(e, 'UID')?.value ?? createHash('sha256').update(JSON.stringify(e)).digest('hex');
        if (prop(e, 'RECURRENCE-ID')) { const group = overrides.get(uid) ?? []; group.push(e); overrides.set(uid, group); }
        else if (!originals.has(uid) || +(prop(e, 'SEQUENCE')?.value ?? 0) >= +(prop(originals.get(uid)!, 'SEQUENCE')?.value ?? 0)) originals.set(uid, e);
    }
    function add(e: Event, uid: string, time: number, duration: number, recurrenceTime = time): void {
        if (time + duration < startHorizon || time > endHorizon) return;
        requireThat(duration > 0 && duration <= DAY, 'ICS_DURATION', 'Classes must last between one second and 24 hours.');
        const id = createHash('sha256').update(`${uid}:${recurrenceTime}`).digest('hex').slice(0, 32);
        events.set(id, { id, uid: uid.slice(0, 240), title: propText(e, 'SUMMARY') || 'Class', location: propText(e, 'LOCATION'), startAt: new Date(time).toISOString(), endAt: new Date(time + duration).toISOString(), source: 'import' });
        requireThat(events.size <= 1000, 'ICS_LIMIT', 'More than 1,000 occurrences. Import a smaller calendar.');
    }
    for (const [uid, e] of originals) {
        const beforeSeries = new Set(events.keys());
        try {
            if (prop(e, 'STATUS')?.value === 'CANCELLED') continue;
            const start = prop(e, 'DTSTART'); requireThat(start, 'ICS_DATE', 'DTSTART is missing.');
            const first = calendarTime(start); const end = prop(e, 'DTEND'); const durationProperty = prop(e, 'DURATION');
            const durationMatch = durationProperty && /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(durationProperty.value);
            const duration = end ? calendarTime(end) - first : durationMatch ? (+durationMatch[1]! || 0) * 3600000 + (+durationMatch[2]! || 0) * 60000 + (+durationMatch[3]! || 0) * 1000 : 0;
            requireThat(duration > 0 && duration <= DAY, 'ICS_DURATION', 'Missing or unsupported class duration.');
            const excluded = new Set(timeList(e, 'EXDATE')); const changed = new Map<number, Event>();
            for (const o of overrides.get(uid) ?? []) { const recurrence = prop(o, 'RECURRENCE-ID')!; requireThat(!recurrence.params.RANGE, 'ICS_RANGE', 'RANGE recurrence overrides are unsupported.'); changed.set(calendarTime(recurrence), o); }
            const recurrence = prop(e, 'RRULE'); const times = new Set<number>([first, ...timeList(e, 'RDATE')]);
            if (recurrence) {
                const r: Record<string, string> = Object.fromEntries(recurrence.value.split(';').map(p => p.split('=')));
                requireThat(Object.keys(r).every(k => ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'WKST'].includes(k)) && ['DAILY', 'WEEKLY'].includes(r.FREQ ?? ''), 'ICS_RULE', 'Only DAILY/WEEKLY recurrence with interval, count, until and weekdays is supported. This series was skipped.');
                const interval = +(r.INTERVAL ?? 1); const count = +(r.COUNT ?? 100000);
                requireThat(Number.isInteger(interval) && interval >= 1 && interval <= 52 && Number.isInteger(count) && count >= 1 && count <= 100000 && !(r.COUNT && r.UNTIL), 'ICS_RULE', 'Invalid recurrence limits.');
                const names = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                const byDays = r.BYDAY?.split(','); requireThat(!byDays || byDays.every(d => names.includes(d)), 'ICS_RULE', 'Ordinal weekdays are unsupported.');
                requireThat(!r.WKST || names.includes(r.WKST), 'ICS_RULE', 'Invalid week start.');
                const until = r.UNTIL ? calendarTime({ ...start, value: r.UNTIL }) : endHorizon;
                const offset = start.value.endsWith('Z') || ['UTC', 'Etc/UTC', 'GMT'].includes((start.params.TZID ?? '').replace(/^"|"$/g, '')) ? 0 : 8 * 3600000;
                const firstDay = new Date(first + offset).getUTCDay(); const weekStart = names.indexOf(r.WKST ?? 'MO');
                const anchorDay = (firstDay - weekStart + 7) % 7;
                let seen = 0; const limitDays = Math.min(36600, Math.ceil((Math.min(until, endHorizon) - first) / DAY));
                requireThat(first >= now - 100 * 366 * DAY, 'ICS_RANGE', 'Recurrence starts more than 100 years ago.');
                for (let d = 0; d <= limitDays; d++) {
                    const t = first + d * DAY; const day = (firstDay + d) % 7;
                    const valid = r.FREQ === 'DAILY' ? d % interval === 0 && (!byDays || byDays.includes(names[day]!)) : Math.floor((d + anchorDay) / 7) % interval === 0 && (byDays ? byDays.includes(names[day]!) : day === firstDay);
                    if (!valid) continue; if (++seen > count || t > until) break; times.add(t);
                }
            }
            for (const t of times) {
                const o = changed.get(t);
                if (o) {
                    if (prop(o, 'STATUS')?.value === 'CANCELLED') continue;
                    const a = calendarTime(prop(o, 'DTSTART')!); const b = prop(o, 'DTEND'); add(o, uid, a, b ? calendarTime(b) - a : duration, t);
                } else if (!excluded.has(t)) add(e, uid, t, duration);
            }
        } catch (error) {
            // Reject a malformed series as a unit, not a misleading partial import.
            for (const id of events.keys()) if (!beforeSeries.has(id)) events.delete(id);
            warnings.push(`${propText(e, 'SUMMARY') || 'Event'}: ${error instanceof Error ? error.message : 'Could not import.'}`);
        }
    }
    for (const uid of overrides.keys()) if (!originals.has(uid)) warnings.push('A recurrence override has no base event; that orphan update was skipped.');
    if (events.size === 0) warnings.push('No timed classes were found in the next 90 days. Nothing will be saved unless you confirm.');
    return { events: [...events.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)), warnings: warnings.slice(0, 50), horizonEnd: new Date(endHorizon).toISOString() };
}
