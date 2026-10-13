import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {readR1cs} from 'r1csfile';
import {corpus,samples} from '../research/translation-stage2/corpus.js';
import {build,base,folder} from '../research/translation-stage2/build.js';
import {readArtifacts,verifyRecord,account,transport,satisfies,witnessCalculator,json} from '../research/translation-stage2/run.js';
import {validatePair,checkCertificate,LIMITS,proposeCertificate} from '../research/translation-stage2/validate.js';
import {parsePair,parseR1cs,hash} from '../research/translation-stage1/artifacts.js';
import {BN254 as p,createReplay,polynomial,substitute} from '../research/translation-stage1/checker.js';
import {proposeCertificate as stage1Proposal} from '../research/translation-stage1/validate.js';
import {encode} from './support/translation-binary.js';
import {root} from '../scripts/compiler.js';

let manifest;
const accepted=new Map(), receipts=[];
const fixture=(id)=>corpus.find((c)=>c.id===id);
const raw=(id)=>readArtifacts(fixture(id));
const record=(id)=>manifest.circuits.find((c)=>c.id===id);
const parsed=(bytes)=>parseR1cs(bytes,LIMITS);
before(()=>{manifest=build();});
after(()=>writeFileSync(join(base,'test-receipts.json'),json({manifest,receipts})));

for(const f of corpus) test(`Stage 2 real pair and bidirectional transport: ${f.id}`,async()=>{
  const bytes=raw(f.id); verifyRecord(bytes,record(f.id));
  const result=validatePair(bytes,f); assert.equal(result.accepted,true,result.reason);
  const counts=account(result), witnesses=await transport(f,result,record(f.id));
  accepted.set(f.id,result);
  receipts.push({id:f.id,...counts,witnesses,hashes:result.hashes,certificate:result.certificate,accounting:result.accounting});
  for(const opt of ['O0','O1']) {
    const ours=parsed(bytes[opt==='O0'?'sourceR1cs':'targetR1cs']);
    const external=await readR1cs(join(folder(f.id,opt),f.name+'.r1cs'),{singleThread:true,loadMap:true});
    try {
      assert.equal(ours.p,external.prime);
      for(const key of ['nVars','nLabels','nOutputs','nPubInputs','nPrvInputs']) assert.equal(ours[key],external[key]);
      assert.deepEqual(ours.labelsByWire,Array.from(external.map));
      const sort=(lc)=>[...lc].sort(([a],[b])=>a-b);
      const rows=external.constraints.map((r)=>r.map((lc)=>sort(Object.entries(lc).map(([i,c])=>[Number(i),external.F.toObject(c)]))));
      assert.deepEqual(ours.rows.map((r)=>r.map(sort)),rows);
      const exported=JSON.parse(readFileSync(join(folder(f.id,opt),f.name+'_constraints.json')));
      assert.deepEqual(rows,exported.constraints.map((r)=>r.map((lc)=>sort(Object.entries(lc).map(([i,c])=>[Number(i),BigInt(c)])))));
    } finally { await external.curve?.terminate(); }
  }
});

test('production receipt covers all 636 eliminated wires and every 1635/999 row',()=>{
  const c=accepted.get('inference'), stats=account(c);
  assert.deepEqual(stats,{sourceWires:1635,targetWires:999,sourceRows:1635,targetRows:999,
    eliminated:{alias:631,constant:5,unused:0},zeroSourceRows:636,zeroTargetRows:0,matchedRows:999});
  assert.deepEqual(c.source.public,['input:main.commitment','input:main.label']);
  assert.deepEqual(c.certificate.targetToSource.slice(0,3),[0,1,2]);
  assert.equal(new Set(c.certificate.steps.map((s)=>s.row)).size,636);
  assert.equal(c.hashes.sourceR1cs,'648f65828785aaaf4ca80b1c3d111504c6fed938d244db87160519650a8404fc');
  for(const [key,path] of [['sourceR1cs','build/audit/inference.r1cs'],['targetR1cs','build/inference/inference.r1cs']]) {
    if(existsSync(join(root,path)))assert.equal(c.hashes[key],hash(readFileSync(join(root,path))));
  }
  assert.equal(c.hashes.targetR1cs,'5ad3eeeca14589c17236fb721ab24189d597cc55267f423b497992fbb4270f0f');
  for(const edit of [(x)=>x.accounting.rowMap.pop(),(x)=>x.accounting.zeroSourceRows.pop(),(x)=>x.certificate.steps.pop()]) {
    const damaged={...c,accounting:structuredClone(c.accounting),certificate:structuredClone(c.certificate)};
    edit(damaged); assert.throws(()=>account(damaged),/incomplete accounting/);
  }
});

test('production compiler DAG normalization is necessary but never substitutes for a checked pivot',()=>{
  const pair=parsePair(raw('inference'),fixture('inference'),LIMITS);
  assert.throws(()=>stage1Proposal(pair),/cannot justify/);
  const certificate=proposeCertificate(pair);
  for(const wire of [52,66,67]) assert.equal(certificate.steps.find((s)=>s.wire===wire).kind,'constant');
  const c=accepted.get('inference');
  for(const mutate of [
    (x)=>{x.steps[0].row=1634;},
    (x)=>{x.steps.find((s)=>s.kind==='constant').value=2n;},
    (x)=>{x.steps.splice(10,1);},
    (x)=>{x.targetToSource[10]=x.targetToSource[11];},
    (x)=>{[x.targetToSource[1],x.targetToSource[2]]=[2,1];},
  ]) {const cert=structuredClone(c.certificate);mutate(cert);assert.equal(checkCertificate(c.source,c.target,cert).accepted,false);}
});

test('production substitution corruption: missing entries, cycles, dependencies, public wires, and affine forms',()=>{
  const original=JSON.parse(raw('inference').substitutions);
  const changes=[
    [s=>{delete s['52'];},'missing-evidence'],
    [s=>{s['52']={'66':'1'};s['66']={'52':'1'};},'cycle'],
    [s=>{s['52']={'99999':'1'};},'substitutions'],
    [s=>{s['1']={'0':'1'};},'substitutions'],
    [s=>{s['52']={'1':'2'};},'unsupported'],
    [s=>{s['52']={'1':'1','0':'1'};},'unsupported'],
    [s=>{s['52']={'0':String(p)};},'substitutions'],
  ];
  for(const [mutate,code] of changes) {
    const bytes=raw('inference'), s=structuredClone(original); mutate(s);bytes.substitutions=Buffer.from(JSON.stringify(s));
    assert.equal(validatePair(bytes,fixture('inference')).code,code);
  }
  for(const text of ['{"52":{},"52":{}}','{"52":{"0":"1","0":"2"}}']) {
    const bytes=raw('inference');bytes.substitutions=Buffer.from(text);
    assert.equal(validatePair(bytes,fixture('inference')).code,'substitutions');
  }
});

test('production residual mutations reject even with a complete valid elimination certificate',()=>{
  const c=accepted.get('inference'), f=fixture('inference');
  // Across nonlinear and linear rows, including the tail of the Poseidon graph.
  for(const index of [0,1,20,100,381,382,500,800,998]) {
    const bytes=raw('inference'), target=parsed(bytes.targetR1cs);target.rows.splice(index,1);bytes.targetR1cs=encode(target);
    assert.equal(validatePair(bytes,f).code,'residual-mismatch',`deleted row ${index}`);
  }
  const bytes=raw('inference'), target=parsed(bytes.targetR1cs);
  const term=target.rows[800].flat()[0];term[1]=term[1]===1n?2n:1n;bytes.targetR1cs=encode(target);
  assert.equal(validatePair(bytes,f).code,'residual-mismatch');
  const source=structuredClone(c.source);source.rows[c.certificate.steps[0].row]=[[],[],[]];
  assert.equal(checkCertificate(source,c.target,c.certificate).code,'unjustified-substitution');
});

test('production public identity and strict binary/symbol parsing survive artifact corruption',()=>{
  const f=fixture('inference');
  for(const mutate of [
    r=>{r.targetSym=Buffer.from(r.targetSym.toString().replace('main.commitment','main.wrong'));},
    r=>{r.targetSym=Buffer.from(r.targetSym.toString().replace('1,1,','1,2,'));},
    r=>{r.targetSym=Buffer.concat([r.targetSym,Buffer.from('1,1,0,main.extra\n')]);},
    r=>{const s=parsed(r.targetR1cs);s.labelsByWire[0]=1;r.targetR1cs=encode(s);},
    r=>{const s=parsed(r.targetR1cs);s.nOutputs=1;s.nPubInputs=1;r.targetR1cs=encode(s);},
    r=>{const s=parsed(r.targetR1cs);s.rows[0][0].push([...s.rows[0][0][0]]);r.targetR1cs=encode(s);},
    r=>{const s=parsed(r.targetR1cs);s.rows[0][0][0][1]=p;r.targetR1cs=encode(s);},
    r=>{r.targetR1cs=Buffer.concat([r.targetR1cs,Buffer.from([0])]);},
    r=>{r.targetR1cs=r.targetR1cs.subarray(0,-1);},
    r=>{r.targetR1cs.writeUInt32LE(4,8);}, // unsupported custom-gate/extra section
  ]) {const bytes=raw('inference');mutate(bytes);assert.equal(validatePair(bytes,f).accepted,false);}
  assert.equal(validatePair(raw('inference'),{outputs:[],inputs:['main.label','main.commitment']}).code,'interface');
});

test('residual multiplicity, public constants/equalities, and false nonlinear elimination remain strict',()=>{
  for(const [id,row] of [['publics',0],['publics',3],['interface',2],['interface',3]]) {
    const bytes=raw(id),s=parsed(bytes.targetR1cs);s.rows.splice(row,1);bytes.targetR1cs=encode(s);
    assert.equal(validatePair(bytes,fixture(id)).code,'residual-mismatch');
  }
  const bytes=raw('nonunique'),target=parsed(bytes.targetR1cs);
  target.nVars=2;target.labelsByWire=[0,1];target.rows=[[[],[],[[1,1n]]]];
  bytes.targetR1cs=encode(target);bytes.targetSym=Buffer.from('1,1,0,main.a\n2,-1,0,main.t\n');
  bytes.substitutions=Buffer.from('{"2":{"0":"1"}}');
  assert.equal(validatePair(bytes,fixture('nonunique')).code,'missing-evidence');
  const pair=parsePair(bytes,fixture('nonunique'),LIMITS);
  assert.ok(satisfies(pair.source,[1n,1n,0n]));assert.equal(satisfies(pair.target,[1n,1n]),false);
});

test('affine elimination is explicitly unsupported even when the source defines it',()=>{
  const bytes=raw('affine');
  // Source wires: y=1, x=2, unused=3, t=4. O1 legitimately retains t.
  const s=parsed(bytes.targetR1cs);s.nVars=3;s.labelsByWire=[0,1,2];s.rows=[[[[2,3n],[0,5n]],[[2,3n],[0,5n]],[[1,1n]]]];
  bytes.targetR1cs=encode(s);bytes.targetSym=Buffer.from('1,1,0,main.y\n2,2,0,main.x\n3,-1,0,main.unused\n4,-1,0,main.t\n');
  bytes.substitutions=Buffer.from('{"4":{"2":"3","0":"5"}}');
  assert.equal(validatePair(bytes,fixture('affine')).code,'unsupported');
  // This is a constructed rejected artifact, not an O2 compiler run.
});

test('sanity settings preserve the same constraints and all generated samples transport',()=>{
  for(const id of ['nested','inference']) {
    const a=accepted.get(id),b=accepted.get(id+'-sanity0');
    assert.equal(a.hashes.sourceR1cs,b.hashes.sourceR1cs);assert.equal(a.hashes.targetR1cs,b.hashes.targetR1cs);
  }
  assert.equal(corpus.reduce((n,f)=>n+samples(f.name).length,0),69);
});

test('nonunique source and target witnesses transport without assuming generator output or a witness bijection',async()=>{
  for(const id of ['interface','inverse']) {
    const f=fixture(id),c=accepted.get(id), wc=await witnessCalculator(f,'O0',record(id));
    const w=await wc.calculateWitness(samples(id)[0],true);
    const sym=raw(id).sourceSym.toString().split(/\r?\n/).find((l)=>l.endsWith(id==='interface'?'main.spare':'main.inverse'));
    w[Number(sym.split(',')[1])]=p-1n; // deliberately unlike the x=0 hint value
    assert.ok(satisfies(c.source,w));const v=c.project(w);assert.ok(satisfies(c.target,v));
    assert.ok(satisfies(c.source,c.lift(v)));assert.deepEqual(c.project(c.lift(v)),v);
  }
});

test('indexed row updates agree with full substitution and resource limits fail closed',()=>{
  const c=accepted.get('inference'), replay=createReplay(c.source.rows.map((r)=>polynomial(r,p)),p);
  let plain=c.source.rows.map((r)=>polynomial(r,p));
  for(const step of c.certificate.steps) {
    if(step.kind==='unused')continue;
    const to=step.kind==='alias'?step.to:0,value=step.kind==='alias'?1n:step.value;
    replay.replace(step.wire,to,value);plain=plain.map((r)=>substitute(r,step.wire,to,value,p));
  }
  assert.deepEqual(replay.rows,plain);
  const bytes=raw('inference');assert.throws(()=>parseR1cs(bytes.sourceR1cs,{...LIMITS,products:10}),/budget/);
  assert.throws(()=>parseR1cs(bytes.sourceR1cs,{...LIMITS,bytes:10}),/size/);
  const s=parsed(bytes.targetR1cs);s.nVars=LIMITS.wires+1;assert.throws(()=>parsed(encode(s)),/bounds/);
});

test('semantics-preserving row changes can pass validation but cannot pass the original build hash check',()=>{
  const bytes=raw('inference'),s=parsed(bytes.targetR1cs);
  for(const part of [0,2])s.rows[0][part]=s.rows[0][part].map(([i,c])=>[i,p-c]);
  s.rows.reverse();bytes.targetR1cs=encode(s);
  assert.equal(validatePair(bytes,fixture('inference')).accepted,true);
  assert.throws(()=>verifyRecord(bytes,record('inference')),/artifact changed/);
});
