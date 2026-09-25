import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const proofDirectory = fileURLToPath(new URL('../build/proofs/', import.meta.url));
export const proofSpec = JSON.parse(await readFile(new URL('../spec/proof-system.json', import.meta.url)));
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const artifactNames = ['inference.r1cs', 'inference.wasm', 'final.ptau', 'inference_final.zkey', 'verification_key.json'];

// This locally selected manifest is trusted application configuration. Never
// obtain it (or a substitute verification key) from an untrusted proof packet.
export async function loadProofArtifacts({ proving = false, directory = proofDirectory } = {}) {
  const manifest = JSON.parse(await readFile(join(directory, 'setup.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.protocol !== proofSpec.protocol ||
      manifest.curve !== proofSpec.curve || manifest.snarkjs !== proofSpec.snarkjs ||
      !/^setup-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(manifest.generation)) {
    throw new Error('Invalid local setup manifest');
  }
  const names = proving ? artifactNames : ['verification_key.json'];
  const files = {};
  for (const name of names) {
    const bytes = await readFile(join(directory, manifest.generation, name));
    if (sha256(bytes) !== manifest.sha256?.[name]) throw new Error(`Setup integrity failure: ${name}`);
    files[name] = bytes;
  }
  const verificationKey = JSON.parse(files['verification_key.json']);
  if (verificationKey.protocol !== proofSpec.protocol || verificationKey.curve !== proofSpec.curve ||
      verificationKey.nPublic !== 2 || verificationKey.IC?.length !== 3) {
    throw new Error('Unexpected verification key interface');
  }
  return { manifest, files, verificationKey, verificationKeySha256: manifest.sha256['verification_key.json'] };
}
