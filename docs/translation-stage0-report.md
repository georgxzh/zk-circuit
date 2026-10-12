# Stage 0 feasibility report

**Stage 0 complete; awaiting review before any general O1 checker work.**
This bounded, synthetic prototype is motivated by zk-circuit's optimization
assumption. No novelty is claimed. The production O0/O1 assurance gap remains open.

## Deliverables and reproduction

- [Checker and witness transport](../research/translation-stage0/checker.js).
- [Written contract and argument](translation-stage0-contract.md).
- [26 examples](../research/translation-stage0/examples.js) and an
  [independent exhaustive oracle](../research/translation-stage0/oracle.js).
- [Tests](../test/translation-stage0.test.js) over F_2, F_3, F_5, F_7, including
  malformed inputs, witness transport, and a systematic family.

From the repository root, using the project's Node.js runtime:

```sh
npm run test:translation-stage0
npm run translation:stage0
```

These commands require no compiler, ceremony, or generated artifact. The second
prints one JSON record per F_5 example with separate checker and oracle results;
it writes no files. The tests are also included in the normal `npm test` command.

## What acceptance establishes

Under the contract and assuming the implementation is correct, acceptance
establishes equal public existential relations for the supplied bounded systems.
Constructive projection and lifting preserve wire zero's value 1 and every
ordered public coordinate. Each alias/constant elimination needs a checked
defining equation; merely trusting proposed reconstruction would be unsound.
Unused coordinates can be filled with zero without requiring unique witnesses
or recovery of every original private assignment.

This is a written mathematical argument plus executable validation, not a
machine-checked theorem or verified implementation. Groth16 security, Poseidon
security, setup integrity, and correctness of the classifier specification
remain separate from relation equivalence.

## Results

**110 tests pass** on Node.js 26.3.1. Of these, 104 exercise the 26 fixtures
over four primes. Every accepted fixture is checked against its complete public
relation and every satisfying witness in both directions. Additional tests cover
the explicit lost-statement counterexample, nonunique witnesses, malformed data,
transport snapshots, the enumeration limit, and the systematic family below.

All eight Node test files were also run together directly: **154/154 passed**,
including the existing classifier, Groth16, and complete O0-audit tests against
the available build artifacts. This regression run did not rebuild Circom or
repeat setup; it is not evidence of a fresh compilation or O1 equivalence.

At each prime, the fixtures produce 10 acceptances, 12 rejections with equal
relations, and 4 rejections with unequal relations:

| Examples | Certificate | Oracle | Reason |
| --- | --- | --- | --- |
| Alias chain plus constant; constant nonlinear collapse | Accept | Equal | Pivots justify substitutions, including inside products |
| Public equality retained; public constant retained | Accept | Equal | Public restrictions survive with fixed coordinates |
| Unused private; nonunique witnesses retained | Accept | Equal | Unused-wire or identity transport does not require uniqueness |
| Private permutation; row scaling and reordering | Accept | Equal | Only private coordinates move; residual rows agree |
| Empty public interface; unsatisfiable residual | Accept | Equal | Handles the singleton empty statement and empty relation |
| Public equality dropped; public constant dropped | Reject | Unequal | Target admits extra public statements |
| Crucial t=1 proposal; wrong constant | Reject | Unequal | Unjustified substitution loses source statements |
| Unjustified but equivalent; constrained wire called unused | Reject | Equal | Missing pivot or failed unused-wire condition |
| Missing elimination; out-of-range dependency; already-eliminated dependency | Reject | Equal | Incomplete mapping or invalid reconstruction dependency |
| Cyclic aliases; self cycle | Reject | Equal | Reconstruction is not an allowed acyclic sequence |
| Public-slot swap; constant-wire remap | Reject | Equal | Identity violation even on symmetric endpoint relations |
| Duplicate retained mapping; missing retained mapping | Reject | Equal | Retained mapping is not a total bijection |
| Duplicate row deleted | Reject | Equal | Conservative comparison does not certify redundancy removal |

For the crucial source `t*a=0`, proposed `t=1`, target `a=0`, the checker reports
`unjustified-substitution`. The independent oracle establishes inequivalence:
`R_source=F_5`, `R_target={0}`, and source-only tuples `[1]`, `[2]`, `[3]`, `[4]`.
In particular `(a,t)=(1,0)` satisfies the source but its public statement has
no target witness. Certificate rejection alone is not this semantic conclusion.

The systematic experiment enumerates all 729 rows

```text
t * (alpha*a + beta*t + gamma) = delta*a + epsilon*t + zeta
```

over F_3, proposing t=0, t=1, t=2, and t=a for each. Targets are constructed
directly in the test without checker substitution code. Among **2,916 triples**,
24 are accepted, 774 are rejected despite equal public relations, and 2,118 are
rejected with unequal relations. Every acceptance passes exhaustive equivalence
and witness-transport checks. This exhausts a finite family, not all R1CS systems.

Malformed-data checks additionally reject invalid fields, noncanonical
coefficients, invalid indices, sparse arrays, duplicate terms, changed public
metadata, unexpected/missing keys, invalid versions, protected-wire elimination,
bad pivots, duplicate eliminations, and malformed mappings. These malformed
inputs receive no semantic equivalence result.

## Remaining assumptions and limits

The checker, oracle, runtime, and written reasoning are unverified. The
caller-supplied public manifest is not authenticated against compiler artifacts.
Only primes up to 251, eight wires, 64 rows, aliases, constants, and unused-wire
drops are supported. Binary R1CS, `.sym`, substitution JSON, BN254, artifact
hashes, and compiler execution are outside this implementation. It does not
validate the real 1,635-to-999-constraint translation or remove its compiler
assumption. The oracle exhausts tiny systems and cannot scale to the classifier.

The checker is intentionally incomplete. It does not certify arbitrary row
combinations, duplicate-row removal, or general nonlinear elimination. Rejecting
a cycle restricts certificates; it does not imply that cyclic equality systems
have no solutions. Checker and oracle use separate algorithms but share the
JavaScript runtime, fixtures, and interface convention.

## Decision for review

**Proceed to a separately approved O1 experiment.** Stage 0 supports checked
elimination, pointwise public identity, and witness transport in both directions.
It falsifies the weaker design that checks reconstruction/residual equality alone.

The next gate is whether independently parsed, pinned O0/O1 artifacts can supply
a complete checked elimination sequence and a public mapping bound to the real
interface, using exact large-field arithmetic. The classifier should be one
regression fixture among multiple circuits. Unsupported transformations must
lead to explicit rejection or a revised certificate rule, never silently
trusted substitutions, missing rows, or weakened public identity.

Any false acceptance against the tiny oracle is a stop condition. Unresolved
public-coordinate provenance, insufficient compiler information, or unaccounted
residual rows block a production assurance claim. O2's general affine
eliminations would need a broader checked pivot rule and reconstruction
expressions. This outcome supports a bounded next experiment, not a general
O1/O2 or publication claim. No subsequent stage has been implemented.
