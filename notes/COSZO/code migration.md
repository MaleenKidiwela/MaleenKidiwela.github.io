# Gap Detection Algorithm Migration — Plan

> Living document. Plan for replacing the legacy gap detection in
> `OOI_data_request_and_convert_mseed.py` with the `temporal_anomaly_investigator`
> integer-step + wall-clock-correction approach. Expected to evolve — decisions
> marked **TBD** still need input from William/Mika.

---

## 1. Current state — corrected mental model

The pipeline runs on **24 h windows** (`time_interval = 86400` in `run_prest.txt`), not short per-segment windows. Within each window:

- `sr` is computed **once** from `median(Δt)` after stripping the top-10 % tail, over all samples in the window (`OOI_data_request_and_convert_mseed.py:474–482`).
- Gap detection splits that window into contiguous segments at `Δt > multiplier × sp` (absolute threshold, multiplier depends on sampling regime and `is_full`).
- **Every segment's MiniSEED header gets the same `sampling_rate`** — the single window-level `sr`. It is per-window, not per-segment (line ~817).

Per-segment quantities in the header are:
- `starttime` — first UTC timestamp of that segment
- `npts` — length of that segment

So the common intuition "the old code assigns a sample rate per segment" is partly right (start/length are per-segment) and partly wrong (rate itself is day-global, not segment-local).

**Corollary: going per-day vs per-segment is NOT the change.** Both the legacy pipeline and the anomaly approach compute one day-global `sampling_rate`. The migration changes **how** that single value is derived, not whether it is per-segment.

---

## 1b. End-to-end pipeline walkthrough (what the migration actually touches)

Full chain from a cron fire to data on EarthScope. Each step is annotated with whether the algorithm change affects it (🟥 affected, 🟨 indirectly affected, ⬜ unaffected).

### Stage 1 — Scheduling (cron)

⬜ `crons_prest_seedlink_and_mseed2dmc.txt` — per-station cron entries invoke `bin/run_ooi_requests.sh <station> prest {seedlink|miniseed2dmc}`. seedlink runs hourly, miniseed2dmc runs every 2 minutes (with a maintenance gap 18:00–18:29 UTC).

Nothing to change here.

### Stage 2 — Wrapper and single-instance lock

⬜ `bin/run_ooi_requests.sh` — sources `.ooi_env`, activates the conda env, hands off.
⬜ `bin/run_data_collection.sh` — dispatcher. Chooses between `OOI_metadata.py` (reference = `all all`) and `OOI_data_request_and_convert_mseed.py`. Enforces single-instance via `pgrep`. Directs stdout/stderr into `log/` or `log_mseed2dmc/`.

Nothing to change here.

### Stage 3 — Metadata path (`OOI_metadata.py` → `create_metadata.py`)

⬜ Unaffected. StationXML generation only consumes the param files — no data, no timestamps, no gap logic.

### Stage 4 — Data path (`OOI_data_request_and_convert_mseed.py`)

This is the monolith — ~911 lines. Every numbered sub-step maps to a section of the file:

1. ⬜ **Read state** — `run/endtime_<station>_<run>.txt` → `start_time`. `end_time = start_time + time_interval` (86400 s).
2. ⬜ **Build + submit M2M request** — data URL with `beginDT`/`endDT`, `format=application/netcdf`, `include_provenance=true`. Poll `status.json` up to `max_cycle × delay` seconds.
3. ⬜ **Locate NetCDF via NCML** — parse the XML index, find the aggregated `.nc` location.
4. 🟨 **Optional local NetCDF save** (`save_netcdf = 1` in `run_prest.txt`) — downloads to `output/netcdf/` with server filename. This **duplicates** `temporal_anomaly_investigator --save-nc` which writes to `output/temporal_anomaly/netcdf/` with a deployment-tagged filename. See §8 for proposed unification.
5. ⬜ **Open NetCDF via OPeNDAP, trim to window** — `utcdata1900` conversion, `searchsorted` trim to [start_time, end_time].
6. 🟥 **Gap detection + sample period estimation** (lines ~460–700, the core of the legacy algorithm):
	- `sp = median(Δt after 90 %-trim)`
	- `is_full = (npts ≈ expected_npts)`
	- Adaptive `gap_threshold = multiplier × sp`
	- `gap_idx = where(Δt > gap_threshold)`
	- `split_idx = gap_idx + 1`
	- **All of this is replaced** by the anomaly method. See §2 / §4.
7. 🟥 **sp-deviation email alert** — uses `sp` from step 6 compared to the deployment's nominal. Needs to use whichever `sp`/`sr` the new algorithm reports.
8. 🟨 **Auto-diagnostic figure** — triggers when `len(gap_idx) > 0 OR diag_sp_alert_fired`. Calls `diagnose_timing.run_diagnostic(t_sec, sp_calc, sp_nominal, dt_all, gap_idx, gap_threshold, multiplier, is_full, ...)`. Inputs change because `gap_idx`, `sp_calc`, `gap_threshold`, `multiplier`, and `is_full` are produced by the new algorithm. The function itself may need small adjustments if the new algorithm does not produce one of those fields (e.g. `multiplier` has no analogue in the integer-step method).
9. 🟥 **Per-channel × per-segment MiniSEED write**:
	- `data_split = np.split(timestamps, split_idx)` — segment boundaries come from step 6.
	- For each channel → for each segment: build `Trace` with `stats.sampling_rate = sr` (from step 6, not per-segment), write one MiniSEED under `output/mseed/` (seedlink) or `output/mseed2dmc/<YEAR>/` (miniseed2dmc).
	- **The `sampling_rate` in every header is the day-global value** from the new algorithm (OLS Δt_true, with fallback per Phase 2).
10. 🟥 **Continuity advance** — `next_start_time = last_written_time + sp`, persisted to `run/endtime_<station>_<run>.txt`. Uses the same `sp` as step 6. Under the new algorithm this becomes `last_written_time + Δt_true` (or the chosen fallback). Any drift here accumulates across runs.
11. 🟨 **Gap log append** — `log/gap_<station>_<run>.txt` and `output/diagnostics/gaps_<station>_<run>.txt`. Lines are algorithm-specific (thresholds, missing-sample estimates). Format should be kept parseable — existing `gap detection.md` downstream tooling may rely on it.

### Stage 5 — Downstream transfer (outside this repo)

⬜ **seedlink path**: `output/mseed/` → Ring server (mseedscan picks up files) → EarthScope SeedLink client. Ring server + mseedscan config lives elsewhere (not in this repo). No code change here, but **behavioural** impact: more segments = more files landing in `output/mseed/`, potentially higher inode / watcher churn. Worth checking that mseedscan handles larger directories without slowing down.

⬜ **miniseed2dmc path**: `output/mseed2dmc/<YEAR>/` → run `mseedtodmc` manually for backfill. Unaffected mechanically; same file-count consideration applies.

### Stage 6 — Pipeline health monitoring

⬜ `bin/detect.py` — independent monitor; does not read gap logic state. No change needed.

### Summary — files that actually change

| File | Change |
|---|---|
| `bin/OOI_data_request_and_convert_mseed.py` | Replace lines ~460–700; adjust continuity advance; adjust alert inputs; adjust auto-diagnostic call signature. |
| `bin/diagnose_timing.py` | `run_diagnostic` signature may loosen — `multiplier` becomes optional since anomaly has no analogue. |
| `bin/plot_from_netcdf.py` | Replace embedded legacy gap detection with a call to the shared `detect_gaps_{legacy,anomaly}` functions so offline conversion matches live output. |
| `param/run_prest.txt` | Add `gap_algo = legacy` (default) / `anomaly`. |
| Obsidian [[gap detection]] | Rewrite once cutover is complete. |
| `README.md` | Collapse the contrastive section added 04-24-26 back to a single description. |

### Tests / safety rails to add during Phase 1

- Unit-level: both `detect_gaps_legacy` and `detect_gaps_anomaly` must accept the same inputs and return the same `GapResult` shape. Add a golden-data test for each, based on 3–5 saved NetCDFs covering: clean, jitter-only, single-sample gap, multi-segment gaps, deployment boundary.
- Integration: run the pipeline against the saved NetCDFs with both algorithms and diff the emitted MiniSEED filenames + headers.
- Regression: hash the output MiniSEED directory for a known-good week under legacy, re-run under anomaly, diff.

---

## 2. What the anomaly detector replaces

| | Current pipeline | Anomaly detector (refined) |
|---|---|---|
| Sample-rate source | `1 / median(Δt after 90 %-trim)` | `1 / slope_OLS(t ~ iⱼ)` where iⱼ is the reconstructed integer sample index |
| Granularity | day-global (per 24 h window) | day-global (per 24 h window) — unchanged |
| Gap detection trigger | `Δt > multiplier × sp` (absolute seconds, regime-dependent multiplier) | `true_missing = n_ideal − n_points > 0` (data-derived, no param-file dependency) |
| Treatment of jitter spikes | Flagged as gaps whenever they cross the absolute threshold | Jitter that rounds `Δi` up to 2 does **not** add to `true_missing` when the rest of the day compensates; classified as jitter automatically |
| Smallest detectable gap | ~1.5–2.5 × sp | 1 missing sample |
| Per-day stats produced | Not surfaced in pipeline output | Full jitter σ, max, fraction, Δt_true, ε, `true_missing` |

Δt_true (OLS) and median-Δt usually agree to ≪1 ppm on clean days, but diverge when there are large jitter spikes — OLS is the better estimator for the true underlying interval.

### Refined algorithm (replaces the current wall-clock check)

The current `compute_variability` uses a wall-clock check (`n_points ≥ round(span/sp_nominal) + 1`) to reclassify `Δi>1` events as jitter. That is a binary flag and depends on `sp_nominal` from the param file.

The refinement uses the **reconstruction the function already computes** (`i_j = cumsum(round(Δt/Δt_FG))`) and directly counts missing samples:

```python
Δt'        = diff(t_sec)
Δt_FG      = median(Δt')
Δi_float   = Δt' / Δt_FG
Δi_int     = round(Δi_float)
i_j        = cumsum(Δi_int)
n_ideal    = i_j[-1] + 1

# OLS fit → single day-global sample rate
Δt_true, t_i0 = polyfit(i_j, t_sec, 1)

# Direct gap count (data-derived, no param-file dependency)
true_missing = n_ideal - n_points
n_gaps       = 0 if true_missing == 0 else n_gaps_raw
```

**Why it's cleaner than the wall-clock approach:**

- No dependency on `sp_nominal` for classification — purely data-derived.
- Gives a numeric missing-sample count, not just a clean/dirty flag.
- Handles jitter naturally: a `Δtⱼ = 1.5·Δt_true` rounds `Δi = 2`, but neighbouring intervals compensate across the day, so `Σ round(Δi) ≈ n_points − 1` and `true_missing = 0`. The `Δi>1` event is silently absorbed as jitter without ever being misclassified as a gap.
- If one real sample is missing, `Σ round(Δi) = n_points`, so `n_ideal = n_points + 1`, and `true_missing = 1`. Correctly flagged.

**Guardrail — `Δt_FG` instability:** if `max|ε_j| > ~0.4` (i.e. `Δi'` values sit near the 0.5 rounding boundary), the integer-step reconstruction itself is untrustworthy and `true_missing` becomes meaningless. Add a derived flag `dt_fg_unstable = (max_abs_epsilon > 0.4)`; when True, fall back to legacy median+trim behaviour and emit a warning. This is the replacement for risk item 5 in §3.

---

## 3. Risks & edge cases to name up front

1. **Smaller splits / more segments.** The anomaly detector flags single-sample gaps the pipeline silently bridges. On 15 s long-period data this could multiply MiniSEED file counts meaningfully. EarthScope ingest may or may not care — **TBD**: confirm with William whether more fragmented MiniSEED output is acceptable.
2. **Different `sampling_rate` in headers.** Even when agreement is to 6 decimals, consumers that hash or compare headers will see different values. Downstream cross-correlation and timing-error analyses (the May 18 items) would legitimately prefer the OLS value, but it is a behavioural change.
3. **Short-window robustness.** `compute_variability` assumes n ≥ 2 and a stable median. For a sparse 24 h window, the OLS slope is still meaningful but `Δt_FG = median(Δt')` can misbehave if >50 % of intervals are gap-dominated. The pipeline's 90-%-trim is more defensive there.
4. **Split trigger for MiniSEED files.** With the refined algorithm, `true_missing == 0` means no samples are missing. **Decided: Option A.** Split only when `true_missing > 0`. Jitter-only days produce a single MiniSEED spanning the full day. `Δt_true` is used as the day's `sampling_rate`. Flagged for William's sign-off during Phase 3 canary.
5. **Unstable reconstruction on jitter-heavy days.** If the worst single-sample timing residual is a large fraction of `Δt_true`, the OLS fit itself becomes suspect — and so does `true_missing`. The refined algorithm handles this via the `jitter_unstable = (frac_maxabs > 0.4)` guardrail (40 % of `Δt_true`). When True: emit an email alert and flag the day. Whether to also fall back to legacy or refuse to write MiniSEED is still open (see §5).

---

## 4. Phased migration plan

### Phase 0 — refine `compute_variability` + switch NetCDF naming in the investigator

**Do this before any pipeline work.** The refined algorithm (§2) is a change to the investigator itself, not only the pipeline — and downstream work reads `compute_variability` output.

Changes inside `compute_variability`:

- Replace the `n_expected_wall` / `wall_clock_clean` block with the direct `true_missing = n_ideal − n_points` formulation.
- Add `true_missing` to the return dict.
- Derive `jitter_unstable = (frac_maxabs > 0.4)` (currently only `frac_maxabs` is in the CSV) and add it to the return dict. This is the sample-rate-agnostic instability flag, measured against `Δt_true`.
- CSV schema bump: drop `n_expected_wall`, add `n_ideal`, `true_missing`, `jitter_unstable`. Keep `n_gaps_raw`, `gap_total_missing_raw` for auditing. `frac_maxabs` already exists; keep as-is.
- Update `write_stats` text and the `make_per_day_figure` suptitle.
- Update `timestamp variability assessment plan.md` (Obsidian) steps 4 and 9 to match.

Changes to `--save-nc` (investigator):

- Switch local filename from `<station>_<date>_deployment<NNNN>.nc` to the **server-provided filename** (`os.path.basename(netCDF)`) — same convention the legacy pipeline used. Single canonical naming going forward.
- Keep the switch (`--save-nc`) as today — off by default.

Existing CSVs from prior `collect` runs: regenerate from the saved NetCDFs (we have them via `--save-nc`) rather than schema-migrate — cleanest path.

Validation before moving on: re-run one week of `collect` per station, diff `n_gaps` before/after — should only differ on days where the wall-clock check was actually firing.

### Phase 0b — side-by-side comparison (no pipeline change)

- Build a small harness that runs **both** methods against the last N days of locally saved NetCDFs (already available via `temporal_anomaly_investigator --save-nc`).
- Emit a CSV diff per (station × day):
	- `n_gaps_legacy`, `n_gaps_anomaly_raw`, `n_gaps_anomaly_corrected`
	- `sr_legacy`, `sr_anomaly`
	- `segments_legacy`, `segments_anomaly`
	- `sp_deviation_from_legacy`
- Goal: surface days where the two disagree materially so they can be reviewed manually.
- Deliverable: `bin/compare_gap_algos.py`, outputs to `output/temporal_anomaly/algo_comparison/<STATION>.csv`.

### Phase 1 — factor gap detection behind an interface

Extract the pipeline's gap-detection block (roughly `OOI_data_request_and_convert_mseed.py:460–700`) into a single, pure function:

```python
def detect_gaps_legacy(t_sec, sp_nominal) -> GapResult
def detect_gaps_anomaly(t_sec, sp_nominal) -> GapResult
```

Both return the same shape:

```python
@dataclass
class GapResult:
    sr: float                   # sampling rate that lands in MiniSEED header
    sp: float                   # reciprocal
    gap_idx: np.ndarray         # indices into dt_all where a gap starts
    segment_splits: list[int]   # split points for np.split on the timestamp array
    is_full: bool               # wall-clock completeness flag
    diagnostics: dict           # everything else (jitter stats, etc.)
```

Selection lives in `run_prest.txt`:

```
gap_algo = legacy            # default; accepted: legacy | anomaly
```

This lets us flip per-station or per-deployment without code changes, and lets `plot_from_netcdf.py --convert-mseed` share the same implementation as the live pipeline.

### Phase 2 — decision points to settle before the flip

These need explicit answers before we default to `anomaly`:

- **File-splitting trigger**: ✓ **Decided — Option A.** Split only when `true_missing > 0`. Sign-off still expected from William during Phase 3 canary.
- **`sampling_rate` in header**: ✓ **Decided — `Δt_true`** (OLS) used as the day's `sampling_rate`. `dt_fg_unstable` is surfaced as a diagnostic flag; **TBD** whether it should trigger a fallback or just a warning (see §5).
- **Short-window behaviour**: pipeline's 24 h default is comfortable, but backfill/catch-up runs could request shorter windows. Define a minimum-n guard (e.g. `n < 100` → fall back to legacy) and short-circuit.
- **Alert parity**: the current `sp_deviation` email check must keep working. Define it against whichever `sr` we report (probably the new OLS one), and keep the hybrid floor + fraction threshold unchanged.
- **Deployment boundary handling**: if a 24 h window straddles a deployment change (sample rate change), both methods need the window split at the boundary before any fitting. Current pipeline does not do this explicitly — legacy method just happens to survive because the trimmed median is robust. **TBD**: add a boundary-aware pre-split, or forbid windows that cross boundaries.

### Phase 3 — cutover

- Flip default to `anomaly` for **one station first**. Suggestion: AXBS (Axial Base) — quietest historically, single-deployment regime (15 s throughout all 4 deployments), good canary.
- Re-run one week of backfill under the new algorithm, diff against the existing archive:
	- Segment counts per day
	- `sampling_rate` header values
	- Byte-level comparison on overlapping portions where the sample arrays are identical
- Hold for 1–2 cron cycles in live (seedlink path) with email alerts fully enabled.
- Roll to the remaining two stations (SLBS, SUM1) individually, same protocol.
- Keep `gap_algo = legacy` supported as an escape hatch for ~1 release.

### Phase 4 — cleanup

- Once stable, delete the legacy path. The ~240-line gap-detection comment block in `OOI_data_request_and_convert_mseed.py` retires with it.
- **Remove `save_netcdf` from the pipeline entirely** — lines 92 and 287–301 in `OOI_data_request_and_convert_mseed.py`, plus the `output/netcdf/` directory reference. NetCDF archiving is the investigator's job via `--save-nc`, not the live pipeline's.
- Drop the `save_netcdf` param from `param/run_prest.txt`.
- Update `gap detection.md` in the Obsidian vault to reflect the new canonical behaviour.
- Update `README.md` (the contrastive section added on 04-24-26 collapses down to a single description; the `output/netcdf/` row in the output-directories table is removed).
- Remove `gap_algo` run param.

---

## 5. Open questions / to refine

### Algorithm & splitting
- [x] **Splitting trigger**: Option A (`true_missing > 0`). Sign-off still expected from William during Phase 3 canary.
- [x] **`sampling_rate` source**: `Δt_true` (OLS) used as the day's `sampling_rate`.
- [x] **Instability flag**: use `frac_maxabs > 0.4` (40 % of `Δt_true`), which is sample-rate-agnostic and derived from `Δt_true` rather than `Δt_FG`. Replaces the earlier `max_abs_epsilon > 0.4` proposal. CSV already has `frac_maxabs`; add a boolean companion column (e.g. `jitter_unstable`).
- [x] **Instability → no email.** `jitter_unstable` stays a CSV-only diagnostic. Surfaced via metrics CSV and the 4-panel figure; not a notification trigger. Email-worthy events are limited to `sp_deviation` (rate diverges from nominal).
- [ ] **`jitter_unstable` action beyond the email**: warn and continue with `Δt_true` anyway, refuse to write and flag a manual-review day, or fall back to legacy median? (The OLS fit on a day with `frac_maxabs > 0.4` is itself suspect.)
- [ ] **Threshold tuning**: 40 % is a starting guess. Re-check after Phase 0 regenerates the archive and we can see how often it actually fires.
- [ ] **Short-window minimum n**: 100 samples is a starting guess for the fallback-to-legacy cutoff.
- [ ] **Deployment-boundary pre-split policy**: reject windows crossing a boundary, or split at the boundary first? Legacy happens to survive this; anomaly needs explicit handling.

### Investigator refactor
- [ ] Confirm Phase 0 scope: refactor `compute_variability` + CSV schema + `write_stats` + figure suptitle in one PR, or split?
- [ ] Confirm approach for existing CSV data: regenerate from saved NetCDFs (preferred) vs in-place schema migration.
- [ ] Update `timestamp variability assessment plan.md` (Obsidian) to reflect the `true_missing` formulation once §2 of this plan is settled.

### Email alerts (pipeline)
- [x] **Keep `sp_deviation` as the only algorithm-related email** (line 535 of `OOI_data_request_and_convert_mseed.py`), redefined against `Δt_true` instead of legacy median-Δt. Same hybrid floor + fraction threshold.
- [x] **No jitter email.** `jitter_unstable` is computed and written to the CSV but does not trigger a notification. Operators see it only via the metrics CSV / 4-panel figure.
- [ ] **Gap-detected email**: should `true_missing > 0` (beyond some nominal floor, e.g. 0.1 % of the day) trigger an email? Today gaps are only written to `gap_<station>_<run>.txt`. Decision pending.
- [x] **Other 6 pipeline emails unchanged**: no-data, HTTP error, incomplete-status, NetCDF-open-failure, too-few-points, deployment-end-warnings — all live upstream of gap detection and are unaffected by the migration.

### Downstream / rollout
- [ ] Confirm with William that fragmented MiniSEED (more files, smaller segments on gap days) is acceptable to EarthScope ingest.
- [ ] Confirm whether mseedscan (ring-server side, outside repo) tolerates the higher file count on jitter- or gap-heavy days.
- [ ] Confirm whether downstream consumers of the MiniSEED `sampling_rate` field will see any precision-level surprise (OLS produces many decimals vs legacy's 6 — the value difference is tiny but the bytes differ).
- [ ] Continuity-drift monitoring plan: `next_start = last_written + sp` accumulates any systematic bias between legacy median and OLS Δt_true across cron runs. Need a one-line metric in the cron log or a separate check.
- [ ] Agree on canary station and duration (AXBS, 1 week proposed).
- [ ] Agree on rollback criteria (what metric, over what window, triggers reverting to `legacy`).

### Unification
- [x] **NetCDF saving is investigator-only.** Remove `save_netcdf` from the pipeline entirely (Phase 4 cleanup). Investigator keeps the `--save-nc` switch but adopts the server-provided filename convention (Phase 0).

---

## 6. Related context

- The `temporal_anomaly_investigator` implements the integer-step algorithm per the 10-step procedure in `timestamp variability assessment plan.md`.
- `plot_from_netcdf.py` already has a pipeline-faithful legacy gap-detection copy (`estimate_sp_and_gaps`) that can become the reference implementation for `detect_gaps_legacy` during Phase 1.
- `--save-nc` on the investigator means we already have local NetCDF archives to feed Phase 0 comparisons without re-hitting OOI.

---

## 7. Recommended next action

**Phase 0 first — refactor `compute_variability` in the investigator.** The refined algorithm (§2) is the foundation everything else depends on: Phase 0b's side-by-side comparison, Phase 1's shared `detect_gaps_anomaly` function, and the migration decisions in Phase 2 all read from whatever `compute_variability` produces. Landing the refactor first means the rest of the plan operates on the same definitions.
