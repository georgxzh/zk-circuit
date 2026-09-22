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

**Phase 3 complete: circuit implementation. Awaiting approval for Phase 4.**

The integer reference and Circom circuit are implemented and tested against
compiled constraints. Proof generation and formal correctness proofs remain in
later phases; no proving setup or zero-knowledge proof has been generated yet.

- [Mathematical specification](docs/specification.md): normative semantics,
  quantization, signed encoding, commitment, and constraint relation.
- [Model parameters](spec/model.json): machine-readable constants.
- [Acceptance cases](spec/acceptance-cases.json): synthetic examples and rejection
  requirements for later implementation and proof tests.
- [Project plan](docs/plan.md): six phases, acceptance criteria, and approval gates.
- [Phase 1 review](docs/phase-1-review.md): specification checks and remaining work.
- [Reference usage](docs/reference.md): installation, API, CLI, and validation scope.
- [Phase 2 review](docs/phase-2-review.md): implementation and test results.
- [Circuit guide](docs/circuit.md): compiler setup, build targets, interface,
  constraint inspection, and adversarial tests.
- [Phase 3 review](docs/phase-3-review.md): circuit validation and remaining work.

## Run the reference

Use Node.js 26.3.1 (recorded in `.node-version`) and npm 11.16.0:

```sh
npm ci
npm run setup:circom
npm test
npm run check:poseidon
```

The compiler installer downloads the official Circom 2.2.3 binary, verifies its
pinned SHA-256, and stores it in ignored `.tools/`. Windows, Linux, and macOS x64
assets are pinned; Phase 3 was validated on Windows x64. To run only the integer
reference tests without a compiler, use `npm run test:reference`.

PowerShell example, using a public synthetic zero-score input:

```powershell
'{"x":[1,1,0,1]}' | node src/cli.js classify
# {"score":"0","label":"1"}
```

Arithmetic uses `BigInt`; JSON outputs use decimal strings. See the
[reference guide](docs/reference.md) for exact rational inputs and commitments.

The planned stack is Circom 2, circomlib Poseidon, and snarkjs/Groth16 over the
BN254 scalar field. Phase 2 pins circomlibjs 0.1.7 and the circomlib 2.0.5 source
used for compatibility checks, with transitive dependencies locked. Phase 3 pins
the official Circom 2.2.3 compiler and r1csfile 0.0.48 constraint parser. The
proof-system executable will be pinned in Phase 4. The Poseidon function is
identified by an immutable upstream revision in the specification.

The eventual theorem concerns the **quantized integer model**. It does not assert
accuracy on real data, fidelity to an arbitrary floating-point model, or that a
prover's features came from an authentic external source. Commitment privacy and
proof-system security require separate cryptographic assumptions.

## Repository policy

Complete one phase at a time. After each completed phase, create a descriptive
commit, push it to `main`, and stop until the user explicitly approves the next
phase. Never commit generated proving keys, setup material, witnesses, build
artifacts, or secrets. Use synthetic, explicitly public test vectors only.
