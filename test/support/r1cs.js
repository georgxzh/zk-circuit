import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readR1cs } from 'r1csfile';
import { root } from '../../scripts/compiler.js';
import { FIELD_MODULUS as p } from '../../src/reference.js';

const require = createRequire(import.meta.url);
const mod = (n) => ((n % p) + p) % p;

export async function loadCircuit(directory, name) {
  const folder = join(root, 'build', directory);
  const parsed = await readR1cs(join(folder, `${name}.r1cs`), { singleThread: true, loadMap: false });
  let constraints;
  try {
    assert.equal(parsed.prime, p);
    constraints = parsed.constraints.map((row) => row.map((lc) => Object.entries(lc)
      .map(([i, value]) => [Number(i), parsed.F.toObject(value)])));
  } finally { await parsed.curve?.terminate(); }
  const json = JSON.parse(readFileSync(join(folder, `${name}_constraints.json`)));
  assert.deepEqual(constraints, json.constraints.map((row) => row.map((lc) => Object.entries(lc)
    .map(([i, value]) => [Number(i), BigInt(value)]))), 'binary/JSON constraint disagreement');
  const symbols = new Map(readFileSync(join(folder, `${name}.sym`), 'utf8').trim().split(/\r?\n/).map((line) => {
    const [, witness, , signal] = line.split(',');
    return [signal, Number(witness)];
  }));
  const wc = await require(join(folder, `${name}_js`, 'witness_calculator.js'))(
    readFileSync(join(folder, `${name}_js`, `${name}.wasm`)));
  return {
    constraints, symbols, wc, nVars: parsed.nVars, nConstraints: parsed.nConstraints,
    nOutputs: parsed.nOutputs, nPubInputs: parsed.nPubInputs, nPrvInputs: parsed.nPrvInputs,
  };
}

export function wire(circuit, name) {
  const i = circuit.symbols.get(name);
  assert.ok(Number.isInteger(i) && i > 0, `missing or eliminated wire: ${name}`);
  return i;
}

export function violations(circuit, witness, omitted = new Set()) {
  assert.equal(witness.length, circuit.nVars, 'wrong witness length');
  assert.equal(witness[0], 1n, 'constant wire must be one');
  assert.ok(witness.every((v) => typeof v === 'bigint' && v >= 0n && v < p), 'noncanonical witness');
  const lc = (terms) => terms.reduce((sum, [i, c]) => sum + witness[i] * c, 0n) % p;
  const failed = [];
  for (let i = 0; i < circuit.constraints.length; i++) {
    if (omitted.has(i)) continue;
    const [a, b, c] = circuit.constraints[i];
    if (mod(lc(a) * lc(b) - lc(c)) !== 0n) failed.push(i);
  }
  return failed;
}

function polynomial(row) {
  const terms = new Map();
  const add = (i, j, value) => {
    const key = [i, j].sort((a, b) => a - b).join(',');
    terms.set(key, mod((terms.get(key) ?? 0n) + value));
  };
  const [a, b, c] = row;
  for (const [i, x] of a) for (const [j, y] of b) add(i, j, x*y);
  for (const [i, x] of c) add(0, i, -x);
  return [...terms].filter(([, value]) => value !== 0n).sort(([a], [b]) => a.localeCompare(b));
}

// Locate a required equation up to a nonzero field scalar, independently of
// whether Circom places it in A, B, or C. Used to audit actual emitted rows.
export function equationFinder(circuit) {
  const rows = circuit.constraints.map(polynomial);
  return function find(terms) {
    const expected = polynomial([[], [], terms.map(([i, c]) => [i, -c])]);
    const index = rows.findIndex((row) => row.length === expected.length
      && row.every(([key, value], j) => key === expected[j][0]
        && mod(value * expected[0][1] - expected[j][1] * row[0][1]) === 0n));
    assert.ok(index >= 0, `missing linear constraint: ${JSON.stringify(terms, (_, v) => typeof v === 'bigint' ? String(v) : v)}`);
    return index;
  };
}

export function assertBooleanConstraint(circuit, i) {
  const expected = polynomial([[[i, 1n]], [[i, 1n], [0, -1n]], []]);
  const index = circuit.constraints.map(polynomial).findIndex((row) => row.length === expected.length
    && row.every(([key, value], j) => key === expected[j][0]
      && mod(value * expected[0][1] - expected[j][1] * row[0][1]) === 0n));
  assert.ok(index >= 0, `missing Boolean constraint for wire ${i}`);
  return index;
}
