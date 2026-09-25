import { curves, groth16, wtns } from 'snarkjs';
import { parseCircuitInput } from './circuit-input.js';
import { parsePublicSignals } from './reference.js';
import { loadProofArtifacts, proofSpec } from './proof-artifacts.js';

// Proof coordinates use the BN254 base field, not the circuit's scalar field.
const BASE_FIELD = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
// snarkjs 0.7.6 calls logger.warn unconditionally for an invalid witness.
const witnessLogger = { info() {}, warn() {}, error() {}, debug() {} };
function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function coordinate(value) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value &&
    value.length <= 77 && BigInt(value) < BASE_FIELD;
}
function g1(point) {
  return Array.isArray(point) && point.length === 3 && coordinate(point[0]) && coordinate(point[1]) && point[2] === '1';
}
function canonicalProof(proof) {
  return exactKeys(proof, ['pi_a', 'pi_b', 'pi_c', 'protocol', 'curve']) &&
    proof.protocol === proofSpec.protocol && proof.curve === proofSpec.curve && g1(proof.pi_a) && g1(proof.pi_c) &&
    Array.isArray(proof.pi_b) && proof.pi_b.length === 3 &&
    proof.pi_b.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every(coordinate)) &&
    proof.pi_b[2][0] === '1' && proof.pi_b[2][1] === '0';
}

// One session per process; operations are sequential. snarkjs caches its curve
// workers globally. Always close the session in finally, including on failure.
export async function openProofSession({ proving = false, directory } = {}) {
  const artifacts = await loadProofArtifacts({ proving, directory });
  const curve = await curves.getCurveFromName(proofSpec.curve);
  let closed = false;
  function checkOpen() { if (closed) throw new Error('Proof session is closed'); }
  async function verify(packet, expectedPublicSignals) {
    checkOpen();
    parsePublicSignals(expectedPublicSignals); // Invalid application configuration is an error.
    try {
      if (!exactKeys(packet, ['proof', 'publicSignals', 'verificationKeySha256']) ||
          packet.verificationKeySha256 !== artifacts.verificationKeySha256 || !canonicalProof(packet.proof)) return false;
      parsePublicSignals(packet.publicSignals);
      if (!packet.publicSignals.every((value, index) => value === expectedPublicSignals[index])) return false;
      return await groth16.verify(artifacts.verificationKey, packet.publicSignals, packet.proof);
    } catch { return false; } // Malformed untrusted proofs must fail closed.
  }
  return {
    verify,
    async prove(rawInput) {
      checkOpen();
      if (!proving) throw new Error('Session has no proving material');
      const input = parseCircuitInput(rawInput);
      const witness = { type: 'mem' };
      await wtns.calculate(input, artifacts.files['inference.wasm'], witness);
      if (!await wtns.check(artifacts.files['inference.r1cs'], witness, witnessLogger)) throw new Error('Witness violates circuit constraints');
      const { proof, publicSignals } = await groth16.prove(artifacts.files['inference_final.zkey'], witness);
      const packet = { proof, publicSignals, verificationKeySha256: artifacts.verificationKeySha256 };
      if (!await verify(packet, [input.commitment, input.label])) throw new Error('Generated proof did not verify');
      return packet;
    },
    async close() { if (!closed) { closed = true; await curve.terminate(); } },
  };
}
