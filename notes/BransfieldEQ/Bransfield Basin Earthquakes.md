# Bransfield Basin Earthquakes

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
- [[05-08-26 Notes]] — project kickoff, Stage 1 pipeline coded, manual picks loaded

## Code
Methodology lives in this vault. Implementation lives at `~/Documents/bransfield-eq/` (see `PROJECT_PLAN` → "Repo / pipeline layout").

## Key context
- Testbed data: BRAVOSEIS OBS (`ZX`, 14 stations) + `5M` Bransfield-region (14) + `AI.JUBA` + `AM.R4DE2` Raspberry Shake.
- Window: 2019-01-01 → 2020-03-01 (BRAVOSEIS deployment).
- Forward target: Wei's DAS cable from Great Wall Station + active-source imaging across the rift zone, fore-arc, arc, back-arc, including Orca submarine volcano.
- Wei's planned airgun shot volume is much larger than BRAVOSEIS — discrimination of shots from tectonic events will matter (see Stage 2).
