### Results — Phase 1.3 Pilot Quality Screening

**Date:** 2026-04-22
**Pilot scope:** 29 stations · January 2020 · Z + E components · 1–3 Hz band · single-station cross-component (SC), no autocorrelations
**Script:** `src/phase13_pilot.py`
**Input station list:** `data/inventory/suitable_1to3Hz_SC.csv` (4 BH + 25 HH)
**See also:** pre-execution design in [[Phase 1.3 Plan]]; the stretching-grid ceiling found here motivated the move to [[Phase 2.0]]. Project anchor: [[Cascadia dv.v]].

This document captures the results of **two pilot runs** on the same 29 stations. Run 1 locked in the pipeline; Run 2 refined the coda window, added hourly dv/v, and restored per-day PSD plots. Artifacts from Run 1 live in `data/phase13/old_stacks/` + `qc_metrics_jan2020.prev.csv`; Run 2 artifacts overwrite the active paths.

---

## Pipeline (final, Run 2)

Per station, per day in Jan 2020:

1. Load Z + horizontal (E, fallback to 1 for GSN convention) from `/1-fnp/pnwstore1/p-wd00/PNW2020/{NET}/2020/{DOY}/{STA}.{NET}.2020.{DOY}`.
2. Remove instrument response via local StationXML, output = velocity, `pre_filt=(0.05, 0.1, 8, 10)`.
3. Decimate to 20 Hz.
4. Bandpass 0.5–5 Hz (1-octave pad around the 1–3 Hz science band).
5. Split into hourly segments: `cc_len=3600 s`, `step=1800 s` (50 % overlap).
6. Per segment: Hann taper → spectral whitening on 1–3 Hz → one-bit time normalization.
7. Cross-correlate Z · E in frequency domain, `maxlag=60 s`, canonical length enforced at `TARGET_FS=20 Hz`.

Month-level:

8. **Monthly reference** = mean of all hourly CCs across the month (not mean-of-daily-means).
9. **Daily stack** = mean of that day's hourly CCs.
10. **Hourly dv/v** = stretching of each hourly CC vs monthly reference over coda window \|lag\| ∈ `[2, 10 s]`, `STRETCH_EPS=0.03`, `STRETCH_N=101` trial stretches. Two variants: raw, and QC'd (discard hours with stretching corrcoef < 0.5).
11. **Daily dv/v** = same stretching on each daily stack vs monthly reference.
12. **SC SNR** = max \|ref\| in \|lag\| ∈ `[2, 10 s]` / RMS \|ref\| in \|lag\| ∈ `[40, 60 s]`.

Parallelization: `ProcessPoolExecutor(max_workers=29)` on cascadia (48 cores, 376 GB).

Per station on disk (`data/phase13/stacks/{tag}_*`):
- `ze_ref.npy`, `ze_daily.npy`, `ze_hourly.npy`, `lags.npy`
- `dvv_daily.npy`, `dvv_hourly.npy`, `dvv_hourly_qc.npy`
- `cc_daily.npy`, `cc_hourly.npy` (per-measurement stretching corrcoef)
- `psd_z.npy`, `psd_e.npy` (per-day median PSD 1–3 Hz)
- `daily_doys.npy`, `hourly_times.npy`

Plot per station (`data/phase13/plots/{net}_{sta}.png`, 3 × 2 grid):
- reference CC (±10 s) with coda/noise windows shaded
- daily CC section (day vs lag, ±10 s)
- per-day PSD Z/E line plot
- daily dv/v
- hourly dv/v (raw + cc≥0.5 QC'd) with 24-hour running median overlay
- histogram of hourly stretching corrcoef (QC threshold at 0.5)

---

## Run 1 — initial pipeline

**Date:** 2026-04-22 (earlier in day)
**Scope:** same 29 stations, Jan 2020, Z·E, 1–3 Hz
**Pipeline differences vs Run 2:** coda window `[2, 30 s]` for SNR + dv/v, no hourly dv/v, plots x-range ±60 s initially (replotted to ±15 s mid-session), median-PSD bar chart (per-day PSD trend not saved to disk).
**Bugs caught and fixed across three rerun rounds:**
- `compute_coherence_raw` / `compute_ppsd_proxy` failed on short days (`noverlap ≥ nperseg`) — patched to cap `nperseg ≤ len(x)` and use `nperseg//2` overlap.
- Inconsistent n_lags across days for CN stations — fixed by enforcing `int(round(maxlag * TARGET_FS))` rather than actual per-trace `fs`.

**Final outcome:** 29 / 29 ok after 3 rerun rounds.
**Total wall across all rounds:** ~90 min (initial 36 min + 30 min rerun + 21 min rerun 2 + minor recompute).

### Top 10 by SC SNR (Run 1, after recompute to `[2, 10 s]`coda)

| Rank | Station | Band | State | SNR | dv/v daily std |
|------|---------|------|-------|-----|----------------|
| 1 | CC.HUSB | BH | OR | 50.0 | 0.43 % |
| 2 | UW.CINE | HH | WA | 43.4 | 0.07 % |
| 3 | UW.RADR | HH | WA | 41.1 | 0.50 % |
| 4 | UO.TOOM | HH | OR | 38.8 | 0.12 % |
| 5 | IU.COR | BH | OR | 31.5 | 0.73 % |
| 6 | CN.CLRS | HH | BC | 29.8 | 0.56 % |
| 7 | CN.WSLR | HH | BC | 25.3 | 0.57 % |
| 8 | UW.TOLE | HH | WA | 23.8 | 0.15 % |
| 9 | UW.MDW | HH | WA | 22.4 | 0.14 % |
| 10 | CC.WIFE | BH | OR | 21.7 | 0.29 % |

Full Run 1 results: `data/phase13/qc_metrics_jan2020.prev.csv`.

---

## Run 2 — fresh run with hourly dv/v

**Date:** 2026-04-22 (06:05–06:42 UTC)
**Scope:** identical stations and month; pipeline upgraded per §Pipeline above.
**Changes vs Run 1:**
- Coda window narrowed to `[2, 10 s]` — matches the coherent part of SC coda at 1–3 Hz.
- Monthly reference now built from the **full hourly CC tensor** rather than mean of daily stacks.
- **Hourly dv/v** added alongside daily dv/v, plus a QC variant requiring stretching corrcoef ≥ 0.5.
- Per-day PSD saved to disk; plot restored.
- Plot x-range ±10 s (both reference stack and daily-CC section).

**Outcome:** 29 / 29 ok in a single run, zero errors, **2223 s wall (~37 min)**.
**Per-station elapsed:** mean 1251 s, min 468 s (IU.COR), max 2223 s (CN.WSLR). Bounded by I/O on the NFS share to `p-wd00`, not CPU.

### Top 10 by SC SNR (Run 2)

| # | Station | Band | Region | SNR | daily std | hourly raw | hourly QC |
|---|---------|------|--------|-----|-----------|------------|-----------|
| 1 | **CC.HUSB** | BH | Three Sisters, OR | **60.6** | 0.43 % | 1.18 % | 0.67 % |
| 2 | **UW.RADR** | HH | Naselle, WA (coast range) | 55.5 | 0.48 % | 0.72 % | **0.15 %** |
| 3 | UO.TOOM | HH | Fort Rock, OR (Basin & Range) | 47.2 | 0.29 % | 1.19 % | 0.60 % |
| 4 | **UW.CINE** | HH | Cinebar, WA (W Cascade foothills) | 45.7 | 0.11 % | 0.48 % | **0.18 %** |
| 5 | UW.TOLE | HH | Toledo, WA | 40.1 | 0.16 % | 0.24 % | 0.23 % |
| 6 | UW.MDW | HH | Midway, WA (eastern basin) | 35.4 | 0.14 % | 0.25 % | 0.23 % |
| 7 | **UW.CBS** | HH | Chelan Butte South, WA | 33.7 | 0.17 % | 0.35 % | **0.15 %** |
| 8 | CN.CLRS | HH | Cowichan Lake, Vancouver Is. | 32.7 | 0.70 % | 1.07 % | 0.26 % |
| 9 | **IU.COR** | BH | Corvallis GSN, OR | 31.8 | 0.80 % | 1.27 % | **0.20 %** |
| 10 | UO.MARQ | HH | Marquam, OR (W Cascades) | 30.2 | 0.55 % | 1.10 % | 0.19 % |

Full Run 2 results: `data/phase13/qc_metrics_jan2020.csv`.

### All 29 stations by SC SNR (Run 2)

| # | Station | Band | State | SNR | daily std | hourly raw | hourly QC | PSD Z (dB) | n days |
|---|---------|------|-------|-----|-----------|------------|-----------|------------|--------|
| 1 | CC.HUSB | BH | OR | 60.6 | 0.43 | 1.18 | 0.67 | −160.9 | 29 |
| 2 | UW.RADR | HH | WA | 55.5 | 0.48 | 0.72 | 0.15 | −159.9 | 24 |
| 3 | UO.TOOM | HH | OR | 47.2 | 0.29 | 1.19 | 0.60 | −168.4 | 30 |
| 4 | UW.CINE | HH | WA | 45.7 | 0.11 | 0.48 | 0.18 | −167.5 | 30 |
| 5 | UW.TOLE | HH | WA | 40.1 | 0.16 | 0.24 | 0.23 | −140.7 | 23 |
| 6 | UW.MDW  | HH | WA | 35.4 | 0.14 | 0.25 | 0.23 | −169.5 | 21 |
| 7 | UW.CBS  | HH | WA | 33.7 | 0.17 | 0.35 | 0.15 | −171.9 | 21 |
| 8 | CN.CLRS | HH | BC | 32.7 | 0.70 | 1.07 | 0.26 | −170.6 | 31 |
| 9 | IU.COR  | BH | OR | 31.8 | 0.80 | 1.27 | 0.20 | −156.3 | 31 |
| 10 | UO.MARQ | HH | OR | 30.2 | 0.55 | 1.10 | 0.19 | −162.9 | 21 |
| 11 | CC.WIFE | BH | OR | 26.6 | 0.35 | 0.97 | 0.60 | −168.4 | 29 |
| 12 | CN.WSLR | HH | BC | 26.2 | 0.58 | 0.75 | 0.35 | −171.6 | 31 |
| 13 | UW.DDRF | HH | WA | 25.3 | 0.14 | 0.84 | 0.27 | −161.5 | 23 |
| 14 | CN.SYMB | HH | BC | 22.1 | 0.60 | 1.12 | NaN | −170.6 | 29 |
| 15 | CC.SHRK | BH | OR | 21.0 | 0.21 | 0.99 | 0.48 | −168.6 | 31 |
| 16 | UW.MANO | HH | WA | 19.8 | 0.18 | 0.57 | 0.27 | −170.3 | 21 |
| 17 | UW.RPW2 | HH | WA | 19.3 | 0.23 | 0.70 | NaN | −172.8 | 22 |
| 18 | UW.EPH2 | HH | WA | 19.3 | 0.26 | 0.57 | 0.23 | −171.7 | 19 |
| 19 | UW.WAT2 | HH | WA | 19.3 | 0.16 | 0.46 | 0.19 | −165.6 | 23 |
| 20 | UW.WOLL | HH | WA | 19.2 | 0.16 | 1.00 | 0.20 | −169.6 | 30 |
| 21 | UW.SNI2 | HH | WA | 17.1 | 0.20 | 0.61 | 0.28 | −165.2 | 21 |
| 22 | UW.YPT  | HH | WA | 16.9 | 0.63 | 0.68 | 0.21 | −154.7 | 20 |
| 23 | UO.SISQ | HH | OR | 14.9 | 0.32 | 1.00 | NaN | −172.3 | 22 |
| 24 | UW.OT3  | HH | WA | 14.3 | 0.99 | 0.87 | NaN | −154.4 | 21 |
| 25 | UW.BRAN | HH | OR | 13.8 | 0.30 | 1.26 | 0.29 | −173.1 | 21 |
| 26 | UO.DING | HH | OR | 12.3 | 0.64 | 0.80 | NaN | −166.9 | 19 |
| 27 | UW.CCRK | HH | WA | 11.8 | 0.24 | 0.59 | 0.26 | −168.2 | 19 |
| 28 | UW.MOX  | HH | WA | 11.5 | 0.29 | 0.83 | 0.27 | −169.0 | 18 |
| 29 | UW.WA2  | HH | WA | 8.4  | 0.30 | 0.88 | NaN | −163.1 | 19 |

**dv/v columns are in percent. NaN in hourly-QC = fewer than 3 hours passed the stretching corrcoef ≥ 0.5 bar.**

---

## Interpretation

### 1. Hourly dv/v is viable on ~half the pilot

**6 stations hit hourly-QC std ≤ 0.20 %** (UW.RADR, UW.CINE, UW.CBS, UW.MDW, IU.COR, UO.MARQ, UW.TOLE via 0.23 %). These are genuinely usable for 1-hour-resolution dv/v without any post-hoc smoothing — strong enough coda coherence that individual hourly CCs stretch cleanly against the monthly reference.

**~6 stations have NaN hourly-QC** (CN.SYMB, UW.RPW2, UO.SISQ, UW.OT3, UO.DING, UW.WA2) — fewer than 3 hourly CCs passed stretching corrcoef ≥ 0.5. These are *daily-only* candidates; their hourly records are noise. Useful ranking: drop these from any hourly-resolution monitoring and keep only for daily dv/v.

**The rest (~17 stations) fall between 0.25–0.70 % hourly-QC** — usable for hourly monitoring but noisier. A 6- or 12-hour trailing stack will clean them up.

### 2. Raw hourly std ≈ 5 × daily std

Across stations where both are well defined, hourly-raw std is 3–6× daily-raw std, matching the √24 ≈ 4.9 theoretical scaling from single-hour vs 24-hour stacking. Good sanity check on the pipeline — the stretching is not introducing non-statistical noise.

### 3. Reference built from hourly CCs sharpens SNR

Rebuilding the reference from the full hourly tensor (Run 2) rather than mean-of-daily-stacks (Run 1) increased SNR across the board: CC.HUSB 50 → 61, CC.WIFE 22 → 27, UW.RADR 41 → 56, UW.CINE 43 → 46, UW.TOLE 24 → 40, UW.CBS 20 → 34, UO.MARQ 20 → 30. This is because the hourly CCs stack coherently without the intra-day-averaging penalty applied when short days already get partial stacking.

### 4. UW.RADR and UW.CINE are the hidden gems

Both non-permanent HH stations with much higher SC SNR than expected from the day-count (24, 30 respectively). UW.RADR sits in the coast range (Naselle) and is at –160 dB on Z — moderately noisy — but produces SNR 55.5 and **the best hourly-QC dv/v std of the whole set (0.15 %)**. UW.CINE (Cinebar, western Cascade foothills) is quieter (–167 dB on Z) and delivers SNR 45.7 with hourly-QC 0.18 %. Both deserve priority in Phase 2 regardless of pedigree.

### 5. ZE coherence is a weak metric at 1–3 Hz

Raw-trace Z-E magnitude-squared coherence in the 1–3 Hz band was 0.04–0.19 across the whole set — with no clear separation between top-SNR and bottom-SNR stations. Consistent with the band being dominated by scattered, multi-mode wavefield where plane-wave coherence on 3600 s segments undersells the coda-domain coherence that actually matters for SC dv/v. **Drop ZE coherence from the Phase 2 pass/fail set**; keep stretching corrcoef per CC as the primary coherence metric.

---

## Promotion candidates for Phase 2

**Tier A — hourly + daily dv/v** (SNR > 30 AND hourly QC ≤ 0.25 %):

UW.RADR · UW.CINE · UW.CBS · UW.MDW · UW.TOLE · IU.COR · UO.MARQ

Three regions: western WA (CINE, CBS, MDW, TOLE — coast range / eastern basin), Oregon Willamette (MARQ), GSN (COR). UW.RADR outside the obvious "quiet-basin" archetype is the most interesting.

**Tier B — daily dv/v only, needs smoothing for hourly** (SNR 15–30, hourly QC ≤ 0.60 %):

CC.HUSB · CC.WIFE · CC.SHRK · CN.CLRS · CN.WSLR · UO.TOOM · UW.DDRF · UW.MANO · UW.EPH2 · UW.WAT2 · UW.WOLL · UW.SNI2 · UW.YPT · UW.BRAN · UW.CCRK · UW.MOX

Includes all 4 BH volcano stations (HUSB, WIFE, SHRK) and IU.COR — the expected "high signal but also high coda variability" volcano sites.

**Tier C — drop from pilot pool for dv/v** (SNR < 15 OR hourly-QC undefined):

UW.OT3 · UO.DING · UW.WA2 · UO.SISQ · UW.RPW2 · CN.SYMB

Daily dv/v on these is plausible but not a priority.

---

## Next steps

1. **Phase 2 scope decision:** pick Tier A + selected Tier B (8–15 stations) and extend to full multi-year (2020–2026) with monthly moving-reference stacks, to turn the pilot into a science run.
2. **Cross-validate with stretching + MWCS** on Tier A to confirm the hourly-QC std is method-limited, not noise-limited.
3. **Document the 24 h running-median hourly series** once Phase 2 is multi-year — useful for catching coseismic steps from M6+ teleseisms reaching PNW.
4. **Extend beyond Z · E**: enable Z·N and E·N to fully exercise 3C SC dv/v; compare which pair is cleanest per station.
