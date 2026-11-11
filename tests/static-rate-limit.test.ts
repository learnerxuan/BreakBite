import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { copyFile, mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { settings } from '../src/server/config.js';
import { createApp } from '../src/server/http.js';
import { MealService } from '../src/server/domain.js';
import { MemoryStore } from '../src/server/store.js';

test('loading static menu assets cannot exhaust the API request allowance', async t => {
    await mkdir('dist-tests/src/public', { recursive: true });
    await copyFile('public/favicon.svg', 'dist-tests/src/public/favicon.svg');
    const server = createApp(settings({ AUTH_MODE: 'demo' }), new MealService(new MemoryStore()));
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (let i = 0; i < 310; i++) {
        const asset = await fetch(base + '/favicon.svg'); await asset.arrayBuffer();
        assert.equal(asset.status, 200);
    }
    assert.equal((await fetch(base + '/api/config')).status, 200);
    for (let i = 0; i < 299; i++) {
        const response = await fetch(base + '/api/config'); await response.arrayBuffer();
        assert.equal(response.status, 200);
    }
    assert.equal((await fetch(base + '/api/config')).status, 429);
});
