
I will be working on several things on this project. But main work is all software engineering
[[04-01-26 Notes]]

We have a main list of things to complete on this project and those action items were discussed
[[04-02-26 Notes]]

Mika had shared the latest version of the code [[COSZO Data Collection — Code Walkthrough]]

We discussed the code on 04/03 and meeting notes are found in [[04-03-26 Notes]]

I created a seperate code in Testk folder to pull data in through OOI and convert and verify without the main repo. you can find those tests and notes from [[04-06-26 Notes]]

After testing that I could successfully run the OOI API, I have moved on to test the main repo and whether it runs and what issues i have run in to and how to mitigate it. You can find this work in [[04-07-26 Notes]]

SeisFix will be for timing error correction and some calibration application. This plan is discussed in [[SeisFix — Implementation Plan]]

On 04-08 I received VM access and started scoping data quality diagnostics with William. Those sessions are in [[04-08-26 Notes]], [[04-09-26 Notes]], [[04-10-26 Notes]], and [[04-11-26 Notes]] — the output is the `diagnose_timing.py` batch collector.

Work through [[04-14-26 Notes]] and [[04-16-26 Notes]] tightened the metrics schema and the summary-figure styling. A cleaner mathematical framing of the jitter problem is captured in [[timestamp variability assessment plan]] and first implemented in [[04-17-26 Notes]].

## Topics

- [[phase_1_plan]] — Phase 1 takeover plan for the OOI tidal pressure pipeline (local setup → VM → historical backfill)
- [[COSZO Data Collection — Code Walkthrough]] — architecture of `coszo-data-collection` (shell wrappers, waveform + metadata pipelines, state tracking)
- [[gap detection]] — adaptive gap-detection algorithm used inside the pipeline
- [[timestamp variability assessment plan]] — least-squares plan for separating sample interval, gaps, and jitter
- [[SeisFix — Implementation Plan]] — standalone Python package for timing-error correction (HYS14 target)
- [[non_tier1_ooi_instrument_data_notes]] — non-Tier 1 OOI channel/station inventory and FDSN code reference
