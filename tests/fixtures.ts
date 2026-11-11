import type { LocalDatabase } from '../src/server/local-database.js';
import { seedVendor } from '../src/server/seed.js';

/** Historical kitchens are explicit fixtures, never part of the fresh product catalogue. */
export async function addLegacyTestKitchens(db: LocalDatabase): Promise<void> {
    await db.transaction(d => {
        for (const id of ['bowl-lab', 'noodle-co']) d.vendors[id] ??= seedVendor(id);
    });
}
