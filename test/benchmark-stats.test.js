import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, summarizeRecords } from '../scripts/benchmark-stats.js';

test('benchmark statistics use numeric ordering, interpolated quartiles and sample dispersion', () => {
  const input = [4, 1, 3, 2];
  const s = summarize(input);
  assert.deepEqual(input, [4, 1, 3, 2]);
  assert.deepEqual({ ...s, sampleStdDev: null }, { n: 4, min: 1, median: 2.5, mean: 2.5, max: 4, iqr: 1.5, sampleStdDev: null });
  assert.ok(Math.abs(s.sampleStdDev-Math.sqrt(5/3)) < 1e-12);
  assert.equal(summarize([2, 10, 1]).median, 2);
  assert.deepEqual(summarize([0]), { n: 1, min: 0, median: 0, mean: 0, max: 0, iqr: 0, sampleStdDev: null });
  assert.equal(summarizeRecords([{ time: 2 }, { time: 4 }], 'time').mean, 3);
});

test('benchmark statistics reject missing, negative and nonfinite measurements', () => {
  for (const values of [[], [NaN], [Infinity], [-1], ['1']]) assert.throws(() => summarize(values));
  assert.throws(() => summarizeRecords([{}], 'time'));
});
