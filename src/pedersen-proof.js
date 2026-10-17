import { curves, groth16, wtns } from 'snarkjs';
import { parseCircuitInput } from './pedersen-circuit-input.js';
import { parsePublicSignals } from './pedersen.js';
import { loadProofArtifacts, proofSpec, profileSha256 } from './pedersen-proof-artifacts.js';

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

// Use one snarkjs session per process and close it in finally. The dependency
// caches curve workers globally; do not overlap with a Poseidon session.
export async function openProofSession({proving=false,directory}={}) {
  const artifacts = await loadProofArtifacts({proving,directory});
  const curve = await curves.getCurveFromName(proofSpec.curve);
  let closed=false, busy=false;
  async function operation(fn) {
    if (closed) throw new Error('Proof session is closed');
    if (busy) throw new Error('Proof session operations must be sequential');
    busy=true;
    try { return await fn(); } finally { busy=false; }
  }
  async function verify(packet,expectedPublicSignals) {
    // Snapshot both sides before the asynchronous subgroup parser runs.
    const expected = structuredClone(expectedPublicSignals);
    let candidate;
    try { candidate=structuredClone(packet); } catch { candidate=undefined; }
    await parsePublicSignals(expected); // Invalid application configuration is an error.
    try {
      if (!exactKeys(candidate,['variant','profileSha256','proof','publicSignals','verificationKeySha256']) ||
          candidate.variant !== proofSpec.variant || candidate.profileSha256 !== profileSha256 ||
          candidate.verificationKeySha256 !== artifacts.verificationKeySha256 ||
          !canonicalProof(candidate.proof)) return false;
      await parsePublicSignals(candidate.publicSignals);
      if (!candidate.publicSignals.every((value,i) => value === expected[i])) return false;
      return await groth16.verify(artifacts.verificationKey,candidate.publicSignals,candidate.proof);
    } catch { return false; }
  }
  return {
    verify: (packet,expected) => operation(() => verify(packet,expected)),
    prove: (rawInput) => operation(async () => {
      if (!proving) throw new Error('Session has no proving material');
      const input = await parseCircuitInput(rawInput);
      const witness = {type:'mem'};
      await wtns.calculate(input,artifacts.files['pedersen-inference.wasm'],witness);
      if (!await wtns.check(artifacts.files['pedersen-inference.r1cs'],witness,witnessLogger)) {
        throw new Error('Witness violates Pedersen circuit constraints');
      }
      const {proof,publicSignals} = await groth16.prove(artifacts.files['pedersen_final.zkey'],witness);
      const packet = {variant:proofSpec.variant,profileSha256,proof,publicSignals,
        verificationKeySha256:artifacts.verificationKeySha256};
      if (!await verify(packet,[input.commitmentX,input.commitmentY,input.label])) {
        throw new Error('Generated Pedersen proof did not verify');
      }
      return packet;
    }),
    async close() {
      if (busy) throw new Error('Cannot close a busy proof session');
      if (!closed) { closed=true; await curve.terminate(); }
    },
  };
}
