import type { StudentProfile, Notice, BookingLoad } from '../shared/features.js';
import { emptyProfile } from '../shared/features.js';
import type { Actor, AppConfig, BasketQuote, BreakPlan, MenuItem, RecoveryOption, Snapshot, Vendor } from '../shared/model.js';
export interface CartLine { vendorId: string; itemId: string; quantity: number; }
export interface ViewState {
    profile: StudentProfile; notices: Notice[]; loads: BookingLoad[];
    detailItem: MenuItem | null; qr: { payload: string; code: string; kitchen: string } | null;
    scanner: boolean; scanResult: import('../shared/model.js').PublicOrder | null; scanPayload: string;
    basketMessages: string[]; earlier: Record<string, { slots: import('../shared/model.js').Slot[]; message: string }>;
    config: AppConfig | null; actor: Actor | null; snapshot: Snapshot | null;
    vendors: Vendor[]; items: MenuItem[]; cart: CartLine[];
    view: 'explore' | 'orders' | 'vendor' | 'saved' | 'planner' | 'inbox'; vendorTab: 'queue' | 'menu' | 'recovery' | 'settings';
    search: string; category: string; vendorFilter: string;
    fitBreak: boolean; plan: BreakPlan; quote: BasketQuote | null; chosen: Record<string, string>;
    transferMinutes: number; busy: boolean; offline: boolean;
    auth: 'login' | 'register' | null; authError: string; editing: MenuItem | 'new' | null;
    recovery: Record<string, { options: RecoveryOption[]; message: string }>;
    checkoutError: string; success: string; uncertain: boolean;
}
export function initialState(): ViewState {
    const now = Date.now(); const start = Math.ceil((now + 10 * 60000) / 300000) * 300000;
    let cart: CartLine[] = [];
    try { const c: unknown = JSON.parse(sessionStorage.getItem('breakbite-cart-v2') ?? '[]'); if (Array.isArray(c) && c.length <= 25) cart = c.filter(x => x && typeof x.itemId === 'string' && typeof x.vendorId === 'string' && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 5); } catch { /* Ignore an invalid client cache; the server validates everything. */ }
    return { profile: emptyProfile(), notices: [], loads: [], detailItem: null, qr: null, scanner: false, scanResult: null, scanPayload: "", basketMessages: [], earlier: {}, config: null, actor: null, snapshot: null, vendors: [], items: [], cart, view: 'explore', vendorTab: 'queue', search: '', category: 'All', vendorFilter: 'all', fitBreak: false,
        plan: { breakStartAt: new Date(start).toISOString(), nextClassAt: new Date(start + 60 * 60000).toISOString(), walkToMinutes: 3, returnMinutes: 5, eatMinutes: 12, bufferMinutes: 3, budgetSen: 50000 },
        quote: null, chosen: {}, transferMinutes: 2, busy: false, offline: false, auth: null, authError: '', editing: null, recovery: {}, checkoutError: '', success: '', uncertain: false };
}
export const cartKey = (vendorId: string, itemId: string): string => `${vendorId}:${itemId}`;
