import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELD_MODULUS as p } from '../src/reference.js';
import { checkPoseidonSources } from '../scripts/check-poseidon.js';
import { loadCircuit, wire } from './support/r1cs.js';

const mod = (x) => ((x % p) + p) % p;
// Canonical coefficient vector of A*B-C, without polynomial rescaling. Rows
// match by cross multiplication against the first nonzero coefficient.
function polynomial([a, b, c]) {
  const terms = new Map();
  function add(i, j, value) {
    const key = i <= j ? `${i},${j}` : `${j},${i}`;
    terms.set(key, mod((terms.get(key) ?? 0n) + value));
  }
  for (const [i, x] of a) for (const [j, y] of b) add(i, j, x*y);
  for (const [i, x] of c) add(0, i, -x);
  return [...terms].filter(([, value]) => value !== 0n).sort(([a], [b]) => a.localeCompare(b));
}
function samePolynomial(a, b) {
  return a.length > 0 && a.length === b.length && a.every(([key, value], i) =>
    key === b[i][0] && mod(value*b[0][1] - b[i][1]*a[0][1]) === 0n);
}

test('every O0 inference row matches the paper relation and complete pinned Poseidon graph', async () => {
  checkPoseidonSources();
  const circuit = await loadCircuit('audit', 'inference');
  const constants = JSON.parse(readFileSync(new URL('../node_modules/circomlibjs/src/poseidon_constants_opt.json', import.meta.url)));
  const C = constants.C[5].map(BigInt), S = constants.S[5].map(BigInt);
  const M = constants.M[5].map((row) => row.map(BigInt)), P = constants.P[5].map((row) => row.map(BigInt));
  const expected = [];
  const index = (name) => name === '1' ? 0 : wire(circuit, name);
  const terms = (list) => list.map(([name, coefficient]) => [index(name), coefficient]);
  function assign(out, rhs) { expected.push([[], [], terms([[out, 1n], ...rhs.map(([name, c]) => [name, -c])])]); }
  const link = (out, input) => assign(out, [[input, 1n]]);
  function product(out, a, b) { expected.push([terms([[a, 1n]]), terms([[b, 1n]]), terms([[out, 1n]])]); }
  function boolean(name) { expected.push([terms([[name, 1n]]), terms([[name, 1n], ['1', -1n]]), []]); }
  function bits(prefix, n, input) {
    link(`${prefix}.in`, input);
    for (let j = 0; j < n; j++) boolean(`${prefix}.out[${j}]`);
    assign(`${prefix}.in`, Array.from({ length: n }, (_, j) => [`${prefix}.out[${j}]`, 1n << BigInt(j)]));
  }
  const cl = 'main.classifier';
  link(`${cl}.label`, 'main.label');
  for (let i = 0; i < 4; i++) {
    link(`${cl}.u[${i}]`, `main.u[${i}]`);
    bits(`${cl}.inputBits[${i}]`, 4, `${cl}.u[${i}]`);
    link(`main.hash.inputs[${i+1}]`, `main.u[${i}]`);
  }
  assign(`${cl}.score`, [[`${cl}.u[0]`, 3n], [`${cl}.u[1]`, -2n], [`${cl}.u[2]`, 1n], [`${cl}.u[3]`, 4n], ['1', -53n]]);
  assign(`${cl}.shiftedScore`, [[`${cl}.score`, 1n], ['1', 128n]]);
  bits(`${cl}.scoreBits`, 8, `${cl}.shiftedScore`);
  link(`${cl}.label`, `${cl}.scoreBits.out[7]`);
  boolean(`${cl}.label`);
  assign('main.hash.inputs[0]', [['1', 1n]]);
  link('main.hash.inputs[5]', 'main.salt');
  link('main.commitment', 'main.hash.out');
  assert.equal(expected.length, 50);

  // Explicit optimized width-7 schedule in docs/formal-correctness.md, H1.
  // Includes all component links, capacity, constants, S-box multiplication
  // intermediates, dense/sparse matrices, and the selected output coordinate.
  const h = 'main.hash.pEx';
  assign(`${h}.initialState`, []);
  for (let j = 0; j < 6; j++) link(`${h}.inputs[${j}]`, `main.hash.inputs[${j}]`);
  link('main.hash.out', `${h}.out[0]`);
  function ark(round, offset, inputs) {
    const prefix = `${h}.ark[${round}]`;
    return inputs.map((input, j) => {
      link(`${prefix}.in[${j}]`, input);
      assign(`${prefix}.out[${j}]`, [[`${prefix}.in[${j}]`, 1n], ['1', C[offset+j]]]);
      return `${prefix}.out[${j}]`;
    });
  }
  function sigma(prefix, input) {
    link(`${prefix}.in`, input);
    product(`${prefix}.in2`, `${prefix}.in`, `${prefix}.in`);
    product(`${prefix}.in4`, `${prefix}.in2`, `${prefix}.in2`);
    product(`${prefix}.out`, `${prefix}.in4`, `${prefix}.in`);
    return `${prefix}.out`;
  }
  function full(round, inputs) { return inputs.map((input, j) => sigma(`${h}.sigmaF[${round}][${j}]`, input)); }
  function mix(round, matrix, inputs) {
    const prefix = `${h}.mix[${round}]`;
    inputs.forEach((input, j) => link(`${prefix}.in[${j}]`, input));
    return inputs.map((_, i) => {
      assign(`${prefix}.out[${i}]`, inputs.map((_, j) => [`${prefix}.in[${j}]`, matrix[j][i]]));
      return `${prefix}.out[${i}]`;
    });
  }
  let state = ark(0, 0, [`${h}.initialState`, ...Array.from({ length: 6 }, (_, j) => `${h}.inputs[${j}]`)]);
  for (let r = 0; r < 3; r++) state = mix(r, M, ark(r+1, (r+1)*7, full(r, state)));
  state = mix(3, P, ark(4, 28, full(3, state)));
  for (let r = 0; r < 63; r++) {
    const prefix = `${h}.mixS[${r}]`;
    assign(`${prefix}.in[0]`, [[sigma(`${h}.sigmaP[${r}]`, state[0]), 1n], ['1', C[35+r]]]);
    for (let j = 1; j < 7; j++) link(`${prefix}.in[${j}]`, state[j]);
    assign(`${prefix}.out[0]`, state.map((_, j) => [`${prefix}.in[${j}]`, S[13*r+j]]));
    for (let j = 1; j < 7; j++) assign(`${prefix}.out[${j}]`, [[`${prefix}.in[${j}]`, 1n], [`${prefix}.in[0]`, S[13*r+6+j]]]);
    state = state.map((_, j) => `${prefix}.out[${j}]`);
  }
  for (let r = 0; r < 3; r++) state = mix(4+r, M, ark(5+r, 98+7*r, full(4+r, state)));
  state = full(7, state);
  state.forEach((input, j) => link(`${h}.mixLast[0].in[${j}]`, input));
  assign(`${h}.mixLast[0].out`, state.map((_, j) => [`${h}.mixLast[0].in[${j}]`, M[j][0]]));
  link(`${h}.out[0]`, `${h}.mixLast[0].out`);

  // A bijection of rows, not just containment or a matching row count. Extra,
  // omitted, duplicated, or changed equations must cause a mismatch.
  assert.equal(circuit.nConstraints, 1635);
  assert.equal(expected.length, circuit.nConstraints);
  const actual = circuit.constraints.map(polynomial);
  const matched = new Set();
  for (const row of expected) {
    const wanted = polynomial(row);
    const found = actual.findIndex((candidate, i) => !matched.has(i) && samePolynomial(candidate, wanted));
    assert.ok(found >= 0, `missing expected polynomial: ${JSON.stringify(wanted, (_, v) => typeof v === 'bigint' ? String(v) : v)}`);
    matched.add(found);
  }
  assert.equal(matched.size, circuit.nConstraints);
  // Check the comparison rejects changed coefficients and a zero row.
  assert.equal(samePolynomial([['0,1', 1n], ['0,2', 1n]], [['0,1', 1n], ['0,2', 2n]]), false);
  assert.equal(samePolynomial([], []), false);
});
