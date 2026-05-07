
We start with the project plan here [[PROJECT_PLAN]] — single-station cross-component (SC) dv/v across all PNSN/PNW stations, validated on a small pool first and then scaled.

The week of [[04-13-26 Notes]] was the Paros planning symposium (Day 01 talks across borehole / ocean / infrasound monitoring). [[04-14-26 Notes]] is Step 01 (Phase 1.1) — full station inventory across UW/UO/PB/CC/OO/NP/SB/UI/TA/CN/IU/US. [[04-15-26 Notes]] is Step 02 (Phase 1.2): currently active station subset via EarthScope FDSN, plus the availability scan that produces the matrix used downstream.

[[04-22-26 Notes]] is the inflection point. Marine suggested running a [[dvv_hyperparameter_sweep]] on a single station before scaling. [[Phase 1.3 Plan]] (a branch from Phase 1) was completed — the multi-station NoisePy run on Cascadia worked end-to-end, captured in [[Phase 1.3 Results]] — but the dv/v series quantized around ±0.06 % from the stretching grid, and the Z·E preprocessing recipe felt non-standard with non-overlapping correlation functions producing visible jumps. That triggered the move to a new methodology: [[Phase 2.0]], which adopts Tim Clements' California recipe (broadband whitening 0.5–19 Hz, 30-min CCs at 75 % overlap, refined stretching grid, MWCS as a second method, science band moved to 2–4 Hz).

[[04-28-26 Notes]] documents the internals of the Phase 1.3 / Phase 2 pipeline: how `stack_hourly_utc` buckets 30-min CCs into UTC hours, how stretching/MWCS are wired to the hourly tensor, where the QC mask comes from, and which knobs are worth turning. That review fed directly into [[04-29-26 Notes]] — Phase 2.1 with an adaptive coda window driven by the log-envelope of a 48-hour rolling phase-weighted stack. Per-station coda windows + dv/v stability ranked across the 29-station January 2020 pool live there.

## Topics

### Plan & methodology

- [[PROJECT_PLAN]] — full dv/v project plan (Phases 1–8) for PNW single-station and inter-station cross-correlation
- [[codex_comparison]] — reconciliation of Codex's active-station list against the Earthnote Phase 1.2 pipeline
- [[dvv_hyperparameter_sweep]] — plan + scripts for sweeping frequency band, coda window, and channel-pair averaging

### Phase 1.3 — pilot (1–3 Hz, Z·E)

- [[Phase 1.3 Plan]] — pre-execution design (29 stations, January 2020, SC Z·E, 1–3 Hz)
- [[Phase 1.3 Results]] — both pilot runs; Run 2 with hourly dv/v + per-day PSD; quantization ceiling discovery that motivated Phase 2

### Phase 2 — Clements-style 2–4 Hz pipeline

- [[Phase 2.0]] — current canonical pipeline (broadband whitening, 30-min/75 %-overlap, refined stretching, MWCS, pos/neg/both coda)

## Daily notes

- [[04-13-26 Notes]] — Paros planning symposium, Day 01 talks
- [[04-14-26 Notes]] — Step 01: station inventory and dv/v capability assessment (Phase 1.1)
- [[04-15-26 Notes]] — Step 02: currently active station subset via EarthScope FDSN + Step 02b availability scan
- [[04-22-26 Notes]] — Phase 1.3 → Phase 2.0 transition; meeting with Marine
- [[04-28-26 Notes]] — internals review of `stack_hourly_utc` and the hourly dv/v measurement path
- [[04-29-26 Notes]] — Phase 2.1: adaptive coda window from log-envelope of 48-h rolling PWS; 29-station January 2020 ranking
