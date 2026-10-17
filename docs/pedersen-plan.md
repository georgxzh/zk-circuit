# Pedersen extension: phases and approval gates

The Poseidon implementation remains the working baseline, including all six
completed phases and translation-validator Stages 0–2. The new variant follows
the [EC specification](pedersen-specification.md).

After **each** phase: run the relevant validation, update documentation/status,
stage explicit paths, inspect the staged diff, commit descriptively, push to
`main`, and stop for explicit user approval. Failure to push is not completion
of the publication step. EC1 approval does not authorize EC2.

| Phase | Acceptance criteria | Status |
| --- | --- | --- |
| EC1 — Specification and parameters | Fix curve/scalar domains, strict encodings, packing, G/H and derivation, domain separation, identity behavior, source pins/preconditions, and planned theorem versus cryptographic assumptions. Reproduce public parameters. | Complete |
| EC2 — Reference | Established curve arithmetic; exact pack/unpack, canonical point/scalar parsers including identity, uniform blinder sampler, commitment/opening API; independent arithmetic comparisons; marked public synthetic fixtures covering normal, zero, extreme, and scalar-boundary cases. | Complete; awaiting approval for EC3 |
| EC3 — Circuit | Separate top level; feature/packing/scalar constraints, strict r < ell, justified complete group arithmetic and subgroup membership, same-input classifier, both public coordinates, Boolean threshold and correct ordering; inspect O0/O1 and direct assignments. | Not started |
| EC4 — Proofs and adversarial validation | Distinct setup/key identity; independently expected statement; separate parser/witness/direct-R1CS/verifier tests, zero and ell-1 scalars, identity and malformed points/encodings, wrong labels/coordinates/vectors/keys/packets; retain baseline suite. | Not started |
| EC5 — Formal correctness | Soundness and constructive completeness over every permitted input/blinder, packing/scalar uniqueness within each witness, group-gadget domains, common-input wiring, zero threshold; source/R1CS trace and explicit compiler/library assumptions. Keep baseline proof intact. | Not started |
| EC6 — Comparative benchmarks | Same host/toolchain/classifier, separately measured compilation/setup/witness/check/prove/application-verify, wires/constraints, first-call/warm repetition/dispersion, three versus two public inputs, separate proof/statement/packet sizes, defined memory, sanitized identities/results and limitations. | Not started |

## Integration boundaries already inspected

- `circuits/inference.circom` and `bounded-linear.circom`: preserve baseline,
  reuse classifier semantics; add a separate EC top level in EC3.
- `src/reference.js`, `commitment.js`, and `circuit-input.js`: preserve current
  exports and the Poseidon salt domain; add distinct EC adapters in EC2/EC3.
- `src/proof.js`, `proof-artifacts.js`, and setup scripts: the present verifier
  expects exactly two signals and IC length three. EC4 needs its own three-signal
  profile (IC length four), circuit artifacts, manifest, and key selection.
- `test/circuit.test.js`, `proof.test.js`, `formal-audit.test.js`, and the
  translation suites: preserve parser, witness, raw assignment, pairing, graph
  audit, and optimization evidence; do not report one rejection layer as another.
- `scripts/benchmark*.js` and `spec/benchmark.json`: existing timing/size/memory
  definitions provide the basis for EC6. Power-11 setup and two-input packet
  assumptions cannot be copied without checking the EC circuit. Run both
  variants in the same comparative experiment; old baseline numbers alone
  do not establish a current performance difference.
- The translation validator has explicit size and transformation bounds.
  Reassess them against the emitted EC circuit in EC5; document any unsupported
  optimization instead of silently treating it as verified.

Generated keys, ceremony material, witnesses, private input files, proof packets,
build outputs, and secrets must stay ignored. Only public synthetic fixtures
and reviewed sanitized reports may be committed.
