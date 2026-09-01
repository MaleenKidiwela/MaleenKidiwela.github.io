# Cranium — COSZO

> Concise big-picture state of the Cascadia Offshore Subduction Zone Observatory project. Maintained by Claude-desktop routine on a daily cadence. Sources: vault notes in this folder + the three project repos. If anything here conflicts with the repos or the latest daily note, trust those and propose an update.

## Associated repos

- [github.com/coszo-hub/chronfix](https://github.com/coszo-hub/chronfix) — timing **correction** package; applies the per-segment-smoothed Δt model from chronos to raw MiniSEED. Created 2026-04-29.
- [github.com/coszo-hub/Tidal-Seafloor-Pressure](https://github.com/coszo-hub/Tidal-Seafloor-Pressure) (aka **PREST**) — monorepo for the tidal seafloor pressure pipeline and derived-product scripts that will eventually replace the current `coszo-data-collection` workflow. Created 2026-04-28.
- [github.com/MaleenKidiwela/chronos](https://github.com/MaleenKidiwela/chronos) — timing **detection** package; ambient-noise CC pipeline (`chronos.scripts.{download_data, compute_ccf, compute_peak_lag, combine_clock, filter_and_triggers, plot_ccf}`) + uncertainty diagnostic. Created 2026-04-02. Will eventually move into `coszo-hub`.

## Status

Chronos (detection) + Chronfix (correction) form a working end-to-end pipeline for HYS14, validated full-record on 4 years of OO.HYS12/HYS14 MHZ data. The v3 rolling-median segment smoother brought the post-correction hourly peak-lag outlier rate (|x|>5 s) from the v1 buggy 0.81 % through a worse v2 linear-fit (6.33 %) down to 0.30 %, with a 3.16× lift in long-term reference CCF RMS. An uncertainty diagnostic (σ_lag ≈ 0.002 s, σ_model ≈ 0.077 s median) was added 2026-05-05. The main data-collection code is mid-migration: legacy gap-detection is being replaced by the investigator's integer-step + OLS approach (Phase 0 → Phase 2 of `code migration`), with daily metrics destined to sync to `coszo-hub/PREST`. Website restructuring is underway for the **Science Advisory Committee meeting on 2026-05-18** — first pass through the nav restructure and Data rename landed 2026-05-07. RAG-over-notes prototype is live at `/chat` on the notes site. The **SAC meeting was held 2026-05-18**: a six-node network is confirmed for a late-August deployment cruise. Focus has since shifted to **EarthScope data submission** (channel list finalized 2026-05-27, NetCDF→MiniSEED flow, ring-server push), the **seedlink + cron QC pipeline** for tidal pressure, huddle-testing the broadband seismometers toward five units before the cruise, and a **COSZO-VM expansion** (dedicated COSZO machine; current VM retained for PREST / VEL3D / SCPR). Science-writing threads in flight: the Axial acoustic-ranging paper, a Fibre-sensing-workshop abstract, and the Optical-sensing-conference (Kona) abstract. EarthScope integration turned concrete in back-to-back meetings 06-08/06-09: ASCII status channels stream as integer-mapped MiniSEED (key documented in StationXML), separate engineering channels carry instrument-vs-shore timestamps, Antelope ORBs are deprecated 2026-09-01 in favor of SeedLink ring servers, and site selection + channel/location/orientation naming conventions are locked (two Coastal Endurance additions pending William). A new **sea-water-velocity** repo for VEL3D data collection was started 06-08, migrating the PREST-data-collection patterns. Through June–August the build-out branched into data-collection, website, and operations tracks. The VEL3D pipeline was exercised end-to-end across five stations (HYSB1, HYS14, AXBS, SHBP, OSBP; `make_vel3d_params.py`), and the PREST param files were unified under a single-source-of-truth `make_prest_params.py` (14 files) after pressure channels moved to a flat `r_value = 1.0` with the PSI→Pa `conversion` applied at MiniSEED-conversion time rather than in the StationXML response (three StationXML regenerated + pushed; temperature-channel conversion keys still open). The **six margin sites are finalized** — Southern Hydrate Ridge, Slope Base, Oregon Offshore (PN1C, Endurance), Oregon Shelf (MJ01C, Endurance), Outer Shelf (PN1D, new), Mid Slope (PN1B, new) — with COSO reference designators (CZ suffix) and EarthScope station names CZSHF / CZOFF / CZOSH / CZMID locked. A second, deeper **website restructure (v2)** is underway via `build_pages.py` (About/Infrastructure/Cruises reorg, per-instrument content from cascadiaoffshore.org, a switched-off RR2608 live cruise tracker); COSZO interns onboarded 06-22 on the huddle test + tidal-pressure/current-meter data. The **operations phase** was scoped 07-23 (commissioning targeted summer 2027; ~450 EarthScope channels held private until metadata is complete; hybrid AI + crowdsourced QA/QC; RCA-integration-vs-independent-PI still open). The **Axial acoustic-ranging paper is finished and submission-ready** (GRL); the Nature Communications review returned needs-more-analysis. **The installation cruise was postponed to 2027** (08-26) after the Roger Revelle's bow-thruster repair forced a dry-dock and the Jason submersible was unavailable — near-term focus is refocusing on the Orca Volcano earthquake analysis.

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
- **NaN-fill in MiniSEED for gappy data.** Data gaps currently explode into ~20,000 single-segment MiniSEED files; can gaps be represented as NaN-filled MiniSEED instead? ([[07-17-26 Notes]])
- **RCA integration vs independent PI experiment.** Full RCA integration brings weekly/monthly/quarterly/annual NSF reporting + hidden admin costs; COSZO prefers a monthly cadence. Awaiting NSF guidance. ([[07-23-26 Notes]])
- **QA/QC without funded manual review.** Can AI monitoring (daily timing notifications, hourly spectrograms) + community crowdsourcing cover commissioning-phase QA/QC? ([[07-23-26 Notes]])

## Decisions

- **2026-08-26** — COSZO installation cruise **postponed to 2027** (Roger Revelle bow-thruster repair → dry-dock; Jason submersible unavailable); shortened-cruise options explored 08-25 but dropped. Near-term pivot to the Orca Volcano earthquake analysis.
- **2026-08-03** — PREST pressure channels store **raw values at `r_value = 1.0`** and apply the PSI→Pa `conversion` (0.0001450377) at MiniSEED-conversion time rather than in the StationXML response; `make_prest_params.py` is the single source of truth generating all 14 param files (verified byte-identical StationXML).
- **2026-07-23** — Operations-phase plan: **commissioning summer 2027**; ~450 channels stream to EarthScope but stay private until metadata is complete; QA/QC via a **hybrid AI + community-crowdsourcing** approach (no funded manual QA/QC); outages documented on the COSZO site with an EarthScope-metadata link back; RCA-integration-vs-independent-PI left open pending NSF guidance.
- **2026-07-02** — **Six sites finalized**: Southern Hydrate Ridge, Slope Base, Oregon Offshore (PN1C, 600 m, Endurance), Oregon Shelf (MJ01C, 80 m, Endurance), Outer Shelf (PN1D, new), Mid Slope (PN1B, new). People page → three groups (UW Team / Scripps Team / Advisory Committee); add Jake Ploskey; short-period seismometer dropped.
- **2026-06-25** — COSO reference designators use a **CZ** suffix (replacing BP); EarthScope 5-char station names **CZSHF / CZOFF / CZOSH / CZMID** (differ by >1 char); Outer Shelf abbrev **OU**; COSO nodes follow the MJ convention; operations plan required before November.
- **2026-06-18** — Website **restructure v2** direction ([[coszo-website-restructure-plan]]): drop Early Warning + Home tabs, Science→About (Motivation/Objectives/Publications/People), Infrastructure non-clickable, remove Axial from sites + add Oregon Shelf, add a Cruises dropdown (plan-of-day / blog-from-sea / diary / live video).
- **2026-06-17** — Hold Endurance-array (OSBP/SHBP current-meter) data from EarthScope until instrument/station names are finalized with Deb; submit only HYS14/HYSB1 + the current meter for now.
- **2026-06-09** — Data-streams meeting: sites = Axial, Southern Hydrate Ridge, Oregon Slope Base + two candidate **Coastal Endurance** 8 Hz sites (LJ01D & LJ01C → proposed SHBP/OSBP; confirm with William). Location codes: current meters `20`, pressure `10`, GSSM `30`, SCPR `40`, OBS none. Orientation codes **E/N/Z** (not 1/2/Z) per Tim & Chad (EarthScope), consistent with COSO; 1 Hz instruments use `L` band (LOE, LKO). Parameter files to be updated 1→N, 2→E. Nothing archives until the StationXML (from the metadata script) is emailed to EarthScope; notify Tim & Anne before current-meter data flows.
- **2026-06-08** — EarthScope/Trident/RCA data-flow meeting: GSSM + pressure-sensor ASCII statuses mapped to integers and streamed as MiniSEED (mapping key documented as a StationXML comment; unity nominal response required so EarthScope ignores the response field). Multiple timestamps handled via separate engineering `Y`-code channels (BY1/BY2) holding 64-bit epoch-second doubles for instrument vs shore time. **EarthScope drops Antelope ORB support 2026-09-01** → SeedLink ring server; Gen C ingestion to be tested during shore-station maintenance (risk mainly for Neptune, not COSZO). Syslog server on the DDS side syncs GSSM logs to the PI NAS; separate IP (future VLAN) keeps COSZO instruments off the main RCA data network.
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
- **Data gaps spawn ~20,000 MiniSEED files.** → Needs a NaN-fill representation in MiniSEED; unresolved ([[07-17-26 Notes]]).
- **PREST temperature channels (UK1/LK1) lack a `conversion` key** → will KeyError in the live pipeline; `backfill_mseed_from_nc.py` / `plot_from_netcdf.py` still divide by `r_value` (now 1.0) so no longer convert PSI→Pa; HYS14's LK1 lists two sensor UIDs against one epoch. Open ([[08-03-26 Notes]]).

## Recent activity

- **08-26** — COSZO installation cruise **officially postponed to next year** (Revelle repairs + Jason inoperability); Mika meeting cancelled.
- **08-25** — Cruise delayed: Revelle bow-thruster oil leak → ~10-day dry-dock; shortened 7-day-on-site plan floated; William — pivot to Orca Volcano earthquakes, set a Marine meeting.
- **08-18** — RAID (Pegasus32 / ExFat) setup instructions for the ship's Mac Catalina; William — build a FETCH-transponder instrument page, ask Ken Feldman re OOI ingest, send cruise info to Crescent.
- **08-17** — At-sea blogging workflow finalized ([[08-17-26 Notes]]): GitHub-based `blog-from-sea.html`, with Google Drive + `seismic@uw.edu` fallbacks.
- **08-14** — William: circulate the Axial preprint (Wei, Chadwick, Feldman, Deb, Dana) re acoustic-ranging data sharing + an instrument page; email Mitch re the RAID plug-in.
- **08-10** — Axial acoustic-ranging paper finished, ready for submission; RAID system received + set up (ExFat, Mac/Windows).
- **08-05** — Intern meeting on the blog-post submission workflow.
- **08-04** — Website v2: instrument pages populated from cascadiaoffshore.org (Nanometrics Atlantis T360-COBST2, HTI-90-U, Paroscientific 8000, Nortek Vector) + a Science Junction Box section; **RR2608 live cruise tracker** built (AIS from SIO/UNOLS, 30-min GitHub Action, hero banner) but switched off.
- **08-03** — PREST param unification: pressure UDO/LDO move to `r_value = 1.0` + a new `conversion` applied at MiniSEED-convert (not in StationXML); `make_prest_params.py` becomes the single source generating all 14 param files; 3 StationXML regenerated + pushed. Open: UK1/LK1 lack a conversion key ([[08-03-26 Notes]]).
- **07-31** — Axial paper length budget / cutting.
- **07-29** — Metadata fixes (`c_dip` 0→−90, PSIA→PA); ask Dana re CERES SCPR-calibration software; removed the short-period-seismometer section.
- **07-27** — Scoped **local-LLM adoption at the OOI data center** with Craig Risien (current L40S hardware; H100 + 2 switches for local inference).
- **07-23** — COSZO **operations meeting**: install→ops transition, commissioning summer 2027, ~450 channels to EarthScope (private until metadata complete), hybrid AI + crowdsourced QA/QC, RCA-integration-vs-independent-PI debate, ConOps/budget gaps.
- **07-20** — Metadata update via `OOI_metadata request.py` on the param files; COSZO machine login (140.142.14.93).
- **07-17** — Data gaps spawn ~20,000 MiniSEED files → need NaN-fill in MiniSEED.
- **07-16** — Mika: GSSM + absolute-pressure metadata need response info (ask Krishna); current-meter + tidal-pressure metadata updates.
- **07-15** — Scoped an Axial Sonardyne **FETCH** acoustic-ranging instrument page (A-0-A style).
- **07-14** — Meeting with the intern + William.
- **07-07** — Added new sites + images to the website; drop "Oregon" from Outer Shelf / Mid Slope; Shawn items (video, domain, early warning).
- **07-06** — N. Communications review (needs more analysis/methods); GRL Axial paper writing; intern Ali given Claude Code to plot per-channel station comparisons (Z differencing, N/E orientation check).
- **07-02** — Mika: **six sites finalized** (S. Hydrate Ridge, Slope Base, Oregon Offshore PN1C/Endurance, Oregon Shelf MJ01C/Endurance, Outer Shelf PN1D, Mid Slope PN1B); People → 3 groups + add Jake Ploskey; Data-tab pages to mimic the ASP style.
- **06-30** — Website backlog turned into a phased Claude implementation plan ([[06-30-26 Notes]]): Phase 1 text/markup + People reorg, Phase 2 image swaps, Phase 3 external-content rebuilds; Early Warning untouched (Shawn).
- **06-26** — Large website-refinement backlog captured (home caption, site-intro CTA, objectives trim, ASP table relabel, People reorg, contact/footer, archives).
- **06-25** — COSO reference designators + EarthScope station names locked (**CZSHF / CZOFF / CZOSH / CZMID**); CORTAD QA/QC; operations plan must be ready before November.
- **06-23** — Huddle-test summer-internship project plan written ([[06-23-26 Notes]]).
- **06-22** — COSZO interns start (huddle test + tidal-pressure/current-meter data exploration for David); huddle workflow setup.
- **06-18** — Website restructure v2 direction with William ([[coszo-website-restructure-plan]]): drop Early Warning + Home, Science→About, add a Cruises dropdown (plan-of-day / blog-from-sea / diary / live video), site renames.
- **06-17** — Mika: hold Endurance-array data from EarthScope until instrument names are finalized with Deb; StationXML azimuth-0/no-dip question for Ken.
- **06-16** — **sea-water-velocity (VEL3D) pipeline** exercised across 5 stations (HYSB1, HYS14, AXBS, SHBP, OSBP): anomaly investigator → `backfill_mseed_from_nc.py` → `create_metadata.py` StationXML; William re Deb's Reference-Designator concerns + front-page live streaming.
- **06-09** — Data-streams meeting: site list (Axial, SHR, OSB + 2 Coastal Endurance candidates) and channel/location/orientation conventions locked; next steps — update parameter files (1→N, 2→E), run anomaly investigator locally, set up SeedLink for the two instrument types.
- **06-08** — EarthScope/Trident/RCA integration meeting (ASCII→integer status channels, engineering time channels, Antelope-ORB deprecation → ring-server testing, syslog + IP separation); started the **sea-water-velocity** repo for VEL3D collection. Dana to bring GSSM + pressure sensors online by week's end for Dave.
- **06-05** — Started the Optical-sensing-conference (Kona) abstract from William's older COSZO abstract; sent the Bransfield ML catalog to Dax.
- **06-04** — William meeting: chronfix website fixes (8 Hz rationale, dt CSV, EarthScope-pull code), sub-sample correlation via Fourier interpolation, hand-pick-vs-ML catalog comparison; Fibre-sensing-workshop abstract scoped.
- **06-02 / 06-03** — Priorities set with William (current-meter upload, VM upgrade with Ken, cron update, Axial acoustic-ranging paper resubmit); monthly-report group status + COSZO-VM-expansion plan (meet Mika 06-04).
- **05-27** — EarthScope channel list finalized; NetCDF→MiniSEED flow confirmed; huddle test underway (2 of 5 seismometers running).
- **05-21** — Discussed **huddle-test calibration methodology** with Paul Boudin: cross-spectral relative calibration, phase-response / transfer-function comparisons, and amplitude spectra-ratios against a reference sensor; practical controls (temperature logging, leveling, common orientation, per-channel comparison, voltage fluctuations); pointer to Holcomb/BSSA cross-spectral calibration reading.
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
- **Local LLM at the OOI data center** — *scoping* with Craig Risien; current hardware is 16× C6420 + 1× R760xa (4× L40S); local inference would need H100 GPUs + 2 switches ([[07-27-26 Notes]]).
- **AI + crowdsourced QA/QC for commissioning** — *scoping* (daily timing notifications, hourly spectrograms, community-flagged anomalies; NSF OOI+AI call) ([[07-23-26 Notes]]).

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
