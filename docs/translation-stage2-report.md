# Stage 2: production classifier and varied O0/O1 corpus

**Complete; awaiting review.** The bounded validator accepts the production
classifier's **1,635-to-999-constraint translation**, and all 14 evaluated O0/O1
pairs. Every eliminated wire and residual row is accounted for. This is
executable translation validation with a written preservation argument, not a
machine-checked proof of the implementation or compiler. No novelty is claimed;
no O2 compilation or later-stage work was performed.

## Production result and artifact identity

The newly compiled classifier binaries are byte-identical to the artifacts used
by the existing O0 graph audit and O1 proof workflow. Their SHA-256 values are:

```text
O0: 648f65828785aaaf4ca80b1c3d111504c6fed938d244db87160519650a8404fc
O1: 5ad3eeeca14589c17236fb721ab24189d597cc55267f423b497992fbb4270f0f
```

The accepted receipt records:

- 1,635 source wires, including constant wire zero; 999 retained target wires.
- 636 eliminated private wires: 631 checked aliases and 5 checked constants.
- 636 distinct source pivot rows, each becoming the zero polynomial.
- A multiplicity-preserving bijection from the other 999 source rows to all
  999 target rows. No unmatched or ignored nonzero rows; no zero target rows.
- Constant coordinate 0 fixed at 1, and public coordinates 1 and 2 fixed as
  `input:main.commitment` and `input:main.label`, respectively. No public outputs.

This establishes the missing optimization correspondence for this exact pair,
**conditional on the validator, parser, arithmetic, and metadata assumptions
below**. The former blanket reliance on correct optimization for this pair is
replaced by explicit checked transformations. It does not certify every Circom
optimization or independently authenticate source-level signal meanings.

## What changed from Stage 1

[Stage 2 validation](../research/translation-stage2/validate.js) uses the shared
strict parser and BigInt checker with an explicit larger resource profile.
Stage 1 keeps its original default bounds. Stage 0 is unchanged.

The initial production attempt rejected wires 52, 66, and 67: their compiler
aliases referenced labels already eliminated as constants. Stage 2 now resolves
the compiler's alias/constant dependency graph, rejecting cycles. Resolution
proposes a replacement; a current source row must still prove that replacement.
The raw compiler map has 634 aliases and 2 constants; resolving its chains yields
the checked 631 aliases and 5 constants above. No defining equation is inferred
merely from a compiler assertion.

To avoid repeatedly scanning the entire Poseidon graph, the proposer indexes
possible linear pivots, and row replay indexes variable occurrences. Each update
still applies the same checked alias/constant substitution. A regression test
compares indexed replay with full substitution after the complete production
elimination sequence.
The checker separately validates each proposed pivot and the complete residual
multiset. Sharing polynomial helpers means these are not independent verified
implementations.

The checker now returns an accounting receipt: zero source/target row indices
and pairs of matched nonzero row indices. A coverage check requires exact
partitions of all source wires and all source/target rows. Duplicate nonzero
rows retain multiplicity. An explicitly unused wire can be dropped only when
it occurs in no current polynomial, and is reconstructed as zero.

## Contract and unsupported cases

The [Stage 0 contract](translation-stage0-contract.md) and
[Stage 1 artifact contract](translation-stage1-report.md#checker-contract-at-the-artifact-boundary)
remain the basis of acceptance. The Stage 2 profile permits at most 4,096 wires,
4,096 rows, 8,192 labels, 16 MB per artifact, 128 terms per linear combination,
and 1,000,000 initial polynomial-product/C-term contributions per system.
Alias/constant substitutions cannot increase degree or monomial count. Budget
violations reject; these limits are not promises of throughput at every maximum.

The binary field remains BN254's scalar field; only standard R1CS v1 sections
1, 2, and 3 are accepted. Duplicate sections/terms/maps, noncanonical residues,
bad lengths, trailing bytes, incomplete symbols, and conflicting public
coordinates are rejected. Substitution JSON duplicate keys are rejected before
overwrite. Complete O0 label retention and a shared O0/O1 label/name/component
universe are still required. Public outputs and public inputs are distinguished
and compared against an independently declared ordered manifest.

Supported elimination is still limited to **unit aliases, constants, and
proven unused private wires**. General affine replacements, arbitrary polynomial
implication, row-combination proofs, custom gates, unsupported symbol formats,
and other fields are not implemented. The affine corpus fixture retains its
general linear equation under O1. A hand-constructed artifact that eliminates
that variable with `t=3*x+5` is explicitly rejected as `unsupported`; it was not
produced by running O2. Missing evidence never falls back to assuming correctness.

For accepted S and T, the written argument gives constructive projection P and
lifting L with `S(w) => T(P(w))`, `T(v) => S(L(v))`, `P(L(v))=v`, and identical
constant/public prefixes. Hence their public existential relations agree.
`L(P(w))=w` and private-witness uniqueness are not required. Public constants and
equalities stay in the residual relation. Transport methods validate witness
representation; separate direct evaluators check satisfaction in the tests.

## Corpus and evaluation

The [corpus manifest](../research/translation-stage2/corpus.js) covers 12 distinct
circuits and two additional sanity-check settings. Circom 2.2.3, BN254, Node.js
26.3.1, Windows x64, and pinned installed dependencies were used. The actual
compiler executable hash is checked against `spec/compiler.json`. The primary
pairs use sanity level 2; nested components and inference also use level 0.
Both levels emit identical R1CS bytes for those two circuits. No claim is made
about other compiler versions, fields, platforms, or optimization modes.

| Circuit | O0 wires / rows | O1 wires / rows | Eliminations: alias / constant / unused | Transport samples |
| --- | --- | --- | --- | --- |
| Single alias | 3 / 2 | 2 / 1 | 1 / 0 / 0 | 2 |
| Interface, constants, nonunique input | 12 / 8 | 7 / 4 | 2 / 2 / 1 | 5 |
| `t*a=0` | 3 / 1 | 3 / 1 | 0 / 0 / 0 | 10 |
| Nested component arrays | 41 / 32 | 17 / 8 | 24 / 0 / 0 | 5 |
| Selection, bit ranges, comparison | 37 / 37 | 32 / 32 | 5 / 0 / 0 | 3 |
| Inverse hint with nonunique zero case | 4 / 2 | 4 / 2 | 0 / 0 / 0 | 5 |
| Public outputs/constants and duplicate rows | 5 / 5 | 4 / 4 | 1 / 0 / 0 | 2 |
| Retained affine equation | 5 / 2 | 4 / 2 | 0 / 0 / 1 | 5 |
| Unsatisfiable public `a=0` and `a=1` | 2 / 2 | 2 / 2 | 0 / 0 / 0 | 0 |
| Production arithmetic template | 37 / 38 | 31 / 32 | 6 / 0 / 0 | 4 |
| Poseidon(6) | 1,592 / 1,585 | 974 / 967 | 616 / 2 / 0 | 5 |
| Production classifier | 1,635 / 1,635 | 999 / 999 | 631 / 5 / 0 | 9 |
| Nested components, sanity 0 | 41 / 32 | 17 / 8 | 24 / 0 / 0 | 5 |
| Classifier, sanity 0 | 1,635 / 1,635 | 999 / 999 | 631 / 5 / 0 | 9 |

All 14 pairs are accepted. There are **69 synthetic input instances**, each with
independently generated O0 and O1 witnesses. Tests directly evaluate the original
witnesses and both transported witnesses, preserve the public prefixes, and
check `P(L(v))=v`. Samples include integers above Number's exact range and p-1.
Additional witnesses deliberately change an unused input or the inverse hint at
x=0 to exercise witnesses different from the generator's choices. The
unsatisfiable relation has no witness instances; acceptance there concerns equal
relations, not successful witness generation.

Every binary pair is cross-checked against `r1csfile` 0.0.48 and Circom's JSON
constraint export, including the field, header, and wire map. The acceptance
path reads the binary itself; agreement with another parser is regression
evidence, not an additional semantic premise. Stage 0's exhaustive small-field
oracle and Stage 1's BigInt differential cases remain in the full suite. There
is no exhaustive enumeration of BN254 assignments.

Validation completed with **25/25 Stage 2 test groups** and **191/191 tests in
the full repository suite**. The full run rebuilt the production and audit
circuits and checked the existing Groth16 setup against the rebuilt artifacts;
it reused the matching demonstration setup rather than creating a new ceremony.

## Adversarial results

The [Stage 2 tests](../test/translation-stage2.test.js) include:

- Missing production substitutions, cycles, unknown dependencies, changes to
  constants, substitutions for public wires, duplicate JSON keys, and
  unsupported affine forms: rejected.
- Wrong pivot indices, omitted eliminations, duplicate retained mappings, public
  permutations, and incomplete accounting receipts: rejected.
- Deleted target rows at nine positions across the nonlinear and linear graph,
  a modified late residual coefficient, and a removed defining source row:
  rejected. Every other row is still covered by exact residual comparison.
- Public role/name/wire changes, duplicate symbols and binary terms,
  noncanonical field coefficients, invalid constant mapping, truncated/trailing
  binary bytes, extra sections, and exceeded budgets: rejected.
- Dropped public equality/constant and duplicate residual row: rejected.
- Source `t*a=0`, certificate `t=1`, target `a=0`: rejected. Independently,
  `(a,t)=(1,0)` satisfies the source and its public statement has no target
  witness, demonstrating semantic inequivalence of that particular pair.
- Reordered or nonzero-scaled residual rows: accepted as relation preserving,
  while the original artifact hash check rejects their changed bytes.

Certificate rejection, demonstrated inequivalence, and artifact-byte mismatch
are distinct results. An equivalent pair may be rejected by this conservative
certificate language; not every byte mutation should fail algebraic validation.

## Reproduction and remaining assumptions

```sh
npm run setup:circom                 # if the pinned compiler is missing
npm run test:translation-stage2      # fresh corpus builds and adversarial tests
npm run translation:stage2           # fresh builds, validation, transport, receipts
npm test                            # full project build/setup validation and tests
```

The initial sandboxed classifier compile could not resolve includes; the same
pinned compiler succeeded in the approved native environment. Source files were
not rewritten to bypass includes. The builder hashes each reviewed fixture's
transitive include closure before/after compilation, records compiler/settings
and lockfile hashes, and verifies artifact and witness-helper digests before
use. Generated files remain under ignored `build/translation-stage2/`; witnesses
stay in memory. `manifest.json`, `results.json`, and `test-receipts.json` identify
the exact run. Only the appropriate command's receipt is generated by that
command. Raw substitution ordering may vary, so its byte hash is run-specific.

The trust boundary still includes the handwritten correctness argument, the
unverified parser/checker and expected public manifest, source-to-label
attribution, JavaScript/BigInt/runtime behavior, and file/dependency integrity.
The include-closure scanner is for the reviewed fixture syntax, not a verified
Circom frontend. Hashes identify local bytes; they do not authenticate an
adversarially supplied manifest. Witness-generator tests cover examples rather
than proving the generator correct.

Composing this result with the O0 graph audit still trusts that audit and its
specification transcription. Groth16 knowledge soundness, setup/key integrity,
Poseidon binding/hiding, and application statement selection remain separate
cryptographic/application assumptions. The CLI has not been changed to enforce
translation validation during every future build or proof request.

The scoped Stage 2 gate is met: the exact production pair is accounted for, a
varied O1 corpus passes, corrupt/unsupported artifacts reject, and bidirectional
transport works on the reported samples. General coverage, independent checker
verification, and any expansion beyond these supported transformations need
separate review and authorization. Stop here; no O2 or novelty claim follows.
