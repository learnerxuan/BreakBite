import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { get as httpGet } from 'node:http';
import { settings } from '../src/server/config.js';
import { createApp } from '../src/server/http.js';
import { MealService } from '../src/server/domain.js';
import { MemoryStore } from '../src/server/store.js';
import { DEMO_IDENTITIES, seedVendor } from '../src/server/seed.js';
const AGENT_TOKEN = 'test-local-agent-credential-12345';
async function fixture(t: test.TestContext) {
    const store = new MemoryStore();
    const now = Date.now();
    await store.initialize(seedVendor('bowl-lab', now));
    await store.initialize(seedVendor('noodle-co', now));
    const service = new MealService(store, () => now);
    const server = createApp(settings({ DEMO_MCP_TOKEN: AGENT_TOKEN }), service);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = async (path: string, method = 'GET', data?: unknown, token = '', headers: Record<string, string> = {}) => {
        const response = await fetch(url + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
        const text = await response.text();
        return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
    };
    const login = async (id: string) => (await request('/api/demo/login', 'POST', { id })).data.token as string;
    return { service, store, now, request, login, url };
}
test('API requires authentication and gives security headers', async (t) => {
    const f = await fixture(t);
    const response = await f.request('/api/state');
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.equal((await f.request('/healthz')).status, 200);
});
test('demo role impersonation is limited to the explicitly listed local fixtures', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.request('/api/demo/login', 'POST', { id: 'admin' })).status, 400);
    const token = await f.login('student-alex');
    const s = await f.request('/api/state', 'GET', undefined, token);
    assert.equal(s.data.actor.id, 'student-alex');
    assert.equal(s.data.items.length, 10);
    assert.equal((await f.request('/api/vendors/bowl-lab/open', 'PATCH', { open: false }, token)).status, 403);
});
test('bad origins, host rebinding, invalid JSON content types and unknown routes fail closed', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.request('/api/config', 'GET', undefined, '', { Origin: 'https://evil.invalid' })).status, 403);
    const rebound = await new Promise<number>(resolve => { httpGet(f.url + '/api/config', { headers: { Host: 'evil.invalid' } }, response => { response.resume(); resolve(response.statusCode!); }); });
    assert.equal(rebound, 403);
    assert.equal((await f.request('/api/demo/login', 'POST', { id: 'student-alex' }, '', { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await f.request('/not-a-route')).status, 404);
});
test('vendor endpoint rejects another vendor even when the caller knows the identifier', async (t) => {
    const f = await fixture(t);
    const token = await f.login('vendor-noodle');
    assert.equal((await f.request('/api/vendors/bowl-lab/items/chicken-rice', 'PATCH', { stock: 99 }, token)).status, 403);
});
test('MCP initialises, lists exactly three scoped tools, and handles notifications', async (t) => {
    const f = await fixture(t);
    const headers = { Accept: 'application/json, text/event-stream' };
    const call = (method: string, params: unknown = {}, id: number | undefined = 1) => f.request('/mcp', 'POST', { jsonrpc: '2.0', method, params, ...(id !== undefined ? { id } : {}) }, AGENT_TOKEN, headers);
    const init = await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.status, 200);
    assert.equal(init.data.result.protocolVersion, '2025-11-25');
    assert.equal((await call('tools/list')).data.result.tools.length, 3);
    const notification = await f.request('/mcp', 'POST', { jsonrpc: '2.0', method: 'notifications/initialized' }, AGENT_TOKEN, headers);
    assert.equal(notification.status, 202);
    assert.equal((await call('not-a-method')).data.error.code, -32601);
    assert.equal((await f.request('/mcp', 'GET', undefined, AGENT_TOKEN, headers)).status, 405);
});
test('MCP rejects wrong credentials, scope overrides and missing required arguments', async (t) => {
    const f = await fixture(t);
    const msg = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_vendor_state', arguments: {} } };
    const headers = { Accept: 'application/json, text/event-stream' };
    assert.equal((await f.request('/mcp', 'POST', msg, 'wrong', headers)).status, 401);
    assert.equal((await f.request('/mcp', 'POST', msg, AGENT_TOKEN)).status, 406);
    const scoped = await f.request('/mcp', 'POST', { ...msg, params: { name: 'get_vendor_state', arguments: { vendorId: 'noodle-co' } } }, AGENT_TOKEN, headers);
    assert.equal(scoped.data.result.isError, true);
    const missing = await f.request('/mcp', 'POST', { ...msg, params: { name: 'evaluate_recovery_options', arguments: {} } }, AGENT_TOKEN, headers);
    assert.equal(missing.data.result.isError, true);
});
test('MCP read → evaluate → propose creates a real pending proposal, not an applied replacement', async (t) => {
    const f = await fixture(t);
    const actor = DEMO_IDENTITIES[0]!;
    const vendor = DEMO_IDENTITIES[2]!;
    const state = await f.store.read('bowl-lab');
    const first = state.slots[0]!;
    const nextClassAt = new Date(Date.parse(first.endAt) + 25 * 60000).toISOString();
    const order = await f.service.createOrder(actor, { vendorId: 'bowl-lab', slotId: first.id, items: [{ itemId: 'chicken-rice', quantity: 1 }], plan: { breakStartAt: new Date(f.now).toISOString(), nextClassAt, walkToMinutes: 0, returnMinutes: 5, eatMinutes: 12, bufferMinutes: 3, budgetSen: 1500 } }, 'http-mcp-test-key');
    await f.service.reportIncident(vendor, 'bowl-lab', { itemIds: ['chicken-rice'], delayMinutes: 15, reason: 'Unexpected preparation delay' });
    const call = async (name: string, args: unknown = {}) => (await f.request('/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, AGENT_TOKEN, { Accept: 'application/json, text/event-stream' })).data.result;
    const stateResult = await call('get_vendor_state');
    assert.equal(stateResult.isError, false);
    assert.ok(!stateResult.content[0].text.includes(order.pickupCode));
    const optionsResult = await call('evaluate_recovery_options', { orderId: order.id });
    const option = JSON.parse(optionsResult.content[0].text).options[0];
    assert.ok(option);
    const proposalResult = await call('create_recovery_proposal', { orderId: order.id, itemId: option.itemId, slotId: option.slotId, reason: 'Freshly evaluated option' });
    assert.equal(proposalResult.isError, false);
    assert.equal(JSON.parse(proposalResult.content[0].text).studentId, undefined);
    const after = await f.store.read('bowl-lab');
    assert.equal(after.proposals[0]!.status, 'pending_vendor');
    assert.equal(after.proposals[0]!.source, 'mcp');
    assert.equal(after.orders[0]!.lines[0]!.itemId, 'chicken-rice');
});
