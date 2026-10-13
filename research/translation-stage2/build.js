import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, verifyCompiler, compilerSpec, compilerAsset, digest } from '../../scripts/compiler.js';
import { checkPoseidonSources } from '../../scripts/check-poseidon.js';
import { corpus } from './corpus.js';

export const base = join(root,'build','translation-stage2');
export const folder = (id,opt) => join(base,id,opt);
export const suffixes = (name) => ['.r1cs','.sym','_constraints.json','_substitutions.json',
  `_js/${name}.wasm`,`_js/witness_calculator.js`];

// This hashes the include closure of these reviewed fixtures; it is not a Circom parser.
export function sourceClosure(source) {
  const files = new Map();
  function visit(file) {
    const key = relative(root,file).replaceAll('\\','/');
    if (key.startsWith('../') || key === '..') throw new Error('source outside repository');
    if (files.has(key)) return;
    const bytes = readFileSync(file); files.set(key,digest(bytes));
    const text = bytes.toString('utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,'');
    for (const [,name] of text.matchAll(/\binclude\s+"([^"\r\n]+)"\s*;/g)) {
      const found = [dirname(file),join(root,'node_modules'),join(root,'circuits')]
        .map((dir) => resolve(dir,name)).find(existsSync);
      if (!found) throw new Error(`missing source dependency ${name}`); visit(found);
    }
  }
  visit(resolve(root,source)); return Object.fromEntries([...files].sort(([a],[b]) => a.localeCompare(b)));
}

export function build() {
  const compiler = verifyCompiler(); checkPoseidonSources(); mkdirSync(base,{recursive:true});
  // Invalidate only this experiment's generated receipts before a fresh attempt.
  for (const name of ['manifest.json','results.json']) rmSync(join(base,name),{force:true});
  const manifest = {compiler:compilerSpec.version,compilerSHA256:compilerAsset().sha256,
    node:process.version,platform:`${process.platform}-${process.arch}`,prime:'bn128',
    lockSHA256:digest(readFileSync(join(root,'package-lock.json'))),circuits:[]};
  for (const fixture of corpus) {
    const record = {...fixture,sourceHashes:sourceClosure(fixture.source),builds:[]};
    for (const opt of ['O0','O1']) {
      const output = folder(fixture.id,opt); mkdirSync(output,{recursive:true});
      writeFileSync(join(output,'package.json'),'{"type":"commonjs"}\n');
      const args = [resolve(root,fixture.source),'--r1cs','--sym','--json','--wasm','--simplification_substitution',
        `--${opt}`,'--prime','bn128','--sanity_check',String(fixture.sanity),
        '-l',join(root,'node_modules'),'-l',join(root,'circuits'),'-o',output];
      const start = performance.now();
      execFileSync(compiler,args,{cwd:root,stdio:'pipe',timeout:60000,windowsHide:true});
      const hashes = Object.fromEntries(suffixes(fixture.name).map((suffix) =>
        [suffix,digest(readFileSync(join(output,fixture.name+suffix)))]));
      record.builds.push({optimization:opt,sanity:fixture.sanity,ms:performance.now()-start,hashes});
    }
    if (JSON.stringify(record.sourceHashes) !== JSON.stringify(sourceClosure(fixture.source))) throw new Error('source changed during build');
    manifest.circuits.push(record); console.log(`Compiled ${fixture.id}: O0/O1`);
  }
  writeFileSync(join(base,'manifest.json'),JSON.stringify(manifest,null,2)+'\n'); return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
