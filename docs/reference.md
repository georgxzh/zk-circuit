# Reference implementation

The normative [specification](specification.md) is unchanged. This phase provides
an executable integer oracle and a commitment implementation for later circuit
testing. It does not generate or verify zero-knowledge proofs.

## Installation and checks

The development runtime is Node.js **26.3.1** and npm **11.16.0**. Node.js 22+
is the declared minimum; the Phase 2 validation used the pinned development
runtime. From the repository root:

```sh
npm ci
npm test
npm run check:poseidon
```

`package-lock.json` locks the dependency graph and package integrity hashes.
`.npmrc` disables package lifecycle scripts and keeps the npm cache local and
ignored. circomlibjs 0.1.7 provides Poseidon; circomlib 2.0.5 is a development
dependency used only to inspect the specified hash source and constants. No
Circom compiler or proving setup is installed in Phase 2.

## JavaScript API

From a module in the repository root:

```js
import { classify, quantizeInput, encodeInput, parseField } from './src/reference.js';
import { randomSalt, publicStatement, checkOpening } from './src/commitment.js';

const x = quantizeInput(['1/4', '1/4', '0', '1/4']);
const result = classify(x); // { score: 0n, label: 1n }
const u = encodeInput(x);   // [9n, 9n, 8n, 9n]
const salt = randomSalt();  // retain privately with the opening
const publicSignals = await publicStatement(x, salt); // [commitment, label] strings
const matches = await checkOpening(x, salt, publicSignals); // true
const commitment = parseField(publicSignals[0]); // bigint
```

Do not log or publish private features or salts. `publicStatement` returns only
the two public signals and snapshots the feature vector before asynchronous
hash initialization. The caller retains the opening. Salts are mandatory for
commitment operations; there is no deterministic default.

| Function | Contract |
| --- | --- |
| `classify(x)` | Exactly four `bigint` or safe integer `number` coordinates in [-8,7]; returns `{score, label}` as bigints. No implicit string conversion or quantization. |
| `quantize(text, scale=4n)` | Exact integer, decimal, or numerator/positive-denominator text; returns `floor(scale*z+1/2)` as a bigint. Positive integer scale; no feature-range check in this general primitive. |
| `quantizeInput(texts)` | Exactly four rational strings; applies scale 4 and rejects results outside [-8,7]. |
| `encodeInput(x)` / `decodeInput(u)` | Offset encoding between signed features and integers [0,15]; rejects invalid coordinates. |
| `toField(z)` | Explicit algebraic reduction for an integer; never use as a parser for external field values. |
| `parseField(text)` / `fieldElement(v)` | Require canonical unsigned decimal text / a bigint in [0,p-1]. No modular reduction. |
| `decodeScore(S)` | Accepts only score residues [0,67] or [p-83,p-1]; returns a signed bigint. |
| `parsePublicSignals(signals)` | Exactly `[commitment, label]` as canonical strings; label must be `0` or `1`. |
| `randomSalt()` | CSPRNG, 32-byte big-endian rejection sampling below p. Zero permitted. |
| `commitInput(x, salt)` | Requires an in-range feature vector and canonical bigint salt; returns a bigint Poseidon commitment. |
| `publicStatement(x, salt)` | Returns exactly `[C.toString(), label.toString()]`. |
| `checkOpening(x, salt, signals)` | Returns false for a well-formed but mismatched opening or label; throws on malformed inputs. A local opening check, **not a proof verifier**. |

Syntax is deliberately narrow. Rational text accepts examples such as `-3/8`,
`0.125`, `-0.375`, and `2`. It rejects whitespace, a leading plus, exponent
notation, leading-zero integers, missing decimal digits, non-finite values, and
nonpositive denominators. Negative zero is harmless in rational or signed
integer inputs; field text requires exactly `0` for zero.

Results are new arrays/objects. The exported model parameters are recursively
frozen. Arithmetic stays in bigints after validated integer conversion. This is
a research reference, with no constant-time execution or side-channel claim.

## Command line

The CLI reads one JSON object from stdin and writes one JSON result to stdout.
Errors go to stderr with a nonzero exit code and do not echo the supplied input.
Examples below are public synthetic data, suitable for a shell history.

```powershell
'{"x":[1,0,0,1]}' | node src/cli.js classify
# {"score":"2","label":"1"}

'{"x":["-1/8","1/8","-3/8","7/4"]}' | node src/cli.js quantize
# {"x":["0","1","-1","7"]}

'{"x":[1,0,0,1],"salt":"0"}' | node src/cli.js statement
# {"publicSignals":["<decimal commitment>","1"]}
```

For real data, supply stdin from a protected source, not a literal shell command.
The `statement` command requires a caller-held salt as canonical field text and
does not emit the opening. Salt `0` above is a public fixture, not guidance for
real commitments. Generate fresh salts through `randomSalt()` in the API.

`classify` and `statement` accept JSON integer numeric tokens for `x`; they
reject fractional and exponent tokens before floating-point parsing could hide
a fraction through rounding. Feature values are small and exactly representable.
`quantize` accepts only strings. Extra object fields are rejected.
All integer **outputs** are strings to avoid JSON precision loss; when reusing
quantized output in the JavaScript API, convert its coordinates with `BigInt`.

## Poseidon compatibility evidence

The [provenance manifest](../spec/poseidon-provenance.json) records hashes of the
two Circom files. Their Git blob hashes were checked against GitHub metadata at
the immutable Phase 1 revision. `npm run check:poseidon` checks installed versions
and these file hashes offline, then compares all 1,036 width-7 optimized constants
(`C`, `S`, `M`, `P`) between the installed Circom and JavaScript sources.

The tests cross-check the reference and optimized JavaScript implementations on
[nine fixed public synthetic vectors](../spec/commitment-vectors.json) and 32
additional deterministic cases spread across the salt field. The reference uses
the unoptimized permutation; the comparison uses the optimized implementation
whose constants are checked against Circom. They share an upstream library and
field implementation: agreement is compatibility evidence, not an independent
cryptographic audit or proof of equivalence for all preimages.

The fixed vector file is reviewed test data with deliberately public inputs and
salts. It is not a witness, key, proof, or build artifact. Future circuit tests
must use these vectors to establish compatibility with the compiled constraints.

## Validation boundary

`npm test` exhaustively checks all 65,536 feature vectors for scores, encodings,
decoding, field arithmetic, and threshold behavior, including all 930 zero-score
inputs. Quantization checks include the Phase 1 fixtures and 30,075 signed
rational/scale combinations checked against the defining inequality. Other
tests cover malformed types/text, sparse arrays, unsafe numbers, modular aliases,
invalid labels, changed commitments/openings, input mutation, CLI behavior, and
salt rejection sampling.

Circuit rejection expectations from Phase 1 are represented here by local
validation or opening mismatch checks. No claim about circuit satisfiability or
proof verification follows yet. Formal correctness remains Phase 5.
