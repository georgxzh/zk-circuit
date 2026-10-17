import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build,directory,name,suffixes} from '../../scripts/build-pedersen-formal.js';
import {root,digest} from '../../scripts/compiler.js';
import {sourceClosure} from '../translation-stage2/build.js';
import {account,satisfies,json} from '../translation-stage2/run.js';
import {validatePair,LIMITS} from './validate.js';
import {parseR1cs} from '../translation-stage1/artifacts.js';
import {loadCircuit} from '../../test/support/r1cs.js';
import {audit} from '../../test/support/pedersen-row-audit.js';
import {assignment} from '../../test/support/pedersen-assignment.js';

export function readArtifacts() {
  const get=(opt,suffix)=>readFileSync(join(directory,opt,name+suffix));
  return {sourceR1cs:get('O0','.r1cs'),targetR1cs:get('O1','.r1cs'),
    sourceSym:get('O0','.sym'),targetSym:get('O1','.sym'),
    substitutions:get('O1','_substitutions.json')};
}
export function verifyManifest(manifest) {
  assert.deepEqual(sourceClosure('circuits/pedersen-inference.circom'),manifest.sourceHashes);
  assert.equal(digest(readFileSync(join(root,'package-lock.json'))),manifest.lockSha256);
  const profileBytes=readFileSync(join(root,'spec/pedersen-proof-system.json'));
  assert.equal(digest(profileBytes),manifest.profileSha256);
  const profile=JSON.parse(profileBytes);
  assert.equal(manifest.builds.O0['.r1cs'],'261008168d9607289322ac4895f555eba84b699b82d102e7742299afce1091ba');
  assert.equal(manifest.builds.O1['.r1cs'],profile.r1csSha256);
  assert.equal(manifest.builds.O1['_js/pedersen-inference.wasm'],profile.wasmSha256);
  for(const opt of ['O0','O1']) for(const suffix of suffixes) {
    assert.equal(digest(readFileSync(join(directory,opt,name+suffix))),manifest.builds[opt][suffix],
      'artifact changed: '+opt+suffix);
  }
}
export async function evaluate() {
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json')));
  verifyManifest(manifest);
  const raw=readArtifacts(), result=validatePair(raw);
  assert.equal(result.accepted,true,result.reason);
  const counts=account(result);
  const o0=await loadCircuit('pedersen-formal/O0',name);
  const o1=await loadCircuit('pedersen-formal/O1',name);
  const graph=audit(o0);
  // The independent binary parser, r1csfile reader, and compiler JSON agree.
  const sorted=rows=>rows.map(row=>row.map(lc=>[...lc].sort(([a],[b])=>a-b)));
  assert.deepEqual(sorted(result.source.rows),sorted(o0.constraints));
  assert.deepEqual(sorted(result.target.rows),sorted(o1.constraints));
  const {vectors}=JSON.parse(readFileSync(join(root,'spec/pedersen-vectors.json')));
  for(const v of vectors) {
    const u=v.x.map(x=>BigInt(x)+8n), w=assignment(o0,u,BigInt(v.r));
    const input={commitmentX:v.commitment[0],commitmentY:v.commitment[1],
      label:v.label,u:u.map(String),r:v.r};
    const generated0=await o0.wc.calculateWitness(input,true), generated1=await o1.wc.calculateWitness(input,true);
    assert.deepEqual(w,generated0,v.id);
    const projected=result.project(w), lifted=result.lift(generated1);
    assert.deepEqual(projected,generated1,v.id);
    assert.deepEqual(lifted,w,v.id); // This concrete circuit has no unused steps.
    assert.deepEqual(projected.slice(0,4),w.slice(0,4));
    assert.deepEqual(lifted.slice(0,4),generated1.slice(0,4));
    assert.ok(satisfies(result.source,w) && satisfies(result.target,projected));
    assert.ok(satisfies(result.target,generated1) && satisfies(result.source,lifted));
  }
  const resources=Object.fromEntries(['sourceR1cs','targetR1cs'].map(key=>{
    const s=parseR1cs(raw[key],LIMITS);
    return [key,{bytes:raw[key].length,labels:s.nLabels,
      maxTerms:Math.max(...s.rows.flat().map(lc=>lc.length)),
      products:s.rows.reduce((sum,[a,b,c])=>sum+a.length*b.length+c.length,0)}];
  }));
  const families=graph.trace.reduce((out,t)=>(out[t.family]=(out[t.family]??0)+1,out),{});
  const checkerSources=Object.fromEntries([
    'research/pedersen-formal/validate.js','research/pedersen-formal/run.js',
    'research/translation-stage1/artifacts.js','research/translation-stage1/checker.js',
    'research/translation-stage2/validate.js','test/support/pedersen-row-audit.js',
    'test/support/pedersen-oracle.js','test/support/pedersen-assignment.js',
  ].map(path=>[path,digest(readFileSync(join(root,path)))]));
  const receipt={accepted:true,scope:'Executable validation with written proof; not proof-assistant verification',
    manifest,checkerSources,limits:LIMITS,resources,...counts,
    public:result.source.public,hashes:result.hashes,transportSamples:vectors.length,
    sourceToTarget:true,targetToSource:true,sourceAuditRows:graph.rows,families,
    sourceTrace:graph.trace,certificate:result.certificate,accounting:result.accounting};
  writeFileSync(join(directory,'receipt.json'),json(receipt));
  console.log(json({accepted:true,...counts,sourceAuditRows:graph.rows,transportSamples:vectors.length,resources}).trim());
  return {result,raw,graph,o0,o1,receipt};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  build(); await evaluate();
}
