import type { BreakPlan } from '../shared/model.js';
import { APSPACE_MAX_BYTES, findTimetableBreaks, malaysiaDate, parseApspaceCalendar, TIMETABLE_DAY } from '../shared/timetable.js';
import { defaultBreakPlan, emptyTimetable, planningNow, type ViewState } from './state.js';
import { fromLocal } from './ui.js';
import { timetableDates } from './views/timetable.js';

const durationFields = ['walkToMinutes', 'returnMinutes', 'eatMinutes', 'bufferMinutes'] as const;
const preferenceFields = ['budget', ...durationFields] as const;

function preferences(form: HTMLFormElement): Omit<BreakPlan, 'breakStartAt' | 'nextClassAt'> {
    for (const name of preferenceFields) {
        const input = form.elements.namedItem(name) as HTMLInputElement;
        if (!input.validity.valid) {
            // Walking and buffer fields can be inside a closed disclosure.
            const details = input.closest('details');
            if (details) details.open = true;
            input.reportValidity();
            throw new Error('Check your budget and time preferences.');
        }
    }
    const values = new FormData(form);
    return {
        walkToMinutes: Number(values.get('walkToMinutes')), returnMinutes: Number(values.get('returnMinutes')),
        eatMinutes: Number(values.get('eatMinutes')), bufferMinutes: Number(values.get('bufferMinutes')),
        budgetSen: Math.round(Number(values.get('budget')) * 100),
    };
}

export function timetableActions(s: ViewState, render: () => void, invalidate: () => void, notify: (message: string, error?: boolean) => void) {
    let generation = 0;
    const focus = (id: string) => document.getElementById(id)?.focus();
    const owned = (value: { actorId: string } | null) => value?.actorId === s.actor?.id && s.actor?.role === 'student';
    const locked = () => s.busy || s.uncertain || !s.fitBreak || s.actor?.role !== 'student';

    function cancelPreview(): void {
        generation++;
        s.timetable.loading = false;
        s.timetable.preview = null;
        s.timetable.error = '';
        s.timetable.status = '';
    }

    function clearApplied(): void {
        if (!s.timetable.applied) return;
        const { breakStartAt, nextClassAt } = defaultBreakPlan(planningNow(s));
        s.plan = { ...s.plan, breakStartAt, nextClassAt };
        delete s.planDraft.breakStartAt;
        delete s.planDraft.nextClassAt;
        s.timetable.applied = null;
        s.fitBreak = false;
    }

    async function readFile(file: File): Promise<void> {
        if (locked()) return;
        cancelPreview();
        const request = generation;
        const actorId = s.actor!.id;
        const current = () => request === generation && actorId === s.actor?.id && !locked() && s.view === 'explore';
        s.timetable.loading = true;
        render();
        focus('apspace-cancel');
        try {
            if (!/\.ics$/i.test(file.name)) throw new Error('Choose the .ics file downloaded from APSpace.');
            if (file.size > APSPACE_MAX_BYTES) throw new Error('Choose an .ics file of 256 KiB or less.');
            const bytes = await file.arrayBuffer().catch(() => { throw new Error('Could not read the .ics file. Choose it again.'); });
            if (!current()) return;
            let text: string;
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
            catch { throw new Error('The .ics file needs UTF-8 text. Export it again from APSpace.'); }
            const parsed = parseApspaceCalendar(text);
            s.timetable.preview = {
                ...parsed, actorId, fileName: file.name, importedAt: new Date(planningNow(s)).toISOString(),
                selected: new Set(parsed.events.map(e => e.id)), consent: false,
            };
            s.timetable.status = 'Timetable ready to review.';
        } catch (error) {
            if (!current()) return;
            s.timetable.error = error instanceof Error ? error.message : 'Could not import this timetable.';
        }
        if (!current()) return;
        s.timetable.loading = false;
        render();
        focus(s.timetable.preview ? 'apspace-preview' : 'apspace-file');
    }

    function selectBreak(endAt: string | undefined): void {
        const { accepted, date } = s.timetable;
        if (!accepted || !owned(accepted)) return;
        const now = planningNow(s);
        const gap = findTimetableBreaks(accepted.events, date, now).find(candidate => candidate.endAt === endAt);
        if (!gap || Date.parse(gap.endAt) > now + TIMETABLE_DAY) {
            s.timetable.error = 'Choose an upcoming break with a next commitment within 24 hours.';
            render();
            return;
        }
        const form = document.querySelector<HTMLFormElement>('#plan-form')!;
        let prefs: ReturnType<typeof preferences>;
        try { prefs = preferences(form); }
        catch (error) { notify((error as Error).message, true); return; }
        s.plan = { ...prefs, breakStartAt: gap.startAt, nextClassAt: gap.endAt };
        s.planDraft = {};
        s.manualPlan = false;
        s.timetable.applied = gap;
        s.timetable.error = '';
        s.timetable.status = 'Break applied. Review your time preferences and choose pickup times.';
        invalidate();
        render();
        focus('plan-start');
    }

    return {
        click(target: HTMLElement): boolean {
            const action = target.dataset.action;
            if (!action?.startsWith('apspace-')) return false;
            if (locked()) return true;
            const { accepted, preview } = s.timetable;
            if (action === 'apspace-use') {
                selectBreak(target.dataset.end);
                return true;
            }
            if (action === 'apspace-cancel') {
                cancelPreview();
                s.timetable.status = 'Import cancelled.';
            } else if (action === 'apspace-confirm' && preview && owned(preview) && preview.consent && preview.selected.size) {
                const events = preview.events.filter(event => preview.selected.has(event.id));
                if (!events.length) return true;
                const { first, last } = timetableDates(events);
                const today = malaysiaDate(new Date(planningNow(s)).toISOString());
                cancelPreview();
                clearApplied();
                s.timetable.accepted = { actorId: preview.actorId, importedAt: preview.importedAt, fileName: preview.fileName, events };
                s.timetable.date = today >= first && today <= last ? today : first;
                s.timetable.status = s.fitBreak ? 'Selected classes confirmed.' : 'New timetable confirmed. Turn on Fit my break to choose a new gap.';
                invalidate();
            } else if (action === 'apspace-remove' && accepted && owned(accepted)) {
                cancelPreview();
                clearApplied();
                s.timetable = { ...emptyTimetable(), status: 'Timetable removed.' };
                invalidate();
            } else return true;
            const focusId = s.fitBreak ? action === 'apspace-confirm' ? 'apspace-date' : 'apspace-file' : 'fit-toggle';
            if (!s.fitBreak) notify(s.timetable.status);
            render();
            focus(focusId);
            return true;
        },
        change(input: HTMLInputElement | HTMLSelectElement): boolean {
            if (!input.id.startsWith('apspace-')) return false;
            if (locked()) return true;
            if (input.id === 'apspace-file' && input instanceof HTMLInputElement) {
                const file = input.files?.[0];
                if (file) void readFile(file);
                return true;
            }
            const { accepted, preview } = s.timetable;
            if (input.id === 'apspace-date' && accepted && owned(accepted) && input.value && input.validity.valid) {
                s.timetable.date = input.value;
                s.timetable.error = '';
            } else if (input instanceof HTMLInputElement && preview && owned(preview)) {
                if (input.id === 'apspace-consent') preview.consent = input.checked;
                else {
                    const event = preview.events[Number(input.dataset.apspaceEvent)];
                    if (!event) return true;
                    if (input.checked) preview.selected.add(event.id);
                    else preview.selected.delete(event.id);
                    preview.consent = false;
                }
            } else if (input.id !== 'apspace-date') return true;
            render();
            return true;
        },
        cancelPreview,
        reset(): void {
            generation++;
            s.timetable = emptyTimetable();
        },
        detach(): void {
            s.timetable.applied = null;
            s.timetable.status = '';
            s.manualPlan = false;
            s.planDraft = {};
        },
        applyForm(form: HTMLFormElement): void {
            const values = new FormData(form);
            const breakStartAt = fromLocal(values.get('breakStartAt'));
            const nextClassAt = fromLocal(values.get('nextClassAt'));
            const now = planningNow(s);
            if (Date.parse(nextClassAt) <= now || Date.parse(nextClassAt) > now + TIMETABLE_DAY) {
                throw new Error('Choose a next commitment within the next 24 hours.');
            }
            if (breakStartAt >= nextClassAt) throw new Error('Your break must start before the next commitment.');
            const updated = { ...preferences(form), breakStartAt, nextClassAt };
            if (Object.keys(updated).some(key => updated[key as keyof BreakPlan] !== s.plan[key as keyof BreakPlan])) {
                s.timetable.applied = null;
                s.manualPlan = true;
                s.timetable.status = '';
            }
            s.plan = updated;
            s.planDraft = {};
            invalidate();
        },
        validateBreak(): void {
            const { accepted, applied } = s.timetable;
            if (!s.fitBreak || !applied) return;
            const now = planningNow(s);
            const end = Date.parse(applied.endAt);
            if (!owned(accepted) || s.plan.breakStartAt !== applied.startAt || s.plan.nextClassAt !== applied.endAt || now >= end || end > now + TIMETABLE_DAY) {
                throw new Error('This imported break has expired or is no longer available. Choose a new gap or edit the times manually.');
            }
        },
    };
}
