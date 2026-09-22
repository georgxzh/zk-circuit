import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { compilerAsset, compilerPath, compilerSpec, digest, verifyCompiler } from './compiler.js';

const path = compilerPath();
if (!existsSync(path)) {
  const asset = compilerAsset();
  const url = `https://github.com/iden3/circom/releases/download/v${compilerSpec.version}/${asset.asset}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Compiler download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== asset.sha256) throw new Error('Downloaded Circom SHA-256 mismatch; nothing installed');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: 'wx' });
  if (process.platform !== 'win32') chmodSync(path, 0o755);
}
verifyCompiler();
console.log(`Verified official Circom ${compilerSpec.version}; binary remains under ignored .tools/`);
