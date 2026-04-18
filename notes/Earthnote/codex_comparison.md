# Active-Station Count: Comparison with Codex analysis

**Date:** 2026-04-15
**Context:** Codex was asked to produce a parallel list of currently-active PNSN stations from EarthScope. Its output lives in `/home/seismic/Earthnote/codex/`. This note reconciles its results against the Earthnote Phase 1.2 pipeline (see [[PROJECT_PLAN]]; Phase 1.2 work in [[04-15-26 Notes]]).

---

## Headline

Codex's **696 stations** are a strict subset of the Earthnote pipeline's raw active set within the same network scope. No disagreement at the station level — the gap comes entirely from scope differences.

| Scope | Codex | Earthnote raw (`active_stations.csv`) | Earthnote final (Phase 1.3 pool ∪ forward roster) |
|-------|-------|---------------------------------------|---------------------------------------------------|
| UW / UO / CC / PB, WA + OR | **696** | 793 | 614 |
| All networks, WA + OR + BC | — | ~820 | **679** |

Station-level set math within Codex's 4-network scope:
- In both: 696
- In Codex but not Earthnote: **0**
- In Earthnote but not Codex: 108

---

## Why Codex is smaller than the Earthnote raw set (108 stations missing)

### 1. Narrow hard-coded state bbox

Codex's `infer_state()` in `pnsn_earthscope_realtime_report.py` labels stations via:
```python
if 45.54 <= lat <= 49.1 and -124.9 <= lon <= -116.5:   return "WA"
if 41.8  <= lat <  45.54 and -124.9 <= lon <= -116.4:   return "OR"
return "OTHER"   # dropped from output
```

This mislabels or drops real PNW stations:
- **PB.B012 / B927 / B928** at lon ≤ -124.9 — Vancouver Island BC. Labeled "OTHER", dropped.
- **PB.B039 / B045-B049 / B932-B935** at lat < 41.8 — NorCal. Correctly out of scope; the Earthnote pipeline likewise filters these via Natural Earth polygons in Phase 1.2c.

### 2. Restricted to 4 PNSN networks

Codex covers only `UW / UO / CC / PB`. The Earthnote pipeline includes:

| Network | Stations (WA/OR/BC) | Role |
|---------|---------------------|------|
| CN      | 21 BC               | Canadian backbone (Vancouver Island, Lower Mainland) |
| NP      | 23 WA + 4 OR        | USGS NetQuakes / regional |
| GS      | 8 WA                | USGS post-2023 deployments |
| US      | 2 WA + 2 OR         | USGS national backbone |
| RE      | 1 WA                | Reftek-operated |
| IU      | 1 OR                | GSN (includes IU.COR — best long-running Oregon station) |

Total ~62 unique stations Codex omits by scope choice.

### 3. Possible availability-record requirement

A handful of stations inside Codex's bbox and network scope still got dropped (e.g. PB.B203, CC.CLMS, UO.CARP). Likely Codex required a match in `pnsn_availability_recent.txt` in addition to channel metadata. The Earthnote pipeline's raw active set is metadata-only: channel `start_date ≤ yesterday` AND (`end_date` is None OR `≥ yesterday`). The stricter `latest_ge_2d_ago` FDSN availability gate is applied downstream in Phase 1.2b.

---

## Why the Earthnote *final* count (679) is lower than its *raw* active set (793)

The 679 number is not "all active." It's **"active AND (qualifies for Phase 1.3 dv/v OR is a post-2023 deployment)."** The ~114 stations in the gap:

- **Pre-2023 deployed, had PNWstore data, failed Phase 1.2b gap filter** (no year with ≥90 % 3C uptime). Live on FDSN but not usable for historical dv/v.
- **Pre-2023 deployed, no PNWstore history at all** (audit buckets B and C). Live on FDSN but missed by the 4-DOY PNWstore sample or never ingested.

These are live; they just don't fit either science track.

---

## Which number is "right"

| Question | Answer |
|----------|--------|
| "All PNSN-family stations currently streaming to EarthScope in WA/OR" | Codex's **696** (conservative, PNSN-only) |
| "All networks currently streaming to EarthScope in WA/OR/BC" | Earthnote raw: **~820** |
| "Stations usable for dv/v pilot or future FDSN monitoring in WA/OR/BC" | Earthnote final: **679** |

---

## Caveats on the Codex output worth flagging

- **No BC coverage.** Canadian Vancouver Island / Lower Mainland stations are entirely absent — both the CN network and the mis-labeled PB.B012/B927/B928. For cross-border Cascadia monitoring, Codex's list is incomplete.
- **Bbox labeling is brittle.** Point-in-polygon on Natural Earth `admin_1_states_provinces` (10m) — what Earthnote uses — is more reliable than rectangular bounds + site-name string matching.
- **Network scope is narrow.** Excluding NP, GS, IU, US drops some of the highest-value stations for dv/v (IU.COR has 20+ years of ≥90 % 3C uptime; GS post-2023 deployments are a growing chunk of the forward roster).

## Caveats on the Earthnote counts

- `active_stations.csv` is channel-metadata active, not availability-verified. Use `shortlist_phase13.csv` / `pilot_pool_phase13.csv` for delivery-verified counts.
- The Phase 1.3 pool excludes stations whose PNWstore history doesn't pass the 90 % 3C uptime bar. Good for dv/v quality; bad if the question is "who's live right now."

## Action

No change needed. Codex's list is useful as a conservative PNSN-centric view; Earthnote's list is the operational input for Phase 1.3 (676 combos) and the forward-monitoring pipeline (1,303 combos / 122 stations).
