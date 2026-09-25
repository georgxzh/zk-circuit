import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { curves, powersOfTau, zKey } from 'snarkjs';
import { root } from './compiler.js';
import { artifactNames, loadProofArtifacts, proofDirectory, proofSpec, sha256 } from '../src/proof-artifacts.js';

const r1cs = await readFile(join(root, 'build/inference/inference.r1cs'));
const wasm = await readFile(join(root, 'build/inference/inference_js/inference.wasm'));
let manifestExists = true;
try { await readFile(join(proofDirectory, 'setup.json')); }
catch (error) { if (error.code === 'ENOENT') manifestExists = false; else throw error; }
// Missing or corrupted artifacts in an existing setup must not silently rotate keys.
const existing = manifestExists ? await loadProofArtifacts({ proving: true }) : undefined;
if (existing && existing.manifest.sha256['inference.r1cs'] === sha256(r1cs) &&
    existing.manifest.sha256['inference.wasm'] === sha256(wasm)) {
  console.log('Existing validated demonstration setup matches the compiled circuit.');
} else {
  const generation = `setup-${randomUUID()}`;
  const directory = join(proofDirectory, generation);
  await mkdir(directory, { recursive: true });
  const path = (name) => join(directory, name);
  await writeFile(path('inference.r1cs'), r1cs);
  await writeFile(path('inference.wasm'), wasm);
  const entropy = () => randomBytes(64).toString('hex');
  // Memory-backed snarkjs files avoid upstream file-handle leaks on Node 26.
  // Persist only public setup material and keys, using explicitly closed fs APIs.
  const initialTau = { type: 'mem' }, contributedTau = { type: 'mem' }, finalTau = { type: 'mem' };
  const initialKey = { type: 'mem' }, finalKey = { type: 'mem' };
  const curve = await curves.getCurveFromName(proofSpec.curve);
  try {
    console.log('Creating a local demonstration Powers of Tau contribution (power 11).');
    await powersOfTau.newAccumulator(curve, proofSpec.powersOfTau, initialTau);
    await powersOfTau.contribute(initialTau, contributedTau, 'Local research contribution', entropy());
    await powersOfTau.preparePhase2(contributedTau, finalTau);
    if (!await powersOfTau.verify(finalTau)) throw new Error('Powers of Tau validation failed');
    console.log('Creating and validating the circuit-specific Groth16 key.');
    if (await zKey.newZKey(r1cs, finalTau, initialKey) === -1) {
      throw new Error('Groth16 key construction failed');
    }
    await zKey.contribute(initialKey, finalKey, 'Local research contribution', entropy());
    if (!await zKey.verifyFromR1cs(r1cs, finalTau, finalKey)) {
      throw new Error('Groth16 key validation failed');
    }
    const vk = await zKey.exportVerificationKey(finalKey);
    if (vk.protocol !== proofSpec.protocol || vk.curve !== proofSpec.curve || vk.nPublic !== 2 || vk.IC.length !== 3) {
      throw new Error('Unexpected verification key interface');
    }
    await writeFile(path('verification_key.json'), `${JSON.stringify(vk, null, 2)}\n`);
    await writeFile(path('final.ptau'), finalTau.data);
    await writeFile(path('inference_final.zkey'), finalKey.data);
    const hashes = {};
    for (const name of artifactNames) hashes[name] = sha256(await readFile(path(name)));
    const manifest = { version: 1, protocol: proofSpec.protocol, curve: proofSpec.curve,
      snarkjs: proofSpec.snarkjs, generation, powersOfTau: proofSpec.powersOfTau, sha256: hashes };
    const pending = join(proofDirectory, `${generation}.tmp`);
    await writeFile(pending, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(pending, join(proofDirectory, 'setup.json'));
    console.log('Validated setup selected in build/proofs/setup.json. All setup files are ignored by Git.');
  } finally {
    await curve.terminate();
  }
}
