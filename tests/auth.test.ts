import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Auth, JwtVerifier } from '../src/server/auth.js';
import { settings } from '../src/server/config.js';
import { AppError } from '../src/server/errors.js';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const certificate = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
function jwt(payload: unknown, header: unknown = { alg: 'RS256', kid: 'test-key' }): string {
    const prefix = `${encode(header)}.${encode(payload)}`;
    return `${prefix}.${sign('RSA-SHA256', Buffer.from(prefix), privateKey).toString('base64url')}`;
}
function fixture() {
    const claims = { sub: 'uid-student', aud: 'test-project', iss: 'https://securetoken.google.com/test-project', exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000 - 10 };
    const mock = (async () => new Response(JSON.stringify({ 'test-key': certificate }), { headers: { 'cache-control': 'max-age=3600' } })) as typeof fetch;
    return { claims, verifier: new JwtVerifier('https://fixed-cert-endpoint.invalid', claims.aud, [claims.iss], mock) };
}
test('JWT verifies an actual RSA signature and expected project identity', async () => {
    const { claims, verifier } = fixture();
    assert.equal((await verifier.check(jwt(claims))).sub, claims.sub);
});
test('JWT rejects wrong project, issuer, expiry, future issue time and empty subject', async () => {
    const { claims, verifier } = fixture();
    for (const delta of [{ aud: 'evil-project' }, { iss: 'https://evil.invalid' }, { exp: 0 }, { iat: Date.now() / 1000 + 3600 }, { sub: '' }])
        await assert.rejects(verifier.check(jwt({ ...claims, ...delta })), (e: unknown) => e instanceof AppError && e.status === 401);
});
test('JWT rejects tampering, null payloads, unsigned tokens and unknown keys', async () => {
    const { claims, verifier } = fixture();
    const original = jwt(claims);
    const parts = original.split('.');
    parts[1] = encode({ ...claims, sub: 'admin' });
    for (const token of [parts.join('.'), jwt(null), jwt(claims, null), jwt(claims, { alg: 'none', kid: 'test-key' }), jwt(claims, { alg: 'RS256', kid: 'other' }), 'not.a.token'])
        await assert.rejects(verifier.check(token), (e: unknown) => e instanceof AppError && e.status === 401);
});
test('demo mode refuses public bind and Cloud Run deployment', () => {
    assert.throws(() => settings({ AUTH_MODE: 'demo', HOST: '0.0.0.0' }), /loopback/);
    assert.throws(() => settings({ AUTH_MODE: 'demo', K_SERVICE: 'cloud-run' }), /requires/);
    assert.throws(() => settings({ AUTH_MODE: 'demo', STORE: 'firestore' }), /requires/);
});
test('configuration validates vendor mappings and exact CORS origins', () => {
    assert.throws(() => settings({ VENDOR_USERS_JSON: '{"uid":"unknown-vendor"}' }), /vendor mapping/);
    assert.throws(() => settings({ ALLOWED_ORIGINS: 'https://example.com/path' }), /exact origins/);
    const config = settings({ AUTH_MODE: 'firebase', GOOGLE_CLOUD_PROJECT: 'test-project', VENDOR_USERS_JSON: '{"uid":"bowl-lab"}' });
    assert.equal(config.vendorUsers.uid, 'bowl-lab');
});
test('Cloud Run IAM trust is explicit and forbidden on public API or local execution', () => {
    const base = { AUTH_MODE: 'firebase', GOOGLE_CLOUD_PROJECT: 'test', MCP_TRUST_CLOUD_RUN_IAM: 'true' };
    assert.throws(() => settings(base), /MCP-only/);
    assert.throws(() => settings({ ...base, K_SERVICE: 'api' }), /MCP-only/);
    assert.throws(() => settings({ ...base, MCP_ONLY: 'true' }), /MCP-only/);
});
test('private MCP platform mode validates audience and caller scope after gateway authentication', async () => {
    const audience = 'https://private-mcp.run.app';
    const config = settings({ AUTH_MODE: 'firebase', GOOGLE_CLOUD_PROJECT: 'test', K_SERVICE: 'mcp', MCP_ONLY: 'true', MCP_TRUST_CLOUD_RUN_IAM: 'true', MCP_AUDIENCE: audience, MCP_EMAILS_JSON: '{"approved@example.com":"bowl-lab"}' });
    const auth = new Auth(config);
    const claims = { aud: audience, iss: 'https://accounts.google.com', sub: 'caller', email: 'approved@example.com', email_verified: true, exp: Date.now() / 1000 + 300, iat: Date.now() / 1000 - 10 };
    const request = (c: unknown) => ({ headers: { 'x-serverless-authorization': `Bearer ${encode({ alg: 'RS256' })}.${encode(c)}.` } }) as unknown as IncomingMessage;
    assert.equal((await auth.agent(request(claims))).vendorId, 'bowl-lab');
    for (const c of [{ ...claims, aud: 'wrong' }, { ...claims, email: 'intruder@example.com' }, { ...claims, exp: 0 }, null])
        await assert.rejects(auth.agent(request(c)), AppError);
    await assert.rejects(auth.agent({ headers: {} } as IncomingMessage), AppError);
});
