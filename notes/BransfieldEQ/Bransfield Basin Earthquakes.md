# Bransfield Basin Earthquakes

> **Cranium:** [[cranium_bransfield]] — concise big-picture state (status, goals, key questions, decisions, issues, recent activity, timeline). Read this first; refresh daily.

Anchor note for the Bransfield EQ project. End-to-end ML-assisted earthquake workflow tied to Dr. Shengji Wei's planned DAS + active-source experiment from Great Wall Station, King George Island, Antarctica.

## Workflow stages
1. [[01-ml-picking]] — SeisBench / PhaseNet (in progress)
2. [[02-discrimination]] — outline (multi-class: tectonic + icequake catalogs)
3. [[03-association]] — outline
4. [[04-location]] — outline
5. [[05-ml-polarity]] — outline
6. [[06-focal-mechanisms]] — outline

## Project doc
- [[PROJECT_PLAN]] — top-down plan, milestones, repo layout
- [[manual_picks]] — user-provided ground truth across stages

## Source meeting
- [[04-20-26 Notes]] — meeting with Dr. Shengji Wei (Chinese Academy of Sciences, Beijing)

## Daily notes
- [[05-08-26 Notes]] — project kickoff, Stage 1 pipeline coded, manual picks loaded; 22-OBS inventory + Dec 26 end-to-end test caught a missed +25 s event
- [[05-09-26 Notes]] — OBS-domain DeepDenoiser + PhaseNet fine-tuning plan (Phases 0–5); 30 curated training days, August 2019 held out
- [[05-11-26 Notes]] — Stage 1 picker pass complete (OBST 8.5 M + PhaseNet 3.7 M picks); velocity model rebuilt with sea-level datum + water layer; station geometry patched from Kidiwela+ Table S1
- [[05-12-26 Notes]] — pyocto daily-chunk parallel scheduler launched; Stage 4 GrowClust validated end-to-end on 30-day partial (5,037 events relocated, 530-event Orca cluster, sub-100 m relative precision); bathymetry upgrade

## Code
Methodology lives in this vault. Implementation lives at `~/Documents/bransfield-eq/` (see `PROJECT_PLAN` → "Repo / pipeline layout").

## Key context
- Testbed data: BRAVOSEIS OBS (`ZX`, 14 stations) + `5M` Bransfield-region (14) + `AI.JUBA` + `AM.R4DE2` Raspberry Shake.
- Window: 2019-01-01 → 2020-03-01 (BRAVOSEIS deployment).
- Forward target: Wei's DAS cable from Great Wall Station + active-source imaging across the rift zone, fore-arc, arc, back-arc, including Orca submarine volcano.
- Wei's planned airgun shot volume is much larger than BRAVOSEIS — discrimination of shots from tectonic events will matter (see Stage 2).
