# EC4 review: Pedersen proofs and adversarial validation

EC4 implements separate Groth16 setup, proving, and expected-statement
verification for the EC3 Pedersen circuit.

## Completed

- Added a pinned Pedersen proof profile, power-12 setup, independent artifact
  directory and manifest, and a three-signal/four-IC-point verification key.
- Validated the Powers of Tau and final key against the reviewed R1CS.
  Valid setup reuse preserves both selected Pedersen and Poseidon identities.
- Added a proving API with strict input parsing, in-memory witness generation,
  R1CS checking, and verification before returning a public packet.
- Added strict verification against independently expected coordinates and label.
  The packet cannot choose a profile or key.
- Added CLI commands, verifier-only deployment support, input snapshots, and
  sequential-session lifecycle checks.
- Preserved the Poseidon workflow and EC3 raw O0/O1 constraint tests.

## Validation

Validated on Windows x64, Node.js 26.3.1, npm 11.16.0, Circom 2.2.3,
and snarkjs 0.7.6 with the existing dependency lock.

- Separate local setup: transcript and circuit-key validation passed.
- EC4 proof suite: **26 tests passed**.
- Standalone `npm run test:pedersen-proof`: **50 circuit/proof tests passed**,
  with both setup prerequisites included.
- Full `npm test`: **255 tests passed**.
- All 13 public synthetic fixtures prove and verify, including identity and
  scalar ell-1. Repeated and CLI proving exercise fresh proof generation.
- Parser, witness, raw R1CS, pairing, and application/configuration failures are
  tested separately; see the [layer table](pedersen-proofs.md).
- An altered raw witness fails R1CS checking. A low-level proof constructed from
  it also fails pairing verification.
- Altered public coordinates/label, valid foreign keys, foreign-key proofs with
  spoofed metadata, Poseidon packets/proofs, and malformed transports fail.
- Corrupted artifacts and invalid local profile/interface selections fail closed.
  Verification works with only the selected manifest and verification key.
- No circuit, mathematical parameters, or dependency versions changed.
  The EC3 R1CS/WASM identities and counts remain unchanged.

The source-controlled proof profile binds the model, Pedersen parameters,
and reviewed compiled circuit. Setup manifests, keys, transcripts, witnesses,
proof packets, and test logs remain under ignored build directories.
Only source, tests, profile metadata, and documentation are committed.

## Remaining scope

This is a single-machine research setup; setup integrity, secure destruction,
Groth16 security, and implementation correctness remain assumptions.
A hash identifies trusted configuration but does not authenticate an untrusted
replacement. The public label deliberately leaks classification.

EC5's formal Pedersen soundness/completeness theorem and translation review
remain outstanding, including the existing validator's size limits.
EC6's comparative benchmarks remain outstanding. After committing and pushing
EC4, stop for explicit EC5 approval.
