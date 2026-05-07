
I will be working on several things on this project. But main work is all software engineering
[[04-01-26 Notes]]

We have a main list of things to complete on this project and those action items were discussed
[[04-02-26 Notes]]

Mika had shared the latest version of the code [[COSZO Data Collection — Code Walkthrough]]

We discussed the code on 04/03 and meeting notes are found in [[04-03-26 Notes]]

I created a seperate code in Testk folder to pull data in through OOI and convert and verify without the main repo. you can find those tests and notes from [[04-06-26 Notes]]

After testing that I could successfully run the OOI API, I have moved on to test the main repo and whether it runs and what issues i have run in to and how to mitigate it. You can find this work in [[04-07-26 Notes]]

SeisFix will be for timing error correction and some calibration application. This plan is discussed in [[ChronFix — Implementation Plan]]

On 04-08 I received VM access and started scoping data quality diagnostics with William. Those sessions are in [[04-08-26 Notes]], [[04-09-26 Notes]], [[04-10-26 Notes]], and [[04-11-26 Notes]] — the output is the `diagnose_timing.py` batch collector.

Work through [[04-14-26 Notes]] and [[04-16-26 Notes]] tightened the metrics schema and the summary-figure styling. A cleaner mathematical framing of the jitter problem is captured in [[timestamp variability assessment plan]] and first implemented in [[04-17-26 Notes]].

Reworked the per-day figure (4-panel layout, new `n_ideal` metric) on [[04-21-26 Notes]] after spotting an SLBS 2025-01-26 anomaly. Added a wall-clock cross-check on [[04-22-26 Notes]] that demoted false-gap days to jitter-only. The investigator gained `--save-nc` and `--only-gaps` switches on [[04-24-26 Notes]] — these enable the local backfill plan that lands later.

The 04-23 meeting with William and Mika ([[04-23-26 Notes]]) restructured the project around the new **COSZO-hub** GitHub organization and the **Science Advisory Committee meeting on May 18**. Action items: get tidal pressure data on IRIS, rewrite calibration scripts as reusable repos, and reorganize the website navigation. The main code repo will eventually move into `coszo-hub/PREST`.

The week starting [[04-27-26 Notes]] was the historical-NetCDF collection run and the start of the **gap-detection migration** — the legacy detector is being replaced by the integer-step + OLS approach used in the investigator. Full migration plan with phasing, decisions, and risks is in [[code migration]]; status logs across [[04-28-26 Notes]] and [[04-29-26 Notes]] track Phase 0 → Phase 2 progress. Continuity-advance was switched off `last_written + sp` and onto `request_end_time` ([[04-29-26 Notes]]) so each cron day stands alone, and [[04-29-26 Notes]] also introduces `bin/backfill_mseed_from_nc.py` as the local one-shot backfill path that consumes the investigator's saved NetCDFs.

[[04-30-26 Notes]] renamed the timing project: **Chronos** detects timing errors, **Chronfix** corrects them, **Baros** applies pressure calibrations. The HYS14 cross-correlation diagnostic methodology — what Chronos actually does — is in [[05-01-26 Notes]]. The full correction pipeline (Chronos detection → Chronfix correction → closed-loop validation) was first written up in [[HYS14 — Correction Method V1]], then revised in [[HYS14 — Correction Method V2]] after the [[05-04-26 Notes]] fix to the picker-quantum staircase artifact. [[05-02-26 Notes]] documents the `load_day_z` UTC-alignment bug uncovered during validation.

Sidebar: the `/chat` page on the notes site is now a working RAG-over-notes interface ([[04-27-26 Notes]], generalized in [[05-03-26 Notes]] as the **vaultnotes** package). Architecture and rollout sequence are in [[RAG implementation]]. This is being treated as a prototype for a future COSZO documentation chat after the SAC meeting.

## Topics

### Pipeline & data quality

- [[phase_1_plan]] — Phase 1 takeover plan for the OOI tidal pressure pipeline (local setup → VM → historical backfill)
- [[COSZO Data Collection — Code Walkthrough]] — architecture of `coszo-data-collection` (shell wrappers, waveform + metadata pipelines, state tracking)
- [[gap detection]] — adaptive gap-detection algorithm used inside the pipeline
- [[timestamp variability assessment plan]] — least-squares plan for separating sample interval, gaps, and jitter
- [[non tier1 ooi instrument data notes]] — non-Tier 1 OOI channel/station inventory and FDSN code reference

### Chronos / Chronfix (HYS14 timing correction)

- [[ChronFix — Implementation Plan]] — original plan for the standalone Python package (HYS14 target). Renamed and split into Chronos + Chronfix on [[04-30-26 Notes]].
- [[05-01-26 Notes]] — Chronos diagnostic methodology (HYS14 vs HYS12 cross-correlation, hourly peak-lag tracking)
- [[HYS14 — Correction Method V1]] — first end-to-end Chronos → Chronfix pipeline writeup. **Superseded by V2.**
- [[HYS14 — Correction Method V2]] — current canonical pipeline, with per-segment robust Δt smoothing and the boundary-snap fix from [[05-04-26 Notes]]

### Migration & infrastructure

- [[code migration]] — phased plan for replacing the legacy gap-detection in `OOI_data_request_and_convert_mseed.py` with the investigator's integer-step + OLS approach; also covers daily metrics sync to `coszo-hub/PREST`
- [[RAG implementation]] — implementation plan for the password-gated `/chat` interface over the notes vault
