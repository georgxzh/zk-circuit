import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,verifyCompiler,compilerSpec,compilerAsset,digest} from './compiler.js';
import {sourceClosure} from '../research/translation-stage2/build.js';

export const directory=join(root,'build/pedersen-formal');
export const name='pedersen-inference';
export const suffixes=['.r1cs','.sym','_constraints.json','_substitutions.json',
  '_js/pedersen-inference.wasm','_js/witness_calculator.js'];
export function build() {
  const compiler=verifyCompiler();
  execFileSync(process.execPath,['scripts/check-pedersen-parameters.js'],
    {cwd:root,stdio:'inherit',timeout:60000,windowsHide:true});
  const source='circuits/pedersen-inference.circom';
  const sourceHashes=sourceClosure(source);
  const profile=JSON.parse(readFileSync(join(root,'spec/pedersen-proof-system.json')));
  const manifest={compiler:compilerSpec.version,compilerSha256:compilerAsset().sha256,
    node:process.version,platform:process.platform+'-'+process.arch,sourceHashes,
    profileSha256:digest(readFileSync(join(root,'spec/pedersen-proof-system.json'))),
    lockSha256:digest(readFileSync(join(root,'package-lock.json'))),builds:{}};
  for(const opt of ['O0','O1']) {
    const output=join(directory,opt); mkdirSync(output,{recursive:true});
    writeFileSync(join(output,'package.json'),'{"type":"commonjs"}\n');
    execFileSync(compiler,[source,'--r1cs','--sym','--json','--wasm',
      '--simplification_substitution','--'+opt,'--prime','bn128','--sanity_check','2',
      '-l','node_modules','-l','circuits','-o',output],
    {cwd:root,stdio:'pipe',timeout:60000,windowsHide:true});
    manifest.builds[opt]=Object.fromEntries(suffixes.map(s=>[s,digest(readFileSync(join(output,name+s)))]));
  }
  if(manifest.builds.O0['.r1cs'] !== '261008168d9607289322ac4895f555eba84b699b82d102e7742299afce1091ba' ||
    manifest.builds.O1['.r1cs'] !== profile.r1csSha256 ||
    manifest.builds.O1['_js/pedersen-inference.wasm'] !== profile.wasmSha256) {
    throw new Error('Formal artifacts differ from the reviewed EC3/EC4 circuit');
  }
  if(JSON.stringify(sourceHashes)!==JSON.stringify(sourceClosure(source))) throw new Error('Source changed during build');
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log('Pedersen formal O0/O1 artifacts match the reviewed circuit.');
  return manifest;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) build();
