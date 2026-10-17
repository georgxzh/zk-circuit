// Test-only raw assignments. Bypasses the WASM generator, its sanity checks,
// application parsing, and production curve arithmetic.
import assert from 'node:assert/strict';
import { GENERATORS, SUBGROUP_ORDER } from '../../src/pedersen-parameters.js';
import { add, O, mod } from './pedersen-oracle.js';
import { wire } from './r1cs.js';

export function assignment(circuit, u, r, options = {}) {
  u = u.map(BigInt);
  r = mod(BigInt(r));
  const witness = Array(circuit.nVars).fill(undefined);
  witness[0] = 1n;
  const set = (name, value) => { witness[wire(circuit, 'main.' + name)] = mod(value); };
  const pair = (name, point) => point.forEach((v,i) => set(name + '[' + i + ']', v));
  function bits(name, input, n) {
    input = mod(input);
    set(name + '.in', input);
    const values = Array.from({ length: n }, (_,j) => (input >> BigInt(j)) & 1n);
    values.forEach((v,j) => set(name + '.out[' + j + ']', v));
    return values;
  }
  function adder(name, P, Q) {
    const [x,y] = P, [v,w] = Q;
    set(name + '.x1', x); set(name + '.y1', y);
    set(name + '.x2', v); set(name + '.y2', w);
    set(name + '.beta', x*w); set(name + '.gamma', y*v);
    set(name + '.delta', (-168700n*x+y)*(v+w));
    set(name + '.tau', x*w*y*v);
    const result = add(P,Q);
    set(name + '.xout', result[0]); set(name + '.yout', result[1]);
    return result;
  }
  function multiply(name, base, values) {
    let acc = O, point = base;
    pair(name + '.acc[0]', acc);
    for (let j=0;j<values.length;j++) {
      const bit = values[j];
      set(name + '.bits[' + j + ']', bit);
      const selected = bit === 0n ? O : point;
      pair(name + '.selected[' + j + ']', selected);
      acc = adder(name + '.adders[' + j + ']', acc, selected);
      pair(name + '.acc[' + (j+1) + ']', acc);
      point = add(point,point);
    }
    pair(name + '.out', acc);
    return acc;
  }

  u.forEach((v,i) => set('u[' + i + ']', v));
  set('r',r);
  const cu = (options.classifierU ?? u).map(BigInt);
  cu.forEach((v,i) => {
    set('classifier.u[' + i + ']',v);
    bits('classifier.inputBits[' + i + ']',v,4);
  });
  const score = 3n*cu[0]-2n*cu[1]+cu[2]+4n*cu[3]-53n;
  const label = options.label ?? (score >= 0n ? 1n : 0n);
  set('label',label); set('classifier.label',label);
  set('classifier.score',score); set('classifier.shiftedScore',score+128n);
  bits('classifier.scoreBits',score+128n,8);

  const m = options.m ?? u.reduce((sum,v,i) => sum + v*(16n**BigInt(i)),0n);
  set('m',m);
  const mb = bits('messageBits',m,16);
  const rb = bits('scalarBits',r,251);
  set('scalarBound.in[0]',r); set('scalarBound.in[1]',SUBGROUP_ORDER);
  const cmp = bits('scalarBound.n2b',r+(1n<<251n)-SUBGROUP_ORDER,252);
  set('scalarBound.out',1n-cmp[251]);
  const P = multiply('messageMul',GENERATORS.G,mb);
  const Q = multiply('blinderMul',GENERATORS.H,rb);
  const C = adder('sum',P,Q);
  const expected = options.commitment ?? C;
  set('commitmentX',expected[0]); set('commitmentY',expected[1]);
  assert.ok(witness.every((v) => v !== undefined), 'unassigned O0 wire');
  return witness;
}

export function project(source, target, witness) {
  const result = Array(target.nVars).fill(undefined);
  result[0] = 1n;
  for (const [name,index] of target.symbols) {
    if (index <= 0) continue;
    const value = witness[wire(source,name)];
    if (result[index] !== undefined) assert.equal(result[index],value,'inconsistent alias: '+name);
    result[index] = value;
  }
  assert.ok(result.every((v) => v !== undefined),'unassigned O1 wire');
  return result;
}
