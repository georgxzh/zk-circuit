# EC2 review: Pedersen reference implementation

**Complete. Stop for explicit approval before EC3.**

The [reference module](../src/pedersen.js) implements the EC1 commitment relation
with pinned circomlibjs Baby Jubjub arithmetic. The
[API guide](pedersen-reference.md) documents its exact input and error contracts.

## Changes

- Exact pack/unpack of four bounded signed features with feature 0 in the low
  nibble; strict parsing of the four encoded feature strings.
- Canonical scalar and affine point parsing, with separate coordinate/subgroup
  moduli, subgroup validation, and identity acceptance.
- Fresh CSPRNG blinding via full 32-byte big-endian rejection sampling below ell.
- Commitment computation, three-signal statements, and local opening checks.
- Immutable fixed parameters, validation at library initialization, and snapshots
  of caller arrays before asynchronous work.
- Thirteen explicitly public synthetic fixtures, an independent test-only group
  oracle, and integration of EC2 checks into the complete repository suite.

No dependency versions, EC1 parameters, baseline runtime implementations, or
Poseidon interfaces changed. The immutable EC1 manifest keeps its original
publication/status text and hash; current phase status is in the README/plan.
No EC circuit, proof packet, witness, setup, or verification-key workflow was
implemented in this phase.

## Validation

Validated with Node.js **26.3.1**, npm **11.16.0**, Windows x64, and the existing
Circom **2.2.3** for baseline regression checks.

| Check | Result |
| --- | --- |
| EC2 targeted suite | **14/14 passed** |
| Full `npm test` | **205/205 passed**, comprising all 191 existing checks and 14 EC2 groups |
| EC1 parameter/source audit, run inside EC2 tests | PASS; original manifest hash and pinned sources preserved |
| Pack/unpack enumeration | All **65,536** input vectors, all **930** zero-score vectors |
| Commitment fixtures | **13** public fixtures independently calculated and cross-checked |
| Additional group calculations | All **16** feature corners and **16** further deterministic feature/scalar pairs |
| Scalar/point transport | Rejected aliases, noncanonical syntax/types, sparse arrays, off-curve points, order-2 and mixed-torsion points |
| Sampling | Exact rejection at ell, the excess 251-bit range, p and maximum bytes; acceptance of zero, ell-1, and asymmetric endian examples; malformed source/error handling |

The independent oracle uses the published affine equations, Euclidean inversion,
MSB-first scalar multiplication, and Horner packing. The application uses the
existing library's field arithmetic and LSB-first multiplication. Both share
the specified mathematical law and fixed constants; agreement is implementation
validation, not a machine-checked proof or new security result.

The tests explicitly distinguish malformed-input exceptions from `false` for
a well-formed statement that does not match a particular supplied opening.
These are **reference/parser rejections**, not EC witness, R1CS, or cryptographic
verifier rejections. Those layers will be implemented in later phases.

Identity at m=r=0 produces public ['0','1','0']. Zero-score classification
remains label 1. r=ell-1 produces -H when m=0. Independent tests also exercise
inverse cancellation, on-curve non-subgroup points, feature order, changed
blinders/labels/commitments, and mutation of caller/returned arrays.

## Scope and next gate

`checkOpening` receives the opening and is not a privacy-preserving proof
verifier. The sampler's uniformity follows from ideal uniform CSPRNG draws plus
rejection; smoke tests cannot certify randomness. The JavaScript path has no
constant-time or secure-erasure guarantee. All EC1 mathematical/cryptographic
assumptions remain explicit.

The full run rebuilt/checked the original baseline workflow; its artifacts and
validation log stay in ignored `build/`. Only source, documentation, and
explicitly public synthetic fixtures are included in this phase's commit.

EC3 — the separate Pedersen inference circuit — requires explicit approval.
