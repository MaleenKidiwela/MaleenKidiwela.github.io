# Single-Station Cross-Component dv/v pipeline 

This methodology uses Tim Clements' exact workflow for California. This is Phase 2, replacing the earlier workflow in [[Phase 1.3 Plan]] / [[Phase 1.3 Results]]. Project anchor: [[Cascadia dv.v]].

**Status:** recipe frozen 2026-04-22. Target run: `src/phase13_pilot.py` on the 29-station Phase 1.3 pilot pool, January 2020, Z·E, 2–4 Hz.

## Context

[[Phase 1.3 Results]] produced a 29-station pilot pool at 1–3 Hz with a dv/v pipeline that hit a stretching-grid ceiling: the hourly-QC dv/v series quantized visibly around ±0.1 %. Phase 2 moves the science band to 2–4 Hz, adopts a more standard broadband-whitened preprocessing recipe, refines the stretching grid, adds MWCS as an independent method, and splits coda-domain dv/v measurements into positive-lag, negative-lag, and combined variants. The internals walkthrough is in [[04-28-26 Notes]]; the adaptive-coda extension (Phase 2.1) is in [[04-29-26 Notes]].

---

## Pipeline recipe

### Per-day preprocessing (`load_day`)

Executed once per trace (Z and E) per DOY before segmenting.

1. **Taper gaps** with a 100 s cosine window on each side of every zero-filled gap. After `stream.merge(method=1, fill_value=0)`, each zero run gets a cosine fade-out going in and fade-in coming out, to avoid spectral leakage from sharp data-to-gap transitions.
2. **Demean + detrend** (`obspy` `demean` + `linear`).
3. **High-pass** above 0.4 Hz (zerophase).
4. **Instrument response removal** to velocity, `PRE_FILT = (0.05, 0.1, 18.0, 20.0)`.
5. **Resample to 40 Hz**.

No per-day bandpass into the science band — whitening handles that.

### Per 30-min segment preprocessing (`process_day`)

30-min windows with step 7.5 min (**75 % overlap**, ~192 segments/day). For each segment:

1. Demean + light linear detrend.
2. **20 s cosine taper** on each side (flat middle).
3. **Spectral whitening 0.5–19 Hz** with cosine tapers outside.
4. **One-bit** time normalization.
5. Frequency-domain CC of Z · E, truncated to `MAXLAG = 60 s` → 4801-sample trace at 40 Hz.

### Stacking hierarchy

Per station per month, build three CC tensors from the 30-min segments:

| Tensor | Size | Built from | Method |
|--------|------|------------|--------|
| `30min` | `(n_seg ≈ 31·192, 4801)` | raw segments | primary |
| `hourly` | `(≤ 31·24, 4801)` | 30-min CCs whose midpoints fall in UTC-hour buckets | linear mean (non-overlapping) |
| `daily` | `(n_days, 4801)` | all 30-min CCs in each DOY | **per-lag median** (robust stack) |

**Reference:** monthly linear mean of *all* 30-min CCs.

Rationale for non-overlapping hourly buckets: the 24 hourly samples per day are then statistically independent, so `np.std` of hourly dv/v is an honest noise estimator. Smoothing (e.g. 24-h running median) is applied post-hoc on the dv/v series at plot time, not baked into the stored tensor.

---

## Parameters

All defined at the top of `src/phase13_pilot.py`.

| Constant | Value | Notes |
|----------|-------|-------|
| `YEAR`, `DOYS` | 2020, 1–31 | January 2020 pilot scope |
| `TARGET_FS` | 40.0 | Needed to whiten up to 19 Hz |
| `HP_FREQ` | 0.4 | Pre-response high-pass |
| `GAP_TAPER_S` | 100.0 | Cosine-taper half-width on each side of a gap |
| `PRE_FILT` | (0.05, 0.1, 18.0, 20.0) | `remove_response` pre-filter |
| `FMIN`, `FMAX` | 2.0, 4.0 | science band |
| `WHITEN_FMIN`, `WHITEN_FMAX` | 0.5, 19.0 | broadband whitening |
| `SEG_TAPER_S` | 20.0 | per-segment cosine taper half-width |
| `CC_LEN`, `CC_STEP` | 1800, 450 | 30-min window, 7.5-min step (75 % overlap) |
| `MAXLAG` | 60.0 | CC truncated to ±60 s |
| `CODA_TBEG`, `CODA_TEND` | 2.0, 8.0 | coda window |
| `NOISE_TBEG`, `NOISE_TEND` | 40.0, 60.0 | SNR noise window |
| `STRETCH_EPS`, `STRETCH_N` | 0.01, 401 | 0.005 %/step grid |
| `STRETCH_USE_ABS` | True | peak chosen by \|corrcoef\| |
| `STRETCH_QC` | 0.5 | \|cc\| threshold for hourly QC variant |
| `MWCS_WIN_S`, `MWCS_STEP_S` | 4.0, 2.0 | sub-window length / step |

---

## dv/v methods

### Stretching (`stretching_dvv`)

Grid-search over 401 trial stretches in ±1 %. For each trial `eps`, resample `cur(lag·(1+eps))` in the selected coda side and compute `corrcoef(ref_coda, interp)`. The peak is chosen by **maximum |corrcoef|** — ambient coda at 2–4 Hz is amplitude-dominant; signed correlation is brittle. The returned `cc_best` is the signed corrcoef at the peak.

QC variant (hourly only): discard measurements with `|cc_best| < 0.5`.

### MWCS (`mwcs_dvv`)

Moving-window cross-spectral in-house. For each sub-window (width 4 s, step 2 s) inside the selected coda side:

1. Hanning taper, FFT both sub-windows.
2. Cross-spectrum `cross = conj(Fref) · Fcur`, phase `φ(f)` in 2–4 Hz.
3. Weighted linear fit `φ(f) = 2π·f·Δt + φ₀` with weights `|cross(f)|`.
4. Record `(lag_mid, Δt, σ_Δt)`.

Then across all sub-windows, weighted regression through the origin of `Δt = -(dv/v)·lag` gives `dv/v ± err`. Returns `(dvv, err, n_sub_windows_used)` per trace.

### Coda sides

Three sides per method per stack level:

- `pos`: `CODA_TBEG ≤ lag ≤ CODA_TEND`
- `neg`: `-CODA_TEND ≤ lag ≤ -CODA_TBEG`
- `both`: `|lag| ∈ [CODA_TBEG, CODA_TEND]`

Pos vs neg asymmetry diagnoses source-side direction effects. `both` is the primary measurement.

---

## Output schema

### `data/phase13/stacks/{tag}_*` (`tag = {net}_{sta}_{loc|X}_{band}`)

- Waveforms / stacks:
  `30min.npy`, `30min_times.npy`, `hourly.npy`, `hourly_times.npy`,
  `daily.npy`, `daily_doys.npy`, `ref.npy`, `lags.npy`, `psd_z.npy`, `psd_e.npy`
- dv/v per method `m ∈ {stretch, mwcs}` × stack level `L ∈ {hourly, daily}` × side `s ∈ {pos, neg, both}`:
  `dvv_{m}_{L}_{s}.npy`, `cc_{m}_{L}_{s}.npy`
  (for MWCS the `cc_*` file holds the formal `Δt` error per measurement)
- QC variants (stretching hourly only):
  `dvv_stretch_hourly_{s}_qc.npy` — raw dv/v with `|cc|<0.5` set to NaN

### `data/phase13/plots/{net}_{sta}.png`

4×2 grid:

| | left | right |
|---|---|---|
| **(0)** | reference stack ±`PLOT_LAG` with coda-pos/coda-neg/noise shaded | daily robust CC section (DOY vs lag) |
| **(1)** | per-day PSD Z / E | daily dv/v: stretching (solid) + MWCS (dashed, error bars) × 3 sides |
| **(2)** | hourly dv/v stretching, 3 sides + 24-h running median | hourly dv/v MWCS, 3 sides + running median |
| **(3)** | stretching \|corrcoef\| histogram, 3 sides | scatter stretching vs MWCS daily, color by side |

### `data/phase13/qc_metrics_jan2020.csv`

One row per station. Columns:

- metadata: `network, station, location, channel_band, state, site_name, status, error, elapsed_s`
- counts: `n_days, n_segments_30min, n_hours`
- spectra: `psd_z_db, psd_e_db`
- SNR: `sc_snr_both, sc_snr_pos, sc_snr_neg`
- dv/v std (12 cols): `dvv_std_pct_{m}_{L}_{s}` for `m ∈ {stretch, mwcs}`, `L ∈ {hourly, daily}`, `s ∈ {pos, neg, both}`
- dv/v std QC (3 cols): `dvv_std_pct_stretch_hourly_{s}_qc`

---

## Expected diagnostics (sanity checks)

Run these against the output CSV + a few station plots right after the full run:

1. **Grid quantization resolved:** `dvv_std_pct_stretch_daily_both` should *not* snap to multiples of 0.005 %. If it still quantizes visibly in the dv/v series plots, inspect the hourly corrcoef histogram — a long tail toward high \|c\| is expected; a narrow band clipped at some eps means the measurement is grid-bound.
2. **Sides consistency:** `stretch_*_both` should track `stretch_*_pos` and `stretch_*_neg` within ~2× on high-SNR stations. Large pos/neg asymmetry flags source-side direction effects or noise dominance on one side.
3. **Method cross-check:** On high-SNR stations, `stretch_daily_both` vs `mwcs_daily_both` should agree within ~1 grid step (0.005 %). Wider divergence on many stations → sub-window length or frequency fit range may need tuning.
4. **Hourly independence:** `sqrt(24) × daily_std ≈ hourly_std` within a factor of ~1.5 for well-behaved stations (from the Central Limit Theorem on 24 independent hourly samples).
5. **PSD sensible:** median Z PSD in 2–4 Hz should be in the −150 to −175 dB range for typical PNW short-period stations.

---

## Running

```bash
# smoke test on 2 fast stations
conda run -n noisepy2 python src/phase13_pilot.py --stations UW.CINE,CC.HUSB

# full 29-station run
conda run -n noisepy2 python src/phase13_pilot.py 2>&1 | tee data/phase13/phase2_run.log
```

Expected wall on cascadia (48 cores, 376 GB): ~30 min for the smoke test (2 stations serialized-ish by I/O), **~2–3 h for the full 29-station run**. Disk footprint ~7–8 GB under `data/phase13/stacks/`.

---

## Scope explicitly *not* in Phase 2

- Multi-band sweep harness (1–2, 1–3, 2–4, 2–3, 3–5 Hz side-by-side on a saved 30-min tensor).
- 90-day trailing linear-stack reference (requires multi-month scope).
- Multi-year extension.
- Z·N and E·N component pairs.
- Band-parameterized output paths for side-by-side band comparisons without overwrite.

These are follow-ups once Phase 2 results settle the Tier A station list.
