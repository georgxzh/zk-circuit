# Phase 4 review

## Delivered

- Pinned snarkjs 0.7.6 and Groth16/BN254 configuration with locked dependencies.
- Repeatable local power-11 setup, fresh entropy contributions, transcript and
  circuit-key validation, and hashed artifact selection under ignored `build/`.
- In-memory witness generation and R1CS checking before proving, followed by
  self-verification against the exact expected public statement.
- Application verification using an independently selected verification key,
  exactly two expected public signals, strict transport validation, and a
  fail-closed CLI with private input on stdin.
- Nine proof tests covering honest proofs, negative cases at distinct layers,
  key/statement substitution, artifact integrity, and CLI behavior.

The mathematical specification, model, commitment, and circuit are unchanged.

## Validation

The local Powers of Tau transcript passed `powersOfTau.verify`. The contributed
Groth16 key passed `zKey.verifyFromR1cs` against the exact O1 R1CS and prepared
transcript. Its exported verification key has two public inputs. Rebuilding the
circuit reproduced matching artifact hashes and reused the validated selection.

After a clean `npm ci`, **all 41 tests passed**: 21 reference tests, 11 existing
circuit tests, and 9 new proof tests. The full run generated and verified all nine
published commitment fixtures, including positive, negative, zero, adjacent
scores -1/+1, all-minimum/all-maximum inputs, and minimum/maximum scores. Repeated
proving and the CLI add two honest proof generations: **11 valid proofs per run**.

Incorrect positive, negative, and zero labels and a changed commitment for a
fixed opening fail witness generation. Encoded 16 and p-1 fail both the parser
and raw generator at each coordinate. Signed -9/8 and external modular aliases
are rejected by the canonical adapters.

The suite changes the public label directly in an in-memory WTNS buffer, bypassing
the parser and generator. snarkjs rejects that assignment against the binary
R1CS. A low-level proof attempt using that invalid witness also fails pairing
verification. Altered public commitment/label values fail the pairing verifier
without relying on the application's expected-statement guard. Changed proof
points and a separately contributed verification key fail verification too.

Application tests reject mismatched expected statements, malformed public arrays,
non-Boolean labels, noncanonical coordinates, incorrect key identifiers, and
unrequested packet fields. Artifact tests detect corrupted proving/verification
keys and confirm that verification artifact loading needs only the manifest and
verification key. CLI tests check successful proving/verifying, failure exit
codes, JSON-only success output, and no private-input echo.

Prior exhaustive arithmetic checks still cover all 65,536 valid vectors and 930
zero-score cases. Prior raw O0/O1 adversarial assignments and eight constraint
omission scenarios remain part of the passing suite. These are implementation
tests, not a completed formal correctness proof.

Validated host: Windows x64, Node.js 26.3.1, npm 11.16.0, official Circom 2.2.3,
snarkjs 0.7.6. The proof workflow uses memory-backed snarkjs files to avoid an
upstream setup file-handle leak exposed by Node 26, and supplies a quiet witness
logger because snarkjs's invalid-witness branch requires one. See the
[proof guide](proofs.md) for commands and trust boundaries.

## Assurance boundary and next gate

The setup is a single-machine demonstration. Transcript validation does not
establish secure destruction of setup secrets or production soundness. Groth16
and Poseidon security, the application verification-key selection, and the
source/compiler/dependency trust boundary remain explicit assumptions. Proofs
concern the committed quantized model input, not authentic data provenance or
real-world prediction accuracy.

Generated keys, transcripts, R1CS/WASM files, and test artifacts are ignored.
Private witnesses remain in memory; committed vectors are public synthetic data.
No generated setup material, proofs, build artifacts, or secrets are included in
the Phase 4 commit.

After committing and pushing Phase 4 to `main`, stop for approval. Phase 5 will
establish the written formal correctness argument and trace it to the circuit.
Phase 6 will benchmark compilation/setup, proving, verification, sizes, and memory.
