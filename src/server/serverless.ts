import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRuntime } from './runtime.js';
let runtime: ReturnType<typeof createRuntime> | undefined;
/** Reuse successful initialization, but let a later request recover from a temporary outage. */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        if (!runtime) runtime = createRuntime().catch(error => { runtime = undefined; throw error; });
        await (await runtime).handler(req, res);
    } catch {
        console.error('BreakBite startup unavailable. Check hosting configuration and Firestore access.');
        res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(JSON.stringify({ error: { code: 'STARTUP_UNAVAILABLE', message: 'BreakBite is temporarily unavailable. Please retry shortly.' } }));
    }
}
