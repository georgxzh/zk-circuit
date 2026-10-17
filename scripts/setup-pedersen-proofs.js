import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { curves, powersOfTau, zKey } from 'snarkjs';
import { root } from './compiler.js';
import { artifactNames, loadProofArtifacts, proofDirectory, proofSpec,
  profileSha256, sha256 } from '../src/pedersen-proof-artifacts.js';

const r1cs = await readFile(join(root,'build/pedersen/pedersen-inference.r1cs'));
const wasm = await readFile(join(root,'build/pedersen/pedersen-inference_js/pedersen-inference.wasm'));
for (const [file,expected] of [
  ['spec/model.json',proofSpec.modelSha256],
  ['spec/pedersen-parameters.json',proofSpec.parametersSha256],
]) {
  if (sha256(await readFile(join(root,file))) !== expected) throw new Error('Profile mismatch: '+file);
}
if (sha256(r1cs) !== proofSpec.r1csSha256 || sha256(wasm) !== proofSpec.wasmSha256) {
  throw new Error('Compiled Pedersen artifacts differ from the reviewed proof profile');
}
let exists = true;
try { await readFile(join(proofDirectory,'setup.json')); }
catch (error) { if (error.code === 'ENOENT') exists=false; else throw error; }
// Corrupt/stale configurations fail closed; never silently rotate an existing key.
if (exists) {
  await loadProofArtifacts({proving:true});
  console.log('Existing validated Pedersen setup matches the reviewed profile.');
} else {
  const generation = 'setup-'+randomUUID(), directory = join(proofDirectory,generation);
  await mkdir(directory,{recursive:true});
  const path = (name) => join(directory,name);
  const entropy = () => randomBytes(64).toString('hex');
  const initialTau={type:'mem'}, contributedTau={type:'mem'}, finalTau={type:'mem'};
  const initialKey={type:'mem'}, finalKey={type:'mem'};
  const curve = await curves.getCurveFromName(proofSpec.curve);
  try {
    console.log('Creating local research Pedersen Powers of Tau (power 12).');
    await powersOfTau.newAccumulator(curve,proofSpec.powersOfTau,initialTau);
    await powersOfTau.contribute(initialTau,contributedTau,'Local Pedersen research contribution',entropy());
    await powersOfTau.preparePhase2(contributedTau,finalTau);
    if (!await powersOfTau.verify(finalTau)) throw new Error('Powers of Tau validation failed');
    console.log('Creating and validating the Pedersen circuit-specific Groth16 key.');
    if (await zKey.newZKey(r1cs,finalTau,initialKey) === -1) throw new Error('Key construction failed');
    await zKey.contribute(initialKey,finalKey,'Local Pedersen research contribution',entropy());
    if (!await zKey.verifyFromR1cs(r1cs,finalTau,finalKey)) throw new Error('Key validation failed');
    const vk = await zKey.exportVerificationKey(finalKey);
    if (vk.protocol !== proofSpec.protocol || vk.curve !== proofSpec.curve ||
        vk.nPublic !== 3 || vk.IC.length !== 4) throw new Error('Unexpected Pedersen key interface');
    await writeFile(path('pedersen-inference.r1cs'),r1cs);
    await writeFile(path('pedersen-inference.wasm'),wasm);
    await writeFile(path('final.ptau'),finalTau.data);
    await writeFile(path('pedersen_final.zkey'),finalKey.data);
    await writeFile(path('verification_key.json'),JSON.stringify(vk,null,2)+'\n');
    const hashes = {};
    for (const name of artifactNames) hashes[name]=sha256(await readFile(path(name)));
    const manifest = {version:1,variant:proofSpec.variant,profileSha256,
      protocol:proofSpec.protocol,curve:proofSpec.curve,snarkjs:proofSpec.snarkjs,
      powersOfTau:proofSpec.powersOfTau,publicSignals:proofSpec.publicSignals,generation,sha256:hashes};
    const pending = join(proofDirectory,generation+'.tmp');
    await writeFile(pending,JSON.stringify(manifest,null,2)+'\n');
    await rename(pending,join(proofDirectory,'setup.json'));
    console.log('Validated Pedersen setup selected in ignored build/pedersen-proofs/setup.json.');
  } finally { await curve.terminate(); }
}
