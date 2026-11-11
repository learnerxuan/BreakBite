import type { TimetableEvent } from '../../shared/model.js';
import { time } from '../../shared/model.js';
import { findTimetableBreaks, malaysiaDate, overlappingClasses, TIMETABLE_DAY } from '../../shared/timetable.js';
import { planningNow, type ViewState } from '../state.js';
import { esc } from '../ui.js';

const dayFormat = new Intl.DateTimeFormat('en-MY', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const dateLabel = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

export function timetableDates(events: readonly TimetableEvent[]): { first: string; last: string } {
    const first = events.reduce((earliest, event) => event.startAt < earliest ? event.startAt : earliest, events[0]!.startAt);
    const last = events.reduce((latest, event) => event.endAt > latest ? event.endAt : latest, events[0]!.endAt);
    return { first: malaysiaDate(first), last: malaysiaDate(new Date(Date.parse(last) - 1).toISOString()) };
}

export function timetableSection(s: ViewState, now = planningNow(s)): string {
    const state = s.timetable;
    const heading = '<h3 id="apspace-heading">Import APSpace timetable</h3>';
    if (s.actor?.role !== 'student') {
        return `<section class="bb-timetable" aria-labelledby="apspace-heading">${heading}
            <button type="button" class="bb-text-button" data-action="login">Sign in to import your timetable</button></section>`;
    }
    const preview = state.preview?.actorId === s.actor.id ? state.preview : null;
    const accepted = state.accepted?.actorId === s.actor.id ? state.accepted : null;
    const locked = s.busy || s.uncertain ? 'disabled' : '';
    const focus = accepted ? 'Replace timetable (.ics file)' : 'Choose timetable (.ics file)';
    return `<section class="bb-timetable" aria-labelledby="apspace-heading">${heading}
        <p class="bb-small">In APSpace Timetable, select your intake, week and group when available. Press the calendar icon and choose the downloaded .ics file below.</p>
        <p class="bb-small">The file stays in this tab. Refreshing or signing out clears it. Export again when classes change.</p>
        <label for="apspace-file">${focus}<input id="apspace-file" type="file" accept=".ics,text/calendar" ${locked}></label>
        <div role="status" aria-live="polite" class="bb-small">${esc(state.loading ? 'Reading timetable…' : state.status)}</div>
        ${state.error ? `<p class="bb-error" role="alert">${esc(state.error)}</p>` : ''}
        ${state.loading || preview ? `<button type="button" id="apspace-cancel" class="bb-text-button" data-action="apspace-cancel" ${locked}>Cancel import</button>` : ''}
        ${preview ? previewSection(preview, locked) : accepted ? acceptedSection(accepted, state.date, now, locked) : ''}
    </section>`;
}

function previewSection(preview: NonNullable<ViewState['timetable']['preview']>, locked: string): string {
    const overlaps = overlappingClasses(preview.events);
    let date = '';
    const rows = preview.events.map((event, i) => {
        const start = malaysiaDate(event.startAt);
        const end = malaysiaDate(event.endAt);
        const group = start === date ? '' : `<h5>${dateLabel(start)}</h5>`;
        date = start;
        return `${group}<label class="bb-check bb-timetable-class"><input type="checkbox" id="apspace-event-${i}"
            data-apspace-event="${i}" ${preview.selected.has(event.id) ? 'checked' : ''} ${locked}>
            <span><strong>${esc(event.summary)}</strong>
            <span>${time(event.startAt)}–${end === start ? '' : dateLabel(end) + ' '}${time(event.endAt)} MYT</span>
            ${event.location ? `<span>${esc(event.location)}</span>` : ''}
            ${overlaps.has(event.id) ? '<span class="bb-small">Overlapping class</span>' : ''}</span></label>`;
    }).join('');
    return `<div class="bb-timetable-preview"><h4 tabindex="-1" id="apspace-preview">Review your timetable</h4>
        <p class="bb-small">${esc(preview.fileName)} · ${preview.events.length} entries · ${preview.selected.size} included</p>
        ${preview.warnings.map(w => `<p class="bb-warning">${esc(w)}</p>`).join('')}
        <div class="bb-timetable-classes">${rows}</div>
        <p class="bb-small">APSpace can show classes during breaks or revision weeks. Untick any class that does not apply to you.</p>
        <label class="bb-check"><input type="checkbox" id="apspace-consent" required ${preview.consent ? 'checked' : ''} ${locked}>
            <span>I checked that the selected classes apply to me on these dates.</span></label>
        <button type="button" id="apspace-confirm" class="bb-button secondary" data-action="apspace-confirm"
            ${locked || (!preview.consent || !preview.selected.size ? 'disabled' : '')}>Use selected classes</button></div>`;
}

function acceptedSection(accepted: NonNullable<ViewState['timetable']['accepted']>, date: string, now: number, locked: string): string {
    const { first, last } = timetableDates(accepted.events);
    const gaps = findTimetableBreaks(accepted.events, date, now);
    return `<div class="bb-timetable-approved"><h4>Your timetable</h4>
        <p class="bb-small">${esc(accepted.fileName)} · ${accepted.events.length} confirmed classes</p>
        <p class="bb-small">${dateLabel(first)}${first === last ? '' : ` to ${dateLabel(last)}`}<br>
            Imported ${dateLabel(malaysiaDate(accepted.importedAt))}, ${time(accepted.importedAt)} MYT</p>
        <button type="button" class="bb-text-button" data-action="apspace-remove" ${locked}>Remove timetable</button>
        <label for="apspace-date">Break date (MYT)<input id="apspace-date" type="date" min="${first}" max="${last}" value="${esc(date)}" ${locked}></label>
        ${gaps.length ? gaps.map((gap, i) => {
            const later = Date.parse(gap.endAt) > now + TIMETABLE_DAY;
            return `<div class="bb-timetable-gap">
                <div><strong>${time(gap.startAt)}–${time(gap.endAt)} MYT</strong>
                <span class="bb-small">Free between selected classes</span>
                ${later ? '<span class="bb-small">Available to apply within 24 hours of the next class.</span>' : ''}</div>
                <button type="button" id="apspace-gap-${i}" class="bb-button secondary" data-action="apspace-use"
                    data-end="${gap.endAt}" ${locked || (later ? 'disabled' : '')}>Use this break</button></div>`;
        }).join('') : '<p class="bb-small">No upcoming gap between classes on this date. You can enter a break manually.</p>'}
        <p class="bb-small">Choose pickup times to check what food fits this break.</p></div>`;
}
