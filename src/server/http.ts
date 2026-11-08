import { ProductService } from './product.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Settings } from './config.js';
import { Auth } from './auth.js';
import { Accounts } from './accounts.js';
import { CheckoutService } from './checkout.js';
import type { LocalDatabase } from './local-database.js';
import { AppError, object, requireThat } from './errors.js';
import { MealService } from './domain.js';
import { DEMO_IDENTITIES, seedVendor } from './seed.js';
import { PROTOCOLS, rpc } from './mcp.js';
function json(res: ServerResponse, status: number, value: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage, limit = 32768): Promise<unknown> {
    requireThat(req.headers['content-type']?.split(';')[0] === 'application/json', 'CONTENT_TYPE', 'Use application/json.', 415);
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        size += chunk.length;
        requireThat(size <= limit, 'BODY_TOO_LARGE', 'Request exceeds the allowed size.', 413);
        chunks.push(Buffer.from(chunk));
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        throw new AppError(400, 'INVALID_JSON', 'Malformed JSON.');
    }
}
export function createApp(config: Settings, service: MealService, db?: LocalDatabase) {
    const auth = new Auth(config);
    const accounts = db ? new Accounts(db, config.secureCookie) : undefined;
    const product = db ? new ProductService(db) : undefined;
    const checkout = db ? new CheckoutService(db) : undefined;
    const authLimits = new Map<string, { count: number; until: number }>();
    const limits = new Map<string, {
        count: number;
        until: number;
    }>();
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    return createServer(async (req, res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
        try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const pathname = url.pathname;
            const origin = req.headers.origin;
            requireThat(!origin || config.allowedOrigins.includes(origin), 'ORIGIN_DENIED', 'This origin is not permitted.', 403);
            if (origin) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
            }
            if (config.mode === 'local') {
                requireThat(config.allowedOrigins.some(o => new URL(o).host === req.headers.host), 'HOST_DENIED', 'This host is not configured. Add its exact origin to ALLOWED_ORIGINS.', 403);
                requireThat(req.headers['sec-fetch-site'] !== 'cross-site', 'ORIGIN_DENIED', 'Cross-site requests are not accepted.', 403);
            }
            if (config.mode === 'demo') {
                const host = (req.headers.host ?? '').replace(/:\d+$/, '');
                requireThat(['localhost', '127.0.0.1', '[::1]'].includes(host), 'HOST_DENIED', 'Local demo host only.', 403);
            }
            if (req.method === 'OPTIONS') {
                res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,Idempotency-Key,MCP-Protocol-Version,X-CSRF-Token', 'Access-Control-Max-Age': '300' });
                res.end();
                return;
            }
            if (db && /^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(pathname) && req.method === 'GET') {
                const bytes = await readFile(path.join(db.directory, 'media', path.basename(pathname))).catch(() => { throw new AppError(404, 'NOT_FOUND', 'Photo not found.'); });
                res.writeHead(200, { 'Content-Type': pathname.endsWith('.png') ? 'image/png' : pathname.endsWith('.webp') ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'public,max-age=86400' }); res.end(bytes); return;
            }
            if (pathname === '/healthz') {
                json(res, 200, { ok: true, version: '0.3.0', mode: config.mode, storage: config.cloud ? 'firestore' : 'local-file' });
                return;
            }
            const key = req.socket.remoteAddress ?? 'unknown';
            if (limits.size > 5000)
                for (const [id, limit] of limits)
                    if (limit.until < Date.now())
                        limits.delete(id);
            let limit = limits.get(key);
            if (!limit || limit.until < Date.now()) {
                limit = { count: 0, until: Date.now() + 60000 };
                limits.set(key, limit);
            }
            requireThat(++limit.count <= 300, 'RATE_LIMIT', 'Too many requests. Retry shortly.', 429);
            if (pathname === '/mcp') {
                requireThat(req.method === 'POST', 'METHOD_NOT_ALLOWED', 'This stateless MCP endpoint accepts POST only.', 405);
                const actor = await auth.agent(req);
                const protocol = req.headers['mcp-protocol-version'];
                requireThat(!protocol || (typeof protocol === 'string' && PROTOCOLS.includes(protocol)), 'MCP_VERSION', 'Unsupported MCP protocol version.');
                requireThat(req.headers.accept?.includes('application/json') && req.headers.accept.includes('text/event-stream'), 'MCP_ACCEPT', 'Accept must include application/json and text/event-stream.', 406);
                const result = await rpc(service, actor, await body(req));
                if (result === null) {
                    res.writeHead(202);
                    res.end();
                }
                else
                    json(res, 200, result);
                return;
            }
            requireThat(!config.mcpOnly, 'NOT_FOUND', 'This service exposes MCP only.', 404);
            if (pathname === '/api/config' && req.method === 'GET') {
                json(res, 200, { mode: config.mode, firebaseApiKey: config.firebaseApiKey, enterpriseConfigured: !!config.agentAudience && Object.keys(config.agentEmails).length > 0, demoIdentities: config.mode === 'demo' ? DEMO_IDENTITIES : [] });
                return;
            }
            if (config.mode === 'local' && pathname === '/api/catalog' && req.method === 'GET') {
                const states = await Promise.all((await service.store.ids()).map(id => service.store.read(id)));
                json(res, 200, { vendors: states.map(s => s.vendor), items: states.flatMap(s => s.items), loads: product?.loads() ?? [], serverTime: new Date().toISOString() });
                return;
            }
            if (accounts && ['/api/auth/login', '/api/auth/register'].includes(pathname) && req.method === 'POST') {
                const id = req.socket.remoteAddress ?? 'unknown';
                if (authLimits.size > 5000) for (const [k, v] of authLimits) if (v.until <= Date.now()) authLimits.delete(k);
                let entry = authLimits.get(id);
                if (!entry || entry.until <= Date.now()) { entry = { count: 0, until: Date.now() + 60000 }; authLimits.set(id, entry); }
                requireThat(++entry.count <= 12, 'RATE_LIMIT', 'Too many sign-in attempts. Try again in a minute.', 429);
                const input = await body(req);
                const account = pathname.endsWith('register') ? await accounts.register(input) : await accounts.login(input);
                json(res, 200, await accounts.start(account, res)); return;
            }
            if (pathname === '/api/demo/login' && req.method === 'POST') {
                json(res, 200, auth.demoLogin(object(await body(req)).id));
                return;
            }
            if (pathname.startsWith('/api/')) {
                const actor = accounts ? accounts.authorize(req) : await auth.user(req);
                const method = req.method;
                if (product && pathname.startsWith('/api/product/')) {
                    const route = pathname.slice('/api/product/'.length);
                    if (route === 'profile' && method === 'GET') { await product.tick(); json(res, 200, product.profile(actor)); return; }
                    if (route === 'loads' && method === 'GET') { json(res, 200, product.loads()); return; }
                    requireThat(method === 'POST', 'METHOD_NOT_ALLOWED', 'Use POST for this action.', 405);
                    const input = object(await body(req, route === 'photo' ? 2900000 : route === 'timetable/preview' ? 300000 : route === 'timetable/confirm' ? 65536 : 32768));
                    let result: unknown = { ok: true };
                    if (route === 'preferences') await product.preferences(actor, input);
                    else if (route === 'favourite') await product.favourite(actor, input);
                    else if (route === 'usual') await product.usual(actor, input);
                    else if (route === 'reorder') result = product.reorder(actor, input);
                    else if (route === 'notices/read') await product.markRead(actor);
                    else if (route === 'timetable/preview') result = await product.previewTimetable(actor, input);
                    else if (route === 'timetable/confirm') await product.confirmTimetable(actor, input);
                    else if (route === 'timetable/manual') await product.manualClass(actor, input);
                    else if (route === 'timetable/delete') await product.deleteClass(actor, input);
                    else if (route === 'pickup/qr') result = await product.pickupQr(actor, String(input.vendorId ?? ''), String(input.orderId ?? ''));
                    else if (route === 'pickup/resolve') result = product.resolveQr(actor, input);
                    else if (route === 'pickup/collect') await product.collectQr(actor, input);
                    else if (route === 'uncollected') await product.closeUncollected(actor, input);
                    else if (route === 'no-show/correct') await product.correctNoShow(actor, input);
                    else if (route === 'earlier/options') result = await product.earlierOptions(actor, String(input.vendorId ?? ''), String(input.orderId ?? ''));
                    else if (route === 'earlier/confirm') await product.moveEarlier(actor, input);
                    else if (route === 'assistance') result = await service.requestAssistance(actor, String(input.vendorId ?? ''), String(input.orderId ?? ''));
                    else if (route === 'photo') await product.photo(actor, String(input.itemId ?? ''), input);
                    else throw new AppError(404, 'NOT_FOUND', 'Product action not found.');
                    await product.tick(); json(res, 200, result); return;
                }
                if (pathname === '/api/session' && method === 'GET') {
                    json(res, 200, { actor, ...(accounts ? { csrfToken: accounts.session(req).session.csrfToken } : {}) });
                    return;
                }
                if (accounts && pathname === '/api/auth/logout' && method === 'POST') {
                    await accounts.logout(req, res); json(res, 200, { ok: true }); return;
                }
                if (checkout && pathname === '/api/checkout/quote' && method === 'POST') {
                    json(res, 200, await checkout.quote(actor, await body(req))); return;
                }
                if (checkout && pathname.startsWith('/api/checkouts/') && method === 'GET') {
                    json(res, 200, { checkout: checkout.lookup(actor, decodeURIComponent(pathname.slice('/api/checkouts/'.length))) }); return;
                }
                if (checkout && pathname === '/api/checkouts' && method === 'POST') {
                    json(res, 201, await checkout.submit(actor, await body(req), String(req.headers['idempotency-key'] ?? ''))); return;
                }
                if (pathname === '/api/state' && method === 'GET') {
                    await product?.tick(); json(res, 200, await service.snapshot(actor, config.mode));
                    return;
                }
                if (pathname === '/api/quote' && method === 'POST') {
                    json(res, 200, await service.quote(actor, await body(req)));
                    return;
                }
                if (pathname === '/api/orders' && method === 'POST') {
                    requireThat(config.mode !== 'local', 'USE_CHECKOUT', 'Use /api/checkouts for the current ordering flow.', 409);
                    json(res, 201, await service.createOrder(actor, await body(req), String(req.headers['idempotency-key'] ?? '')));
                    return;
                }
                const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
                // /api/vendors/:vendor/{orders|items|incidents|proposals|recovery}/...
                requireThat(parts[1] === 'vendors' && parts[2], 'NOT_FOUND', 'API route not found.', 404);
                const vendor = parts[2];
                const area = parts[3];
                const id = parts[4] ?? '';
                const action = parts[5];
                if (area === 'profile' && method === 'PATCH') {
                    await service.updateVendor(actor, vendor, await body(req)); json(res, 200, { ok: true }); return;
                }
                if (area === 'items' && !id && method === 'POST') {
                    json(res, 201, await service.addItem(actor, vendor, await body(req))); return;
                }
                if (area === 'slots' && method === 'POST') {
                    json(res, 200, await service.openPickupWindows(actor, vendor, await body(req)));
                    return;
                }
                else if (area === 'open' && method === 'PATCH')
                    await service.setOpen(actor, vendor, await body(req));
                else if (area === 'items' && id && method === 'PATCH')
                    await service.updateItem(actor, vendor, id, await body(req));
                else if (area === 'orders' && id && action === 'cancel' && method === 'POST')
                    await service.cancel(actor, vendor, id);
                else if (area === 'orders' && id && action === 'status' && method === 'POST')
                    await service.changeStatus(actor, vendor, id, await body(req));
                else if (area === 'orders' && id && action === 'collect' && method === 'POST')
                    await service.collect(actor, vendor, id, await body(req));
                else if (area === 'incidents' && !id && method === 'POST')
                    await service.reportIncident(actor, vendor, await body(req));
                else if (area === 'incidents' && id && action === 'resolve' && method === 'POST')
                    await service.resolveIncident(actor, vendor, id);
                else if (area === 'recovery' && id === 'evaluate' && method === 'POST') {
                    const data = object(await body(req));
                    requireThat(typeof data.orderId === 'string', 'INVALID_INPUT', 'An order ID is required.');
                    json(res, 200, await service.evaluateRecovery(actor, vendor, data.orderId));
                    return;
                }
                else if (area === 'proposals' && !id && method === 'POST') {
                    json(res, 201, await service.createProposal(actor, vendor, await body(req)));
                    return;
                }
                else if (area === 'proposals' && id && action === 'approve' && method === 'POST')
                    await service.approveProposal(actor, vendor, id, await body(req));
                else if (area === 'proposals' && id && action === 'respond' && method === 'POST')
                    await service.respondProposal(actor, vendor, id, await body(req));
                else if (area === 'reset-demo' && method === 'POST') {
                    requireThat(config.mode === 'demo' && actor.role === 'vendor' && actor.vendorId === vendor, 'FORBIDDEN', 'Only the local demo operator can reset their own demo vendor.', 403);
                    await service.store.initialize(seedVendor(vendor), true);
                }
                else
                    throw new AppError(404, 'NOT_FOUND', 'API route not found.');
                await product?.tick(); json(res, 200, { ok: true });
                return;
            }
            requireThat(req.method === 'GET' || req.method === 'HEAD', 'METHOD_NOT_ALLOWED', 'Use GET.', 405);
            let filename: string;
            if (pathname === '/' || pathname === '/index.html')
                filename = path.join(root, 'public/index.html');
            else if (/^\/(web|shared)\/[a-zA-Z0-9/_-]+\.(js|css)$/.test(pathname))
                filename = path.join(root, pathname.slice(1));
            else if (['/favicon.svg', '/manifest.webmanifest'].includes(pathname))
                filename = path.join(root, 'public', pathname.slice(1));
            else
                throw new AppError(404, 'NOT_FOUND', 'Page not found.');
            const content = await readFile(filename).catch(() => { throw new AppError(404, 'NOT_FOUND', 'Build the application before starting the server.'); });
            const extension = path.extname(filename);
            const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
            res.writeHead(200, { 'Content-Type': types[extension] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
            res.end(req.method === 'HEAD' ? undefined : content);
        }
        catch (error) {
            const known = error instanceof AppError;
            if (!known)
                console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error');
            if (!res.headersSent)
                json(res, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL', message: known ? error.message : 'Something went wrong. Please retry.' } });
            else
                res.end();
        }
    });
}
