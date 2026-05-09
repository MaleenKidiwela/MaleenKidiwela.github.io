---
tags: [bransfield, stage-4, location, nlloc, growclust, hypodd]
status: design-locked
parent: "[[PROJECT_PLAN]]"
---

# Stage 4 — Earthquake Location

Locked stack:

```
PyOcto (Stage 3 association, coarse hypocenters)
        ↓
NLLoc — absolute locations  ← user has this set up already with Orca 3D + 1D
        ↓
Waveform cross-correlation differential times (sub-sample)
        ↓
GrowClust — relative relocation, tight clusters
        ↓
[tomoDD on subset]  ← optional cross-check for publishability
```

Run the full stack **twice**: once for the tectonic class from [[02-discrimination]], once for the icequake class. Different velocity priors, different depth priors, separate output catalogs.

## Why this stack — Bransfield-specific

- **Sparse + azimuthally biased network** demands probabilistic absolute locations (NLLoc oct-tree gives PDFs, not point estimates).
- **Deep OBS (1019–1943 m water)** require explicit water-layer travel-time corrections — already in `catalogs/station_geometry.csv`.
- **ML pick outliers on OBS** make GrowClust the safer first-pass DD method (median-based, robust to bad CC pairs) over HypoDD (LSQR sensitive to outliers).
- **Dense rift cluster + Orca volcano** benefit from the user's existing 3D blended velocity model in NLLoc.
- **Two seismicity classes** in one dataset require class-aware depth priors: cryo near 0 km, tectonic at 5–25 km.

## NLLoc absolute (4a) — already in hand

> [!important] User has the NLLoc setup written
> Existing config + 3D velocity model + 1D background. **Bring it in at Stage 4 — do not rewrite from scratch.** Confirm format and station-file compatibility with our `catalogs/station_geometry.csv` before running.

**To clarify when we get there:**
- 3D velocity model file format (and converter, if needed, for NLLoc grid format).
- Coordinate system / projection / origin lat/lon of the 3D grid.
- Vp/Vs assumption — model is Vp-only; need a Vp/Vs ratio to generate S travel-times. Typical for our crustal context: ~1.78. Verify against any published Bransfield S-wave studies.
- 1D background model file (user will provide; lives in `data/velocity_models/`).
- Station file: convert `catalogs/station_geometry.csv` → NLLoc station list (lat, lon, elev — using our `water_depth_m` to get the seafloor sensor elevations correctly).
- Depth prior — class-aware: tectonic 5–25 km, icequake 0–2 km. Encoded in NLLoc with `LOCSEARCH OCT` constraints + `LOCMETH` priors.

## Cross-correlation differential times — the precision lever

This step sits between NLLoc and GrowClust. It produces sub-sample-precision differential times from waveform similarity — and is **the single biggest accuracy lever** in the whole pipeline.

- For each event pair within ~5 km of each other, cut a window around each P (and S) arrival, cross-correlate, take the lag at peak coherence.
- Tools: `lassie`, `EQcorrscan`, or a custom ObsPy-based loop. EQcorrscan is the most popular for spreading-axis catalogs.
- Output: `catalogs/dt_cc.txt` — GrowClust- and HypoDD-compatible format.

> [!note] Worth as much engineering as the locator
> Catalog-only DD (NLLoc-pick-time differences) gives ~100 m relative precision. CC-DD gets to ~10 m. Don't skip the CC step.

## GrowClust relative (4b)

- Inputs: NLLoc absolute hypocenters + `dt_cc.txt` + station file + 1D model (or 3D extracted to a 1D-per-station table).
- Hierarchical cluster tree, median-robust, native QC flags per event.
- Output: `catalogs/events_growclust.csv` with new lat/lon/depth + cluster IDs + quality flags.

## tomoDD cross-check (4c, optional)

- Same DD math as HypoDD but with 3D ray tracing. Use the same Orca 3D + 1D blended model as NLLoc.
- Run on a curated high-quality subset (well-recorded, low-residual events from 4a).
- Compare GrowClust vs tomoDD locations on the same events. Agreement → publishable.

## Outputs

- `catalogs/events_nlloc.csv` — absolute, with PDFs and uncertainty cones.
- `catalogs/dt_cc.txt` — cross-correlation differential times.
- `catalogs/events_growclust.csv` — relative, with cluster IDs.
- `catalogs/events_tomodd.csv` (optional) — independent cross-check.
- `catalogs/events_final.csv` — merged best-estimate, with provenance per event.

## Open decisions

- [ ] Vp/Vs ratio for S travel-times — 1.78 default, refine if BRAVOSEIS S-wave inversion exists.
- [ ] Cross-correlation window length + filter band — typical: 1.0 s P, 1.5 s S, 2-15 Hz bandpass for OBS.
- [ ] Minimum CC coefficient threshold (typical 0.7).
- [ ] Magnitude calculation method — separate task, likely M_L from S-wave amplitude on horizontal channels with station correction.

## Run-log

- **2026-05-08** — Stack locked: PyOcto → NLLoc → CC → GrowClust → tomoDD (optional). User has existing NLLoc setup with Orca 3D + 1D blended model and a custom 1D background; will be brought in at run time, not rewritten.
