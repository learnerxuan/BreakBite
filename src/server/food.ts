import { createHash } from 'node:crypto';
import { ALLERGENS, DIETS, SPICE, type Evidence, type FoodInfo, type FoodPreferences } from '../shared/features.js';
import { bool, object, requireThat, text } from './errors.js';
function list<T extends string>(value: unknown, allowed: readonly T[], field: string): T[] {
    requireThat(Array.isArray(value) && value.length <= allowed.length && value.every(v => typeof v === 'string' && allowed.includes(v as T)), 'INVALID_FOOD_INFO', `Choose supported ${field}.`);
    return [...new Set(value as T[])];
}
export function parsePreferences(input: unknown): FoodPreferences {
    const p = object(input);
    return { diets: list(p.diets, DIETS, 'dietary preferences'), avoid: list(p.avoid, ALLERGENS, 'allergens'), hideUnsuitable: bool(p.hideUnsuitable, 'Hide unsuitable meals') };
}
function evidence(value: unknown, name: string): Evidence | undefined {
    if (value === undefined || value === null) return undefined;
    const e = object(value);
    const reference = text(e.reference, `${name} source / certificate reference`, 5, 300);
    const expiresOn = text(e.expiresOn, `${name} review/expiry date`, 10, 10);
    requireThat(/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) && Number.isFinite(Date.parse(expiresOn)) && new Date(expiresOn).toISOString().slice(0, 10) === expiresOn, 'INVALID_FOOD_INFO', 'Enter a valid evidence expiry/review date.');
    return { reference, expiresOn };
}
export function parseFoodInfo(input: unknown, actorId: string, now: number): FoodInfo {
    const f = object(input);
    requireThat(f.confirmed === true, 'FOOD_REVIEW_REQUIRED', 'Confirm the information was checked with the kitchen. Unknown is not allergen-free.');
    const ingredients = text(f.ingredients ?? '', 'Ingredients', 0, 2000);
    const allergensKnown = bool(f.allergensKnown, 'Allergen information known');
    const allergens = list(f.allergens, ALLERGENS, 'allergens');
    const mayContain = list(f.mayContain, ALLERGENS, 'cross-contact allergens');
    const diets = list(f.diets, DIETS, 'dietary declarations');
    const spice = text(f.spice, 'Spice level') as FoodInfo['spice'];
    requireThat(SPICE.includes(spice), 'INVALID_FOOD_INFO', 'Choose a supported spice level.');
    requireThat(!allergensKnown || ingredients.length >= 3, 'INVALID_FOOD_INFO', 'Provide ingredients before marking allergen information reviewed.');
    const halalEvidence = evidence(f.halalEvidence, 'Halal');
    const glutenFreeEvidence = evidence(f.glutenFreeEvidence, 'Gluten-free');
    requireThat(!diets.includes('halal') || halalEvidence, 'EVIDENCE_REQUIRED', 'Provide a halal certification/source reference and expiry date; do not guess.');
    requireThat(!diets.includes('gluten_free') || (glutenFreeEvidence && allergensKnown && ![...allergens, ...mayContain].some(a => a === 'wheat' || a === 'gluten')), 'EVIDENCE_REQUIRED', 'A gluten-free claim needs reviewed ingredients, supporting evidence and no declared wheat/gluten risk.');
    const conflicts = diets.includes('vegan') ? ['milk', 'eggs', 'fish', 'shellfish'] : diets.includes('vegetarian') ? ['fish', 'shellfish'] : [];
    requireThat(!allergens.some(a => conflicts.includes(a)), 'INVALID_FOOD_INFO', 'Dietary declarations conflict with the listed ingredients/allergens.');
    return { ingredients, allergensKnown, allergens, mayContain, diets, spice, ...(halalEvidence ? { halalEvidence } : {}), ...(glutenFreeEvidence ? { glutenFreeEvidence } : {}), reviewedAt: new Date(now).toISOString(), reviewedBy: actorId };
}

/** Content fingerprint, not a timestamp: concurrent reviews must not collide. */
export const foodRevision = (info: FoodInfo | undefined): string => info ? createHash('sha256').update(JSON.stringify(info)).digest('hex') : '';
