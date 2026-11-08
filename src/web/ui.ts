import type { MenuItem } from '../shared/model.js';
export const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icons: Record<string, string> = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    leaf: '<path d="M20 4C7 2 2 9 6 16c6 6 15 0 14-12Z"/><path d="M4 20 15 9"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    store: '<path d="M4 10v11h16V10M3 4h18l1 6a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2l1-6Z"/><path d="M9 21v-6h6v6"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v1"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-7-4h11"/>',
};
export const icon = (name: string, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.grid}</svg>`;
export const art = (kind: MenuItem['art'], large = false) => `<div class="food-art art-${kind} ${large ? 'large' : ''}" aria-hidden="true"><div class="food-shadow"></div><div class="plate"><div class="grain"></div><div class="topping one"></div><div class="topping two"></div><div class="topping three"></div><div class="greens"></div><div class="garnish"></div></div><div class="art-dot dot-one"></div><div class="art-dot dot-two"></div></div>`;

export const localValue = (iso: string): string => new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 16);
export const fromLocal = (value: FormDataEntryValue | null): string => { const date = new Date(`${String(value)}+08:00`); if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid date and time.'); return date.toISOString(); };
export const short = (id: string): string => id.slice(0, 8).toUpperCase();
export const statusLabel = (s: string): string => ({confirmed:'Confirmed',preparing:'Preparing',ready:'Ready to collect',collected:'Collected',cancelled:'Cancelled',uncollected:'Uncollected'}[s] ?? s.replaceAll('_',' '));
