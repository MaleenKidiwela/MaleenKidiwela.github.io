# Cranium — BransfieldEQ

> Concise big-picture state of the Bransfield Basin earthquake project. Maintained by Claude-desktop routine on a daily cadence. Sources: vault notes in this folder + the project repo. If anything here conflicts with the repo or the latest daily note, trust those and propose an update.

## Associated repos

- [github.com/MaleenKidiwela/bransfield-eq](https://github.com/MaleenKidiwela/bransfield-eq) — primary code: end-to-end ML-assisted earthquake workflow (picking → discrimination → association → location → ML polarity → focal mechanisms). Created 2026-05-08. Local path `~/Documents/bransfield-eq/`.

## Status

Stage 1 (picking) is complete across the full 14-month BRAVOSEIS deployment (2019-01-01 → 2020-03-01): OBSTransformer `obst2024 @ 0.1/0.1` ~8.5 M picks; PhaseNet `instance @ 0.1` ~3.7 M picks. **Stage 2 (pyocto) is complete for the full year: 42,040 events / 483,516 picks**, after the XC bottleneck was fixed by pre-windowing every pick into a flat memmap (540× speedup; full pipeline ~1 h 50 min). **Stage 3+4 relocation is run full-year by two independent methods** — GrowClust (`growclust_picker_only.csv`, 42,040 relocated) and hypoDD via a **pruned-backbone (Stage A) + dense sub-cluster (Stage B)** scheme, because monolithic year-scale hypoDD is intractable. **Shot discrimination** removed BRAVOSEIS airgun contamination (a v2 spectral classifier, AUC 0.998, flagged 25 % of the catalog; canonical inputs are now the `_no_shots_v2` set, 31,516 events). **Stage 4b NLLoc absolute relocation** runs end-to-end on an extended 38-station Python velocity grid (31,515 events; standard-tier reliable subset 7,272), feeding a hybrid HypoDD-relative + NLLoc-absolute catalog. **Vp/Vs = 1.78 is empirically confirmed.** Per Marine's 2026-05-20 review, the **earthquake-location paper is now the priority, targeting mid-July submission**; tremor is deferred. Stage 5 (ML polarity) and Stage 6 (focal mechanisms) remain outline-only. The Orca swarm images consistently across all methods: centroid ≈ (−62.425, −58.385), depth 2–6 km, ~5 × 5 km extent. After a summer pause the project **restarted 2026-08-27**: the plan is to review prior findings and apply **Maochuan Zhang's polarity-picking code** to the developed catalog, making Stage 5 (ML polarity) the active next step, with an update to William due the following Tuesday.

## Goals

- End-to-end reproducible workflow from raw OBS waveforms to focal mechanisms for the BRAVOSEIS deployment, then adapt for Dr. Shengji Wei's planned DAS + active-source experiment from Great Wall Station.
- Build an **expanded catalog** beyond the manual `nllmaleen_mag07_202210.out` (12,099 picks / 1,126 events) — completeness, not just QA.
- Two parallel output catalogs from Stage 2: **tectonic** and **icequake** (icequakes are a research target, not noise).
- Map the magmatic plumbing under Orca submarine volcano via relocated event clusters.
- Discriminate Wei's larger airgun shots from tectonic events (forward target).

## Key questions

- Which subset of stations does PhaseNet pick on vs. the manual analyst? Recall is bounded by station coverage overlap, not just sensitivity.
- Did the OBS-domain DeepDenoiser fine-tune + PhaseNet fine-tune (Phase 1 of `05-09-26 Notes`) help on the held-out August 2019 set? Decision is gated on `catalogs/aug2019_eval.csv`.
- What's the right velocity-model treatment of the water column for pyocto's Eikonal solver — sea-level datum with epsilon water layer, or seafloor datum? Currently sea-level with Vs=0.5 km/s; revisit after Stage 4 sensitivity check.
- Which existing catalog is ground truth — `mag07` (high confidence) or `magall` (broader)? `mag07` for validation, `magall` for noise-window exclusion in denoiser training.
- How much of the 23:51:34 Dec 26 "second event" (PhaseNet-only, missed by manual analyst) class is real? Stage 4 magnitudes + waveform CC will pin it down.
- Snakemake/Nextflow pipeline or notebook-driven for v1? Currently script-driven; deferred.

## Decisions

- **2026-08-27** — Restart the project after a summer pause; apply **Maochuan Zhang's polarity-picking code** to the existing catalog to kick off Stage 5 (ML polarity).
- **2026-05-20** — Marine review: **prioritize the EQ-location paper, mid-July submission target**; defer tremor detection. Adopt ELEP ensemble picking for ~1–2k high-quality picks → fine-tune a lightweight local PhaseNet on OBS noise; evaluate **GrowClust 3D / GraphDD** (hypoDD is 1D); add Maochuan's polarity picker; continue dv/v.
- **2026-05-19** — **Vp/Vs = 1.78 locked** for NLLoc (median of 106,841 S/P pairs, depth-flat); the 2.10 template value rejected and its artifacts deleted. v2 NLLoc (1.78, 38 stations, extended grid) is canonical; the **standard reliable tier** (gap<180°, RMS<0.5 s, Nphs≥6, interior) = 7,272 events is the paper set.
- **2026-05-18** — Reuse the Stingray P travel-time grids (no MATLAB on cluster); build the extended velocity grid in Python + NLLoc `Grid2Time`. **srModel z is depth-below-seafloor** (datum fix). Min 4 ZX picks/event. NLLoc TRANS rotation is **+36** (CW); shipped `.hdr` origins were sign-stripped.
- **2026-05-15** — Shot discrimination: v2 flag = (±5 s temporal) OR (in-window spectral classifier p≥0.5); 10,524 events (25 %) flagged. Canonical catalogs switch to `_no_shots_v2`. Manual picks confirmed shot-free.
- **2026-05-14** — Year-scale hypoDD must be **pruned backbone (Stage A) + K-means sub-clusters (Stage B)** with bridge events + closest-centroid dedup; monolithic LSQR on the 20k-event cluster is intractable (>11 h/iteration).
- **2026-05-13** — XC-prep architecture: **pre-window every pick once into a memmap**, never decode mseed in the pair loop (EQcorrscan/hypoDDpy pattern). dt.cc must store **travel-time** differentials (tt = pick − origin), not pick-time differentials — so the **May-12 30-day partial is superseded**. GrowClust relocations are non-deterministic (unstable INDEXX heapsort + thread-order dt.cc); a canonical-sort `write_dtcc` patch exists (reverted on request).
- **2026-05-12** — Pyocto switched from monolithic year-long `associate()` (16 h zero-output stuck run) to daily chunks in parallel (1 chunk/day, 10 threads each, 10 chunks at a time). Resume-capable via per-day output files. Margin = 120 s around each day to catch boundary events; strict-window filter prevents double-counting.
- **2026-05-12** — GrowClust station list is **bare station codes** (no `NW.` prefix) — the Fortran format truncates to 5 chars and crashes on a `.` at column 3.
- **2026-05-12** — GrowClust travel-time table extended to `tt_del1=300 km` / `delmax=250 km` / `tt_dep1=60 km`; velocity model extended with half-space marker at 70 km.
- **2026-05-11** — Velocity model rebuilt with sea-level datum + explicit 1.3 km water layer at Vp=1.4558 km/s (Kidiwela+ measured), Vs=0.5 km/s (only because pyrocko's Eikonal divides by Vs). Rock 1.3–11.3 km uses Orca 3D median per depth; deep extension hand-picked 6.6 / 6.8 / 7.0 km/s at 16.3 / 21.3 / 31.3 km. Water layer is for vertical-datum bookkeeping, not ray paths — Fermat routes first-arrival rays through rock.
- **2026-05-11** — Station geometry patched from Kidiwela+ Table S1: inverted lon/lat for all 15 ZX OBS (median 133 m correction, max 243 m), bathymetric water depths for 13 (BRA25 was off by 430 m). BRA05 clock corrected by −0.167 s on every pick CSV.
- **2026-05-08** — **`instance` weights @ threshold 0.1 locked** as PhaseNet default after the rare double-win sweep (P recall 9 → 45 → 64 %, P precision also up). STEAD is land-only; `instance` was trained on European OBS, much closer to BRAVOSEIS domain.
- **2026-05-08** — Run **both** PhaseNet and EQTransformer in production (cheap on GPU); union of picks → PyOcto handles overlap. PhaseNet wins on P, EQT wins on S.
- **2026-05-08** — Discovered **22 BRAVOSEIS OBS, not 14**: 14 hosted at EarthScope, 8 at GEOFON (BRA02–11). GEOFON OBS are uniform-rate 100 Hz HH? broadband; EarthScope OBS are mixed-rate low-gain `?L?`. Both work with PhaseNet (resampled to 100 Hz). Inventory bumped to 560 GB / 1.4 TB free disk.
- **2026-05-08** — Stage 2 reframed from binary "filter to tectonic" to **multi-class** with parallel tectonic + icequake catalogs. Hydrophone download is now load-bearing (ship/whale/T-phase discrimination + cryoseismic feature extraction).
- **2026-05-08** — **Associator: PyOcto** (Münchmeyer, SeisBench author). GaMMA reserved for 1-week sanity cross-check. **Locator: PyOcto → NLLoc → waveform CC → GrowClust → optional tomoDD**. GrowClust over HypoDD because median solver is more robust to ML pick outliers. Cross-correlation step is the biggest precision lever (catalog-only DD ~100 m → CC-DD ~10 m).
- **2026-05-08** — Velocity model comes from user's existing Orca 3D blended with 1D background NLLoc setup. Vp only; Vp/Vs ≈ 1.78 for S.
- **2026-05-08** — **Drop ZE coherence as a Stage 1 / 2 metric** (raw coherence 0.04–0.19 at 1–3 Hz, no separation by SNR). Use stretching corrcoef per CC. (Lesson from Earthnote, carried over.)
- **2026-05-08** — Honest evaluation held out on **August 2019** for the fine-tuning plan (1,144 picks / 106 events / 26 active days; mid-deployment; disjoint from 30 training days).
- **2026-05-08** — Manual catalog is a hand-curated subset, not a complete record. Use as **validation for accuracy on confirmed events**, not ground truth for completeness — don't penalize "missing from manual" as a false positive.

## Issues + solutions

- **Pyocto monolithic 16 h zero-output hang.** → Daily-chunk parallel runner; 10× faster effective wall, with per-day visibility and resume.
- **Pyocto `Columns 'x', 'y', 'z' expected` crash.** → Added `associator.transform_stations(stations)` before `.associate(...)`.
- **Pyocto `Pick` constructor type error** (newer C++ binding wants float epoch, not pd.Timestamp). → `picks_in["time"] = picks_in["time"].astype("int64") / 1e9`.
- **Pyocto Eikonal `EikonalExtError: unexpected/untested code executed`** from Vs=0 water layer (divide-by-zero). → Vs=0.5 km/s sentinel; no ray paths actually traverse water for our geometry.
- **Pyocto `id` column missing on stations DataFrame** (required by pyocto ≥0.6). → `stations["id"] = stations["station"]`.
- **GrowClust station list `NW.STNAME` truncation crash.** → Strip network prefix from both `stlist.txt` and `dt.cc`.
- **GrowClust `dt.cc` carried raw pick-time differences** (|dt| median = 21 h instead of sub-second). → `scripts/18b_fix_dtcc.py` post-processes existing dt.cc; `collect_pair_dts` in `scripts/18_growclust_xc_prep.py` subtracts origin-time difference for future runs.
- **Silent-correctness bug: `pd.to_datetime` without `unit='s'`** read epoch-second floats as nanoseconds → every event lived on 1970-01-01 → empty waveform cache → "kept 0 pairs / 0 obs" for 10+ min. → Detect numeric dtype, force `unit='s'`. Monitor grep filter updated to catch the symptom.
- **Silent-correctness bug: `ProcessPoolExecutor` imported but never used** — `--workers 24` was a no-op, XC loop single-threaded. → Wrapped in `ThreadPoolExecutor` (I/O + numpy releases GIL).
- **ZX channel filter `EH?,HH?,BH?,SH?` returns zero.** → ZX OBS use low-gain code `?L?`: `ELZ` @ 200 Hz vertical, `SL1/SL2` @ 100 Hz horizontals, `EDH` @ 200 Hz hydrophone.
- **ZX / 5M are reused temp network codes** across multiple unrelated deployments. → Filter ZX by `BRA*` station glob + window; filter 5M by Bransfield bbox.
- **R4DE2 epoch trap** (same Raspberry Shake bounced between Uruguay and Bransfield). → FDSN bbox filter at channel-epoch level drops Uruguay epochs.
- **OBS water depth.** → Free from StationXML negative elevation (no GEBCO needed for Stage 1).
- **`compute_coherence_raw` / PPSD short-day failures** (`noverlap ≥ nperseg`). → Cap `nperseg ≤ len(x)`, use `nperseg//2` for overlap (Earthnote-derived fix).
- **JupyterHub login shell not sourcing `.bashrc`** → 5 duplicate PATH lines + `claude` command not found. → `~/.bash_profile` sources `~/.bashrc`; deduped PATH.

## Recent activity

- **08-27** — **Project restart** after a summer hiatus: review prior findings and apply **Maochuan Zhang's polarity-picking code** to the developed catalog (Stage 5 kickoff); update to William next Tuesday.
- **05-20** — Meeting with Marine: presented EQ detection+location (structural features — dike, magma chamber, asymmetric rifting); paper prioritized for mid-July; action list (ELEP picks → PhaseNet fine-tune, GrowClust 3D / GraphDD, polarity picker, Shibin 2023 denoiser review).
- **05-19** — Hand-picking workflow + `seismologist-pick` skill (moveout/zoom/anti-anchoring safeguards); empirical Vp/Vs = 1.78 calibration; reliable-subset tiers (`40_filter_nlloc_reliable.py`); deleted all 2.10 artifacts.
- **05-18** — NLLoc absolute relocation end-to-end (scripts 27–39): rotation + datum bugs fixed, extended 38-station Python grid (edge-pinning 44.7→12.4 %, HQ 4,319→7,272), hybrid catalog.
- **05-15** — Shot discrimination: BRAVOSEIS airgun shotfiles (26,823 shots) found; v2 spectral classifier (AUC 0.998); `_no_shots_v2` catalogs (31,516 ev); manual-anchored + noshot Stage B rebuilds; Jan 17–18 spike verified as real swarm onset.
- **05-14** — hypoDD at scale: Stage A pruned backbone (676 ev, RMS 147 ms) + Stage B sub-clusters (~5,064 ev); time animations; regional ~8 % events dropped by all DD methods (need NLLoc).
- **05-13** — Full-year pyocto catalog (42,040 ev); pre-windowing fix (540× speedup); GrowClust non-determinism + dt-accounting bug found (May-12 partial superseded); hypoDD pipeline added.
- **05-12** — Pyocto daily-chunk scheduler launched (43 batches × 10 days). GrowClust Stage 4 validated end-to-end on 30-day partial (5,037 events relocated; 530-event Orca cluster; sub-100 m relative precision). Bathymetry basemap upgraded to MGDS Orca (~30 m vs GEBCO ~450 m). 5 bugs in GrowClust runner + 2 in XC prep fixed.
- **05-11** — Full-year Stage 1 picker pass complete (OBST `obst2024 @ 0.1`: 8.5 M picks; PhaseNet `instance @ 0.1`: 3.7 M). Velocity model rebuilt with sea-level datum and water layer. Station geometry patched from Kidiwela+ Table S1.
- **05-09** — OBS-domain DeepDenoiser + PhaseNet fine-tuning plan drafted (Phases 0–5, ~4 h wall). 30 curated training days listed; August 2019 held out.
- **05-08** — Project kickoff: full repo scaffolding, Stage 1 pipeline coded, 22-OBS inventory cross-referenced across EarthScope + GEOFON, manual ground truth loaded (58,630 picks / 6,970 events), end-to-end Dec 26 validation found a missed +25 s second event with 4-station coherence.
- **04-20** — Meeting with Dr. Shengji Wei (CAS Beijing) — Wei's planned DAS cable from Great Wall Station + active-source imaging across Orca and the rift zone.

## Explorations

- **PhaseNet `stead` weights** — *parked* (land-only training, weak on OBS). Replaced by `instance`.
- **PhaseNet `instance` @ 0.2** — *parked* (intermediate step). Replaced by 0.1.
- **EQTransformer alone** — *kept as complementary*; runs alongside PhaseNet on cluster.
- **GaMMA associator** — *parked* for now; reserved for 1-week sanity cross-check vs PyOcto.
- **HypoDD as primary DD relocator** — *abandoned* in favor of GrowClust (median solver is more robust to ML pick outliers).
- **Seafloor-datum velocity model** — *parked* (clean alternative if water-layer Vs issues recur). Currently using sea-level datum with epsilon water layer.
- **tomoDD on curated subset** — *deferred* until GrowClust relocations stabilize.
- **Approach D: denoiser encoder as PhaseNet pretraining** — *deferred* as multi-day v2 research project.
- **Fine-tune OBSTransformer too** — *deferred*; only PhaseNet fine-tunes in v1.
- **Vendor `phasenet-retrain` library** — *abandoned* in favor of a self-contained Lightning script using SeisBench's own training pipeline.

## Lessons learned

- **Silent-correctness failures are the worst.** Two cost ~2 h each. Monitor grep filters now catch `kept 0 pairs`, `events: 0`, `FAILED`, but behavioural bugs (unused thread pool) still need active CPU/thread inspection.
- **Idempotent skip-existing logic is mandatory** for any multi-hour batch on a flaky environment (3 JupyterHub container restarts in one day; pickers just continued from where they were).
- **Daily-chunk parallel > monolithic** for long-running associators. Per-day output gives immediate visibility, easy resume, and a margin-+-strict-window approach avoids double-counts at boundaries.
- **Manual catalogs are validation sets, not completeness ground truth.** Poor-man's-associator pick density on Dec 26 estimated 50–100 events vs. manual 2 → 15–30× completeness gain is realistic.
- **OBS-trained model weights matter.** `instance` (European OBS) beats `stead` (land-only) on BRAVOSEIS — the rare both-recall-AND-precision-up swap.
- **Network/instrument code reuse is widespread.** Same ZX, 5M, R4DE2 codes span multiple unrelated deployments across continents and decades.
- **Cross-correlation differential times are the differentiator.** Pyocto octree quantizes at 1.5 km; GrowClust XC-DD lifts that to sub-100 m for relative positions (absolute precision still bounded by pyocto starting + 1D velocity model).
- **Filename-prefilter beats timestamp-filter.** Reduced per-chunk startup from ~10 min (28k file scan) to <10 s (~76 files).
- **Preload-once mseed pattern** rewrites the inner XC loop into pure numpy slicing — 4 days → 67 min for 309k pairs.
- **Always pass control files as argv to GrowClust**, not stdin (`getarg(1, ...)`).
- **`pd.to_datetime` numeric input defaults to ns.** Always specify `unit='s'` for epoch floats.

## Ideas

- **Ensemble PhaseNet + EQT picks** rather than union (use PhaseNet P + EQT S directly).
- **SpecUFEx unsupervised feature clustering** for Stage 2 (Wang et al. 2024 SRL pattern; alternative or complement to planned supervised CNN).
- **Whale-call freq-ratio rule** (30–50 / 4–50 Hz energy) as a deterministic discriminator before ML.
- **1 s pre-P + 3 s post-P spectrogram window** as default Stage 2 feature.
- **Yarowsky self-training for label reconciliation** across stations — useful for class-aware FP attribution.
- **Add `rms_residual_s` derived column** to merged events file before plotting / handoff.
- **Re-evaluate water-layer Vs** once Stage 4 results return (current 0.5 only used by S-wave Eikonal outside actual ray paths).
- **Snakemake/Nextflow pipeline** for v2 production deployment.

## Future steps

1. **Earthquake-location paper — mid-July target.** Finalize the catalog (GrowClust + hypoDD Stage B + NLLoc hybrid) and figures; write methods for pre-windowing, shot discrimination, Stage A/B partitioning, and Vp/Vs calibration.
2. **Fix the `hypodd_id` indexing bug** (`scripts/22_*:58` → `event_idx+1`) so cross-catalog joins and the Stage B dedup are valid; re-merge (event counts will drop to true uniques).
3. **Rerun HypoDD Stage A / hybrid on the `picker_only_no_shots` input** so event_idx maps align with the v2 NLLoc catalog.
4. **NLLoc grid-top depth=0 pile-up** (~20 %): patch the top velocity layer or post-filter; optional Vp/Vs sensitivity rerun.
5. **ELEP ensemble picks → fine-tune lightweight PhaseNet**; evaluate GrowClust 3D / GraphDD as scalable 3D-velocity relocators (Marine action items). ~~Done: full pyocto + GrowClust + hypoDD year runs.~~
6. **Fine-tune PhaseNet** via the Phase 1–5 plan; evaluate on August 2019 (`catalogs/aug2019_eval.csv`) and decide whether to deploy the FT model for the production catalog.
4. **Stage 2 (multi-class classification)** — implement tectonic vs icequake split, adopt SpecUFEx + whale freq-ratio + spectrogram-window pattern from Wang 2024.
5. **Stage 5 (ML polarity)** — DiTingMotion / PolarCAP-style.
6. **Stage 6 (focal mechanisms)** — HASH/FPFIT for small events; gCAP/ISOLA for M ≥ 3.5.
7. **Pin down the 23:51:34 Dec 26 second event physically** (magnitude, location, waveform CC against event 2) once Stage 4 lands.
8. **NLLoc absolute relocation pass** with the Orca 3D velocity model — complementary to GrowClust's relative geometry.
9. **Adapt pipeline for Wei's DAS + active-source data** when it arrives.
10. **Snakemake/Nextflow conversion** decision.

## Timeline

- **2026-05-20** — Marine meeting; EQ-location paper prioritized (mid-July); action items (ELEP, GrowClust 3D / GraphDD, polarity, denoiser review).
- **2026-05-19** — Hand-pick workflow + `seismologist-pick` skill; Vp/Vs = 1.78 calibration; reliable tiers; 2.10 cleanup.
- **2026-05-18** — NLLoc end-to-end (scripts 27–39); extended 38-station grid; hybrid catalog.
- **2026-05-15** — Shot discrimination (v2 spectral classifier); `_no_shots_v2` catalogs; Stage B rebuilds.
- **2026-05-14** — hypoDD Stage A + Stage B at scale; time animations.
- **2026-05-13** — Full-year pyocto (42,040 ev); pre-windowing (540×); dt-accounting fix; hypoDD pipeline. Commit `57c92c9` (dt fix).
- **2026-05-12** — Pyocto daily-chunk scheduler; GrowClust Stage 4 validated; bathymetry upgrade. Commits `85c7af1` (initial pipeline push) + `807ff98` (README expansion).
- **2026-05-11** — Full-year Stage 1 picker pass complete; velocity model + station geometry rebuilt.
- **2026-05-09** — OBS-DeepDenoiser + PhaseNet fine-tuning plan; commit `400c027` (EQT + plotting + SLURM).
- **2026-05-08** — Project kickoff: repo scaffolding, Stage 1 fully coded and pushed; manual picks loaded; Stages 2–6 outlined; 22-OBS inventory; Dec 26 end-to-end test discovers second event. Commits `f8a4838` → `aeeccce` → `f919203` → `30ad34d` → `aa9ab5b` → `84f9494`.
- **2026-04-20** — Meeting with Dr. Shengji Wei (CAS Beijing); DAS + active-source plan from Great Wall Station / Orca volcano discussed.
- **Pre-2026-04-20** — (collapsed) workflow scoping, methodology selection, vault notes drafted across stages 01–06.
