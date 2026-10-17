# zk-circuit

**Formal Verification of a Zero-Knowledge Circuit for Privacy-Preserving AI Inference**

A small research project connecting a bounded-integer linear classifier to a
zero-knowledge circuit with explicit correctness obligations.

The prover demonstrates that a committed private input has the public label

$$s = 3x_0 - 2x_1 + x_2 + 4x_3 - 5,\qquad y = \mathbf{1}[s \geq 0],$$

where each feature is an integer in $[-8,7]$. The model is public and fixed.
Only the salted commitment and classification are public; the features, salt,
and score are private.

## Current status

**All six phases complete, including benchmarking.**

The integer reference, Circom circuit, and Groth16 proof workflow are implemented.
Valid inference proofs verify; adversarial tests exercise parser, witness,
constraint, and verifier rejection. The setup is a single-machine research
demonstration. A written proof establishes soundness and completeness of the
specified relation, with a complete O0 constraint audit. An executable translation
validator now checks the exact production O0/O1 pair, with explicit validator,
metadata, runtime, and cryptographic assumptions. A
reproducible benchmark records measured performance and its limitations.

**Research extension: translation-validator Stage 2 complete, awaiting review.**
The [Stage 2 report](docs/translation-stage2-report.md) records acceptance of the
production 1,635-to-999-row translation and 14 varied O0/O1 pairs, complete wire
and row accounting, corrupted-artifact tests, and bidirectional witness transport.
This is executable validation with remaining assumptions, not a machine-checked
compiler proof. No O2 work or novelty claim is included.
Run `npm run test:translation-stage2` for fresh compilation and tests, or
`npm run translation:stage2` for the recorded experiment. The earlier
[Stage 0 contract](docs/translation-stage0-contract.md) and
[Stage 1 report](docs/translation-stage1-report.md) document the design history.

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
- [Proof guide](docs/proofs.md): local setup, proving, expected-statement verification,
  and the verification-key trust boundary.
- [Phase 4 review](docs/phase-4-review.md): proof and rejection test results.
- [Formal correctness](docs/formal-correctness.md): lemmas, soundness, completeness,
  quantization corollary, and cryptographic assumptions.
- [Constraint audit](docs/constraint-audit.md): full O0 graph correspondence and
  the remaining O1 compiler assumption.
- [Phase 5 review](docs/phase-5-review.md): deliverables and validation results.
- [Benchmark methodology](docs/benchmarks.md) and [results](docs/benchmark-results.md):
  timings, serialized sizes, memory, host details, and dispersion.
- [Phase 6 review](docs/phase-6-review.md): completed measurements and project status.

## Pedersen commitment extension

**EC3 complete; awaiting explicit approval for EC4.** A separate Baby Jubjub
commitment reference and circuit implement C = [m]G + [r]H, with the same classifier
and ordered public inputs [commitmentX, commitmentY, label]. The fixed subgroup
generators have reproducible model/role-separated derivations.

- [EC specification](docs/pedersen-specification.md): parameters, encoding,
  canonical scalars, complete group arithmetic, and security assumptions.
- [Source review](docs/pedersen-library-review.md): pinned library behavior,
  generator provenance, and exceptional-case analysis.
- [Reference API](docs/pedersen-reference.md): exact packing, strict parsers,
  uniform blinding, commitments, and local opening checks.
- [EC circuit guide](docs/pedersen-circuit.md) and [EC3 review](docs/phase-ec3-review.md):
  constrained group arithmetic, public interface, and raw-assignment validation.
- [EC phase plan](docs/pedersen-plan.md), [EC1 review](docs/phase-ec1-review.md),
  and [EC2 review](docs/phase-ec2-review.md): validation and approval gates.

Run `npm run test:pedersen` to audit the EC1 parameters and test the EC2
reference, including independent group calculations and 13 public synthetic
fixtures. Run `npm run test:pedersen-circuit` to compile and validate the EC3
circuit. Its proof flow, theorem, and comparative benchmarks remain for later
phases. The existing Poseidon workflow is unchanged.

## Run the project

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
The full `npm test` also creates a validated local demonstration setup on its first
run and reuses it when artifact hashes match. Generated material stays in `build/`.
After the tests finish, use `npm run benchmark` to collect a new local measurement
run. Results are not published automatically; measured setup trials leave the
selected application key unchanged.

PowerShell example, using a public synthetic zero-score input:

```powershell
'{"x":[1,1,0,1]}' | node src/cli.js classify
# {"score":"0","label":"1"}
```

Arithmetic uses `BigInt`; JSON outputs use decimal strings. See the
[reference guide](docs/reference.md) for exact rational inputs and commitments.

The stack is Circom 2, circomlib Poseidon, and snarkjs/Groth16 over the
BN254 scalar field. Phase 2 pins circomlibjs 0.1.7 and the circomlib 2.0.5 source
used for compatibility checks, with transitive dependencies locked. Phase 3 pins
the official Circom 2.2.3 compiler and r1csfile 0.0.48 constraint parser. The
proof library is pinned to snarkjs **0.7.6** in Phase 4. The Poseidon function is
identified by an immutable upstream revision in the specification.

The written theorem concerns the **quantized integer model**. It does not assert
accuracy on real data, fidelity to an arbitrary floating-point model, or that a
prover's features came from an authentic external source. Commitment privacy and
proof-system security require separate cryptographic assumptions.

## Repository policy

Complete one phase at a time. After each completed phase, create a descriptive
commit, push it to `main`, and stop until the user explicitly approves the next
phase. Never commit generated proving keys, setup material, witnesses, build
artifacts, or secrets. Use synthetic, explicitly public test vectors only.
