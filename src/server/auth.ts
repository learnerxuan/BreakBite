import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Actor } from '../shared/model.js';
import { AppError, requireThat, text } from './errors.js';
import { DEMO_IDENTITIES } from './seed.js';
import type { Settings } from './config.js';
export interface Claims {
    sub: string;
    aud: string;
    iss: string;
    exp: number;
    iat: number;
    name?: string;
    email?: string;
    email_verified?: boolean;
}
export class JwtVerifier {
    private keys: Record<string, string> = {};
    private until = 0;
    constructor(private certificateURL: string, private audience: string, private issuers: string[], private get = fetch) { }
    async check(token: string): Promise<Claims> {
        requireThat(token.length <= 16000, 'UNAUTHORIZED', 'Invalid identity token.', 401);
        const segments = token.split('.');
        requireThat(segments.length === 3 && segments.every(x => /^[A-Za-z0-9_-]+$/.test(x)), 'UNAUTHORIZED', 'Invalid identity token.', 401);
        let header: {
            alg?: string;
            kid?: string;
        };
        let claims: Claims;
        try {
            header = JSON.parse(Buffer.from(segments[0]!, 'base64url').toString());
            claims = JSON.parse(Buffer.from(segments[1]!, 'base64url').toString());
        }
        catch {
            throw new AppError(401, 'UNAUTHORIZED', 'Invalid identity token.');
        }
        requireThat(header && claims && typeof header === 'object' && typeof claims === 'object' && !Array.isArray(header) && !Array.isArray(claims), 'UNAUTHORIZED', 'Invalid identity payload.', 401);
        requireThat(header.alg === 'RS256' && typeof header.kid === 'string', 'UNAUTHORIZED', 'Unsupported identity signature.', 401);
        if (Date.now() >= this.until) {
            const response = await this.get(this.certificateURL, { signal: AbortSignal.timeout(8000) });
            requireThat(response.ok, 'AUTH_UNAVAILABLE', 'Identity verification temporarily unavailable.', 503);
            this.keys = await response.json() as Record<string, string>;
            const seconds = Math.min(3600, Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 300));
            this.until = Date.now() + seconds * 1000;
        }
        const pem = this.keys[header.kid];
        requireThat(typeof pem === 'string' && verify('RSA-SHA256', Buffer.from(`${segments[0]}.${segments[1]}`), createPublicKey(pem), Buffer.from(segments[2]!, 'base64url')), 'UNAUTHORIZED', 'Invalid identity signature.', 401);
        const now = Date.now() / 1000;
        requireThat(claims.aud === this.audience && this.issuers.includes(claims.iss) && typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 128 && typeof claims.exp === 'number' && claims.exp > now && typeof claims.iat === 'number' && claims.iat <= now + 30, 'UNAUTHORIZED', 'Expired token or incorrect project/audience.', 401);
        return claims;
    }
}
export class Auth {
    private sessions = new Map<string, {
        actor: Actor;
        until: number;
    }>();
    private firebase: JwtVerifier;
    private google: JwtVerifier;
    constructor(private config: Settings) {
        this.firebase = new JwtVerifier('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', config.projectId, [`https://securetoken.google.com/${config.projectId}`]);
        this.google = new JwtVerifier('https://www.googleapis.com/oauth2/v1/certs', config.agentAudience, ['https://accounts.google.com', 'accounts.google.com']);
    }
    demoLogin(id: unknown): {
        token: string;
        actor: Actor;
        expiresAt: string;
    } {
        requireThat(this.config.mode === 'demo', 'NOT_FOUND', 'Demo login is disabled.', 404);
        const actor = DEMO_IDENTITIES.find(x => x.id === text(id, 'Demo account'));
        requireThat(actor, 'INVALID_ACCOUNT', 'Choose one of the listed demo accounts.');
        for (const [key, session] of this.sessions)
            if (session.until <= Date.now())
                this.sessions.delete(key);
        requireThat(this.sessions.size < 1000, 'BUSY', 'Too many local sessions.', 429);
        const token = randomBytes(32).toString('base64url');
        const until = Date.now() + 8 * 60 * 60000;
        this.sessions.set(token, { actor, until });
        return { token, actor, expiresAt: new Date(until).toISOString() };
    }
    private bearer(req: IncomingMessage): string {
        const match = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
        requireThat(match, 'UNAUTHORIZED', 'Sign in to continue.', 401);
        return match[1]!;
    }
    async user(req: IncomingMessage): Promise<Actor> {
        const token = this.bearer(req);
        if (this.config.mode === 'demo') {
            const session = this.sessions.get(token);
            requireThat(session && session.until > Date.now(), 'UNAUTHORIZED', 'Demo session expired. Sign in again.', 401);
            return session.actor;
        }
        const claims = await this.firebase.check(token);
        const vendorId = Object.hasOwn(this.config.vendorUsers, claims.sub) ? this.config.vendorUsers[claims.sub] : undefined;
        return { id: claims.sub, name: claims.name?.slice(0, 80) ?? (vendorId ? 'Vendor operator' : 'Student'), role: vendorId ? 'vendor' : 'student', ...(vendorId ? { vendorId } : {}) };
    }
    async agent(req: IncomingMessage): Promise<Actor> {
        // Cloud Run strips the signature in X-Serverless-Authorization after IAM verification.
        // This branch trusts that explicitly configured platform boundary, not an unsigned
        // JWT from the internet. NEVER grant allUsers/allAuthenticatedUsers run.invoker.
        if (this.config.trustCloudRunIAM) {
            requireThat(this.config.agentAudience && Object.keys(this.config.agentEmails).length, 'MCP_NOT_CONFIGURED', 'MCP identity mapping is not configured.', 503);
            const header = req.headers['x-serverless-authorization'];
            requireThat(typeof header === 'string' && header.startsWith('Bearer ') && header.length < 16000, 'UNAUTHORIZED', 'Cloud Run IAM identity is missing.', 401);
            let claims: Claims;
            try {
                claims = JSON.parse(Buffer.from(header.slice(7).split('.')[1] ?? '', 'base64url').toString());
            }
            catch {
                throw new AppError(401, 'UNAUTHORIZED', 'Malformed platform identity.');
            }
            const now = Date.now() / 1000;
            requireThat(claims && typeof claims === 'object' && claims.aud === this.config.agentAudience && ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) && typeof claims.exp === 'number' && claims.exp > now && typeof claims.iat === 'number' && claims.iat <= now + 30, 'UNAUTHORIZED', 'Invalid platform identity claims.', 401);
            const vendorId = claims.email_verified === true && claims.email && Object.hasOwn(this.config.agentEmails, claims.email) ? this.config.agentEmails[claims.email] : undefined;
            requireThat(vendorId, 'FORBIDDEN', 'Platform caller has no vendor scope.', 403);
            return { id: `mcp:${claims.email}`, role: 'agent', name: 'Gemini Enterprise IAM caller', vendorId };
        }
        const token = this.bearer(req);
        if (this.config.mode === 'demo') {
            requireThat(this.config.demoAgentToken.length >= 24, 'MCP_NOT_CONFIGURED', 'Set a local DEMO_MCP_TOKEN of at least 24 characters to enable MCP.', 503);
            const digest = (s: string) => createHash('sha256').update(s).digest();
            requireThat(timingSafeEqual(digest(token), digest(this.config.demoAgentToken)), 'UNAUTHORIZED', 'Invalid MCP credential.', 401);
            return { id: 'local-mcp-agent', role: 'agent', name: 'Local MCP client', vendorId: 'bowl-lab' };
        }
        requireThat(this.config.agentAudience && Object.keys(this.config.agentEmails).length, 'MCP_NOT_CONFIGURED', 'MCP identity mapping is not configured.', 503);
        const claims = await this.google.check(token);
        const vendorId = claims.email_verified === true && claims.email && Object.hasOwn(this.config.agentEmails, claims.email) ? this.config.agentEmails[claims.email] : undefined;
        requireThat(vendorId, 'FORBIDDEN', 'This Google service identity has no vendor scope.', 403);
        return { id: `mcp:${claims.email}`, role: 'agent', name: 'Gemini Enterprise tool caller', vendorId };
    }
}
