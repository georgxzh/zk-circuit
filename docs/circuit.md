# Circuit implementation

The circuit implements the unchanged [version-1 specification](specification.md).
It constrains a public commitment and classification to one private, bounded
feature vector. The Phase 3 checks described here validate compiled constraints
and witnesses. Phase 4 adds [setup and proof verification](proofs.md). A formal
correctness theorem remains Phase 5.

## Reproduce the build

Use Node.js 26.3.1 and npm 11.16.0 from the repository root:

```sh
npm ci
npm run setup:circom
npm run test:circuit
```

The installer retrieves an official Circom **2.2.3** release asset from GitHub.
[compiler.json](../spec/compiler.json) records the release URL and SHA-256
digests. It validates the digest before writing the executable under ignored
`.tools/`, checks the reported compiler version, and leaves an existing valid
installation in place. Every build rechecks the executable's digest and version.
It also checks the pinned Poseidon sources before compilation.

The installer supports Windows, Linux, and macOS **x64**. The validated host is
Windows x64. ARM-native compiler binaries and other platforms are not covered by
these pins; use a supported x64 environment. Do not substitute an unverified
compiler while claiming these build results.

Additional commands:

```sh
npm run build:circuit   # rebuild all four targets
npm run test:circuit   # rebuild, then run the circuit-specific suite
npm run test:reference # run the existing reference suite without a compiler
```

Every target uses explicit `--prime bn128`, `--sanity_check 2`, `--r1cs`,
`--wasm`, `--sym`, and `--json`. Build outputs remain in ignored `build/`.
Generated witness helpers use CommonJS; the builder adds an ignored package
boundary inside each target directory so they load correctly in this ESM project.
The build script invokes the compiler directly, without shell command interpolation.

| Target directory | Source | Optimization | Constraints | Witness wires, including constant |
| --- | --- | --- | --- | --- |
| `build/inference` | `circuits/inference.circom` | O1 | 999 (382 nonlinear, 617 linear) | 999 |
| `build/audit` | Same full circuit | O0 | 1,635 (382 nonlinear, 1,253 linear) | 1,635 |
| `build/arithmetic` | Test harness for the unchanged `BoundedLinear` template | O0 | 38 | 37 |
| `build/hash` | Test harness for the pinned `Poseidon(6)` | O0 | 1,585 | 1,592 |

These are structural compilation results, not the timing/memory benchmarks
planned for Phase 6. Only `build/inference/inference.r1cs` is intended as the
proving target. The other three targets are test and inspection aids.

## Public and private interface

[inference.circom](../circuits/inference.circom) declares these inputs:

| Visibility | Signal | Meaning |
| --- | --- | --- |
| Public, wire 1 | `commitment` | `Poseidon(6)(1, u0, u1, u2, u3, salt)` |
| Public, wire 2 | `label` | Boolean claim `1[score >= 0]` |
| Private | `u[4]` | Offset features `x[i]+8`, constrained to [0,15] |
| Private | `salt` | One BN254 scalar-field element |

There are **zero public outputs**. Score, shifted score, decompositions, and hash
intermediates are private auxiliary signals. The verifier's eventual public
signal array is exactly `[commitment, label]`. Tests inspect both binary R1CS
headers and symbol-to-witness mappings to check this order and visibility.

[circuit-input.js](../src/circuit-input.js) prepares canonical witness input:

```js
import { circuitInput, parseCircuitInput } from './src/circuit-input.js';

// x and salt are held privately; expectedPublicSignals comes from the application.
const input = circuitInput(x, salt, expectedPublicSignals);
const validated = parseCircuitInput(input);
```

The adapter preserves the application's claimed commitment and label. A wrong
claim must fail the circuit; the adapter must not silently replace it with a
freshly computed claim. It rejects malformed dimensions, out-of-range encoded
features, non-Boolean labels, and noncanonical field text.

The generated Circom witness calculator is a low-level field tool. Its input
conversion can reduce values modulo p; it is not the canonical external parser.
Use `parseCircuitInput` at that boundary. A field circuit itself cannot distinguish
the external integers `u` and `u+p`. The raw-R1CS range tests use distinct field
elements 16 and p-1; transport aliases such as p+9 are parser tests.

## Constraint trace

[bounded-linear.circom](../circuits/bounded-linear.circom) is shared by the full
circuit and the exhaustive arithmetic harness. It uses circomlib `Num2Bits` to
constrain each bit and the weighted recomposition, rather than relying on the
generator's bit-extraction assignments alone.

| Specification obligation | Source relation and O0 symbol trace |
| --- | --- |
| Four bounded signed features | `classifier.inputBits[i] = Num2Bits(4)`, constrained to `classifier.u[i]` |
| Exact score | `classifier.score = 3*u0 - 2*u1 + u2 + 4*u3 - 53` |
| Signed threshold | `classifier.shiftedScore = classifier.score + 128`, decomposed by `classifier.scoreBits = Num2Bits(8)` |
| Zero belongs to class 1 | `classifier.label = classifier.scoreBits.out[7]` |
| Boolean public classification | Explicit `classifier.label * (classifier.label-1) = 0`, tied to `main.label` |
| Same committed and classified input | Both `classifier.u[i]` and `hash.inputs[i+1]` constrained to `main.u[i]` |
| Versioned salted commitment | `hash.inputs[0]=1`, `hash.inputs[5]=salt`, and `commitment=hash.out` |

The tests expand each required emitted R1CS row into a polynomial and match it
up to a nonzero field scalar. They check all 24 input/score bit Boolean
constraints, the explicit label Boolean constraint, recompositions, affine
equations, shared-input links, domain, salt, and commitment equality. This checks
the compiled rows directly, not just source text. Hash internals are covered by
pinned-source checks, witness constraint evaluation, and reference vectors.

The R1CS reader is pinned to `r1csfile` **0.0.48**. Tests decode binary
constraints, compare them to the compiler's JSON export, and evaluate every
`A(w)*B(w)=C(w)` equation with JavaScript bigints modulo the specified prime.
They check witness length, canonical elements, and the constant wire first.

## Valid and adversarial assignments

The tests generate and check compiled arithmetic witnesses for **all 65,536**
valid feature vectors, including all **930** zero-score inputs. The production
template is used unchanged. Full-circuit tests cover the nine Phase 2 commitment
fixtures in both O0 and O1, plus all 16 corners and 64 additional deterministic
feature/salt combinations in O1.

For malformed assignments, tests construct the arithmetic wires manually and
obtain hash intermediates from the separate hash harness. They first verify
that this constructor exactly reproduces an honest full-circuit witness. It can
then supply out-of-range inputs, mismatched labels, or inconsistent wiring
directly to the constraint evaluator, bypassing both application validation and
full-circuit witness-generation assertions. Invalid assignments must fail the
O0 constraints and their projection onto the O1 wire layout.

Negative cases include 16 and p-1 in each input coordinate, flipped positive,
negative and zero labels, label 2, an altered commitment, a different domain tag,
a forged score, separate committed/classified vectors, and non-Boolean bits whose
weighted recomposition still equals the original value.

Mutation checks omit selected constraint rows **only inside the test evaluator**.
The matching counterexample then satisfies the remaining equations. They exercise
eight omission scenarios: input recomposition, threshold equality, score equality,
domain tag, commitment equality, common-input links, an input-bit Boolean equation,
and a score-bit Boolean equation. The source circuit and compiled files are never
weakened. Generated witnesses stay in memory and are not written to Git.

Normal witness-generation failure is also tested, but is distinct from the direct
constraint rejection evidence. These checks do not prove soundness for all
malicious witnesses, compiler correctness, hash security, or zero knowledge.
Formal correctness remains Phase 5; setup and actual proof verification are
covered by the [Phase 4 proof workflow](proofs.md).
