import { time, type TimetableBreak } from '../../shared/model.js';
import { findTimetableBreaks, malaysiaDate, overlappingClasses, TIMETABLE_DAY } from '../../shared/timetable.js';
import { planningNow, type ViewState } from '../state.js';
import { esc } from '../ui.js';

const timetableDate = new Intl.DateTimeFormat('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const displayDate = (date: string) => timetableDate.format(new Date(`${date}T00:00:00Z`));

export function apspaceIntake(setup: NonNullable<ViewState['apspaceSetup']>) {
    const code = setup.intake.trim().toUpperCase();
    return setup.options.find(option => option.intake.toUpperCase() === code);
}

export function apspaceGroupOptions(groups: string[], selected: string): string {
    const value = groups.length === 1 ? groups[0] : selected;
    return `<option value="">${groups.length ? 'Select your group' : 'Enter your intake code first'}</option>
        ${groups.map(group => `<option value="${esc(group)}" ${group === value ? 'selected' : ''}>${esc(group)}</option>`).join('')}`;
}

export function savedTimetableBreaks(s: ViewState, now = planningNow(s)): TimetableBreak[] {
    const { apspace, apspacePreview, classes } = s.profile;
    if (!apspace) {
        const gaps: TimetableBreak[] = [];
        let availableFrom = now;
        // A manually maintained or file-imported calendar keeps the planner's existing lead-in suggestion.
        for (const event of classes) {
            const start = Date.parse(event.startAt);
            if (start >= now + TIMETABLE_DAY) break;
            if (start - availableFrom >= 20 * 60000) {
                gaps.push({ startAt: new Date(availableFrom).toISOString(), endAt: event.startAt });
            }
            availableFrom = Math.max(availableFrom, Date.parse(event.endAt));
        }
        return gaps;
    }
    const dates = [now, now + TIMETABLE_DAY].map(at => malaysiaDate(new Date(at).toISOString()));
    const events = classes.map(event => ({ ...event, summary: event.title }));
    return dates.flatMap(date => {
        if (!s.config?.apspaceConfigured || apspace.status === 'unavailable' || !apspace.coveredDates.includes(date) ||
            (apspace.status === 'review' && (!apspacePreview || apspacePreview.affectedDates.includes(date)))) return [];
        return findTimetableBreaks(events, date, now).filter(gap => Date.parse(gap.endAt) <= now + TIMETABLE_DAY);
    });
}

export function savedBreaksSection(s: ViewState, inBasket: boolean): string {
    if (s.actor?.role !== 'student') return '';
    const { apspace, classes } = s.profile;
    if (inBasket && !s.config?.apspaceConfigured && !classes.length && !apspace) return '';
    const gaps = savedTimetableBreaks(s).slice(0, inBasket ? 1 : 5);
    return `<section class="bb-timetable bb-apspace" aria-label="Breaks from your timetable">
        <h3>Breaks from your timetable</h3>
        ${gaps.map(gap => `<div class="bb-timetable-gap"><div><strong>${time(gap.startAt)}–${time(gap.endAt)} MYT</strong>
            <span class="bb-small">${displayDate(malaysiaDate(gap.startAt))}</span></div>
            <button type="button" class="bb-button secondary" data-action="saved-break" data-end="${gap.endAt}" ${s.uncertain ? 'disabled' : ''}>${inBasket ? s.cart.length ? 'Check pickup times for this break' : 'Use this break' : 'Fit a meal'}</button></div>`).join('')}
        ${apspace?.status === 'review' && inBasket ? '<p class="bb-warning">Review changes in My planner before you use a break on a changed date.</p>' : ''}
        ${apspace?.status === 'unavailable' && inBasket ? '<p class="bb-warning">BreakBite cannot check your timetable. Enter your break times.</p>' : ''}
        ${!gaps.length && apspace?.status !== 'unavailable' ? '<p class="bb-small">There is no break to use in the next 24 hours. You can enter your break times.</p>' : ''}
        ${inBasket ? '<button type="button" class="bb-text-button" id="apspace-open-planner" data-view="planner">Open My planner</button>' : ''}
    </section>`;
}

function apspaceStatus(s: ViewState): string {
    const connection = s.profile.apspace;
    if (!connection) return '';
    const { intake, group, firstDate, lastDate, lastSuccessfulAt, publishedAt, status } = connection;
    const checked = `${displayDate(malaysiaDate(lastSuccessfulAt))} ${time(lastSuccessfulAt)} MYT`;
    return `<p class="bb-small">${esc(intake)} · ${esc(group)} · ${displayDate(firstDate)} to ${displayDate(lastDate)}<br>
        Last successful check ${checked}${publishedAt ? ` · Source date ${displayDate(malaysiaDate(publishedAt))}` : ''}</p>
        ${status === 'review' ? '<p class="bb-warning">Review the changes before you use a break on a changed date.</p>' : ''}
        ${status === 'unavailable' ? '<p class="bb-warning">BreakBite cannot check your timetable. BreakBite keeps the classes you saved.</p>' : ''}`;
}

export function apspaceConnectionSection(s: ViewState): string {
    const { apspace, apspacePreview: preview, classes } = s.profile;
    if (!s.config?.apspaceConfigured && !apspace && !preview) return '';
    const locked = s.busy || s.uncertain ? 'disabled' : '';
    const setup = s.apspaceSetup;
    const groups = setup ? apspaceIntake(setup)?.groups ?? [] : [];
    const draft = s.apspaceReview?.id === preview?.id ? s.apspaceReview : undefined;
    const selectedIds = new Set(draft?.selectedIds ?? preview?.selectedIds);
    const overlaps = preview && overlappingClasses(preview.events.map(event => ({ ...event, summary: event.title })));
    const expired = Boolean(preview && Date.parse(preview.expiresAt) <= planningNow(s));
    const candidateIds = new Set(preview?.events.map(event => event.id));
    const removed = preview?.kind === 'update' ? classes.filter(event => event.source === 'apspace' &&
        preview.affectedDates.includes(malaysiaDate(event.startAt)) && !candidateIds.has(event.id)) : [];
    const currentIds = new Set(classes.filter(event => event.source === 'apspace').map(event => event.id));
    return `<section class="bb-panel bb-timetable bb-apspace" aria-labelledby="apspace-connect-heading">
        <h2 id="apspace-connect-heading" tabindex="-1">APSpace timetable</h2>
        <p>Use your class times to find a break for pickup.</p>
        ${apspaceStatus(s)}
        <p id="apspace-feedback" tabindex="-1" role="${s.apspaceFeedback?.error ? 'alert' : 'status'}" class="${s.apspaceFeedback?.error ? 'bb-error' : ''}">${esc(s.apspaceFeedback?.text)}</p>
        ${s.config?.apspaceConfigured ? `<div class="bb-actions">
            ${setup || preview?.kind === 'connect' ? '' : `<button type="button" id="apspace-connect-open" class="bb-button ${apspace ? 'secondary' : 'primary'}" data-action="apspace-connect-open" ${locked}>${apspace ? 'Change intake or group' : 'Connect APSpace timetable'}</button>`}
            ${apspace ? `<button type="button" class="bb-text-button" data-action="apspace-connect-refresh" ${locked}>Refresh now</button>` : ''}
        </div>` : '<p class="bb-warning">This site cannot check APSpace. You can import a calendar file.</p>'}
        ${apspace ? `<button type="button" class="bb-text-button" data-action="apspace-connect-disconnect" ${locked}>Disconnect APSpace</button>` : ''}
        ${preview?.kind === 'connect' && expired ? `<button type="button" class="bb-text-button" data-action="apspace-connect-discard" data-id="${esc(preview.id)}" ${locked}>Cancel class review</button>` : ''}
        ${setup ? `<form id="apspace-connect-setup" class="bb-apspace-form">
            <label>Intake code<input id="apspace-connect-intake" name="intake" required maxlength="64" aria-describedby="apspace-intake-help apspace-intake-error"
                ${setup.invalid ? 'aria-invalid="true"' : ''}
                autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(setup.intake)}" ${locked}></label>
            <p id="apspace-intake-help">Enter the intake code from your APSpace timetable.</p>
            <p id="apspace-intake-error" class="bb-error" role="alert" ${setup.invalid ? '' : 'hidden'}>BreakBite cannot find this intake code. Check the code in APSpace.</p>
            <label>Group<select id="apspace-connect-group" name="group" aria-label="Group" required ${groups.length && !locked ? '' : 'disabled'}>
                ${apspaceGroupOptions(groups, setup.group)}
            </select></label>
            <div class="bb-actions"><button type="submit" class="bb-button primary" ${locked}>Review classes</button>
                <button type="button" class="bb-text-button" data-action="apspace-setup-cancel" ${locked}>Cancel setup</button></div>
        </form>` : ''}
        ${expired && s.config?.apspaceConfigured ? `<p class="bb-warning">This review expired. ${preview?.kind === 'connect' ? 'Cancel the class review. Then start again.' : 'Select Refresh now.'}</p>` : ''}
        ${preview && !expired && s.config?.apspaceConfigured ? `<form id="apspace-connect-confirm" class="bb-apspace-form" data-preview="${esc(preview.id)}">
            <h3 id="apspace-review-heading" tabindex="-1">Review classes</h3>
            <p><strong>${esc(preview.intake)} · ${esc(preview.group)}</strong><br>${displayDate(preview.firstDate)} to ${displayDate(preview.lastDate)} · Malaysia time</p>
            <p>Keep only the classes you attend.</p>
            ${preview.affectedDates.length ? `<p class="bb-warning">Check the classes on these dates. ${preview.affectedDates.map(displayDate).join(', ')}</p>` : ''}
            ${removed.length ? `<details><summary>Removed or rescheduled classes (${removed.length})</summary><ul>
                ${removed.map(event => `<li>${esc(event.title)} · ${displayDate(malaysiaDate(event.startAt))} ${time(event.startAt)} MYT</li>`).join('')}
            </ul></details>` : ''}
            <div class="bb-timetable-classes">${preview.events.map(event => `<label class="bb-check bb-timetable-class"><input type="checkbox" name="classId" value="${esc(event.id)}" ${selectedIds.has(event.id) ? 'checked' : ''} ${locked}>
                <span><strong>${esc(event.title)}</strong><span>${displayDate(malaysiaDate(event.startAt))} · ${time(event.startAt)}–${time(event.endAt)} MYT</span>
                ${event.location ? `<span>${esc(event.location)}</span>` : ''}
                ${overlaps?.has(event.id) ? '<span>Overlaps another class</span>' : ''}
                ${preview.kind === 'update' && !currentIds.has(event.id) && preview.selectedIds.includes(event.id) ? '<span>New or changed class</span>' : ''}</span>
            </label>`).join('')}</div>
            <label class="bb-check bb-apspace-consent"><input type="checkbox" name="consent" required ${draft?.consent ? 'checked' : ''} ${locked}>These are the classes I attend.</label>
            <div class="bb-actions">
                <button type="submit" class="bb-button primary" ${locked}>Save timetable</button>
                ${preview.kind === 'connect' ? `<button type="button" class="bb-text-button" data-action="apspace-connect-discard" data-id="${esc(preview.id)}" ${locked}>Cancel class review</button>` : ''}
            </div>
        </form>` : ''}
    </section>`;
}
