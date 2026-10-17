# EC3 review: Pedersen circuit implementation

The approved EC3 phase adds a separate Baby Jubjub Pedersen inference circuit,
strict input preparation, isolated build targets, and constraint-level tests.
The original Poseidon implementation and semantics are unchanged.

## Completed acceptance criteria

- Four feature ranges and exact radix-16 message packing use the same input
  wires as the unchanged bounded-integer classifier.
- A 251-bit blinder plus a strict comparison enforces the canonical scalar range.
- Complete Edwards fixed-base multiplication supports zero scalars and identity
  accumulators. Independently checked constants and Boolean selection justify
  subgroup membership through the addition chain.
- Both commitment coordinates and the Boolean threshold label are constrained.
  The exact public order is X, Y, label; there are no public outputs.
- The binary and JSON R1CS agree. All 4,865 O0 rows are inspected against
  expected equations, including all division constraints and 267 fixed doubles.
- Independent raw assignments and generated witnesses agree for 13 established
  fixtures and 24 additional cases, on O0 and O1. Adversarial cases exercise
  parser, witness, and raw-constraint rejection separately.
- Deleting the strict-bound assertion admits the scalar-order alias; deleting
  either coordinate equality admits its corresponding altered coordinate.
- Identity, zero score, scalar zero, scalar ell-1, and inverse cancellation are
  covered without excluding valid exceptional cases.

## Validation

Validated on Windows x64 with Node.js 26.3.1, npm 11.16.0, Circom 2.2.3,
circomlib 2.0.5, circomlibjs 0.1.7, and r1csfile 0.0.48.

- `npm run test:pedersen-circuit`: 24 tests, all pass.
- `npm test`: 229 tests, all pass.
- The build runs the EC1 provenance/parameter audit: all 15 pinned files,
  generator reproduction, independent subgroup arithmetic, 65,536 packing
  cases, 930 zero scores, and score bounds [-83,67].
- O1: 2,966 constraints, 2,695 wires; O0: 4,865 constraints, 4,594 wires.
  Both have three public inputs and five private inputs.
- No new dependencies, proving keys, setup material, or proof packets are added.

Artifact SHA-256 values (generated files remain ignored):

| Artifact | SHA-256 |
| --- | --- |
| Pedersen O0 R1CS | `261008168d9607289322ac4895f555eba84b699b82d102e7742299afce1091ba` |
| Pedersen O1 R1CS | `ac70af75d0fad9c91a1d39326447552453615d10458ae4ac2f788797bb4df2de` |
| Pedersen O1 WASM | `ae5deff20ef199a771c433016fb2ee2baaf3edc1aabfc445c3919f491fd489ec` |
| Unchanged Poseidon O0 R1CS | `648f65828785aaaf4ca80b1c3d111504c6fed938d244db87160519650a8404fc` |
| Unchanged Poseidon O1 R1CS | `5ad3eeeca14589c17236fb721ab24189d597cc55267f423b497992fbb4270f0f` |

## Remaining obligations

The [circuit guide](pedersen-circuit.md) records the domain argument and test
limits. EC5's universal theorem and compiler-translation review are not complete.
In particular, this O0 build exceeds the existing validator's 4,096-wire and 4,096-row bounds.
Cryptographic binding, hiding, and proof-system assumptions remain separate.

After committing and pushing EC3 to main, stop for explicit EC4 approval.
EC4 will implement separate Pedersen proof generation and verification.
