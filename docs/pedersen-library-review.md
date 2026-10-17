# EC1 source and parameter review

This review is for the exact sources in
[pedersen-provenance.json](../spec/pedersen-provenance.json), inspected on
2026-10-17. It records concrete preconditions and design decisions. It is not
an external security audit, a proof-assistant certificate, or approval to start EC2.

## Provenance and scope

The baseline already pins circomlib 2.0.5 and circomlibjs 0.1.7. No dependencies
were upgraded or added. The lockfile also pins ffjavascript 0.2.63,
wasmcurves 0.2.2, and blake-hash 2.0.0 relevant to this derivation.
The manifest records their exact npm integrity strings and upstream revisions
where npm metadata provides one.

The ten reviewed circomlib/circomlibjs source files were fetched at their npm
release gitHead revisions and matched byte-for-byte to the installed files:

- circomlib: `cff5ab6288b55ef23602221694a6a38a0239dcc0`.
- circomlibjs: `4f094c5be05c1f0210924a3ab204d8fd8da69f49`.

Five additional implementation files are SHA-256 pinned to their installed,
lockfile-identified packages. The existing Poseidon specification uses its own
immutable revision and file identity; that baseline provenance is unchanged.
The compiler remains the separately pinned Circom 2.2.3 in
[compiler.json](../spec/compiler.json). The existing full lockfile remains the
dependency closure; hashing 15 reviewed files is not an audit of every dependency.

## Generator procedure review

The [upstream generator code](https://github.com/iden3/circomlibjs/blob/4f094c5be05c1f0210924a3ab204d8fd8da69f49/src/pedersen_hash.js)
constructs candidates from a BLAKE-256 hash of public index/counter strings,
decodes a point, and clears cofactor 8. It does not expose a scalar multiplying
a standard base, which is the necessary distinction from hash-to-scalar times G.
The [iden3 Pedersen paper, Section 5.1](https://docs.iden3.io/publications/pdfs/Pedersen-Hash.pdf)
describes public-seed candidate search for unrelated generators, but sketches
Keccak rather than the shipped BLAKE implementation. This project pins the
actual code's map and encoding; it does not pretend those descriptions are
byte-compatible. The model/role-index encoding is specified in full in the
[new specification](pedersen-specification.md).

Review findings that affect reproducibility or security:

| Source/function | Finding and obligation |
| --- | --- |
| `pedersen_hash.js:getBasePoint` | Index uses string coercion/minimum-width padding, with no truncation. Large domain-derived indices must stay decimal strings. Candidate search is variable-time on public data. Cofactor multiplication and subgroup check exist, but no explicit nonidentity check does; EC1 adds that validation. |
| Same function's `bases` cache | Cache key is index alone, not the selected hash type. Use a fresh instance and exclusively `"blake"`; never mix BLAKE and BLAKE2 in one instance. |
| `babyjub.js:unpackPoint` | Mutates sign byte. Field conversion precedes the apparent range check, so it does not reliably enforce canonical input Y. The check uses `>`, not `>=`, and the character test rejects zero square. Do not use it as the application's point parser. |
| `ffjavascript:wasm_field1.js`, `wasmcurves:build_f1m.js` | Field representation conversion and square-root sign choice determine the actual decoder. The square root is normalized to the lower half of the field before the encoded sign is applied. |
| `blake-hash:index.js` | Selects native bindings if present, otherwise JavaScript. EC1 additionally recomputes each digest via the JavaScript entry point and compares it with upstream `baseHash`. Lockfile integrity identifies the package; this is not a separate BLAKE implementation. |
| `babyjub.js:addPoint/mulPointEscalar` | Established complete affine arithmetic; multiplication starts at identity and handles scalar zero. Functions do not enforce application scalar ranges or validate arbitrary inputs. Negative scalars are outside our permitted calls. No constant-time promise is made. |
| `babyjub.js:inSubgroup` | Checks curve membership then multiplication by ell. Identity passes, as required for commitments. Nonidentity is an additional requirement only for fixed G/H. |

The exact candidate for H has Y above p before field conversion. EC1 records
and independently reproduces that reduction, so an implementer cannot silently
substitute a stricter hash-to-point decoder and get different parameters.
This legacy behavior is isolated to fixed public parameter derivation.
All later untrusted point/scalar parsers must enforce canonical integers first.

The unknown-log assumption is not proved by subgroup tests. All nonidentity
points in this subgroup are scalar multiples of one another; what is required
is that the relationship is unknown and computationally infeasible to find.
Neither the public hash digest used as an index nor cofactor 8 reveals the
relationship between the two separately decoded points. No externally audited
hash-to-curve suite or uniform-generator theorem is claimed for this adapter.

## Circuit primitives and preconditions

[BabyAdd](https://github.com/iden3/circomlib/blob/cff5ab6288b55ef23602221694a6a38a0239dcc0/circuits/babyjub.circom)
computes beta, gamma, delta, and tau and constrains both cross-multiplied
coordinate equations. Expanding its numerator for Y gives
$Y_1Y_2-aX_1X_2$. Its witness divisions therefore match the standard affine law.
The gadget itself performs **no input-curve or subgroup checks**. EC3 must
establish those facts by induction from validated fixed points and Boolean
selection. Euler-criterion checks confirm that a is square and d nonsquare;
the completeness theorem applies only after curve membership is established.
Identity, doubling, and inverse cancellation are within its permitted domain.

`BabyDbl` delegates to `BabyAdd`; `BabyCheck` checks only the curve equation.
`BabyPbk` targets a specific library base and a 253-bit input. It neither uses
our generators nor enforces r < ell.

The reviewed [Montgomery conversion and arithmetic](https://github.com/iden3/circomlib/blob/cff5ab6288b55ef23602221694a6a38a0239dcc0/circuits/montgomery.circom)
contain divisions by $1-Y$, X, Montgomery v, u+1, an x-coordinate difference,
and $2Bv$, depending on the operation. They are incomplete on arbitrary points:
for example, identity cannot pass the Edwards-to-Montgomery map.
A cross-multiplied equation with zero coefficient is not by itself evidence
of a unique division result.

`EscalarMulFix` uses offset windows, compensating sums, conversions, and
segmentation. Its segment-count expression uses 246 while its stride and
segment widths use 249, with an uncertainty comment in the source.
That observation is a review obligation, **not a demonstrated exploit**.
Its internal Montgomery denominators require a separate domain proof.
`EscalarMulAny` explicitly assumes a subgroup point; its x=0 substitution does
not validate arbitrary input points. Both take bit arrays without replacing
the caller's obligation to constrain those bits and the scalar's upper bound.
Neither optimized multiplier is selected for the initial EC circuit.

`Pedersen(n)` and `pedersen_hash.js:hash` use signed windows and fixed
segment bases to hash a bitstring. They do not implement $[m]G+[r]H$ with the
specified binary packing and canonical r. EC1 uses only the established
generator derivation from the latter, not its hash as a commitment function.

`Num2Bits` constrains Boolean bits and recomposition. Widths 4, 8, 16, and 251
are below the field alias threshold here.
`LessThan(n)` assumes bounded n-bit inputs; it does not constrain both inputs'
ranges itself. The planned r decomposition plus constant ell meets those
preconditions for n=251. The upper bound must be forced by a constraint,
not a runtime assertion.

## Reproducible EC1 validation

Run:

```sh
node scripts/check-pedersen-parameters.js
```

This read-only command checks package/file pins, generator seed transcripts,
the actual library's derivation, and direct BigInt calculations using the
published affine formulas independently of the library's optimized numerator
schedule. It validates on-curve membership at each independent addition,
nonzero denominators in those calculations, cofactor multiplication, ell-order,
negation, zero scalar, identity addition, distinct/noninverse bases, and
Euler criteria. It also enumerates all 65,536 feature encodings, round-trip
packing, score extrema, and 930 score-zero vectors.

The check establishes reproducibility of **fixed public parameters** and
numerical premises. It supplies no secret data, commitment reference API,
circuit implementation, Groth16 material, or EC correctness theorem.
It does not prove primality, the curve point count, absence of a known
discrete logarithm, or correctness of every library operation.
