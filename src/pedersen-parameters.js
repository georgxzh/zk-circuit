import { readFileSync } from 'node:fs';
import { FIELD_MODULUS } from './reference.js';

// The EC1 manifest is an immutable parameter record, including its historical status.
const spec = JSON.parse(readFileSync(new URL('../spec/pedersen-parameters.json', import.meta.url)));
export const PEDERSEN_ID = spec.id;
export const SUBGROUP_ORDER = BigInt(spec.curve.subgroupOrder);
export const GENERATORS = Object.freeze(Object.fromEntries(
  ['G', 'H'].map((role) => [role, Object.freeze(spec.derivation.generators[role].point.map(BigInt))])
));
export const CURVE = Object.freeze({
  p: BigInt(spec.coordinateField), a: BigInt(spec.curve.a), d: BigInt(spec.curve.d),
  order: BigInt(spec.curve.order), cofactor: BigInt(spec.curve.cofactor),
});
if (CURVE.p !== FIELD_MODULUS || CURVE.order !== CURVE.cofactor * SUBGROUP_ORDER) {
  throw new Error('Pedersen parameters do not match the classifier field or subgroup');
}
