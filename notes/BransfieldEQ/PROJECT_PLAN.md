---
tags: [bransfield, project-plan, workflow]
status: draft-outline
parent: "[[Bransfield Basin Earthquakes]]"
---

# Bransfield EQ — Project Plan

End-to-end ML-assisted earthquake workflow for the Bransfield Basin, built first as methodology notes and then as a runnable pipeline. Testbed = BRAVOSEIS OBS + regional permanent stations + an existing catalog. Forward target = Dr. Shengji Wei's DAS + active-source deployment from Great Wall Station (see [[Bransfield Basin Earthquakes]], [[04-20-26 Notes]]).

## Goals
- Reproducible workflow from raw waveforms → focal mechanisms.
- Each stage has: input/output spec, tool choice + alternatives, parameter defaults, QC checks, known failure modes.
- Code follows docs — every stage notebook/script cites the corresponding note.

## Stages (top-down)

### 1. ML Earthquake Picking
- Framework: **SeisBench** running PhaseNet (EQTransformer kept as alternate for cross-check).
- Data source: **EarthScope DataStreams via ObsPy** (FDSN client) — download locally before picking.
- Networks/stations (initial pick run):
	- Network `ZX` (BRAVOSEIS OBS) — full ~1 year deployment
	- Network `5M` — full deployment
	- Station `AI.JUBA`
	- Station `AM.R4DE2`
- Steps: FDSN bulk request → local MSEED + StationXML → instrument response handling → SeisBench `PhaseNet().annotate()` / `classify()` → pick CSV.
- Open questions: OBS noise vs. PhaseNet training distribution (consider `stead`, `ethz`, `instance` weights); threshold tuning; whether to retrain/fine-tune on a hand-picked subset.
- Note → [[01-ml-picking]]

### 2. Event Classification
- **Multi-class**: keep both **tectonic earthquakes** and **icequakes** as output catalogs; drop ships, whales, T-phases, volcanic tremor, active-source shots.
- Methods: spectral features, polarization, hydrophone-to-seismometer ratio, ML classifier; cheap-first cascade.
- Note → [[02-discrimination]]

### 3. Association
- Phase-to-event association across heterogeneous network (sparse OBS + regional + DAS).
- Candidates: PyOcto, GaMMA, REAL; trade-offs for low station density and large azimuthal gaps.
- Note → [[03-association]]

### 4. Location
- 1D start (regional model + Bransfield-specific layered model), then 3D / double-difference (HypoDD, NLLoc, GrowClust).
- Velocity model sourcing: BRAVOSEIS tomography, published regional models.
- Note → [[04-location]]

### 5. ML Polarity Picking
- First-motion polarities from ML (DiTingMotion, PolarCAP-style).
- QC against manual picks on a subset; per-station polarity reliability.
- Note → [[05-ml-polarity]]

### 6. Focal Mechanisms
- HASH / FPFIT for small events using ML polarities; full waveform (gCAP / ISOLA) for M ≥ ~3.5.
- Stress inversion downstream (out of scope v1).
- Note → [[06-focal-mechanisms]]

## Data inventory (current)
- [ ] BRAVOSEIS OBS — network `ZX` via EarthScope FDSN; deployment dates, channel list, response status
- [ ] Network `5M` — EarthScope FDSN; station list, time window
- [ ] Station `JUBA` (network `AI`) — channels, time window
- [ ] Station `R4DE2` (network `AM`) — channels, time window
- [ ] Manual picks (user-provided) — local + regional EQ picks for validation / fine-tuning
- [ ] Existing catalog — source (ISC/USGS/local), columns, completeness magnitude
- [ ] (Future) DAS pilot data — channel spacing, gauge length, sampling
- Note → `data/INVENTORY.md`

## Repo / pipeline layout (planned)
```
bransfield-eq/
  data/        # symlinks or manifests, not raw bytes
  notebooks/   # one per stage, mirrors docs
  src/         # importable pipeline code
  configs/     # YAML per stage
  catalogs/    # outputs: picks, events, locations, FMs
```

## Milestones
1. ~~Outline approved (this doc).~~ ✅
2. ~~Per-stage notes drafted with method candidates.~~ ✅ ([[01-ml-picking]] through [[06-focal-mechanisms]])
3. ~~Data inventory complete~~ ✅ (30 stations, ~435 GB, see [[01-ml-picking]]).
4. **Run waveform download on cluster** — ~1.1 TB free disk needed.
5. Run PhaseNet picking, validate against user's manual picks.
6. Stage 2 → 6 implementation against the BRAVOSEIS catalog.
7. Adapt for DAS + active-source once Wei's data arrives.

## Open decisions
- Which existing catalog to anchor to as ground truth.
- Manual-pick subset size for ML validation.
- Whether to deliver a Snakemake/Nextflow pipeline or notebook-driven for v1.

## Links
- Anchor: [[Bransfield Basin Earthquakes]]
- Meeting context: [[04-20-26 Notes]]
