import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from '../../scripts/compiler.js';
import { fixtures, folder, build } from './build.js';
import { validatePair } from './validate.js';
import { hash } from './artifacts.js';

export function readArtifacts(name) {
  const get = (opt,suffix) => readFileSync(join(folder(name,opt),name+suffix));
  return { sourceR1cs:get('O0','.r1cs'), targetR1cs:get('O1','.r1cs'),
    sourceSym:get('O0','.sym'), targetSym:get('O1','.sym'), substitutions:get('O1','_substitutions.json') };
}
export function run() {
  const manifest = build(), results = [];
  for (const fixture of fixtures) {
    const raw = readArtifacts(fixture.name);
    verifyBuildRecord(raw,manifest.circuits.find((c) => c.name === fixture.name));
    const checked = validatePair(raw,fixture);
    if (!checked.accepted) throw new Error(`${fixture.name}: ${checked.code}: ${checked.reason}`);
    const result = { name:fixture.name, accepted:true,
      source:{wires:checked.source.nVars,rows:checked.source.rows.length},
      target:{wires:checked.target.nVars,rows:checked.target.rows.length},
      public:checked.source.public, certificate:checked.certificate, hashes:checked.hashes };
    results.push(result);
    console.log(JSON.stringify(result,(_,v) => typeof v === 'bigint' ? String(v) : v));
  }
  writeFileSync(join(root,'build','translation-stage1','results.json'),
    JSON.stringify({manifest,results},(_,v) => typeof v === 'bigint' ? String(v) : v,2)+'\n');
}
export function verifyBuildRecord(raw,record) {
  const files = {sourceR1cs:['O0','.r1cs'],targetR1cs:['O1','.r1cs'],sourceSym:['O0','.sym'],
    targetSym:['O1','.sym'],substitutions:['O1','_substitutions.json']};
  for (const [key,[opt,suffix]] of Object.entries(files)) {
    if (hash(raw[key]) !== record.builds.find((b) => b.optimization === opt)?.hashes[suffix]) {
      throw new Error(`Artifact changed after compilation: ${key}`);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
