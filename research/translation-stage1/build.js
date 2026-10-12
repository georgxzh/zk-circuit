import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, verifyCompiler, compilerSpec, compilerAsset, digest } from '../../scripts/compiler.js';

export const fixtures = [
  { name:'alias', outputs:[], inputs:['main.a'] },
  { name:'interface', outputs:['main.out'], inputs:['main.a','main.b','main.c'] },
  { name:'nonunique', outputs:[], inputs:['main.a'] },
];
export const folder = (name, opt) => join(root,'build','translation-stage1',name,opt);
export function build() {
  const compiler = verifyCompiler();
  const manifest = { compiler:compilerSpec.version, compilerSHA256:compilerAsset().sha256,
    prime:'bn128', sanityCheck:2, outputs:['r1cs','sym','json','simplification_substitution'], circuits:[] };
  for (const {name} of fixtures) {
    const source = `research/translation-stage1/circuits/${name}.circom`;
    const record = { name, sourceSHA256:digest(readFileSync(join(root,source))), builds:[] };
    for (const opt of ['O0','O1']) {
      const output = folder(name,opt);
      mkdirSync(output,{recursive:true});
      const args = [source,'--r1cs','--sym','--json','--simplification_substitution',
        `--${opt}`,'--prime','bn128','--sanity_check','2','-o',output];
      execFileSync(compiler,args,{cwd:root,stdio:'pipe',timeout:60000,windowsHide:true});
      const hashes = Object.fromEntries(['.r1cs','.sym','_constraints.json','_substitutions.json']
        .map((suffix) => [suffix,digest(readFileSync(join(output,name+suffix)))]));
      record.builds.push({ optimization:opt, hashes });
      console.log(`Compiled ${name} --${opt}`);
    }
    manifest.circuits.push(record);
  }
  writeFileSync(join(root,'build','translation-stage1','manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
