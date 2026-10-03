# Formal correctness of the version-1 inference relation

This is the Phase 5 written proof permitted by the project plan. It proves
soundness and completeness of the specified field constraint relation, with a
separate audit of its implementation. It is not a proof-assistant development or
a proof of Groth16, Poseidon security, or compiler correctness. The normative
parameters are in the [specification](specification.md). The implementation
evidence and remaining assumptions are in the [constraint audit](constraint-audit.md).

## 1. Definitions and theorem

Work over the prime field $F=\mathbb F_p$, where

```
p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

We use primality as a field premise; this document does not give a primality
certificate. Let $\iota:\mathbb Z\to F$ be reduction modulo $p$, and let
$\operatorname{rep}:F\to\{0,\ldots,p-1\}$ select the canonical integer
representative. Inequalities and binary digits below concern integers, never an
ordering of $F$. In field equations, integer constants mean their images under
$\iota$. In particular, $p>255$.

Let $D=\{-8,\ldots,7\}^4$, and define integer functions

$$s(x)=3x_0-2x_1+x_2+4x_3-5,\qquad f(x)=\mathbf1[s(x)\ge0].$$

Let $H:F^6\to F$ be exactly the pinned optimized circomlib `Poseidon(6)` function
defined in Section 5, including constants, zero capacity, and output coordinate.
For public $C,y\in F$, define the intended relation

$$R(C,y)\iff \exists x\in D,\ r\in F:
C=H(1,\iota(x_0+8),\ldots,\iota(x_3+8),r)
\ \land\ y=\iota(f(x)).$$

Define $\mathcal C(C,y;W)$ as the following field equations, where the private
assignment $W$ includes $u_0,\ldots,u_3,r,S,T$, input bits $a_{i,j}$, score bits
$d_j$, and hash intermediates:

| ID | Equations in $F$ |
| --- | --- |
| E1 | $a_{i,j}(a_{i,j}-1)=0$, $u_i=\sum_{j=0}^3 2^j a_{i,j}$, for $0\le i,j<4$ |
| E2 | $S=3u_0-2u_1+u_2+4u_3-53$ |
| E3 | $T=S+128$ |
| E4 | $d_j(d_j-1)=0$ for $0\le j<8$, and $T=\sum_{j=0}^7 2^j d_j$ |
| E5 | $y=d_7$ and $y(y-1)=0$ |
| E6 | The hash graph for $H$ has input $(1,u_0,u_1,u_2,u_3,r)$ and output equal to $C$ |

These equations include equality of the classifier and hash copies of each
$u_i$; E6 does not introduce an independently chosen feature vector.

**Theorem T1 (constraint soundness).** Every field assignment $W$ satisfying
$\mathcal C(C,y;W)$ determines a unique decoded $x\in D$ from its four $u_i$,
with $S=\iota(s(x))$, $\operatorname{rep}(T)=s(x)+128$, the stated commitment,
and $y=\iota(f(x))$. Consequently $R(C,y)$ holds.

**Theorem T2 (constraint completeness).** For every $x\in D$ and every $r\in F$,
setting $C=H(1,\iota(x_0+8),\ldots,\iota(x_3+8),r)$ and $y=\iota(f(x))$
admits a satisfying assignment $W$. Consequently,

$$\bigl(\exists W:\mathcal C(C,y;W)\bigr)\quad\Longleftrightarrow\quad R(C,y).$$

The uniqueness in T1 is relative to a particular witness's input wires. It does
not assert that a public commitment has a unique opening, or even that all its
mathematical openings have the same label.

## 2. Booleanity, range, and decoding

**Lemma L1 (bounded bit decomposition).** If $b_j(b_j-1)=0$ in $F$ for
$0\le j<n$, $v=\sum_{j=0}^{n-1}2^jb_j$, and $2^n-1<p$, then each $b_j$ is
0 or 1 and $\operatorname{rep}(v)=\sum_j2^j\operatorname{rep}(b_j)$ lies in
$[0,2^n-1]$. These bits are uniquely determined by $v$.

**Proof.** A field has no zero divisors, so each factored equation implies
$b_j=0$ or $b_j=1$. The integer sum $B$ lies in $[0,2^n-1]\subset[0,p-1]$;
thus $v=\iota(B)$ has representative $B$. If another such sum $B'$ represents
$v$, then $p$ divides $B-B'$, whose absolute value is smaller than $p$, so
$B=B'$. Uniqueness of ordinary binary expansion follows by taking equality
modulo 2 to recover the lowest digit, subtracting it, dividing by 2, and
inducting on the remaining digits. Conversely the binary expansion of any
integer in this interval satisfies these equations. $\square$

**Corollary L2 (unique signed input).** By E1 and L1 with $n=4$, each
$U_i=\operatorname{rep}(u_i)$ lies in $[0,15]$. Define $x_i=U_i-8$ in
$\mathbb Z$. Then $x\in D$, uniquely for those input wires, and
$u_i=\iota(x_i+8)$. Conversely every $x\in D$ has precisely this offset
encoding. This is offset binary, not two's complement.

## 3. Integer score and field lifting

**Lemma L3 (score bound and interpretation).** For the $x\in D$ decoded in L2,
$-83\le s(x)\le67$. E2 forces $S=\iota(s(x))$, whose signed decoding is
unambiguous on the allowed score interval.

**Proof.** The four terms $3x_0,-2x_1,x_2,4x_3$ lie in
$[-24,21],[-14,16],[-8,7],[-32,28]$, respectively. Adding their extrema and
bias $-5$ gives $[-83,67]$. Both endpoints are attained: $(-8,7,-8,-8)$
gives $-83$ and $(7,-8,7,7)$ gives $67$. Substituting L2 into E2 and using
that $\iota$ preserves addition and multiplication yields

$$S=\iota(3(x_0+8)-2(x_1+8)+(x_2+8)+4(x_3+8)-53)
=\iota(s(x)).$$

If two integers in $[-83,67]$ have the same image under $\iota$, their
difference is a multiple of $p$ in $[-150,150]$, hence zero. Explicitly the
canonical score residues are $[0,67]$ and $[p-83,p-1]$. They are disjoint
because $p>150$; decode the first by identity and the second by subtracting $p$.
All other residues are excluded by the input ranges and score equation, even
without a separate score-range constraint. $\square$

Field evaluation necessarily uses modular reduction. For a negative score its
canonical residue is large, so an unsigned comparison of $S$ with zero would be
incorrect. L3 asserts agreement after the specified decoding. Every intermediate
integer expression maps to the corresponding field expression by the same
homomorphism; the score's left-to-right partial sums before bias lie in
$[-24,21],[-38,37],[-46,44],[-78,72]$. No machine-integer overflow assumption is
used: these are mathematical integers, and the reference uses `BigInt`.

**Lemma L4 (shifted score is an integer equality).** Under E1–E4, let
$t=\sum_{j=0}^7 2^j\operatorname{rep}(d_j)$. Then
$t=\operatorname{rep}(T)=s(x)+128\in[45,195]$.

**Proof.** L1 applied to E4 gives $0\le t\le255$ and $T=\iota(t)$.
E3 and L3 give $T=\iota(s(x)+128)$, where $s(x)+128\in[45,195]$.
Therefore $p$ divides $t-(s(x)+128)$. This difference lies in
$[-195,210]$, whose only multiple of $p$ is zero. Thus the two integers are
equal. They lie below $p$, proving the representative claim too. $\square$

The bound on the *difference* rules out a malicious eight-bit alternative, not
just overflow in an honestly generated score. Without E1, the bound on $s(x)$
would be unavailable and this lifting argument would not apply.

## 4. Threshold and Boolean classification

**Lemma L5 (sign gadget, including zero).** E1–E5 imply
$y=\iota(\mathbf1[s(x)\ge0])$.

**Proof.** Write $t=128D+L$, where $D=\operatorname{rep}(d_7)\in\{0,1\}$
and $L=\sum_{j=0}^6 2^j\operatorname{rep}(d_j)\in[0,127]$.
If $D=0$, then $t<128$; if $D=1$, then $t\ge128$. These exhaust the
Boolean cases. By L4, $t\ge128$ is equivalent to $s(x)\ge0$. E5 ties $y$
to $d_7$, giving the result. The explicit public-label Boolean equation is
satisfied; it is redundant once the bit constraints and equality hold.
In particular, $s=-1,0,1$ gives $t=127,128,129$ and labels $0,1,1$.
No strict-positive interpretation is possible at zero. $\square$

## 5. The hash graph and shared input

**Definition H1 (the exact optimized function).** Fix the width-7 arrays
$K[0..118]$, $B[0..818]$, $M[0..6][0..6]$, and $P[0..6][0..6]$ from
`POSEIDON_C`, `POSEIDON_S`, `POSEIDON_M`, and `POSEIDON_P` in the
[pinned source](https://github.com/iden3/circomlib/blob/35e54ea21da3e8762557234298dbb553c175ea8d/circuits/poseidon_constants.circom).
All operations in this subsection are in $F$. Define

$$A_k(v)_i=v_i+K[k+i],\qquad \Phi(v)_i=v_i^5,
\qquad L_N(v)_i=\sum_{j=0}^6 N[j][i]v_j.$$

For partial round $r$, define a sparse linear map

$$L^{(r)}_B(v)_0=\sum_{j=0}^6 B[13r+j]v_j,$$
$$L^{(r)}_B(v)_i=v_i+B[13r+6+i]v_0\quad(1\le i\le6).$$

For a six-element input $z$, evaluate this fixed, acyclic schedule in order:

1. $v\gets A_0((0,z_0,z_1,z_2,z_3,z_4,z_5))$.
2. For $r=0,1,2$: $v\gets L_M(A_{7(r+1)}(\Phi(v)))$.
3. $v\gets L_P(A_{28}(\Phi(v)))$.
4. For $r=0,\ldots,62$: let $q_0=v_0^5+K[35+r]$ and $q_i=v_i$ for
   $1\le i\le6$, then $v\gets L^{(r)}_B(q)$.
5. For $r=0,1,2$: $v\gets L_M(A_{98+7r}(\Phi(v)))$.
6. Let $q=\Phi(v)$ and return $H(z)=\sum_{j=0}^6 M[j][0]q_j$.

This is eight full S-box layers and 63 partial layers, with exactly the matrix
orientation and constant placement of the
[pinned optimized circuit](https://github.com/iden3/circomlib/blob/35e54ea21da3e8762557234298dbb553c175ea8d/circuits/poseidon.circom).
The theorem uses this specified function directly. It does not require a proof
that a differently scheduled Poseidon implementation is equivalent; comparisons
with the JavaScript reference are supporting tests.

**Lemma L6 (functional hash constraints).** For every input $z\in F^6$, the
internal hash component used in E6 admits exactly one assignment to its internal
signals, and its output is $H(z)$.

**Proof.** A `Sigma` component constrains $v_2=v^2$, $v_4=v_2^2$, and
$o=v_4v$. These determine the internal signals uniquely and force $o=v^5$.
Each `Ark`, `Mix`, `MixS`, and `MixLast` equation sets an output equal to the
fixed affine or linear expression in H1. Wiring equations equate component
inputs with already determined signals, including the capacity value zero.
Induct along H1's finite schedule: all inputs to a step have unique values;
its defining equations then force its outputs and intermediates. Direct
evaluation supplies those values, establishing existence as well as uniqueness.
The final wrapper selects coordinate zero. No inverse, matrix invertibility,
collision-resistance, or cryptographic assumption is needed for this lemma.
$\square$

**Lemma L7 (same-input commitment).** E1 and E6 imply
$C=H(1,\iota(x_0+8),\ldots,\iota(x_3+8),r)$ for the same decoded $x$ used
in L3–L5.

**Proof.** The wrapper fixes hash input zero to the field constant 1, inputs
1–4 to the very same $u_i$ wired into the classifier, input 5 to $r$, and
the output to $C$. Substitute L2 and apply L6. An independently chosen hash
vector would violate these wiring equalities. $\square$

Salt ranges need no bit gadget: the statement quantifies over all $r\in F$.
Uniformity, secrecy, and freshness of an honest salt are separate requirements
for privacy, not satisfiability conditions that the circuit can enforce.

## 6. Proof of the main theorems

**Proof of T1.** Take any satisfying assignment, without assuming it came from
the witness generator. L1–L2 construct its unique decoded $x\in D$. L3 gives
its score, L4 lifts its shifted score to the intended integer, and L5 gives its
label. L7 gives the commitment to that same $x$ and the assignment's salt $r$.
These supply the witnesses to $R(C,y)$. $\square$

**Proof of T2.** Fix any $x\in D$ and any $r\in F$. Set
$u_i=\iota(x_i+8)$ and choose the four-bit binary digits of each $x_i+8$.
They satisfy E1 by L1's converse. Set $S=\iota(s(x))$ and
$T=\iota(s(x)+128)$, which satisfy E2–E3 by direct substitution.
L3 gives $s(x)+128\in[45,195]\subset[0,255]$, so its ordinary eight-bit
expansion satisfies E4. Its high bit equals $f(x)$ by the argument of L5;
set $y=\iota(f(x))$ to satisfy E5. Evaluate H1 on $(1,u_0,u_1,u_2,u_3,r)$
and set every internal hash signal and wire copy to its computed value. L6 and
the stipulated $C$ ensure E6. This constructs a full satisfying assignment.
If $R(C,y)$ holds, use its particular $x,r$ to apply this construction.
Together with T1 this proves the stated equivalence. $\square$

For fixed valid input wires and salt, these arguments also force the score,
bits, hash intermediates, commitment, and label. They do not make the inverse
map from a public statement to an opening injective.

## 7. Quantization corollary and reference interpretation

**Lemma L8 (exact rounding semantics).** For positive integer $K$ and rational
$z$, $Q_K(z)=\lfloor Kz+1/2\rfloor$ is the unique integer $q$ with
$q-1/2\le Kz<q+1/2$. In particular, a tie $Kz=m+1/2$ rounds to $m+1$,
including negative ties.

**Proof.** The defining floor inequalities are
$q\le Kz+1/2<q+1$; subtract $1/2$. At the tie the floor argument is
the integer $m+1$. For exact text parsed as $z=N/D$ with $D>0$, the reference
sets $a=2KN+D$, $d=2D$, and computes $\lfloor a/d\rfloor$.
Truncating integer division already equals floor when $a\ge0$ or $d$ divides
$a$. Otherwise $a<0$ with a nonzero remainder, so subtracting one from the
truncated quotient is exactly floor. This is the correction in `quantize`.
$\square$

For $K=4$, the accepted scalar raw interval is exactly
$-8\le\lfloor4z+1/2\rfloor\le7$, equivalently
$-8\le4z+1/2<8$, hence $z\in[-17/8,15/8)$.
For accepted $x_i=Q_4(z_i)$, write $\widehat z_i=x_i/4$ and use
$a=(3/4,-1/2,1/4,1)$, $\beta=-5/16$. Then

$$a^\top\widehat z+\beta=\frac{3x_0-2x_1+x_2+4x_3-5}{16}
=\frac{s(x)}{16}.$$

Division by the positive number 16 preserves sign, so the proven classifier
matches this rational model evaluated on the **quantized features**. Quantization
is outside E1–E6: the proof neither links $x$ to a hidden raw measurement nor
guarantees agreement with the model evaluated at the original $z$.

`classify`, `encodeInput`, and `decodeScore` in the
[reference](../src/reference.js) implement the formulas used in L2–L5. Canonical
parsers reject external strings representing $p$, negative residues, leading
zeros, and non-Boolean labels. A field relation itself cannot distinguish two
external integers differing by $p$; canonical transport is an API obligation.

## 8. From constraints to an inference proof

Theorems T1–T2 concern a mathematical relation. Applying them to the shipped
Groth16 verifier requires the correspondence and assumptions recorded in the
[constraint audit](constraint-audit.md): the designated O1 artifact implements
this relation, the selected key belongs to it, and the application verifies the
expected canonical $(C,y)$ with a correct proof-system implementation.

Under an appropriate Groth16 knowledge-soundness assumption and valid trusted
setup, an efficient prover's accepted proof yields, through the assumed
extractor, a satisfying witness except with the soundness error. T1 then gives
the intended relation for that witness. This is a conditional computational
statement, not a deterministic assertion that every byte string accepted by a
verifier must have a witness. Completeness of the cryptographic proof protocol
is separate from T2's existence of a constraint witness.

To identify the extracted opening with a previously chosen opening, one further
uses computational commitment binding. Two distinct ordered preimages with the
same $H$ output constitute a collision; their mathematical impossibility is not
claimed. Witness privacy additionally needs proof-system zero knowledge and the
salted commitment's hiding assumption. Collision resistance alone does not
establish hiding. The local single-machine setup has no demonstrated independent
ceremony or secure entropy-erasure guarantee. None of these cryptographic
properties is proved here, and no authentic-data, replay-prevention, real-world
accuracy, or raw-model-fidelity theorem is asserted.
