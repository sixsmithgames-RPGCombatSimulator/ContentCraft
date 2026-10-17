import { expect, it } from 'vitest';
import { normalizeGameClock } from './gmcV1.js';

it('clock normalization preserves the API typed and freeform forms without mutating prior state', () => {
  const previous = { calendar: 'campaign', day: 1, hour: 9, minute: 0, notes: '' }, before = structuredClone(previous);
  expect(normalizeGameClock({ gameClock: { day: 1, hour: 9, minute: 0, second: 6, elapsedSeconds: 32406 } }, previous))
    .toMatchObject({ day: 1, hour: 9, minute: 0, second: 6, elapsedSeconds: 32406 });
  expect(normalizeGameClock('Day 2 10:20 pm', previous)).toMatchObject({ day: 2, hour: 22, minute: 20, second: 0 });
  expect(normalizeGameClock({ gameClock: { hour: 99, minute: -1, second: 80 } }, previous))
    .toMatchObject({ hour: 23, minute: 0, second: 59 });
  expect(previous).toEqual(before);
});
