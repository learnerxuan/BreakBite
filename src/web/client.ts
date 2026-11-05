import type { Actor } from '../shared/model.js';
let csrfToken = '';
export class ApiError extends Error { constructor(message: string, readonly status: number, readonly code = '') { super(message); } }
export async function api<T>(path: string, method = 'GET', payload?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
        headers: { ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrfToken && method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}), ...extra },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw new ApiError(data.error?.message ?? 'The request could not be completed.', response.status, data.error?.code);
    return data as T;
}
export async function restore(): Promise<Actor | null> {
    try { const s = await api<{ actor: Actor; csrfToken: string }>('/api/session'); csrfToken = s.csrfToken; return s.actor; }
    catch (e) { if (e instanceof ApiError && e.status === 401) { csrfToken = ''; return null; } throw e; }
}
export async function signIn(payload: unknown, register: boolean): Promise<Actor> {
    const s = await api<{ actor: Actor; csrfToken: string }>(register ? '/api/auth/register' : '/api/auth/login', 'POST', payload);
    csrfToken = s.csrfToken; return s.actor;
}
export async function signOut(): Promise<void> { await api('/api/auth/logout', 'POST', {}); csrfToken = ''; }
