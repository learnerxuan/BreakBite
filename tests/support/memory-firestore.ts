import { FirestoreConflict, type DocWrite, type DocumentStore } from '../../src/server/firestore-database.js';

/** In-memory stand-in for Firestore: atomic commits, exists/updateTime preconditions and small random delays
 * so concurrent calls interleave. Not a real Firestore project; see the live tests for that. */
export class MemoryFirestore implements DocumentStore {
    docs = new Map<string, { data: Record<string, unknown>; version: string }>();
    commits: DocWrite[][] = [];
    conflicts = 0;
    private clock = 0;
    private pause = () => new Promise(resolve => setTimeout(resolve, Math.random() * 3));
    async get(p: string) { await this.pause(); const d = this.docs.get(p); return d ? structuredClone(d) : null; }
    async list(collection: string) {
        await this.pause();
        const prefix = `${collection}/`;
        return [...this.docs].filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
            .map(([p, d]) => ({ id: p.slice(prefix.length), data: structuredClone(d.data) }));
    }
    async listDocumentIds(collection: string) {
        await this.pause();
        const prefix = `${collection}/`;
        return [...new Set([...this.docs.keys()].filter(p => p.startsWith(prefix))
            .map(p => p.slice(prefix.length).split('/')[0]!))];
    }
    async commit(writes: DocWrite[]) {
        await this.pause();
        for (const w of writes) {
            if (!('set' in w) || !w.precondition) continue;
            const current = this.docs.get(w.path);
            const ok = 'exists' in w.precondition ? !current : current?.version === w.precondition.updateTime;
            if (!ok) { this.conflicts++; throw new FirestoreConflict(); }
        }
        const version = `v${++this.clock}`;
        for (const w of writes) {
            if ('delete' in w) this.docs.delete(w.path);
            else this.docs.set(w.path, { data: structuredClone(w.set), version });
        }
        this.commits.push(writes);
        return writes.map(() => version);
    }
}
