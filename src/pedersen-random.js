import { randomBytes } from 'node:crypto';
import { SUBGROUP_ORDER } from './pedersen-parameters.js';

// Internal deterministic test seam. The public sampler always uses node:crypto.
export function sampleScalarFrom(draw) {
  for (;;) {
    const bytes = draw(32);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
      throw new TypeError('random source must return 32 bytes');
    }
    const scalar = BigInt('0x' + Buffer.from(bytes).toString('hex'));
    if (scalar < SUBGROUP_ORDER) return scalar;
  }
}

export function randomBlindingScalar() {
  return sampleScalarFrom(randomBytes);
}
