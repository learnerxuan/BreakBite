// Start a disposable local server with a synthetic APSpace source for browser_apspace.py.
import { mkdir, readdir } from 'node:fs/promises';
import { settings } from '../dist/server/config.js';
import { MealService } from '../dist/server/domain.js';
import { createApp } from '../dist/server/http.js';
import { LocalDatabase, LocalStore } from '../dist/server/local-database.js';
import { ProductService } from '../dist/server/product.js';
import { malaysiaDate } from '../dist/shared/timetable.js';

const config = settings();
if (!process.env.DATA_DIR || config.mode !== 'local' || config.host !== '127.0.0.1') {
    throw new Error('Set a new disposable DATA_DIR, AUTH_MODE=local and HOST=127.0.0.1.');
}
await mkdir(config.dataDir, { recursive: true });
if ((await readdir(config.dataDir)).length) throw new Error('The disposable directory must be empty.');
const db = new LocalDatabase(config.dataDir);
await db.open();
const service = new MealService(new LocalStore(db), Date.now, 'pay_at_pickup');
const now = Math.ceil(Date.now() / 300000) * 300000;
const minute = 60000;
const localMidnight = Date.parse(`${malaysiaDate(new Date(now).toISOString())}T00:00:00+08:00`);
const base = now - localMidnight < 22 * 60 * minute ? now : localMidnight + 24 * 60 * minute;
const stamp = minutes => new Date(base + minutes * minute).toISOString();
const event = (id, title, from, to) => ({
    id, uid: id, title, startAt: stamp(from), endAt: stamp(to), location: 'Example room', source: 'apspace',
});
let revision = 0;
const provider = {
    async get(force) {
        if (force) revision++;
        const events = [event('first', 'Earlier class', 0, 15),
            revision ? event('moved', 'Later class moved', 110, 130) : event('later', 'Later class', 85, 110)];
        const date = malaysiaDate(events[0].startAt);
        return {
            revision: String(revision), checkedAt: new Date().toISOString(),
            options: [{ intake: 'TEST-INTAKE', groups: ['G1', 'G2'] }],
            select() { return { events, firstDate: date, lastDate: date }; },
        };
    },
};
for (const id of ['asian-cuisine', 'bobanika']) {
    await service.openPickupWindows({ id: 'fixture', name: 'Fixture operator', role: 'vendor', vendorId: id }, id,
        { kitchenCapacity: 8, pickupCapacity: 4 });
}
const server = createApp(config, service, db, undefined, new ProductService(db, Date.now, provider));
server.listen(config.port, config.host, () => console.log(`APSpace fixture server on port ${config.port}`));
process.once('SIGINT', () => server.close(() => void db.close()));
