# Mathematical specification, version 1.0.0

This document is normative. `spec/model.json` transcribes its constants; any
disagreement must be resolved before implementation continues. Equations over
integers are distinguished from equations in the field. Indices are zero-based.

## 1. Integer classifier

The input is $x\in\mathbb Z^4$, with $-8\le x_i\le7$ for every coordinate.
The fixed public model is $w=(3,-2,1,4)$ and $b=-5$.

$$s(x)=\sum_{i=0}^3 w_i x_i+b,\qquad
y(x)=\begin{cases}1 & s(x)\ge0,\\0 & s(x)<0.\end{cases}$$

All operations here use exact integers, with no saturation, truncation, or
machine overflow. The zero score belongs to class 1. The model is a synthetic
research fixture, not a trained or empirically validated predictor.

Coordinate-wise term bounds are $[-24,21]$, $[-14,16]$, $[-8,7]$, and
$[-32,28]$. Therefore the tight score interval is $[-83,67]$. Its endpoints
occur at $(-8,7,-8,-8)$ and $(7,-8,7,7)$ respectively.

## 2. Quantization and model scale

For exact rational $z$ and positive integer scale $K$, define

$$Q_K(z)=\lfloor Kz+1/2\rfloor.$$

Halfway cases round toward positive infinity, including negative halfway
cases. There is no clipping. Decimal text, if accepted by a future adapter,
must be parsed as an exact decimal rational, not through binary floating point.
Non-finite and malformed values are rejected.

Optional preprocessing maps rational features to $x_i=Q_4(z_i)$ and rejects
the input unless all results lie in $[-8,7]$. Equivalently the admissible raw
interval per coordinate is $[-17/8,15/8)$. The integer API accepts only integers
in range; it does not silently quantize fractional inputs.

For interpretation, the public rational model is
$a=(3/4,-1/2,1/4,1)$ with intercept $\beta=-5/16$.
Its exact integer parameters are $w_i=Q_4(a_i)$ and $b=Q_{16}(\beta)$.
For the quantized features $\widehat z_i=x_i/4$, the rational model score is

$$a^\top\widehat z+\beta=s(x)/16.$$

The threshold is applied to $s$ directly. No score rounding or division occurs
before classification. Quantization takes place outside the circuit. The
proof will establish a claim about $x$, not that $x$ was correctly derived from
an undisclosed raw measurement, nor that quantization preserves its raw label.

## 3. Field and signed representation

Use $\mathbb F_p$ with the BN254 **scalar-field** modulus

```
p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

The integer-to-field map is $\iota(z)=z\bmod p$. Thus negative constants in
field expressions are residues, not machine signed integers. All external
field values must be canonical representatives in $[0,p-1]$; reject aliases
such as $p$, rather than reducing them at the API boundary.

Private input wires use **offset binary**: $u_i=x_i+8$. Constrain each $u_i$
to four bits. Decode as the ordinary integer $x_i=u_i-8$. This bijects
$\{0,\ldots,15\}$ with $\{-8,\ldots,7\}$. It is not two's complement.

The internal score wire is $S=\iota(s)$. Its allowed residues are
$\{0,\ldots,67\}\cup\{p-83,\ldots,p-1\}$, decoded as $S$ in the first
interval and $S-p$ in the second. These intervals are disjoint.

The sign gadget uses an offset score $T=S+128$ in the field, decomposed into
eight bits. Under valid inputs its integer value is $t=s+128\in[45,195]$.
Define the public label by $y=t_7$, the bit of weight $128$. Thus $s=-1,0,1$
maps to $t=127,128,129$ and labels $0,1,1$.

For the intended integer evaluation, left-to-right score partial sums before
bias lie within $[-24,21]$, $[-38,37]$, $[-46,44]$, and $[-78,72]$.
The final score lies within $[-83,67]$. Negative field representatives may be
large; one must never compare their unsigned representatives to zero.

Four-bit values are unique because $15<p$. Eight-bit values are unique because
$255<p$. To lift $T=S+128$ back to integer equality, the difference between an
arbitrary eight-bit $t\in[0,255]$ and the valid integer $s+128\in[45,195]$
lies in $[-195,210]$. Its only multiple of $p$ is zero. These numerical bounds
are premises for the later correctness proof, not a claim that generated
circuit constraints have already been verified.

## 4. Salted commitment

Let $H$ be circomlib `Poseidon(6)` over this same field at revision
`35e54ea21da3e8762557234298dbb553c175ea8d`. The function and constants are defined
by the upstream [Poseidon circuit](https://github.com/iden3/circomlib/blob/35e54ea21da3e8762557234298dbb553c175ea8d/circuits/poseidon.circom)
and its [constants file](https://github.com/iden3/circomlib/blob/35e54ea21da3e8762557234298dbb553c175ea8d/circuits/poseidon_constants.circom).
Use the six-input wrapper: state width 7, initial capacity element 0, eight
full rounds, 63 partial rounds, fifth-power S-box, and its first output element.
This identifies a specific function, not any interchangeable Poseidon variant.

$$C=H(1,u_0,u_1,u_2,u_3,r).$$

The ordered preimage is six field elements, without byte concatenation or
additional padding. The constant 1 is this project's registered domain tag for
the complete version-1 model and encoding. Any incompatible future model or
encoding must receive a new tag and verification-key identity.

For honest commitment generation, sample a fresh secret $r$ uniformly from
$\mathbb F_p$: repeatedly draw 32 cryptographically random bytes, interpret
them as an unsigned big-endian integer, and accept only if it is below $p$.
Zero is permitted. Randomness quality and freshness cannot be enforced by the
circuit. Deterministic salts may be used only in clearly synthetic tests.

Collision resistance is the assumption behind computational binding. Hiding
with a fresh secret salt is a separate cryptographic assumption about this hash
construction; it does not follow from collision resistance alone. The formal
arithmetic theorem will not prove Poseidon's security. The salt is necessary
because there are only $16^4=65,536$ possible feature vectors.

## 5. Public statement and exact constraint relation

Public signals, in order, are $(C,y)$. Both are public **inputs**; the intended
top-level circuit has no additional output signals. Private inputs are
$(u_0,u_1,u_2,u_3,r)$. The bits, score, shifted score, and Poseidon intermediates
are private auxiliary witnesses. Weights, bias, and domain tag are circuit
constants, not prover-selectable inputs.

The verifier accepts only the designated version-1 verification key and exactly
two public signals in the declared order. Transport values are canonical
nonnegative base-10 integer strings (`0` or a nonzero digit followed by digits).
The public label is additionally restricted to `0` or `1`. The score is not
part of the public statement.

The circuit must enforce the following equations in $\mathbb F_p$:

1. For every $i\in\{0,1,2,3\}$ and $j\in\{0,1,2,3\}$,
   $a_{i,j}(a_{i,j}-1)=0$ and $u_i=\sum_{j=0}^3 2^j a_{i,j}$.
2. $C=H(1,u_0,u_1,u_2,u_3,r)$, including all constraints implementing $H$.
3. $S=3(u_0-8)-2(u_1-8)+(u_2-8)+4(u_3-8)-5$.
4. $T=S+128$; for $j\in\{0,\ldots,7\}$, $t_j(t_j-1)=0$;
   and $T=\sum_{j=0}^7 2^j t_j$.
5. $y=t_7$ and $y(y-1)=0$ (the latter is explicit though redundant).

The **same four wires** $u_i$ must feed both the hash and the score expression.
There is no second input vector. The score bounds follow from the input ranges
and fixed affine expression; no additional independent score-range gadget is
required. Witness-generation checks alone do not establish any of these
relations: they must be actual constraints.

For public $(C,y)$ the desired relation is

$$\exists x\in[-8,7]^4\cap\mathbb Z^4,\ r\in\mathbb F_p:
C=H(1,x_0+8,x_1+8,x_2+8,x_3+8,r)
\ \land\ y=\mathbf1[s(x)\ge0].$$

This is an existential claim. Interpreting it as a claim about a previously
chosen opening also uses commitment binding. The application must supply the
expected commitment; accepting a prover-chosen substitute proves a different
statement. A proof does not authenticate sensor data or prevent replay.

## 6. Required correctness obligations

Phase 5 must establish soundness and completeness of the constraint relation:

- Input decoding is unique and produces an in-range integer vector.
- Score and shifted-score field equations lift to the specified integer values.
- The high bit equals the threshold predicate, including score zero.
- Commitment and classifier use identical decoded features.
- Every satisfying assignment satisfies the desired relation.
- Every valid opening extends to a satisfying assignment for its correct label.

Prove the arithmetic relation over a specified hash function first. Audit its
connection to the implemented and compiled constraints separately, stating any
compiler or library assumptions. Proof-system soundness/zero knowledge, setup
integrity, hash security, and cryptographic implementation correctness remain
explicit assumptions. Testing does not substitute for these proofs.

## References

- [Circom field arithmetic](https://docs.circom.io/circom-language/basic-operators/)
  specifies modular arithmetic and the default field.
- [Circom constraint generation](https://docs.circom.io/circom-language/constraint-generation/)
  distinguishes assignments from enforced relations.
- [Poseidon research paper](https://eprint.iacr.org/2019/458)
  describes the hash design; the immutable circomlib sources above define the
  exact instance selected here.
