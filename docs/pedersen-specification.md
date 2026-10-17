# Pedersen inference specification, version EC 1.0.0

**EC1 complete; EC2 through EC6 require separate approval.** This is the normative
specification for a second variant, `zk-circuit/pedersen-babyjubjub/v1`.
The [Poseidon version-1 specification](specification.md), its public interface,
implementation, theorem, translation checks, keys, and benchmark remain intact.
This phase defines parameters and checks them; it does not implement a new
reference API, circuit, or proof workflow.

The integer model, quantization, and signed-score semantics are inherited from
Sections 1–3 of the baseline specification. In particular,

$$s=3x_0-2x_1+x_2+4x_3-5,\qquad y=\mathbf1[s\ge0],\quad x_i\in\{-8,\ldots,7\}.$$

The score range is exactly $[-83,67]$; zero belongs to class 1. Quantization is
external, exact $Q_K(z)=\lfloor Kz+1/2\rfloor$, with input scale 4, weight scale 4,
and bias scale 16. There is no clipping or score rounding. This remains a
synthetic classifier, with no accuracy or authentic-measurement claim.

## 1. Curve, fields, and encodings

Use the twisted Edwards form of Baby Jubjub:

$$aX^2+Y^2=1+dX^2Y^2\quad\text{over }\mathbb F_p,$$

with the following exact constants.

| Parameter | Value |
| --- | --- |
| Coordinate field $p$ | 21888242871839275222246405745257275088548364400416034343698204186575808495617 |
| $a$ | 168700 |
| $d$ | 168696 |
| Full curve order $8\ell$ | 21888242871839275222246405745257275088614511777268538073601725287587578984328 |
| Prime subgroup order $\ell$ | 2736030358979909402780800718157159386076813972158567259200215660948447373041 |
| Cofactor | 8 |
| Identity $O$ | $(0,1)$ |
| Inverse of $(X,Y)$ | $(-X\bmod p,Y)$ |

These are the [ERC-2494 curve parameters](https://eips.ethereum.org/EIPS/eip-2494).
That document is a stagnant proposal, not a claim of standardization or audit.
The primality of $p,\ell$ and the full curve order are published mathematical
premises; EC1 does not provide primality or point-count certificates.

The subgroup is $E[\ell](\mathbb F_p)=\{P:[\ell]P=O\}$. The coordinate field is
the **BN254 scalar field**, which is the existing Circom field. It is neither
the BN254 proof-point base field nor the Baby Jubjub scalar modulus $\ell$.
Addition/multiplication of point coordinates uses $p$; group scalars use $\ell$.

External coordinates and scalars are canonical unsigned base-10 strings:
`0` or `[1-9][0-9]*`, with no signs, spaces, leading zeroes, exponent notation,
or JSON numbers. Parse integers before conversion into a library field element.
Coordinates must lie in $[0,p-1]$; scalars in $[0,\ell-1]$. Reject aliases instead
of reducing them. A point is the ordered affine pair `[X,Y]`, satisfying the
curve equation and $[\ell]P=O$. The identity is allowed as a commitment.
Compressed encodings, Montgomery coordinates, and points at infinity in a
projective encoding are not accepted at this variant's transport boundary.

## 2. Message and blinding scalar

Private feature wires are $u_i=x_i+8\in\{0,\ldots,15\}$. Define

$$m=u_0+16u_1+256u_2+4096u_3\in[0,65535].$$

Feature 0 is the least significant nibble. The 16 little-endian message bits are
the four little-endian feature-bit blocks in order. Unpacking is
$u_i=\lfloor m/16^i\rfloor\bmod16$; $x_i=u_i-8$.
Uniqueness follows successively by reduction modulo 16 and integer division.
Because $65535<\ell<p$, neither integer packing nor interpreting $m$ as a
group scalar admits modular aliases within the input domain.

The private blinder $r$ is an integer in $[0,\ell-1]$, including zero. Honest
generation repeatedly draws **32 bytes from a CSPRNG**, interprets the full
bytes as an unsigned **big-endian** integer, and accepts iff it is below $\ell$.
There is no reduction, clipping, or top-bit masking. Independent uniform bytes
and rejection give a uniform scalar; the rejection rate is acceptable for this
research interface. Blinders must be fresh and secret for actual data.
The circuit can enforce the range, but cannot enforce entropy or freshness.
Deterministic values belong only in explicitly public synthetic fixtures.

A 251-bit decomposition alone permits $\ell,\ldots,2^{251}-1$ and is insufficient.
The planned constraint design uses both `Num2Bits(251)` on $r$ and
`LessThan(251)(r,ell).out === 1`. Both inputs meet its width precondition and
$2^{252}<p$, so the comparison's shifted difference does not wrap in the field.
Parsers additionally reject $p$-aliases, which no field relation can distinguish
after reduction.

## 3. Fixed generators and domain separation

The generators below are **not** the library's `Generator` and `Base8`.
They are separately derived hash-to-point outputs, each multiplied by the
cofactor. All digits are normative and duplicated in the
[parameter manifest](../spec/pedersen-parameters.json).

```text
G.X = 21089013549194393211874720674055170159445812616009128982996121284857556192122
G.Y = 8085084879007459477957026571536023198155314110624155763203615539184186768701
H.X = 14614171143892128058782894939452631060604662806361338235072785597557507408782
H.Y = 2719192117269298910472409734859557291435370725041396522964648820540827509338
```

The exact ASCII context, without line breaks or trailing newline, is:

```text
zk-circuit/pedersen-babyjubjub/v1;model=linear-4-v1;weights=3,-2,1,4;bias=-5;x=-8..7;u=x+8;packing=u0+16*u1+256*u2+4096*u3;threshold=s>=0;quantization=Q4-floor-half-up;points=affine-decimal
```

Here `linear-4-v1` names the unchanged `zk-circuit-linear-v1` model in
`spec/model.json`, whose byte hash is recorded in the manifest.
For each role `G` and `H`, append `;role=G` or `;role=H`, hash the UTF-8
bytes with SHA-256, interpret the 32-byte digest as a big-endian integer, and
render its minimal decimal string as `pointIndex`. **This integer is an index
string, never a scalar multiplying an existing point.**

Feed that string to the pinned circomlibjs
`getBasePoint("blake", pointIndex)` procedure. Its `padLeftZeros(index,32)`
uses a **minimum** width of 32; these longer strings must not be truncated or
converted to JavaScript Number. The manifest records the exact seed strings,
indices, BLAKE-256 digests, masked bytes, pre-cofactor points, and final points.
Both roles succeed at counter **0**, so there are no discarded candidates.

The exact established implementation procedure is:

1. For counter $j=0,1,\ldots$, form ASCII
   `PedersenGenerator_` + decimal index padded to at least 32 characters +
   `_` + decimal counter padded to at least 32 characters.
2. Compute **BLAKE-256**, not BLAKE2, BLAKE3, or Keccak. Clear bit 6 of byte 31
   using `bytes[31] &= 0xbf`. Bit 7 of that byte selects the sign of $X$.
3. Use the pinned `unpackPoint` behavior: clear the sign bit, interpret the
   remaining 32 bytes little-endian, and map this integer to $Y$ modulo $p$.
   Compute $v=(1-Y^2)/(a-dY^2)$; require its quadratic character to be 1.
   Choose the square root of $v$ in $[0,(p-1)/2]$, negating it modulo $p$
   when the sign bit is set. Retry if the decoder returns null.
4. Multiply the decoded point by 8. Check canonical coordinates, curve
   membership, subgroup membership, and nonidentity. Fail closed if any of
   these validations fails; do not silently substitute another seed or base.
   Check also $G\ne H$ and $G\ne-H$.

Step 3 deliberately describes the **legacy offline parameter derivation**, not
an acceptable application parser. The H candidate's unsigned Y is above $p$
and reduces to the recorded Y. Its reproducibility therefore depends on stating
this behavior explicitly. `unpackPoint` mutates its buffer and also rejects
$x^2=0$ through its character test; it cannot serve as the identity-capable,
strict parser specified in Section 1. Independent checks verify the candidate's
curve equation, chosen root sign, cofactor multiplication, and subgroup order.

The [source review](pedersen-library-review.md) pins the actual code and explains
the procedure's provenance. The project-specific adaptation is the public
model/role-to-index SHA-256 encoding; the underlying BLAKE/decode/cofactor map
is the existing circomlibjs algorithm. This is a reproducible source-reviewed
parameter choice, **not a claim of an external audit or RFC 9380 compliance**.
Variable-time trial decoding operates only on public fixed seeds.
Assume the public derivation does not expose a discrete-log relationship and
that finding $\log_G H$ is infeasible. We have not proved this assumption.
Neither generator is obtained as a publicly known scalar multiple of the other;
the cofactor relation is to its own separately hashed preimage point.

A changed model, quantization, bounds, feature order, packing, encoding, curve,
or incompatible protocol version requires a new context, parameter identity,
and verification key. The application independently selects that identity and
expected statement. The context is implicit in the circuit's fixed G/H and key;
it is not a fourth public signal or an added commitment term.
Perfect hiding means distinct contexts do **not** have disjoint sets of point
outputs; identity is shared as well. Domain separation does not mean that equal
coordinate pairs are mathematically impossible across versions. Never select a
model or key from an untrusted proof packet.

## 4. Commitment and interface

$$C=[m]G+[r]H.$$

Public inputs, exactly in order, are
`[commitmentX, commitmentY, label]`. There are **no public outputs**.
The public label is exactly the string `"0"` or `"1"`. Encoded features are
canonical unsigned decimal strings in [0,15]; the private blinder follows
the scalar encoding above.
Private inputs are `u[4]` and `r`; bits, packed message, score, and intermediate
points are private auxiliaries. Weights, bias, curve, G/H, and encoding are
constants. The same four $u_i$ feed packing and classification.

For a public tuple $(C_X,C_Y,y)$, the intended relation is

$$\exists x\in\{-8,\ldots,7\}^4,\quad 0\le r<\ell:
(C_X,C_Y)=[\sum_i16^i(x_i+8)]G+[r]H
\quad\land\quad y=\mathbf1[s(x)\ge0].$$

Both coordinates must equal the computed point. No separate prover-chosen point,
model, alternate input vector, or unconstrained equality hint is accepted.
The application must verify using its independently selected Pedersen key and
independently expected coordinates and label. Poseidon's two-input key and
artifacts cannot be reused. Key/manifest/packet changes belong to EC4.

## 5. Arithmetic design and exceptional cases

Use the established complete twisted Edwards addition law:

$$X_3=\frac{X_1Y_2+Y_1X_2}{1+dX_1X_2Y_1Y_2},\qquad
Y_3=\frac{Y_1Y_2-aX_1X_2}{1-dX_1X_2Y_1Y_2}.$$

The conditions are satisfied: $p$ is odd, $a,d$ are nonzero and distinct,
$a^{(p-1)/2}=1$, and $d^{(p-1)/2}=-1$ in the field.
Completeness of this law for these conditions is the established result in
[Bernstein et al., Section 6](https://eprint.iacr.org/2008/013.pdf).
Thus its denominators never vanish **for curve points**. Arbitrary coordinate
pairs cannot be supplied to a division gadget on this reasoning alone.

The initial EC3 design will compose the pinned `BabyAdd` gadget and constrained
Boolean selection with validated fixed multiples $[2^j]G$ (16 bits) and
$[2^j]H$ (251 bits). Start each accumulator at $O$. At bit $b_j$, select $O$
or the corresponding fixed multiple by coordinate equations
$Q_X=b_jB_X$, $Q_Y=1+b_j(B_Y-1)$, then add to the accumulator.
Constant-table validation must establish every multiple against G/H.
Starting from validated subgroup points and selecting with constrained bits
establishes subgroup membership inductively; complete addition preserves it.
The final addition and equality of both coordinates then establish membership
of the public commitment. A `BabyCheck` alone would not prove subgroup membership.

This is fixed-base binary multiplication using established group primitives,
with an explicit zero accumulator. EC1 selects it for a tractable correctness
argument; **no performance claim** is made. EC3 may not silently substitute an
optimized Montgomery gadget without reviewing all its preconditions and
updating these obligations. Every division hint must be accompanied by its
cross-multiplied constraint; the nonzero-denominator argument must hold for
every satisfying assignment, not just for generated witnesses.

Required cases include $[0]G=[0]H=O$, $[\ell-1]H=-H$, addition with $O$, doubling,
and inverse-point cancellation. The output $C=O$ is valid. In particular,
$x=(-8,-8,-8,-8)$ gives $m=0$; with $r=0$, $C=O$ and $s=-53,y=0$.
The feature vector $x=(0,0,0,0)$ instead packs to 34952 and has $s=-5$.
Other cancellation openings exist mathematically; the interface must not
exclude them just because finding a specific one may require a discrete log.

Reuse the original score relation
$S=3u_0-2u_1+u_2+4u_3-53$ in $\mathbb F_p$ and eight-bit $T=S+128$.
Its integer representative is $s+128\in[45,195]$; require $y=T_7$ and Boolean y.
At $s=0$, $T=128$ and $y=1$. None of these constraints may be replaced by a
witness-generator assertion.

## 6. Planned theorem and separate security assumptions

EC5 must prove, for the implemented constraints and their permitted domains:

- unique bounded feature decoding and injective integer packing;
- canonical scalar interpretation, including the strict upper bound;
- correctness and totality of all selected group operations;
- same-input wiring and every satisfying assignment's intended label/commitment;
- constructive completeness for **every** allowed $(x,r)$, including identities;
- source-to-O0 correspondence and the exact emitted public prefix; account
  separately for optimization, parser, compiler, metadata, and runtime assumptions.

These are proof obligations, not completed EC correctness theorems. The existing
[baseline theorem](formal-correctness.md) and
[production translation validation](translation-stage2-report.md) do not
automatically certify this larger circuit. The validator's bounds/support must
be assessed for it in EC5; no acceptance is inferred from the Poseidon result.

For commitment security, assume a prime cyclic subgroup and the unknown-log
relationship above. If two different messages have openings
$mG+rH=m'G+r'H$, then $r'-r\ne0\pmod\ell$ and

$$\log_G H=(m-m')(r'-r)^{-1}\pmod\ell.$$

Packing ensures differing feature vectors have differing messages modulo
$\ell$. Thus efficient equivocation contradicts that discrete-log assumption.
For the same message, canonical r is unique, but a public C does **not** have
a mathematically unique feature-vector opening: every possible m has exactly
one r modulo $\ell$ giving C. Computational binding is not injectivity of
the entire opening space. Since both labels occur in the allowed domain, every
subgroup commitment has mathematical openings with either label. The useful
claim is knowledge of a satisfying opening together with computational binding
to the previously selected opening. Adversarial tests must distinguish rejecting
a wrong label for a fixed opening from asserting that no such opening exists.

For uniform independent secret r, $[r]H$ is uniform in the subgroup and adding
$[m]G$ preserves that distribution. The commitment alone is therefore perfectly
hiding under ideal uniform sampling. A revealed/reused/biased blinder invalidates
the corresponding honest-use guarantee. The public label intentionally leaks
classification. Hiding of the whole transcript additionally needs proof-system
zero knowledge, correct setup and implementation, and an appropriate execution
environment. The JavaScript arithmetic has no constant-time guarantee.

Groth16 knowledge soundness, zero knowledge, valid independent key selection,
setup integrity, and implementation correctness are separate assumptions.
The existing single-machine ceremony policy remains research-only. Proof
acceptance is a conditional computational guarantee, not a formal proof of the
cryptographic libraries, data authenticity, replay protection, or model quality.
