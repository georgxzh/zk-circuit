# Phase 6 review

Completed on 2026-10-03. All six planned phases are now complete, within the
research scope and assurance boundaries documented in the earlier phases.

## Delivered

- A pinned [benchmark protocol](../spec/benchmark.json) and sequential coordinator
  with isolated setup, prover, and verifier workers.
- Separate measurements for compilation, each setup operation, witness generation,
  R1CS checking, proof generation, verification, initialization, and batch lifetime.
- Precisely defined JSON proof/public-input/packet sizes and process memory.
- [Methodology](benchmarks.md), [measured results](benchmark-results.md), and a
  [sanitized machine-readable summary](benchmark-summary.json) with environment,
  provenance hashes, repetitions, median, mean, range, IQR, and sample deviation.
- Tests for summary arithmetic, quartile interpolation, and invalid observations.

The circuit, model, runtime proof API, dependency versions, and selected setup
are unchanged. The package version is 0.6.0. The benchmark command generates a
new ignored run directory and does not automatically publish its results.

## Validation and results

The complete `npm test` run passed **44 tests**: the previous 42 tests plus two
benchmark-statistics tests. Existing formal graph correspondence, exhaustive
arithmetic checks, honest proofs, and adversarial rejection tests all remain intact.

A completed benchmark run then executed five native compilations, three fresh
validated demonstration setups, three prover workers, and three independent
verification workers. Compiler outputs matched the selected R1CS and WASM hashes.
Benchmark setup randomness and keys remained in memory; the selected application
manifest was unchanged before and after the run.

The inference measurements include three first-call observations and 81 warmed
observations for each operation, with nine warmed observations per fixture.
Every generated witness was checked and every proof was self-verified. All 111
proof generations (including first calls and discarded warm-up) succeeded.
Verification workers performed 111 successful verification calls on retained
packets and additionally rejected a wrong expected label.

On the measured AMD Ryzen 9 PRO 8945HS Windows x64 host, medians were:

| Metric | Median |
| --- | ---: |
| Production constraints | 999: 382 nonlinear and 617 linear |
| Fresh O1 compilation, including output exports | 1.43 s |
| Fresh demonstration setup core, including validation | 14.74 s |
| Warm witness generation | 81.85 ms |
| Warm R1CS check | 24.36 ms |
| Warm Groth16 proof generation | 72.95 ms |
| Warm application verification | 12.05 ms |
| Compact proof JSON only | 723 bytes |

The full report gives ranges, dispersion, first-call values, initialization,
per-fixture results, artifact sizes, and peak-memory measurements. Performance
figures are descriptive measurements from one host, not universal guarantees.
The preliminary run that overlapped correctness tests was stopped and discarded;
the committed results come only from the subsequent completed run.

## Limitations and repository boundary

Memory is the Node worker's process-lifetime peak RSS/Windows working set,
including worker threads. It is not incremental per-call memory. Native compiler
and coordinator memory were not measured, and child-process memory is excluded.
The report explicitly records this coverage rather than substituting parent RSS
for compiler memory. OS caches, thermal behavior, scheduling, and unrelated host
activity were not controlled. Warm samples are correlated within three workers.

Proof bytes use actual compact snarkjs JSON, excluding public inputs and packet
metadata; no compressed representation is implemented. Setup timing excludes
disk persistence and measures the local demonstration procedure, not a production
ceremony. Benchmarking does not establish cryptographic security or remove the
formal proof's compiler and implementation assumptions.

Only benchmark source, tests, configuration, package metadata, and reviewed
sanitized documentation are committed. Raw runs, generated proof packets,
compiler outputs, witnesses, proving keys, and secrets remain outside Git.
After committing and pushing Phase 6 to `main`, stop. Any project extension
requires a new user instruction.
