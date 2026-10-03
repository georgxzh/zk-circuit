# Benchmark results: 2026-10-03

These are measurements from one completed local run of the version-1 circuit.
The [methodology](benchmarks.md) defines timing boundaries, repetitions, memory,
and serialization. The [sanitized JSON summary](benchmark-summary.json) retains
full statistics, per-fixture values, source hashes, and artifact identities.

## Host and circuit

- CPU: AMD Ryzen 9 PRO 8945HS w/ Radeon 780M Graphics; 16 logical CPUs.
- OS: Windows_NT 10.0.26200, x64.
- OS-reported RAM: 61.78 GiB.
- Node.js 26.3.1, npm 11.16.0, Circom 2.2.3, snarkjs 0.7.6.
- Observed snarkjs prover concurrency: 16 in each of three processes.
- Production circuit: O1, **999 constraints** (382 nonlinear + 617 linear),
  999 witness wires, two public inputs, five private inputs, no public outputs.
- Commitment: pinned Poseidon(6); proof system: Groth16/BN254; setup power: 11.
- Run started: 2026-10-03T16:11:45.322Z.
- Source base: `c425fa79df63c17fe72acd407d8a2fd308f8c224`; benchmark source hashes are in the JSON.

All five native compilations reproduced the selected R1CS and WASM hashes.
Three fresh benchmark setups validated successfully without changing the selected
application key. A preliminary run that overlapped correctness tests was stopped
and discarded; the reported run began after those tests and workers had finished.
Other host workloads and OS scheduling were not controlled.

## Compilation and setup

Values below are milliseconds. Each observation uses a fresh process. Setup core
includes fresh contributions and transcript/key validation; it excludes explicit
artifact loading, curve initialization, and filesystem persistence.

| Operation | n | Median ms | IQR ms | Min–max ms |
| --- | ---: | ---: | ---: | ---: |
| Compile O1 with R1CS/WASM/symbol/JSON output | 5 | 1431.41 | 42.43 | 1391.85–1468.77 |
| Complete demonstration setup core | 3 | 14740.50 | 262.74 | 14254.68–14780.16 |
| Setup worker, spawn through exit | 3 | 15538.02 | 245.64 | 15077.50–15568.77 |

Breakdown of setup core; medians of components need not sum to the median total:

| Operation | n | Median ms | IQR ms | Min–max ms |
| --- | ---: | ---: | ---: | ---: |
| Create accumulator | 3 | 131.78 | 26.99 | 126.74–180.72 |
| Contribute to transcript | 3 | 917.32 | 193.02 | 866.17–1252.21 |
| Prepare phase 2 | 3 | 10197.93 | 243.98 | 9881.78–10369.74 |
| Validate transcript | 3 | 1161.66 | 92.31 | 1031.86–1216.48 |
| Create circuit key | 3 | 983.27 | 44.51 | 927.18–1016.21 |
| Contribute to circuit key | 3 | 95.58 | 2.13 | 91.92–96.17 |
| Validate key against R1CS | 3 | 1078.22 | 21.26 | 1039.91–1082.44 |
| Export verification key | 3 | 7.39 | 0.08 | 7.28–7.44 |

Phase-2 preparation is the largest setup component in this run. These costs
describe a local research setup, not an independently contributed production
ceremony. They are not per-inference costs.

## Inference operations

Cold means first call after explicit initialization in a fresh worker. Warm
means after one discarded nine-fixture cycle. There are three cold positive
calls and 81 warmed calls across nine fixtures and three processes per operation.

| Operation | n | Median ms | IQR ms | Min–max ms |
| --- | ---: | ---: | ---: | ---: |
| Witness generation (cold) | 3 | 82.77 | 16.06 | 53.81–85.93 |
| R1CS check (cold) | 3 | 26.15 | 3.13 | 20.23–26.49 |
| Groth16 prove (cold) | 3 | 117.77 | 11.88 | 94.03–117.80 |
| Application verify (cold) | 3 | 27.52 | 12.07 | 13.72–37.87 |
| Witness generation (warm) | 81 | 81.85 | 24.60 | 41.24–112.87 |
| R1CS check (warm) | 81 | 24.36 | 11.76 | 13.34–39.44 |
| Groth16 prove (warm) | 81 | 72.95 | 8.41 | 40.21–117.11 |
| Application verify (warm) | 81 | 12.05 | 7.43 | 7.19–21.57 |

Proof-generation timing excludes witness creation, constraint checking, and
self-verification. Application verification includes canonical parsing and the
expected-statement/key guard. These are not full CLI request latencies. In this
run, witness generation is comparable to proving, and warmed results still show
substantial variation. No throughput or concurrency scaling is inferred.

Initialization is separate:

| Operation | n | Median ms | IQR ms | Min–max ms |
| --- | ---: | ---: | ---: | ---: |
| Prover artifact loading and hashing | 3 | 7.51 | 1.11 | 7.49–9.70 |
| Prover curve/worker initialization | 3 | 246.63 | 32.93 | 200.12–265.99 |
| Verification session initialization | 3 | 199.88 | 11.99 | 182.27–206.25 |

Warm medians by fixture (nine observations each):

| Fixture | Prove ms | Verify ms |
| --- | ---: | ---: |
| positive | 72.37 | 11.20 |
| negative | 75.92 | 11.99 |
| zero | 73.53 | 11.06 |
| minus-one | 77.53 | 10.69 |
| plus-one | 71.73 | 11.40 |
| all-minimum | 71.08 | 12.38 |
| all-maximum | 73.53 | 13.05 |
| minimum-score | 70.87 | 12.55 |
| maximum-score | 70.34 | 13.35 |

## Serialized sizes

Compact UTF-8 JSON without whitespace/newline; proof bytes exclude public inputs.

| Item | n | Median bytes | IQR bytes | Min–max bytes |
| --- | ---: | ---: | ---: | ---: |
| Proof object only | 81 | 723.00 | 2.00 | 717.00–726.00 |
| Public-input array | 81 | 84.00 | 1.00 | 84.00–85.00 |
| Full application packet | 81 | 925.00 | 2.00 | 920.00–929.00 |

Fresh setup buffers were 2,360,770 bytes for the prepared transcript and
421,358 bytes for the contributed proving key in every setup. Compact
verification-key JSON ranged from 2757 to 2760 bytes. Generated keys and proofs are not committed.

## Process memory

Process-lifetime peak RSS/Windows working set, including snarkjs worker threads.
Values are MiB (2^20 bytes). Each observation covers an entire fresh worker.

| Worker | n | Median MiB | IQR MiB | Min–max MiB |
| --- | ---: | ---: | ---: | ---: |
| Setup and validation | 3 | 408.83 | 5.35 | 401.78–412.48 |
| Witness/check/prove/self-verify batch | 3 | 526.20 | 4.05 | 521.45–529.56 |
| Verification-only batch | 3 | 329.76 | 3.54 | 323.04–330.13 |

These are total resident high-water marks, not incremental memory per proof.
Prover memory includes untimed self-verification. The verifier worker does not
load proving material. Native compiler and coordinator memory were not measured;
child-process memory is excluded. The values therefore do not estimate the peak
memory of the complete benchmark process tree.

## Interpretation limits

The small number of process repetitions and correlated warm samples support a
local descriptive baseline only. CPU scheduling, thermal state, caches, background
work, and garbage collection remain uncontrolled. Fixed fixture ordering can
confound per-fixture differences; these values are not a side-channel study.
There is no performance claim for larger dimensions, different models, other
proof systems, browsers, or production ceremonies. The setup and formal-proof
assumptions described in earlier phases continue to apply.
