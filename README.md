# zk-circuit

**Formal Verification of a Zero-Knowledge Circuit for Privacy-Preserving AI Inference**

A small research project connecting a bounded-integer linear classifier to a
zero-knowledge circuit with explicit correctness obligations.

The prover will demonstrate that a committed private input has the public label

$$s = 3x_0 - 2x_1 + x_2 + 4x_3 - 5,\qquad y = \mathbf{1}[s \geq 0],$$

where each feature is an integer in $[-8,7]$. The model is public and fixed.
Only the salted commitment and classification are public; the features, salt,
and score are private.

## Current status

**Phase 1 complete: mathematical specification. Awaiting approval for Phase 2.**

No reference implementation, circuit, proving setup, or formal correctness proof
exists yet. This repository currently specifies their required behavior.

- [Mathematical specification](docs/specification.md): normative semantics,
  quantization, signed encoding, commitment, and constraint relation.
- [Model parameters](spec/model.json): machine-readable constants.
- [Acceptance cases](spec/acceptance-cases.json): synthetic examples and rejection
  requirements for later implementation and proof tests.
- [Project plan](docs/plan.md): six phases, acceptance criteria, and approval gates.
- [Phase 1 review](docs/phase-1-review.md): specification checks and remaining work.

The planned stack is Circom 2, circomlib Poseidon, and snarkjs/Groth16 over the
BN254 scalar field. Exact executable tool versions and lockfiles will be pinned
when introduced. The Poseidon function is already identified by an immutable
upstream revision in the specification.

The eventual theorem concerns the **quantized integer model**. It does not assert
accuracy on real data, fidelity to an arbitrary floating-point model, or that a
prover's features came from an authentic external source. Commitment privacy and
proof-system security require separate cryptographic assumptions.

## Repository policy

Complete one phase at a time. After each completed phase, create a descriptive
commit, push it to `main`, and stop until the user explicitly approves the next
phase. Never commit generated proving keys, setup material, witnesses, build
artifacts, or secrets. Use synthetic, explicitly public test vectors only.
