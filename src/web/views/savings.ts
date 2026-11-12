import type { ViewState } from '../state.js';
import { icon } from '../ui.js';

export function savingsPanel(s: ViewState): string {
    if (s.actor?.role !== 'student') return '';
    const { minutes, checkouts } = s.savings;
    return `<section class="bb-impact bb-impact-refined" aria-label="Your estimated time saved">
        <div class="bb-impact-number"><span class="bb-impact-estimate">${icon('clock')} Your time back</span><strong data-savings-total class="${minutes>=1000?'bb-impact-long-total':''}">~${minutes}<span>min</span></strong><span class="bb-impact-number-note">Estimated prep wait avoided</span></div>
        <div class="bb-impact-story"><p class="bb-impact-eyebrow">Your break, back to you</p><h2>Estimated food waiting time saved</h2>
        <p>${checkouts ? 'Order ahead and let the kitchen prepare while you get on with your day.' : 'Your next collected order starts your total. Browsing or placing an order does not add saved minutes.'}</p>
        <div class="bb-impact-meta"><span>${icon('check')} ${checkouts} collected checkout${checkouts===1?'':'s'}</span><small>Counted after collection</small></div>
        <details id="savings-explanation"><summary id="savings-explanation-toggle">How is this estimated?</summary><p>We use the menu preparation estimate saved with your order, subtract time the meal was marked ready after your booked pickup start, and cap the result at how far ahead you ordered. Whole minutes are rounded down.</p>
        <p>Only collected orders count. For each multi-kitchen checkout, we take the largest kitchen estimate because kitchens may prepare in parallel. Queue time, walking and payment are excluded. This is an estimate, not measured time saved. Older orders without a saved baseline are excluded.</p></details></div>
        <div class="bb-impact-journey" aria-hidden="true"><p>The order-ahead difference</p><div><span>${icon('bag')}</span><strong>Order ahead<small>Choose your meal</small></strong></div><div><span>${icon('store')}</span><strong>Kitchen prepares<small>Get on with your day</small></strong></div><div><span>${icon('check')}</span><strong>Pick up & enjoy<small>More of your break</small></strong></div></div>
    </section>`;
}
