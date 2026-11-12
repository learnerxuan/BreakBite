import assert from 'node:assert/strict';
import test from 'node:test';
import { seedVendor, VENDOR_IDS } from '../src/server/seed.js';
import { initialState } from '../src/web/state.js';
import { explore } from '../src/web/views/student.js';

function fixture() { const s=initialState(); const kitchens=VENDOR_IDS.map(id=>seedVendor(id)); s.vendors=kitchens.map(k=>k.vendor); s.items=kitchens.flatMap(k=>k.items); return s; }
const rows=(html:string)=>(html.match(/<article class="bb-meal">/g)??[]).length;
test('pickup-area photos use current kitchen locations and never the old eight-meal count',()=>{
    const html=explore(fixture());
    for(const file of ['asian-cuisine','nelson','subway'])assert.match(html,new RegExp(`/images/cafeterias/${file}\\.jpg`));
    assert.match(html,/Cafeteria/);assert.match(html,/Atrium/);assert.match(html,/Above Centre Point/);
    assert.match(html,/6 kitchens open/);assert.equal(rows(html),45);
    assert.match(html,/id="allergy-filter-toggle"/);assert.match(html,/Choose allergens to avoid/);
});
test('pickup-area, kitchen, category and preparation filters intersect without changing the basket',()=>{
    const s=fixture();s.cart=[{vendorId:'asian-cuisine',itemId:'nasi-lemak',quantity:1}];
    Object.assign(s,{areaFilter:'Atrium (Level 3)'});assert.equal(rows(explore(s)),5);
    s.category='Drinks';assert.equal(rows(explore(s)),1);
    s.category='All';Object.assign(s,{maxPrepMinutes:3});assert.equal(rows(explore(s)),4);
    s.vendorFilter='asian-cuisine';assert.equal(rows(explore(s)),0);
    assert.deepEqual(s.cart,[{vendorId:'asian-cuisine',itemId:'nasi-lemak',quantity:1}]);
});
test('browse diet filters fail closed on unreviewed data, and spicy uses declarations',()=>{
    const s=fixture();const saved=structuredClone(s.profile.preferences);
    Object.assign(s,{menuDiet:'vegetarian'});assert.equal(rows(explore(s)),0);
    const item=s.items.find(i=>i.id==='vegetable-fried-rice')!;item.foodInfo!.reviewedBy='Kitchen operator';
    assert.equal(rows(explore(s)),1);
    Object.assign(s,{menuDiet:'all',spicyOnly:true});assert.ok(rows(explore(s))>0);
    assert.ok(rows(explore(s))<45);assert.deepEqual(s.profile.preferences,saved);
});
test('closed and retired kitchens do not contribute selectable pickup areas',()=>{
    const s=fixture();s.vendors.find(v=>v.id==='nelson')!.open=false;
    s.vendors.find(v=>v.id==='subway')!.archived=true;
    s.vendors.find(v=>v.id==='bobanika')!.open=false;
    const html=explore(s);
    assert.doesNotMatch(html,/data-area="Atrium|data-area="Above Centre Point/);
    assert.equal(rows(html),30);
});
