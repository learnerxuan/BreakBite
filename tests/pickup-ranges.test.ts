import test from 'node:test';
import assert from 'node:assert/strict';
import { bookableRanges } from '../src/web/views/personal.js';
import type { BookingLoad } from '../src/shared/features.js';

test('pickup ranges merge adjacent capacity but preserve full, closed and missing gaps', () => {
    const slot = (minute: number, level: BookingLoad['slots'][number]['level']) => ({id:String(minute),startAt:new Date(Date.UTC(2026,10,11,10,minute)).toISOString(),endAt:new Date(Date.UTC(2026,10,11,10,minute+5)).toISOString(),level,percent:0});
    const slots = [slot(0,'available'),slot(5,'filling'),slot(10,'full'),slot(15,'available'),slot(20,'closed'),slot(30,'available')];
    const before = structuredClone(slots);
    assert.deepEqual(bookableRanges([...slots].reverse()), [
        {startAt:slots[0]!.startAt,endAt:slots[1]!.endAt},
        {startAt:slots[3]!.startAt,endAt:slots[3]!.endAt},
        {startAt:slots[5]!.startAt,endAt:slots[5]!.endAt},
    ]);
    assert.deepEqual(slots,before);
    assert.deepEqual(bookableRanges([slot(0,'full'),slot(5,'closed')]),[]);
});
