// EC1-only public parameter audit. No commitment/opening API or private data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildPedersenHash } from 'circomlibjs';
import createBlakeHash from 'blake-hash/js.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url));
const json = (path) => JSON.parse(read(path));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const spec = json('spec/pedersen-parameters.json');
const provenance = json('spec/pedersen-provenance.json');
const lock = json('package-lock.json');
const model = json('spec/model.json');

for (const [name, pin] of Object.entries(provenance.packages)) {
  const installed = json('node_modules/' + name + '/package.json');
  const locked = lock.packages['node_modules/' + name];
  assert.equal(installed.version, pin.version, name);
  assert.equal(locked.version, pin.version, name);
  assert.equal(locked.integrity, pin.integrity, name);
  assert.equal(locked.resolved, pin.tarball, name);
}
for (const file of provenance.files) {
  assert.equal(sha256(read('node_modules/' + file.package + '/' + file.path)), file.sha256, file.path);
}

const p = BigInt(spec.coordinateField), ell = BigInt(spec.curve.subgroupOrder);
const a = BigInt(spec.curve.a), d = BigInt(spec.curve.d);
const mod = (x) => ((x % p) + p) % p;
function pow(x, n) {
  let result = 1n;
  for (x = mod(x); n > 0n; n >>= 1n, x = mod(x*x)) if (n & 1n) result = mod(result*x);
  return result;
}
const inverse = (x) => { assert.notEqual(mod(x), 0n, 'zero denominator'); return pow(x, p-2n); };
const identity = [0n, 1n];
function onCurve([x, y]) {
  assert.ok(x >= 0n && x < p && y >= 0n && y < p, 'noncanonical public parameter');
  assert.equal(mod(a*x*x + y*y - 1n - d*x*x*y*y), 0n);
}
// Direct published affine equations, independent of circomlibjs's beta/gamma schedule.
// Only used to audit the fixed public parameters. EC2 will supply the reference API.
function add([x, y], [v, w]) {
  const t = mod(d*x*v*y*w);
  const point = [mod((x*w+y*v)*inverse(1n+t)), mod((y*w-a*x*v)*inverse(1n-t))];
  onCurve(point);
  return point;
}
function multiply(point, scalar) {
  let acc = identity;
  for (; scalar > 0n; scalar >>= 1n, point = add(point, point)) {
    if (scalar & 1n) acc = add(acc, point);
  }
  return acc;
}
assert.equal(p, 21888242871839275222246405745257275088548364400416034343698204186575808495617n);
assert.equal(ell, 2736030358979909402780800718157159386076813972158567259200215660948447373041n);
assert.equal(BigInt(spec.curve.order), 8n*ell);
assert.equal(spec.curve.cofactor, '8');
assert.deepEqual(spec.curve.identity, ['0','1']);
assert.equal(a, 168700n); assert.equal(d, 168696n);
assert.equal(pow(a, (p-1n)/2n), 1n);
assert.equal(pow(d, (p-1n)/2n), p-1n);
assert.ok(65535n < ell && ell < 2n**251n && 2n**252n < p);
assert.equal(spec.encoding.blindingBits, 251);
assert.equal(spec.encoding.messageBits, 16);
assert.equal(spec.encoding.messageMax, '65535');
assert.equal(spec.encoding.inputOffset, 8);
assert.equal(spec.encoding.inputBits, 4);
assert.deepEqual(spec.encoding.packingWeights, [1,16,256,4096]);
assert.deepEqual(spec.encoding.publicSignals, ['commitmentX','commitmentY','label']);
assert.deepEqual(spec.encoding.privateInputs, ['u[0]','u[1]','u[2]','u[3]','r']);

const pedersen = await buildPedersenHash();
const baby = pedersen.babyJub, F = baby.F;
assert.equal(baby.p, p); assert.equal(baby.subOrder, ell);
for (const role of ['G','H']) {
  const parameter = spec.derivation.generators[role];
  assert.equal(parameter.roleSeed, spec.derivation.context + ';role=' + role);
  const index = BigInt('0x' + sha256(parameter.roleSeed)).toString();
  assert.equal(parameter.pointIndex, index);
  // Both chosen parameters decode at counter zero: no omitted/rejected candidates.
  assert.equal(parameter.attempts.length, 1);
  const attempt = parameter.attempts[0];
  assert.equal(attempt.counter, 0); assert.equal(attempt.decoded, true);
  const seed = 'PedersenGenerator_' + index.padStart(32,'0') + '_' + '0'.repeat(32);
  const digest = createBlakeHash('blake256').update(seed).digest();
  assert.equal(digest.toString('hex'), attempt.blake256);
  assert.deepEqual(pedersen.baseHash('blake', seed), digest);
  const masked = Buffer.from(digest); masked[31] &= 0xbf;
  assert.equal(masked.toString('hex'), attempt.maskedCandidate);
  const sign = !!(masked[31] & 0x80); masked[31] &= 0x7f;
  const rawY = BigInt('0x' + Buffer.from(masked).reverse().toString('hex'));
  const pre = parameter.preCofactorPoint.map(BigInt);
  onCurve(pre);
  assert.equal(pre[1], rawY % p); // Legacy derivation reduces; NOT an external point parser.
  assert.notEqual(pre[0], 0n);
  assert.equal(pre[0] > (p-1n)/2n, sign);
  const point = parameter.point.map(BigInt);
  onCurve(point);
  assert.notDeepEqual(point, identity);
  assert.deepEqual(multiply(pre, 8n), point);
  assert.deepEqual(multiply(point, ell), identity);
  assert.deepEqual(multiply(point, ell-1n), [mod(-point[0]), point[1]]);
  assert.deepEqual(add(point, [mod(-point[0]), point[1]]), identity);
  assert.deepEqual(add(identity, point), point);
  assert.deepEqual(baby.mulPointEscalar(point.map(v=>F.e(v)), 0n).map(v=>F.toObject(v)), identity);
  assert.deepEqual(pedersen.getBasePoint('blake', index).map(v=>F.toObject(v)), point);
}
const G = spec.derivation.generators.G.point.map(BigInt);
const H = spec.derivation.generators.H.point.map(BigInt);
assert.notDeepEqual(G,H); assert.notDeepEqual(H,[mod(-G[0]),G[1]]);

// Exhaustive specification arithmetic, not an implemented EC reference interface.
let zeroScores=0, minScore=Infinity, maxScore=-Infinity;
const encodings = new Set();
for (let u0=0;u0<16;u0++) for(let u1=0;u1<16;u1++)
for (let u2=0;u2<16;u2++) for(let u3=0;u3<16;u3++) {
  const u=[u0,u1,u2,u3], m=u0+16*u1+256*u2+4096*u3;
  assert.deepEqual([0,1,2,3].map(i=>Math.floor(m/16**i)%16),u);
  encodings.add(m);
  const s=3*(u0-8)-2*(u1-8)+(u2-8)+4*(u3-8)-5;
  assert.equal((s+128)>>7, Number(s>=0));
  if(s===0) zeroScores++;
  minScore=Math.min(minScore,s); maxScore=Math.max(maxScore,s);
}
assert.equal(encodings.size,65536); assert.ok(encodings.has(0)&&encodings.has(65535));
assert.equal(minScore,-83); assert.equal(maxScore,67); assert.equal(zeroScores,930);
// Model JSON structure/contents remain the normative baseline; its byte identity is pinned.
assert.equal(sha256(read('spec/model.json')), spec.baselineModelSha256);
assert.equal(model.spec_version, '1.0.0');
console.log(JSON.stringify({status:'PASS',parametersSha256:sha256(read('spec/pedersen-parameters.json')),
  pinnedFiles:provenance.files.length,packingCases:encodings.size,zeroScores,
  scoreBounds:[minScore,maxScore],generatorChecks:'derivation, independent cofactor/subgroup arithmetic, identity/inverse',
  scope:'EC1 parameter validation only; primality/group order and cryptographic assumptions are not proved'}));
