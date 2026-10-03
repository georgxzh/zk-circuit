import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { root, verifyCompiler, compilerSpec, compilerAsset, digest } from './compiler.js';
import { checkPoseidonSources } from './check-poseidon.js';
import { loadProofArtifacts } from '../src/proof-artifacts.js';
import { summarize, summarizeRecords } from './benchmark-stats.js';

const config = JSON.parse(await readFile(join(root, 'spec/benchmark.json')));
const compiler = verifyCompiler();
checkPoseidonSources();
const artifacts = await loadProofArtifacts({ proving: true });
const selectedManifestBefore = await readFile(join(root, 'build/proofs/setup.json'));
const parent = join(root, 'build/benchmarks');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, 'run-'));
const raw = { startedUtc: new Date().toISOString(), compile: [], setup: [], prover: [], verifier: [] };

function run(executable, args, input, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const child = spawn(executable, args, { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Benchmark child timed out')); }, timeout);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Benchmark child failed (${code}): ${stderr.slice(-1000)}`));
      else resolve({ stdout, wallMs: performance.now()-start });
    });
    child.stdin.end(input);
  });
}
async function worker(job) {
  const output = await run(process.execPath, ['scripts/benchmark-worker.js'], JSON.stringify(job));
  return { ...JSON.parse(output.stdout), processWallMs: output.wallMs };
}
for (let i = 0; i < config.compilationProcesses; i++) {
  console.log(`Compilation ${i+1}/${config.compilationProcesses} (fresh process, O1).`);
  const outputDirectory = join(directory, `compile-${i}`);
  await mkdir(outputDirectory);
  const output = await run(compiler, ['circuits/inference.circom', ...config.compilerFlags,
    '-l', 'node_modules', '-l', 'circuits', '-o', outputDirectory], undefined, 60000);
  assert.equal(digest(await readFile(join(outputDirectory, 'inference.r1cs'))), artifacts.manifest.sha256['inference.r1cs']);
  assert.equal(digest(await readFile(join(outputDirectory, 'inference_js/inference.wasm'))), artifacts.manifest.sha256['inference.wasm']);
  const number = (label) => {
    const match = new RegExp(`(?:^|\\n)${label}: (\\d+)`).exec(output.stdout);
    assert.ok(match, `Missing compiler statistic ${label}`);
    return Number(match[1]);
  };
  raw.compile.push({ wallMs: output.wallMs, nonlinear: number('non-linear constraints'), linear: number('linear constraints'),
    publicInputs: number('public inputs'), privateInputs: number('private inputs'), outputs: number('public outputs'), wires: number('wires') });
}
const r1csPath = join(directory, 'compile-0/inference.r1cs');
for (let i = 0; i < config.setupProcesses; i++) {
  console.log(`Fresh demonstration setup ${i+1}/${config.setupProcesses}; does not rotate the selected key.`);
  raw.setup.push(await worker({ mode: 'setup', r1cs: r1csPath }));
}
for (let i = 0; i < config.inferenceProcesses; i++) {
  const packets = join(directory, `packets-${i}.json`);
  console.log(`Prover process ${i+1}/${config.inferenceProcesses}: cold call, warm-up, repeated fixtures.`);
  raw.prover.push(await worker({ mode: 'prover', packets }));
  console.log(`Verifier process ${i+1}/${config.inferenceProcesses}: verification-only memory measurement.`);
  raw.verifier.push(await worker({ mode: 'verifier', packets }));
}
assert.deepEqual(await readFile(join(root, 'build/proofs/setup.json')), selectedManifestBefore);
const proofs = raw.prover.flatMap((r) => r.samples), verifications = raw.verifier.flatMap((r) => r.samples);
const fixtureIds = [...new Set(proofs.map((r) => r.fixture))];
assert.equal(fixtureIds.length, 9);
assert.equal(proofs.length, config.inferenceProcesses*config.measuredCycles*9);
assert.equal(verifications.length, proofs.length);
const statistics = {};
statistics.compilationFreshMs = summarizeRecords(raw.compile, 'wallMs');
for (const field of ['artifactLoadMs', 'curveInitMs', 'tauNewMs', 'tauContributeMs', 'tauPrepareMs', 'tauVerifyMs',
  'keyNewMs', 'keyContributeMs', 'keyVerifyMs', 'keyExportMs', 'setupCoreMs', 'processWallMs', 'peakRssBytes']) {
  statistics[`setup.${field}`] = summarizeRecords(raw.setup, field);
}
for (const field of ['witnessMs', 'constraintCheckMs', 'proveMs']) {
  statistics[`cold.${field}`] = summarize(raw.prover.map((r) => r.cold[field]));
  statistics[`warm.${field}`] = summarizeRecords(proofs, field);
}
statistics['cold.verifyMs'] = summarize(raw.verifier.map((r) => r.cold.verifyMs));
statistics['warm.verifyMs'] = summarizeRecords(verifications, 'verifyMs');
for (const field of ['proofJsonBytes', 'publicSignalsJsonBytes', 'packetJsonBytes']) statistics[field] = summarizeRecords(proofs, field);
for (const field of ['artifactLoadMs', 'curveInitMs', 'peakRssBytes', 'processWallMs']) statistics[`prover.${field}`] = summarizeRecords(raw.prover, field);
for (const field of ['sessionInitMs', 'peakRssBytes', 'processWallMs']) statistics[`verifier.${field}`] = summarizeRecords(raw.verifier, field);
const perFixture = Object.fromEntries(fixtureIds.map((id) => [id, {
  proveMs: summarizeRecords(proofs.filter((r) => r.fixture === id), 'proveMs'),
  verifyMs: summarizeRecords(verifications.filter((r) => r.fixture === id), 'verifyMs'),
}]));
const sourceHashes = {};
for (const name of ['circuits/inference.circom', 'circuits/bounded-linear.circom', 'spec/model.json', 'spec/benchmark.json',
  'spec/poseidon-provenance.json', 'package-lock.json', 'scripts/benchmark.js', 'scripts/benchmark-worker.js',
  'scripts/benchmark-stats.js', 'src/proof.js', 'src/proof-artifacts.js']) {
  sourceHashes[name] = digest(await readFile(join(root, name)));
}
const packageJson = JSON.parse(await readFile(join(root, 'package.json')));
const summary = {
  protocolVersion: config.protocolVersion, measuredAtUtc: raw.startedUtc, configuration: config,
  environment: { os: os.type(), osRelease: os.release(), platform: process.platform, architecture: process.arch,
    cpuModel: os.cpus()[0].model, logicalCpus: os.cpus().length, availableParallelism: os.availableParallelism(),
    totalMemoryBytes: os.totalmem(), node: process.version, packageManager: packageJson.packageManager,
    circom: compilerSpec.version, compilerSha256: compilerAsset().sha256, snarkjs: packageJson.dependencies.snarkjs,
    curveConcurrency: raw.prover.map((r) => r.curveConcurrency) },
  sourceBaseCommit: execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/').replace(/\/$/, '')}`, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
  sourceHashes, artifacts: { r1csSha256: artifacts.manifest.sha256['inference.r1cs'], wasmSha256: artifacts.manifest.sha256['inference.wasm'],
    constraints: raw.compile[0], setupArtifactBytes: raw.setup.map((r) => r.artifactBytes) },
  statistics, perFixture,
  notes: [
    'Sequential local measurements; OS caches are not flushed and CPU scheduling is not isolated.',
    'Cold means first operation after explicit artifact/curve initialization in a new worker, not reboot-cold.',
    'Warm pooled observations are repeated measurements in three processes, not independent machine trials.',
    'Peak RSS is a process-lifetime high-water mark including imports, buffers, runtime and worker threads.',
    'Prover peak includes witness generation, R1CS checking, proving and untimed self-verification. Verifier process has no proving key.',
    'Native compiler memory and coordinator memory are not measured; child-process memory is never added to a parent RSS.',
    'Setup is single-machine demonstration work in memory, including consistency validation, excluding persistence and secure erasure guarantees.',
    'JSON proof size excludes public signals and packet metadata; no compressed proof encoding is implemented.',
  ],
};
await writeFile(join(directory, 'raw.json'), `${JSON.stringify(raw, null, 2)}\n`);
await writeFile(join(directory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Benchmark complete: ${directory}`);
console.log(JSON.stringify({ compileMedianMs: statistics.compilationFreshMs.median,
  setupMedianMs: statistics['setup.setupCoreMs'].median, proveMedianMs: statistics['warm.proveMs'].median,
  verifyMedianMs: statistics['warm.verifyMs'].median, proofBytes: statistics.proofJsonBytes }, null, 2));
