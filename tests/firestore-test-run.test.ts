import test from 'node:test';
import assert from 'node:assert/strict';
import { suiteRootPrefix } from './support/test-database.js';

test('Firestore suite cleanup prefixes isolate concurrent runs and exclude production or legacy roots', () => {
    const mine = suiteRootPrefix('0123456789abcdef01234567');
    const other = suiteRootPrefix('fedcba9876543210fedcba98');
    const roots = [`${mine}one`, `${mine}two`, `${other}one`, 'envs/production', 'envs/suite-old-fixture'];
    assert.deepEqual(roots.filter(root => root.startsWith(mine)), [`${mine}one`, `${mine}two`]);
    assert.equal(mine, 'envs/suite-0123456789abcdef01234567-');
});

test('Firestore suite run IDs reject broad prefixes, path injection and malformed tokens', () => {
    for (const unsafe of ['', 'suite-', '0123', '../production', '0'.repeat(24) + '/orders', 'A'.repeat(24), '0'.repeat(25)]) {
        assert.throws(() => suiteRootPrefix(unsafe), /24-character lowercase hexadecimal/);
    }
});
