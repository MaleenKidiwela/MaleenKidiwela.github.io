---
tags: [bransfield, stage-5, polarity]
status: outline
parent: "[[PROJECT_PLAN]]"
---

# Stage 5 — ML First-Motion Polarity Picking

Assign first-motion polarities (up/down) to P picks for use in focal mechanism inversion ([[06-focal-mechanisms]]). Manual polarity picking doesn't scale; ML does.

## Inputs

- Located events from [[04-location]].
- Continuous waveforms.
- The P picks (from Stage 1, refined by location).

## Method

- **DiTingMotion** (CNN) — current state of the art for ML polarity, trained on >2M manual polarities.
- Alternative: **PolarCAP** style.

## Procedure per pick

1. Extract a window centered on the P-pick (typically ±2 s) from the vertical channel.
2. Filter (e.g., 1–10 Hz bandpass).
3. Feed to model → polarity probability (up / down / unknown).
4. Apply thresholds; flag low-confidence as undetermined.

## OBS-specific concerns

- Component orientation often unknown / drifting → vertical-only polarity is the safe choice.
- Low-gain seismometer (`?LZ`) on BRAVOSEIS — verify dynamic range is sufficient for clear first motions.
- Check sign convention (up = positive ground motion) per StationXML.

## Outputs

- `catalogs/polarities.csv` — `event_id, station, time, polarity (U/D/?), prob`.

## QC plan

- Compare ML polarities vs manual polarities (user-provided) on a subset.
- Per-station polarity reliability score → drop unreliable stations from FM inversion.

## Run-log

- **2026-05-08** — Outline only.
