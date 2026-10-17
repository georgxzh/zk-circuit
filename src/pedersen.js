import { buildBabyjub } from 'circomlibjs';
import { classify, encodeInput, decodeInput, validateInput, integer } from './reference.js';
import { CURVE, GENERATORS, SUBGROUP_ORDER } from './pedersen-parameters.js';
export { PEDERSEN_ID, SUBGROUP_ORDER, GENERATORS } from './pedersen-parameters.js';
export { randomBlindingScalar } from './pedersen-random.js';

function arrayOf(values, length, name) {
  if (!Array.isArray(values) || values.length !== length) {
    throw new TypeError(name + ' has incorrect dimensions');
  }
  // Visit holes and snapshot callers before asynchronous initialization.
  return Array.from(values);
}

function decimal(value, limit, name) {
  if (typeof value !== 'string' || value.length > (limit-1n).toString().length ||
      /^(?:0|[1-9][0-9]*)$/.exec(value)?.[0] !== value) {
    throw new TypeError(name + ' must be a canonical unsigned decimal string');
  }
  const n = BigInt(value);
  if (n >= limit) throw new RangeError(name + ' is outside its canonical range');
  return n;
}

export function scalarElement(value) {
  if (typeof value !== 'bigint') throw new TypeError('scalar must be a bigint');
  if (value < 0n || value >= SUBGROUP_ORDER) throw new RangeError('scalar outside [0,ell-1]');
  return value;
}

export function parseScalar(text) {
  return decimal(text, SUBGROUP_ORDER, 'scalar');
}

export function parseEncodedInput(values) {
  return arrayOf(values, 4, 'encoded input').map((v) => decimal(v, 16n, 'encoded coordinate'));
}

export function packInput(values) {
  return encodeInput(values).reduce((m, u, i) => m + (u << BigInt(4*i)), 0n);
}

export function unpackInput(value) {
  const m = integer(value, 'packed input');
  if (m < 0n || m > 65535n) throw new RangeError('packed input outside [0,65535]');
  return decodeInput([0,1,2,3].map((i) => (m >> BigInt(4*i)) & 15n));
}

let curvePromise;
function curve() {
  curvePromise ??= buildBabyjub().then((baby) => {
    const F = baby.F;
    if (baby.p !== CURVE.p || baby.subOrder !== SUBGROUP_ORDER || baby.order !== CURVE.order ||
        F.toObject(baby.A) !== CURVE.a || F.toObject(baby.D) !== CURVE.d) {
      throw new Error('Baby Jubjub library parameters do not match specification');
    }
    for (const point of Object.values(GENERATORS)) {
      if (point.some((c) => c < 0n || c >= CURVE.p) ||
          (point[0] === 0n && point[1] === 1n) ||
          !baby.inSubgroup(point.map((c) => F.e(c)))) {
        throw new Error('invalid fixed Pedersen generator');
      }
    }
    return baby;
  });
  return curvePromise;
}

// Strict affine transport; never call the library's permissive compressed decoder.
export async function parsePoint(values) {
  const point = arrayOf(values, 2, 'point').map((v) => decimal(v, CURVE.p, 'coordinate'));
  const baby = await curve();
  if (!baby.inSubgroup(point.map((c) => baby.F.e(c)))) {
    throw new RangeError('point must be on Baby Jubjub and in its prime-order subgroup');
  }
  return point; // Fresh BigInt array; identity is permitted.
}

export async function parsePublicSignals(values) {
  const signals = arrayOf(values, 3, 'public signals');
  const label = decimal(signals[2], 2n, 'label');
  const commitment = await parsePoint(signals.slice(0,2));
  return { commitment, label };
}

export async function commitInput(values, blinder) {
  const m = packInput(values), r = scalarElement(blinder);
  const baby = await curve(), F = baby.F;
  const G = GENERATORS.G.map((c) => F.e(c)), H = GENERATORS.H.map((c) => F.e(c));
  const point = baby.addPoint(baby.mulPointEscalar(G, m), baby.mulPointEscalar(H, r));
  return point.map((c) => F.toObject(c));
}

export async function publicStatement(values, blinder) {
  const x = validateInput(values), r = scalarElement(blinder);
  const { label } = classify(x);
  const point = await commitInput(x, r);
  return [...point.map(String), label.toString()];
}

// Local opening check, NOT a circuit/proof verifier. Invalid inputs throw;
// well-formed statements that do not match this fixed opening return false.
export async function checkOpening(values, blinder, signals) {
  const x = validateInput(values), r = scalarElement(blinder);
  const expected = await parsePublicSignals(signals);
  const actual = await commitInput(x, r);
  return actual[0] === expected.commitment[0] && actual[1] === expected.commitment[1] &&
    classify(x).label === expected.label;
}
