# Formal correctness of Pedersen inference (EC5)

This is the written proof permitted by the project plan. It establishes
soundness and constructive completeness of the specified field constraints.
The [artifact audit](pedersen-constraint-audit.md) separately connects those
constraints to the exact EC3 O0 and EC4 production O1 binaries. It is not a
proof-assistant development or a proof of cryptographic security.

## 1. Mathematical premises and theorem

Use the constants $p,\ell,a,d,G,H$ fixed in the
[EC specification](pedersen-specification.md). Let $F=\mathbb F_p$,
$\iota(z)=z\bmod p$, and $\operatorname{rep}:F\to[0,p-1]\cap\mathbb Z$.
All inequalities below are integer inequalities. Let

$$D=\{-8,\ldots,7\}^4,\quad
s(x)=3x_0-2x_1+x_2+4x_3-5,\quad
f(x)=\mathbf1[s(x)\ge0],\quad
m(x)=\sum_{i=0}^3 16^i(x_i+8).$$

The mathematical premises are:

1. $p$ and $\ell$ are prime, $p$ is odd, and the selected curve has order
   $8\ell$. These published parameters are not supplied with primality or
   point-count certificates in this repository.
2. $a=168700$, $d=168696$ are nonzero and distinct; $a$ is square and $d$
   nonsquare in $F$. Exact modular exponentiation in the parameter audit checks
   their Euler criteria, conditional on the field premise.
3. The affine points of $E: aX^2+Y^2=1+dX^2Y^2$, with the complete twisted
   Edwards law, form a group with $O=(0,1)$. We import the established addition
   and completeness theorem, stated in Peters,
   [Theorem 1.18 and Remark 1.19, printed p.14](https://pure.tue.nl/ws/portalfiles/portal/3252134/711052.pdf#page=27).
   Under the square/nonsquare conditions, both denominators are nonzero for
   every pair of curve points; identity, doubling, and cancellation are included.
4. $G,H$ are the specified nonidentity points with $[\ell]G=[\ell]H=O$.
   Independent arithmetic in the EC1 audit verifies these concrete identities.
   With the prime-order premise, both have order $\ell$ and generate the
   unique order-$\ell$ subgroup $K\subset E(F)$.

The public relation for $C_X,C_Y,y\in F$ is

$$R(C_X,C_Y,y)\iff
\exists x\in D,\ r\in\{0,\ldots,\ell-1\}:
(C_X,C_Y)=[m(x)]G+[r]H\ \land\ y=\iota(f(x)).$$

Let $\mathcal C(C_X,C_Y,y;W)$ be **all** source equations in Section 2, including
intermediate multiplications, Boolean equations, and component wiring.
$W$ contains the private encoded features, scalar, and all auxiliary signals.

**Theorem.** Under the mathematical premises, for every public triple,

$$\exists W:\mathcal C(C_X,C_Y,y;W)\quad\Longleftrightarrow\quad R(C_X,C_Y,y).$$

More precisely, every satisfying assignment decodes to a unique bounded feature
vector and canonical scalar *within that assignment*, with the specified
commitment and label. Conversely every permitted opening $(x,r)$ extends to
a satisfying assignment for its correct public triple. No randomness, discrete
logarithm hardness, compiler behavior, or witness-generator honesty is assumed
in this field-relation theorem.

## 2. Exact field relation

All equalities in this section are in $F$. The constant wire is 1.

**B — Decompositions.** Every instance $\operatorname{Bits}_n(v;b)$ enforces
$b_j(b_j-1)=0$ and $v=\sum_{j=0}^{n-1}2^j b_j$.
Use four 4-bit decompositions on $u_i$, a 16-bit decomposition on $m$,
a 251-bit decomposition on $r$, an 8-bit decomposition on $T$, and
a 252-bit decomposition on $q$.

**I — Integer relation and packing.**

$$S=3u_0-2u_1+u_2+4u_3-53,\quad T=S+128,\quad
y=T_7,\quad y(y-1)=0,$$

$$m=u_0+16u_1+256u_2+4096u_3.$$

The four top-level $u_i$ are linked to the classifier's four inputs.
The classifier label is linked to the public label. Each decomposition's
input is linked to the corresponding signal; there is no second feature vector.

**R — Strict scalar comparison.** Write $B=2^{251}$.
The comparator inputs are linked to $r$ and the literal $\ell$.
It enforces $q=r+B-\ell$, $o=1-q_{251}$, and $o=1$.
The literal $\ell$ is a known bounded constant, not an unconstrained input.

**M — Fixed-base multiplication.** For $(n,P)=(16,G)$ and $(251,H)$, let
$P_j=[2^j]P$ be fixed constants. Link the $n$ input bits to the appropriate
message/scalar decomposition and additionally constrain each bit to be Boolean.
For $0\le j<n$:

$$A_0=O,\quad Q_{j,X}=b_jP_{j,X},\quad
Q_{j,Y}=1+b_j(P_{j,Y}-1),\quad
A_{j+1}=\operatorname{Add}(A_j,Q_j).$$

Both coordinates of each accumulator, selected point, and component input/output
are linked by equations. Each multiplier's output is $A_n$. The fixed doubles
are computed at compilation and checked independently against the above
recurrence; compile-time checks are not used as witness constraints.

**A — Actual BabyAdd equations.** For inputs $(x_1,y_1),(x_2,y_2)$ and
outputs $(z_x,z_y)$, the gadget constrains

$$\beta=x_1y_2,\quad \gamma=y_1x_2,\quad
\delta=(-a x_1+y_1)(x_2+y_2),\quad \tau=\beta\gamma,$$
$$(1+d\tau)z_x=\beta+\gamma,\quad
(1-d\tau)z_y=\delta+a\beta-\gamma.$$

There are four product equations and two cross-multiplied division equations.
A division hint alone is not part of this relation.

**C — Public commitment.** Add the two multiplier outputs with the same
six-equation gadget. Constrain its X and Y outputs separately to $C_X,C_Y$.
These are public inputs, with $y$ third; there are no public outputs.

## 3. Boolean decoding and field-to-integer lifting

**Lemma 1 (bounded decomposition).** In a field, $b(b-1)=0$ implies
$b=0$ or $1$, since there are no zero divisors. If $2^n<p$, a sum of $n$
Boolean bits is an integer in $[0,2^n-1]$, strictly below $p$. Its field image
therefore has exactly that canonical representative. Binary expansion in that
interval is unique. The largest decomposition here has $n=252$, and
$2^{252}<p$, so the lemma applies to every instance.

Thus $\operatorname{rep}(u_i)\in[0,15]$ and
$x_i=\operatorname{rep}(u_i)-8$ is the unique corresponding element of $[-8,7]$.
This decoding is offset binary, not two's complement.

**Lemma 2 (packing).** The integer sum $M=\sum_i16^i\operatorname{rep}(u_i)$
lies in $[0,65535]$. The field packing equation gives $m=\iota(M)$.
Since $65535<p$, its canonical representative is $M$ and its 16-bit expansion
is unique. If two such sums are equal, reducing modulo 16 fixes $u_0$.
Subtract it, divide by 16, and repeat to fix all four digits. Hence the packing
is injective. Since $65535<\ell$, it is also injective as a scalar modulo $\ell$.
Uniqueness of binary expansion forces the message bits to be the four
little-endian feature-bit blocks, even though separate bit wires are used.

**Lemma 3 (canonical scalar).** Let $R=\operatorname{rep}(r)$.
Lemma 1 gives $0\le R<B$. The comparator's ordinary integer difference is

$$B-\ell\le Q=R+B-\ell\le 2B-\ell-1.$$

Since $0<\ell<B$, this interval lies strictly between 0 and $2B=2^{252}<p$.
The 252-bit output decomposition also has integer sum in $[0,2B-1]$.
The field equation for $q$ therefore equates two integers below $p$ and
forces that sum to equal $Q$. The constraints $o=1-q_{251}=1$ imply
$q_{251}=0$, hence $Q<B$, equivalently $R<\ell$.

Conversely, for every $0\le R<\ell$, $Q=R+B-\ell$ lies in $[B-\ell,B-1]$,
so its 252-bit expansion has high bit zero and satisfies the comparator.
The strict boundary is necessary: $R=\ell$ gives $Q=B$ and high bit one.
The scalar and comparator decompositions are unique for each allowed $R$.

## 4. Signed score and threshold

**Lemma 4 (signed meaning).** Substituting $u_i=x_i+8$ into I gives
$S=\iota(s(x))$. Bounding each weighted feature yields exactly $-83\le s\le67$.
The canonical score residues are $[0,67]$ for nonnegative scores and
$[p-83,p-1]$ for negative scores. These sets are disjoint; decoding them by
$S$ or $\operatorname{rep}(S)-p$ is unambiguous.

No claim is made that a negative score's field representative is a negative
integer. The ring homomorphism $\iota$ makes the affine field computation agree
with the intended integer result modulo $p$.

**Lemma 5 (threshold).** The integer $s+128$ lies in $[45,195]\subset[0,255]$.
The equation $T=S+128$ gives $T=\iota(s+128)$. By Lemma 1 its eight-bit
decomposition equals that integer, so its high bit is one exactly when
$s+128\ge128$, equivalently $s\ge0$. The label equations force
$y=\iota(f(x))$ and a Boolean label. At $s=-1,0,1$ the shifted values are
127,128,129 and labels are 0,1,1. The same four input wires establish the
score and packed message; separate valid vectors cannot satisfy those links.

## 5. Addition totality and fixed-base induction

**Lemma 6 (gadget correctness on its domain).** Suppose the two inputs to A
are curve points. Its four product constraints uniquely determine
$\beta,\gamma,\delta,\tau$. Expanding gives

$$\tau=x_1x_2y_1y_2,\qquad
\delta+a\beta-\gamma=y_1y_2-a x_1x_2.$$

By the imported completeness theorem, $1+d\tau$ and $1-d\tau$ are nonzero.
Consequently the two final equations uniquely determine

$$z_x=(x_1y_2+y_1x_2)/(1+d x_1x_2y_1y_2),\quad
z_y=(y_1y_2-a x_1x_2)/(1-d x_1x_2y_1y_2).$$

These are the group sum's coordinates. Conversely, taking those products and
the group sum satisfies all six equations. This proves both correctness and
totality on curve inputs. It does not assert anything about arbitrary coordinate
pairs supplied to an isolated BabyAdd gadget.

**Lemma 7 (fixed constants).** The specified base belongs to $K$.
At compile time each subsequent constant is obtained by the doubling instance
of Lemma 6, so induction gives $P_j=[2^j]P\in K$. This induction starts from
the actual fixed base. The artifact audit verifies every emitted selection
coefficient against independent doubling, so the implementation link does not
rely solely on the compiler's constant arithmetic.

**Lemma 8 (all-assignment domain invariant).** For any satisfying assignment,
the multiplier's linked bits are Boolean. Its selection equations force
$Q_j=O$ if $b_j=0$, and $Q_j=P_j$ if $b_j=1$; thus $Q_j=[b_j]P_j\in K$.
The initial accumulator equations force $A_0=O$.

Inductively assume $A_j=[\sum_{k<j}b_k2^k]P\in K$. Both inputs to the next
adder are now known curve points. Lemma 6 applies to the actual constraints,
forcing

$$A_{j+1}=A_j+Q_j=
[\sum_{k\le j}b_k2^k]P\in K.$$

This establishes the domain of the *next* operation before invoking its
correctness. It is not circular reasoning from a supposedly honest output.
It also rules out malicious choices of undefined division results: all
denominators are nonzero for every satisfying assignment.

At termination, the message multiplier equals $[M]G$ and the blinder multiplier
equals $[R]H$. The final adder likewise receives two subgroup points, so its
unique output is $[M]G+[R]H\in K$. Separate equality constraints on both public
coordinates force the public commitment to be this point. No additional
on-curve or subgroup test is necessary inside this particular construction.

Zero bits, zero scalars, and intermediate identities are included in the
induction. The same completeness theorem covers doubling and inverse
cancellation, including a final identity. In particular $m=r=0$ gives $O$.
For $m=0,r=\ell-1$ it gives $-H$. Other cancellation openings are not excluded.

## 6. Soundness and constructive completeness

**Soundness.** Take an arbitrary satisfying assignment. Lemmas 1 and 2 extract
a unique $x\in D$ and its packed integer $M=m(x)$. Lemma 3 extracts
$R\in[0,\ell-1]$. Lemmas 4 and 5 force the intended public label.
Lemmas 6–8 force the commitment to $[m(x)]G+[R]H$. These extracted values
witness $R(C_X,C_Y,y)$. Every step used constraints and mathematical premises,
not the witness generator.

**Completeness.** Fix any $x\in D$ and any $0\le R<\ell$. Set $u_i=x_i+8$,
$m=m(x)$, $r=\iota(R)$, $S=\iota(s(x))$, and $T=\iota(s(x)+128)$.
Assign each decomposition its ordinary binary expansion. Set
$q=\iota(R+B-\ell)$ with its 252-bit expansion, and $o=1$.
Lemmas 1–5 show that every range, packing, score, comparison, and label equation
is satisfied when $y=\iota(f(x))$.

For each multiplication, initialize $A_0=O$, select the dictated $Q_j$,
and assign every adder's four products and group-sum output as in Lemma 6.
The subgroup induction ensures every inverse used in this construction exists.
Copy each value along its constrained component links. Set the final public
coordinates to $[m(x)]G+[R]H$. All six final-adder equations and both coordinate
equalities hold. Every source signal has now been assigned; therefore
$\mathcal C$ holds. The construction works for all allowed inputs and blinders,
not only sampled fixtures.

For a fixed opening, the decompositions, products, and nonzero-denominator
equations also determine all source auxiliary values uniquely. This is not
uniqueness of an opening given only the public triple.

## 7. Exact compiled artifacts and optimization

The [audit report](pedersen-constraint-audit.md) accounts for all 4,865 O0 rows
against Section 2 and preserves the exact public prefix. Conditional on the
binary/symbol/source association and audit implementation, the theorem applies
to that O0 relation.

For the exact O0/O1 pair, the translation checker validates 1,889 unit aliases
and 10 constants. Each elimination has a current defining equation; no unused
wire is removed. It substitutes those equalities into all rows, then checks a
multiplicity-preserving bijection of all nonzero residual rows with the target.

To justify this transformation mathematically, an alias $v=u$ or constant
$v=c$ constrained by a nonzero-scaled linear pivot can be substituted in every
equation without changing solutions on retained coordinates. Projecting a
source solution satisfies the substituted equations. Conversely, restoring
$v$ to its defining value extends any solution of the substituted equations
to the original ones. Induct on the checked elimination order; restore in
reverse order. Removing a zero polynomial, multiplying a row by a nonzero
field scalar, and reordering equations preserve solutions. Matching
multiplicity additionally prevents the checker from overlooking missing rows.
The constant and three public coordinates are fixed throughout.

Thus the checked projection and reconstruction preserve satisfying assignments
in both directions and preserve the public triple. Combined with Sections 3–6,
this gives the same public existential relation for the exact 2,966-row O1
production circuit, conditional on correct execution of the checker and parser.
It is not a verified compiler implementation or certification of other builds,
O2 transformations, or unsupported affine eliminations.

## 8. Separate cryptographic and application claims

The field theorem does not require discrete-log hardness. Computational binding
of a previously chosen opening does. For different messages in the packing
range, two openings of one commitment imply

$$\log_G H=(m-m')(r'-r)^{-1}\pmod\ell.$$

Here $r'\ne r$ modulo $\ell$: otherwise $[m-m']G=O$, which contradicts
injective packing and $G$'s order. This reduction is conditional on an unknown
generator relationship and discrete-log hardness; it is not their proof.

For each fixed message, multiplication by the order-$\ell$ generator $H$
is a bijection from canonical scalars to $K$. Therefore uniform independent
secret $r$ makes the commitment uniform. Conversely, every $C\in K$ has one
mathematical opening scalar for *each* message; different messages need not be
efficiently openable. The public commitment does not uniquely determine the
feature vector or label. The proved claim concerns knowledge of a satisfying
opening, interpreted with computational binding when an opening was previously
selected.

The EC4 verifier's conclusion additionally depends on Groth16 knowledge
soundness, zero knowledge, appropriate setup, trusted key/profile selection,
canonical parsing, correct library/runtime behavior, and independently expected
public signals. The single-machine setup is research-only. Entropy, freshness,
source authenticity, replay prevention, and model accuracy are not enforced by
the circuit. The label is deliberately public.

Finally, the quantization corollary is unchanged: for accepted exact quantized
features $\widehat z_i=x_i/4$, the specified rational-model score is $s(x)/16$,
whose sign is the proved label. This does not establish fidelity to arbitrary
floating-point models or unobserved raw measurements.
