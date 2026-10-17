import { encodeInput } from './reference.js';
import { parseEncodedInput, parseScalar, scalarElement, parsePublicSignals } from './pedersen.js';

// Preserve the caller's expected claim, including a well-formed but wrong claim.
export async function circuitInput(values, blinder, signals) {
  const u = encodeInput(values).map(String);
  const r = String(scalarElement(blinder));
  const { commitment, label } = await parsePublicSignals(signals);
  return { commitmentX: String(commitment[0]), commitmentY: String(commitment[1]),
    label: String(label), u, r };
}

export async function parseCircuitInput(input) {
  const keys = ['commitmentX', 'commitmentY', 'label', 'u', 'r'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== keys.length || keys.some((k) => !Object.hasOwn(input, k))) {
    throw new TypeError('expected exactly commitmentX, commitmentY, label, u, and r');
  }
  const u = parseEncodedInput(input.u).map(String);
  const r = String(parseScalar(input.r));
  const { commitment, label } = await parsePublicSignals(
    [input.commitmentX, input.commitmentY, input.label]);
  return { commitmentX: String(commitment[0]), commitmentY: String(commitment[1]),
    label: String(label), u, r };
}
