---
tags: [bransfield, validation, ground-truth]
status: pending-data
parent: "[[PROJECT_PLAN]]"
---

# Manual P/S picks — cross-stage validation set

User-provided manual P and S arrival times (with magnitudes) for a subset of stations in this region. Used as ground truth across multiple stages.

## Drop location
Originals: `bransfield-eq/data/manual_picks/` (any format).
Normalized: `bransfield-eq/catalogs/manual_picks.csv` — written by `src/bransfield_eq/manual_picks.py`.

## Canonical schema

| column | notes |
|---|---|
| event_id | groups picks for the same event |
| origin_time | event origin (UTC) if known |
| magnitude | event magnitude if known |
| network, station, location, channel | SEED codes |
| phase | "P" or "S" |
| pick_time | UTC arrival |
| analyst | initials if known |
| source_file | original filename |

> [!note] Polarities / hand-locations
> Current set has P/S times + magnitudes. No polarities, no hand-located events. The schema reserves columns for them so they can be added later without a migration.

## How each stage uses these picks

### Stage 1 — [[01-ml-picking]]
- **Validation:** match each manual pick to the nearest PhaseNet pick on the same channel within ±0.5 s (P) / ±1.0 s (S). Compute precision/recall by station and overall.
- **Threshold tuning:** sweep `P_threshold` / `S_threshold` over the validation set to find the operating point that matches your manual sensitivity.
- **Fine-tuning:** if pick volume permits (≥ ~1000), fine-tune PhaseNet weights on Bransfield-specific data. Otherwise stick with `stead` / `instance` defaults.

### Stage 2 — [[02-discrimination]]
- Manual picks are assumed to be tectonic earthquakes — use them as the **positive** class for any ML discriminator. Need a separate negative set (T-phases, shots, ice signals).

### Stage 3 — [[03-association]]
- Run associator on manual picks alone. Should cluster into the user's known events. If it doesn't, the associator config is the problem — not the picks.

### Stage 4 — [[04-location]]
- If/when hand-located events arrive, compare to NLLoc / HypoDD locations as ground truth. Per-axis residual distributions (Δlat, Δlon, Δdepth, Δtime) measure absolute accuracy.

### Stage 5 — [[05-ml-polarity]]
- N/A unless polarities are added.

## Status (as of 2026-05-08)

**Files received** (in `data/manual_picks/`):
- `nllmaleen_mag07_202210.out` — NLLoc obs, 12,099 picks (events with M ≥ 0.7)
- `nllmaleen_magall_202210.out` — NLLoc obs, 45,678 picks (all magnitudes)
- `collect_regional.out` — Nordic / SeisAn, 853 picks across 43 regional events with M_L 0.3–3.2

**Total: 58,630 picks across 6,970 events.** Loader in `src/bransfield_eq/manual_picks.py`; canonical CSV at `catalogs/manual_picks.csv`. Re-run with `PYTHONPATH=src python -m bransfield_eq.manual_picks`.

### Parser quirks worth knowing

- **Nordic format** has station code (cols 2-6) and component code (cols 7-8) packed with no whitespace, so naive whitespace tokenization produces nonsense like `BRA26EZ`. Parser uses fixed-column slicing.
- **Nordic magnitude regex** is bounded to `-2 < M < 10` and takes the *last* `<float><L|b|B|w|s|S|c>` match in the type-1 line — the first match would be the seconds field's location/agency code (e.g. "15.9BL").

### Station coverage (top 15)

| Station | Picks | Notes |
|---|---|---|
| BRA26 | 11,928 | workhorse OBS |
| BRA22 | 11,448 | |
| BRA27 | 7,091 | |
| BRA25 | 6,882 | |
| BRA21 | 5,916 | |
| BRA23 | 5,327 | |
| BRA24 | 2,943 | |
| BRA19 | 2,109 | |
| BRA20 | 1,262 | |
| BRA18 | 1,180 | |
| BRA16 | 717 | |
| BRA15 | 541 | |
| BRA13 | 459 | |
| **BRA05** | **239** | **not in our 14-station FDSN list — investigate** |
| BRA14 | 154 | |

### Open items

- [x] ~~`BRA05` mystery~~ — resolved 2026-05-08: BRAVOSEIS OBS were split across two data centers. EarthScope hosts BRA13–27 (14 stations); GEOFON hosts BRA02, 03, 04, 05, 08, 09, 10, 11 (8 stations). Total deployment was 22 OBS (BRA01, 06, 07, 12, 17 missing — assumed failed). Config now has two ZX targets and the inventory pulls all 22.
- [x] ~~Network mapping~~ — `manual_picks.resolve_networks()` joins against `station_geometry.csv`. 58,606 / 58,630 resolved.
- [x] ~~Origin-time backfill~~ — NLLoc has no explicit origin time per event. Backfilled as the earliest pick of each event (good to within seconds for local events). 57,777 picks / 6,918 events backfilled. Adequate for event-window validation modes with tolerances of tens of seconds.

## Validation confounders — non-tectonic signals

Manual picks are tectonic earthquakes only; PhaseNet will (correctly) also pick **non-tectonic signals** that have no manual entry:

- **Icequakes / cryo-signals** — calving, basal slip, harmonic tremor; emergent onsets
- **Whale calls** — fin and blue whales emit 15–30 Hz calls that look like seismic transients on OBS
- **Ship noise** — hydrophone-dominant, broadband transients during shipping passes
- **T-phases** — late, low-frequency, hydrophone-dominant
- **Volcanic tremor** — sustained narrow-band signals near Orca submarine volcano
- **Active-source shots** — once Wei's airguns deploy

Naive precision = TP / (TP + FP) over-penalises PhaseNet because all of the above land in FP. Two mitigations in `scripts/05_validate_picks.py`:

1. **`--event-window N`** (cheap, available now): only count PhaseNet picks within ±N seconds of any manual event origin time. Outside those windows, PhaseNet picks are ignored — neither TP nor FP. This isolates "did we recover known earthquakes" from "what fraction of all picks are tectonic". Trade-off: doesn't measure precision over the whole record, only inside known-event windows.
2. **Class-aware FP attribution** (deferred to [[02-discrimination]]): once we have a discriminator, split FPs into "tectonic-class but no manual match" (real model error) vs "non-tectonic class" (expected, not the picker's fault).

Use **mode 1** for Stage 1 sign-off. Use **mode 2** as the headline metric once Stage 2 lands.
- [ ] Build `scripts/05_validate_picks.py` for Stage 1 precision/recall once waveform downloads + PhaseNet picks exist.
