import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { groth16, wtns, zKey } from 'snarkjs';
import { openProofSession } from '../src/proof.js';
import { artifactNames, loadProofArtifacts, proofDirectory } from '../src/proof-artifacts.js';
import { circuitInput } from '../src/circuit-input.js';
import { FIELD_MODULUS } from '../src/reference.js';
import { root } from '../scripts/compiler.js';

const { vectors } = JSON.parse(await readFile(new URL('../spec/commitment-vectors.json', import.meta.url)));
const clone = (value) => structuredClone(value);
const signals = (v) => [v.commitment, v.label];
const input = (v) => circuitInput(v.x, BigInt(v.salt), signals(v));
let session, artifacts;
const packets = new Map();
const witnessLogger = { info() {}, warn() {}, error() {}, debug() {} };
before(async () => {
  artifacts = await loadProofArtifacts({ proving: true });
  session = await openProofSession({ proving: true });
});
after(async () => { await session?.close(); });

test('Groth16 proves and verifies all nine specified commitment fixtures', async () => {
  assert.equal(vectors.length, 9);
  for (const v of vectors) {
    const packet = await session.prove(input(v));
    assert.deepEqual(packet.publicSignals, signals(v), v.id);
    assert.equal(await session.verify(packet, signals(v)), true, v.id);
    assert.deepEqual(Object.keys(packet).sort(), ['proof', 'publicSignals', 'verificationKeySha256']);
    packets.set(v.id, packet);
  }
});

test('repeated proving uses fresh randomness for the same public statement', async () => {
  const again = await session.prove(input(vectors[0]));
  assert.deepEqual(again.publicSignals, packets.get('positive').publicSignals);
  assert.notDeepEqual(again.proof, packets.get('positive').proof);
});

test('incorrect labels and commitments fail witness generation for a fixed opening', async () => {
  for (const v of vectors.slice(0, 3)) {
    const wrong = input(v);
    wrong.label = v.label === '1' ? '0' : '1';
    await assert.rejects(session.prove(wrong), undefined, `flipped ${v.id} label`);
  }
  const wrong = input(vectors[0]);
  wrong.commitment = ((BigInt(wrong.commitment) + 1n) % FIELD_MODULUS).toString();
  await assert.rejects(session.prove(wrong));
});

test('out-of-range private inputs are rejected by the parser and raw witness calculator', async () => {
  for (let i = 0; i < 4; i++) {
    for (const value of ['16', (FIELD_MODULUS - 1n).toString()]) {
      const invalid = input(vectors[0]);
      invalid.u[i] = value;
      await assert.rejects(session.prove(invalid));
      await assert.rejects(wtns.calculate(invalid, artifacts.files['inference.wasm'], { type: 'mem' }));
    }
  }
  for (const x of [[-9, 0, 0, 0], [8, 0, 0, 0]]) {
    assert.throws(() => circuitInput(x, 0n, signals(vectors[0])));
  }
  const alias = input(vectors[0]);
  alias.u[0] = (FIELD_MODULUS + 9n).toString();
  await assert.rejects(session.prove(alias));
});

test('snarkjs checks the actual R1CS before proving and rejects a changed public witness wire', async () => {
  const witness = { type: 'mem' };
  await wtns.calculate(input(vectors[0]), artifacts.files['inference.wasm'], witness);
  assert.equal(await wtns.check(artifacts.files['inference.r1cs'], witness, witnessLogger), true);
  // WTNS v2: locate section 2, then flip the label at witness index 2.
  // This bypasses the parser and witness generator entirely.
  const data = Buffer.from(witness.data);
  assert.equal(data.subarray(0, 4).toString(), 'wtns');
  assert.equal(data.readUInt32LE(4), 2);
  let offset = 12, found = false;
  for (let i = 0; i < data.readUInt32LE(8); i++) {
    const section = data.readUInt32LE(offset);
    const length = Number(data.readBigUInt64LE(offset + 4));
    offset += 12;
    if (section === 2) {
      assert.equal(data[offset + 64], 1); // 32-byte field elements; public label was 1.
      data[offset + 64] = 0;
      found = true;
    }
    offset += length;
  }
  assert.equal(found, true);
  assert.equal(await wtns.check(artifacts.files['inference.r1cs'], data, witnessLogger), false);
  // Low-level prove can operate on an invalid witness: verification is decisive.
  const invalid = await groth16.prove(artifacts.files['inference_final.zkey'], data);
  assert.equal(await groth16.verify(artifacts.verificationKey, invalid.publicSignals, invalid.proof), false);
});

test('verifier rejects altered public signals, wrong expected statements, and malformed transports', async () => {
  const original = packets.get('positive');
  const expected = signals(vectors[0]);
  const wrongCommitment = ((BigInt(expected[0]) + 1n) % FIELD_MODULUS).toString();
  // Check cryptographic rejection too, without the application's equality guard.
  for (const changed of [[wrongCommitment, '1'], [expected[0], '0']]) {
    assert.equal(await groth16.verify(artifacts.verificationKey, changed, original.proof), false);
    assert.equal(await session.verify({ ...original, publicSignals: changed }, changed), false);
    assert.equal(await session.verify(original, changed), false);
  }
  for (const changed of [[], [expected[0]], [...expected, '0'], [...expected].reverse(),
    [expected[0], '2'], [expected[0], 1], [FIELD_MODULUS.toString(), '1'],
    [(BigInt(expected[0]) + FIELD_MODULUS).toString(), '1'], [`0${expected[0]}`, '1'], [`${expected[0]}\n`, '1']]) {
    assert.equal(await session.verify({ ...original, publicSignals: changed }, expected), false);
  }
  await assert.rejects(session.verify(original, [expected[0], '2']));
  assert.equal(await session.verify(null, expected), false);
  assert.equal(await session.verify({ ...original, salt: '0' }, expected), false);
});

test('verifier rejects modified proof points, malformed curves, and substituted key identities', async () => {
  const original = packets.get('positive');
  const expected = signals(vectors[0]);
  const changes = [
    (p) => { p.proof.pi_a = p.proof.pi_c; },
    (p) => { p.proof.pi_a[0] = '-1'; },
    (p) => { p.proof.pi_a[0] = '0'.repeat(1000); },
    (p) => { p.proof.pi_a[0] = '21888242871839275222246405745257275088696311157297823662689037894645226208583'; },
    (p) => { p.proof.pi_a = ['0', '0', '1']; },
    (p) => { p.proof.pi_b[2] = ['0', '0']; },
    (p) => { p.proof.curve = 'bls12381'; },
    (p) => { p.proof.protocol = 'plonk'; },
    (p) => { p.verificationKeySha256 = '0'.repeat(64); },
    (p) => { p.verificationKey = artifacts.verificationKey; },
  ];
  for (const change of changes) {
    const modified = clone(original);
    change(modified);
    assert.equal(await session.verify(modified, expected), false);
  }
  const otherKeyFile = { type: 'mem' };
  await zKey.contribute(artifacts.files['inference_final.zkey'], otherKeyFile, 'Synthetic rejection test', randomBytes(64).toString('hex'));
  const otherKey = await zKey.exportVerificationKey(otherKeyFile);
  assert.equal(await groth16.verify(otherKey, original.publicSignals, original.proof), false);
});

test('artifact loading detects corrupted keys and supports verification without proving material', async () => {
  const directory = await mkdtemp(join(proofDirectory, 'test-integrity-'));
  const generation = join(directory, artifacts.manifest.generation);
  await mkdir(generation);
  await writeFile(join(directory, 'setup.json'), JSON.stringify(artifacts.manifest));
  await writeFile(join(generation, 'verification_key.json'), artifacts.files['verification_key.json']);
  const loaded = await loadProofArtifacts({ directory });
  assert.equal(loaded.verificationKeySha256, artifacts.verificationKeySha256);
  await assert.rejects(loadProofArtifacts({ directory, proving: true }));
  for (const name of artifactNames) await writeFile(join(generation, name), artifacts.files[name]);
  await writeFile(join(generation, 'inference_final.zkey'), 'corrupted');
  await assert.rejects(loadProofArtifacts({ directory, proving: true }), /integrity failure/);
  await writeFile(join(generation, 'verification_key.json'), '{}');
  await assert.rejects(loadProofArtifacts({ directory }), /integrity failure/);
});

test('CLI proves from private stdin, verifies against explicit expected signals, and fails closed', () => {
  const run = (args, stdin) => spawnSync(process.execPath, ['scripts/proof-cli.js', ...args], {
    cwd: root, input: stdin, encoding: 'utf8', timeout: 120000, windowsHide: true,
  });
  const proved = run(['prove'], JSON.stringify(input(vectors[0])));
  assert.equal(proved.status, 0, proved.stderr);
  assert.equal(proved.stderr, '');
  const packet = JSON.parse(proved.stdout);
  assert.deepEqual(Object.keys(packet).sort(), ['proof', 'publicSignals', 'verificationKeySha256']);
  const valid = run(['verify', ...signals(vectors[0])], proved.stdout);
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), { verified: true });
  const invalid = run(['verify', vectors[0].commitment, '0'], proved.stdout);
  assert.equal(invalid.status, 1);
  assert.deepEqual(JSON.parse(invalid.stdout), { verified: false });
  for (const [args, stdin] of [[['verify'], '{}'], [['prove'], 'PRIVATE_SENTINEL'],
    [['prove'], JSON.stringify({ ...input(vectors[0]), label: '0' })]]) {
    const rejected = run(args, stdin);
    assert.equal(rejected.status, 1);
    assert.equal(rejected.stdout, '');
    assert.match(rejected.stderr, /Proof command failed/);
    assert.doesNotMatch(rejected.stderr, /PRIVATE_SENTINEL/);
  }
});
