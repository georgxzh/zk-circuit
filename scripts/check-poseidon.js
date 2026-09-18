import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MODEL } from '../src/reference.js';

const read = (path) => readFileSync(new URL(path, import.meta.url));
const provenance = JSON.parse(read('../spec/poseidon-provenance.json'));

export function checkPoseidonSources() {
  assert.equal(MODEL.commitment.upstream_revision, provenance.circomlib_revision);
  for (const [name, version] of [['circomlib', provenance.circomlib_version], ['circomlibjs', provenance.circomlibjs_version]]) {
    assert.equal(JSON.parse(read(`../node_modules/${name}/package.json`)).version, version);
  }
  for (const file of provenance.files) {
    const bytes = read(`../node_modules/circomlib/${file.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), file.git_blob_sha1);
  }
  const circom = read('../node_modules/circomlib/circuits/poseidon_constants.circom').toString();
  const js = JSON.parse(read('../node_modules/circomlibjs/src/poseidon_constants_opt.json'));
  const counts = {};
  for (const name of ['C', 'S', 'M', 'P']) {
    const section = circom.split(`function POSEIDON_${name}(t) {`)[1]?.split('\nfunction ')[0];
    assert.ok(section, `missing ${name} function`);
    const branch = /if\s*\(t\s*==\s*7\)\s*\{([\s\S]*?)\}/.exec(section)?.[1];
    assert.ok(branch, `missing width-7 ${name} constants`);
    const actual = [...branch.matchAll(/0x[0-9a-fA-F]+/g)].map(([value]) => BigInt(value));
    const expected = js[name][5].flat(Infinity).map(BigInt);
    assert.deepEqual(actual, expected, `${name} constants differ from specified Circom`);
    counts[name] = actual.length;
  }
  assert.deepEqual(counts, { C: 119, S: 819, M: 49, P: 49 });
  return counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('PASS: pinned Circom files and all width-7 optimized constants', checkPoseidonSources());
}
