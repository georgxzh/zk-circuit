# Stage 0 translation-checker contract

This is a bounded feasibility prototype, not a validator for Circom artifacts.
It tests a conservative certificate discipline motivated by the repository's
[O0 audit and O1 assurance gap](constraint-audit.md). No novelty is claimed.
The implementation is [checker.js](../research/translation-stage0/checker.js);
the results and decision gate are in the [Stage 0 report](translation-stage0-report.md).

## Systems and public statements

A system is a plain, JSON-shaped object with exactly these keys:

```js
{
  p: 5,                 // prime, 2 <= p <= 251
  nVars: 3,             // 1 <= nVars <= 8, including wire zero
  public: ['a'],        // distinct nonempty coordinate identifiers, in order
  rows: [              // at most 64 R1CS rows
    [[[2, 1]], [[1, 1]], []] // t * a = 0
  ]
}
```

Each row is `[A,B,C]`, meaning `A(w)*B(w)=C(w)` over F_p. A linear
combination is an array of `[wire,coefficient]` pairs. Indices must be in range,
coefficients must be nonzero canonical residues, and wires cannot repeat within
one combination. The empty combination is zero. Arrays must be dense; unexpected
object keys are rejected. Inputs are ordinary data, not hostile JavaScript
objects with getters, proxies, or mutated built-in prototypes.

Wire zero is **always 1**, never a freely quantified variable. With `k` public
coordinates, wires `1..k` are public and wires `k+1..nVars-1` are private.
`public` is the caller-supplied interface manifest; this prototype cannot
authenticate its correspondence to compiler symbols, public inputs versus
outputs, or a verifier's ABI.

For a system S, define its public existential relation by

\[
R_S=\{u\in\mathbb F_p^k:\exists z,\ S(1,u,z)\}.
\]

Source and target must have the same prime and the same ordered public
identifiers. Witnesses contain all wires, including the leading 1, as canonical
residues. Small bounds make all JavaScript Number arithmetic exact: products
are at most 250 squared, and polynomial accumulation reduces modulo p at each
step. These bounds must not simply be raised to accommodate BN254.

## Certificate language

A certificate has exactly `version: 1`, `steps`, and `targetToSource`:

```js
{
  version: 1,
  steps: [
    {kind: 'alias', wire: 2, to: 3, row: 0},
    {kind: 'alias', wire: 3, to: 1, row: 1},
    {kind: 'constant', wire: 4, value: 1, row: 2}
  ],
  targetToSource: [0, 1]
}
```

An alias or constant step eliminates a private source wire. Its `row` cites a
source row index, kept stable throughout replay. **The current row, after all
earlier substitutions**, must be a nonzero scalar multiple of `wire-to=0` or
`wire-value=0`. Checking only that the residual system matches after a proposed
substitution is insufficient. Alias coefficients other than 1 and general
affine substitutions are outside this certificate language.

An alias dependency must still be active at that step; it may be eliminated
later. Out-of-range dependencies, references to previously eliminated wires,
cycles, self aliases, and duplicate eliminations are rejected. Wire zero cannot
be an alias destination; use an explicit constant step. Constant values include
zero. A cycle is rejected even when the endpoint systems happen to be equivalent.

The third step form is `{kind:'unused',wire:i}`. It eliminates a private wire
only if that wire occurs in no current polynomial after expansion and collection
of terms. Reconstruction chooses zero for it. This is not a claim that the
source implies that wire equals zero, or that the original private witness can
be recovered.

`targetToSource[j]` identifies the retained source wire represented by target
wire j. The array must be total and injective, cover exactly the active source
wires, and fix indices `0..k` pointwise. Private retained wires may be permuted.
Public equalities and public constants remain constraints; their coordinates
cannot be merged, eliminated, swapped, or reintroduced with different positions.

## Residual check and return value

The checker expands each row to `A*B-C`, using wire zero as the constant
monomial. It replays validated substitutions in every row, then renames retained
coordinates. A row is normalized by its first nonzero coefficient. Source and
target must have the same multiset of normalized nonzero polynomials.

This tolerates row ordering, factor swapping, nonzero scalar multiples, and
identically zero rows. It preserves multiplicity: deleting a redundant duplicate
row is deliberately rejected. It does not solve polynomial implication or
general equivalence. Polynomial identity is sufficient, not necessary, for
equality of zero sets over a finite field.

Acceptance returns `{accepted:true, project, lift}`. Projection selects retained
coordinates. Lifting fills them and reverses the elimination steps, copying alias
dependencies, assigning constants, and assigning zero to unused wires. The
functions snapshot their validated inputs. They check witness shape, residues,
and wire zero; they **do not test constraint satisfaction**. Their semantic
guarantee is conditional on the input witness satisfying its system.

Expected validation failures return `{accepted:false, code, reason}`. Unexpected
implementation errors throw; callers must not treat an exception as acceptance.
Rejection is a failure of this certificate/checker contract, not a proof that
the public relations differ.

## Acceptance claim and written argument

**Claim about the described algorithm.** For well-formed S, T and a certificate
accepted under this contract, with projection P and reconstruction L:

\[
\begin{aligned}
S(w)&\Rightarrow T(P(w)),\\
T(v)&\Rightarrow S(L(v)),\\
P(L(v))&=v,\\
\pi_{pub}(P(w))&=\pi_{pub}(w),\qquad
\pi_{pub}(L(v))=\pi_{pub}(v).
\end{aligned}
\]

Here witnesses have fixed leading 1 and appropriate lengths, and the last two
identities apply on their respective domains. Consequently `R_S = R_T`.
Neither `L(P(w))=w` nor unique private witnesses is required.

Proof argument: a checked pivot forces the proposed alias or constant on every
satisfying assignment of the current system. Substitution therefore gives a
projection to the next system and a reconstruction back to the current system.
An unused coordinate affects no equation, so it can be dropped and filled
arbitrarily. These steps compose in forward order for projection and reverse
order for reconstruction. The dependency rule makes reverse reconstruction
defined. Equality of the normalized residual multisets gives identical
constraints up to nonzero scaling, while discarded zero polynomials impose no
restriction. The final bijection of retained coordinates preserves satisfaction.
Pointwise identity of the constant and public prefix proves the interface
claims and hence equality of the public existential relations.

This is a **written mathematical argument**, not a machine-checked proof of the
JavaScript implementation. Tests provide executable evidence for that
implementation. Correct parsing of real artifacts, binding to their hashes and
public ABI, compiler certificate extraction, and the larger-field arithmetic
implementation are not delivered by Stage 0.

## Independent exhaustive oracle

[oracle.js](../research/translation-stage0/oracle.js) imports no checker code.
It enumerates every assignment with leading 1, directly evaluates the supplied
R1CS products, and collects their ordered public tuples. It assumes a well-formed
prime-field fixture; it is not another malformed-input parser. Enumeration is
limited to 100,000 assignments per system. Budget exhaustion throws rather than
returning a partial relation.

`compareRelations` returns equivalence, relation sizes, and source-only and
target-only tuples. Thus tests report certificate rejection separately from
exhaustively demonstrated semantic inequivalence. The oracle and checker still
share JavaScript's runtime, the supplied fixtures, and the interface convention;
independence here means separate evaluation algorithms, not separate verified
implementations or proof kernels.

## Crucial negative example

For source `t*a=0`, private t and public a, the proposed certificate `t=1`
would produce target `a=0`. The target lifts to source witnesses `(a,t)=(0,1)`,
but the source permits every a by taking t=0. Checking only lifting or substituted
row equality would miss this loss of valid public statements.

The checker rejects the certificate: the source row is not a nonzero scalar
multiple of `t-1`. Over F_5, the independent oracle finds source relation
`{0,1,2,3,4}` and target relation `{0}`. In particular `(a,t)=(1,0)` is a
satisfying source witness whose public statement has no target witness.
