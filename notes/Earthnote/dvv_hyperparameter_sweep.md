## dv/v Hyperparameter Sweep Plan

Companion to [[PROJECT_PLAN]] — Phase 2.4 extension. Goal: systematically sweep dv/v measurement hyperparameters on the already-stacked cross-correlations and produce a single results table you can slice/plot.

---

## Sweep dimensions

Three axes, swept as an outer product (with optional filtering to skip invalid combos):

### 1. Frequency bands
List of `[fmin, fmax]` pairs applied as a bandpass before `stretching` / MWCS. Defaults:
- `[0.1, 0.3]` — deep / long-period
- `[0.2, 0.5]`
- `[0.3, 0.6]`
- `[0.5, 1.0]`
- `[0.7, 1.4]`
- `[1.0, 2.0]`
- `[2.0, 4.0]`
- `[4.0, 8.0]`— shallow
Octave-ish spacing, overlapping. Reject bands where `fmin < 2/cc_len` or `fmax > 0.4 * fs`.

### 2. Coda window (start, end) in seconds after zero-lag
Swept as 2-D grid:
- `coda_tbeg ∈ {2, 4, 6, 8, 10, 15}` s
- `coda_tend ∈ {8, 30, 45, 60, 90}` s
Filter: require `coda_tend - coda_tbeg >= max(10, 3/fmin)` so the window holds enough coda cycles for the current frequency band. Optionally also sweep `-tend..-tbeg` on the causal/acausal sides separately (flag: `use_both_sides`, default true → symmetric two-lobe window).

### 3. Channel-pair averaging groups
For SC (single-station) dv/v the six pairs are `EE, NN, ZZ, EN, EZ, NZ`. Groups to sweep:
- `per_pair` — each pair measured independently (baseline)
- `cross_only` — mean of `EN, EZ, NZ`
- `horizontal` — mean of `EE, NN, EN`
- `all_mean` — mean of all six
- `all_median` — median of all six (outlier-robust)
Averaging is done on the **stacked CC traces before stretching** (not on dv/v values) so the measurement sees a higher-SNR reference. A second pass with averaging on dv/v values is logged for comparison.

Later, for inter-station (Phase 5), replace with `{ZZ, RR, TT, ZZ+RR+TT mean, ...}`.

---

## Fixed inputs (not swept)

Read from a per-station input bundle:
- Reference stack `ref[pair]`
- Current (daily/rolling) stacks `cur[pair][t]`
- Sampling rate `fs`, maxlag
- Date index

Fixed stretching knobs: `epsilon=0.03`, `nbtrial=100`, `do_stretch=True`. MWCS run as a secondary method for cross-validation with the same coda window and frequency band.

---

## Outputs

Single long-format Parquet/CSV `dvv_sweep_results.parquet` with columns:

```
station, pair_group, pair, fmin, fmax, coda_tbeg, coda_tend,
method, date, dvv, error, cc, cdp, n_traces, run_id, config_hash
```

Plus:
- `sweep_manifest.json` — the full parameter grid + git hash + NoisePy version
- Per-run log file under `logs/{run_id}.log`
- Optional: summary figure per station (dv/v vs time, one line per (band, coda) combo, faceted by pair_group)

---

## Execution model

- Driver reads `sweep_config.yaml`, expands the parameter grid, and for each station emits one job per `(pair_group, fmin, fmax, coda_tbeg, coda_tend)` combo.
- Jobs are embarrassingly parallel → dispatch via `joblib.Parallel` for single-node and via `MPIScheduler` for the HPC run (same function, different launcher).
- Results are appended to a station-level Parquet shard; a final `merge_results.py` concatenates shards.
- Incremental: if `(run_id, station, combo_hash)` already present in the output, skip. Enables resuming interrupted sweeps.

---

## Files (in `Earthnote/scripts/dvv_sweep/`)

- [[scripts/dvv_sweep/sweep_config.yaml]] — parameter grid
- [[scripts/dvv_sweep/run_sweep.py]] — driver: expand grid, dispatch, collect
- [[scripts/dvv_sweep/dvv_core.py]] — single-combo measurement (bandpass → window → stretching + MWCS)
- [[scripts/dvv_sweep/channel_grouping.py]] — pair-averaging logic
- [[scripts/dvv_sweep/io_utils.py]] — load stacks from ASDF, write Parquet shards
- [[scripts/dvv_sweep/merge_results.py]] — concat shards → single results table
- [[scripts/dvv_sweep/submit_hpc.sh]] — SLURM/MPI wrapper for the backend

---

## Milestones

1. Implement `dvv_core.single_measurement(ref, cur, fs, fmin, fmax, t0, t1)` with unit test on a synthetic stretched trace (known injected dv/v).
2. Wire `run_sweep.py` end-to-end on **one** station, one component pair, full grid (~6 bands × 30 coda combos ≈ 180 runs) — should finish in minutes.
3. Add `pair_group` averaging + MWCS comparison.
4. Scale to pilot 20 stations from Phase 1.3. Inspect variance across the grid to pick a "default" operating point for Phase 3.
5. Freeze defaults → document in [[PROJECT_PLAN]] §2.4.

---

## Open questions

- Do we also sweep the reference window (baseline period)? Currently fixed — add later if dv/v is sensitive to baseline choice.
- Taper type / taper fraction inside the coda window: fixed at `tukey 0.1` for now.
- For inter-station, rotation is needed before pair-grouping — handle in Phase 5 extension of `channel_grouping.py`.
