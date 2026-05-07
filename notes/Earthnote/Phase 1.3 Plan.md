
### Phase 1.3 Pilot Quality Screening (design doc)

**Date:** 2026-04-22
**Phase:** 1.3 (per [[PROJECT_PLAN]])
**Pilot scope:** **29 stations · January 2020 · Z + E components · 1–3 Hz band · single-station cross-component (SC) — no autocorrelations**
**Output:** `data/phase13/qc_metrics_jan2020.csv` + per-station diagnostic plots + stacked CC files
**Script:** `src/phase13_pilot.py`

**This document captures the pre-execution design.** For the actual run results (two rounds — initial and fresh-with-hourly-dv/v), see [[Phase 1.3 Results]]. Pipeline constants below (e.g. coda window `[2, 30]`) were revised during execution; the final pipeline used `[2, 10]` and added hourly-resolution dv/v — see the results doc for the final form. The stretching-grid quantization seen in the results motivated the move to [[Phase 2.0]]. Project anchor: [[Cascadia dv.v]].

---

## Purpose

Validate the SC cross-component pipeline end-to-end on a small, known-good set of stations *before* scaling to multi-year production. This is a QC run, not a science run: we want to identify which stations produce a clean, stable Z–E Green's function in the 1–3 Hz band, and we want to lock in config choices (spectral whitening, time normalization, stacking) on real PNW data.

Autocorrelations are **excluded** from this pilot — we're isolating the cross-component pathway because it's the harder case and the one that most strongly filters unusable stations.

---

## Station selection

Input: `data/inventory/suitable_1to3Hz_SC.csv` (29 stations / 44 from the 2020–2026 full-coverage set, restricted to BH + HH because accelerometers have self-noise at or above ambient at 1–3 Hz).

Breakdown: 4 BH (IU.COR + CC.HUSB / WIFE / SHRK), 25 HH (CN, UO, UW across BC / OR / WA). Geographic coverage: BC + Vancouver Island, Three Sisters / Mt. Hood, Oregon Coast + Klamath + Basin&Range + Wallowas, WA Cascade foothills (both sides), WA eastern basin (Columbia plateau — dense).

Every combo has ≥95 % 3C co-availability every calendar year 2020–2026 per `availability_matrix.parquet` + `availability_matrix_post2023.parquet`, so data presence for January 2020 is essentially guaranteed.

---

## Time window

**Month:** 2020-01-01 through 2020-01-31 (31 days).

Reason for January 2020: fully pre-pandemic (so the urban-noise anomaly that hit Q2 2020 is not in play yet), well inside PNWstore coverage (no mount issues), all 29 stations are known to have 3C data.

---

## Processing pipeline

Per station, per day:

1. **Load** Z + E daily traces from PNWstore via `/1-fnp/pnwstore1/p-wd00/PNW2020/{NET}/2020/{DOY}/{STA}.{NET}.2020.{DOY}`.
2. **Instrument response removal** using local StationXML (`/1-fnp/pnwstore1/p-wd11/PNWStationXML/{NET}/{NET}.{STA}.xml`), output units = velocity.
3. **Decimate** to 20 Hz (we need > 6 Hz Nyquist for 3 Hz; 20 Hz gives 10 Hz Nyquist with a clean anti-alias).
4. **Bandpass** 0.5–5 Hz (one-octave padding around the 1–3 Hz science band).
5. **Hourly segmentation** — `cc_len = 3600 s`, `step = 1800 s` (50 % overlap) → 47 segments/day.
6. **Per-segment preprocessing:**
   - Spectral whitening (`rma`) across the 1–3 Hz band.
   - One-bit time normalization.
7. **Cross-correlation** — Z·E in the frequency domain, `maxlag = 60 s`.
8. **Daily stack** — linear stack of all hourly ZE CCs for that day.

Month-level:

9. **Reference stack** — linear stack of all 31 daily stacks.

---

## Quality metrics (per station)

| Metric | How | Pass band |
|--------|-----|-----------|
| **PPSD** noise floor | `obspy.signal.PPSD` per component, report median PSD in dB ref 1 (m/s²)²/Hz averaged over 1–3 Hz | — |
| **ZE coherence** | `scipy.signal.coherence` on raw (pre-CC) 1-hour segments, averaged across segments then averaged across 1–3 Hz | 1–3 Hz |
| **SC CC SNR** | peak amplitude in coda window (\|lag\| ∈ [2, 30] s) divided by RMS in noise window (\|lag\| ∈ [40, 60] s) of the monthly reference stack | — |
| **dv/v stability** | stretching dv/v of each daily stack vs. monthly reference in coda window \|lag\| ∈ [2, 30] s, report `std(dv/v)` across the 31 days | 1–3 Hz |

Promotion criteria for Phase 2 (to be finalized after the pilot):
- ZE coherence ≥ 0.3 (1–3 Hz)
- SC CC SNR ≥ 5
- dv/v stability std ≤ 0.5 %

---

## Parallelization

Cascadia has 48 cores / 376 GB. Each station is independent. We use `ProcessPoolExecutor` with `max_workers = 29` (one worker per station). Inside each worker: single-threaded numpy/scipy. Expected wall time: ~10–20 minutes.

Per-worker memory is small (one day ≈ 2 channels × 86400 samples × 8 B ≈ 1.3 MB raw; full month in memory per channel ≈ 40 MB; hourly CCs are small). Well within 376 GB / 29 workers.

---

## Outputs

| File | Description |
|------|-------------|
| `data/phase13/qc_metrics_jan2020.csv` | One row per station with all four QC metrics + pass/fail flag |
| `data/phase13/stacks/{net}_{sta}_{loc}_{band}_ze_ref.npy` | Monthly reference Z–E CC trace (shape = 2·maxlag·fs + 1) |
| `data/phase13/stacks/{net}_{sta}_{loc}_{band}_ze_daily.npy` | Per-day daily stacks, shape (31, n_lags) |
| `data/phase13/plots/{net}_{sta}.png` | 4-panel diagnostic: PPSD (Z, E), ref CC, CC section by day, dv/v timeseries |

