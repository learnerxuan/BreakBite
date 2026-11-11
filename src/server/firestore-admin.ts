import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import { AppError, requireThat } from './errors.js';
import { FirestoreConflict, type DocumentStore, type DocWrite, type Version } from './firestore-database.js';

export interface ServiceAccountKey { projectId: string; clientEmail: string; privateKey: string }

/** Accepts the downloaded key JSON, or the same JSON base64-encoded for hosting environment variables. Never echoes key material. */
export function serviceAccountFrom(text: string, projectId: string): ServiceAccountKey {
    const trimmed = text.trim();
    let key: { type?: unknown; project_id?: unknown; client_email?: unknown; private_key?: unknown };
    try { key = JSON.parse(trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8')); }
    catch { throw new AppError(500, 'CONFIG', 'The service-account key is not valid JSON. Use the key file downloaded from Google Cloud.'); }
    requireThat(key && key.type === 'service_account' && typeof key.project_id === 'string' && typeof key.client_email === 'string' && typeof key.private_key === 'string',
        'CONFIG', 'The configured credentials are not a Google service-account key.', 500);
    requireThat(key.project_id === projectId, 'CONFIG', `The service-account key belongs to project ${key.project_id}, not GOOGLE_CLOUD_PROJECT=${projectId}.`, 500);
    return { projectId: key.project_id, clientEmail: key.client_email, privateKey: key.private_key };
}
/** Lets every teammate's .env say ~/secrets/key.json. */
export function expandHome(file: string): string {
    return file === '~' || /^~[\\/]/.test(file) ? path.join(os.homedir(), file.slice(1)) : file;
}

type Code = number | string | undefined;
const codeOf = (error: unknown): Code => (error as { code?: Code } | null)?.code;
const is = (code: Code, number: number, name: string) => code === number || (typeof code === 'string' && code.toLowerCase().replace(/_/g, '-') === name);
/** Maps SDK errors to FirestoreConflict (retry) or a clear AppError. Exported for tests. */
export function translate(error: unknown, committing: boolean): Error {
    const code = codeOf(error);
    const message = error instanceof Error ? error.message : '';
    // Over REST, a failed lastUpdateTime precondition arrives as INVALID_ARGUMENT (3), not FAILED_PRECONDITION (9).
    const staleVersion = is(code, 3, 'invalid-argument') && /does not match the required base version/i.test(message);
    // A missing ROOT during commit means it was deleted underneath us; reloading reports it clearly.
    if (staleVersion || is(code, 9, 'failed-precondition') || is(code, 10, 'aborted') || is(code, 6, 'already-exists') || (committing && is(code, 5, 'not-found'))) return new FirestoreConflict();
    console.error('Firestore request failed:', code ?? 'unknown', message.slice(0, 300));
    if (is(code, 7, 'permission-denied')) return new AppError(503, 'CLOUD_PERMISSION', 'Firestore refused access. Give the service account the Cloud Datastore User role (roles/datastore.user) on this project.');
    if (is(code, 16, 'unauthenticated')) return new AppError(503, 'CLOUD_AUTH', 'Firestore credentials are missing or invalid. Check GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON.');
    if (is(code, 5, 'not-found')) return new AppError(503, 'CLOUD_STORE', 'Firestore database not found. Check GOOGLE_CLOUD_PROJECT and FIRESTORE_DATABASE.');
    return new AppError(503, 'CLOUD_STORE', 'Firestore is temporarily unavailable. Retry shortly.');
}

export interface AdminOptions { projectId: string; databaseId: string; env?: NodeJS.ProcessEnv }

/** One Firebase Admin app and Firestore client with the configured credentials. */
export async function adminFirestore(options: AdminOptions): Promise<{ db: Firestore; close(): Promise<void> }> {
    const env = options.env ?? process.env;
    const { initializeApp, deleteApp, cert, applicationDefault } = await import('firebase-admin/app');
    const { initializeFirestore } = await import('firebase-admin/firestore');
    let credential;
    // The emulator needs no credentials. Otherwise: inline key (hosting), key file (laptop), or gcloud application-default login.
    if (!env.FIRESTORE_EMULATOR_HOST) {
        const inline = env.FIREBASE_SERVICE_ACCOUNT_JSON;
        const file = env.GOOGLE_APPLICATION_CREDENTIALS;
        if (inline) credential = cert(serviceAccountFrom(inline, options.projectId));
        else if (file) {
            const text = await readFile(expandHome(file), 'utf8').catch(() => { throw new AppError(500, 'CONFIG', `Cannot read the service-account key at GOOGLE_APPLICATION_CREDENTIALS=${file}.`); });
            credential = cert(serviceAccountFrom(text, options.projectId));
        } else credential = applicationDefault();
    }
    const app = initializeApp({ projectId: options.projectId, ...(credential ? { credential } : {}) }, `breakbite-${randomUUID()}`);
    const settings = { preferRest: true };
    const db = options.databaseId === '(default)' ? initializeFirestore(app, settings) : initializeFirestore(app, settings, options.databaseId);
    return { db, close: () => deleteApp(app) };
}

/** Firebase Admin SDK implementation of the small document interface FirestoreDatabase needs. */
export async function adminDocumentStore(options: AdminOptions): Promise<DocumentStore> {
    const { db, close } = await adminFirestore(options);
    const { Timestamp } = await import('firebase-admin/firestore');
    const encode =(t: { seconds: number; nanoseconds: number }): Version => `${t.seconds}.${String(t.nanoseconds).padStart(9, '0')}`;
    const decode = (v: Version) => { const [seconds, nanos] = v.split('.'); return new Timestamp(Number(seconds), Number(nanos)); };
    return {
        async get(documentPath) {
            try {
                const snapshot = await db.doc(documentPath).get();
                return snapshot.exists ? { data: snapshot.data()!, version: encode(snapshot.updateTime!) } : null;
            } catch (error) { throw translate(error, false); }
        },
        async list(collectionPath) {
            try { return (await db.collection(collectionPath).get()).docs.map(d => ({ id: d.id, data: d.data() })); }
            catch (error) { throw translate(error, false); }
        },
        async commit(writes: DocWrite[]) {
            const batch = db.batch();
            for (const w of writes) {
                const ref = db.doc(w.path);
                if ('delete' in w) batch.delete(ref);
                else if (!w.precondition) batch.set(ref, w.set);
                else if ('exists' in w.precondition) batch.create(ref, w.set);
                else batch.update(ref, w.set, { lastUpdateTime: decode(w.precondition.updateTime) });
            }
            try { return (await batch.commit()).map(r => encode(r.writeTime)); }
            catch (error) { throw translate(error, true); }
        },
        close,
    };
}
