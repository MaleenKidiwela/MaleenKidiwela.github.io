---
tags: [bransfield, stage-6, focal-mechanisms]
status: outline
parent: "[[PROJECT_PLAN]]"
---

# Stage 6 — Focal Mechanisms

Solve for source mechanism per event using polarities from [[05-ml-polarity]] and (for larger events) full-waveform fits. The geodynamic question driving this is the rift-zone strain partitioning across Bransfield Basin — extensional vs. transtensional vs. strike-slip — so mechanism *quality* matters more than catalog size.

## Inputs

- Located events from [[04-location]] (with takeoff angles + azimuths from a velocity model).
- ML polarities from [[05-ml-polarity]].
- Full waveforms from Stage 1 for waveform-fit mechanisms.
- A regional 1D / 3D velocity model (same as Stage 4).

## Methods by magnitude

### Small events (M < ~3.5) — first-motion polarities
- **HASH** (Hardebeck & Shearer) — robust, gives quality grades, samples velocity-model + location-uncertainty space.
- Inputs: P polarities (U/D) + takeoff angle + azimuth per station.
- Quality control: minimum number of polarities (~8), minimum azimuthal gap, P/T axis stability across model perturbations.

### Larger events (M ≥ ~3.5) — full waveform
- **gCAP** (generalized Cut-And-Paste) — separately fits Pnl and surface waves, handles depth-dependent moment tensor.
- **ISOLA** — moment tensor inversion via Green's functions, GUI + scriptable.
- Frequency band: Bransfield events are shallow → 0.05–0.2 Hz typical, broaden if SNR allows.

> [!note] OBS waveform fitting
> Full-waveform inversion on OBS data needs accurate water-layer Green's functions. Same `water_depth_m` per station from `catalogs/station_geometry.csv` flows in here — keep that link visible.

## Outputs

- `catalogs/mechanisms.csv` — `event_id, strike1, dip1, rake1, strike2, dip2, rake2, p_axis_az, p_axis_dip, t_axis_az, t_axis_dip, method, quality, n_polarities, misfit`.
- `catalogs/mechanisms.json` — full FM solutions including auxiliary data (uncertainty cones, polarity tables) for plotting beachballs.

## QC

- Compare HASH polarity solution to gCAP waveform solution for the M ≥ 3.5 subset — disagreement flags either a bad location/velocity model or unmodeled complexity.
- Plot beachballs on a Bransfield basemap; cluster by sub-region (rift axis, fore-arc, Orca volcano vicinity).

## Open decisions

- [ ] Magnitude threshold to switch from HASH to gCAP — depends on station coverage and noise floor.
- [ ] Use 1D Green's functions throughout, or compute 3D for top events?
- [ ] Stress inversion (e.g., MSATSI) downstream — out of scope v1, but FM table schema should support it.

## Run-log

- **2026-05-08** — Outline only.
