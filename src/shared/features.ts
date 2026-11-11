import type { ApspaceConnection, ApspaceSource } from './model.js';

/** Product contracts shared by the browser and the authoritative server. */
export const ALLERGENS = ['peanuts', 'tree_nuts', 'milk', 'eggs', 'fish', 'shellfish', 'soy', 'sesame', 'wheat', 'gluten'] as const;
export type Allergen = typeof ALLERGENS[number];
export const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'halal', 'gluten_free'] as const;
export type Diet = typeof DIETS[number];
export const SPICE = ['not_specified', 'non_spicy', 'mild', 'medium', 'spicy', 'extra_spicy'] as const;
export type Spice = typeof SPICE[number];
export interface Evidence { reference: string; expiresOn: string; }
export interface FoodInfo {
    ingredients: string; allergens: Allergen[]; mayContain: Allergen[];
    allergensKnown: boolean; diets: Diet[]; spice: Spice;
    halalEvidence?: Evidence; glutenFreeEvidence?: Evidence;
    reviewedAt: string; reviewedBy: string;
}
export interface FoodPreferences { diets: Diet[]; avoid: Allergen[]; hideUnsuitable: boolean; }
export interface SavedBasket {
    id: string; name: string; lines: { vendorId: string; itemId: string; quantity: number; name: string; priceSen: number; foodRevision?: string }[]; updatedAt: string;
}
export interface ClassEvent { id: string; uid: string; title: string; startAt: string; endAt: string; location: string; source: 'manual' | 'import' | 'apspace'; }
export interface TimetablePreview { id: string; events: ClassEvent[]; warnings: string[]; expiresAt: string; horizonEnd: string; }
export interface ApspacePreview extends ApspaceSource {
    id: string;
    kind: 'connect' | 'update';
    checkedAt: string;
    expiresAt: string;
    events: ClassEvent[];
    affectedDates: string[];
    selectedIds: string[];
}
export interface StudentProfile {
    favourites: string[]; usuals: SavedBasket[]; preferences: FoodPreferences;
    classes: ClassEvent[]; importedAt?: string; importHorizonEnd?: string; preview?: TimetablePreview;
    apspace?: ApspaceConnection;
    apspacePreview?: ApspacePreview;
    apspaceGeneration?: string;
    apspaceReviewed?: Record<string, string[]>;
}
export interface Notice { id: string; key: string; studentId: string; orderId: string; vendorId: string; message: string; at: string; readAt?: string; }
export interface PickupPolicy { cutoffMinutes: number; cancellationMinutes: number; holdMinutes: number; delayGraceMinutes: number; }
export const DEFAULT_POLICY: PickupPolicy = { cutoffMinutes: 0, cancellationMinutes: 0, holdMinutes: 15, delayGraceMinutes: 5 };
export const emptyProfile = (): StudentProfile => ({ favourites: [], usuals: [], preferences: { diets: [], avoid: [], hideUnsuitable: false }, classes: [] });
export const label = (s: string): string => s.replaceAll('_', ' ');
export interface FoodCheck { suitable: boolean; reasons: string[]; }
export function foodCheck(info: FoodInfo | undefined, p: FoodPreferences, now = Date.now()): FoodCheck {
    const reasons: string[] = [];
    if ((p.avoid.length || p.diets.length) && info?.reviewedBy === 'sample-seed') reasons.push('Vendor review is required for this sample dietary information.');
    const evidenceCurrent = (e?: Evidence) => !!e?.reference && /^\d{4}-\d{2}-\d{2}$/.test(e.expiresOn) && Date.parse(`${e.expiresOn}T23:59:59+08:00`) >= now;
    if (p.avoid.length && (!info?.allergensKnown || !info.ingredients.trim())) reasons.push('Ingredient/allergen information is incomplete.');
    for (const a of p.avoid) if (info?.allergens.includes(a) || info?.mayContain.includes(a)) reasons.push(`${label(a)} is declared or may be present.`);
    for (const d of p.diets) {
        if (!info?.diets.includes(d)) reasons.push(`${label(d)} is not declared by the kitchen.`);
        else if (d === 'halal' && !evidenceCurrent(info.halalEvidence)) reasons.push('Current halal evidence is not provided.');
        else if (d === 'gluten_free' && !evidenceCurrent(info.glutenFreeEvidence)) reasons.push('Current gluten-free evidence is not provided.');
    }
    return { suitable: !reasons.length, reasons };
}
export interface BookingLoad {
    vendorId: string; updatedAt: string; open: boolean; nextAvailableAt: string | null;
    slots: { id: string; startAt: string; endAt: string; level: 'available' | 'filling' | 'full' | 'closed'; percent: number }[];
}
export function isClosed(status: string): boolean { return ['collected', 'cancelled', 'uncollected'].includes(status); }
