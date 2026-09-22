import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const compilerSpec = JSON.parse(readFileSync(new URL('../spec/compiler.json', import.meta.url)));
export function compilerAsset() {
  const asset = compilerSpec.platforms[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error('Pinned compiler requires Windows, Linux, or macOS x64. See docs/circuit.md.');
  return asset;
}
export function compilerPath() {
  return fileURLToPath(new URL(`../.tools/circom-${compilerSpec.version}/${compilerAsset().asset}`, import.meta.url));
}
export function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function verifyCompiler() {
  const path = compilerPath();
  let bytes;
  try { bytes = readFileSync(path); }
  catch { throw new Error('Pinned Circom is missing. Run npm run setup:circom.'); }
  if (digest(bytes) !== compilerAsset().sha256) throw new Error('Circom binary SHA-256 mismatch');
  const version = execFileSync(path, ['--version'], { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
  if (version !== `circom compiler ${compilerSpec.version}`) throw new Error(`Unexpected compiler version: ${version}`);
  return path;
}
