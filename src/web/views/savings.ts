import type { ViewState } from '../state.js';
import { icon } from '../ui.js';

export function savingsPanel(s: ViewState): string {
    if (s.actor?.role !== 'student') return '';
    const { minutes, checkouts } = s.savings;
    return `<section class="bb-impact" aria-label="Your estimated time saved">
        <div class="bb-impact-number">${icon('clock')}<strong data-savings-total>~${minutes}<span>min</span></strong><span>Your estimated time saved</span></div>
        <div class="bb-impact-story"><p class="bb-kicker">MORE OF YOUR BREAK, BACK TO YOU</p><h2>Estimated food waiting time saved</h2>
        <p>${checkouts ? `Across ${checkouts} collected checkout${checkouts === 1 ? '' : 's'}. Order ahead and let the kitchen prepare while you get on with your day.` : 'Your next collected order starts your total. Browsing or placing an order does not add saved minutes.'}</p>
        <details><summary>How is this estimated?</summary><p>We use the menu preparation estimate saved with your order, subtract time the meal was marked ready after your booked pickup start, and cap the result at how far ahead you ordered. Whole minutes are rounded down.</p>
        <p>Only collected orders count. For each multi-kitchen checkout, we take the largest kitchen estimate because kitchens may prepare in parallel. Queue time, walking and payment are excluded. This is an estimate, not measured time saved. Older orders without a saved baseline are excluded.</p></details></div>
    </section>`;
}
