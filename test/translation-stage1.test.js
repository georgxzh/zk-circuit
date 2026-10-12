import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readR1cs } from 'r1csfile';
import { fixtures, folder, build } from '../research/translation-stage1/build.js';
import { readArtifacts, verifyBuildRecord } from '../research/translation-stage1/run.js';
import { parseR1cs, parsePair, parseSubstitutions } from '../research/translation-stage1/artifacts.js';
import { validatePair } from '../research/translation-stage1/validate.js';
import { BN254, checkCertificate } from '../research/translation-stage1/checker.js';
import { examples } from '../research/translation-stage0/examples.js';
import { assignments, satisfies, compareRelations } from '../research/translation-stage0/oracle.js';

let manifest;
before(() => { manifest=build(); }); // Fresh pinned artifacts; no cached-artifact success.

// Independent direct evaluator: no checker polynomial/rewrite helpers.
function holds(s,w) {
  if (w.length !== s.nVars || w[0] !== 1n || w.some((x) => typeof x !== 'bigint' || x < 0n || x >= s.p)) return false;
  const lc = (terms) => terms.reduce((sum,[i,c]) => (sum+c*w[i]) % s.p,0n);
  return s.rows.every(([a,b,c]) => (lc(a)*lc(b)) % s.p === lc(c));
}
const systemBig = (s) => ({...s,p:BigInt(s.p),rows:s.rows.map((r) => r.map((lc) => lc.map(([i,c]) => [i,BigInt(c)])))});
const certBig = (c) => ({...c,steps:c.steps.map((s) => s.kind === 'constant' ? {...s,value:BigInt(s.value)} : {...s})});

// Test-only serialization permits deliberately malformed structures. No generated
// artifact is committed; all corruption is applied to in-memory copies.
function encode(s) {
  const integer = (n,width) => { const b=Buffer.alloc(width); let v=BigInt(n);
    for(let i=0;i<width;i++) {b[i]=Number(v&255n);v>>=8n;} return b; };
  const u32 = (x) => integer(x,4), u64 = (x) => integer(x,8);
  const header = Buffer.concat([u32(32),integer(s.p,32),u32(s.nVars),u32(s.nOutputs),u32(s.nPubInputs),
    u32(s.nPrvInputs),u64(s.nLabels),u32(s.rows.length)]);
  const rows = Buffer.concat(s.rows.flat().flatMap((lc) => [u32(lc.length),
    ...lc.flatMap(([i,c]) => [u32(i),integer(c,32)])]));
  const mapping = Buffer.concat(s.labelsByWire.map(u64));
  const sections = [header,rows,mapping].map((body,i) => Buffer.concat([u32(i+1),u64(body.length),body]));
  return Buffer.concat([Buffer.from('r1cs'),u32(1),u32(3),...sections]);
}

for (const fixture of fixtures) test(`real Circom O0/O1: ${fixture.name}`, async () => {
  const raw = readArtifacts(fixture.name), result = validatePair(raw,fixture);
  verifyBuildRecord(raw,manifest.circuits.find((c) => c.name === fixture.name));
  assert.equal(result.accepted,true,result.reason);
  for (const opt of ['O0','O1']) {
    const ours = parseR1cs(raw[opt === 'O0' ? 'sourceR1cs' : 'targetR1cs']);
    const library = await readR1cs(join(folder(fixture.name,opt),fixture.name+'.r1cs'),{singleThread:true,loadMap:true});
    try {
      assert.equal(ours.p,library.prime);
      for (const key of ['nVars','nOutputs','nPubInputs','nPrvInputs','nLabels']) assert.equal(ours[key],library[key]);
      assert.deepEqual(ours.labelsByWire,Array.from(library.map));
      const sort = (lc) => [...lc].sort(([a],[b]) => a-b);
      const external = Array.from(library.constraints,(r) => r.map((lc) => sort(Object.entries(lc)
        .map(([i,c]) => [Number(i),library.F.toObject(c)]))));
      assert.deepEqual(ours.rows.map((r) => r.map(sort)),external);
      const json = JSON.parse(readFileSync(join(folder(fixture.name,opt),fixture.name+'_constraints.json')));
      assert.deepEqual(external,json.constraints.map((r) => r.map((lc) => sort(Object.entries(lc).map(([i,c]) => [Number(i),BigInt(c)])))));
    } finally { await library.curve?.terminate(); }
  }
  const values = [0n,1n,2n,7n,9007199254740993n,BN254-1n];
  const witnesses = fixture.name === 'alias' ? [[1n,0n],[1n,1n]]
    : fixture.name === 'interface' ? values.map((x) => [1n,(7n*x+x*x)%BN254,x,x,7n,x,(x*x)%BN254])
      : values.flatMap((x) => [[1n,0n,x],[1n,x,0n]]);
  for (const v of witnesses) {
    assert.ok(holds(result.target,v));
    const w = result.lift(v);
    assert.ok(holds(result.source,w));
    assert.deepEqual(result.project(w),v);
    assert.deepEqual(w.slice(0,1+result.source.public.length),v.slice(0,1+result.target.public.length));
    if (fixture.name === 'interface') {
      w[6] = BN254-1n; // An arbitrary unused source witness need not be reconstructed.
      assert.ok(holds(result.source,w));
      assert.deepEqual(result.project(w),v);
      assert.equal(result.lift(v)[6],0n);
    }
  }
});

test('BigInt port agrees with Stage 0 fixtures and exhaustive oracle over four primes', () => {
  for (const p of [2,3,5,7]) for (const e of examples(p)) {
    const source = systemBig(e.source), target = systemBig(e.target);
    const result = checkCertificate(source,target,certBig(e.certificate));
    assert.equal(result.accepted,e.accepted,e.name);
    if (!result.accepted) assert.equal(result.code,e.code,e.name);
    assert.equal(compareRelations(e.source,e.target).equivalent,e.equivalent,e.name);
    if (result.accepted) {
      for (const w of assignments(e.source)) if (satisfies(e.source,w)) assert.ok(holds(target,result.project(w.map(BigInt))));
      for (const v of assignments(e.target)) if (satisfies(e.target,v)) {
        const w = result.lift(v.map(BigInt)); assert.ok(holds(source,w));
        assert.deepEqual(result.project(w),v.map(BigInt));
      }
    }
  }
});

test('real interface records zero, flattened aliases, public restrictions, and unlisted unused input', () => {
  const raw = readArtifacts('interface'), pair = parsePair(raw,fixtures[1]), result = validatePair(raw,fixtures[1]);
  assert.equal(pair.proposals.has(6),false);
  assert.deepEqual(result.certificate.steps.map((s) => s.kind),['unused','alias','alias','constant','constant']);
  assert.equal(result.certificate.steps.at(-1).value,0n);
  assert.equal(result.source.rows.length,8); assert.equal(result.target.rows.length,4);
  assert.deepEqual(result.certificate.targetToSource,[0,1,2,3,4,5,11]);
  assert.equal(holds(result.target,[1n,0n,0n,1n,7n,0n,0n]),false); // public equality
  assert.equal(holds(result.target,[1n,0n,0n,0n,0n,0n,0n]),false); // public constant
});

test('compiler substitutions are untrusted: reject missing, false, cyclic, and malformed proposals', () => {
  for (const text of ['{}','{"2":{"0":"1"}}','{"2":{"2":"1"}}','{"2":{"99":"1"}}',
    '{"1":{"0":"1"}}','{"2":{"1":"2"}}','{"2":{"1":"1","0":"1"}}',
    '{"2":{"1":"1"},"2":{"0":"1"}}','{"2":{"1":"1","1":"1"}}',
    '{"2":{"1":"01"}}','{"2":{"1":1}}','{"2":{"1":"1"}} trailing',
    `{"2":{"0":"${BN254}"}}`]) {
    const raw = readArtifacts('alias'); raw.substitutions = Buffer.from(text);
    assert.equal(validatePair(raw,fixtures[0]).accepted,false,text);
  }
  assert.throws(() => parseSubstitutions(Buffer.from('{"2":{"1":"1",}}')));
  assert.throws(() => parseSubstitutions(Buffer.from('\u00a0{}')));
  const raw = readArtifacts('interface');
  raw.substitutions = Buffer.from('{"7":{"8":"1"},"8":{"7":"1"},"9":{"0":"7"},"10":{}}');
  assert.equal(validatePair(raw,fixtures[1]).accepted,false);
});

test('checker replays certificate pivots and mappings independently of the proposer', () => {
  const good = validatePair(readArtifacts('interface'),fixtures[1]);
  for (const mutate of [
    (c) => { c.steps[1].row=6; },
    (c) => { c.steps[3].value=8n; },
    (c) => { c.steps[1].to=8; c.steps[2].to=7; },
    (c) => { c.targetToSource[0]=5; c.targetToSource[5]=0; },
    (c) => { [c.targetToSource[2],c.targetToSource[3]]=[3,2]; },
    (c) => { c.targetToSource[6]=6; }, // label 11 has target witness index 6
    (c) => { c.steps.shift(); },
  ]) {
    const cert = structuredClone(good.certificate); mutate(cert);
    assert.equal(checkCertificate(good.source,good.target,cert).accepted,false);
  }
});

test('strict binary reader rejects corruption and malformed maps', () => {
  const raw = readArtifacts('alias');
  assert.deepEqual(parseR1cs(encode(parseR1cs(raw.sourceR1cs))),parseR1cs(raw.sourceR1cs));
  for (let cut=0; cut<raw.sourceR1cs.length; cut++) assert.throws(() => parseR1cs(raw.sourceR1cs.subarray(0,cut)));
  assert.throws(() => parseR1cs(Buffer.concat([raw.sourceR1cs,Buffer.from([0])])));
  const nonAsciiMagic = Buffer.from(raw.sourceR1cs); nonAsciiMagic[0] |= 128;
  assert.throws(() => parseR1cs(nonAsciiMagic));
  for (const mutate of [
    (s) => { s.p=BN254-1n; }, (s) => { s.nVars=33; },
    (s) => { s.labelsByWire[0]=1; }, (s) => { s.labelsByWire[2]=1; },
    (s) => { s.labelsByWire[2]=99; }, (s) => { s.rows[0][2][0][1]=BN254; },
    (s) => { s.rows[0][2][0][1]=0n; }, (s) => { s.rows[0][2][0][0]=99; },
    (s) => { s.rows[0][2].push([...s.rows[0][2][0]]); },
  ]) {
    const s = parseR1cs(raw.sourceR1cs); mutate(s); assert.throws(() => parseR1cs(encode(s)));
  }
  for (const [offset,value] of [[0,0],[4,2],[8,4],[12,9]]) {
    const bytes = Buffer.from(raw.sourceR1cs); bytes.writeUInt32LE(value,offset);
    assert.throws(() => parseR1cs(bytes));
  }
});

test('public ABI, symbols, and role metadata are checked across both binaries', () => {
  for (const edit of [
    (r) => { r.targetSym=Buffer.from(r.targetSym.toString().replace('main.a','main.bad')); },
    (r) => { r.targetSym=Buffer.concat([r.targetSym,Buffer.from('1,1,0,main.extra\n')]); },
    (r) => { r.targetSym=Buffer.from(r.targetSym.toString().replace('7,-1,0','7,5,0')); },
    (r) => { r.targetSym=Buffer.from(r.targetSym.toString().split('\n').slice(1).join('\n')); },
    (r) => { const s=parseR1cs(r.targetR1cs); s.nOutputs=0; s.nPubInputs=4; r.targetR1cs=encode(s); },
    (r) => { const s=parseR1cs(r.targetR1cs); [s.labelsByWire[2],s.labelsByWire[3]]=[3,2]; r.targetR1cs=encode(s); },
  ]) { const raw=readArtifacts('interface'); edit(raw); assert.equal(validatePair(raw,fixtures[1]).accepted,false); }
  const raw=readArtifacts('interface');
  assert.equal(validatePair(raw,{outputs:['main.out'],inputs:['main.b','main.a','main.c']}).accepted,false);
});

test('dropped public equality/constant and changed residual coefficient reject at the algebraic boundary', () => {
  for (const mutate of [
    (s) => { s.rows.splice(2,1); }, (s) => { s.rows.splice(3,1); },
    (s) => { s.rows[1][2].find(([i]) => i === 5)[1]=8n; },
  ]) {
    const raw=readArtifacts('interface'), s=parseR1cs(raw.targetR1cs); mutate(s); raw.targetR1cs=encode(s);
    assert.equal(validatePair(raw,fixtures[1]).code,'residual-mismatch');
  }
});

test('crucial counterexample is rejected when encoded as real-source binary artifacts', () => {
  const raw=readArtifacts('nonunique'), s=parseR1cs(raw.targetR1cs);
  s.nVars=2; s.labelsByWire=[0,1]; s.rows=[[[],[],[[1,1n]]]];
  raw.targetR1cs=encode(s);
  raw.targetSym=Buffer.from('1,1,0,main.a\n2,-1,0,main.t\n');
  raw.substitutions=Buffer.from('{"2":{"0":"1"}}');
  const pair=parsePair(raw,fixtures[2]);
  assert.equal(validatePair(raw,fixtures[2]).code,'missing-evidence');
  const cert={version:1,steps:[{kind:'constant',wire:2,value:1n,row:0}],targetToSource:[0,1]};
  assert.equal(checkCertificate(pair.source,pair.target,cert).code,'unjustified-substitution');
  assert.ok(holds(pair.source,[1n,1n,0n]));
  assert.equal(holds(pair.target,[1n,1n]),false); // target has no private coordinates
});

test('semantics-preserving residual scaling is accepted; hashes identify the changed bytes', () => {
  const raw=readArtifacts('alias'), before=validatePair(raw,fixtures[0]), s=parseR1cs(raw.targetR1cs);
  // A*B=C -> (-A)*B=(-C), with BN254 coefficients beyond Number precision.
  for (const part of [0,2]) s.rows[0][part]=s.rows[0][part].map(([i,c]) => [i,BN254-c]);
  raw.targetR1cs=encode(s); const after=validatePair(raw,fixtures[0]);
  assert.equal(after.accepted,true,after.reason);
  assert.notEqual(after.hashes.targetR1cs,before.hashes.targetR1cs);
  assert.equal(after.hashes.sourceR1cs,before.hashes.sourceR1cs);
  assert.throws(() => verifyBuildRecord(raw,manifest.circuits[0]),/Artifact changed/);
});
