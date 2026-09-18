# Phase 2 review

## Delivered

- Exact `BigInt` classifier and rational quantizer with explicit halfway behavior.
- Strict input, encoded-input, field, score, and public-signal validation.
- Pinned salted Poseidon commitment, fresh salt generation, and local opening check.
- A stdin-based CLI that emits decimal strings and limits statements to public signals.
- Dependency lockfile, source provenance checks, public synthetic commitment vectors,
  and automated arithmetic, commitment, and CLI tests.

The version-1 mathematical specification and model constants are unchanged.

## Validation

The 21 automated tests passed after a clean `npm ci` installation from the
lockfile under Node.js 26.3.1 / npm 11.16.0 on Windows.
The suite covers all 65,536 feature vectors, all 930 zero scores, the nine
classifier fixtures, eight quantization fixtures, and 30,075 exact quantization
inequalities. It also checks invalid encodings and public signals, malformed
integer/rational inputs, wrong labels, altered commitments and openings, caller
input mutation, CLI failures, and rejection sampling of salts.

Both pinned Circom file hashes match the Phase 1 upstream revision. All 1,036
optimized width-7 constants match between Circom and JavaScript. The reference
and optimized JavaScript hashes agree on nine fixed vectors and 32 additional
deterministic cases. This checks compatibility; it is not a hash-security proof.

## Scope and next gate

No project circuit, compiled constraints, proving keys, or proof-generation code
was created. circomlib is installed only as ignored dependency source for the
Phase 2 compatibility check. All committed salts are explicitly public synthetic
test data. Generated dependencies, caches, private data, and build outputs remain
ignored.

After committing and pushing Phase 2 to `main`, stop. Phase 3 (circuit
implementation) requires the user's explicit approval.
