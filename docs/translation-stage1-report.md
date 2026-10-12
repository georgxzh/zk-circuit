# Stage 1: smallest real Circom translation experiment

**Complete; stop for review.** Stage 1 moves the Stage 0 rules onto three tiny,
freshly compiled Circom O0/O1 pairs. It is a bounded feasibility result, not a
general O1 validator, a classifier audit, an O2 implementation, or a novelty claim.
The production classifier's optimization assumption remains unresolved.

## Reproduce and inspect

Use the project's pinned Node.js and installed Circom binary:

```sh
npm run setup:circom              # only if the pinned binary is missing
npm run test:translation-stage1
npm run translation:stage1
```

Both Stage 1 commands freshly compile all three sources at O0 and O1. The test
command executes the assertions; the runner prints accepted certificates and
writes `build/translation-stage1/manifest.json` and `results.json`. Generated
artifacts remain ignored. No ceremony, proof generation, or witness generator
is needed for these experiments.

The runner verifies the compiler version and platform-specific SHA-256 against
[compiler.json](../spec/compiler.json). This run used Circom 2.2.3, Windows x64,
Node.js 26.3.1, and the BN254 scalar field. Each invocation uses `--r1cs --sym
--json --simplification_substitution`, either `--O0` or `--O1`, `--prime bn128`,
and `--sanity_check 2`. There are no circuit includes or external gadgets.

The manifest records source, compiler, and artifact digests and build settings.
The runner checks that the exact five buffers passed to validation still match
their post-compilation hashes. The result identifies those bytes and the ordered
public interface. These local hashes identify content; they are not signatures
or a proof that an arbitrary source produced an arbitrary artifact.

## Smallest experiment first

[alias.circom](../research/translation-stage1/circuits/alias.circom) declares public
input a and private auxiliary t, with `t <== a; t*t === a;`. The first real
compile was this fixture alone. Its O0 system has 3 wires including the constant
wire, with equations `t=a` and `t*t=a`. O1 has 2 wires and `a*a=a`.

Circom emits `{"2":{"1":"1"}}`: replace label 2 by label 1. The checker finds
and validates the source equality, substitutes it, and compares the remaining
polynomial. Public wire 1 and constant wire 0 remain fixed. Both directions of
witness transport follow from the checked equality, not from trusting this JSON.

The other two fixtures exercise only the immediate boundary cases:

| Fixture | O0 wires / rows | O1 wires / rows | Result |
| --- | --- | --- | --- |
| `alias` | 3 / 2 | 2 / 1 | Accepted; one alias elimination |
| `interface` | 12 / 8 | 7 / 4 | Accepted; two aliases, constants 7 and 0, one unused input |
| `nonunique` | 3 / 1 | 3 / 1 | Accepted; identity translation of `t*a=0` |

[interface.circom](../research/translation-stage1/circuits/interface.circom) has
ordered public coordinates `(out,a,b,c)`: one output followed by three inputs.
Its residual equations are `square=x*x`, `out=7*x+square`, `a=b`, and `c=7`.
The source also contains alias intermediates and an unused private input.

Four concrete findings matter for the design:

1. Circom flattened the alias chain in its substitution map. The second
   replacement is justified only after replaying the first in the source rows.
2. The zero substitution is an empty object, while constant 7 uses label zero.
3. The unused private input is absent from the substitution map. Its elimination
   is justified separately by nonoccurrence in the current polynomial system.
4. Retained label 11 (`main.square`) becomes O1 witness coordinate 6. Signal
   labels and witness coordinates cannot be treated as interchangeable.

These are observations of the pinned compiler on these fixtures, not assertions
that all Circom outputs have the same forms. Raw substitution JSON key order
varied across builds; validation ignores key order and records per-run digests.

## Checker contract at the artifact boundary

The implementation consists of [artifact parsing](../research/translation-stage1/artifacts.js),
[proposal construction and validation](../research/translation-stage1/validate.js),
and a [BigInt checker](../research/translation-stage1/checker.js). The latter is
a port of the frozen Stage 0 checker, with the same certificate rules.

The accepted artifact subset is deliberately small:

- Standard binary R1CS v1 with exactly header, constraint, and wire-to-label
  sections, in any order. No custom gates or extensions; at most 1 MB per file,
  32 wires, 128 rows, and 64 labels. The binary field must be exactly BN254's
  scalar field. Coefficients are canonical nonzero field elements parsed as BigInt.
- Complete `.sym` coverage with distinct names, labels, and retained witness
  positions, cross-checked against each binary wire map. Source O0 must retain
  every label. O0 and O1 must share the same label/name/component universe.
- An explicit expected public manifest with separate ordered output and input
  lists. Header counts, names, roles, and positions must agree in both artifacts.
  The constant coordinate and every public coordinate must map to themselves.
- Compiler substitutions expressed only as aliases or constants. Unknown
  dependencies, public/retained-wire substitutions, duplicate JSON keys,
  noncanonical values, and unsupported affine forms are rejected. Missing
  substitutions permit only independently justified unused-wire removal.

The parser reads original binary coefficients and section boundaries directly;
it does not trust constraint JSON as a substitute for the binary. Strict checks
reject duplicate terms, invalid maps, truncated sections, and trailing bytes.
The restricted substitution parser rejects duplicate keys before overwrite.

The proposal builder searches current source rows for each proposed defining
equation. A separate checker invocation replays all pivot claims, checks
dependencies and coordinate coverage, and compares the complete multiset of
normalized residual polynomials. The builder and checker share polynomial
helpers; they are not independently verified implementations. Missing evidence
or unsupported transformations cause rejection, never an assumed substitution.

**Conditional acceptance claim:** for the decoded systems S and T, acceptance
constructs P and L such that `S(w) => T(P(w))`, `T(v) => S(L(v))`, and
`P(L(v))=v`, fixing the constant and ordered public prefix. Thus their public
existential relations are equal. `L(P(w))=w` and private-witness uniqueness are
not required. Transport methods check witness representation, not satisfaction.

The written argument is the [Stage 0 pivot/substitution induction](translation-stage0-contract.md),
now using exact BigInt field arithmetic and explicit artifact coordinates.
It remains a written argument about the algorithm, not a machine-checked proof
of the parser, implementation, or compiler. A label's connection to source-level
meaning still relies on the source review and compiler metadata; checking
metadata consistency cannot authenticate its meaning independently of the compiler.

## Validation and adversarial results

[Twelve Stage 1 test groups](../test/translation-stage1.test.js) pass. They freshly
compile all six artifacts and cross-check the new binary parser against pinned
`r1csfile` 0.0.48 and the emitted constraint JSON, including header and wire maps.
For the BigInt port, all 104 Stage 0 fixture/field combinations retain their
expected result and are checked against the independent exhaustive small-field
oracle. BN254 witness tests include values beyond Number's exact-integer range
and p-1. These are samples, not exhaustive BN254 enumeration.

All nine Node test files also pass together: **166/166 tests**. Stage 1 compiles
its tiny circuits afresh in that run; existing classifier, proof, and O0-audit
tests use their available artifacts. The production classifier and setup were
not rebuilt, and this regression result is not an O1 equivalence claim for them.

| Adversarial change | Result and meaning |
| --- | --- |
| Missing, false, cyclic, or malformed substitutions | Rejected; no valid checked elimination sequence supplied |
| Wrong pivot, wrong constant, omitted unused step, wrong retained mapping | Rejected by certificate replay |
| Public permutation, output/input role change, inconsistent/missing/duplicate symbols | Rejected by interface or mapping checks |
| Every truncation of the smallest O0 binary; trailing bytes; invalid sections, field, coefficients, indices, duplicate terms/maps | Rejected by bounded artifact parser |
| Dropped public equality/constant; altered residual coefficient | Rejected by complete residual comparison |
| Nonzero residual row scaling | Accepted as relation preserving; changed digest is detected by the separate build-record check |

For the crucial counterexample, the **real compiled** source is `t*a=0`.
The test constructs a target binary for `a=0`, an eliminated-t symbol record,
and proposed substitution `t=1`. Proposal construction rejects missing evidence;
direct checker replay rejects the unjustified pivot. Independently, `(a,t)=(1,0)`
satisfies the source and the target has no witness for a=1. Therefore this
particular pair is semantically inequivalent. Other rejected certificates may
have equivalent endpoints: rejection is not an equivalence decision procedure.

## Decision and remaining boundary

The smallest real experiment passes the feasibility gate: the pinned artifacts
contain enough information to construct checked eliminations, reconstruct
witnesses, and preserve public identity for these examples. It supports a
separately authorized broader O1 study. It does not yet validate the classifier's
1,635-to-999-row translation or establish coverage of general O1 output.

Unverified parsing, BigInt/runtime behavior, the checker implementation, and
source/public metadata provenance remain in the trust boundary. The experiment
does not address Groth16 keys or setup, witness-generator correctness, Poseidon
security, or source-to-O0 compilation. Cryptographic security assumptions remain
separate. Proof-assistant verification and novelty assessment are not delivered.

Before expanding scope, review the strict artifact subset, conservative
certificate language, and handling of incomplete substitution maps. A false
acceptance, unexplained public remapping, or silently unaccounted row would be a
stop condition. Legitimate unsupported formats require an explicit extension,
not relaxed validation. No classifier integration, larger corpus, O2 support,
or later stage has been started.

## Format references

The [official R1CS binary format](https://github.com/iden3/r1csfile/blob/master/doc/r1cs_bin_format.md)
defines wire zero, the header, constraints, and wire-to-label section. Stage 1
accepts a strict subset and rejects extensions that the general format allows.
The [official Circom simplification documentation](https://github.com/iden3/circom/blob/master/mkdocs/docs/circom-language/circom-insight/simplification.md)
describes O1 alias/constant elimination and the substitution-output flag. The
actual pinned artifacts, rather than a claim about compiler correctness, are
what this experiment validates.
