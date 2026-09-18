import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MODEL, FIELD_MODULUS as p, classify, encodeInput, decodeInput, decodeScore,
  toField, parseField, fieldElement, parsePublicSignals, quantize, quantizeInput,
} from '../src/reference.js';

const cases = JSON.parse(readFileSync(new URL('../spec/acceptance-cases.json', import.meta.url)));

test('fixed model and encodings match the version-1 specification', () => {
  assert.deepEqual(MODEL.weights, [3, -2, 1, 4]);
  assert.equal(MODEL.bias, -5);
  assert.equal(MODEL.dimension, 4);
  assert.equal(MODEL.input_min, -8);
  assert.equal(MODEL.input_max, 7);
  assert.deepEqual(MODEL.input_encoding, { kind: 'offset_binary', offset: 8, bits: 4 });
  assert.deepEqual(MODEL.score_encoding, { kind: 'offset_binary', offset: 128, bits: 8 });
  assert.deepEqual(MODEL.classification, { threshold: 0, comparison: '>=', zero_label: 1 });
  assert.deepEqual(MODEL.public_signal_order, ['commitment', 'label']);
  assert.equal(p, 21888242871839275222246405745257275088548364400416034343698204186575808495617n);
  assert.throws(() => { MODEL.weights[0] = 0; }, TypeError);
});

test('all classifier fixtures, without mutating input arrays', () => {
  for (const v of cases.valid) {
    const input = Object.freeze([...v.x]);
    assert.deepEqual(classify(input), { score: BigInt(v.score), label: BigInt(v.label) }, v.id);
    assert.deepEqual(classify(input.map(BigInt)), classify(input));
  }
});

test('exhaustive domain: integer oracle, decoding, field lifting, and threshold', () => {
  let count = 0, zeros = 0, min = Infinity, max = -Infinity;
  const encodings = new Set();
  for (let a = -8; a <= 7; a++) for (let b = -8; b <= 7; b++) {
    for (let c = -8; c <= 7; c++) for (let d = -8; d <= 7; d++) {
      const x = [a, b, c, d];
      // Independent small-integer expression; all values are exactly representable.
      const expected = 3*a - 2*b + c + 4*d - 5;
      const actual = classify(x);
      assert.equal(actual.score, BigInt(expected));
      assert.equal(actual.label, expected < 0 ? 0n : 1n);
      const u = encodeInput(x);
      assert.deepEqual(decodeInput(u), x.map(BigInt));
      assert.ok(u.every((v) => v >= 0n && v < 16n));
      encodings.add(u.join(','));
      // Independent field equation in encoded coordinates: S = 3u0 - 2u1 + u2 + 4u3 - 53.
      const S = toField(3n*u[0] - 2n*u[1] + u[2] + 4n*u[3] - 53n);
      assert.equal(decodeScore(S), actual.score);
      const T = (S + 128n) % p;
      assert.equal(T, BigInt(expected + 128));
      assert.ok(T >= 45n && T <= 195n);
      assert.equal(T >> 7n, actual.label);
      count++;
      if (expected === 0) { zeros++; assert.equal(actual.label, 1n); }
      min = Math.min(min, expected);
      max = Math.max(max, expected);
    }
  }
  assert.equal(count, 65536);
  assert.equal(encodings.size, count);
  assert.equal(zeros, 930);
  assert.deepEqual({ min, max }, MODEL.score_bounds);
  assert.deepEqual({ min: min+128, max: max+128 }, MODEL.shifted_score_bounds);
});

test('integer APIs reject invalid types, dimensions, holes, and out-of-range coordinates', () => {
  for (const v of cases.invalid.filter((v) => Object.hasOwn(v, 'x'))) assert.throws(() => classify(v.x), v.id);
  for (const bad of [NaN, Infinity, -Infinity, 0.1, '0', true, null, undefined, {}, [], 9007199254740992]) {
    assert.throws(() => classify([bad, 0, 0, 0]));
  }
  for (const bad of [null, {}, '0000', [0, 0, 0, 0, 0], new Array(4)]) {
    assert.throws(() => classify(bad));
    assert.throws(() => decodeInput(bad));
  }
  for (const value of [-9n, 8n, p-1n, 10n**100n]) {
    assert.throws(() => encodeInput([value, 0, 0, 0]), RangeError);
  }
  for (const value of [-1n, 16n, p-1n, p]) assert.throws(() => decodeInput([value, 0, 0, 0]), RangeError);
});

test('canonical field parsing rejects modular aliases and alternative spellings', () => {
  for (const value of [0n, 1n, p-1n]) assert.equal(parseField(String(value)), value);
  for (const value of ['', '00', '01', '-0', '-1', '+1', ' 1', '1 ', '1\n', '1\r\n', '0x1', '1e0', '1.0', 'NaN', 'Infinity', 1, 1n, null, true]) {
    assert.throws(() => parseField(value));
  }
  for (const value of [p, p+1n]) assert.throws(() => parseField(String(value)), RangeError);
  assert.throws(() => fieldElement(-1n), RangeError);
  assert.throws(() => fieldElement('1'), TypeError);
  assert.equal(toField(-1), p-1n);
  assert.equal(toField(p+1n), 1n);
  assert.throws(() => toField(0.5), TypeError);
});

test('score decoding accepts only the two allowed residue intervals', () => {
  for (let s = -83n; s <= 67n; s++) assert.equal(decodeScore(toField(s)), s);
  for (const bad of [68n, p-84n, p/2n, p, -1n]) assert.throws(() => decodeScore(bad), RangeError);
});

test('public signal parser checks arity, canonical text, and Boolean label', () => {
  assert.deepEqual(parsePublicSignals(['5', '1']), { commitment: 5n, label: 1n });
  for (const bad of [[], ['0'], ['0', '0', '0'], ['0', '2'], ['0', '-1'], ['00', '1'], [String(p), '0'], [0, 1], new Array(2)]) {
    assert.throws(() => parsePublicSignals(bad));
  }
});

test('exact rational quantization fixtures and model parameters', () => {
  for (const v of cases.quantization) {
    assert.equal(quantize(v.value, v.scale), BigInt(v.quantized), v.value);
    if (v.expected) assert.throws(() => quantizeInput([v.value, '0', '0', '0']), RangeError);
    else assert.equal(quantizeInput([v.value, '0', '0', '0'])[0], BigInt(v.quantized));
  }
  assert.deepEqual(['3/4', '-1/2', '1/4', '1'].map((v) => quantize(v, 4)), MODEL.weights.map(BigInt));
  assert.equal(quantize('-5/16', 16), BigInt(MODEL.bias));
  assert.equal(quantize('-0.375'), -1n);
  assert.equal(quantize('0.124999999999999999999999999999999999'), 0n);
  assert.equal(quantize('0.125000000000000000000000000000000000'), 1n);
  assert.equal(quantize('-0.125000000000000000000000000000000001'), -1n);
  assert.throws(() => quantizeInput(['-2.12500000000000000000000000001', '0', '0', '0']), RangeError);
  assert.equal(quantizeInput(['1.87499999999999999999999999999', '0', '0', '0'])[0], 7n);
});

test('quantization satisfies its defining interval for signed rational samples', () => {
  for (let numerator = -200n; numerator <= 200n; numerator++) {
    for (let denominator = 1n; denominator <= 25n; denominator++) {
      for (const k of [1n, 4n, 16n]) {
        const q = quantize(`${numerator}/${denominator}`, k);
        // q <= k*z + 1/2 < q+1; avoids using division as an oracle.
        const a = 2n*k*numerator + denominator;
        assert.ok(2n*denominator*q <= a && a < 2n*denominator*(q+1n));
      }
    }
  }
});

test('quantizer rejects ambiguous/malformed syntax and invalid scale', () => {
  for (const value of [0.125, 1n, true, null, '', 'NaN', 'Infinity', '1/0', '1/-2', '1//2', '+1', '01', '.5', '1.', '1e2', ' 1', '1\n', '1/2\n']) {
    assert.throws(() => quantize(value));
  }
  for (const scale of [0, -1, 0.5, '4', true]) assert.throws(() => quantize('1/8', scale));
  for (const values of [[], ['0'], new Array(4), ['0', '0', '0', 0]]) assert.throws(() => quantizeInput(values));
});
