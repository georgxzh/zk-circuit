# EC5 review: formal correctness and artifact correspondence

EC5 completes the written proof and implementation audit for the Pedersen
inference relation. EC6 benchmarking remains separately gated.

## Deliverables

- [Written proof](pedersen-formal-correctness.md): bounded decoding and packing
  uniqueness, canonical scalar comparison, integer/field agreement, signed
  threshold including zero, complete group-gadget domains, common-input wiring,
  soundness, and constructive completeness for every allowed input and blinder.
- [Constraint and translation audit](pedersen-constraint-audit.md): a complete
  source-equation trace for all 4,865 O0 rows, independently checked fixed
  multiples, and exact production artifact identities.
- A separate bounded EC5 profile using the existing translation rules. It checks
  all 1,899 eliminated wires (1,889 aliases and 10 constants), all 1,899 zero
  source rows, and a complete 2,966-row residual correspondence.
- Bidirectional witness transport for all 13 public fixtures, compared with an
  independent BigInt constructor and both compiler witness generators.
- Nine adversarial audit tests and reproducible commands that generate ignored
  manifests, full certificates, row traces, and accounting receipts.

## Validation

Validated on Windows x64 with the existing pinned Node/npm/Circom toolchain
and dependency lock.

- EC5 tests: **9 passed**.
- Full `npm test`: **264 passed**, including original Poseidon, translation,
  and Pedersen reference/circuit/proof suites.
- Parameter provenance checks pass, including the complete 65,536-message
  packing check, 930 zero-score cases, and subgroup parameter calculations.
- The exact EC3 O0 and EC4 production O1 R1CS hashes match. The production WASM
  also matches the reviewed proof profile. No circuit, parameters, dependency
  lock, proof profile, or selected setup keys changed.
- Corrupted semantic rows, certificate steps, constants, pivots, residual rows,
  public metadata, artifact identities, and resource-bound violations reject.

## Limits and phase boundary

This is a written mathematical proof plus executable artifact validation,
not a proof-assistant-verified compiler or cryptographic implementation.
The proof imports the complete Edwards group theorem and published primality/
curve-order premises. The audit depends on its parser, metadata association,
BigInt arithmetic, checker implementation, and runtime behaving correctly.
Commitment binding/hiding and Groth16/setup/application assumptions remain
separate.

Original Stage 0/1/2 bounds remain unchanged. The EC5 profile increases only
wire, row, and linear-combination term bounds and accepts this exact O0/O1
pair without new transformation rules. It does not certify O2 or future builds.

Only source, tests, and documentation are committed. Generated receipts,
keys, witnesses, proofs, build outputs, and logs remain ignored. After the
EC5 commit is pushed to main, stop for explicit EC6 approval.
