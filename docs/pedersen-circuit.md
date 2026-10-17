# Pedersen circuit (EC3)

EC3 implements the relation in the [EC specification](pedersen-specification.md).
It does not yet provide Pedersen setup, proofs, or a proof verifier. The existing
Poseidon circuit, keys, public interface, and tests remain separate.

## Build and interface

Run `npm run build:pedersen` to compile, or
`npm run test:pedersen-circuit` to compile and run the EC3 tests.
The build verifies the pinned compiler and EC1 source/parameter provenance first.
It creates only ignored outputs in `build/pedersen` (O1),
`build/pedersen-audit` (O0), and `build/pedersen-add` (test harness).
The compiler is Circom 2.2.3, using BN254's scalar field and sanity level 2.

The production top level is `circuits/pedersen-inference.circom`.
Its public inputs are exactly `[commitmentX, commitmentY, label]`, in that
order, with zero public outputs. Private inputs are `u[4]` and `r`.
Coordinates, label, encoded features, and scalar use canonical decimal strings.

`src/pedersen-circuit-input.js` exports asynchronous
`circuitInput(x, r, expectedSignals)` and `parseCircuitInput(object)`.
They validate the strict EC2 encodings and subgroup point representation,
snapshot inputs before asynchronous work, and preserve the independently
supplied expected claim. A well-formed but wrong claim is not repaired.

Public synthetic example:

```js
import { circuitInput } from './src/pedersen-circuit-input.js';
const input = await circuitInput([-8,-8,-8,-8], 0n, ['0','1','0']);
// { commitmentX:'0', commitmentY:'1', label:'0', u:['0','0','0','0'], r:'0' }
```

Use fresh uniformly sampled secret blinders for private data. These fixture
values are deliberately public. This adapter is not a proof verifier.

## Constraints and arithmetic domains

The unchanged `BoundedLinear` template range-checks all four encoded features,
computes the score and shifted score, and binds the Boolean public label to
the high bit of the eight-bit shifted score. Score zero still has label one.
Those same four top-level feature wires feed the radix-16 packing equation.

The packed message has a 16-bit decomposition. The blinder has a 251-bit
decomposition and a separate `LessThan(251)` constraint enforcing `r < ell`.
The comparator receives two bounded 251-bit values, and its intermediate is
positive and below `2^252 < p`; it cannot wrap. Bit length alone would admit
`ell` and other invalid scalar representatives.

`PedersenFixedBase` uses Boolean selection and pinned circomlib `BabyAdd`.
Starting from the identity, each bit selects either the identity or a fixed
double of G/H. The 16 G doubles and 251 H doubles are computed at compile time
with the [published affine doubling formula](https://hyperelliptic.org/EFD/g1p/auto-twisted.html).
Their denominators are checked as constants; the emitted selection coefficients
are independently checked against BigInt group calculations in the test audit.
There is no generated constant table to commit.

The EC1 audit establishes the selected points' subgroup membership and checks
the square/nonsquare conditions used by the complete Edwards addition theorem
cited in the specification. Boolean selection, the initial identity, and group
closure supply the domain invariant for every addition. Thus each constrained
addition has nonzero denominators, including at zero, identity, and cancellation.
The final equality binds both public coordinates to a subgroup result.
Separate public subgroup-multiplication constraints are unnecessary under this
construction. A curve equation alone would not imply subgroup membership.

BabyAdd's division hints are accompanied by both cross-multiplied equations.
The tests locate these equations for every addition in the actual O0 R1CS,
including the final sum. Assertions and witness computation are not substituted
for those constraints. The generic fixed-base template's precondition is a
validated constant subgroup base; this top level supplies the two fixed bases.
It is not an API for arbitrary witness-supplied points.

## Validation evidence

| Build | Constraints | Wires, including constant | Public inputs | Private inputs |
| --- | ---: | ---: | ---: | ---: |
| Pedersen O0 | 4,865 | 4,594 | 3 | 5 |
| Pedersen O1 | 2,966 | 2,695 | 3 | 5 |
| Addition harness O0 | 22 | 25 | 0 | 4 |

The harness has two public outputs; neither production build has outputs.

The test suite compares binary R1CS with the JSON export and inspects the
public prefix. It accounts for every O0 row, up to a nonzero field scaling,
against the expected arithmetic/wiring equations. This includes both sets of
Boolean constraints, all decompositions, the strict comparison, all fixed-point
selection coefficients, accumulator links, addition equations, packing, and
the unchanged classifier.

An independent BigInt assignment constructor fills all 4,594 O0 wires without
calling the witness generator. For all 13 EC2 fixtures and 24 additional cases,
these assignments agree with reference commitments and generated witnesses,
satisfy O0, and project to satisfying O1 witnesses matching the O1 generator.
The addition harness exercises both identities, doubling, inverse cancellation,
and full-curve order-two cases. The production output remains in the subgroup.

Invalid raw assignments test each feature position, scalar boundaries
`ell`, `ell+1`, `2^251-1`, `2^251`, and `p-1`, wrong packing,
different classified/committed inputs, wrong labels including score zero,
non-Boolean labels/bits, altered coordinates, and off-curve/torsion claims.
Parser rejection, witness-generation rejection, and raw-R1CS rejection are
tested separately. No EC pairing-verifier rejection is claimed at this phase.
These are fixed-opening adversaries, not claims that a subgroup commitment
has no other mathematical opening.

Omitting the strict comparison's output assertion makes the raw `r=ell`
assignment satisfy O0, demonstrating why that constraint matters.
Omitting either public coordinate equality similarly admits its targeted
mutation. Optimized-wire mutations are applied directly to retained O1 wires;
an O0 wire removed by optimization is not treated as an O1 rejection test.

## Assurance limits and next phases

This is implementation validation, not the EC5 soundness/completeness theorem
or a proof of compiler/library correctness. Exhaustive input packing and the
baseline integer classifier checks remain available, but the scalar space is
not exhaustively tested. EC5 must establish the invariant for every satisfying
assignment and constructive completeness for every allowed opening.

The existing translation validator has 4,096-wire and 4,096-row bounds; the EC
O0 build has 4,594 wires and 4,865 rows. Its Poseidon result cannot certify this circuit. EC5 must explicitly
review bounds and supported transformations before making translation claims.

EC4 requires its own setup size, keys, manifest identity, three-signal verifier,
and adversarial proof checks. No EC proving keys or proof packets are generated
here. Comparative performance and memory measurements belong to EC6; constraint
counts alone do not establish proof-time performance.
