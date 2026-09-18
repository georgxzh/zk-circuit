import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const run = (command, input) => spawnSync(process.execPath, [cli, command], { input, encoding: 'utf8', timeout: 30000 });

test('CLI classifies and quantizes JSON from stdin with exact string output', () => {
  const classified = run('classify', '{"x":[1,1,0,1]}');
  assert.equal(classified.status, 0, classified.stderr);
  assert.deepEqual(JSON.parse(classified.stdout), { score: '0', label: '1' });
  const quantized = run('quantize', '{"x":["-1/8","1/8","-3/8","7/4"]}');
  assert.equal(quantized.status, 0, quantized.stderr);
  assert.deepEqual(JSON.parse(quantized.stdout), { x: ['0', '1', '-1', '7'] });
});

test('CLI statement emits exactly the public signals', () => {
  const v = JSON.parse(readFileSync(new URL('../spec/commitment-vectors.json', import.meta.url))).vectors[0];
  const result = run('statement', JSON.stringify({ x: v.x, salt: v.salt }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { publicSignals: [v.commitment, v.label] });
});

test('CLI failures are nonzero, produce no stdout, and do not echo input', () => {
  for (const [command, input] of [
    ['classify', '{"x":[8,0,0,0]}'], ['classify', '{"x":[0.5,0,0,0]}'],
    ['classify', '{"x":[0.9999999999999999999999999999999999,0,0,0]}'],
    ['classify', '{"x":[1e0,0,0,0]}'], ['classify', '{"x":[1.0,0,0,0]}'],
    ['classify', '{"x":[0,0,0,0],"salt":"PRIVATE_SENTINEL"}'],
    ['statement', '{"x":[0,0,0,0]}'], ['statement', '{"x":[0,0,0,0],"salt":"01"}'],
    ['quantize', '{"x":["15/8","0","0","0"]}'],
    ['classify', '{PRIVATE_SENTINEL'], ['classify', 'null'], ['unknown', '{}'],
  ]) {
    const result = run(command, input);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Error:/);
    assert.ok(!result.stderr.includes('PRIVATE_SENTINEL'));
  }
});
