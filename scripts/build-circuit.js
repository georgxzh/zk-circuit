import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, verifyCompiler } from './compiler.js';
import { checkPoseidonSources } from './check-poseidon.js';

const compiler = verifyCompiler();
checkPoseidonSources();
const targets = [
  { name: 'inference', source: 'circuits/inference.circom', optimization: 'O1', sanity: '2' },
  { name: 'audit', source: 'circuits/inference.circom', optimization: 'O0', sanity: '2' },
  { name: 'arithmetic', source: 'test/circuits/arithmetic.circom', optimization: 'O0', sanity: '2' },
  { name: 'hash', source: 'test/circuits/hash.circom', optimization: 'O0', sanity: '2' },
];
for (const target of targets) {
  const output = join(root, 'build', target.name);
  mkdirSync(output, { recursive: true });
  // Generated witness helpers use CommonJS, while project source uses ESM.
  writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}\n');
  console.log(`Building ${target.name}: --${target.optimization}, sanity ${target.sanity}`);
  execFileSync(compiler, [
    target.source, '--r1cs', '--wasm', '--sym', '--json', `--${target.optimization}`,
    '--prime', 'bn128', '--sanity_check', target.sanity,
    '-l', 'node_modules', '-l', 'circuits', '-o', output,
  ], { cwd: root, stdio: 'inherit', timeout: 60000, windowsHide: true });
}
