# Project plan and approval gates

Phases 1 through 4 are complete; Phase 5 awaits approval.
At every phase boundary: review changes,
run relevant checks, update the README and phase report, commit source changes
with a descriptive message, push to `main`, then stop for explicit approval.
If a push fails, report that failure; do not claim publication or start the next
phase. Generated proving keys, artifacts, and secrets stay out of Git.

| Phase | Deliverables and acceptance criteria | Status |
| --- | --- | --- |
| 1. Mathematical specification | Fix dimensions, bounds, model, quantization, zero threshold, signed encoding, commitment function, public/private interface, proof obligations, and acceptance fixtures. Check numerical consistency. | Complete |
| 2. Reference implementation | Exact integer classifier and rational quantizer; strict validation and field encoding; pinned commitment implementation with cross-checked vectors; boundary and rejection tests. Exhaustively exercise the small integer domain. | Complete |
| 3. Circuit | Pin compiler/dependencies; implement all specified constraints and shared input wires; compare witnesses with the reference; inspect emitted constraints and public-signal ordering. | Complete |
| 4. Proofs | Reproducible local setup and proof commands; valid positive, negative, zero, and extreme cases; reject incorrect labels, changed commitments, invalid encodings, and out-of-range inputs. Distinguish parser rejection, witness failure, constraint failure, and verifier rejection. | Complete; awaiting Phase 5 approval |
| 5. Formal correctness | Written mathematical proof with explicit assumptions; completeness and soundness, decoding, field lifting, sign, and common-input binding; trace each obligation to circuit constraints. State the assurance boundary between the paper proof and compiled R1CS. | Not started |
| 6. Benchmarks | Reproducible measurements and methodology for constraints, compilation/setup, proving, verification, serialized proof size, and memory. Record machine, tool versions, repetitions, and summary statistics. | Not started |

## Planned implementation choices

Use an exact-integer reference implementation, Circom 2/circomlib for constraints,
and snarkjs Groth16 for an initial proof demonstration. Pin executable releases
and dependency integrity when introduced, and confirm the reference Poseidon
matches the specification revision. Setup in Phase 4 is for the local research
demonstration; any retained setup secrets invalidate production security claims.

The initial formal deliverable is a written proof, as permitted by the brief.
A proof assistant is an optional extension, not a prerequisite silently added
to this plan. Source-to-constraint review must accompany the mathematical proof.

## Adversarial checks to preserve

Beyond honest witness generation, later phases must check the constraints
against malicious assignments: omitted range checks, non-Boolean bits, modular
aliases, a flipped zero label, unrelated commitment/model inputs, and altered
public proof signals. A wrapper refusing a value is not evidence that the
underlying circuit rejects it. Mutation checks should demonstrate that targeted
constraint omissions are detected where feasible.

For a mismatched commitment with a fixed opening, the witness must fail. Do not
claim that every different commitment admits no opening: the relation is
existential. Tampering with an existing proof's public signals must fail
verification under the selected proof system's security assumptions.

## Benchmark protocol to establish in Phase 6

Keep compilation, setup, witness generation, proving, and verification timings
separate. Record constraint count and optimization settings. Report cold runs
and repeated measurements with units and dispersion. Define exactly which proof
serialization is measured and exclude public inputs from that size (report
their size separately). Identify whether memory is peak process RSS, working
set, or another metric and whether child processes are included. Commit small,
sanitized reports; leave generated outputs and raw temporary artifacts ignored.
