# Pedersen reference implementation (EC2)

The separate module [src/pedersen.js](../src/pedersen.js) implements the
[EC specification](pedersen-specification.md) using the existing pinned
circomlibjs Baby Jubjub arithmetic. Poseidon's API and tests are unchanged.

Run with the repository's pinned Node.js and installed dependencies:

```sh
npm run test:pedersen
npm test
```

The first command checks the EC1 source/parameter audit and the EC2 tests without
compiling a new circuit. The full suite also rebuilds and exercises the original
Poseidon circuits, proof flow, formal audit, and translation validator.

## Use

From an ES module in the repository root:

```js
import * as ec from './src/pedersen.js';

// PUBLIC SYNTHETIC example: these features and r=0 are intentionally public.
const x = [-8, -8, -8, -8];
const r = ec.parseScalar('0');
const expected = ['0', '1', '0']; // Identity commitment, negative classification.
console.log(ec.packInput(x)); // 0n
console.log(await ec.publicStatement(x, r)); // ['0', '1', '0']
console.log(await ec.checkOpening(x, r, expected)); // true
```

For actual private data, obtain a fresh blinder with
`ec.randomBlindingScalar()` and retain it privately with the opening.
The sampler always uses `node:crypto.randomBytes`; it has no caller-supplied
RNG option. It samples full 32-byte big-endian integers and rejects values
greater than or equal to the subgroup order. Zero remains permitted.
Do not reuse the public fixture blinders with private inputs.

## API contracts

| Export | Input and result |
| --- | --- |
| `packInput(x)` | Four signed integer features, each a BigInt or safe integer Number in [-8,7]; returns BigInt m in [0,65535]. No text coercion or implicit quantization. |
| `unpackInput(m)` | BigInt or safe integer Number in [0,65535]; returns a fresh array of four signed BigInts in [-8,7]. |
| `parseEncodedInput(u)` | Exactly four canonical decimal strings in [0,15]; returns four BigInts. Converts neither offsets nor quantization. |
| `parseScalar(text)` | Canonical decimal string in [0,ell-1]; returns BigInt. |
| `scalarElement(r)` | Validates an internal BigInt in [0,ell-1]. Numbers, strings, omitted values, and modular aliases throw. |
| `randomBlindingScalar()` | Fresh CSPRNG rejection-sampled BigInt in [0,ell-1]. |
| `await parsePoint([X,Y])` | Exactly two canonical decimal strings, each below p; checks curve and subgroup membership, returning a fresh BigInt pair. Identity is accepted. |
| `await parsePublicSignals(signals)` | Exactly [X,Y,label], all strings; point validated as above, label exactly '0' or '1'; returns {commitment: [X,Y] as BigInts, label: BigInt}. |
| `await commitInput(x,r)` | Validated signed integer features and an explicit BigInt blinder; returns the affine BigInt pair [m]G+[r]H. |
| `await publicStatement(x,r)` | Same inputs; returns exactly three decimal strings [commitmentX,commitmentY,label]. |
| `await checkOpening(x,r,signals)` | Checks this supplied opening and classification locally against an independently supplied public statement. Returns Boolean for well-formed inputs; malformed inputs throw. |
| `PEDERSEN_ID`, `SUBGROUP_ORDER`, `GENERATORS` | Fixed parameter identity, BigInt ell, and deeply frozen BigInt coordinate pairs G/H. |

All arithmetic is exact. Transport parsers reject JSON numbers, signs, whitespace,
leading zeroes, decimal/exponent/hex syntax, non-ASCII digits, and out-of-range
integers. Length checks precede BigInt parsing. Arrays must have the exact shape;
holes are visited and rejected. No parser silently reduces coordinates or
scalars. The internal integer API deliberately accepts safe Numbers only for
small features/packed messages; this does not loosen the string-only transport
interface.

The scalar order is **ell**, not the coordinate modulus p. In particular,
ell itself and the unused top part of the 251-bit interval are rejected.
Point parsing uses affine coordinates; it never calls the library's permissive
compressed-point decoder. On-curve points of order 2, points outside the prime
subgroup, and subgroup points with added torsion are rejected. O=(0,1) is valid.

Caller arrays are snapshotted before asynchronous initialization. Returned
arrays are fresh, and fixed parameters are frozen. Mutation of inputs while a
promise is pending cannot change the selected features or expected statement.
No library engine or mutable internal field-element buffers are exported.

## Validation and fixtures

[pedersen-vectors.json](../spec/pedersen-vectors.json) contains **13 explicitly
public synthetic fixtures**, including all nine original model examples,
identity at m=r=0, r=1, r=ell-1, m=1, and zero features with zero blinder.
All have expected m, coordinates, score, and label. Their parameter-manifest
hash ties them to the exact EC1 record. That immutable record retains its
historical EC1 status text; current implementation status is in the README
and [phase plan](pedersen-plan.md).

The [independent test oracle](../test/support/pedersen-oracle.js) implements the
[published affine group law](https://www.hyperelliptic.org/EFD/g1p/auto-twisted.html)
using BigInt, Euclidean inverses, MSB-first scalar multiplication, and Horner
packing. It imports no circomlib or ffjavascript code. The production path uses
circomlibjs's field arithmetic, different addition numerator schedule, and
LSB-first multiplication. Fixtures were computed by the oracle and cross-checked
with the reference; tests recompute them through both paths. The two paths share
the specified curve/generator constants and mathematical group law, so this is
independent calculation evidence, not independent parameter provenance or a
machine-checked proof.

The tests also cover every packed input, all 16 feature corners plus 16 further
deterministic feature/scalar combinations, scalar and point parsing failures,
subgroup rejection, identity/negation, wrong openings/labels, array mutation,
and exact RNG rejection boundaries. The RNG's injected-source helper is internal
test support in `pedersen-random.js`, not part of the reference module's public
exports. Random draws are only smoke-checked for range; no statistical test is
presented as a proof of uniformity or entropy quality.

## Assurance boundary

This is an ordinary local reference. It does **not** verify a ZK proof, produce
EC witnesses, or enforce circuit constraints. `checkOpening` has access to
private features and the blinder and must not be exposed as a privacy-preserving
remote verifier. Malformed inputs throw; a valid point or Boolean label that
does not match the fixed opening returns false.

The curve library is initialized lazily and checked against the selected
curve/scalar parameters and validated nonidentity subgroup generators.
Source/parameter integrity is checked by the EC1 audit in the test command;
files remain part of the trusted local installation, not untrusted packet data.
No constant-time or secure-memory-erasure guarantee is made for JavaScript.

The [EC3 circuit](pedersen-circuit.md) now supplies the constraints and a
separate strict input adapter. EC4–EC6 remain unstarted: a separate setup/key and
proof verifier, formal EC correctness, and comparative performance evidence
require their own approval gates. Commitment binding/hiding and the intentional public
label leakage retain the assumptions and limits in the specification.
