# Phase 5 review

Completed on 2026-10-03. The deliverable is a written mathematical proof,
as permitted by the original brief and project plan, accompanied by executable
constraint correspondence checks. It is not a proof-assistant formalization.

## Delivered

- [Formal correctness argument](formal-correctness.md): the field relation,
  eight lemmas, soundness for arbitrary satisfying assignments, constructive
  completeness for every valid feature vector and salt, and a quantization
  corollary.
- [Constraint audit](constraint-audit.md): source/lemma mapping, exact optimized
  Poseidon definition, full O0 polynomial correspondence, and explicit remaining
  compiler, setup, proof-system, commitment, and application assumptions.
- [Complete graph audit test](../test/formal-audit.test.js): matches all 1,635
  O0 equations, including the 1,585-equation hash graph, against independently
  constructed expected equations using the pinned constants.
- `npm run test:formal`, also included in `npm test`, and updated project status.

The model, commitment definition, quantization rules, public interface, circuit
source, and runtime implementation are unchanged. Package version is 0.5.0;
dependency versions remain pinned and unchanged.

## Correctness obligations

| Required obligation | Result |
| --- | --- |
| Unique bounded decoding | L1–L2 derive Boolean digits, unique integer decompositions below p, and the input offset bijection |
| Agreement of field and integer scores | L3 bounds the integer score by [-83,67] and proves unique signed decoding; L4 bounds the modular difference by [-195,210] and forces equality |
| Correct sign gadget | L5 proves the high bit is exactly the nonnegative predicate, including label 1 at score zero |
| Same committed/classified input | L6 proves the exact hash graph is functional; L7 uses all common-input equalities, domain, salt, and commitment-output equality |
| Every satisfying assignment has the intended label | T1 combines the lemmas without relying on the witness generator |
| Every valid opening is satisfiable for its intended label | T2 explicitly constructs input bits, score bits, affine values, wire copies, and all hash intermediates |
| Exact quantization interpretation | L8 proves the floor correction, tie behavior, accepted raw interval, and positive-scale equivalence on quantized features |

The statements concern the witness's decoded vector. They do not claim a unique
opening for a public hash or silently derive hiding from collision resistance.

## Validation

`npm test` rebuilt all targets with the pinned compiler and passed **all 42
tests**: 21 reference, 11 circuit, 9 proof, and 1 complete graph audit. The
compiled R1CS/WASM hashes still matched the selected Phase 4 setup, which was
reused. All nine inference fixtures verified, and the existing wrong-statement,
invalid-witness, proof-tampering, and alternate-key rejection cases still passed.

The new audit expands every binary O0 row into a polynomial, matches expected
equations up to nonzero field scaling, and requires a one-to-one match with no
unaccounted rows. It includes capacity zero, domain 1, all constant offsets,
matrix orientation, 119 S-box applications, all component connections, and the
final output selection. This is a universal polynomial-identity check over the
audited wire map, rather than a sample of satisfying hash evaluations. Its
parser, symbolic transcription, and JavaScript execution remain trusted.

Existing exhaustive arithmetic validation covers all 65,536 input vectors,
including 930 zero-score vectors. Direct O0/O1 malicious-assignment tests and
eight constraint-omission cases remain intact. These checks support the written
proof; they do not substitute for its universal arguments.

Validated runtime: Windows x64, Node.js 26.3.1, npm 11.16.0, Circom 2.2.3,
snarkjs 0.7.6. No formal proof of the compiler's O0-to-O1 translation or of
cryptographic security is claimed. The shipped proof artifact remains O1, so
its use retains the documented compiler-correctness assumption. The local
Groth16 setup remains a single-machine demonstration.

## Next gate

Commit and push Phase 5 to `main`, then stop for approval. Phase 6 will establish
the benchmark methodology and measurements. No benchmark study was performed
in this phase. Generated keys, transcripts, witnesses, proofs, and build artifacts
remain outside Git; only source, tests, dependency metadata, and documentation
are part of this phase's commit.
