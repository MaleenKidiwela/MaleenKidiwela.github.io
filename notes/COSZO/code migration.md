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
4. 🟨 **Optional local NetCDF save** — kept as a capability in the pipeline, but moved off the param file. Becomes a CLI flag `--save-nc` on `OOI_data_request_and_convert_mseed.py` (mirroring the investigator). The cron wrapper (`bin/run_data_collection.sh`) does not pass it, so cron-driven runs never save. Manual ad-hoc runs do. Output stays at `output/netcdf/` with the server-provided filename. The investigator's own `output/temporal_anomaly/netcdf/` archive (also `--save-nc`) is unchanged. See §5 Unification.
5. ⬜ **Open NetCDF via OPeNDAP, trim to window** — `utcdata1900` conversion, `searchsorted` trim to [start_time, end_time].
6. 🟥 **Gap detection + sample period estimation** (lines ~460–700, the core of the legacy algorithm):
	- `sp = median(Δt after 90 %-trim)`
	- `is_full = (npts ≈ expected_npts)`
	- Adaptive `gap_threshold = multiplier × sp`
	- `gap_idx = where(Δt > gap_threshold)`
	- `split_idx = gap_idx + 1`
	- **All of this is replaced** by the anomaly method. See §2 / §4.
7. 🟥 **sp-deviation email alert** — uses `sp` from step 6 compared to the deployment's nominal. Needs to use whichever `sp`/`sr` the new algorithm reports.
8. 🟥 **Auto-diagnostic figure → REMOVED on cron**. Original behaviour: triggered when `len(gap_idx) > 0 OR diag_sp_alert_fired`, called `diagnose_timing.run_diagnostic(...)`, wrote a PNG to `output/diagnostics/`. **The COSZO VM is resource-constrained (20 GB disk / 2 GB RAM) and should not be generating figures during cron runs.** Replaced by:
	- Keep the email alerts (`sp_deviation` and the other 6 upstream emails) — those are cheap.
	- Append a per-day stats row to a pipeline-side CSV (see Stage 4b below) so operators can audit days remotely from the metrics file.
	- Figure generation moves to offline tools (`bin/plot_from_netcdf.py`, the investigator) run on a workstation, not on the VM.
	- `auto_diag` param in `run_prest.txt` deprecated (Phase 4).
9. 🟥 **Per-channel × per-segment MiniSEED write**:
	- `data_split = np.split(timestamps, split_idx)` — segment boundaries come from step 6.
	- For each channel → for each segment: build `Trace` with `stats.sampling_rate = sr` (from step 6, not per-segment), write one MiniSEED under `output/mseed/` (seedlink) or `output/mseed2dmc/<YEAR>/` (miniseed2dmc).
	- **The `sampling_rate` in every header is the day-global value** from the new algorithm (OLS Δt_true, with fallback per Phase 2).
	- **Timestamp reconstruction semantics.** MiniSEED does not store per-sample timestamps — each segment is fully defined by `(starttime, sampling_rate, npts)` and any reader reconstructs the sample grid as `starttime + i × (1/sampling_rate)`. So under the new algorithm:
		- `sampling_rate = 1 / Δt_true` (OLS slope) → every reconstructed sample timestamp uses the fit-derived interval, not the raw observed Δt.
		- `starttime` per segment **stays as the raw first UTC timestamp** of that segment (no change from legacy). We considered using the OLS-implied `t_i0` but that introduces a sub-ms offset against the actually observed first sample; cleaner to anchor each segment to its observed start and let Δt_true govern only the inter-sample spacing.
		- `npts` per segment unchanged.
		- Under Option A (split only when `true_missing > 0`), most days are single-segment, so the reconstructed grid is `t_sec[0] + i × Δt_true` end-to-end. Gap days apply the same logic per segment.
10. 🟥 **Continuity advance** — `next_start_time = UTCDateTime(end_time)` (the upper bound of the request window), persisted to `run/endtime_<station>_<run>.txt`. **Each day stands alone**: the cron's day-boundary arithmetic is independent of any per-day rate estimate. Per-day Δt_true describes spacing WITHIN a day; the next day's first sample is observed in OOI's response, not predicted arithmetically. Partial-data windows therefore leave permanent gaps (consistent with the "gaps are honest" principle — we record and move on rather than re-fetching from where partial data ended). Decided 2026-04-28; replaces the legacy `last_written + sp` continuity formula.
11. 🟨 **Gap log append** — `log/gap_<station>_<run>.txt` and `output/diagnostics/gaps_<station>_<run>.txt`. Lines are algorithm-specific (thresholds, missing-sample estimates). Format should be kept parseable — existing `gap detection.md` downstream tooling may rely on it.

12. 🟥 **NEW: per-day stats CSV append** — replaces the auto-diagnostic figure on the VM. One row per (station × 24 h window). Path: `output/metrics/<station>_pipeline_stats.csv`. Columns at minimum:
	- `date`, `station`, `run`
	- `n_points`, `n_ideal`, `true_missing`
	- `sr` (= 1/Δt_true), `Δt_true` (full repr precision)
	- `n_gaps`, `n_segments`, `is_full`
	- `jitter_unstable`, `frac_maxabs`
	- `sp_deviation_alert_fired` (bool)
	- `gap_email_fired` (bool, if we add the gap-detected email — see §5)
	- `algorithm` (`legacy` | `anomaly`) so historical rows stay self-describing across the migration
	Append-only, idempotent on `(station, date)` so cron retries don't duplicate. Schema mirrors the investigator's `metrics/<station>_variability.csv` where the columns are the same — operators can diff the two files to verify pipeline ↔ investigator agreement.

### Stage 5 — Downstream transfer (outside this repo)

⬜ **seedlink path**: `output/mseed/` → Ring server (mseedscan picks up files) → EarthScope SeedLink client. Ring server + mseedscan config lives elsewhere (not in this repo). No code change here, but **behavioural** impact: more segments = more files landing in `output/mseed/`, potentially higher inode / watcher churn. Worth checking that mseedscan handles larger directories without slowing down.

⬜ **miniseed2dmc path**: `output/mseed2dmc/<YEAR>/` → run `mseedtodmc` manually for backfill. Unaffected mechanically; same file-count consideration applies.

### Stage 4c — Local historical backfill (NEW, local-only)

🟥 **New capability** — historical MiniSEED archive built locally from the investigator's saved NetCDFs, not by the VM cron.

**Rationale (decided 2026-04-29):**

- The investigator (`temporal_anomaly_investigator.py`) is already running locally with `--save-nc` to capture NCs across the full historical range (2014→present).
- Re-fetching the same data through the VM cron would be redundant *and* slow (~6–7 days of cron pulling per station for ~12 years of history).
- A local one-shot script can read those existing NCs and emit MiniSEEDs in the cron's exact filename + record-length format. No OOI calls, no figures, no NC re-saves.

**Script:** `bin/backfill_mseed_from_nc.py`. Default invocation:

```bash
python bin/backfill_mseed_from_nc.py \
    --start 2014-09-14 --end <date investigator collect has reached>
```

Walks `output/temporal_anomaly/netcdf/`, dispatches through `bin/gap_algorithms.py`, writes to `output/mseed2dmc/<YEAR>/`. **No** per-day stats CSV by default (the investigator's variability CSVs already cover historical data quality). **No** NC re-saving (the investigator already has them).

**Workflow split after backfill completes:**

| Source | Time range | Outputs |
|---|---|---|
| Investigator (local) | 2014→present (rolling) | variability CSV, NCs |
| Backfill script (local, one-shot) | same range as NC coverage | MiniSEEDs in `output/mseed2dmc/<YEAR>/` |
| Cron pipeline (VM) | forward-only after backfill ends | live MiniSEEDs, `pipeline_stats.csv`, `output/diagnostics/` |

VM cron's `endtime_*.txt` is set to (last_backfill_date + 1 day). Cron then continues live without re-touching the historical range.

**Coexists with the cron** — same output path, same filename convention, same gap_algorithms dispatch. The cron's per-day CSV idempotency check means rows it writes won't duplicate any local-backfill activity.

### Stage 5b — Daily metrics sync to GitHub (NEW)

🟥 **New capability** — push the per-day stats CSV (and per-event diagnostics) from the VM to a dedicated GitHub repo once a day, so operators can audit pipeline health without SSHing in.

**Target repo:** `coszo-hub/PREST` (private monorepo, one per instrument family — separate repos for current meter, SCPR, BOTPT come later).

**Repo layout:**

```
coszo-hub/PREST/
├── prest-data-collection/        # the pipeline code itself
│                                 # populated later by migrating the current
│                                 # coszo-data-collection repo here AFTER
│                                 # dev/maleen is fully sorted out
└── metrics/
    ├── RS01SLBS-MJ01A-06-PRESTA101/
    │   ├── pipeline_stats.csv    # one row per day, append-only
    │   └── diagnostics/          # gap_*.txt, missing_data_*.txt, ...
    ├── RS01SUM1-LJ01B-09-PRESTB102/
    │   └── ...
    └── RS03AXBS-MJ03A-06-PRESTA301/
        └── ...
```

**Operational flow on the VM:**

1. VM clones `coszo-hub/PREST` at a known path (e.g. `/home/coszo/PREST/`).
2. Cron pipeline writes to its existing output paths (`output/metrics/*.csv`, `output/diagnostics/*.txt`) inside the data-collection working directory — **no path change to the pipeline itself**.
3. New `bin/sync_metrics.sh` runs once daily (separate cron entry, ~18:35 UTC, after the maintenance window):
	- `rsync` CSVs + diagnostics from `output/{metrics,diagnostics}/` → `<PREST clone>/metrics/<station>/`
	- `cd <PREST clone> && git pull --rebase && git add metrics/ && git commit -m "metrics: sync <UTC date>" && git push`
	- No-op if there's no diff.
4. Single commit per day. Append-only CSVs make merge conflicts unlikely; `--force-with-lease` as a safety guard.

**Auth:** dedicated SSH deploy key on the VM, scoped to write access on `coszo-hub/PREST` only — VM cannot accidentally push to `coszo-data-collection` or anywhere else.

**Failure handling:** sync script logs to `log/sync_metrics.log`. Push failures don't block the pipeline; CSVs are append-only so a missed day just means the next day's commit catches up.

**Repo migration (separate, later effort):** the current `coszo-data-collection` repo moves *into* `coszo-hub/PREST/prest-data-collection/` only after all `dev/maleen` work (this migration included) is sorted out. Out of scope for this document — tracked separately.

**Cron entry:** add to `crons_prest_seedlink_and_mseed2dmc.txt`:

```cron
35 18 * * *  bash /home/coszo/coszo-data-collection/bin/sync_metrics.sh >> /home/coszo/coszo-data-collection/log/sync_metrics.log 2>&1
```

### Stage 6 — Pipeline health monitoring

⬜ `bin/detect.py` — independent monitor; does not read gap logic state. No change needed.

### Summary — files that actually change

| File | Change |
|---|---|
| `bin/OOI_data_request_and_convert_mseed.py` | Replace lines ~460–700; adjust continuity advance; adjust alert inputs; **remove auto-diagnostic figure call**; **add per-day stats CSV append**. |
| `bin/sync_metrics.sh` (new) | Daily rsync + commit + push of `output/metrics/*.csv` and `output/diagnostics/*.txt` to `coszo-hub/PREST/metrics/<station>/`. |
| `crons_prest_seedlink_and_mseed2dmc.txt` | Add daily cron entry at 18:35 UTC for `sync_metrics.sh`. |
| `bin/diagnose_timing.py` | `run_diagnostic` no longer called from cron. Kept for offline use; signature may loosen — `multiplier` becomes optional. |
| `bin/plot_from_netcdf.py` | Replace embedded legacy gap detection with a call to the shared `detect_gaps_{legacy,anomaly}` functions so offline conversion matches live output. |
| `testk/pull_data.py` | Refactor to import the shared `detect_gaps_{legacy,anomaly}` interface so it acts as a single-window smoke-test harness for both algorithms. `testk/verify_mseed.py` already reads the result. |
| `param/run_prest.txt` | Add `gap_algo = legacy` (default) / `anomaly`. Deprecate `auto_diag` (Phase 4). |
| Obsidian [[gap detection]] | Rewrite once cutover is complete. |
| `README.md` | Collapse the contrastive section added 04-24-26 back to a single description; document per-day stats CSV. |

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

1. **Smaller splits / more segments.** The anomaly detector flags single-sample gaps the pipeline silently bridges. On 15 s long-period data this multiplies MiniSEED file counts on gap-heavy days. **This is design intent, not a tradeoff** (decided 2026-04-28): each gap deserves its own file boundary so the archive is honest about *when* data exists and *when* it doesn't. The legacy algorithm's behaviour of bridging sub-threshold gaps into continuous segments is the bug being fixed.
2. **Different `sampling_rate` in headers — accepted by design** (decided 2026-04-28). Δt_true is the right value: it's a day-global OLS slope computed over the full day's t_sec (gaps and all), and every segment from that day shares the same `sampling_rate = 1/Δt_true` in its MiniSEED header. Even a 6-segment fragmented day has identical rate metadata across all six files. Downstream consumers that hash headers will see different bytes than the legacy median-Δt output; this is acceptable because the new value is more accurate and the precision change reflects honesty about the underlying clock, not a regression.
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

**Phase 1 also delivers** (in the same PR series, since they consume `GapResult`):

- `output/metrics/<station>_pipeline_stats.csv` writer in the cron pipeline, append-only, idempotent on `(station, date)`. Schema per Stage 4 step 12.
- `bin/sync_metrics.sh` daily sync script + cron entry per Stage 5b.
- `testk/pull_data.py` refactor to import `detect_gaps_{legacy,anomaly}` so a single 24 h window can be exercised end-to-end locally with both algorithms.
- Removal of the auto-diagnostic figure call (lines ~664–690) from the cron pipeline. `bin/diagnose_timing.py` itself is kept for offline use.
- `--save-nc` CLI flag added to `OOI_data_request_and_convert_mseed.py`; `save_netcdf` param removed from `run_prest.txt` (Phase 4 housekeeping pulls earlier when convenient).

### Phase 2 — decision points to settle before the flip

These need explicit answers before we default to `anomaly`:

- **File-splitting trigger**: ✓ **Decided — Option A.** Split only when `true_missing > 0`. Sign-off still expected from William during Phase 3 canary.
- **`sampling_rate` in header**: ✓ **Decided — `Δt_true`** (OLS) used as the day's `sampling_rate`. `dt_fg_unstable` is surfaced as a diagnostic flag; **TBD** whether it should trigger a fallback or just a warning (see §5).
- **Short-window behaviour**: pipeline's 24 h default is comfortable, but backfill/catch-up runs could request shorter windows. Define a minimum-n guard (e.g. `n < 100` → fall back to legacy) and short-circuit.
- **Alert parity**: the current `sp_deviation` email check must keep working. Define it against whichever `sr` we report (probably the new OLS one), and keep the hybrid floor + fraction threshold unchanged.
- **Deployment boundary handling**: if a 24 h window straddles a deployment change (sample rate change), both methods need the window split at the boundary before any fitting. Current pipeline does not do this explicitly — legacy method just happens to survive because the trimmed median is robust. **TBD**: add a boundary-aware pre-split, or forbid windows that cross boundaries.

### Phase 3 — cutover

- Flip default to `anomaly` for **one station first**. **Canary: RS01SLBS-MJ01A-06-PRESTA101 (Slope Base)** — Maleen has prior offline validation experience on this station and wants to start there. **Canary window: 2025-01-01 → 2025-01-07** (7 days, Dep 2 / 1 Hz regime). Decided 2026-04-28.
- **Execution recipe** (decided 2026-04-28):
	1. Set `gap_algo = anomaly` in `param/run_prest.txt`.
	2. Overwrite `run/endtime_RS01SLBS-MJ01A-06-PRESTA101_prest_mseed2dmc.txt` with the literal string `2024-12-31T23:59:59.999Z` (one line, no newline issues — pipeline reads it via `UTCDateTime(...)`).
	3. Uncomment the SLBS miniseed2dmc cron entries in `crons_prest_seedlink_and_mseed2dmc.txt` (currently both lines are commented; only SUM1 miniseed2dmc is active in production right now).
	4. Let it run. Each cron tick processes one 24 h window and advances the endtime by one day. Seven cron-driven days clears the canary window.
	5. Diff `output/mseed2dmc/2025/` MiniSEED against the existing archive of the same window, plus `output/metrics/RS01SLBS-...-prest_pipeline_stats.csv` rows.
- **Caveat — algorithm flip applies to BOTH transfer paths.** `gap_algo` lives in `run_prest.txt` and is read by both `seedlink` and `miniseed2dmc` invocations. If SLBS seedlink were active, the flip would hit it simultaneously. SLBS seedlink is currently commented out in cron, so this isn't an issue for the canary — only the miniseed2dmc path executes. Keep this in mind when canarying on a station whose seedlink path is also live.
- Diff that week of backfill output against the existing archive:
	- Segment counts per day
	- `sampling_rate` header values
	- Byte-level comparison on overlapping portions where the sample arrays are identical
- Hold for 1–2 cron cycles in live (seedlink path) with email alerts fully enabled.
- Roll to the remaining two stations (SUM1, then AXBS) individually, same protocol.
- Keep `gap_algo = legacy` supported as an escape hatch for ~1 release.

### Phase 4 — cleanup

- Once stable, delete the legacy path. The ~240-line gap-detection comment block in `OOI_data_request_and_convert_mseed.py` retires with it.
- **Move `save_netcdf` from `run_prest.txt` to a `--save-nc` CLI flag** on `OOI_data_request_and_convert_mseed.py`. Default off. Cron wrapper (`bin/run_data_collection.sh`) does not pass it, so cron never saves. Manual ad-hoc runs do. Code path stays; only the toggle moves out of the param file.
- Drop the `save_netcdf` param from `param/run_prest.txt`.
- Update `gap detection.md` in the Obsidian vault to reflect the new canonical behaviour.
- Update `README.md` (the contrastive section added on 04-24-26 collapses down to a single description; the `output/netcdf/` row in the output-directories table is removed).
- Remove `gap_algo` run param.

---

## 5. Open questions / to refine

### Algorithm & splitting
- ✓ **Splitting trigger**: Option A (`true_missing > 0`). Sign-off still expected from William during Phase 3 canary.
- ✓ **`sampling_rate` source**: `Δt_true` (OLS) used as the day's `sampling_rate`.
- ✓ **Instability flag**: use `frac_maxabs > 0.4` (40 % of `Δt_true`), which is sample-rate-agnostic and derived from `Δt_true` rather than `Δt_FG`. Replaces the earlier `max_abs_epsilon > 0.4` proposal. CSV already has `frac_maxabs`; add a boolean companion column (e.g. `jitter_unstable`).
- ✓ **Instability → no email.** `jitter_unstable` stays a CSV-only diagnostic. Surfaced via metrics CSV and the 4-panel figure; not a notification trigger. Email-worthy events are limited to `sp_deviation` (rate diverges from nominal).
- [ ] **`jitter_unstable` action beyond the email**: warn and continue with `Δt_true` anyway, refuse to write and flag a manual-review day, or fall back to legacy median? (The OLS fit on a day with `frac_maxabs > 0.4` is itself suspect.)
- [ ] **Threshold tuning**: 40 % is a starting guess. Re-check after Phase 0 regenerates the archive and we can see how often it actually fires.
- ✓ **Short-window minimum n = 100.** Implemented in `bin/gap_algorithms.py` as `MIN_N_FOR_ANOMALY = 100`. When `gap_algo=anomaly` and `len(t_sec) < 100`, dispatch silently falls back to legacy with a WARNING and the result records the actual algorithm used (`result.diagnostics["algorithm"] = "legacy"`). 100 ≈ 25 min of 15 s data and 100 s of 1 Hz data — comfortably above any backfill chunk we'd run.
- ✓ **Deployment-boundary policy: detect + fall back to legacy + flag in CSV.** Implemented in `bin/OOI_data_request_and_convert_mseed.py`. Before dispatch, the pipeline reads the active deployment's `c_end` from the per-channel param file. If `c_end` falls strictly inside `(window_start, window_end)`, sets `boundary_in_window=True`, logs a warning, and forces `gap_algo="legacy"` for that window (legacy's trimmed median is robust to mixed-rate data; anomaly OLS is not). Per-day CSV records both `algorithm_requested` and the actual `algorithm` used so cutover bookkeeping stays auditable. **A proper split-and-write per slice is deferred** as a follow-up — boundary days are rare (~5 across the entire 2015–2026 archive) and can be re-run manually if needed.

### Investigator refactor
- [ ] Confirm Phase 0 scope: refactor `compute_variability` + CSV schema + `write_stats` + figure suptitle in one PR, or split?
- [ ] Confirm approach for existing CSV data: regenerate from saved NetCDFs (preferred) vs in-place schema migration.
- [ ] Update `timestamp variability assessment plan.md` (Obsidian) to reflect the `true_missing` formulation once §2 of this plan is settled.

### VM resource constraints
- ✓ **No figures on cron.** COSZO VM is 20 GB / 2 GB RAM — figure generation moves entirely off the cron path. Auto-diagnostic figure call in `OOI_data_request_and_convert_mseed.py` (lines ~664–690) is removed. `auto_diag` param in `run_prest.txt` deprecated. (Decided 2026-04-28.)
- ✓ **Per-day stats CSV instead of figures.** Replace the figure with an append-only row to `output/metrics/<station>_pipeline_stats.csv`. Schema aligns with investigator's `metrics/<station>_variability.csv` columns where shared. Idempotent on `(station, date)`. See §1b Stage 4 step 12.

### Email alerts (pipeline)
- ✓ **Keep `sp_deviation` as the only algorithm-related email** (line 535 of `OOI_data_request_and_convert_mseed.py`), redefined against `Δt_true` instead of legacy median-Δt. Same hybrid floor + fraction threshold.
- ✓ **Threshold freeze during cutover.** Keep `sp_alert_abs_floor = 0.05 s` and `sp_alert_rel_frac = 0.05` (5%) unchanged through Phase 3. These were chosen as a noise-floor concession for the legacy median estimator; under OLS Δt_true the noise floor is sub-ms so they could be tightened, but **do not retune during the cutover** — keep operator behaviour stable. Revisit in a follow-up after Phase 0b distributions across the 2015–2026 archive are visible.
- ✓ **No jitter email.** `jitter_unstable` is computed and written to the CSV but does not trigger a notification. Operators see it only via the metrics CSV / 4-panel figure.
- [ ] **Gap-detected email**: should `true_missing > 0` (beyond some nominal floor, e.g. 0.1 % of the day) trigger an email? Today gaps are only written to `gap_<station>_<run>.txt`. Decision pending.
- ✓ **Other 6 pipeline emails unchanged**: no-data, HTTP error, incomplete-status, NetCDF-open-failure, too-few-points, deployment-end-warnings — all live upstream of gap detection and are unaffected by the migration.

### Daily sync repo
- ✓ **Target repo: `coszo-hub/PREST`** — private monorepo per instrument family. Layout: `prest-data-collection/` (code, populated later via repo migration after `dev/maleen` is settled) + `metrics/<station>/{pipeline_stats.csv, diagnostics/}`. Decided 2026-04-28.
- ✓ **Sync trigger: separate daily cron at ~18:35 UTC** running `bin/sync_metrics.sh`. Append-only commits, no force-push, deploy-key auth scoped to `coszo-hub/PREST`.
- ✓ **Diagnostics included.** Sync both `output/metrics/*.csv` and `output/diagnostics/*.txt`. Diagnostics provide narrative ops detail (gap events, NETCDF_OPEN_FAIL, MISSING_DATA, etc.) that complements the structured CSV.
- ✓ **Repo migration deferred.** Moving `coszo-data-collection` into `coszo-hub/PREST/prest-data-collection/` is a separate effort that happens *after* this code migration lands on `dev/maleen`.

### Downstream / rollout
- ✓ **Fragmented MiniSEED on gap days is design intent** (decided 2026-04-28). Each gap = file boundary = honest representation of what time ranges contain data. No William sign-off needed for this.
- [ ] Confirm whether mseedscan (ring-server side, outside repo) tolerates the higher file count on jitter- or gap-heavy days.
- ✓ **Header `sampling_rate` precision change accepted by design** (decided 2026-04-28). Δt_true is the day-global OLS slope, identical across every segment of a given day. Bytes differ from legacy median-rounded output; this is intentional.
- ✓ **Continuity-drift monitoring not needed** (decided 2026-04-28). Drift between `sp_estimate` and `sp_true` is sub-ms per day under OLS; even at 1 Hz the rate of boundary-sample loss is ~1 sample per 1000 days. Each NC is authoritative for its own first/last sample timestamps — the pipeline trusts the data, not arithmetic predictions. No metric or check added.
- ✓ **Canary station/window decided 2026-04-28: SLBS, 2025-01-01 → 2025-01-07.** Order: SLBS → SUM1 → AXBS. (Earlier proposal was AXBS first; revised based on Maleen's prior offline validation on SLBS.)
- [ ] Agree on rollback criteria (what metric, over what window, triggers reverting to `legacy`).

### Unification
- ✓ **NetCDF saving stays available in the pipeline, but CLI-only and not on cron.** Phase 4 cleanup moves the toggle out of `param/run_prest.txt` and exposes it as a `--save-nc` flag on `OOI_data_request_and_convert_mseed.py`. Default off. The cron wrapper (`bin/run_data_collection.sh`) does not pass the flag, so cron-driven runs cannot save. Manual ad-hoc runs do. Output stays at `output/netcdf/` with the server-provided filename. Investigator keeps its own `--save-nc` (Phase 0) writing to `output/temporal_anomaly/netcdf/`. (Revised 2026-04-28 — earlier decision was to remove the pipeline path entirely.)

---

## 6. Related context

- The `temporal_anomaly_investigator` implements the integer-step algorithm per the 10-step procedure in [[timestamp variability assessment plan]].
- `plot_from_netcdf.py` already has a pipeline-faithful legacy gap-detection copy (`estimate_sp_and_gaps`) that can become the reference implementation for `detect_gaps_legacy` during Phase 1.
- `--save-nc` on the investigator means we already have local NetCDF archives to feed Phase 0 comparisons without re-hitting OOI.
- Project anchor and overall narrative across daily notes: [[Cascadia Offshore Subduction Zone Observatory]].

---

## 7. Recommended next action

**Phase 0 first — refactor `compute_variability` in the investigator.** The refined algorithm (§2) is the foundation everything else depends on: Phase 0b's side-by-side comparison, Phase 1's shared `detect_gaps_anomaly` function, and the migration decisions in Phase 2 all read from whatever `compute_variability` produces. Landing the refactor first means the rest of the plan operates on the same definitions.
