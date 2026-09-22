import { encodeInput, decodeInput, fieldElement, parseField, parsePublicSignals } from './reference.js';

// The application supplies the expected public statement; never replace it with
// a freshly computed commitment when preparing a witness for verification.
export function circuitInput(values, salt, publicSignals) {
  const u = encodeInput(values).map(String);
  const r = fieldElement(salt);
  const { commitment, label } = parsePublicSignals(publicSignals);
  return { commitment: String(commitment), label: String(label), u, salt: String(r) };
}

export function parseCircuitInput(input) {
  const keys = ['commitment', 'label', 'u', 'salt'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))) {
    throw new TypeError('expected exactly commitment, label, u, and salt');
  }
  if (!Array.isArray(input.u) || input.u.length !== 4) throw new TypeError('expected four encoded coordinates');
  const u = Array.from(input.u, parseField);
  return circuitInput(decodeInput(u), parseField(input.salt), [input.commitment, input.label]);
}
