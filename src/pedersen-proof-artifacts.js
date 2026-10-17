import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const profileBytes = await readFile(new URL('../spec/pedersen-proof-system.json',import.meta.url));
const profile = JSON.parse(profileBytes);
export const proofSpec = Object.freeze({...profile, publicSignals:Object.freeze(profile.publicSignals)});
export const profileSha256 = sha256(profileBytes);
export const proofDirectory = fileURLToPath(new URL('../build/pedersen-proofs/',import.meta.url));
export const artifactNames = Object.freeze([
  'pedersen-inference.r1cs','pedersen-inference.wasm','final.ptau',
  'pedersen_final.zkey','verification_key.json',
]);

// Independently selected local configuration, never supplied by the prover.
export async function loadProofArtifacts({proving=false,directory=proofDirectory}={}) {
  const manifest = JSON.parse(await readFile(join(directory,'setup.json'),'utf8'));
  if (manifest.version !== 1 || manifest.variant !== proofSpec.variant ||
      manifest.profileSha256 !== profileSha256 || manifest.protocol !== proofSpec.protocol ||
      manifest.curve !== proofSpec.curve || manifest.snarkjs !== proofSpec.snarkjs ||
      manifest.powersOfTau !== proofSpec.powersOfTau ||
      JSON.stringify(manifest.publicSignals) !== JSON.stringify(proofSpec.publicSignals) ||
      !/^setup-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(manifest.generation) ||
      artifactNames.some((name) => typeof manifest.sha256?.[name] !== 'string' ||
        !/^[0-9a-f]{64}$/.test(manifest.sha256[name])) ||
      manifest.sha256['pedersen-inference.r1cs'] !== proofSpec.r1csSha256 ||
      manifest.sha256['pedersen-inference.wasm'] !== proofSpec.wasmSha256) {
    throw new Error('Invalid local Pedersen setup manifest');
  }
  const files = {};
  for (const name of proving ? artifactNames : ['verification_key.json']) {
    const bytes = await readFile(join(directory,manifest.generation,name));
    if (sha256(bytes) !== manifest.sha256[name]) throw new Error('Setup integrity failure: '+name);
    files[name] = bytes;
  }
  const verificationKey = JSON.parse(files['verification_key.json']);
  if (verificationKey.protocol !== proofSpec.protocol || verificationKey.curve !== proofSpec.curve ||
      verificationKey.nPublic !== 3 || verificationKey.IC?.length !== 4) {
    throw new Error('Unexpected Pedersen verification key interface');
  }
  return {manifest,files,verificationKey,verificationKeySha256:manifest.sha256['verification_key.json']};
}
