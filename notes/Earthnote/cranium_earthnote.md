# Cranium — Earthnote

> Concise big-picture state of the Earthnote project. Maintained by Claude-desktop routine on a daily cadence. Sources: vault notes in this folder + the project repo. If anything here conflicts with the repo or the latest daily note, trust those and propose an update.

## Associated repos

- [github.com/MaleenKidiwela/Earthnote](https://github.com/MaleenKidiwela/Earthnote) — primary code: NoisePy-based dv/v pipeline (PNW single-station cross-component, scaling to inter-station). Currently 4 commits on `main`, last activity 2026-05-12.

## Status

Phase 2/2.1/2.2 pilot iterations ran on the 29-station January 2020 pool at 2–4 Hz (Z·E, Clements-style broadband-whitened recipe); the stretching-grid quantization that broke Phase 1.3 is resolved, and per-station hourly dv/v is genuinely usable on ~7 stations. The pipeline has since scaled to **Phase 3.1 production** (Wiener denoise gate at eff-K = 2.5, MAXLAG 30 s, vectorized stretching) launched across **110 broadband stations for full-year 2020** — and the year-scale finding is that Wiener denoise is the *dominant* path (95 % of stations), not the exception. A second dv/v track, **tremormetry**, runs an LFE-coda-wave-interferometry workflow per station, with its inverse-problem theory (deep-source coda sensitivity kernel + fault-plane δβ/β tomography) derived 06-04/06-05. Since then it has hardened and scaled into a full program. The envelope-peak discovery recipe was re-audited (06-12) and paired with a supervised **LFE fingerprint** (06-15/06-18): 23 hand-crafted spectral/envelope/polarization features (`hv_ratio` the strongest), trained on the Lin (2023) catalog, that separate LFEs from noise and from earthquakes/blasts at ~0.97 AUC, **SNR-independent** and autoencoder-confirmed. A refined **nine-stage per-station pipeline** (a three-lane NET/GPU/CPU conveyor: discovery → picker score → cluster → select → densify → daily stacks → coda dv/v → trust battery → inversion) now scales across boreholes (B011, B926, B927, B928, …); the fingerprint transfers cross-station, validated against Lin (B926: 99 % of 530 families real vs 0 % null), establishing "one picker everywhere, thresholded by the LFE *label*." The program culminates in a **4-D δβ/β inversion** on the plate interface: **12,703 certified LFE families across 187–188 stations**, jointly solving a per-day fault map m(x,t) + a per-station site term + a per-family/instrument-era offset (gauged to a 2019–2024 reference window), run over ~30 M measurements × 6,354 days; checkerboard resolution ~70–140 km, noise-limited (single-day maps ~0.7 % vs 0.04 % signal). An adversarial review (08-19/08-20/08-21) is underway, adding data-gap handling and a GPS-slip→strain→stress comparison track (Gualandi's daily inversion). Phase 2.4 hyperparameter sweep is still scoped but not executed. Adjacent threads now live under Earthnote: a Canadian clean-tech reframing of the pipeline ([[Canada Impact+ Proposal]]), a PNW digital-twin build (`earthnote-worldview`), a Research-Directions feature for the notes app, and the Landslides **CSSI** NSF project ([[08-11-26 Notes]]).

## Goals

- Build a PNW-wide single-station cross-component (SC) dv/v monitoring system over all PNSN/PNW stations, then extend to inter-station pairs.
- Validate the pipeline on a small, known-good station pool before scaling to multi-year production.
- Produce stable hourly-resolution dv/v on Tier A stations; daily-only dv/v elsewhere.
- Eventually: spatial dv/v maps, correlation with Cascadia slow slip / volcanic / environmental signals, automated production pipeline + monitoring dashboard (Phases 4–8 in `PROJECT_PLAN`).
- Add a **tremormetry** track: LFE-coda-wave-interferometry dv/v that images shear-velocity change *on the plate interface* (deep repeating sources), complementing the ambient-noise SC dv/v.

## Key questions

- Which stations consistently produce hourly-resolution dv/v vs. daily-only? (Tier A vs B vs C — see Phase 1.3 Results.)
- What is the right adaptive coda-window criterion? Phase 2.1's IQR/median-based rule shrinks the window on some stations and hurts std (CBS, MANO); proposed fix is "default-or-wider only."
- Which frequency band + coda window combination maximizes correlation coefficient per station? (Phase 2.4 sweep.)
- Are pos / neg / both coda sides telling us about source asymmetry?
- For non-Tier-A stations, do 6–12 h trailing stacks clean up the hourly signal enough to keep them in scope?
- How to quantify **spatial resolvability of the deep δβ/β field over time** given a non-stationary (growing) station network? (checkerboard says ~70–140 km, noise-limited)
- Should the monthly-moving-stack (stepped 1 day) dv/v be **smoothed to ~2 months** to tame noise before inversion?
- Is **3-component (network) clustering** the next real gain in LFE discovery, given the strongest discriminator (S-polarization) is invisible to the current vertical-only backbone?

## Decisions

- **2026-08-19 / 08-20** — 4-D inversion refinements under adversarial review: stop excluding grid cells shallower than 30 km; account for data gaps in the 12k+ dv/v timeseries; solve per-pair reference offsets **inside** the space–time inversion (a fixed-effects demean gauged to the 2019–2024 reference window, not a pre-subtracted per-series mean); add a GPS-slip→strain→stress comparison track (Gualandi's daily inversion).
- **2026-07-09** — Standing rule for the whole margin: **one LFE picker applied everywhere**, thresholded by the argmax LFE *label* (not P>0.9), validated per-station against the Lin (2023) catalog (B926: 99 % of 530 families real vs 0 % null). No per-station model proliferation.
- **2026-06-15** — Second discovery route: a supervised **LFE fingerprint** (23 hand-crafted spectral/envelope/polarization features, `hv_ratio` dominant) trained on the Lin (2023) catalog; separates LFEs from noise and from EQ/blast at ~0.97 AUC, **SNR-independent**, autoencoder-confirmed; filter discovery at the **family level**, not per-candidate.
- **2026-05-29** — Tremormetry workflow gotchas locked: use the full-Cascadia PNSN catalog (`pnsn_tremor_cascadia_full.csv`, **not** the 47.5°N-cut file); `resample_poly` everywhere (obspy FFT-resample → OOM + dv/v drift); GPU matched filter for discovery + densify; **per-era referencing** at sensor/rate-change dates to avoid fake dv/v steps; verify "real" via per-era invariance + cross-patch coherence + neighbouring stations.
- **2026-05-23** — Phase 3 station selection: one instrument per unique site, broadband > short-period > accelerometer (304-site list `data/inventory/phase3_priority_2020.csv`).
- **2026-05-22** — Phase 3.1 production rules: Wiener soft-threshold denoise at **effective K = 2.5** when combined |cc| ≤ 0.8 (else keep K=full); **MAXLAG 60 → 30 s**; vectorized stretching; resume via per-station `done.npy`. Phase 2.2 shelved (outputs deleted).
- **2026-05-13** — Canada Impact+ proposal reframed (professor feedback) to a **clean-tech** lead: geothermal in southern SK (DEEP / Aquistore Deadwood Formation), comparators in AB/BC/Yukon; the Earthnote dv/v pipeline as the method, anchored to [[Cascadia dv.v]].
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

- **08-21** — Plain-language 4-D inversion summary: joint fault map m(x,t) + per-station site term + per-family/era offset; alternating solve validated vs the full solve; ran **~30 M measurements × 6,354 days × 188 stations**; single-day maps noise-dominated (~0.7 % vs 0.04 % signal), relative to the 2019–2024 mean.
- **08-20** — Inversion diagnostics scoped (image similarity across block sizes, time-varying resolution + model covariance, L-curve); derived that **per-pair dv/v reference offsets solve inside the space–time inversion** (a fixed-effects demean gauged to the reference window).
- **08-19** — **Adversarial review** of the 4-D inversion (data gaps in the 12k+ dv/v series to be handled); added a **GPS-slip → strain → stress** comparison track (Gualandi's daily 2007–now inversion, 31-day-smoothed for dv/v comparison).
- **08-11** — Landslides **CSSI** NSF project meeting (petascale SAR + EarthScope data hub, data fusion/assimilation, digital twins, agentic workflows) — adjacent thread.
- **07-24** — Inversion fix: stop excluding grid cells shallower than 30 km; early-coda windows → sensitivity near source + receiver.
- **07-22** — Inversion method clarifications (monthly moving stack stepped 1 day → consider 2-month dv/v smoothing).
- **07-21** — Framed the **4-D δβ/β inversion** on the plate interface: 12,703 certified LFE families / 187 stations, data = G·model + site terms; checkerboard resolution ~70–140 km, noise-limited.
- **07-09** — Refined **9-stage per-station pipeline** (3-lane NET/GPU/CPU conveyor) scaled across boreholes; **B926 families validated against Lin (99 % of 530 real vs 0 % null)** → one picker, thresholded by the LFE label, validated per-station.
- **07-08** — Full per-station tremormetry pipeline documented (Stages 0–8: discovery → picker → cluster → select → densify → daily stacks → coda dv/v → trust battery → multi-window inversion).
- **06-24** — LFE catalog + dashboard scoping: unique-LFE indexing (±1 min association), family dots over the tremor catalog, spatial-resolvability-over-time question.
- **06-18** — Documented the LFE picker's **23 hand-crafted features** (spectral 13 / envelope 7 / polarization 3); `hv_ratio` the single strongest, SNR-independent.
- **06-15** — **LFE fingerprint (second discovery route)**: 23-feature supervised classifier on the Lin (2023) catalog (PGC/B011/B926); LFE-vs-noise AUC 0.95–0.98, LFE-vs-EQ/blast 0.97, autoencoder-confirmed (0.965); per-sample U-Net picker single-station-capped; next levers = 3-component clustering + multi-station.
- **06-12** — Tremormetry methodology re-audited (Fable 5 caught + fixed issues); the envelope-peak discovery recipe documented and critiqued (push network coincidence + spectral discrimination upstream).
- **06-11** — Action list (rough note, largely observatory logistics): send the abstract to coauthors (Zoe to review); website feedback loop with Deb starts Monday; pressure-vs-current-meter data comparison, huddle tests, east current-meter distance/location checks, realtime SeedLink server (then email Helen); GNSS-A processing thread is ad hoc — David suggests Yoichiro.
- **06-10** — Visited Paroscientific; meeting with Jerry Paros.
- **06-04 / 06-05** — Coda-wave sensitivity-kernel theory for deep repeating sources (LFE) + surface receivers, then fault-plane δβ/β tomography from many LFE-family/station pairs — the tremormetry inverse-problem foundation.
- **06-01** — Designed the notes-app **Research Directions** feature (temporal concept-graph + heuristic link prediction, adapting Marwitz et al. 2026 for cross-project suggestions).
- **05-29** — **Tremormetry**: per-station LFE-coda dv/v workflow on UW.HDW + UW.GNW; GPU discovery + matched filter; per-era referencing (HDW 2017 rise real, 2023 jump = EHZ→HHZ artifact).
- **05-22** — Phase 3.1 launched on 110 broadband stations (full-year 2020); Wiener denoise dominant at year scale (95 %); CC.SHRK autoencoder seasonal clustering; deleted Phase 2.2 outputs.
- **05-21** — PNW digital-twin scoping ([[Earthnote/05-21-26 Notes]], `earthnote-worldview`) after the Ryan Delaney / Salish Sea Digital Cousin meeting; a Cesium-globe + observability + geocompute build with a strict observed-vs-forecast contract, whose offshore-sensing tier (seafloor pressure, GNSS-Acoustic, Axial, cabled OBS) folds COSZO data into a Cascadia slow-slip composite.
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
- **Per-sample U-Net LFE picker** (EQTransformer-style continuous P(LFE)) — *single-station-capped* (per-sample AUC 0.85; precise-label refinement failed because LFEs are patch-specific + emergent) ([[06-15-26 Notes]]).
- **3-component LFE clustering** — *most promising untested lever* (the current discovery/clustering backbone is vertical-only, and S-polarization — the strongest discriminator — is invisible to it).
- **Landslides CSSI (NSF)** data-hub / agentic-workflow collaboration — *adjacent thread* ([[08-11-26 Notes]]).

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

1. **Finish + analyze the Phase 3.1 110-station full-year run** — review the three gate-passing stations, generalize the CC.SHRK seasonal-cluster fingerprinting to more stations.
2. **Tremormetry: extend beyond HDW/GNW and implement the fault-plane inversion** — assemble the LFE-family/station/lapse-window sensitivity matrix and solve for δβ/β(x₀,y₀,T) per the 06-04/06-05 theory.
3. **Phase 2.4 hyperparameter sweep** — execute the planned outer-product of frequency band × coda window × channel-pair averaging on the saved 30-min tensors (no need to re-CC).
2. **Phase 2 multi-year extension** on Tier A + selected Tier B — 2020–2026 with monthly moving-reference stacks; turn the pilot into a science run.
3. **Cross-validate stretching vs MWCS on Tier A** to confirm the hourly-QC std is method-limited, not noise-limited.
4. **Add Z·N and E·N component pairs** — compare cleanest pair per station.
5. **Document the 24-h running-median hourly series** once Phase 2 is multi-year, to catch coseismic steps from M6+ teleseisms.
6. **Forward-monitoring pipeline** (parallel track): FDSN-direct ingest for the 122-station roster of post-2023 deployments invisible to PNWstore.

## Timeline

- **2026-06-05** — Fault-plane δβ/β tomography derivation (LFE-family/station coda pairs).
- **2026-06-04** — Coda-wave sensitivity-kernel derivation (deep source / surface receiver).
- **2026-06-01** — Notes-app Research Directions feature designed.
- **2026-05-29** — Tremormetry LFE-coda dv/v workflow (HDW, GNW); GPU discovery + matched filter.
- **2026-05-23 / 05-22** — Phase 3.1 production launch (110 broadband stations, Wiener denoise gate); CC.SHRK autoencoder fingerprinting; Phase 2.2 deleted.
- **2026-05-21** — PNW digital-twin scoping; Salish Sea Digital Cousin meeting.
- **2026-05-13** — Canada Impact+ proposal clean-tech reframe.
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
