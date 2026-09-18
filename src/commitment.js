import { buildPoseidonReference } from 'circomlibjs';
import { classify, encodeInput, validateInput, fieldElement, parsePublicSignals, MODEL, FIELD_MODULUS } from './reference.js';
export { randomSalt } from './random.js';

let poseidonPromise;
function poseidon() {
  poseidonPromise ??= buildPoseidonReference().then((hash) => {
    if (hash.F.p !== FIELD_MODULUS) throw new Error('Poseidon field does not match specification');
    return hash;
  });
  return poseidonPromise;
}

export async function commitInput(values, salt) {
  const u = encodeInput(values);
  const r = fieldElement(salt);
  const hash = await poseidon();
  return hash.F.toObject(hash([BigInt(MODEL.commitment.domain_tag), ...u, r], 0n, 1));
}

export async function publicStatement(values, salt) {
  // Snapshot before awaiting library initialization; callers may mutate their array.
  const x = validateInput(values);
  const { label } = classify(x);
  const commitment = await commitInput(x, salt);
  return [commitment.toString(), label.toString()];
}

// Checks a supplied opening locally. This is not a zero-knowledge proof verifier.
export async function checkOpening(values, salt, signals) {
  const expected = parsePublicSignals(signals);
  const actual = parsePublicSignals(await publicStatement(values, salt));
  return actual.commitment === expected.commitment && actual.label === expected.label;
}
