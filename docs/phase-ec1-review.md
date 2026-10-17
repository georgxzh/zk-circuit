# EC1 review: specification and parameters

**Complete. Stop for explicit approval before EC2.**

The new Baby Jubjub commitment variant is specified without changing the
Poseidon implementation, baseline theorem, key selection, or benchmark code.
The starting repository was on main at translation-validator Stage 2
(`a75b8be`); that work is preserved.

## Deliverables

- [Normative specification](pedersen-specification.md): curve and scalar domains,
  exact packing, canonical transport, randomized commitment, three public
  signals, zero threshold, identity behavior, and arithmetic proof obligations.
- [Public parameters](../spec/pedersen-parameters.json): independently derived
  G/H, model-and-role context, complete successful candidate transcripts, and
  baseline model identity.
- [Provenance](../spec/pedersen-provenance.json) and
  [source review](pedersen-library-review.md): exact package/source pins and
  the preconditions actually found in the library.
- [Read-only parameter audit](../scripts/check-pedersen-parameters.js):
  reproducible derivation, independent fixed-point group calculations, and
  exhaustive numerical specification checks.
- [Gated plan](pedersen-plan.md) and updated README/original-plan navigation.

The selected initial circuit design uses complete Edwards addition and Boolean
fixed-base selection. Optimized Montgomery multipliers and the library's
deterministic Pedersen hash are not assumed to implement this relation.
The legacy generator decoder's modular-coordinate conversion is recorded
explicitly; strict application parsers will be implemented separately in EC2.

## Validation performed

On Windows x64, Node.js **26.3.1**, npm **11.16.0**, and the existing pinned
Circom **2.2.3**:

| Command/check | Result |
| --- | --- |
| `node scripts/check-pedersen-parameters.js` | PASS: 15 pinned source files; independently recomputed G/H; subgroup, cofactor, nonidentity, inverse/identity/zero-scalar checks; square/nonsquare premises |
| Same command's arithmetic enumeration | All 65,536 encodings round-trip; score extrema -83 and 67; all 930 zero-score vectors classify as 1 |
| Exact upstream source comparison | Ten circomlib/circomlibjs files match installed bytes at their immutable npm-release revisions |
| `npm test` | **191 passed, 0 failed**; rebuilt baseline circuits, validated/reused the existing setup, and ran the reference, circuit, proof, formal-audit, benchmark-statistics, and translation suites |

The parameter manifest's SHA-256 at validation is:

```text
49c60a63780628c45128aa01d710f1af4c233a8957c6259fc13b24beb82c5c5d
```

Logs and rebuilt baseline artifacts remain in ignored `build/`.
No EC proofs, witnesses, keys, ceremony material, or private inputs were created
for publication. The committed point-generation transcripts are public fixed
parameters, not secret blinders or proof packets. Existing dependencies and
runtime sources are unchanged.

## Assurance and remaining work

EC1 does not prove a new circuit, establish an external audit, or certify an
unknown discrete logarithm. It states the published curve/primality premises,
reviewed derivation assumptions, and the precise scope of numerical checks.
Perfect hiding under uniform secret r, computational binding under the relevant
discrete-log assumption, and Groth16 security/setup assumptions are kept separate.

EC2 will implement the reference and parser/sampler tests. EC3–EC6 will implement
and audit the circuit, produce proofs under a separate key, establish the formal
correspondence, and run a fair comparative benchmark. None has started.
