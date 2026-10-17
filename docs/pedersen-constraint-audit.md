# Pedersen constraint and translation audit (EC5)

The [written proof](pedersen-formal-correctness.md) establishes the mathematical
relation. This report records its connection to the implemented O0 graph and
the exact O1 artifacts used by EC4. It reports executable validation, with the
implementation and mathematical assumptions listed below.

## Reproduction and artifact identity

Run `npm run test:pedersen-formal` for the EC5 tests, or
`npm run formal:pedersen` to build and write a full local receipt.
Both verify the pinned compiler and EC1 provenance/parameter checks first.
The outputs stay under ignored `build/pedersen-formal/`.

The formal build uses Circom 2.2.3, BN254 scalar field, sanity level 2, O0/O1,
and `--simplification_substitution`. Its binary hashes are checked
against the reviewed EC3 and EC4 identities:

| Artifact | SHA-256 |
| --- | --- |
| O0 R1CS | `261008168d9607289322ac4895f555eba84b699b82d102e7742299afce1091ba` |
| O1 R1CS | `ac70af75d0fad9c91a1d39326447552453615d10458ae4ac2f788797bb4df2de` |
| O1 WASM | `ae5deff20ef199a771c433016fb2ee2baaf3edc1aabfc445c3919f491fd489ec` |
| O0 symbols | `19e38b08da33f8f0740bfe137ff25d39981a7075d8824a104eed5e5eea43af23` |
| O1 symbols | `d41b818749c73487ed345cb7fa28e63fb977fe47eb66777fc07c84a4aaf867b8` |
| O1 substitutions | `f245359d9c06f8369f729eed639dc1bae115ff501e58f6771a0a24f3061a7aeb` |

No production circuit, proof profile, parameter, or selected key changed.
The manifest records the compiler binary, dependency lock, include closure,
proof-profile hash, generated binaries, symbols, substitutions, WASM, and
witness-helper hashes. The build verifies the compiler; before evaluation,
the runner checks source, dependency-lock, profile, and generated-file identities.
The receipt additionally hashes the audit, oracle, assignment constructor,
parser, proposer, and checker source files used.

## Paper-to-source-to-O0 trace

The source relation is in `circuits/pedersen-inference.circom`,
`pedersen-fixed-base.circom`, the unchanged
`bounded-linear.circom`, and pinned circomlib gadgets.
The EC3 graph audit now emits a row-by-row trace assigning every O0 row to
one semantic family. Each expected polynomial $A B-C$ must match an actual
row up to a nonzero field scalar. Every expected row is distinct, and the
matched rows exhaust all 4,865 rows.

| Written proof | Source families | O0 rows |
| --- | --- | ---: |
| Lemmas 1, 4, 5: feature ranges, score and label | classifier wiring 14; four input decompositions 20; score decomposition 9 | 43 |
| Lemma 2: packing and message bits | packing/link 2; 16-bit decomposition 17 | 19 |
| Lemma 3: canonical scalar and strict comparison | scalar/comparator wiring and bound 6; 251-bit decomposition 252; 252-bit decomposition 253 | 511 |
| Lemmas 6–8: message multiplication | selection/Boolean/link/accumulator equations 164; sixteen adders, six rows each | 260 |
| Lemmas 6–8: blinder multiplication | selection/Boolean/link/accumulator equations 2,514; 251 adders, six rows each | 4,020 |
| Lemma 8 and theorem: final sum and public equalities | six wiring/equality rows and six final-adder rows | 12 |
| **Total** | All constraints | **4,865** |

Generated `receipt.json` includes `sourceTrace`
with zero-based row indices and concrete component-family names, such as
`blinderMul.adders[250]`. It includes every group operation's
four products and two division equations, all 267 independently computed fixed
multiples, both public coordinate equalities, and all input/bit links.
The parameter audit establishes the fixed bases' concrete subgroup identities
under the mathematical premises; the graph audit checks the actual coefficients
emitted by the compiler.

Three constraint representations are compared: the strict independent binary
reader, r1csfile 0.0.48, and Circom's JSON export. Linear-combination term order
is normalized for this comparison; row order and coefficients are preserved.
The strict parser checks symbol/binary label agreement and the exact public
prefix `commitmentX, commitmentY, label`. Both circuits have
zero outputs, three public inputs, and five private inputs.

## O0-to-O1 translation result

The separate `research/pedersen-formal/validate.js` profile
uses the existing strict parser, Stage 2 proposal generator, and core checker.
No elimination rule was added; existing Stage 0/1/2 profiles remain unchanged.

| Resource | Stage 2 limit | EC5 limit | Observed O0 / O1 |
| --- | ---: | ---: | ---: |
| Wires including constant | 4,096 | 8,192 | 4,594 / 2,695 |
| Rows | 4,096 | 8,192 | 4,865 / 2,966 |
| Signal labels | 8,192 | 8,192 | 4,594 / 4,594 |
| Bytes per artifact | 16,000,000 | 16,000,000 | R1CS: 629,340 / 454,236 |
| Terms per linear combination | 128 | 512 | 253 / 253 |
| Initial polynomial expansion budget | 1,000,000 | 1,000,000 | 12,685 / 8,880 |

Only wire, row, and term limits increased. The 253-term maximum comes from
252-bit recomposition plus its input. Aliases/constants do not increase degree
or monomial counts during substitution. The original profile rejects this pair;
the EC5 profile checks it under explicit finite bounds. Tests lower each relevant
bound below the observed requirement and confirm rejection.

The accepted certificate records:

- 4,594 source wires and 2,695 target wires.
- Exactly 1,899 eliminated private wires: 1,889 aliases, 10 constants, no unused
  coordinates, and a distinct checked defining pivot for every step.
- Exactly 1,899 source rows becoming zero polynomials.
- A multiplicity-preserving bijection from the remaining 2,966 source rows to
  all 2,966 target rows; no unmatched nonzero rows or zero target rows.
- Constant coordinate 0 and public coordinates 1, 2, 3 preserved exactly.

Compiler substitutions are proposals. Dependency resolution does not authorize
an elimination; the current source equations must justify it. The independent
core check replays every step and matches the complete residual multiset.
Full receipts and certificates are generated locally, not committed as build
artifacts. The [written preservation argument](pedersen-formal-correctness.md#7-exact-compiled-artifacts-and-optimization)
explains how checked projection and reconstruction preserve solutions.

For all 13 public fixtures, an independent BigInt constructor supplies every O0
wire and agrees with the O0 witness generator. Its checked projection agrees
with the O1 generator and satisfies O1. Lifting the O1 witness satisfies O0
and equals the independently constructed assignment. Public triples agree in
both directions. This includes zero scalars, identity, scalar ell-1, zero
message, score zero, and extrema.

These samples exercise transport implementation; they are not the universal
preservation proof. The transformation argument depends on the checked
equalities and complete residual correspondence. The transport functions check
canonical shape, not satisfaction; their preservation claim explicitly assumes
a satisfying input assignment. A negative test lifts an invalid label assignment
and confirms that it remains invalid.

## Adversarial validation

Nine EC5 tests cover full accounting and artifact identities, omission/mutation
of source equations, corrupted certificates and pivots, changed constants,
cycles, missing steps, public-coordinate remapping, deleted/duplicated/changed
target rows, unsupported affine substitutions, malformed binary/symbol metadata,
resource limits, and invalid-assignment transport. Certificate and receipt
coverage checks reject missing row/wire accounting.

Existing EC3 direct-assignment and omission tests, EC4 parser/witness/pairing
tests, and the original Poseidon/formal/translation suites remain in
`npm test`. Tests do not turn the JavaScript checker into a
proof-assistant-verified implementation.

## Assurance boundary

- **Mathematical premises:** primality, curve order, the complete Edwards group
  theorem, and the specified parameter identities. The new proof derives circuit
  soundness/completeness from them; it does not supply foundational certificates.
- **Source association:** symbol names, label maps, include-closure discovery,
  and compiler output association must correctly connect mathematical variables
  to binary wires. Hashes pin inspected bytes; they do not prove the compiler's
  front end or metadata generator correct.
- **Audit/checker execution:** the binary parser, row audit, BigInt arithmetic,
  shared polynomial helpers, proposal generation, certificate replay, filesystem,
  and runtime must execute correctly. Their regression and mutation tests are
  evidence, not machine-checked proofs.
- **Optimized artifact scope:** the accepted certificate concerns this exact
  O0/O1 pair. Unsupported transformations fail closed. There is no claim about
  O2, arbitrary Circom programs, or future parameter/compiler changes.
- **Cryptographic/application layer:** binding/hiding assumptions, Groth16,
  setup integrity, trusted profile/key selection, canonical transport, expected
  statements, blinder generation, and deliberate label leakage remain separate.

The previous blanket reliance on optimization correctness for this Pedersen
pair is replaced by an explicit checked transformation, conditional on the
checker and artifact-association assumptions above. EC6 benchmarking remains
outside this phase.
