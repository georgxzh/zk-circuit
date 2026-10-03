# Correspondence between the proof and implementation

The [written proof](formal-correctness.md) establishes E1–E6 over the stated
field and exact hash function. This document identifies the evidence connecting
those equations to the project files, and the limits of that evidence. It does
not certify the Circom compiler or JavaScript runtime.

## Source constraints

The classifier is [bounded-linear.circom](../circuits/bounded-linear.circom),
connected to the hash by [inference.circom](../circuits/inference.circom).
Circom's `===` imposes an equality constraint; `<==` assigns a witness value and
imposes its equality. The `<--` hint alone imposes no constraint. These meanings
are specified by the [Circom constraint-generation documentation](https://docs.circom.io/circom-language/constraint-generation/).
The paper reasons about the enforced equations, independently of witness hints
and runtime assertions.

| Paper obligation | Source connection | O0 symbols or audited graph |
| --- | --- | --- |
| E1, L1–L2: four bounded inputs | Four `Num2Bits(4)` components with Boolean equations and weighted recomposition | `main.classifier.inputBits[i].in`, `.out[j]`, `main.classifier.u[i]` |
| E2, L3: exact bounded score | Affine `score <== ...` with constant -53 after expanding offsets | `main.classifier.score` and all four classifier inputs |
| E3, L4: shifted-score equality | `shiftedScore <== score + 128` | `main.classifier.shiftedScore`, `.score` |
| E4, L4: eight-bit integer interpretation | `Num2Bits(8)` with Boolean equations and recomposition | `main.classifier.scoreBits.in`, `.out[0..7]` |
| E5, L5: threshold and Booleanity | `label === scoreBits.out[7]`, explicit label Boolean equation, public-label link | `main.label`, `main.classifier.label`, `.scoreBits.out[7]` |
| E6, L6: exact hash function | `Poseidon(6)` / `PoseidonEx(6,1)`, capacity zero, H1 schedule | All `main.hash.pEx` Ark, Sigma, Mix, MixS, MixLast signals and component links |
| E6, L7: same features | Both `classifier.u[i]` and `hash.inputs[i+1]` constrained to `u[i]` | Both links checked for all four coordinates |
| E6, L7: domain, salt, result | Fixed domain 1, `hash.inputs[5] <== salt`, `commitment === hash.out` | `main.hash.inputs[0]`, `.inputs[5]`, `.out`, `main.salt`, `main.commitment` |
| Public relation | Main declares public `[commitment, label]`, no output signals | Public wire 1 is commitment; wire 2 is label; two public and five private inputs |

`Num2Bits` uses a bit-extraction hint to construct ordinary witnesses, but also
constrains every bit and the recomposition. L1 uses only those latter equations.
For widths 4 and 8 the maximum sum is below $p$, so a separate 254-bit alias
gadget is unnecessary. The proof would need revision for larger widths.

## Exact hash identity

[poseidon-provenance.json](../spec/poseidon-provenance.json) pins the upstream
revision and source SHA-256/Git-blob hashes.
[check-poseidon.js](../scripts/check-poseidon.js) checks the installed source
bytes and all 1,036 width-7 optimized constants against circomlibjs: 119 round
constants, 819 sparse coefficients, and two matrices of 49 entries each.
The package lock pins the remaining dependency bytes, including `Num2Bits`.

H1 is a direct definition of the optimized circuit's computation with these
constants. The Sigma lemma proves each S-box uses its input's fifth power;
the matrix equations use `matrix[j][i]`, including column zero for the last
output. The hash graph contains 119 S-box applications (8*7 + 63), hence 357
multiplication constraints for their squares, fourth powers, and fifth powers.
All remaining hash equations are linear. No invertibility premise is required
to evaluate the forward graph.

## Complete O0 polynomial audit

[formal-audit.test.js](../test/formal-audit.test.js) constructs the expected
E1–E6 equations and complete H1 graph independently of the emitted constraint
rows. It uses explicit offsets, round counts, matrix orientation, capacity,
component links, and output selection. Constants are read from the checked
JavaScript table whose equality with the pinned Circom table was just verified.
It does not use generated witness values as evidence for polynomial equality.

The test builds 50 classifier/wrapper equations and 1,585 hash equations, then
requires a bijection with **all 1,635 O0 R1CS rows**. Each R1CS row $(A,B,C)$
is expanded into the sparse coefficient vector of $A(w)B(w)-C(w)$. Wire zero
denotes the constant one. The loader checks the field modulus and compares the
binary R1CS with the compiler's JSON export before the audit.

Rows may differ by a nonzero scalar. If nonzero coefficient vectors $a,b$ have
identical monomial support and satisfy $a_i b_0=b_i a_0$ for every index, then
$a_i=(a_0/b_0)b_i$ in the field. Thus their polynomials have identical zero
sets. The checker applies these cross-products modulo $p$, rejects zero
polynomials, and consumes each actual row once. Equal cardinality plus this
matching establishes containment in both directions. An extra, missing,
duplicated, or changed equation cannot pass by merely preserving the row count.

This is stronger evidence than testing honest witnesses: the checked polynomial
identities apply to every assignment to the named O0 wires. It is still a
JavaScript audit with a trusted parser, symbol map, field arithmetic, expected
graph transcription, and test implementation. It is not a proof checked by a
small proof-assistant kernel. Reviewing the transcription against H1 remains
part of the human review obligation.

## O1 correspondence and the remaining compiler assumption

The proof workflow uses the **999-constraint O1** artifact, not the O0 audit
artifact. Circom documents O1 as eliminating signal/constant and signal/signal
equalities through substitution. See the
[official simplification description](https://docs.circom.io/circom-language/circom-insight/simplification/).

The mathematical preservation argument is elementary: for a private variable
$v$ and expression $e$ independent of $v$, the system $v=e$ together with
$G(v,z)=0$ has the same solutions on retained variables $z$ as $G(e,z)=0$.
One direction substitutes the equality; the other extends each reduced solution
by setting $v=e$. Repeating correct substitutions preserves the existential
public relation, provided public coordinates and their identities are preserved.
Constant and alias substitution are instances of this argument.

This lemma does **not** verify which substitutions the compiler actually made.
The repository does not replay a certificate of every O0-to-O1 transformation.
Applying T1–T2 to the shipped O1 artifact therefore retains the assumption that
the pinned compiler correctly performs these transformations and preserves the
public interface. Compiler binary hashes, binary/JSON agreement, public-wire
checks, and O0/O1 witness tests provide supporting evidence, not a compiler proof.
There is no claim that the complete O0 row audit alone proves O1 equivalence.

The existing [circuit tests](../test/circuit.test.js) retain direct adversarial
O0 assignments and their projection onto O1 wires. They cover omitted range
relations, incorrect labels, separate hash/model vectors, non-Boolean bits,
and score/domain/commitment alterations. Eight constraint-omission checks admit
their targeted counterexamples only after rows are removed inside the test
evaluator. The arithmetic harness tests all 65,536 valid feature vectors;
it does not enumerate every malicious field-valued witness or every hash salt.

## Proof protocol and application assumptions

| Layer | What is established or checked | What remains assumed |
| --- | --- | --- |
| Integer/field relation | T1–T2 and L1–L8 written proofs | The stated prime-field premise and validity of the mathematical argument |
| O0 implementation | Full polynomial graph audit and source provenance | Correct audit transcription, parser, symbols, runtime, dependency/file integrity |
| O1 implementation | Pinned build; interface, honest and adversarial tests | Semantics-preserving compilation/optimization; no full translation certificate |
| Groth16 key selection | Local transcript/key consistency validation and artifact hashes | Trusted manifest/key distribution and association with the intended O1 circuit |
| Accepted proof to witness | Conditional argument in Section 8 of the paper | Appropriate knowledge soundness, valid trusted setup, correct cryptographic implementation |
| Previously chosen opening | Same-input wiring within each satisfying witness | Collision resistance/computational binding to identify an extracted opening with an earlier one |
| Privacy | Inputs, salt, score, and witnesses absent from public signals | Zero knowledge, salted-hash hiding, CSPRNG freshness/secrecy, execution-channel protections |
| Application request | Canonical parsing and equality with caller-expected commitment and label | Caller supplies the intended statement and protects its selected verification key |

The local setup is a single-machine demonstration; there is no established
independent ceremony or proof that setup randomness was securely erased.
Polynomial correctness does not remove that limitation. Hashes protect artifact
integrity relative to the selected manifest; they do not authenticate an
adversarially supplied manifest. The [proof guide](proofs.md) describes this
deployment boundary and the CLI contract.

## Reproduce the evidence

Use the repository's pinned runtime and installed compiler:

```sh
npm ci
npm run setup:circom
npm run test:formal
npm test
```

`test:formal` rebuilds and runs the complete O0 polynomial audit. `npm test`
also runs it, alongside the previous reference, circuit, and Groth16 suites.
The setup is reused when artifact hashes match. No generated constraints,
witnesses, keys, proofs, or timing/memory measurements belong in the Phase 5
commit. Benchmarking is reserved for the separately approved Phase 6.
