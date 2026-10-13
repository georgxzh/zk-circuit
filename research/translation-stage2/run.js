import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, root } from '../../scripts/compiler.js';
import { corpus, samples } from './corpus.js';
import { base, folder, build } from './build.js';
import { validatePair } from './validate.js';
const require = createRequire(import.meta.url);
export const json = (value) => JSON.stringify(value,(_,v) => typeof v === 'bigint' ? String(v) : v,2)+'\n';
export function readArtifacts(fixture) {
  const get = (opt,suffix) => readFileSync(join(folder(fixture.id,opt),fixture.name+suffix));
  return {sourceR1cs:get('O0','.r1cs'),targetR1cs:get('O1','.r1cs'),sourceSym:get('O0','.sym'),
    targetSym:get('O1','.sym'),substitutions:get('O1','_substitutions.json')};
}
export function verifyRecord(raw, record) {
  const files = {sourceR1cs:['O0','.r1cs'],targetR1cs:['O1','.r1cs'],sourceSym:['O0','.sym'],
    targetSym:['O1','.sym'],substitutions:['O1','_substitutions.json']};
  for (const [key,[opt,suffix]] of Object.entries(files)) if (digest(raw[key]) !== record.builds.find((b) => b.optimization === opt)?.hashes[suffix])
    throw new Error(`artifact changed: ${key}`);
}
export async function witnessCalculator(fixture,opt,record) {
  const output = folder(fixture.id,opt), jsSuffix = '_js/witness_calculator.js', wasmSuffix = `_js/${fixture.name}.wasm`;
  const jsPath = join(output,fixture.name+jsSuffix), wasm = readFileSync(join(output,fixture.name+wasmSuffix));
  const hashes = record.builds.find((b) => b.optimization === opt).hashes;
  if (digest(readFileSync(jsPath)) !== hashes[jsSuffix] || digest(wasm) !== hashes[wasmSuffix]) throw new Error('witness helper digest mismatch');
  delete require.cache[require.resolve(jsPath)];
  return require(jsPath)(wasm);
}
// Direct R1CS evaluation, independent of polynomial normalization and replay.
export function satisfies(system,w) {
  if (w.length !== system.nVars || w[0] !== 1n || Array.from(w).some((x) => typeof x !== 'bigint' || x < 0n || x >= system.p)) return false;
  const lc = (terms) => terms.reduce((sum,[i,c]) => (sum+c*w[i])%system.p,0n);
  return system.rows.every(([a,b,c]) => lc(a)*lc(b)%system.p === lc(c));
}
export function account(result) {
  if (!result.accepted) throw new Error('cannot account for rejected translation');
  const {source,target,certificate,accounting} = result;
  const unique = (a,n) => a.length === n && new Set(a).size === n && a.every((i) => Number.isInteger(i) && i >= 0 && i < n);
  if (!unique([...certificate.targetToSource,...certificate.steps.map((s) => s.wire)],source.nVars)
    || !unique([...accounting.zeroSourceRows,...accounting.rowMap.map(([i]) => i)],source.rows.length)
    || !unique([...accounting.zeroTargetRows,...accounting.rowMap.map(([,j]) => j)],target.rows.length)) throw new Error('incomplete accounting receipt');
  return {sourceWires:source.nVars,targetWires:target.nVars,sourceRows:source.rows.length,targetRows:target.rows.length,
    eliminated:certificate.steps.reduce((o,s) => (o[s.kind]++,o),{alias:0,constant:0,unused:0}),
    zeroSourceRows:accounting.zeroSourceRows.length,zeroTargetRows:accounting.zeroTargetRows.length,matchedRows:accounting.rowMap.length};
}
export async function transport(fixture,result,record) {
  const inputs = samples(fixture.name);
  if (!inputs.length) return {samples:0,reason:'unsatisfiable public relation; no witness transport instances'};
  const [o0,o1] = await Promise.all(['O0','O1'].map((opt) => witnessCalculator(fixture,opt,record)));
  for (const input of inputs) {
    const w = await o0.calculateWitness(input,true), v = await o1.calculateWitness(input,true);
    const projected = result.project(w), lifted = result.lift(v), k = 1+result.source.public.length;
    const equal = (a,b) => a.length === b.length && a.every((x,i) => x === b[i]);
    if (!satisfies(result.source,w) || !satisfies(result.target,v) || !satisfies(result.target,projected)
      || !satisfies(result.source,lifted) || !equal(projected.slice(0,k),w.slice(0,k))
      || !equal(lifted.slice(0,k),v.slice(0,k)) || !equal(result.project(lifted),v)) throw new Error(`witness transport failed: ${fixture.id}`);
  }
  return {samples:inputs.length,sourceToTarget:true,targetToSource:true};
}
export async function evaluate(manifest) {
  const results = [];
  for (const fixture of corpus) {
    const raw = readArtifacts(fixture), record = manifest.circuits.find((c) => c.id === fixture.id); verifyRecord(raw,record);
    const start = performance.now(), checked = validatePair(raw,fixture), validationMs = performance.now()-start;
    if (!checked.accepted) {
      results.push({id:fixture.id,accepted:false,code:checked.code,reason:checked.reason});
      console.log(`${fixture.id}: REJECT ${checked.code}: ${checked.reason}`); continue;
    }
    const counts = account(checked), witnesses = await transport(fixture,checked,record);
    const result = {id:fixture.id,accepted:true,validationMs,...counts,witnesses,public:checked.source.public,
      hashes:checked.hashes,certificate:checked.certificate,accounting:checked.accounting};
    if (fixture.name === 'inference') {
      // Exact association to the existing audited/proving artifacts, if present.
      result.existingArtifactIdentity = {};
      for (const [key,path] of [['sourceR1cs','build/audit/inference.r1cs'],['targetR1cs','build/inference/inference.r1cs']]) {
        try { result.existingArtifactIdentity[key] = digest(readFileSync(join(root,path))) === checked.hashes[key]; }
        catch (e) { if (e.code !== 'ENOENT') throw e; result.existingArtifactIdentity[key] = null; }
      }
    }
    results.push(result); console.log(`${fixture.id}: ACCEPT ${counts.sourceRows}->${counts.targetRows}, ${witnesses.samples} transport samples`);
  }
  writeFileSync(join(base,'results.json'),json({manifest,results}));
  if (results.some((r) => !r.accepted)) throw new Error('one or more corpus translations rejected; see generated results.json');
  return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await evaluate(build());
