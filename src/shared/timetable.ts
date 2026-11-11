import type { TimetableBreak, TimetableEvent, TimetableImport } from './model.js';

export const APSPACE_MAX_BYTES = 256 * 1024;
export const TIMETABLE_DAY = 24 * 60 * 60 * 1000;
const malaysiaOffset = 8 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const unsupportedEventProperties = new Set(['RRULE', 'RDATE', 'EXDATE', 'EXRULE', 'RECURRENCE-ID', 'DURATION']);
const eventProperties = new Set(['UID', 'SUMMARY', 'LOCATION', 'DTSTART', 'DTEND', 'STATUS', 'TRANSP']);

function property(line: string): { name: string; params: string; value: string } {
    // A quoted parameter may contain a colon or semicolon.
    if (/[\u0000-\u0008\u000B-\u001F\u007F]/.test(line)) throw new Error('The calendar contains invalid text. Export a fresh .ics file.');
    const match = /^([A-Z\d-]+)((?:;[A-Z\d-]+=(?:"[^"]*"|[^":;])*)*):([^\r]*)$/i.exec(line);
    if (!match) throw new Error('The calendar has a malformed property. Export a fresh .ics file.');
    return { name: match[1]!.toUpperCase(), params: match[2]!, value: match[3]! };
}

function utcInstant(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second);
    if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
        date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) {
        throw new Error('The calendar contains an invalid date or time.');
    }
    return date.getTime();
}

function eventTime(value: string, params: string): string {
    const match = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/i.exec(value);
    if (!match || (params && !/^;VALUE=(?:DATE-TIME|"DATE-TIME")$/i.test(params))) {
        throw new Error('Classes need UTC start and end times. Export the APSpace .ics file directly or enter your break manually.');
    }
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const instant = utcInstant(year!, month!, day!, hour, minute, second);
    if (new Date(instant + malaysiaOffset).getUTCFullYear() > 9999) throw new Error('The Malaysia date is out of range.');
    return new Date(instant).toISOString();
}

function eventText(value: string, limit: number): string {
    const text = value.replace(/\\([nN,;\\])/g, (_, char: string) => char.toLowerCase() === 'n' ? '\n' : char);
    if ([...text].length > limit) throw new Error('A class summary or location is too long. Choose a smaller export or enter your break manually.');
    return text;
}

export function overlappingClasses(events: readonly TimetableEvent[]): Set<string> {
    const sorted = [...events].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const overlap = new Set<string>();
    let furthest: TimetableEvent | undefined;
    for (const event of sorted) {
        if (furthest && event.startAt < furthest.endAt) {
            overlap.add(furthest.id);
            overlap.add(event.id);
        }
        if (!furthest || event.endAt > furthest.endAt) furthest = event;
    }
    return overlap;
}

export function parseApspaceCalendar(text: string): TimetableImport {
    if (encoder.encode(text).length > APSPACE_MAX_BYTES) throw new Error('Choose an .ics file of 256 KiB or less.');
    const lines = text.replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    const components: string[] = [];
    const events = new Map<string, TimetableEvent>();
    const uids = new Map<string, string>();
    let version = false;
    let method = false;
    let closed = false;
    let count = 0;
    let fields = new Map<string, string>();

    for (const line of lines) {
        if (encoder.encode(line).length > 8192) throw new Error('A calendar line exceeds 8 KiB. Export a fresh .ics file.');
        const { name, params, value } = property(line);
        const component = components.at(-1);
        if (name === 'BEGIN' || name === 'END') {
            const type = value.toUpperCase();
            if (params || closed) throw new Error('Use one complete iCalendar file.');
            if (name === 'BEGIN') {
                if ((!component && type === 'VCALENDAR') || (component === 'VCALENDAR' && type === 'VEVENT') ||
                    (component === 'VEVENT' && type === 'VALARM')) {
                    components.push(type);
                    if (type === 'VEVENT') {
                        if (++count > 500) throw new Error('Import at most 500 classes at a time.');
                        fields = new Map();
                    }
                    continue;
                }
                throw new Error('The calendar contains an unsupported component. Use the APSpace .ics export.');
            }
            if (type !== component) throw new Error('The calendar is incomplete. Export a fresh .ics file.');
            components.pop();
            if (type === 'VCALENDAR') closed = true;
            if (type === 'VEVENT') {
                const startAt = fields.get('DTSTART');
                const endAt = fields.get('DTEND');
                if (!startAt || !endAt || endAt <= startAt) throw new Error('Every class needs a start time and a later end time.');
                const summary = fields.get('SUMMARY') || 'Class';
                const location = fields.get('LOCATION') ?? '';
                const id = JSON.stringify([summary, location, startAt, endAt]);
                const uid = fields.get('UID');
                if (uid) {
                    const previous = uids.get(uid);
                    if (previous && previous !== id) throw new Error('The calendar has conflicting classes with the same UID. Export it again.');
                    uids.set(uid, id);
                }
                events.set(id, { id, summary, location, startAt, endAt });
            }
            continue;
        }
        if (!component) throw new Error('Use one complete iCalendar file.');
        if (component === 'VCALENDAR' && name === 'VERSION') {
            if (version || params || value !== '2.0') throw new Error('Choose a version 2.0 .ics export.');
            version = true;
        }
        if (component === 'VCALENDAR' && name === 'METHOD') {
            if (method || params || value.toUpperCase() !== 'PUBLISH') throw new Error('Calendar updates and cancellations cannot be imported. Export the timetable again.');
            method = true;
        }
        if (component !== 'VEVENT') continue;
        if (unsupportedEventProperties.has(name)) {
            throw new Error('Recurring classes and duration-only events are unsupported here. Use a dated APSpace export or enter your break manually.');
        }
        if (!eventProperties.has(name)) continue;
        if (fields.has(name)) throw new Error(`A class has more than one ${name} property. Export the timetable again.`);
        if ((name === 'STATUS' && value.toUpperCase() === 'CANCELLED') ||
            (name === 'TRANSP' && value.toUpperCase() !== 'OPAQUE')) {
            throw new Error('Cancelled or non-busy classes cannot be imported. Export a current timetable.');
        }
        const parsed = name === 'DTSTART' || name === 'DTEND' ? eventTime(value, params)
            : name === 'SUMMARY' ? eventText(value, 200) : name === 'LOCATION' ? eventText(value, 300) : value;
        fields.set(name, parsed);
    }
    if (!closed || !version || !events.size) throw new Error('Choose a complete version 2.0 .ics file with at least one timed class.');
    const sorted = [...events.values()].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt));
    const warnings: string[] = [];
    if (count > sorted.length) warnings.push(`${count - sorted.length} duplicate entries were combined.`);
    const overlaps = overlappingClasses(sorted).size;
    if (overlaps) warnings.push(`${overlaps} entries overlap. Review which classes apply to you.`);
    return { events: sorted, warnings };
}

export function malaysiaDate(iso: string): string {
    return new Date(Date.parse(iso) + malaysiaOffset).toISOString().slice(0, 10);
}

export function findTimetableBreaks(events: readonly TimetableEvent[], date: string, now: number): TimetableBreak[] {
    const match = /^(\d{4})-(\d\d)-(\d\d)$/.exec(date);
    if (!match) throw new Error('Choose a valid Malaysia calendar date.');
    const start = utcInstant(+match[1]!, +match[2]!, +match[3]!) - malaysiaOffset;
    const end = start + TIMETABLE_DAY;
    const busy = events.map(e => ({ start: Math.max(start, Date.parse(e.startAt)), end: Math.min(end, Date.parse(e.endAt)) }))
        .filter(e => e.start < e.end).sort((a, b) => a.start - b.start);
    const gaps: TimetableBreak[] = [];
    let previousEnd: number | undefined;
    for (const interval of busy) {
        if (previousEnd !== undefined) {
            const gapStart = Math.max(previousEnd, now);
            if (gapStart < interval.start) gaps.push({ startAt: new Date(gapStart).toISOString(), endAt: new Date(interval.start).toISOString() });
        }
        previousEnd = Math.max(previousEnd ?? interval.end, interval.end);
    }
    return gaps;
}
