# Pedersen proof generation and verification (EC4)

The Pedersen variant now has a separate Groth16 workflow. Its circuit is the
reviewed EC3 O1 build, with public inputs exactly
`[commitmentX, commitmentY, label]` and no outputs.
The baseline Poseidon commands, keys, and two-signal interface are unchanged.

## Commands and API

```sh
npm run setup:pedersen-proof
npm run test:pedersen-proof
```

The setup command rebuilds with the pinned compiler, checks the EC1 provenance
and the reviewed artifact hashes, and creates or reuses its local setup.
The test command also prepares the baseline setup for cross-variant rejection
tests and runs the EC3 raw-constraint tests.
The full `npm test` includes both variants' reference, circuit, and proof tests.

The CLI accepts private circuit input on stdin. Its prove command emits only a
public proof packet; its verify command requires three explicit expected signals.
PowerShell example using the deliberately public identity fixture:

```powershell
'{"commitmentX":"0","commitmentY":"1","label":"0","u":["0","0","0","0"],"r":"0"}' |
  node scripts/pedersen-proof-cli.js prove |
  node scripts/pedersen-proof-cli.js verify 0 1 0
# {"verified":true}
```

Equivalent npm commands are `npm run prove:pedersen` and
`npm run verify:pedersen -- X Y LABEL`. Use the direct node command when piping
machine-readable JSON: npm may print its own script banner.
The input is the EC3 adapter's canonical object; never copy fixture blinders for
private data. The CLI caps input at 65,536 characters and returns exit status 1
for a failed verification or command error. Errors do not echo private input.
Expected negative witness tests can print circuit assertion locations to stderr.

Programmatic use:

```js
import { openProofSession } from './src/pedersen-proof.js';
import { circuitInput } from './src/pedersen-circuit-input.js';

// Public synthetic demonstration; applications independently select this claim.
const expected = ['0','1','0'];
const session = await openProofSession({proving:true});
try {
  const packet = await session.prove(
    await circuitInput([-8,-8,-8,-8],0n,expected));
  const accepted = await session.verify(packet,expected);
} finally {
  await session.close();
}
```

Use one snarkjs session per process, including across Poseidon and Pedersen:
the dependency shares curve workers. Await operations sequentially.
The EC session rejects overlapping operations, closing while busy, and operations
after close. Repeated close is harmless. Packet and expected-statement arrays
are snapshotted before asynchronous parsing. Proving parses the private input,
generates an in-memory witness, checks the actual R1CS, generates a proof, and
verifies that proof against the original supplied claim before returning it.

## Profile and setup identity

`spec/pedersen-proof-system.json` pins the variant, protocol, curve, snarkjs
version, model and parameter hashes, EC3 R1CS/WASM hashes, public ordering,
and power 12. The 2,966 constraints plus three public-input rows and the constant
fit a 4,096-element proving domain. Power 11 is insufficient. The domain
calculation is checked against pinned snarkjs 0.7.6's
[zkey construction source](https://github.com/iden3/snarkjs/blob/v0.7.6/src/zkey_new.js);
the setup follows its [documented workflow](https://github.com/iden3/snarkjs/blob/v0.7.6/README.md).

The Pedersen directory is `build/pedersen-proofs/`, distinct from
`build/proofs/`. A UUID-named generation contains the compiled artifacts,
Powers of Tau transcript, final proving key, and verification key. The selected
`setup.json` records the profile hash, variant, interface, generation, and
SHA-256 of every artifact. The verification key must have `nPublic=3` and
four IC points. Every loaded file is checked against its selected digest.

Setup creates fresh random contributions in memory, validates the Powers of Tau,
checks the final key against the R1CS and transcript, then selects the manifest.
An existing valid setup is reused. A corrupted/stale manifest or artifact fails
without silently selecting a new key. Reviewed artifact changes require an
explicit new profile and setup selection. Compilation is reproducible at the
pinned artifact hashes; random setup keys and proofs are not byte-reproducible.
Cross-platform reproduction has not been validated in EC4.

This is a **single-machine research setup**, with the same limitation as the
baseline. It is not an independently administered production ceremony. Entropy
and intermediate contribution secrets are not written to files, but JavaScript
provides no secure-memory-erasure guarantee. Transcript consistency checks do
not establish trustworthy destruction of setup secrets.

## Verification trust boundary

The application independently chooses the local profile, setup manifest, key,
and expected commitment/label. The manifest and key must arrive through a trusted
configuration channel. Hashes detect corruption relative to that selection;
they do not authenticate a manifest supplied by an adversary.

Packets have exactly five fields:

```text
variant, profileSha256, verificationKeySha256, publicSignals, proof
```

Those identifiers must match the selected configuration. They cannot select
a different key or profile. The verifier strictly parses the three decimal
signals, checks the Baby Jubjub point is canonical and in the prime-order
subgroup (identity allowed), checks the Boolean label, and compares all signals
to the independently expected statement. It also validates proof structure,
protocol/curve, and canonical BN254 base-field coordinates before calling the
Groth16 pairing verifier. The proof base field differs from the circuit field.

Malformed untrusted packets return false. Invalid expected statements and
unavailable/corrupted local configuration throw. A verifier-only installation
needs the application source/profile, dependencies, trusted manifest, and its
verification key; it needs no R1CS, WASM, proving key, transcript, or compiler.
Passing a packet's own signals as the expected statement loses the application's
binding to the claim it intended to verify.

## Evidence by rejection layer

| Layer | EC4 evidence |
| --- | --- |
| Honest proofs | All 13 EC2 fixtures: positive/negative, zero and adjacent scores, feature/score extrema, zero and ell-1 scalars, zero message, and identity commitment |
| Parser | Feature/scalar ranges, field aliases, noncanonical strings, malformed arrays, off-curve/torsion points, and non-Boolean labels |
| Witness generator | Flipped labels, a different valid commitment, a different feature vector, each feature position outside range, and scalar boundaries including ell |
| Raw constraints | EC3 independent O0/O1 assignments retained; changed public-label WTNS wire rejected by snarkjs R1CS checking |
| Pairing | Low-level proof from the invalid witness rejected; changes to each public signal rejected independently of the wrapper; foreign-key and Poseidon proofs rejected |
| Application/configuration | Expected-statement mismatch, malformed proofs/packets, spoofed identifiers, wrong key interface, corrupted artifacts, unsafe generation paths, snapshot and lifecycle behavior, verifier-only deployment and CLI exits |

A valid alternative key is obtained by a new contribution; both its rejection
of the original proof and the selected key's rejection of its proof are tested.
Spoofing the packet's key/profile identifiers does not bypass the pairing check.
The baseline proof suite remains intact.

These tests concern fixed openings, concrete proof packets, and trusted selected
keys. They do not establish that a commitment has no other mathematical opening,
nor do they replace the [EC5 written theorem](pedersen-formal-correctness.md)
or cryptographic assumptions. The [EC5 artifact audit](pedersen-constraint-audit.md)
now checks the exact circuit's source and O0/O1 correspondence. Randomized repeated proofs are a smoke test, not a proof of zero
knowledge or entropy quality. EC6 will measure comparative performance.
All generated keys, transcripts, witnesses, proof packets, and logs stay ignored.
