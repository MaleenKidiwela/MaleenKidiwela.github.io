# Cranium — Earthnote

> Concise big-picture state of the Earthnote project. Maintained by Claude-desktop routine on a daily cadence. Sources: vault notes in this folder + the project repo. If anything here conflicts with the repo or the latest daily note, trust those and propose an update.

## Associated repos

- [github.com/MaleenKidiwela/Earthnote](https://github.com/MaleenKidiwela/Earthnote) — primary code: NoisePy-based dv/v pipeline (PNW single-station cross-component, scaling to inter-station). Currently 4 commits on `main`, last activity 2026-05-12.

## Status

Phase 2/2.1/2.2 pilot iterations are running on the 29-station January 2020 pool at 2–4 Hz (Z·E, Clements-style broadband-whitened recipe). The stretching-grid quantization that broke Phase 1.3 is resolved; per-station hourly dv/v is now genuinely usable on ~7 stations. Phase 2.4 hyperparameter sweep is scoped but not yet executed. Marine has signed off on the single-station path before any scaling.

## Goals

- Build a PNW-wide single-station cross-component (SC) dv/v monitoring system over all PNSN/PNW stations, then extend to inter-station pairs.
- Validate the pipeline on a small, known-good station pool before scaling to multi-year production.
- Produce stable hourly-resolution dv/v on Tier A stations; daily-only dv/v elsewhere.
- Eventually: spatial dv/v maps, correlation with Cascadia slow slip / volcanic / environmental signals, automated production pipeline + monitoring dashboard (Phases 4–8 in `PROJECT_PLAN`).

## Key questions

- Which stations consistently produce hourly-resolution dv/v vs. daily-only? (Tier A vs B vs C — see Phase 1.3 Results.)
- What is the right adaptive coda-window criterion? Phase 2.1's IQR/median-based rule shrinks the window on some stations and hurts std (CBS, MANO); proposed fix is "default-or-wider only."
- Which frequency band + coda window combination maximizes correlation coefficient per station? (Phase 2.4 sweep.)
- Are pos / neg / both coda sides telling us about source asymmetry?
- For non-Tier-A stations, do 6–12 h trailing stacks clean up the hourly signal enough to keep them in scope?

## Decisions

- **2026-05-12** — Phase 2/2.1/2.2 iterations backed up; superseded recompute/replot helpers dropped; `.gitignore` extended to skip heavy `stacks_*/` and `logs_*/`.
- **2026-04-29** — Adopted 48-h rolling phase-weighted stack stepped at 1 h as the Phase 2.1 hourly substrate; adaptive coda window via log-envelope (median + 5/95 %ile spread + 2× noise-floor floor).
- **2026-04-22** — Killed Phase 1.3 as the production recipe after stretching-grid quantization at ±0.06 % surfaced. Moved to Phase 2.0 (Tim Clements' California recipe): broadband whitening 0.5–19 Hz, 30-min CCs at 75 % overlap, science band 2–4 Hz, MWCS as independent second method.
- **2026-04-22** — Run 2 monthly reference rebuilt from the **hourly CC tensor**, not mean-of-daily-stacks. Boosted SNR across the board (HUSB 50→61, RADR 41→56, TOLE 24→40).
- **2026-04-15** — Used `latest_ge_2d_ago` (not strict yesterday) as the "actively delivering" FDSN gate, so PB / OO / IU.COR with legitimate 1-day archive lag aren't dropped.
- **2026-04-15** — Offshore flag is `elevation_live < 0`, not Natural Earth land polygons (which misflagged San Juans / Vashon islands as offshore).
- **2026-04-14** — Sampled 4 DOYs per year (1, 90, 180, 270) for the Phase 1.1 inventory instead of full-year scan — ~3 min runtime, acceptable miss rate for dv/v candidates (which need ≥1 year anyway).

## Issues + solutions

- **Stretching grid quantization** at ±0.06 % in Phase 1.3 (`STRETCH_N=101`, `EPS=0.03`). → Switched to `STRETCH_N=401`/`EPS=0.01` in Phase 2.0 (and `STRETCH_N=6001`/`EPS=0.03` in Phase 2.1), eliminated the staircase.
- **Inconsistent `n_lags` across days for CN stations.** → Enforced `int(round(maxlag * TARGET_FS))` rather than reading `fs` per trace.
- **`compute_coherence_raw` / PPSD failures on short days** (`noverlap ≥ nperseg`). → Cap `nperseg ≤ len(x)`, use `nperseg//2` for overlap.
- **PB / OO false-zero "active yesterday"** due to 1-day archive ingest lag. → Added `latest_ge_2d_ago` permissive gate.
- **Phase 1.1 4-DOY sampling missed 24 % of currently-active stations** (post-2023 deployments). → Added EarthScope FDSN live channel query (Phase 1.2a) and joined back.
- **MWCS NaN on stations with adaptive coda < ~6 s** (CBS, SNI2, DDRF, MANO, OT3, EPH2). → Accepted as a feature — short lag baseline can't fit the through-origin phase-slope regression. Keep stretching as primary for those stations.
- **ZE coherence is a weak metric at 1–3 Hz** (raw coherence 0.04–0.19 with no separation between top and bottom SNR). → Dropped from Phase 2 pass/fail; stretching corrcoef per CC is the primary coherence metric.

## Recent activity

- **05-12** — Phase 2/2.1/2.2 backup commit; `step_03_new_workflow` and `step_04_quality_screening` docs added.
- **04-29** — Phase 2.1 adaptive coda window run across all 29 stations; ranking table by SC SNR with per-station coda windows. UW.MDW extended to [1.50, 12.62] s (clear win); CBS/MANO narrowed and lost (proposed fix: "default-or-wider only").
- **04-28** — Internals review of `stack_hourly_utc` and the hourly dv/v measurement path; identified four levers for Phase 2.1.
- **04-22** — Meeting with Marine. Phase 1.3 Run 1 + Run 2 produced the 29-station pilot results. UW.RADR + UW.CINE identified as hidden gems (best hourly-QC dv/v std in the pool). Phase 2.0 launched.
- **04-15** — Phase 1.2a (FDSN currently-active subset) + Phase 1.2b (PNWstore full-year availability scan) → 801-combo shortlist → 676-combo Phase 1.3 pilot pool + 1303-combo forward-monitoring roster.
- **04-14** — Phase 1.1 PNW station inventory (19,648 station-bands, 3,289 unique stations, dv/v capability scoring → 490 excellent / 2,951 good).
- **04-13** — Paros planning symposium Day 01 (context/adjacent, not direct Earthnote work).

## Explorations

- **Phase 1.3 Run 1 with `[2, 30]` s coda** — *parked* in favor of `[2, 10]` s after Run 2 confirmed coherent SC coda at 1–3 Hz is narrow.
- **Phase 1.3 daily-only-reference** — *abandoned* in favor of hourly-tensor reference (Run 2). Gave the SNR boost above.
- **Adaptive coda window via IQR/median spread + noise floor** — *kept but bounded* — works for widening (MDW), hurts for narrowing. Net effect across the array is neutral.
- **NoisePy vs SeisGo vs Conda Python 3.10 env** (decision flagged 04-02) — resolved by running NoisePy directly inside `noisepy2` conda env (Python 3.10) on cascadia.
- **Z·E only vs full SC** — *parked* — Phase 2 stays Z·E; Z·N and E·N extension is a Phase 2 follow-up once Tier A is locked.

## Lessons learned

- **Reference construction dominates SNR.** Mean-of-hourly-CCs beats mean-of-daily-stacks because partial / short days no longer get pre-averaged before contributing.
- **Grid resolution matters more than method choice on quiet stations.** The stretching ceiling looked like noise but was the trial-stretch grid; refining `eps`/`n_trial` recovered an extra octave of resolution.
- **Narrowing the coda window can hurt even when "removing noise."** Lags below default 2 s still contain signal that contributes constructively to stretching cc.
- **Hourly raw std ≈ √24 × daily std** on well-behaved stations is a clean sanity check that the pipeline isn't injecting non-statistical noise.
- **Coherence-on-raw-segments ≠ coda-domain coherence.** Don't gate on plane-wave coherence at the band of interest — the scattering field is what dv/v measures.
- **Offshore detection via elevation beats geometry.** Faster, no PNW island false positives.

## Ideas

- "Default-or-wider only" adaptive coda criterion — start from `[2, 8]` and only **extend** if the spread + noise-floor test passes outside that.
- Per-hour reference (stack only the same hour-of-day across the month) to remove diurnal source-spectrum bias from the hourly dv/v.
- Adaptive QC threshold per station based on local SNR rather than the global `|cc| ≥ 0.5`.
- 6- or 12-h trailing stack on Tier B stations to lift them into hourly resolution.
- ML anomaly detection on long dv/v timeseries (Phase 7 territory).
- Inversion of station-pair dv/v for spatially resolved velocity maps (Phase 6).

## Future steps

1. **Phase 2.4 hyperparameter sweep** — execute the planned outer-product of frequency band × coda window × channel-pair averaging on the saved 30-min tensors (no need to re-CC).
2. **Phase 2 multi-year extension** on Tier A + selected Tier B — 2020–2026 with monthly moving-reference stacks; turn the pilot into a science run.
3. **Cross-validate stretching vs MWCS on Tier A** to confirm the hourly-QC std is method-limited, not noise-limited.
4. **Add Z·N and E·N component pairs** — compare cleanest pair per station.
5. **Document the 24-h running-median hourly series** once Phase 2 is multi-year, to catch coseismic steps from M6+ teleseisms.
6. **Forward-monitoring pipeline** (parallel track): FDSN-direct ingest for the 122-station roster of post-2023 deployments invisible to PNWstore.

## Timeline

- **2026-05-12** — Phase 2/2.1/2.2 backup, workflow docs, `.gitignore` cleanup.
- **2026-05-06** — (note exists but empty — placeholder).
- **2026-05-05** — Phase 2.0 / 1.3 Plan / 1.3 Results / Phase 2.0 docs touched; Cascadia dv.v anchor refreshed.
- **2026-04-29** — Phase 2.1 adaptive coda window + 29-station ranking.
- **2026-04-28** — Internals review (`stack_hourly_utc` walkthrough) feeding into Phase 2.1.
- **2026-04-22** — Marine meeting; Phase 1.3 Plan + Run 1 + Run 2 (with hourly dv/v) executed; pivot to Phase 2.0; commit `37707af`.
- **2026-04-18** — Phase 1.3 plan / results / codex comparison notes refreshed.
- **2026-04-16** — Commit `27cac06`: Phase 1 complete → Phase 1.3 pilot pool.
- **2026-04-15** — Phase 1.2a + Phase 1.2b: FDSN active subset + PNWstore availability scan + pilot pool + forward-monitoring roster.
- **2026-04-14** — Phase 1.1 PNW station inventory.
- **2026-04-13** — Paros planning symposium Day 01.
- **2026-04-06** — Project repo initialized (commit `49e32bf`); `PROJECT_PLAN.md` lays out Phases 1–8.
- **Pre-2026-04-06** — (collapsed) scoping conversations and methodology selection (NoisePy + Cascadia compute).
