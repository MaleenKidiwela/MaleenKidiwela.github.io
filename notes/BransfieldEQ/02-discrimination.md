---
tags: [bransfield, stage-2, discrimination, classification, icequakes]
status: outline
parent: "[[PROJECT_PLAN]]"
---

# Stage 2 — Event Classification

**Multi-class** classification of the Stage 1 pick stream. Bransfield Basin sits at an active spreading rift adjacent to glaciated landmasses (Antarctic Peninsula, South Shetland Islands), so non-tectonic seismicity is abundant *and scientifically interesting*. We catalog both tectonic earthquakes and icequakes; we drop everything else.

## Output classes

| Class | Catalog? | Notes |
|---|---|---|
| **tectonic** | ✅ keep, primary catalog | Local + regional EQs; the Stage 3-6 inputs |
| **icequake** | ✅ keep, separate catalog | Calving, basal slip, ice-shelf flexure, glacial tremor |
| ship | ✗ drop | Hydrophone-dominant transients during shipping passes |
| whale | ✗ drop | Fin/blue whale calls (15-30 Hz, repeating patterns) |
| t_phase | ✗ drop | Distant teleseismic energy via SOFAR |
| volcanic_tremor | ✗ drop (Stage 6 may revisit) | Sustained harmonic near Orca submarine volcano |
| active_source | ✗ drop | Wei's airgun shots (future); known shot times mask |

> [!note] Cryoseismology context
> Antarctic Peninsula has substantial cryoseismic literature (e.g. Olinger, Aster). Cataloging icequakes feeds into ice-loss / mass-balance / glacial-dynamics studies separate from the tectonic question. Keep the methodology open enough that the icequake catalog can be analyzed independently.

## Inputs

- Pick CSV stream from [[01-ml-picking]] (`catalogs/picks/<NET>.<STA>/*.csv`).
- Continuous waveforms (already on disk; need 3C seismic + hydrophone).
- Optional: shot log from BRAVOSEIS / Wei active source for hard masking.
- Manual ground truth from [[manual_picks]] for the tectonic class.

## Discriminating icequakes from earthquakes — features that work

These are the signal-domain features for the classifier; ranked roughly by usefulness for our OBS-heavy network.

### Spectrogram / frequency
- **Onset gradient** — sharp impulsive (EQ) vs gradual emergent (icequake). Easy to compute as the slope of the STA envelope around the pick.
- **Spectral centroid + bandwidth** — calving and basal stick-slip usually more narrow-band and lower-centroid than local tectonic EQs.
- **Coda Q-factor (decay rate)** — ice is highly scattering + absorptive → long, slowly-decaying codas. Earthquakes decay fast.
- **Harmonic content** — glacial tremor shows parallel bands in the spectrogram (regular harmonic stripes). So does Orca volcanic tremor — needs location to separate.
- **Duration / magnitude scaling** — icequakes are longer for their amplitude than EQs (multi-subevent source processes).

### Hydrophone-specific (OBS edge)
The OBS hydrophone (`?DH`) is the single most useful channel for cryo-vs-tectonic.

- **Hydrophone:seismometer amplitude ratio** —
	- Tectonic local: H ≈ Z (slightly weaker on H).
	- Submerged cryo (calving, iceberg break-up): H equal to or stronger than Z (acoustic coupling into water column).
	- T-phase / ship / whale: H dominates by 10× or more.
- **P-onset coherence** — tectonic: P on H aligns to ~1 sample with Z. T-phase / whale / continuous noise: no coherent P.
- **Bubble pulses / repeating coda on H** — strong tell for iceberg disintegration / calving events.

### Source geometry (feeds back from Stage 3-4)
- **S-P time** — very short (<2 s) for surface-source cryo at ice margins.
- **Apparent depth** — cryo locates near 0 km; Bransfield tectonic at 5-25 km. Becomes the cleanest discriminator once [[04-location]] runs, but it's a feedback, not an input feature.

## Pipeline architecture

1. **Engineered features** (~10 per pick): centroid, bandwidth, coda Q, H:Z ratio, P-onset coherence, onset slope, harmonic-stripe energy, S-P time, duration. Interpretable; feeds a gradient-boosted-tree classifier.
2. **Spectrogram CNN** in parallel: 2-D spectrogram window around each pick → CNN → class. Transfer-learn from published Antarctic cryo classifiers (PNSN cryo, Olinger/Aster work) rather than from scratch.
3. **Vote** between the two. Disagreement → flag for manual review + add to training-set queue. Keeps the loop going.

## Methods (cascaded, cheap-first)

1. **Shot-time masking** (deterministic) — exclude picks within ±N s of known shot times.
2. **Per-pick spectral / polarization features** — used both for rule-based classes and as ML inputs:
	- Dominant frequency, bandwidth, spectral centroid (T-phases vs EQs vs whales)
	- Rectilinearity / planarity (P-wave linearity)
	- Hydrophone-to-seismometer ratio (T-phase, ship, whale tells)
	- Duration / coda shape (icequakes are typically emergent + long-coda)
	- Time-of-day / inter-event interval (whale calls cluster; ships are continuous)
3. **ML classifier on a short window around each pick** — start with a published architecture (DiTing-style or simple CNN on spectrograms); train on labeled examples.
4. **Post-association sanity** — events that don't locate plausibly with [[03-association]] flag for re-classification.

> [!note] Order matters — cheap-first cascade
> Shot mask → spectral rules → ML → post-association sanity. Cheap filters first reduce ML inference cost.

## Training data

- **Tectonic positives:** manual picks from [[manual_picks]] (58k+).
- **Icequake positives:** need labeled examples. Options:
	- Hand-label a few hundred from the BRAVOSEIS waveforms (look for emergent onsets near the ice shelf).
	- Use any existing cryo-event catalogs from BRAVOSEIS or other Antarctic projects.
	- Bootstrap: train on tectonic-only first, then iterate on rejected picks to find icequake clusters.
- **Ship/whale/T-phase negatives:** can often be auto-labeled with rules (high hydrophone:seismometer ratio + spectral signature) before any ML.

## Outputs

- `catalogs/picks_classified.csv` — every Stage 1 pick with: `class`, `class_prob`, `feature_*` columns.
- `catalogs/picks_tectonic.csv` — filtered to `class == "tectonic"`, schema-compatible with [[03-association]].
- `catalogs/picks_icequake.csv` — filtered to `class == "icequake"`, schema as above for an icequake-specific Stage 3 run.

## Stage 1 → Stage 2 → validation feedback loop

Stage 2 also closes a gap in [[manual_picks]] validation: once classification is in place, FP attribution from `scripts/05_validate_picks.py` can be split into

- **FP_tectonic** — PhaseNet pick, classed as tectonic, no manual match. *Real model error.*
- **FP_icequake** — PhaseNet pick, classed as icequake. *Expected; counts toward icequake catalog instead.*
- **FP_other** — non-seismic noise. *Drop silently.*

This is the headline precision metric for Stage 1 sign-off. Until Stage 2 exists, use `--event-window` mode in the validator to avoid penalizing PhaseNet for finding icequakes/whales/ships.

## Honest caveats

- **Distant calving** loses high-frequency content; spectrum starts to look like a distant tectonic EQ. Need location (depth → 0 km vs 5-25 km) to break the tie.
- **Orca volcanic tremor and glacial tremor** are nearly identical in spectrum — both harmonic narrow-band. Separation is by location (Orca at -62.45° lat -58.45° lon vs ice margins at the basin's north/south coasts), not signal alone.
- **Boundary events** (hybrid cryo-tectonic, slow-slip, ice-quake-triggered earthquakes) will exist; the classifier will return mass on both classes. Treat as a separate "uncertain" bin and human-review.

## Open decisions

- [ ] Hydrophone retention — already locked in for Stage 1 download (decided 2026-05-08). Good — we need it.
- [ ] Hand-label budget for icequakes — how many examples are needed before the ML classifier becomes useful?
- [ ] Use a published Antarctic icequake classifier or train from scratch?
- [ ] Run two Stage 3 associations in parallel (tectonic vs icequake) or serially?

## Run-log

- **2026-05-08** — Outline. Reframed from binary filter (drop non-tectonic) to multi-class with **icequake as a kept output catalog** in addition to tectonic.
