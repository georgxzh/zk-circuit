import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPoseidonOpt } from 'circomlibjs';
import { commitInput, publicStatement, checkOpening, randomSalt } from '../src/commitment.js';
import { sampleFieldFrom } from '../src/random.js';
import { FIELD_MODULUS as p, encodeInput } from '../src/reference.js';
import { checkPoseidonSources } from '../scripts/check-poseidon.js';

const vectors = JSON.parse(readFileSync(new URL('../spec/commitment-vectors.json', import.meta.url))).vectors;
const acceptance = JSON.parse(readFileSync(new URL('../spec/acceptance-cases.json', import.meta.url)));

test('installed Poseidon sources and all optimized width-7 constants match the pinned Circom revision', () => {
  checkPoseidonSources();
});

test('fixed public synthetic vectors agree with both reference and optimized Poseidon', async () => {
  const opt = await buildPoseidonOpt();
  for (const v of vectors) {
    const salt = BigInt(v.salt);
    assert.equal(await commitInput(v.x, salt), BigInt(v.commitment), v.id);
    assert.equal(opt.F.toObject(opt([1n, ...encodeInput(v.x), salt], 0n, 1)), BigInt(v.commitment), v.id);
    assert.deepEqual(await publicStatement(v.x, salt), [v.commitment, v.label]);
    assert.equal(await checkOpening(v.x, salt, [v.commitment, v.label]), true);
  }
});

test('deterministic spread of field salts and inputs agrees across the two implementations', async () => {
  const opt = await buildPoseidonOpt();
  for (let i = 0n; i < 32n; i++) {
    const x = [i%16n-8n, (i*3n+1n)%16n-8n, (i*7n+2n)%16n-8n, (i*11n+3n)%16n-8n];
    const salt = p * i / 32n;
    assert.equal(await commitInput(x, salt), opt.F.toObject(opt([1n, ...encodeInput(x), salt], 0n, 1)));
  }
});

test('commitment binds feature order, domain, offset encoding, and salt in regression examples', async () => {
  const v = vectors[0];
  const opt = await buildPoseidonOpt();
  const u = encodeInput(v.x);
  const expected = BigInt(v.commitment);
  assert.notEqual(await commitInput([0, 1, 0, 1], BigInt(v.salt)), expected);
  assert.notEqual(await commitInput(v.x, BigInt(v.salt)+1n), expected);
  assert.notEqual(opt.F.toObject(opt([2n, ...u, BigInt(v.salt)])), expected);
  assert.notEqual(opt.F.toObject(opt([1n, ...v.x.map(BigInt), BigInt(v.salt)])), expected);
});

test('all opening-related rejection fixtures are exercised locally', async () => {
  const byId = Object.fromEntries(vectors.map((v) => [v.id, v]));
  for (const id of ['wrong-label', 'wrong-zero-label', 'non-boolean-label', 'wrong-commitment']) {
    const fixture = acceptance.invalid.find((v) => v.id === id);
    const base = byId[fixture.base];
    const signals = [base.commitment, base.label];
    if (fixture.public_label !== undefined) signals[1] = String(fixture.public_label);
    else signals[0] = String((BigInt(signals[0])+1n)%p);
    if (id === 'non-boolean-label') {
      await assert.rejects(checkOpening(base.x, BigInt(base.salt), signals), RangeError);
    } else assert.equal(await checkOpening(base.x, BigInt(base.salt), signals), false, id);
  }
  const mismatch = acceptance.invalid.find((v) => v.id === 'different-classified-input');
  const committed = byId[mismatch.commitment_base];
  const classified = byId[mismatch.classification_base];
  assert.equal(await checkOpening(classified.x, BigInt(committed.salt), [committed.commitment, classified.label]), false);
  assert.equal(await checkOpening(committed.x, BigInt(committed.salt)+1n, [committed.commitment, committed.label]), false);
});

test('commitment APIs reject invalid inputs and salt aliases before hashing', async () => {
  for (const salt of [-1n, p, p+1n, '0', 0, undefined]) {
    await assert.rejects(commitInput([0, 0, 0, 0], salt));
  }
  for (const x of [[8, 0, 0, 0], [-9, 0, 0, 0], new Array(4), ['0', 0, 0, 0]]) {
    await assert.rejects(commitInput(x, 0n));
  }
});

test('statement snapshots caller inputs before awaiting hash initialization', async () => {
  const v = vectors[0];
  const x = [...v.x];
  const pending = publicStatement(x, BigInt(v.salt));
  x.fill(-8);
  assert.deepEqual(await pending, [v.commitment, v.label]);
});

test('rejection sampling discards p and maximum bytes; accepts zero and p-1 in big-endian order', () => {
  const bytes = (v) => Buffer.from(v.toString(16).padStart(64, '0'), 'hex');
  const draws = [bytes(p), Buffer.alloc(32, 255), bytes(p-1n)];
  let calls = 0;
  assert.equal(sampleFieldFrom((size) => { assert.equal(size, 32); calls++; return draws.shift(); }), p-1n);
  assert.equal(calls, 3);
  assert.equal(sampleFieldFrom(() => Buffer.alloc(32)), 0n);
  assert.equal(sampleFieldFrom(() => bytes(1n)), 1n);
  assert.throws(() => sampleFieldFrom(() => Buffer.alloc(31)), TypeError);
  assert.throws(() => sampleFieldFrom(() => 'not random bytes'), TypeError);
  assert.throws(() => sampleFieldFrom(() => { throw new Error('entropy unavailable'); }), /entropy unavailable/);
  for (let i = 0; i < 8; i++) { const salt = randomSalt(); assert.ok(salt >= 0n && salt < p); }
});
