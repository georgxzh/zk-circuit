import { readFileSync } from 'node:fs';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const MODEL = freeze(JSON.parse(readFileSync(new URL('../spec/model.json', import.meta.url))));
export const FIELD_MODULUS = BigInt(MODEL.field.modulus);
const WEIGHTS = MODEL.weights.map(BigInt);
const MIN = BigInt(MODEL.input_min);
const MAX = BigInt(MODEL.input_max);
const OFFSET = BigInt(MODEL.input_encoding.offset);

export function integer(value, name = 'value') {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError(`${name} must be a bigint or safe integer number`);
}

function vector(values) {
  if (!Array.isArray(values) || values.length !== MODEL.dimension) {
    throw new TypeError('input must contain exactly four coordinates');
  }
  // Array.from visits holes as undefined, so sparse arrays cannot bypass validation.
  return Array.from(values, (value) => integer(value, 'coordinate'));
}

export function validateInput(values) {
  const x = vector(values);
  if (x.some((v) => v < MIN || v > MAX)) throw new RangeError('coordinate outside [-8,7]');
  return x;
}

export function classify(values) {
  const x = validateInput(values);
  const score = x.reduce((sum, v, i) => sum + WEIGHTS[i] * v, BigInt(MODEL.bias));
  return { score, label: score >= 0n ? 1n : 0n };
}

export function encodeInput(values) {
  return validateInput(values).map((v) => v + OFFSET);
}

export function decodeInput(values) {
  const u = vector(values);
  if (u.some((v) => v < 0n || v >= 16n)) throw new RangeError('encoded coordinate outside [0,15]');
  return u.map((v) => v - OFFSET);
}

// Algebraic embedding only. External field parsers must not reduce aliases.
export function toField(value) {
  const v = integer(value);
  return ((v % FIELD_MODULUS) + FIELD_MODULUS) % FIELD_MODULUS;
}

export function fieldElement(value) {
  if (typeof value !== 'bigint') throw new TypeError('field element must be a bigint');
  if (value < 0n || value >= FIELD_MODULUS) throw new RangeError('noncanonical field element');
  return value;
}

export function parseField(value) {
  if (typeof value !== 'string' || /^(?:0|[1-9][0-9]*)$/.exec(value)?.[0] !== value) {
    throw new TypeError('field text must be a canonical unsigned decimal string');
  }
  return fieldElement(BigInt(value));
}

export function decodeScore(value) {
  const v = fieldElement(value);
  if (v <= BigInt(MODEL.score_bounds.max)) return v;
  if (v >= FIELD_MODULUS + BigInt(MODEL.score_bounds.min)) return v - FIELD_MODULUS;
  throw new RangeError('field element is not an allowed score');
}

export function parsePublicSignals(values) {
  if (!Array.isArray(values) || values.length !== 2) throw new TypeError('expected [commitment,label]');
  const commitment = parseField(values[0]);
  const label = parseField(values[1]);
  if (label > 1n) throw new RangeError('label must be 0 or 1');
  return { commitment, label };
}

function rational(text) {
  if (typeof text !== 'string') throw new TypeError('rational must be exact text');
  const fraction = /^(-?(?:0|[1-9][0-9]*))\/([1-9][0-9]*)$/.exec(text);
  if (fraction?.[0] === text) return [BigInt(fraction[1]), BigInt(fraction[2])];
  const decimal = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(text);
  if (decimal?.[0] !== text) throw new TypeError('expected integer, decimal, or fraction with positive denominator');
  const digits = decimal[3] ?? '';
  const numerator = BigInt(decimal[2] + digits) * (decimal[1] ? -1n : 1n);
  return [numerator, 10n ** BigInt(digits.length)];
}

export function quantize(text, scale = BigInt(MODEL.quantization.input_scale)) {
  const k = integer(scale, 'scale');
  if (k <= 0n) throw new RangeError('scale must be positive');
  const [numerator, denominator] = rational(text);
  const a = 2n * k * numerator + denominator;
  const d = 2n * denominator;
  // BigInt division truncates toward zero; this correction implements floor.
  return a / d - (a < 0n && a % d !== 0n ? 1n : 0n);
}

export function quantizeInput(values) {
  if (!Array.isArray(values) || values.length !== MODEL.dimension) {
    throw new TypeError('input must contain exactly four rational strings');
  }
  return validateInput(Array.from(values, (v) => quantize(v)));
}
