---
tags: [proposal, funding, canada-impact-plus]
status: draft-v3
created: 2026-05-13
updated: 2026-05-13
---

# Canada Impact+ Research Training Awards — Proposal Draft v3

> **Reframe:** drop "nation-wide PNSN-style map." Canada doesn't have that density. Instead: build a **multi-hazard subsurface digital twin** of Canadian land, using dv/v as the core geophysical proxy, fused with precipitation, earthquake, soil moisture, GRACE, permafrost-borehole, and river-discharge data.
>
> **Priority area:** Environment, Climate Resilience, and the Arctic (primary) + Advanced Digital Technologies (cross-cut).
>
> **Data backbone:** FDSN networks **CN** (Canadian National Seismograph Network, NRCan, ~165 stations, multi-decade archives) + **QW** (Canadian National Earthquake Early Warning System, NRCan, 600+ new sensors deployed 2024–2025). Land stations only.
>
> **Project anchor:** [[Cascadia dv.v]] — Canadian extension of the Earthnote pipeline.

---

## What Canada actually has (geometry constraints)

- **CN — Canadian National Seismograph Network** (~165 stations, NRCan). Sparse on a national grid, but multi-decade continuous archives at individual sites; ideal for **single-station longitudinal dv/v** in the Arctic, Subarctic, and Prairies.
- **QW — Canadian National Earthquake Early Warning System** (NRCan). Two newly densified theatres:
  - **Southwest BC** (operational May 2024): ~400 sensors across the Lower Mainland, south Vancouver Island, and the Sea-to-Sky corridor. First time BC has had PNSN-like density.
  - **Ottawa River + St. Lawrence corridor** (operational autumn 2025): ~200 sensors deployed *along the rivers* from Ottawa–Gatineau through Montreal to Quebec City and Charlevoix.
- **Mount Meager volcano station** (CN, installing spring 2026) — Canada's first real-time volcano monitor. Garibaldi belt otherwise sparse since 1981 (Whistler short-period).

→ **Land stations only. CN + QW. No offshore.**

---

## 1. Summary of proposed research
*(1,800 char max — current ~1,790)*

The ground beneath Canada is not silent. Wind, rivers, traffic, and storms generate a continuous low-amplitude vibration that every seismometer records. By cross-correlating this background hum, we can measure relative seismic-velocity changes (dv/v) of less than 0.1 % — a sensitive, non-invasive measure of how the subsurface is changing in response to water, ice, stress, and temperature.

I propose to build a **Canadian Subsurface Digital Twin**: a continuous, multi-hazard model of the Canadian land surface and shallow crust, driven by dv/v from the Canadian National Seismograph Network (CN) and the Canadian National Earthquake Early Warning System (QW), and fused with precipitation, river discharge, GRACE terrestrial water storage, soil moisture, earthquake catalogues, and permafrost-borehole temperatures.

The pipeline I have already built and validated on the Pacific Northwest network — broadband whitening, hourly stretching with adaptive coda windows, MWCS as a second method — will be applied to three Canadian theatres:

1. **Southwest BC** (QW, 400 sensors since 2024): Cascadia slow slip, Garibaldi-belt volcanic unrest, Mount Meager debris-flow precursors, and Fraser/Squamish aquifer response to atmospheric rivers.
2. **Ottawa River–St. Lawrence corridor** (QW, 200 sensors since 2025): Charlevoix and Western Quebec seismicity, spring-freshet flooding, St. Lawrence Lowlands aquifer drawdown, and seasonal frost.
3. **Arctic and Subarctic** (CN, 15–25 yr archives): permafrost active-layer change, snowpack loading, and northern aquifer signals on a single-station longitudinal basis.

The output is a public, near-real-time dashboard linking dv/v anomalies to climate forcings, hazards, and water resources — the first integrated subsurface observatory of its kind in Canada.

---

## 2. Keywords *(up to 10)*

1. Ambient seismic noise
2. Relative velocity change (dv/v)
3. Subsurface digital twin
4. Permafrost monitoring
5. Cascadia slow slip
6. Hydrogeophysics
7. Drought and groundwater
8. Volcanic and debris-flow precursors
9. Multi-source data fusion
10. Canadian National Seismograph Network

---

## 3. Alignment with priority research areas
*(1,800 char max — current ~1,795)*

This research aligns directly with **Environment, Climate Resilience, and the Arctic**, and crosses into **Advanced Digital Technologies**.

**Climate resilience.** Canada's exposure to Cascadia megathrust earthquakes, Garibaldi volcanism, atmospheric-river flooding, debris flows, and prolonged drought demands continuous, integrated subsurface monitoring. dv/v is sensitive to all of these forcings simultaneously: stress accumulation before earthquakes, magma migration before eruptions, slope saturation before debris flow, and aquifer depletion during drought. Fusing dv/v with precipitation, river discharge, and earthquake catalogues turns Canada's existing CN and QW infrastructure — including the 600+ EEW sensors deployed in 2024–2025 — into a continuous multi-hazard observatory at no incremental sensor cost.

**Arctic.** Permafrost degradation is one of the largest unquantified climate feedbacks in the Canadian North. dv/v from ambient noise responds to seasonal active-layer freeze–thaw and decadal ground-ice loss, complementing the sparse and expensive borehole-temperature network. CN stations across Yukon, NWT, and Nunavut hold 15–25 year continuous archives that have never been processed for velocity change.

**Environment.** Recent literature (Zhang 2023, Lu 2025) confirms dv/v can monitor groundwater, soil moisture, and drought at regional scale — directly applicable to BC aquifers, the St. Lawrence Lowlands, and Prairie water resources. Volcano and debris-flow precursors at Mount Meager and the Garibaldi belt are a natural extension as Canada's first real volcano station comes online in 2026.

**Advanced Digital Technologies.** Building the digital twin requires a cloud-native pipeline ingesting terabytes of continuous CN + QW waveform data, ML-based quality control, automated anomaly detection on multi-year dv/v series, and inversion fusing dv/v with auxiliary geoscientific datasets — a concrete contribution to AI for Earth sciences.

---

## Auxiliary datasets in the digital twin

| Dataset | Source | Use |
|---|---|---|
| Precipitation grids | ECCC ANUSPLIN / CaPA | Drive recharge / loading models |
| River discharge | NRCan HYDAT | Flood / runoff response |
| Terrestrial water storage | NASA GRACE-FO | Long-wavelength groundwater anomaly |
| Soil moisture | NASA SMAP, ESA SMOS | Vadose-zone validation |
| Permafrost borehole temps | GTN-P | Validate Arctic dv/v interpretation |
| Earthquake catalogue | NRCan, ISC | Co/postseismic dv/v steps |
| Volcanic activity logs | Garibaldi VO (emerging) | Mount Meager / Garibaldi correlations |
| Snow water equivalent | ECCC SnowCast / Sentinel | Loading-induced dv/v |
| GNSS displacement | NRCan / WCDA | Slow-slip cross-validation |
| InSAR | Sentinel-1, RCM | Surface deformation co-interpretation |

---

## Open questions / refinement notes

- Confirm nominee stream: **doctoral student** vs **postdoctoral researcher**.
- Confirm Canadian nominator (PI) and host institution (UBC / UVic / U Calgary / Western / McGill / U Ottawa). Affects which theatre is "in-house."
- **Verify QW broadband fraction + continuous-archiving policy.** dv/v needs broadband (or at least usable low-frequency response) and continuous waveforms, not triggered windows. This is the single biggest feasibility check before submission.
- Lead emphasis in Summary: keep the three-theatre breakdown, or pick one flagship (Mount Meager debris-flow precursors is the most *novel + media-friendly*; Arctic permafrost is the most *priority-area-coded*; BC EEW is the most *infrastructure-leverage-coded*).
- Should the "digital twin" framing be in the title? Reviewers either love it or read it as buzzword.
- Is "debris flow" too niche for keyword #8, or actually a strong differentiator (Mount Meager 2010 is a famous Canadian case)?
- Add one prior-result line (e.g., "validated on 29 PNW stations, 7 producing genuinely usable hourly dv/v") to strengthen Summary credibility?
- Char counts to re-verify after each edit pass.
