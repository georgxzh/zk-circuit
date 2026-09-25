# Proof generation and verification

Phase 4 uses **snarkjs 0.7.6**, Groth16, and BN254 (`bn128` in snarkjs).
The unchanged O1 inference circuit has 999 constraints and public signals exactly
`[commitment, label]`. Tool choices are recorded in
[proof-system.json](../spec/proof-system.json); npm dependencies and integrity
hashes are pinned in the lockfile. The underlying setup/proof operations follow
the [official snarkjs API](https://github.com/iden3/snarkjs/tree/v0.7.6).

## Local demonstration setup

From the repository root, with Node.js 26.3.1 and npm 11.16.0:

```sh
npm ci
npm run setup:circom
npm run setup:proof
npm run test:proof
```

`setup:proof` rebuilds the circuits, creates a power-11 Powers of Tau accumulator,
adds a contribution using fresh CSPRNG entropy, prepares phase 2, and validates
the resulting transcript. It then creates the circuit-specific Groth16 key, adds
another fresh contribution, verifies the key against the R1CS and prepared
transcript, and exports the verification key. No contribution entropy is written
to files or passed through command-line arguments.

This is a **single-machine research setup**, not an independently contributed
production ceremony. Secure destruction of setup randomness is not established;
there is no production soundness claim based on this setup. Transcript validation
checks algebraic consistency and does not prove that setup secrets were erased.

Each completed setup has its own `build/proofs/setup-<UUID>/` directory containing
the R1CS/WASM snapshot, prepared transcript, final proving key, and verification
key. An ignored `build/proofs/setup.json` manifest records their SHA-256 hashes,
tool version, and selected generation. It is published only after setup validation.
Intermediate accumulators and keys are held in memory. Failed setup directories
can remain ignored; they are never selected by a successful manifest write.

A repeated setup checks the selected artifacts' hashes and reuses them if the
compiled R1CS and WASM match. Changed compilation outputs create and select a new
generation while preserving old files. Missing or corrupted artifacts in an
existing selection cause an error. Proving does not automatically run setup.
Reproducibility means a repeatable procedure: fresh setup entropy and proof
randomness deliberately produce different bytes.

## Prove and verify a public synthetic example

The following input is already published in the test fixtures. Its salt of zero
is for testing only. For real private inputs use the reference `randomSalt()`
CSPRNG and deliver input through a private channel; do not place secrets in shell
history. Features here are offset encoded: `[9,8,8,9]` means `[1,0,0,1]`.

```powershell
$synthetic = '{"commitment":"13717145394514210098553098133315194096454403924040786113510845616151992131149","label":"1","u":["9","8","8","9"],"salt":"0"}'
$packet = $synthetic | node scripts/proof-cli.js prove
$packet | node scripts/proof-cli.js verify 13717145394514210098553098133315194096454403924040786113510845616151992131149 1
# {"verified":true}
```

`npm run prove --silent` and `npm run verify --silent -- COMMITMENT LABEL` are
equivalent entry points. Prove accepts a canonical circuit-input JSON object on
stdin. It preserves the claimed commitment and label, calculates a witness in
memory, checks it against the actual binary R1CS, generates a proof, then verifies
that proof before returning it. The packet contains only `proof`, `publicSignals`,
and `verificationKeySha256`. It does not include features, salt, score, or witness.

Verify accepts the packet on stdin and the application's expected commitment and
label as public arguments. It prints `{"verified":true}` with exit code 0 or
`{"verified":false}` with exit code 1. Invalid command/input/setup errors also exit
1 with a generic diagnostic. The pinned witness runtime can print assertion
locations on stderr for rejected witnesses; the circuit has no value logging.
The CLI caps stdin at 65,536 characters. No proof or private input file is required.

Programmatic callers use [openProofSession](../src/proof.js):

```js
const session = await openProofSession(); // verification only
try {
  const accepted = await session.verify(packet, expectedPublicSignals);
  // Act only when accepted === true.
} finally {
  await session.close();
}
```

Use `{ proving: true }` when opening a session that needs `session.prove(input)`.
Use one session per process and await operations sequentially; snarkjs shares its
curve workers globally. Close in `finally`, including after errors. Verification
loads only the manifest and verification key; it does not require the proving
key, transcript, R1CS, WASM, or compiler. Proving loads and checks all selected
artifacts as buffers. The application owns file I/O explicitly, avoiding file
handle leaks in snarkjs setup operations under Node 26.

## Verification trust boundary

The selected manifest and verification key are **trusted application
configuration**. Their hashes detect corruption relative to that selection;
hashes do not authenticate a manifest supplied by an adversary. Deploy a reviewed
key/manifest through a trusted channel, retain its association with the intended
model and circuit, and protect that selection against replacement. A proof packet
cannot choose a new verification key. Its key hash is an identifier that must
match the application's independently selected key.

The verifier also requires independently expected `[commitment, label]`. Passing
the packet's own array as the expected statement establishes only that statement,
not that it is the statement the application intended. A setup rotation changes
key identity; old proofs need their original trusted key selection.

The wrapper enforces exactly two canonical scalar-field strings and a Boolean
label, checks equality with the expected statement, validates canonical proof
shape/coordinate encodings, and calls the Groth16 pairing verifier. Coordinate
bounds use the BN254 **base field**, which differs from the circuit scalar field.
Malformed untrusted packets return false; malformed application expectations or
unavailable trusted artifacts are configuration errors.

## Validation and limits

`npm test` rebuilds, creates or reuses the validated setup, and runs all reference,
circuit, and proof tests. `test:proof` runs only the proof suite after build/setup.
Negative witness tests may print expected assertion diagnostics while passing.

| Layer | Evidence |
| --- | --- |
| Valid proofs | All nine published commitment fixtures: positive, negative, zero, adjacent scores -1/+1, all-minimum/all-maximum inputs, and both score extrema |
| Parser | Out-of-range signed/encoded inputs, noncanonical field aliases, malformed public arrays and non-Boolean labels rejected |
| Witness generator | Flipped positive/negative/zero labels, changed commitment for a fixed opening, and encoded 16/p-1 rejected |
| Compiled constraints | Prior direct O0/O1 adversarial tests retained; an in-memory WTNS public-label wire is changed and rejected by snarkjs R1CS checking |
| Pairing verifier | A proof generated at low level from that invalid witness fails; altered commitment/label, changed proof points, and a different contributed verification key fail |
| Application boundary | Wrong expected statements, malformed packets, untrusted key identities, and corrupted selected artifacts fail; CLI exit behavior is checked |

Two repeated honest proofs for one statement differ, exercising prover randomness.
This is not a statistical test of randomness or a proof of zero knowledge.
Nine fixtures and repeated/CLI proving yield 11 valid proof generations per full
proof-suite run, plus one deliberately invalid proof attempt at the low-level API.
Tests preserve the distinction between a parser rejecting input, a generator
refusing a witness, a constraint rejecting an assignment, and a verifier rejecting
a proof. They do not establish a formal theorem for all assignments or the security
of Poseidon/Groth16. Formal correctness is Phase 5; performance measurements are
Phase 6. All generated material remains ignored by Git.
