---
tags: [bransfield, stage-3, association]
status: outline
parent: "[[PROJECT_PLAN]]"
---

# Stage 3 — Phase Association

Group cleaned picks from [[02-discrimination]] into events. The Bransfield network is sparse and azimuthally biased — only 14 OBS + 14 5M + 2 land stations, all north of the basin axis — so association is harder than usual.

## Inputs

- `catalogs/picks_clean/**/*.csv` — kept picks with `time, trace_id, phase, prob`.
- Station metadata (lat/lon/elev) from `data/stationxml/`.
- A coarse 1D velocity model for travel-time predictions.

## Method candidates

| Tool | Strengths | Concerns for Bransfield |
|---|---|---|
| **PyOcto** ✅ locked | Fast, modern, octree-based, robust to noise. Same author as SeisBench (Münchmeyer) — drops in directly | Need to set search grid carefully given azimuthal gap |
| **GaMMA** | Bayesian, good with mixed-quality picks | Slower; tune for low station count. Used as cross-check on a subset |
| REAL | Battle-tested, deterministic | Older codebase, less ergonomic |

**Stack locked: PyOcto for primary association, GaMMA as 1-week sanity cross-check.** SeisBench has no built-in associator; PyOcto is the natural pairing.

Run twice — once on `picks_tectonic.csv`, once on `picks_icequake.csv`, with class-appropriate velocity models and depth bounds.

## Velocity model

- Start: a 1D model from BRAVOSEIS tomography (need to dig up reference / supplementary data).
- Include water layer for OBS travel times — critical, otherwise S-P times look wrong on OBS.
- 3D from later Stage 4 work can be folded back here as a v2.

## Outputs

- `catalogs/events.csv` — `event_id, origin_time, lat, lon, depth, n_picks, n_p, n_s` (preliminary location from associator).
- `catalogs/event_picks.csv` — long-format `event_id, station, phase, time, prob`.

## Parameters to record

- Octree resolution / search bounds
- P/S residual tolerances
- Minimum station count + minimum P/S ratio per event
- Time window / stride

## Open decisions

- [ ] Which 1D model anchors travel-time prediction? (BRAVOSEIS, Christeson 2018, ak135?)
- [ ] Water layer thickness handling per OBS — bathymetry-dependent.
- [ ] How permissive on min-station-count? Sparse network → more single-cluster spurious events if too low.

## Run-log

- **2026-05-08** — Outline only.
