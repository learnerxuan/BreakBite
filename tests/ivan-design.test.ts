import assert from 'node:assert/strict';
import test from 'node:test';
import { seedVendor } from '../src/server/seed.js';
import { initialState } from '../src/web/state.js';
import { explore } from '../src/web/views/student.js';

function fixture() {
    const state = initialState();
    const kitchens = ['asian-cuisine', 'bobanika', 'chinese-kitchen'].map(id => seedVendor(id));
    state.vendors = kitchens.map(k => k.vendor);
    state.items = kitchens.flatMap(k => k.items);
    return state;
}
test('kitchen-name search matches the redesigned search prompt and excludes closed or retired kitchens', () => {
    const state = fixture();
    state.vendors[1]!.open = false; state.vendors[2]!.archived = true;
    state.search = 'ASIAN CUISINE';
    const html = explore(state);
    assert.equal(html.match(/<article class="bb-meal">/g)?.length, 5);
    const kitchenFilter = html.match(/<select id="kitchen-filter">([\s\S]*?)<\/select>/)![1]!;
    assert.match(kitchenFilter, /asian-cuisine/);
    assert.doesNotMatch(kitchenFilter, /bobanika|chinese-kitchen/);
});
test('the dense meal design retains current safety, stock, pickup and mobile-basket behaviour without restoring removed labels', () => {
    const state = fixture();
    state.actor = { id: 'design-student', name: 'Design Student', role: 'student' };
    state.items[0]!.stock = 0;
    const html = explore(state);
    assert.doesNotMatch(html, /Sample menu|available now|not verified campus stalls/);
    assert.match(html, /15 menu items shown/);
    assert.match(html, /Currently unavailable/);
    assert.match(html, /Ingredients &amp;|Ingredients & dietary details/);
    assert.match(html, /Contains:/);
    assert.match(html, /Pickup estimate unavailable/);
    assert.match(html, /Estimated food waiting time saved/);
    assert.match(html, /How is this estimated/);
    assert.match(html, /id="mobile-basket-button"/);
    assert.match(html, /id="mobile-break-button"/);
    assert.match(html, /id="fit-toggle"/);
});
test('the optional preparation comparison labels 12-plus honestly and is not a pickup-availability claim', () => {
    const state = fixture(); state.items = state.items.slice(0, 3);
    state.items[0]!.prepMinutes = 1; state.items[1]!.prepMinutes = 12; state.items[2]!.prepMinutes = 20;
    const html = explore(state);
    assert.match(html, /<details id="prep-rail"/);
    assert.match(html, /data-max-prep="all"[^>]*aria-label="Any preparation time · 3 menu items"/);
    assert.match(html, /<strong>12\+<\/strong>/);
    assert.match(html, /Pickup estimates also include the kitchen’s current orders/);
    state.maxPrepMinutes = 11;
    assert.equal(html.match(/<article class="bb-meal">/g)?.length, 3);
    assert.equal(explore(state).match(/<article class="bb-meal">/g)?.length, 1);
});
