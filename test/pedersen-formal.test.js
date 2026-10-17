import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {evaluate,readArtifacts,verifyManifest} from '../research/pedersen-formal/run.js';
import {validatePair,checkCertificate,LIMITS,expected} from '../research/pedersen-formal/validate.js';
import {parseR1cs,parsePair} from '../research/translation-stage1/artifacts.js';
import {LIMITS as baselineLimits,validatePair as baselineValidate} from '../research/translation-stage2/validate.js';
import {account,satisfies} from '../research/translation-stage2/run.js';
import {directory} from '../scripts/build-pedersen-formal.js';
import {audit} from './support/pedersen-row-audit.js';
import {assignment} from './support/pedersen-assignment.js';
import {encode} from './support/translation-binary.js';

let checked;
before(async()=>{checked=await evaluate();});
test('EC5 exact pair accounts for every source row, eliminated wire, and target row',()=>{
  const {result,graph,receipt}=checked;
  assert.deepEqual(account(result),{
    sourceWires:4594,targetWires:2695,sourceRows:4865,targetRows:2966,
    eliminated:{alias:1889,constant:10,unused:0},
    zeroSourceRows:1899,zeroTargetRows:0,matchedRows:2966,
  });
  assert.equal(graph.trace.length,4865);
  assert.equal(new Set(graph.trace.map(t=>t.row)).size,4865);
  assert.deepEqual(result.source.public,expected.inputs.map(n=>'input:'+n));
  assert.deepEqual(result.certificate.targetToSource.slice(0,4),[0,1,2,3]);
  assert.equal(new Set(result.certificate.steps.map(s=>s.row)).size,1899);
  assert.equal(receipt.transportSamples,13);
  assert.equal(receipt.resources.sourceR1cs.maxTerms,253);
  assert.equal(receipt.resources.targetR1cs.maxTerms,253);
  assert.equal(receipt.sourceToTarget,true); assert.equal(receipt.targetToSource,true);
});

test('EC5 production identities and generated build manifest are checked independently',()=>{
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json')));
  verifyManifest(manifest);
  for(const mutate of [
    m=>{m.builds.O0['.r1cs']='0'.repeat(64);},
    m=>{m.builds.O1['.r1cs']='0'.repeat(64);},
    m=>{m.builds.O1['_js/pedersen-inference.wasm']='0'.repeat(64);},
    m=>{m.sourceHashes['circuits/pedersen-inference.circom']='0'.repeat(64);},
    m=>{m.profileSha256='0'.repeat(64);},
  ]) {const m=structuredClone(manifest);mutate(m);assert.throws(()=>verifyManifest(m));}
});

test('EC5 source audit detects omitted and altered semantic equations',()=>{
  const {o0,graph}=checked;
  const families=['classifier.inputBits[0]','packing','scalarBits','scalarBound',
    'messageMul','blinderMul','messageMul.adders[0]','blinderMul.adders[250]','sum','commitment'];
  for(const family of families) {
    const members=graph.trace.filter(t=>t.family===family);
    assert.ok(members.length,family);
    const row=members.at(-1).row; // Includes division Y equations for adders.
    const constraints=structuredClone(o0.constraints);
    constraints[row]=[[],[],[]];
    assert.throws(()=>audit({...o0,constraints}),/missing emitted equation/,family);
  }
  for(const row of [graph.strictBoundRow,graph.xRow,graph.yRow]) {
    const constraints=structuredClone(o0.constraints);
    const term=constraints[row].flat()[0]; term[1]=term[1]===1n?2n:1n;
    assert.throws(()=>audit({...o0,constraints}),/missing emitted equation/);
  }
});

test('EC5 certificate rejects changed constants, missing pivots, cycles, and public remapping',()=>{
  const {source,target,certificate}=checked.result;
  for(const mutate of [
    c=>{c.steps.find(s=>s.kind==='constant').value=2n;},
    c=>{c.steps[0].row=source.rows.length-1;},
    c=>{c.steps.splice(10,1);},
    c=>{const s=c.steps.find(s=>s.kind==='alias');s.to=s.wire;},
    c=>{c.steps[0].wire=1;},
    c=>{[c.targetToSource[1],c.targetToSource[2]]=[2,1];},
    c=>{c.targetToSource[4]=c.targetToSource[5];},
  ]) {const c=structuredClone(certificate);mutate(c);assert.equal(checkCertificate(source,target,c).accepted,false);}
  const damaged=structuredClone(source);
  damaged.rows[certificate.steps[0].row]=[[],[],[]];
  assert.equal(checkCertificate(damaged,target,certificate).code,'unjustified-substitution');
});

test('EC5 residual row deletion, duplication, and coefficient changes reject',()=>{
  for(const row of [0,20,500,1500,2412,2965]) {
    const raw=readArtifacts(), target=parseR1cs(raw.targetR1cs,LIMITS);
    target.rows.splice(row,1); raw.targetR1cs=encode(target);
    assert.equal(validatePair(raw).code,'residual-mismatch','deleted '+row);
  }
  for(const mutate of [
    s=>{s.rows.push(structuredClone(s.rows[100]));},
    s=>{const t=s.rows[1500].flat()[0]; t[1]=t[1]===1n?2n:1n;},
  ]) {
    const raw=readArtifacts(), target=parseR1cs(raw.targetR1cs,LIMITS);
    mutate(target);raw.targetR1cs=encode(target);
    assert.equal(validatePair(raw).code,'residual-mismatch');
  }
});

test('EC5 compiler proposals remain untrusted and unsupported affine replacements fail',()=>{
  const raw=readArtifacts(), substitutions=JSON.parse(raw.substitutions);
  const [label,rhs]=Object.entries(substitutions).find(([,v])=>Object.keys(v)[0]!=='0');
  assert.ok(label && rhs);
  for(const mutate of [
    s=>{s[label]={[label]:'1'};},
    s=>{s[label]={'1':'2'};},
    s=>{s[label]={'1':'1','0':'1'};},
    s=>{s['1']={'0':'0'};},
  ]) {
    const modified=structuredClone(substitutions);mutate(modified);
    assert.equal(validatePair({...raw,substitutions:Buffer.from(JSON.stringify(modified))}).accepted,false);
  }
});

test('EC5 ordered public metadata and strict binary parsing reject damaged artifacts',()=>{
  for(const mutate of [
    r=>{r.targetSym=Buffer.from(r.targetSym.toString().replace('main.commitmentX','main.changed'));},
    r=>{r.targetR1cs=Buffer.concat([r.targetR1cs,Buffer.from([0])]);},
    r=>{r.targetR1cs=r.targetR1cs.subarray(0,-1);},
    r=>{const s=parseR1cs(r.targetR1cs,LIMITS);s.nOutputs=1;s.nPubInputs=2;r.targetR1cs=encode(s);},
    r=>{const s=parseR1cs(r.targetR1cs,LIMITS);s.rows[0][0].push([...s.rows[0][0][0]]);r.targetR1cs=encode(s);},
  ]) {const raw=readArtifacts();mutate(raw);assert.equal(validatePair(raw).accepted,false);}
  assert.equal(validatePair(readArtifacts(),{outputs:[],inputs:[...expected.inputs].reverse()}).code,'interface');
});

test('EC5 larger bounds are isolated and remain fail-closed',()=>{
  assert.equal(baselineLimits.wires,4096);assert.equal(baselineLimits.rows,4096);
  assert.equal(baselineLimits.terms,128);
  assert.equal(baselineValidate(readArtifacts(),expected).accepted,false);
  const raw=readArtifacts();
  for(const overrides of [
    {wires:4593},{rows:4864},{labels:4593},{bytes:629339},{terms:252},{products:12684},
  ]) assert.throws(()=>parseR1cs(raw.sourceR1cs,{...LIMITS,...overrides}));
  assert.doesNotThrow(()=>parsePair(raw,expected,LIMITS));
});

test('EC5 transport does not certify an invalid assignment or omit public coordinates',()=>{
  const {result,o0}=checked;
  const w=assignment(o0,[9n,9n,8n,9n],42n);
  const v=result.project(w);
  assert.ok(satisfies(result.source,w));assert.ok(satisfies(result.target,v));
  const invalid=[...v];invalid[3]=0n;
  assert.equal(satisfies(result.target,invalid),false);
  assert.equal(satisfies(result.source,result.lift(invalid)),false);
  // Transport checks shape/canonical coordinates, not satisfaction; the
  // preservation theorem has satisfaction as its explicit premise.
  assert.throws(()=>result.lift(v.slice(1)),/witness/);
  for(const edit of [
    r=>r.accounting.rowMap.pop(),r=>r.accounting.zeroSourceRows.pop(),r=>r.certificate.steps.pop(),
  ]) {
    const r={...result,certificate:structuredClone(result.certificate),
      accounting:structuredClone(result.accounting)};
    edit(r);assert.throws(()=>account(r),/incomplete accounting/);
  }
});
