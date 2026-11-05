export class AppError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
}
export function requireThat(condition: unknown, code: string, message: string, status = 400): asserts condition {
    if (!condition)
        throw new AppError(status, code, message);
}
export const object = (x: unknown): Record<string, unknown> => {
    requireThat(x !== null && typeof x === 'object' && !Array.isArray(x), 'INVALID_INPUT', 'Expected a JSON object.');
    return x as Record<string, unknown>;
};
export function text(x: unknown, label: string, min = 1, max = 160): string {
    requireThat(typeof x === 'string' && x.trim().length >= min && x.length <= max, 'INVALID_INPUT', `${label} must contain ${min}–${max} characters.`);
    return x.trim();
}
export function integer(x: unknown, label: string, min: number, max: number): number {
    requireThat(typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max, 'INVALID_INPUT', `${label} must be an integer between ${min} and ${max}.`);
    return x;
}
export function bool(x: unknown, label: string): boolean { requireThat(typeof x === 'boolean', 'INVALID_INPUT', `${label} must be true or false.`); return x; }
export function iso(x: unknown, label: string): string {
    const value = text(x, label, 20, 35);
    requireThat(/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)), 'INVALID_INPUT', `${label} must be an ISO timestamp with a timezone.`);
    return new Date(value).toISOString();
}
