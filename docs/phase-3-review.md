# Phase 3 review

## Delivered

- Circom version-1 inference circuit with four input range constraints, salted
  Poseidon commitment, affine score, bounded signed threshold, Boolean label,
  and one shared committed/classified input vector.
- Official Circom 2.2.3 asset pins, checksum-verified local installer, explicit
  compilation options, and reproducible O1/O0 builds.
- Canonical circuit-input adapter and binary R1CS evaluation tests using pinned
  r1csfile 0.0.48.
- Exhaustive compiled arithmetic tests, full-circuit commitment comparisons,
  direct malformed-assignment checks, and targeted constraint-omission tests.

The mathematical specification and reference classifier are unchanged.

## Validation

All 32 tests passed after a clean `npm ci`, compiler verification, and rebuild.
The circuit suite has 11 tests, in addition to the 21 reference tests. It checks
all 65,536 valid arithmetic inputs, including 930 zero scores. Full-circuit
witnesses match all nine published commitment fixtures in both O0 and O1, plus
16 extreme corners and 64 additional deterministic cases in O1.

The optimized circuit contains 999 constraints: 382 nonlinear and 617 linear.
Its binary R1CS reports two public inputs, five private inputs, and zero public
outputs. Symbol inspection confirms public order `[commitment, label]`.
The O0 audit build contains 1,635 constraints. Both builds use the specified field.

The emitted O0 equations were checked against the specification. Invalid
assignments fail both O0 and O1 constraint evaluation. Eight targeted omission
scenarios admit their counterexamples only after the relevant test-evaluator
rows are removed. The tests also distinguish parser rejection and normal
witness-generator failure from these direct constraint checks.

Validated runtime: Windows x64, Node.js 26.3.1, npm 11.16.0, official Circom 2.2.3.
Detailed commands and assurance limits are in the [circuit guide](circuit.md).

## Next gate

After committing and pushing Phase 3 to `main`, stop for approval. Phase 4 will
add the proof-system tool pin, local setup, proof generation, and verification
tests. No proving setup, proving keys, or zero-knowledge proofs were generated
in this phase. Compiler binaries, dependencies, and build artifacts remain ignored.
