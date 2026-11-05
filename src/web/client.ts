import type { Actor, AppConfig } from '../shared/model.js';
interface Session {
    token: string;
    refreshToken?: string;
    expiresAt?: number;
    actor?: Actor;
}
let session: Session | null = null;
try {
    session = JSON.parse(sessionStorage.getItem('breakbite-session') ?? 'null') as Session | null;
}
catch {
    sessionStorage.removeItem('breakbite-session');
}
let config: AppConfig;
export function configure(value: AppConfig): void { config = value; }
export const hasSession = () => !!session?.token;
const save = () => sessionStorage.setItem('breakbite-session', JSON.stringify(session));
export function logout(): void { session = null; sessionStorage.removeItem('breakbite-session'); }
async function token(): Promise<string> {
    if (session?.refreshToken && (!session.expiresAt || session.expiresAt < Date.now() + 60000)) {
        const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.firebaseApiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }) });
        const data = await response.json() as {
            id_token?: string;
            refresh_token?: string;
            expires_in?: string;
        };
        if (!response.ok || !data.id_token) {
            logout();
            throw new Error('Your session expired. Please sign in again.');
        }
        session = { ...session, token: data.id_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 };
        save();
    }
    return session?.token ?? '';
}
export async function api<T>(path: string, method = 'GET', payload?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const idToken = await token();
    const response = await fetch(path, { method, headers: { ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}), ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(15000) });
    const data = await response.json() as T & {
        error?: {
            message: string;
        };
    };
    if (!response.ok) {
        if (response.status === 401)
            logout();
        throw new Error(data.error?.message ?? 'The request could not be completed.');
    }
    return data;
}
export async function demoLogin(id: string): Promise<void> {
    const result = await api<{
        token: string;
        actor: Actor;
    }>('/api/demo/login', 'POST', { id });
    session = result;
    save();
}
export async function firebaseLogin(email: string, password: string, signup: boolean): Promise<void> {
    if (!config.firebaseApiKey)
        throw new Error('Firebase sign-in is not configured. See docs/MANUAL_SETUP.md.');
    const action = signup ? 'signUp' : 'signInWithPassword';
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(config.firebaseApiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(12000) });
    const result = await response.json() as {
        idToken?: string;
        refreshToken?: string;
        expiresIn?: string;
        error?: {
            message: string;
        };
    };
    if (!response.ok || !result.idToken) {
        const message = result.error?.message === 'EMAIL_EXISTS' ? 'An account with this email already exists.' : 'Sign-in failed. Check your details and the Firebase Email/Password provider settings.';
        throw new Error(message);
    }
    session = { token: result.idToken, refreshToken: result.refreshToken, expiresAt: Date.now() + Number(result.expiresIn) * 1000 };
    save();
}
