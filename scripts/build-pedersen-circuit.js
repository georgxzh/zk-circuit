import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, verifyCompiler } from './compiler.js';

const compiler = verifyCompiler();
// Verify pinned library sources and independently reproduce public parameters.
execFileSync(process.execPath, ['scripts/check-pedersen-parameters.js'],
  { cwd: root, stdio: 'inherit', timeout: 60000, windowsHide: true });
for (const [name, source, optimization] of [
  ['pedersen', 'circuits/pedersen-inference.circom', 'O1'],
  ['pedersen-audit', 'circuits/pedersen-inference.circom', 'O0'],
  ['pedersen-add', 'test/circuits/pedersen-add.circom', 'O0'],
]) {
  const output = join(root, 'build', name);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}\n');
  console.log('Building ' + name + ': --' + optimization + ', sanity 2');
  execFileSync(compiler, [
    source, '--r1cs', '--wasm', '--sym', '--json', '--' + optimization,
    '--prime', 'bn128', '--sanity_check', '2',
    '-l', 'node_modules', '-l', 'circuits', '-o', output,
  ], { cwd: root, stdio: 'inherit', timeout: 60000, windowsHide: true });
}
