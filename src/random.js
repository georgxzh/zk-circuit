import { randomBytes } from 'node:crypto';
import { FIELD_MODULUS } from './reference.js';

// Internal seam for deterministic rejection-sampling tests; not a public RNG option.
export function sampleFieldFrom(draw) {
  for (;;) {
    const bytes = draw(32);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
      throw new TypeError('random source must return 32 bytes');
    }
    const value = BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
    if (value < FIELD_MODULUS) return value;
  }
}

export function randomSalt() {
  return sampleFieldFrom(randomBytes);
}
