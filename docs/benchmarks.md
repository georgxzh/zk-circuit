# Benchmark methodology

Phase 6 measures the existing version-1 circuit and proof implementation.
[benchmark.json](../spec/benchmark.json) fixes the protocol; the coordinator,
worker, and statistics code live in `scripts/benchmark*.js`. The measured
[results](benchmark-results.md) and sanitized [summary](benchmark-summary.json)
are committed separately from generated artifacts.

## Reproduce

Use the pinned Node.js 26.3.1, npm 11.16.0, and compiler from the repository root:

```sh
npm ci
npm run setup:circom
npm test
npm run benchmark
```

Wait for tests and other CPU-heavy tasks to finish before benchmarking. The
benchmark command first rebuilds all correctness targets and selects or reuses
the normal validated demonstration setup. These prerequisite steps are outside
the benchmark timers. It then invokes `scripts/benchmark.js`, which can also be
run directly when those prerequisites are current.

Each run writes to a new ignored `build/benchmarks/run-<suffix>/` directory.
`raw.json` contains observations; `summary.json` contains environment, source and
artifact hashes, protocol, counts, summaries, and per-fixture results. Public
synthetic proof packets used to feed separate verifier workers also stay there.
The script does not publish reports automatically or modify the selected setup.
Only a reviewed, completed run's sanitized summary belongs in documentation.
Interrupted runs are not combined with completed runs.

## Workloads and repetition

All workers run sequentially. The hash, model, input bounds, and public interface
are unchanged. Fixtures are the nine public synthetic vectors in
[commitment-vectors.json](../spec/commitment-vectors.json), in their existing order.
They cover positive, negative, zero, adjacent scores, all-minimum/all-maximum
inputs, and score extrema. Fixed synthetic salts are used only for repeatability
of these public fixtures; setup entropy and proof randomness are fresh.

| Workload | Protocol |
| --- | --- |
| Compilation | Five fresh native Circom processes, each with a new output directory, compiling only the production inference circuit |
| Setup | Three fresh Node processes; each builds a fresh power-11 transcript and circuit key with separate random contributions and validates both |
| Proving | Three fresh Node processes; each performs one first-call positive fixture, one discarded nine-fixture warm-up cycle, then three measured nine-fixture cycles |
| Verification | Three separate fresh Node processes; each loads only verification material, then uses the same first-call/warm-up/measured schedule on its paired prover's nine packets |

This yields three first-call observations per inference operation and **81
measured warmed observations** per operation, nine per fixture. Warm-up and
first-call observations are excluded from the warmed summaries. Each prover
process creates 37 proofs (1 + 9 + 27); all 111 proofs are self-verified.
Verifier workers perform 111 corresponding verification calls on retained
packets, including repeated verification of the same packet for each fixture.

“Cold” means the first measured operation after explicit initialization in a new
process. It does not mean an empty OS file cache, a reboot, or an empty disk
cache. The preparatory build and normal setup may already warm OS caches.
No cache flushing, CPU affinity, fixed frequency, forced garbage collection, or
host-wide workload isolation is applied. Cold inference calls all use the
positive fixture; their comparison with pooled warm calls also changes fixture
mix. Per-fixture warmed summaries are provided to expose that distinction.

## Timer definitions

Timers use monotonic `performance.now()` in milliseconds. Compiler wall time is
measured from spawning the native compiler through process close, including its
startup, input/output I/O, and the coordinator's pipe/exit handling. The exact
flags are `--O1 --prime bn128 --sanity_check 2 --r1cs --wasm --sym --json`, with
the same include paths as the normal build. Exporting JSON/symbols is included;
these are not minimum-output compilation measurements. Each resulting R1CS and
WASM must hash identically to the selected proof artifacts.

Setup is measured using the same snarkjs operations as the demonstration setup:
accumulator creation, random contribution, phase-2 preparation, transcript
validation, circuit-key creation, key contribution, key validation, and key
export. Each operation has its own timer. `setupCoreMs` spans all these steps,
including entropy creation, assertions, and brief progress logging between calls.
Artifact reads and curve/worker initialization are timed separately. No setup
keys or transcripts are persisted by benchmark workers. Filesystem persistence,
manifest publication, and independent ceremony/secure-erasure procedures are
outside this measurement.

| Metric | Timed work | Excluded work |
| --- | --- | --- |
| Witness | `wtns.calculate` on in-memory WASM and input, including calculator instantiation and in-memory WTNS construction | Artifact loading, fixture/input preparation |
| Constraint check | `wtns.check` against the binary R1CS and in-memory witness | Witness calculation and proving |
| Prove | `groth16.prove` using loaded key and checked witness buffers | Parsing, artifact hashing/loading, explicit curve initialization, witness generation, constraint checking, and self-verification |
| Verify | Actual `session.verify(packet, expectedSignals)` wrapper: canonical checks, expected-statement/key-identity matching, and pairing verification | Packet file reading and `openProofSession` initialization |
| Prover initialization | Artifact loading/hash checks and curve initialization, reported separately | Module import and process startup |
| Verifier initialization | `openProofSession`, including trusted manifest/key loading and curve initialization | Module import, process startup, and packet file reading |
| Worker process wall | Parent spawn through exit for the entire setup/prover/verifier workload | Coordinator startup and other workers |

The prove and verify rows have deliberately different boundaries: one isolates
the proving primitive, while the other measures the application verifier. Neither
is a single-request CLI latency. Worker process wall measurements cover a whole
batch and are not divided by the sample count to imply cold-request latency.

Every timed constraint check and verification must succeed, and every generated
proof is self-verified outside the prove timer. Expected public signals must
match the fixture. A verifier worker additionally checks rejection of a wrong
expected label. The coordinator confirms that its selected setup manifest was
not changed by benchmarking.

## Sizes and memory

Proof size is `Buffer.byteLength(JSON.stringify(proof))` in UTF-8: compact snarkjs
JSON, with no whitespace or newline. It includes protocol/curve fields and the
returned point arrays, but excludes public inputs and the packet's key identifier.
Public-input array size and full packet size are reported separately using the
same encoding. Decimal coordinate lengths vary with proof randomness. This is
not a compressed point format or an on-chain ABI encoding. No hypothetical
compressed size is presented as a measured result. Setup key/transcript buffer
sizes and compact verification-key JSON size are also recorded.

Node workers report `process.resourceUsage().maxRSS * 1024` as bytes, converted
to MiB by dividing by $2^{20}$ in the report. Node specifies `maxRSS` in KiB;
it is a lifetime memory high-water mark. See the
[Node process documentation](https://nodejs.org/api/process.html#processresourceusage).
On the measured Windows host it represents peak working-set usage. It includes
the process runtime, imports, buffers, and snarkjs worker threads, rather than
only the main thread's JavaScript heap. RSS covers the whole process when worker
threads are used. See [Node memory usage](https://nodejs.org/api/process.html#processmemoryusage).

Each setup/prover/verifier has a fresh process, so its high-water mark is isolated
from the other workloads. Prover memory includes witness generation, checking,
proving, and untimed self-verification; it is not the incremental memory of one
proof call. Verifier workers never load a proving key or generate witnesses.
Child processes are excluded from these RSS values. Native compiler memory and
coordinator memory are **not measured**; no parent RSS is mislabeled as native
compiler memory. Startup and cleanup are included in each worker's high-water
mark, which is read after curve shutdown.

## Statistics and scope

Summaries record count, minimum, maximum, median, arithmetic mean, sample standard
deviation (denominator $n-1$), and interquartile range. Quartiles use linear
interpolation at rank $(n-1)q$ in the sorted observations. For a singleton, sample
standard deviation is null. Small deterministic tests exercise ordering,
quartiles, dispersion, and rejection of invalid observations.

The 81 warmed observations are correlated within three processes and share a
single selected key and host. They are not 81 independent machine experiments.
Dispersion is descriptive; no confidence interval or universal performance claim
is made. Run-order, thermal, scheduler, filesystem, and background-load effects
remain possible. Machine model, logical CPUs, available parallelism, RAM, OS
release, tool versions, concurrency, source hashes, and artifact hashes accompany
the data. Hostname, username, absolute paths, environment variables, proof
coordinates, private inputs, and contribution entropy are absent from the
committed summary.

The source base commit predates the benchmark changes; the summary's source
hashes identify the files actually measured. Source hashes are byte hashes and
can differ with checkout line endings. Circuit hashes identify the exact compiled
artifacts. Performance results do not change the written proof's assumptions or
the local setup's research-only assurance boundary.
