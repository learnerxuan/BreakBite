/** RFC 8291 aes128gcm + RFC 8292 VAPID using Node's crypto primitives.
 * Single bounded record; tests include RFC 8291's published interoperability vector.
 * No third-party QR/push gateway receives order contents. Browser push services still carry messages.
 */
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PushKeys, WebSubscription } from '../shared/push.js';
import { object, requireThat, text } from './errors.js';

function bytes(value: unknown, length: number, name: string): Buffer {
    requireThat(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value), 'INVALID_PUSH', `${name} must be base64url.`);
    const b = Buffer.from(value, 'base64url');
    requireThat(b.length === length && b.toString('base64url') === value, 'INVALID_PUSH', `Invalid ${name}.`);
    return b;
}
/** Only browser-operated push hosts. Never accept arbitrary URLs or follow redirects (SSRF). */
export function endpointOf(value: unknown): string {
    const valueString = text(value, 'Push endpoint', 20, 2048);
    let u: URL; try { u = new URL(valueString); } catch { requireThat(false, 'INVALID_PUSH_ENDPOINT', 'Invalid push endpoint.'); }
    const allowed = u.hostname === 'fcm.googleapis.com' || u.hostname === 'updates.push.services.mozilla.com'
        || u.hostname === 'web.push.apple.com' || /^[a-z0-9-]+\.push\.apple\.com$/.test(u.hostname)
        || /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname);
    requireThat(u.protocol === 'https:' && !u.username && !u.password && !u.hash && !u.port && allowed && u.pathname.length > 1,
        'INVALID_PUSH_ENDPOINT', 'Unsupported browser push service. Use a supported browser; custom endpoints are not accepted.');
    return u.href;
}
export function subscriptionOf(input: unknown): WebSubscription {
    const b = object(input), keys = object(b.keys);
    const pub = bytes(keys.p256dh, 65, 'Browser key');
    requireThat(pub[0] === 4, 'INVALID_PUSH', 'Browser key must be uncompressed P-256.');
    try { const e = createECDH('prime256v1'); e.generateKeys(); e.computeSecret(pub); }
    catch { requireThat(false, 'INVALID_PUSH', 'Browser key is not a valid P-256 point.'); }
    bytes(keys.auth, 16, 'Authentication secret');
    return { endpoint: endpointOf(b.endpoint), keys: { p256dh: keys.p256dh as string, auth: keys.auth as string } };
}
export function validatePushKeys(input: unknown): PushKeys {
    const b = object(input), priv = bytes(b.privateKey, 32, 'VAPID private key'), pub = bytes(b.publicKey, 65, 'VAPID public key');
    const e = createECDH('prime256v1'); e.setPrivateKey(priv);
    requireThat(e.getPublicKey().equals(pub), 'PUSH_CONFIG', 'VAPID keys do not match.', 500);
    const subject = text(b.subject, 'VAPID contact', 8, 254);
    requireThat(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject) || /^https:\/\/[^\s]+$/.test(subject), 'PUSH_CONFIG', 'Provide a real mailto: or HTTPS contact URI.', 500);
    return { publicKey: b.publicKey as string, privateKey: b.privateKey as string, subject };
}
export function generatePushKeys(subject: string): PushKeys {
    const e = createECDH('prime256v1'); e.generateKeys();
    // Node's ECDH scalar can omit leading zero bytes. P-256 JWKs require 32 bytes.
    const scalar = e.getPrivateKey();
    const privateKey = Buffer.alloc(32);
    scalar.copy(privateKey, privateKey.length - scalar.length);
    return validatePushKeys({ publicKey: e.getPublicKey().toString('base64url'), privateKey: privateKey.toString('base64url'), subject });
}
export async function loadPushKeys(directory: string, enabled = process.env.PUSH_ENABLED === 'true', inline = process.env.WEB_PUSH_KEYS_JSON): Promise<PushKeys | undefined> {
    if (!enabled) return undefined;
    if (inline) {
        let value: unknown;
        try { value = JSON.parse(inline); } catch { throw new Error('WEB_PUSH_KEYS_JSON must contain valid VAPID key JSON.'); }
        return validatePushKeys(value);
    }
    const content = await readFile(path.join(directory, 'web-push-keys.json'), 'utf8').catch(() => { throw new Error('Push enabled but keys are missing. Run npm run push:keys -- --subject=mailto:YOUR_EMAIL first.'); });
    return validatePushKeys(JSON.parse(content));
}
export function encryptPush(subscription: WebSubscription, payload: Buffer, deterministic?: { privateKey: Buffer; salt: Buffer }): Buffer {
    requireThat(payload.length <= 3000, 'PUSH_SIZE', 'Push payload too large.', 500);
    const browser = bytes(subscription.keys.p256dh, 65, 'Browser key'), auth = bytes(subscription.keys.auth, 16, 'Authentication secret');
    const e = createECDH('prime256v1'); if (deterministic) e.setPrivateKey(deterministic.privateKey); else e.generateKeys();
    const pub = e.getPublicKey(), salt = deterministic?.salt ?? randomBytes(16);
    requireThat(salt.length === 16, 'PUSH_SALT', 'Invalid encryption salt.', 500);
    const ikm = hkdfSync('sha256', e.computeSecret(browser), auth, Buffer.concat([Buffer.from('WebPush: info\0'), browser, pub]), 32);
    const key = hkdfSync('sha256', Buffer.from(ikm), salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hkdfSync('sha256', Buffer.from(ikm), salt, Buffer.from('Content-Encoding: nonce\0'), 12);
    const cipher = createCipheriv('aes-128-gcm', Buffer.from(key), Buffer.from(nonce));
    const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
    const header = Buffer.alloc(21); salt.copy(header); header.writeUInt32BE(4096, 16); header[20] = 65;
    return Buffer.concat([header, pub, encrypted]);
}
export function vapidAuthorization(endpoint: string, keys: PushKeys, now = Date.now()): string {
    const pub = Buffer.from(keys.publicKey, 'base64url');
    const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
    const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 3600, sub: keys.subject })).toString('base64url');
    const input = `${header}.${claims}`;
    const signature = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return `vapid t=${input}.${signature}, k=${keys.publicKey}`;
}
export interface PushResponse { status: number; retryAfter?: string | null; }
export type PushTransport = (subscription: WebSubscription, payload: string, ttl: number, topic: string) => Promise<PushResponse>;
export function transport(keys: PushKeys): PushTransport {
    return async (subscription, payload, ttl, topic) => {
        const endpoint = endpointOf(subscription.endpoint);
        const body = encryptPush(subscription, Buffer.from(payload));
        const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
            headers: { Authorization: vapidAuthorization(endpoint, keys), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(Math.max(0, Math.min(900, Math.floor(ttl)))), Urgency: 'high', Topic: topic }, body: new Uint8Array(body) });
        await response.body?.cancel(); // Do not log service URLs, credentials or response payloads.
        return { status: response.status, retryAfter: response.headers.get('retry-after') };
    };
}
