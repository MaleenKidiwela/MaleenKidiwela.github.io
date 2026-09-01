> **Cranium:** [[cranium_earthnote]] — concise big-picture state (status, goals, key questions, decisions, issues, recent activity, timeline). Read this first; refresh daily.

We start with the project plan here [[PROJECT_PLAN]] — single-station cross-component (SC) dv/v across all PNSN/PNW stations, validated on a small pool first and then scaled.

The week of [[04-13-26 Notes]] was the Paros planning symposium (Day 01 talks across borehole / ocean / infrasound monitoring). [[04-14-26 Notes]] is Step 01 (Phase 1.1) — full station inventory across UW/UO/PB/CC/OO/NP/SB/UI/TA/CN/IU/US. [[04-15-26 Notes]] is Step 02 (Phase 1.2): currently active station subset via EarthScope FDSN, plus the availability scan that produces the matrix used downstream.

[[04-22-26 Notes]] is the inflection point. Marine suggested running a [[dvv_hyperparameter_sweep]] on a single station before scaling. [[Phase 1.3 Plan]] (a branch from Phase 1) was completed — the multi-station NoisePy run on Cascadia worked end-to-end, captured in [[Phase 1.3 Results]] — but the dv/v series quantized around ±0.06 % from the stretching grid, and the Z·E preprocessing recipe felt non-standard with non-overlapping correlation functions producing visible jumps. That triggered the move to a new methodology: [[Phase 2.0]], which adopts Tim Clements' California recipe (broadband whitening 0.5–19 Hz, 30-min CCs at 75 % overlap, refined stretching grid, MWCS as a second method, science band moved to 2–4 Hz).

[[04-28-26 Notes]] documents the internals of the Phase 1.3 / Phase 2 pipeline: how `stack_hourly_utc` buckets 30-min CCs into UTC hours, how stretching/MWCS are wired to the hourly tensor, where the QC mask comes from, and which knobs are worth turning. That review fed directly into [[04-29-26 Notes]] — Phase 2.1 with an adaptive coda window driven by the log-envelope of a 48-hour rolling phase-weighted stack. Per-station coda windows + dv/v stability ranked across the 29-station January 2020 pool live there.

Phase 2.1 matured into **Phase 3.1** production ([[05-22-26 Notes]]): a band-agnostic Wiener denoise gate (effective K = 2.5 when |cc| ≤ 0.8), MAXLAG cut 60 → 30 s, vectorized stretching, launched across **110 broadband stations for full-year 2020**. The surprising finding is that **denoise is the dominant path at year scale** (95 % of stations), and an autoencoder-fingerprinting experiment on CC.SHRK revealed a clean seasonal cluster cycle.

A second dv/v track opened with **tremormetry** ([[05-29-26 Notes]]): a reusable per-station LFE-coda-wave-interferometry workflow (PNSN-catalog-driven discovery → GPU matched filter → daily stacks → coda dv/v), run on UW.HDW and UW.GNW, with per-era referencing to separate real velocity change from instrument-swap artifacts. The theory is worked out in two companion derivations — [[06-04-26 Notes]] gives the coda-wave sensitivity kernel for a deep repeating source (LFE) and a surface receiver, and [[06-05-26 Notes]] assembles many LFE-family/station pairs into a fault-plane δβ/β tomography.

That workflow was then hardened and scaled. [[06-12-26 Notes]] re-audits the envelope-peak discovery recipe and its blind spots, motivating a supervised **LFE fingerprint** in [[06-15-26 Notes]] — 23 hand-crafted spectral/envelope/polarization features (detailed in [[06-18-26 Notes]]) trained on the Lin (2023) catalog, separating LFEs from noise and from earthquakes/blasts at ~0.97 AUC, SNR-independent and autoencoder-confirmed. [[06-24-26 Notes]] scopes an LFE catalog + dashboard, and [[07-08-26 Notes]] / [[07-09-26 Notes]] converge on a refined nine-stage per-station pipeline (a three-lane NET/GPU/CPU conveyor) that scales across boreholes and validates the fingerprint cross-station against Lin (B926: 99 % of 530 families real). The program then culminates in a **4-D δβ/β inversion** on the plate interface: [[07-21-26 Notes]] frames it (12,703 families / 187 stations; checkerboard ~70–140 km, noise-limited), [[07-22-26 Notes]] and [[07-24-26 Notes]] refine the method (2-month smoothing, no shallow-cell exclusion), and [[08-19-26 Notes]] / [[08-20-26 Notes]] / [[08-21-26 Notes]] run the adversarial review — data-gap handling, per-pair reference offsets solved inside the space–time system (fixed-effects demean), a GPS-slip→strain→stress comparison track (Gualandi), and the full ~30 M-measurement × 6,354-day × 188-station solve. A separate adjacent thread, [[08-11-26 Notes]], is the Landslides **CSSI** NSF project (petascale SAR + EarthScope data hub, agentic workflows).

Two adjacent threads also live here. [[Earthnote/05-21-26 Notes]] scopes the **Pacific Northwest digital twin** (`earthnote-worldview`) after a meeting with Ryan Delaney about his Salish Sea Digital Cousin — a multi-agent Cesium globe + observability + geocompute build with a strict observed-vs-forecast contract. [[06-01-26 Notes]] designs the **Research Directions** feature for the notes app (a temporal concept-graph + link-prediction adaptation of Marwitz et al. 2026 for cross-project suggestions). And the [[Canada Impact+ Proposal]] reframes the Earthnote dv/v pipeline as a Canadian clean-tech application (geothermal / CCS / helium monitoring in the Williston Basin), anchored to this note.

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

### Tremormetry & LFE-coda dv/v

- [[05-29-26 Notes]] — reusable per-station LFE-coda dv/v workflow (discovery → GPU matched filter → daily stacks → coda dv/v), HDW + GNW
- [[06-04-26 Notes]] — coda-wave sensitivity kernel for a deep repeating source + surface receiver (forward/inverse theory)
- [[06-05-26 Notes]] — fault-plane δβ/β tomography from many LFE-family/station coda pairs

### Adjacent threads

- [[Canada Impact+ Proposal]] — Canadian clean-tech (geothermal / CCS / helium) extension of the dv/v pipeline
- [[Earthnote/05-21-26 Notes]] — Pacific Northwest digital twin (`earthnote-worldview`); meeting with Ryan Delaney
- [[06-01-26 Notes]] — notes-app "Research Directions" feature (concept-graph link prediction)

## Daily notes

- [[04-13-26 Notes]] — Paros planning symposium, Day 01 talks
- [[04-14-26 Notes]] — Step 01: station inventory and dv/v capability assessment (Phase 1.1)
- [[04-15-26 Notes]] — Step 02: currently active station subset via EarthScope FDSN + Step 02b availability scan
- [[04-22-26 Notes]] — Phase 1.3 → Phase 2.0 transition; meeting with Marine
- [[04-28-26 Notes]] — internals review of `stack_hourly_utc` and the hourly dv/v measurement path
- [[04-29-26 Notes]] — Phase 2.1: adaptive coda window from log-envelope of 48-h rolling PWS; 29-station January 2020 ranking
- [[Earthnote/05-21-26 Notes]] — PNW digital-twin scoping (earthnote-worldview); Salish Sea Digital Cousin meeting
- [[05-22-26 Notes]] — Phase 3.1 production launch (Wiener denoise gate, MAXLAG 30 s, 110 broadband stations); CC.SHRK autoencoder fingerprinting
- [[05-29-26 Notes]] — tremormetry: per-station LFE-coda dv/v workflow (HDW, GNW)
- [[06-01-26 Notes]] — Research Directions feature for the notes app (concept-graph link prediction)
- [[06-04-26 Notes]] — coda-wave sensitivity kernel (deep source / surface receiver) theory
- [[06-05-26 Notes]] — fault-plane δβ/β tomography from LFE-family/station coda pairs
- [[06-10-26 Notes]] — Paroscientific visit; meeting with Jerry Paros
- [[06-11-26 Notes]] — action list: abstract to coauthors (Zoe to review), website feedback with Deb, observatory follow-ups, GNSS-A processing thread
- [[06-12-26 Notes]] — tremormetry methodology re-audit; envelope-peak discovery recipe + critique
- [[06-15-26 Notes]] — LFE fingerprint (second discovery route): 23-feature classifier on the Lin (2023) catalog
- [[06-18-26 Notes]] — the LFE picker's 23 hand-crafted features (spectral / envelope / polarization)
- [[06-24-26 Notes]] — LFE catalog + dashboard scoping; unique-LFE association
- [[07-08-26 Notes]] — full per-station tremormetry pipeline (Stages 0–8)
- [[07-09-26 Notes]] — refined 9-stage pipeline (3-lane conveyor); B926 families validated vs Lin
- [[07-21-26 Notes]] — 4-D δβ/β inversion framed (12,703 families / 187 stations)
- [[07-22-26 Notes]] — inversion method clarifications (monthly stack, 2-month smoothing)
- [[07-24-26 Notes]] — early-coda sensitivity; stop excluding shallow (<30 km) cells
- [[08-11-26 Notes]] — Landslides CSSI NSF project meeting (adjacent)
- [[08-19-26 Notes]] — adversarial review of the 4-D inversion; GPS-slip→strain→stress track
- [[08-20-26 Notes]] — inversion diagnostics; per-pair offset solved inside the inversion
- [[08-21-26 Notes]] — plain-language 4-D inversion summary; ~30 M-measurement solve
