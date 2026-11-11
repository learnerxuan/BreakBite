import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
/** Vercel overwrites this header. Never trust forwarding headers on local/other servers. */
export function clientAddress(req: IncomingMessage, vercel: boolean): string {
    const forwarded = req.headers['x-vercel-forwarded-for'];
    if (vercel && typeof forwarded === 'string' && isIP(forwarded.trim())) return forwarded.trim();
    return req.socket.remoteAddress ?? 'unknown';
}
