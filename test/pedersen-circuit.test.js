import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { circuitInput, parseCircuitInput } from '../src/pedersen-circuit-input.js';
import { publicStatement } from '../src/pedersen.js';
import { GENERATORS, SUBGROUP_ORDER as ell } from '../src/pedersen-parameters.js';
import { loadCircuit, violations, wire } from './support/r1cs.js';
import { assignment, project } from './support/pedersen-assignment.js';
import { audit } from './support/pedersen-row-audit.js';
import { O, p, mod, add } from './support/pedersen-oracle.js';

const fixtures = JSON.parse(readFileSync(new URL('../spec/pedersen-vectors.json',import.meta.url))).vectors;
let raw, production, addition, rows;
before(async () => {
  raw = await loadCircuit('pedersen-audit','pedersen-inference');
  production = await loadCircuit('pedersen','pedersen-inference');
  addition = await loadCircuit('pedersen-add','pedersen-add');
  rows = audit(raw);
});

function rejected(witness) {
  assert.ok(violations(raw,witness).length > 0,'O0 accepted invalid assignment');
  assert.ok(violations(production,project(raw,production,witness)).length > 0,
    'O1 accepted invalid assignment');
}
function input(witness) {
  const value = (name) => String(witness[wire(raw,'main.'+name)]);
  return { commitmentX:value('commitmentX'),commitmentY:value('commitmentY'),
    label:value('label'),u:[0,1,2,3].map((i) => value('u['+i+']')),r:value('r') };
}

test('EC3 binary/JSON rows, public order, full O0 equation inspection',() => {
  assert.equal(rows.rows,4865);
  assert.equal(raw.nVars,4594);
  assert.equal(production.nConstraints,2966);
  assert.equal(production.nVars,2695);
  for (const c of [raw,production]) {
    assert.equal(c.nOutputs,0); assert.equal(c.nPubInputs,3); assert.equal(c.nPrvInputs,5);
    ['commitmentX','commitmentY','label'].forEach((name,i) => {
      assert.equal(wire(c,'main.'+name),i+1);
    });
  }
});

for (const v of fixtures) test('EC3 fixture: '+v.id,async () => {
  const u = v.x.map((x) => BigInt(x)+8n);
  const expected = [...v.commitment,v.label];
  const parsed = await circuitInput(v.x,BigInt(v.r),expected);
  assert.deepEqual(await parseCircuitInput(parsed),parsed);
  const witness = assignment(raw,u,BigInt(v.r));
  assert.deepEqual(witness.slice(1,4).map(String),expected);
  assert.deepEqual(violations(raw,witness),[]);
  assert.deepEqual(witness,await raw.wc.calculateWitness(parsed,true));
  const optimized = project(raw,production,witness);
  assert.deepEqual(violations(production,optimized),[]);
  assert.deepEqual(optimized,await production.wc.calculateWitness(parsed,true));
});

test('EC3 varied features/blinders agree with reference and both compiled builds',async () => {
  for (let i=0n;i<24n;i++) {
    const x = [0n,1n,2n,3n].map((j) => ((i*7n+j*11n)%16n)-8n);
    const r = ((1n << (i*10n)) + i*123456789n) % ell;
    const expected = await publicStatement(x,r);
    const witness = assignment(raw,x.map((x) => x+8n),r);
    assert.deepEqual(witness.slice(1,4).map(String),expected);
    for (const [c,w] of [[raw,witness],[production,project(raw,production,witness)]]) {
      assert.deepEqual(violations(c,w),[]);
      assert.deepEqual(await c.wc.calculateWitness(input(witness),true),w);
    }
  }
});

test('EC3 complete addition: identity, inverse cancellation, doubling, and order-two point',async () => {
  for (const [P,Q] of [[O,O],[GENERATORS.G,O],[O,GENERATORS.H],
    [GENERATORS.G,[mod(-GENERATORS.G[0]),GENERATORS.G[1]]],
    [GENERATORS.G,GENERATORS.G],[[0n,p-1n],[0n,p-1n]],
    [GENERATORS.H,[0n,p-1n]]]) {
    const w = await addition.wc.calculateWitness({P:P.map(String),Q:Q.map(String)},true);
    assert.deepEqual(w.slice(1,3),add(P,Q));
    assert.deepEqual(violations(addition,w),[]);
  }
});

test('EC3 direct R1CS rejects noncanonical scalars even when group arithmetic is valid',async () => {
  for (const r of [ell,ell+1n,(1n<<251n)-1n,1n<<251n,p-1n]) {
    const w = assignment(raw,[0n,0n,0n,0n],r);
    rejected(w);
    for (const c of [raw,production]) {
      await assert.rejects(c.wc.calculateWitness(input(w),true));
    }
  }
  // r=ell computes [ell]H=O: only the strict comparison prevents this alias of r=0.
  const alias = assignment(raw,[0n,0n,0n,0n],ell);
  assert.deepEqual(alias.slice(1,3),O);
  assert.deepEqual(violations(raw,alias),[rows.strictBoundRow]);
  assert.deepEqual(violations(raw,alias,new Set([rows.strictBoundRow])),[]);
});

test('EC3 direct R1CS rejects out-of-range features in every position',async () => {
  for (let i=0;i<4;i++) for (const value of [16n,p-1n]) {
    const u = [8n,8n,8n,8n]; u[i]=value;
    const w = assignment(raw,u,42n);
    rejected(w);
    for (const c of [raw,production]) await assert.rejects(c.wc.calculateWitness(input(w),true));
  }
});

test('EC3 direct R1CS rejects separate committed/classified inputs and wrong packing',() => {
  rejected(assignment(raw,[8n,8n,8n,8n],42n,{classifierU:[9n,8n,8n,9n]}));
  rejected(assignment(raw,[8n,8n,8n,8n],42n,{m:34953n}));
});

test('EC3 direct R1CS rejects wrong and non-Boolean labels including score zero',async () => {
  for (const [u,label] of [
    [[9n,8n,8n,9n],0n], // +2
    [[8n,8n,8n,8n],1n], // -5
    [[9n,9n,8n,9n],0n], // exactly zero
    [[9n,9n,8n,9n],2n],
  ]) {
    const w = assignment(raw,u,42n,{label});
    rejected(w);
    for (const c of [raw,production]) await assert.rejects(c.wc.calculateWitness(input(w),true));
  }
});

test('EC3 direct R1CS rejects wrong coordinates, off-curve and torsion public points',async () => {
  const good = assignment(raw,[8n,8n,8n,8n],42n);
  const C = good.slice(1,3);
  for (const commitment of [[mod(C[0]+1n),C[1]],[C[0],mod(C[1]+1n)],
    [C[1],C[0]],[0n,0n],[0n,p-1n]]) {
    const w = assignment(raw,[8n,8n,8n,8n],42n,{commitment});
    rejected(w);
    for (const c of [raw,production]) await assert.rejects(c.wc.calculateWitness(input(w),true));
  }
  for (const [coordinate,row] of [[0,rows.xRow],[1,rows.yRow]]) {
    const w = [...good]; w[coordinate+1]=mod(w[coordinate+1]+1n);
    assert.deepEqual(violations(raw,w),[row]);
    assert.deepEqual(violations(raw,w,new Set([row])),[]);
  }
});

test('EC3 raw mutations of bits and addition outputs cannot bypass constraints',() => {
  const good = assignment(raw,[9n,9n,8n,9n],42n);
  for (const name of ['scalarBits.out[0]','messageBits.out[0]',
    'scalarBound.n2b.out[251]','blinderMul.bits[0]','messageMul.bits[0]',
    'sum.xout','sum.yout','messageMul.adders[0].xout','blinderMul.adders[250].yout']) {
    const w = [...good], i = wire(raw,'main.'+name);
    w[i]=mod(w[i]+2n);
    assert.ok(violations(raw,w).length > 0);
    // O1 eliminates some O0 intermediates. Mutate only wires that survive,
    // directly in the optimized assignment rather than dropping a mutation.
    const index = production.symbols.get('main.'+name);
    if (index > 0) {
      const optimized = project(raw,production,good);
      optimized[index]=mod(optimized[index]+2n);
      assert.ok(violations(production,optimized).length > 0,name);
    }
  }
});

test('EC3 adapter rejects malformed encodings before witness generation',async () => {
  const v = fixtures[0];
  const good = await circuitInput(v.x,BigInt(v.r),[...v.commitment,v.label]);
  for (const bad of [
    {...good,r:String(ell)}, {...good,r:'01'}, {...good,r:'-1'},
    {...good,r:0}, {...good,u:['16','0','0','0']},
    {...good,u:Array(4)}, {...good,u:['0','0','0']},
    {...good,commitmentX:String(p)}, {...good,commitmentX:'00'},
    {...good,commitmentX:'0',commitmentY:'0'},
    {...good,commitmentX:'0',commitmentY:String(p-1n)},
    {...good,label:'2'}, {...good,label:'1\n'}, {...good,extra:'0'},
  ]) await assert.rejects(parseCircuitInput(bad));
  const missing = {...good}; delete missing.r;
  await assert.rejects(parseCircuitInput(missing));
});

test('EC3 adapter preserves wrong expected claims and snapshots inputs',async () => {
  const x = [0,0,0,0], signals = ['0','1','1'];
  const pending = circuitInput(x,42n,signals);
  x[0]=7; signals[2]='0';
  const parsed = await pending;
  assert.deepEqual(parsed,{commitmentX:'0',commitmentY:'1',label:'1',
    u:['8','8','8','8'],r:'42'});
  for (const c of [raw,production]) await assert.rejects(c.wc.calculateWitness(parsed,true));
  const pendingParse = parseCircuitInput(parsed);
  parsed.u[0]='15'; parsed.r='0'; parsed.label='0';
  const snapshot = await pendingParse;
  assert.equal(snapshot.u[0],'8'); assert.equal(snapshot.r,'42'); assert.equal(snapshot.label,'1');
});
