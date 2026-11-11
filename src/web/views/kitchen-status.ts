import type { BookingLoad } from '../../shared/features.js';
import { time, type MenuItem } from '../../shared/model.js';
import type { ViewState } from '../state.js';
import { planningNow } from '../state.js';
import { esc } from '../ui.js';

export function loadIsFresh(s: ViewState, load: BookingLoad | undefined): boolean {
    return !!load && !s.offline && Math.abs(planningNow(s)-Date.parse(load.updatedAt)) <= 20000;
}
export function kitchenStatus(s: ViewState, vendorId: string): string {
    const load=s.loads.find(l=>l.vendorId===vendorId);
    if(!loadIsFresh(s,load))return '<span class="bb-kitchen-state stale">Status updating</span>';
    const label=!load!.open?'Closed':load!.delayed?'Delayed':'Open';
    return `<span class="bb-kitchen-state ${!load!.open?'closed':load!.delayed?'delayed':'open'}">${label}</span>`;
}
export function kitchenActivity(load: BookingLoad): string {
    return load.activity?`${load.activity.preparing} preparing · ${load.activity.scheduled} scheduled · ${load.activity.ready} ready`:'Order counts updating';
}
export function mealPickup(s: ViewState, item: MenuItem): string {
    const load=s.loads.find(l=>l.vendorId===item.vendorId);
    if(!loadIsFresh(s,load))return '<p class="bb-meal-pickup">Pickup estimate unavailable — reconnect or refresh.</p>';
    if(!load!.open)return '<p class="bb-meal-pickup">Kitchen closed</p>';
    if(!item.enabled || item.stock<1)return '';
    const estimate=load!.itemEstimates?.find(e=>e.itemId===item.id);
    const activity=load!.activity?` · ${load!.activity.preparing} preparing`:'';
    if(!estimate)return `<p class="bb-meal-pickup">${kitchenStatus(s,item.vendorId)}${activity}<strong>No pickup available right now</strong></p>`;
    const from=time(estimate.startAt),to=time(estimate.endAt);
    return `<div class="bb-meal-pickup">${kitchenStatus(s,item.vendorId)}${activity}<strong>Estimated pickup ${esc(from===to?to:`${from}–${to}`)}</strong><small>For 1 portion · MYT · confirmed at checkout</small></div>`;
}
