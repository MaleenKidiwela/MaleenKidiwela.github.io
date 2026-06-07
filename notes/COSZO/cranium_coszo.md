# Cranium — COSZO

> Concise big-picture state of the Cascadia Offshore Subduction Zone Observatory project. Maintained by Claude-desktop routine on a daily cadence. Sources: vault notes in this folder + the three project repos. If anything here conflicts with the repos or the latest daily note, trust those and propose an update.

## Associated repos

- [github.com/coszo-hub/chronfix](https://github.com/coszo-hub/chronfix) — timing **correction** package; applies the per-segment-smoothed Δt model from chronos to raw MiniSEED. Created 2026-04-29.
- [github.com/coszo-hub/Tidal-Seafloor-Pressure](https://github.com/coszo-hub/Tidal-Seafloor-Pressure) (aka **PREST**) — monorepo for the tidal seafloor pressure pipeline and derived-product scripts that will eventually replace the current `coszo-data-collection` workflow. Created 2026-04-28.
- [github.com/MaleenKidiwela/chronos](https://github.com/MaleenKidiwela/chronos) — timing **detection** package; ambient-noise CC pipeline (`chronos.scripts.{download_data, compute_ccf, compute_peak_lag, combine_clock, filter_and_triggers, plot_ccf}`) + uncertainty diagnostic. Created 2026-04-02. Will eventually move into `coszo-hub`.

## Status

Chronos (detection) + Chronfix (correction) form a working end-to-end pipeline for HYS14, validated full-record on 4 years of OO.HYS12/HYS14 MHZ data. The v3 rolling-median segment smoother brought the post-correction hourly peak-lag outlier rate (|x|>5 s) from the v1 buggy 0.81 % through a worse v2 linear-fit (6.33 %) down to 0.30 %, with a 3.16× lift in long-term reference CCF RMS. An uncertainty diagnostic (σ_lag ≈ 0.002 s, σ_model ≈ 0.077 s median) was added 2026-05-05. The main data-collection code is mid-migration: legacy gap-detection is being replaced by the investigator's integer-step + OLS approach (Phase 0 → Phase 2 of `code migration`), with daily metrics destined to sync to `coszo-hub/PREST`. Website restructuring is underway for the **Science Advisory Committee meeting on 2026-05-18** — first pass through the nav restructure and Data rename landed 2026-05-07. RAG-over-notes prototype is live at `/chat` on the notes site. The **SAC meeting was held 2026-05-18**: a six-node network is confirmed for a late-August deployment cruise. Focus has since shifted to **EarthScope data submission** (channel list finalized 2026-05-27, NetCDF→MiniSEED flow, ring-server push), the **seedlink + cron QC pipeline** for tidal pressure, huddle-testing the broadband seismometers toward five units before the cruise, and a **COSZO-VM expansion** (dedicated COSZO machine; current VM retained for PREST / VEL3D / SCPR). Science-writing threads in flight: the Axial acoustic-ranging paper, a Fibre-sensing-workshop abstract, and the Optical-sensing-conference (Kona) abstract.

## Goals

- Operate the COSZO Cascadia offshore subduction-zone observatory data pipeline reliably end-to-end: OOI/IRIS ingest → quality diagnostics → derived products → website.
- Ship the Chronos + Chronfix timing toolchain as standalone, station-agnostic packages — HYS14 is the worked example.
- Add Baros for pressure calibration (Axial Seamount SCPR + A0A as examples).
- Land website restructure (Science / Sites / Data sections + visual editor) and example tidal pressure data on IRIS in time for the Science Advisory Committee meeting on 2026-05-18.
- Convert the legacy script-based pipeline into reusable repos under `coszo-hub` that external collaborators can run.

## Key questions

- **Sub-hour clock-drift curvature.** Chronos models Δt at hourly cadence; what's the right way to bound sub-hour interpolation error? Proposed leave-one-out / even-odd-hour test not yet implemented.
- **Trigger-boundary uncertainty.** Trigger times are only known to ~1 hour; the corrected output is split at boundaries rather than interpolated through. Is that the right product, or should we surface per-trigger uncertainty bounds?
- **Reporting `rms_residual_s` and percentile residuals** in `segment_summary.csv` — one-liner add; not yet shipped.
- **`shift_only` mode in chronfix** when modeled Δt over a segment varies by < ½ sample — accepted as the right safety net, not yet wired.
- **Picker-quantum mitigation upstream.** Parabolic fit recovers sub-sample info from CCFs (already implemented). Should the picker itself output sub-sample lags by default?
- **Which sites get instrument-list/depth/role content in time for SAC?** Hydrate Ridge / Slope Base / Axial Seamount stubs exist but lack body content.
- **Snakemake/Nextflow or notebook-driven pipeline** for the COSZO data collection — open from the BransfieldEQ side too; same call across both projects.

## Decisions

- **2026-06-03** — COSZO-VM expansion: a dedicated machine for COSZO instrument data; the current VM kept for PREST / VEL3D / SCPR; other-instrument cron jobs on a separate VM. Per-instrument metadata to be driven from a shared parameter spreadsheet (Mika) instead of hand-built parameter files.
- **2026-05-27** — EarthScope channel list finalized (GSSM / SCPR / current-meter naming as LE/MO/MY/ME engineering codes; location codes flexible). COSZO data flow locked as **NetCDF-first → MiniSEED**. Ring-server submission via the existing config; notify Tim Ronan on new stations/channels. Axial SCPR pushes raw (non-calculated) values only.
- **2026-05-18** — SAC meeting: **six-node network** (3 new margin sites + a shelf seismometer, plus existing Slope Base / Hydrate Ridge); **late-August 11-day cruise**. Send all data including non-Tier-1 to EarthScope. Calibrated pressure served as a downloadable **Python package**, not an EarthScope-derived product. Fall-2026 in-person SAC for upscoping.
- **2026-05-07** — Website nav restructured: `Home | Science | Infrastructure | Data | People | Outreach | Early Warning`. `data-products.html → data.html`. Five new pages built (`science`, `publications`, `sites`, `hydrate-ridge`, `slope-base`, `axial-seamount`). Old `motivation.html` / `scientific-objectives.html` kept unlinked-from-nav so external links don't 404.
- **2026-05-05** — Uncertainty separated into four categories: σ_lag (CCF pick) / σ_model (residual vs smoothed) / drift magnitude (NOT a σ — report as relative %) / non-linearity (sub-hour piece; needs leave-one-out test). σ_total = √(σ_lag² + σ_model²); median 0.077 s, p90 0.108 s, worst 0.170 s.
- **2026-05-04** — Picker-quantum staircase resolved via two-site fix: (a) `model_segments` in `chronos/scripts/filter_and_triggers.py` replaces each inter-trigger Δt segment with robust per-segment model (24 h rolling robust median + 6 h MA for drift segments, robust median for flat segments below 0.05 s/day slope); (b) `chronfix/correct.py::_resample` snaps within-½-sample boundary values onto the grid to stop `np.interp` returning NaN (was silently dropping ~7,800 corrected hours). Station-agnostic; trigger boundaries define segments.
- **2026-05-04** — `shift_only` chronfix mode accepted as secondary fix when slope is small (variant B recovered 92 % of uncorrected CCF amplitude vs ~62 % for production interpolation). Not yet wired.
- **2026-05-02** — Diagnostic of `load_day_z` UTC alignment bug uncovered during validation; fixed.
- **2026-04-30** — SeisFix split and renamed: **Chronos** detects, **Chronfix** corrects, **Baros** does pressure calibrations. Each lives in its own repo (chronos personal for now → eventually coszo-hub; chronfix already in coszo-hub).
- **2026-04-29** — Continuity-advance switched off `last_written + sp` and onto `request_end_time` so each cron day stands alone; added `bin/backfill_mseed_from_nc.py` as local one-shot backfill path consuming investigator-saved NetCDFs.
- **2026-04-28 / 04-29** — Gap-detection migration: legacy detector replaced by integer-step + OLS approach used in the investigator. Phased rollout per [[code migration]] (Phases 0–2 in progress).
- **2026-04-24** — Investigator gained `--save-nc` and `--only-gaps` switches enabling the local backfill plan.
- **2026-04-23** — Restructured project around new **coszo-hub** GitHub organization (the original `coszo` name was taken). Main code repo to move into `coszo-hub/PREST` (Tidal-Seafloor-Pressure). Multi-repo plan for derived-product scripts so external users can pull and run.
- **2026-04-22** — Wall-clock cross-check added to the diagnostic; demoted false-gap days to jitter-only.
- **2026-04-21** — Per-day figure reworked to 4-panel layout with new `n_ideal` metric after SLBS 2025-01-26 anomaly.
- **2026-04-17** — `timestamp variability assessment plan` (least-squares for separating sample interval, gaps, and jitter) first implemented.
- **2026-04-14 / 04-16** — Metrics schema and summary-figure styling tightened.
- **2026-04-08** — VM access; data-quality diagnostics scoped with William → batch collector `diagnose_timing.py`.
- **2026-04-03** — Code review meeting with team; agreed on dual-source FDSN + state-tracking architecture.
- **2026-04-02** — Top-down action list set; SeisFix package scoped (later renamed; see 04-30).
- **2026-04-01** — Project takeover; main work scoped as software engineering on the data collection / quality / correction pipeline.

## Issues + solutions

- **Picker-quantum staircase ruins corrected CCFs** at 1–3 Hz. → Per-segment Δt smoothing in chronos + boundary snap in chronfix `_resample`. Outlier rate 0.81 % → 0.30 %; reference RMS 12.8 → 40.6 (3.16×). See [[05-04-26 Notes]] / [[HYS14 — Correction Method V2]].
- **Linear-fit per segment cannot track curvature** (e.g., the 2022-08→2023-01 ramp): >5 s outlier rate rose 0.81 → 6.33 %. → Replaced with 24 h rolling robust median + 6 h MA, dropped >5 s back to 0.30 %.
- **Chronfix `_resample` leading-NaN truncation** silently dropping ~7,800 corrected hours due to float-precision boundary overshoot. → Snap apparent-time targets within ½ sample of grid boundaries onto the grid before `np.interp`.
- **`load_day_z` UTC-alignment bug** uncovered during validation ([[05-02-26 Notes]]).
- **Sub-hour false-gap days** flagged by the legacy detector. → Wall-clock cross-check on [[04-22-26 Notes]] demoted them to jitter-only (no correction needed).
- **`last_written + sp` continuity carry-over** meant a single bad day could poison the next cron run. → Switched to `request_end_time` so each cron day stands alone ([[04-29-26 Notes]]).
- **SLBS 2025-01-26 anomaly** missed by the old per-day figure. → Reworked to 4-panel with `n_ideal` metric ([[04-21-26 Notes]]).
- **`SeisFix` name reserved both correction and detection.** → Split into chronos/chronfix; **Baros** for pressure-cal. Vault notes back-annotated.
- **HYS14-HYSB1 inter-station pair had weak SNR at 1–3 Hz** (longer baseline). → Drop to 0.1–0.3 Hz secondary microseism band; reference RMS 1.46 → 50.4 (~35× gain).
- **8 Hz native sampling** → 0.125 s lag quantum. Picker is nearest-sample on CCF² envelope; parabolic CCF fit recovers σ_lag ≈ 0.002 s (well below the 0.036 s nearest-sample floor).

## Recent activity

- **06-05** — Started the Optical-sensing-conference (Kona) abstract from William's older COSZO abstract; sent the Bransfield ML catalog to Dax.
- **06-04** — William meeting: chronfix website fixes (8 Hz rationale, dt CSV, EarthScope-pull code), sub-sample correlation via Fourier interpolation, hand-pick-vs-ML catalog comparison; Fibre-sensing-workshop abstract scoped.
- **06-02 / 06-03** — Priorities set with William (current-meter upload, VM upgrade with Ken, cron update, Axial acoustic-ranging paper resubmit); monthly-report group status + COSZO-VM-expansion plan (meet Mika 06-04).
- **05-27** — EarthScope channel list finalized; NetCDF→MiniSEED flow confirmed; huddle test underway (2 of 5 seismometers running).
- **05-18** — SAC meeting (six-node network, late-August cruise, EarthScope data decisions, calibration-package direction).
- **05-12** — RAG chat infrastructure refined (model selector, BYOK Claude support pushed to pages-repo). Vault notes back-annotated for SeisFix → chronos rename.
- **05-07** — Website restructure first pass: nav rebuilt, Science / Sites / Data sections, data rename, 5 new pages.
- **05-05** — Uncertainty diagnostic added to chronos (`scripts/uncertainty.py`); per-segment statistics, parabolic CCF-fit σ_lag, robust σ_model.
- **05-04** — Picker-quantum bug resolved (v3 rolling-median + chronfix snap fix); [[HYS14 — Correction Method V2]] is the canonical pipeline now.
- **05-03** — RAG implementation generalized into the **vaultnotes** package so the same `/chat` pattern can apply to any vault.
- **05-02** — `load_day_z` UTC-alignment bug fixed.
- **05-01** — Chronos diagnostic methodology written up: 30-min CCs at 75 % overlap, phase whitening, one-bit, per-lag median daily stack, Hilbert-envelope peak picking, two bands (1–3 Hz for HYS12-HYS14, 0.1–0.3 Hz for HYS14-HYSB1).
- **04-30** — SeisFix → chronos/chronfix/baros rename.
- **04-29** — Continuity-advance switch + `backfill_mseed_from_nc.py`.
- **04-27 / 04-28** — Historical-NetCDF collection run + start of gap-detection migration (Phases 0–2 of `code migration`).
- **04-24** — Investigator `--save-nc` / `--only-gaps` switches.
- **04-23** — coszo-hub organization formed; multi-repo derived-product plan; SAC-meeting agenda set.

## Explorations

- **Sample-grid phase mismatch** as the suspect for the corrected-CCF degradation — *eliminated* (Δt quantizes to exactly 1 sample at 8 Hz, so `apparent_start − Δt` lands on the integer-sample grid).
- **Multi-Trace merge corruption** at trigger boundaries — *eliminated for the witness case* (n_traces=1 on the witness day, no trigger inside). Worth keeping in mind for trigger-boundary days.
- **`--stable-start 2025-07-12` chronos CLI flag** — *abandoned* (would bake HYS14 episode knowledge into the detection layer). Replaced by automatic per-segment slope detection.
- **`constant-zero` chronfix mode** — *abandoned* (would re-introduce a step at the preceding trigger if that segment carried a real constant offset).
- **Linear-fit per inter-trigger segment** as the Δt smoother (v2) — *abandoned* (can't track curvature; >5 s outlier rate worse than v1).
- **NoisePy dependency** for the diagnostic CC pipeline — *abandoned*; bare ObsPy + NumPy + SciPy is enough.
- **Higher-order resample kernel** (windowed sinc / Lanczos) inside chronfix — *open quality knob*, secondary to fixing the zigzag.
- **OBSIC software** for daily QC (vs Mustang) — *exploration* per 04-23 meeting; not yet stood up.
- **GitHub Pages visual editor** (`.pages.yml` CMS) — *partially scoped*; new pages not yet registered there.

## Lessons learned

- **It's not the magnitude of Δt that matters for CCF coherence — it's the local variation within the CCF window.** 0.5 s of picker-quantum zigzag scrambles 1–3 Hz phase even when total drift is tens of seconds.
- **Robust per-segment smoothing tracks curvature where global linear fits cannot.** Rolling robust median (24 h) + short MA (6 h) preserves the slow physical drift while removing picker-quantum noise.
- **Always check for silent NaN truncation in interpolation routines.** Chronfix was dropping ~7,800 corrected hours via float-precision boundary overshoot before the snap fix.
- **Don't bake station/episode-specific knowledge into station-agnostic packages.** Trigger boundaries already define segments; let the data drive segment-mode selection.
- **Drift magnitude is not an uncertainty source.** Report it as a signal-to-error ratio (σ_model / drift_range) instead.
- **Each cron day should stand alone.** Carrying state from `last_written` invites poisoned-state cascades; use absolute request windows.
- **Frequency band selection by inter-station baseline.** Longer baselines need secondary microseism band; same pipeline, different `(WHITEN_FMIN, FMAX)`.
- **Parabolic CCF fit > nearest-sample picker** for sub-sample precision (σ_lag 0.002 s vs 0.036 s nearest-sample floor).
- **Project naming has consequences.** `SeisFix` ambiguity between detect/correct drove the chronos/chronfix/baros split.
- **Visual diagnostics > tables** for catching long-tail artifacts (the +25 s outlier band only became obvious in the plot, not the summary).

## Ideas

- **Leave-one-out / even-odd-hour cross-validation** to bound sub-hour non-linearity uncertainty.
- **Block-bootstrap σ_lag from 30-min window picks** as cross-check on the parabolic-fit σ_lag.
- **Lobe-jump detector** that the parabolic fit can miss — flag picks where 30-min window picks within an hour scatter by > 1 lobe.
- **Sub-sample picker output by default** so downstream consumers don't need the parabolic fix.
- **Lanczos / windowed-sinc resample kernel** in chronfix as quality knob.
- **OBSIC-based daily QC dashboard** for COSZO operations.
- **Apply Chronos to other OOI stations** (HYS12, HYSB1, ASHES, Axial sites) — proof point that the pipeline is station-agnostic.
- **Daily metrics export to `coszo-hub/PREST`** as derived data product visible to collaborators.
- **Per-site instrument-list pages with depth/location/schematic** for the SAC meeting.

## Future steps

1. **Wire `shift_only` mode in chronfix** when modeled Δt slope < ½ sample per segment.
2. **Implement leave-one-out / even-odd-hour test** for sub-hour non-linearity uncertainty.
3. **Add `rms_residual_s`, p68/p95/p99 |residual| and `relative_sigma_percent`** to `segment_summary.csv` (one-liner).
4. **Block-bootstrap σ_lag from 30-min windows** as second uncertainty path.
5. **Finish gap-detection migration** (Phases 2 → 3 of `code migration`) and turn on daily metrics sync to `coszo-hub/PREST`.
6. **Get tidal pressure data on IRIS** — at least one year — before SAC.
7. **Fill in body content for `data.html`, `hydrate-ridge.html`, `slope-base.html`, `axial-seamount.html`, `publications.html`, and the People page** before SAC.
8. **Wire visual editor (`.pages.yml`)** to the new pages.
9. **Move chronos repo into `coszo-hub`** when API stabilizes (chronfix already there).
10. **Adopt OBSIC software** for daily QC alongside Mustang.
11. **Reach a decision on Early Warning section** — keep, restructure, or remove.

## Timeline

- **2026-06-05** — Optical-sensing-conference (Kona) abstract started; Bransfield ML catalog sent to Dax.
- **2026-06-04** — William meeting: chronfix website + sub-sample correlation + catalog-comparison scope; Fibre-sensing abstract.
- **2026-06-02 / 06-03** — Priorities + monthly-report status; COSZO-VM-expansion plan.
- **2026-05-27** — EarthScope channel list finalized; NetCDF→MiniSEED; huddle test (2/5 seismometers).
- **2026-05-18** — Science Advisory Committee meeting (six-node network, late-August cruise).
- **2026-05-12** — Vault back-annotations for SeisFix → chronos rename; ongoing pages-repo work.
- **2026-05-07** — Website restructure first pass (nav, Science, Sites, Data rename); 6 pages built.
- **2026-05-05** — Uncertainty diagnostic added to chronos (`scripts/uncertainty.py`); chronfix commits `54b0d3c` / `f229708` / `7ee4750` / `fadd968`. Chronos `8801abf` / `03f37aa`.
- **2026-05-04** — Picker-quantum bug resolved; canonical pipeline is now [[HYS14 — Correction Method V2]]. Chronfix `5621494`. Chronos `c38c6c3` / `914f154`.
- **2026-05-03** — RAG implementation generalized into vaultnotes.
- **2026-05-02** — `load_day_z` UTC-alignment bug fixed. Chronos `fd3033e`.
- **2026-05-01** — Chronos diagnostic methodology written up. Chronos `2a0a9a6`.
- **2026-04-30** — SeisFix → chronos/chronfix/baros rename. Chronos `35ea243`.
- **2026-04-29** — Continuity-advance switch + `backfill_mseed_from_nc.py`; chronfix repo created (`9fcd227`).
- **2026-04-28** — Gap-detection migration Phase 0 starts; PREST repo created.
- **2026-04-27** — Historical-NetCDF collection run; RAG `/chat` prototype lands on the notes site.
- **2026-04-24** — Investigator `--save-nc` / `--only-gaps` switches.
- **2026-04-23** — coszo-hub org formed; SAC-meeting agenda; website restructure scoped; multi-repo derived-product plan.
- **2026-04-22** — Wall-clock cross-check demotes false-gap days to jitter-only.
- **2026-04-21** — 4-panel per-day figure + `n_ideal` metric after SLBS anomaly.
- **2026-04-17** — Least-squares timestamp variability plan implemented.
- **2026-04-14 / 04-16** — Metrics schema + summary-figure styling.
- **2026-04-11 / 04-10 / 04-09 / 04-08** — VM access; `diagnose_timing.py` batch collector built with William.
- **2026-04-07** — Main repo test run; issue inventory.
- **2026-04-06** — Testk folder OOI API verification.
- **2026-04-03** — Code review meeting with team.
- **2026-04-02** — SeisFix package scoped (later split & renamed). Chronos repo created (`07e7087`).
- **2026-04-01** — COSZO project takeover; scoped as software engineering on data collection + QC pipeline.
- **Pre-2026-04-01** — (collapsed) prior `coszo-data-collection` work by Mika and the COSZO team that produced the legacy pipeline this project is taking over.
