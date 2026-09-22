import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { circuitInput, parseCircuitInput } from '../src/circuit-input.js';
import { classify, encodeInput, FIELD_MODULUS as p, toField } from '../src/reference.js';
import { publicStatement } from '../src/commitment.js';
import { loadCircuit, wire, violations, equationFinder, assertBooleanConstraint } from './support/r1cs.js';

const vectors = JSON.parse(readFileSync(new URL('../spec/commitment-vectors.json', import.meta.url))).vectors;
let production, audit, arithmetic, hash;
before(async () => {
  production = await loadCircuit('inference', 'inference');
  audit = await loadCircuit('audit', 'inference');
  arithmetic = await loadCircuit('arithmetic', 'arithmetic');
  hash = await loadCircuit('hash', 'hash');
});

function projectToProduction(witness) {
  const result = new Array(production.nVars).fill(null);
  result[0] = 1n;
  for (const [name, index] of production.symbols) {
    if (index < 0) continue;
    const value = witness[wire(audit, name)];
    if (result[index] !== null) assert.equal(result[index], value);
    result[index] = value;
  }
  assert.ok(result.every((v) => v !== null));
  return result;
}

// Deliberately avoids both input validation and the full witness generator.
// Hash intermediates come from a hash-only WASM harness; arithmetic wires are
// constructed directly so malformed assignments reach the R1CS evaluator.
async function candidate(u, options = {}) {
  const salt = options.salt ?? 0n;
  const domain = options.domain ?? 1n;
  const classifierU = options.classifierU ?? u;
  const score = toField(options.score ?? (3n*classifierU[0]-2n*classifierU[1]+classifierU[2]+4n*classifierU[3]-53n));
  const shifted = toField(score+128n);
  const label = options.label ?? ((shifted >> 7n) & 1n);
  const hw = await hash.wc.calculateWitness({ inputs: [domain, ...u, salt].map(String) }, true);
  assert.deepEqual(violations(hash, hw), []);
  const witness = new Array(audit.nVars).fill(null);
  witness[0] = 1n;
  const set = (name, value) => { witness[wire(audit, name)] = value; };
  for (const [name, index] of hash.symbols) set(name.replace(/^main\./, 'main.hash.'), hw[index]);
  set('main.commitment', options.commitment ?? hw[wire(hash, 'main.out')]);
  set('main.label', label);
  set('main.salt', salt);
  set('main.classifier.label', label);
  set('main.classifier.score', score);
  set('main.classifier.shiftedScore', shifted);
  for (let i = 0; i < 4; i++) {
    set(`main.u[${i}]`, u[i]);
    set(`main.classifier.u[${i}]`, classifierU[i]);
    set(`main.classifier.inputBits[${i}].in`, classifierU[i]);
    for (let j = 0; j < 4; j++) set(`main.classifier.inputBits[${i}].out[${j}]`, (classifierU[i] >> BigInt(j)) & 1n);
  }
  set('main.classifier.scoreBits.in', shifted);
  for (let j = 0; j < 8; j++) set(`main.classifier.scoreBits.out[${j}]`, (shifted >> BigInt(j)) & 1n);
  assert.ok(witness.every((v) => v !== null), 'candidate must populate every wire');
  return witness;
}

function rejected(witness) {
  assert.ok(violations(audit, witness).length > 0, 'unoptimized constraints accepted invalid assignment');
  assert.ok(violations(production, projectToProduction(witness)).length > 0, 'optimized constraints accepted invalid assignment');
}

function auditedRows() {
  const index = (name) => wire(audit, name);
  const find = equationFinder(audit);
  const eq = (terms) => find(terms.map(([name, coefficient]) => [name === '1' ? 0 : index(name), coefficient]));
  const links = [], ranges = [], bits = [];
  eq([['main.label', 1n], ['main.classifier.label', -1n]]);
  for (let i = 0; i < 4; i++) {
    links.push(eq([[`main.classifier.u[${i}]`, 1n], [`main.u[${i}]`, -1n]]));
    eq([[`main.hash.inputs[${i+1}]`, 1n], [`main.u[${i}]`, -1n]]);
    eq([[`main.classifier.inputBits[${i}].in`, 1n], [`main.classifier.u[${i}]`, -1n]]);
    ranges.push(eq([
      [`main.classifier.inputBits[${i}].in`, -1n],
      ...Array.from({ length: 4 }, (_, j) => [`main.classifier.inputBits[${i}].out[${j}]`, 1n << BigInt(j)]),
    ]));
    for (let j = 0; j < 4; j++) bits.push(assertBooleanConstraint(audit, index(`main.classifier.inputBits[${i}].out[${j}]`)));
  }
  eq([['main.hash.inputs[5]', 1n], ['main.salt', -1n]]);
  const domain = eq([['main.hash.inputs[0]', 1n], ['1', -1n]]);
  const score = eq([
    ['main.classifier.score', 1n], ['main.classifier.u[0]', -3n], ['main.classifier.u[1]', 2n],
    ['main.classifier.u[2]', -1n], ['main.classifier.u[3]', -4n], ['1', 53n],
  ]);
  eq([['main.classifier.shiftedScore', 1n], ['main.classifier.score', -1n], ['1', -128n]]);
  eq([['main.classifier.scoreBits.in', 1n], ['main.classifier.shiftedScore', -1n]]);
  eq([
    ['main.classifier.scoreBits.in', -1n],
    ...Array.from({ length: 8 }, (_, j) => [`main.classifier.scoreBits.out[${j}]`, 1n << BigInt(j)]),
  ]);
  for (let j = 0; j < 8; j++) bits.push(assertBooleanConstraint(audit, index(`main.classifier.scoreBits.out[${j}]`)));
  assertBooleanConstraint(audit, index('main.classifier.label'));
  const threshold = eq([['main.classifier.label', 1n], ['main.classifier.scoreBits.out[7]', -1n]]);
  const commitment = eq([['main.commitment', 1n], ['main.hash.out', -1n]]);
  return { links, ranges, bits, domain, score, threshold, commitment };
}

test('compiled public interface, field, and critical equations match the specification', () => {
  for (const circuit of [production, audit]) {
    assert.equal(circuit.nPubInputs, 2);
    assert.equal(circuit.nPrvInputs, 5);
    assert.equal(circuit.nOutputs, 0);
    assert.equal(wire(circuit, 'main.commitment'), 1);
    assert.equal(wire(circuit, 'main.label'), 2);
  }
  const rows = auditedRows();
  assert.equal(rows.bits.length, 24);
  assert.equal(new Set(rows.bits).size, 24);
});

test('all nine commitment fixtures satisfy optimized and unoptimized binary constraints', async () => {
  for (const v of vectors) {
    const input = circuitInput(v.x, BigInt(v.salt), [v.commitment, v.label]);
    for (const circuit of [production, audit]) {
      const witness = await circuit.wc.calculateWitness(input, true);
      assert.deepEqual(violations(circuit, witness), [], v.id);
      assert.deepEqual(witness.slice(1, 3).map(String), [v.commitment, v.label]);
      assert.equal(witness[wire(circuit, 'main.classifier.score')], toField(classify(v.x).score));
    }
  }
  // Check the adversarial constructor itself against the official witness generator.
  const v = vectors[0];
  const official = await audit.wc.calculateWitness(circuitInput(v.x, BigInt(v.salt), [v.commitment, v.label]), true);
  assert.deepEqual(await candidate(encodeInput(v.x), { salt: BigInt(v.salt) }), official);
});

test('compiled arithmetic template matches the reference on all 65,536 inputs', { timeout: 120000 }, async () => {
  let count = 0, zero = 0;
  for (let a = -8; a <= 7; a++) for (let b = -8; b <= 7; b++) {
    for (let c = -8; c <= 7; c++) for (let d = -8; d <= 7; d++) {
      const x = [a, b, c, d];
      const expected = classify(x);
      const witness = await arithmetic.wc.calculateWitness({ label: String(expected.label), u: encodeInput(x).map(String) }, true);
      assert.deepEqual(violations(arithmetic, witness), []);
      assert.equal(witness[wire(arithmetic, 'main.score')], toField(expected.score));
      assert.equal(witness[wire(arithmetic, 'main.shiftedScore')], expected.score+128n);
      assert.equal(witness[wire(arithmetic, 'main.scoreBits.out[7]')], expected.label);
      count++;
      if (expected.score === 0n) zero++;
    }
  }
  assert.equal(count, 65536);
  assert.equal(zero, 930);
});

test('full optimized circuit covers all corners and 64 additional input/salt combinations', async () => {
  const samples = [];
  for (let mask = 0; mask < 16; mask++) samples.push(Array.from({ length: 4 }, (_, i) => mask & (1 << i) ? 7 : -8));
  for (let i = 0; i < 64; i++) samples.push([i%16-8, Math.floor(i/4)%16-8, (i*7+3)%16-8, (i*11+5)%16-8]);
  for (const [i, x] of samples.entries()) {
    const salt = (p-1n)*BigInt(i)/BigInt(samples.length-1);
    const signals = await publicStatement(x, salt);
    const witness = await production.wc.calculateWitness(circuitInput(x, salt, signals), true);
    assert.deepEqual(violations(production, witness), []);
    assert.deepEqual(witness.slice(1, 3).map(String), signals);
  }
});

test('raw R1CS rejects out-of-range coordinates in every position', async () => {
  for (let i = 0; i < 4; i++) for (const bad of [16n, p-1n]) {
    const u = [8n, 8n, 8n, 8n];
    u[i] = bad;
    rejected(await candidate(u));
  }
});

test('raw R1CS rejects incorrect labels, non-Boolean labels, and changed commitments', async () => {
  for (const id of ['positive', 'negative', 'zero']) {
    const v = vectors.find((v) => v.id === id);
    rejected(await candidate(encodeInput(v.x), { label: 1n-BigInt(v.label) }));
  }
  rejected(await candidate([8n, 8n, 8n, 8n], { label: 2n }));
  const v = vectors[0];
  rejected(await candidate(encodeInput(v.x), { salt: BigInt(v.salt), commitment: (BigInt(v.commitment)+1n)%p }));
});

test('R1CS mutation checks detect missing range, threshold, score, domain, and commitment equations', async () => {
  const rows = auditedRows();
  const mutations = [
    [await candidate([16n, 8n, 8n, 8n]), rows.ranges[0]],
    [await candidate(encodeInput([1, 1, 0, 1]), { label: 0n }), rows.threshold],
    [await candidate([8n, 8n, 8n, 8n], { score: 1n }), rows.score],
    [await candidate([8n, 8n, 8n, 8n], { domain: 2n }), rows.domain],
    [await candidate(encodeInput(vectors[0].x), { commitment: (BigInt(vectors[0].commitment)+1n)%p }), rows.commitment],
  ];
  for (const [witness, omitted] of mutations) {
    rejected(witness);
    assert.deepEqual(violations(audit, witness, new Set([omitted])), [], 'targeted omission should admit counterexample');
  }
});

test('shared-input wiring rejects independently committed and classified vectors', async () => {
  const witness = await candidate(encodeInput([1, 0, 0, 1]), { classifierU: encodeInput([0, 0, 0, 0]), label: 0n });
  rejected(witness);
  assert.deepEqual(violations(audit, witness, new Set(auditedRows().links)), []);
});

test('Boolean constraints reject field-valued bits even when recomposition is unchanged', async () => {
  for (const [x, prefix] of [
    [[-6, 0, 0, 0], 'main.classifier.inputBits[0]'],
    [[1, 0, 0, 1], 'main.classifier.scoreBits'],
  ]) {
    const witness = await candidate(encodeInput(x));
    const bit0 = wire(audit, `${prefix}.out[0]`);
    const bit1 = wire(audit, `${prefix}.out[1]`);
    assert.equal(witness[bit0], 0n);
    assert.equal(witness[bit1], 1n);
    witness[bit0] = 2n;
    witness[bit1] = 0n;
    rejected(witness);
    const row = assertBooleanConstraint(audit, bit0);
    assert.deepEqual(violations(audit, witness, new Set([row])), []);
  }
});

test('normal witness generation refuses wrong claims and invalid private inputs', async () => {
  const v = vectors[0];
  const input = circuitInput(v.x, BigInt(v.salt), [v.commitment, v.label]);
  for (const invalid of [
    { ...input, label: '0' }, { ...input, label: '2' }, { ...input, commitment: String((BigInt(v.commitment)+1n)%p) },
    { ...input, u: ['16', '8', '8', '8'] }, { ...input, u: [String(p-1n), '8', '8', '8'] },
  ]) await assert.rejects(production.wc.calculateWitness(invalid, true), /Assert Failed/);
});

test('circuit input adapter preserves the expected statement and rejects field aliases', () => {
  const v = vectors[0];
  const input = circuitInput(v.x, BigInt(v.salt), [v.commitment, '0']);
  assert.equal(input.label, '0', 'adapter must not replace the claimed label');
  assert.deepEqual(parseCircuitInput(input), input);
  for (const bad of [
    { ...input, salt: String(p) }, { ...input, commitment: String(p) },
    { ...input, u: [String(p+9n), '8', '8', '9'] }, { ...input, u: ['16', '8', '8', '9'] },
    { ...input, label: '2' }, { ...input, salt: '-0' }, { ...input, salt: '00' },
    { ...input, u: [9, 8, 8, 9] }, { ...input, u: new Array(4) }, { ...input, extra: '0' },
  ]) assert.throws(() => parseCircuitInput(bad));
});
