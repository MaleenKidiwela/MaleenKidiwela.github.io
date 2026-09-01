
> **Cranium:** [[cranium_coszo]] — concise big-picture state (status, goals, key questions, decisions, issues, recent activity, timeline). Read this first; refresh daily.

I will be working on several things on this project. But main work is all software engineering
[[04-01-26 Notes]]

We have a main list of things to complete on this project and those action items were discussed
[[04-02-26 Notes]]

Mika had shared the latest version of the code [[COSZO Data Collection — Code Walkthrough]]

We discussed the code on 04/03 and meeting notes are found in [[04-03-26 Notes]]

I created a seperate code in Testk folder to pull data in through OOI and convert and verify without the main repo. you can find those tests and notes from [[04-06-26 Notes]]

After testing that I could successfully run the OOI API, I have moved on to test the main repo and whether it runs and what issues i have run in to and how to mitigate it. You can find this work in [[04-07-26 Notes]]

A dedicated toolchain was scoped for timing error correction and calibration application — originally as **SeisFix** ([[04-02-26 Notes]]), then split on 04-30 into **Chronos** (detection, `github.com/MaleenKidiwela/chronos`), **Chronfix** (correction, `github.com/coszo-hub/chronfix`), and **Baros** (pressure calibration). This plan is discussed in [[ChronFix — Implementation Plan]].

On 04-08 I received VM access and started scoping data quality diagnostics with William. Those sessions are in [[04-08-26 Notes]], [[04-09-26 Notes]], [[04-10-26 Notes]], and [[04-11-26 Notes]] — the output is the `diagnose_timing.py` batch collector.

Work through [[04-14-26 Notes]] and [[04-16-26 Notes]] tightened the metrics schema and the summary-figure styling. A cleaner mathematical framing of the jitter problem is captured in [[timestamp variability assessment plan]] and first implemented in [[04-17-26 Notes]].

Reworked the per-day figure (4-panel layout, new `n_ideal` metric) on [[04-21-26 Notes]] after spotting an SLBS 2025-01-26 anomaly. Added a wall-clock cross-check on [[04-22-26 Notes]] that demoted false-gap days to jitter-only. The investigator gained `--save-nc` and `--only-gaps` switches on [[04-24-26 Notes]] — these enable the local backfill plan that lands later.

The 04-23 meeting with William and Mika ([[04-23-26 Notes]]) restructured the project around the new **COSZO-hub** GitHub organization and the **Science Advisory Committee meeting on May 18**. Action items: get tidal pressure data on IRIS, rewrite calibration scripts as reusable repos, and reorganize the website navigation. The main code repo will eventually move into `coszo-hub/PREST`.

The week starting [[04-27-26 Notes]] was the historical-NetCDF collection run and the start of the **gap-detection migration** — the legacy detector is being replaced by the integer-step + OLS approach used in the investigator. Full migration plan with phasing, decisions, and risks is in [[code migration]]; status logs across [[04-28-26 Notes]] and [[04-29-26 Notes]] track Phase 0 → Phase 2 progress. Continuity-advance was switched off `last_written + sp` and onto `request_end_time` ([[04-29-26 Notes]]) so each cron day stands alone, and [[04-29-26 Notes]] also introduces `bin/backfill_mseed_from_nc.py` as the local one-shot backfill path that consumes the investigator's saved NetCDFs.

[[04-30-26 Notes]] renamed the timing project: **Chronos** detects timing errors, **Chronfix** corrects them, **Baros** applies pressure calibrations. The HYS14 cross-correlation diagnostic methodology — what Chronos actually does — is in [[05-01-26 Notes]]. The full correction pipeline (Chronos detection → Chronfix correction → closed-loop validation) was first written up in [[HYS14 — Correction Method V1]], then revised in [[HYS14 — Correction Method V2]] after the [[05-04-26 Notes]] fix to the picker-quantum staircase artifact. [[05-02-26 Notes]] documents the `load_day_z` UTC-alignment bug uncovered during validation. [[05-05-26 Notes]] separates the uncertainty into σ_lag (parabolic CCF pick, ~0.002 s) and σ_model (per-segment robust σ of raw − smoothed, median 0.077 s) — drift magnitude is reported as a signal-to-error percentage rather than a σ term — and adds the `chronos/scripts/uncertainty.py` diagnostic.

Acting on the 04-23 website action items, [[05-07-26 Notes]] is the first pass through the nav restructure: new `Home | Science | Infrastructure | Data | People | Outreach | Early Warning` top nav, `data-products.html → data.html`, and six new pages built (`science`, `publications`, `sites`, `hydrate-ridge`, `slope-base`, `axial-seamount`). Site body content and the visual editor wiring are still open ahead of the SAC meeting.

Sidebar: the `/chat` page on the notes site is now a working RAG-over-notes interface ([[04-27-26 Notes]], generalized in [[05-03-26 Notes]] as the **vaultnotes** package). Architecture and rollout sequence are in [[RAG implementation]]. This is being treated as a prototype for a future COSZO documentation chat after the SAC meeting.

The **Science Advisory Committee meeting** the website restructure was built for was held on [[05-18-26 Notes]] (chaired by William Wilcock). The project will instrument three new subduction-margin sites plus a shelf seismometer for a **six-node network** (with existing Slope Base / Hydrate Ridge), on a **late-August cruise** (11 days at sea). Two data decisions were confirmed: send all data, including non-Tier-1 instruments, to EarthScope; and serve calibrated pressure as a downloadable **Python calibration package** rather than an EarthScope-derived product. Between those meetings, [[05-21-26 Notes]] scoped the **huddle-test calibration methodology** with Paul Boudin — cross-spectral relative calibration, phase-response and transfer-function comparisons, and amplitude spectra-ratios between a reference sensor and the others, plus practical controls (temperature logging, leveling, common orientation, per-channel comparison, voltage fluctuations) — the methodological seed for the summer huddle-test internship. The follow-on [[05-27-26 Notes]] meeting finalized the EarthScope **channel list** (GSSM / SCPR / current-meter naming, StationXML generation, ring-server submission) and locked the COSZO data flow as **NetCDF-first → MiniSEED**.

Priorities through early June ([[06-02-26 Notes]], [[06-03-26 Notes]]) center on the seedlink pipeline + cron job for tidal-pressure QC metrics, the **COSZO-VM expansion** (a dedicated machine for COSZO data; the current VM kept for PREST / VEL3D / SCPR), huddle-testing the broadband seismometers toward five units before the cruise, and Mika's parameter-spreadsheet idea for uniform per-instrument metadata. On the writing side, [[06-02-26 Notes]] resumes the Axial acoustic-ranging paper, [[06-04-26 Notes]] scopes the chronfix website fixes (state the 8 Hz rationale, publish a dt CSV, add EarthScope-pull code), sub-sample correlation accuracy via Fourier-based interpolation, and a hand-pick-vs-ML catalog comparison, and [[06-05-26 Notes]] starts the **Optical-sensing-conference (Kona)** abstract from William's older COSZO abstract — alongside a Fibre-sensing-workshop abstract — and sends the Bransfield ML catalog to Dax.

EarthScope integration then moved from plan to specifics in back-to-back meetings. [[06-08-26 Notes]] (with Trident, RCA, and EarthScope) settled how the GSSM and pressure-sensor ASCII status outputs will stream — integer-mapped MiniSEED with the mapping key documented in StationXML — plus separate engineering `Y`-code channels for instrument-vs-shore timestamps, the **Antelope-ORB deprecation on 2026-09-01** in favor of SeedLink ring servers, and syslog/IP separation for COSZO instruments; the same day started the new **sea-water-velocity** repo for VEL3D data collection. [[06-09-26 Notes]] locked the station and channel conventions: Axial, Southern Hydrate Ridge, and Oregon Slope Base plus two candidate Coastal Endurance sites (pending William), per-instrument location codes, E/N/Z orientation codes, and the rule that nothing archives until the StationXML is emailed to EarthScope.

Through mid-June the build-out branched into data-collection, website, and operations tracks. [[06-16-26 Notes]] exercises the new **sea-water-velocity (VEL3D)** pipeline end-to-end across five stations (HYSB1, HYS14, AXBS, SHBP, OSBP) — anomaly investigator → `backfill_mseed_from_nc.py` → `create_metadata.py` StationXML — while [[06-17-26 Notes]] holds the Endurance-array data back from EarthScope until instrument names are settled with Deb. Naming then converged: [[06-25-26 Notes]] locks COSO reference designators (CZ suffix) and EarthScope station names (CZSHF / CZOFF / CZOSH / CZMID), and [[07-02-26 Notes]] finalizes the **six sites** — Southern Hydrate Ridge, Slope Base, Oregon Offshore (PN1C), Oregon Shelf (MJ01C), Outer Shelf (PN1D), Mid Slope (PN1B) — plus a three-group People page and Jake Ploskey.

The website restructure moved into a second, deeper pass. [[06-18-26 Notes]] and the [[coszo-website-restructure-plan]] set the v2 direction (drop Early Warning + Home, Science→About, a Cruises dropdown with plan-of-day / blog-from-sea / diary / live video); [[06-26-26 Notes]] captures the detailed edit backlog, which [[06-30-26 Notes]] turns into a phased Claude implementation plan. Content then landed across [[07-07-26 Notes]] (new sites + images), [[07-15-26 Notes]] (an Axial Sonardyne FETCH acoustic-ranging instrument page), [[08-04-26 Notes]] (instrument specifics from cascadiaoffshore.org, a Science Junction Box section, and the switched-off **RR2608 live cruise tracker**), and the at-sea blogging workflow in [[08-05-26 Notes]] / [[08-17-26 Notes]]. COSZO interns started [[06-22-26 Notes]] on the huddle test and tidal-seafloor-pressure / current-meter data exploration, guided by the [[06-23-26 Notes]] internship project plan; [[07-06-26 Notes]] and [[07-14-26 Notes]] track intern Ali's per-channel station-comparison plots.

Metadata work continued through [[07-16-26 Notes]], [[07-20-26 Notes]] and [[07-29-26 Notes]] (response info for GSSM / absolute-pressure, `c_dip` and units fixes), culminating in [[08-03-26 Notes]]'s **PREST param unification** — pressure channels moved to `r_value = 1.0` with the PSI→Pa `conversion` applied at MiniSEED-conversion time, and `make_prest_params.py` became the single source of truth for all 14 param files. A separate operational snag, [[07-17-26 Notes]], is that data gaps explode into ~20,000 MiniSEED files, pointing to a need for NaN-fill in MiniSEED.

[[07-23-26 Notes]] is the **operations-phase meeting** — commissioning targeted for summer 2027, ~450 EarthScope channels held private until metadata is complete, hybrid AI + crowdsourced QA/QC, and the unresolved RCA-integration-vs-independent-PI question — while [[07-27-26 Notes]] scopes local-LLM adoption at the OOI data center. On the writing side, the Axial Seamount acoustic-ranging paper was cut to length ([[07-31-26 Notes]]), finished and made submission-ready ([[08-10-26 Notes]]), and circulated as a preprint ([[08-14-26 Notes]], [[08-18-26 Notes]]); RAID-drive logistics for the cruise run through [[08-10-26 Notes]] and [[08-18-26 Notes]]. Finally, the installation cruise slipped and then **postponed to next year** — [[08-25-26 Notes]] (Revelle bow-thruster repair, dry-dock, shortened-cruise options) and [[08-26-26 Notes]] (official postponement) — refocusing near-term work on the Orca Volcano earthquake analysis.

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
