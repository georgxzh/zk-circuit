import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { curves, groth16, powersOfTau, wtns, zKey } from 'snarkjs';
import { loadProofArtifacts, proofSpec } from '../src/proof-artifacts.js';
import { circuitInput } from '../src/circuit-input.js';
import { openProofSession } from '../src/proof.js';

let jobText = '';
for await (const chunk of process.stdin) jobText += chunk;
const job = JSON.parse(jobText);
const config = JSON.parse(await readFile(new URL('../spec/benchmark.json', import.meta.url)));
const { vectors } = JSON.parse(await readFile(new URL('../spec/commitment-vectors.json', import.meta.url)));
const logger = { info() {}, warn() {}, debug() {}, error() {} };
const result = { mode: job.mode };
async function timed(record, name, fn) {
  const start = performance.now();
  const value = await fn();
  record[name] = performance.now()-start;
  return value;
}
const mem = () => ({ type: 'mem' });
let curve, session;
try {
  if (job.mode === 'setup') {
    const r1cs = await timed(result, 'artifactLoadMs', () => readFile(job.r1cs));
    curve = await timed(result, 'curveInitMs', () => curves.getCurveFromName(proofSpec.curve));
    result.curveConcurrency = curve.tm.concurrency;
    const t0 = mem(), t1 = mem(), t2 = mem(), k0 = mem(), k1 = mem();
    const entropy = () => randomBytes(64).toString('hex');
    const begin = performance.now();
    const phase = async (name, fn) => {
      console.error(`setup: ${name}`);
      return timed(result, name, fn);
    };
    await phase('tauNewMs', () => powersOfTau.newAccumulator(curve, proofSpec.powersOfTau, t0));
    await phase('tauContributeMs', () => powersOfTau.contribute(t0, t1, 'Synthetic benchmark contribution', entropy()));
    await phase('tauPrepareMs', () => powersOfTau.preparePhase2(t1, t2));
    assert.equal(await phase('tauVerifyMs', () => powersOfTau.verify(t2)), true);
    assert.notEqual(await phase('keyNewMs', () => zKey.newZKey(r1cs, t2, k0)), -1);
    await phase('keyContributeMs', () => zKey.contribute(k0, k1, 'Synthetic benchmark contribution', entropy()));
    assert.equal(await phase('keyVerifyMs', () => zKey.verifyFromR1cs(r1cs, t2, k1)), true);
    const vk = await phase('keyExportMs', () => zKey.exportVerificationKey(k1));
    assert.equal(vk.nPublic, 2);
    assert.equal(vk.protocol, proofSpec.protocol);
    assert.equal(vk.curve, proofSpec.curve);
    result.setupCoreMs = performance.now()-begin;
    result.artifactBytes = { ptau: t2.data.length, zkey: k1.data.length,
      verificationKeyCompactJson: Buffer.byteLength(JSON.stringify(vk)) };
  } else if (job.mode === 'prover') {
    const artifacts = await timed(result, 'artifactLoadMs', () => loadProofArtifacts({ proving: true }));
    curve = await timed(result, 'curveInitMs', () => curves.getCurveFromName(proofSpec.curve));
    result.curveConcurrency = curve.tm.concurrency;
    const packets = new Map();
    async function run(v) {
      const sample = { fixture: v.id };
      const input = circuitInput(v.x, BigInt(v.salt), [v.commitment, v.label]);
      const witness = mem();
      await timed(sample, 'witnessMs', () => wtns.calculate(input, artifacts.files['inference.wasm'], witness));
      assert.equal(await timed(sample, 'constraintCheckMs', () => wtns.check(artifacts.files['inference.r1cs'], witness, logger)), true);
      const { proof, publicSignals } = await timed(sample, 'proveMs', () => groth16.prove(artifacts.files['inference_final.zkey'], witness));
      assert.deepEqual(publicSignals, [v.commitment, v.label]);
      // Untimed correctness guard; this worker's memory includes self-verification.
      assert.equal(await groth16.verify(artifacts.verificationKey, publicSignals, proof), true);
      const packet = { proof, publicSignals, verificationKeySha256: artifacts.verificationKeySha256 };
      sample.proofJsonBytes = Buffer.byteLength(JSON.stringify(proof));
      sample.publicSignalsJsonBytes = Buffer.byteLength(JSON.stringify(publicSignals));
      sample.packetJsonBytes = Buffer.byteLength(JSON.stringify(packet));
      packets.set(v.id, { fixture: v.id, packet });
      return sample;
    }
    result.cold = await run(vectors[0]);
    for (let i = 0; i < config.warmupCycles; i++) for (const v of vectors) await run(v);
    result.samples = [];
    for (let i = 0; i < config.measuredCycles; i++) for (const v of vectors) result.samples.push(await run(v));
    // Only public synthetic proof packets are persisted, under ignored build/.
    await writeFile(job.packets, JSON.stringify([...packets.values()]));
  } else if (job.mode === 'verifier') {
    const packets = JSON.parse(await readFile(job.packets));
    assert.deepEqual(packets.map((entry) => entry.fixture), vectors.map((v) => v.id));
    session = await timed(result, 'sessionInitMs', () => openProofSession());
    async function run(entry, v) {
      const sample = { fixture: v.id };
      assert.equal(await timed(sample, 'verifyMs', () => session.verify(entry.packet, [v.commitment, v.label])), true);
      return sample;
    }
    result.cold = await run(packets[0], vectors[0]);
    for (let i = 0; i < config.warmupCycles; i++) for (let j = 0; j < vectors.length; j++) await run(packets[j], vectors[j]);
    result.samples = [];
    for (let i = 0; i < config.measuredCycles; i++) for (let j = 0; j < vectors.length; j++) result.samples.push(await run(packets[j], vectors[j]));
    // Confirm the measurement path also rejects a wrong application expectation.
    assert.equal(await session.verify(packets[0].packet, [vectors[0].commitment, '0']), false);
  } else {
    throw new Error('Unknown benchmark mode');
  }
} finally {
  if (session) await session.close();
  else if (curve) await curve.terminate();
}
result.peakRssBytes = process.resourceUsage().maxRSS*1024;
assert.ok(Number.isFinite(result.peakRssBytes) && result.peakRssBytes > 0);
console.log(JSON.stringify(result));
