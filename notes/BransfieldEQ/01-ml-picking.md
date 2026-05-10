---
tags: [bransfield, stage-1, picking, phasenet, seisbench]
status: in-progress
parent: "[[PROJECT_PLAN]]"
---

# Stage 1 — ML Earthquake Picking

PhaseNet via SeisBench, run on continuous waveforms downloaded from EarthScope, GEOFON, and Raspberry Shake FDSN. Code lives in `~/Documents/bransfield-eq/`.

## Targets (locked)

| Network | Stations | Data center | Notes |
|---|---|---|---|
| `ZX` | 14 (`BRA13`–`BRA27`) | EarthScope | BRAVOSEIS OBS, low-gain `?L?` |
| `ZX` | 8 (`BRA02–05, 08–11`) | GEOFON (`GFZ`) | BRAVOSEIS OBS, high-gain BB `HH?` @ 100 Hz |
| `5M` | 14 (Bransfield bbox) | GEOFON (`GFZ`) | reused temp code — bbox filter |
| `AI.JUBA` | 1 | EarthScope | Antarctic permanent |
| `AM.R4DE2` | 1 | Raspberry Shake | bbox filter (epochs reused) |

> [!warning] BRAVOSEIS OBS split across two data centers — and two instrument types
> EarthScope (BRA13-27) hosts low-gain seismometers with mixed sample rates (200 Hz Z, 100 Hz horizontals, 200 Hz hydrophone).
> GEOFON (BRA02-11) hosts high-gain broadband at uniform 100 Hz (`HHZ/HH1/HH2`).
> Picker handles both — resamples to 100 Hz before PhaseNet — but discrimination/location may need to treat them separately for noise floor reasons.

**Window:** `2019-01-01` → `2020-03-01` (BRAVOSEIS deployment + a 2-month tail).

**Bbox** (Bransfield): lat -65 to -60, lon -65 to -54.

## Channel codes — important

The BRAVOSEIS OBS uses **low-gain** seismometer code, not high-gain. Initial channel filter `EH?,HH?,BH?,SH?` returned zero for ZX. Actual ZX seismic channels:

- `ELZ` @ 200 Hz — short-period low-gain vertical
- `SL1`, `SL2` @ 100 Hz — short-period low-gain horizontals
- `EDH` @ 200 Hz — hydrophone (skipped for picking)

Final channel glob (covers all our targets):

```
EH?,HH?,BH?,SH?,EL?,HL?,BL?,SL?
```

> [!warning] Sample-rate mismatch on ZX
> Vertical is 200 Hz, horizontals are 100 Hz on the same station. PhaseNet expects 3C aligned at one sample rate (default 100 Hz). Plan: downsample Z to 100 Hz at picking time (SeisBench does this if you set `sampling_rate=100`), but verify on a single trace first.

## Disk-space budget — how it was derived

Estimate uses *actual operational overlap* of each channel-epoch with the window, multiplied by the channel's sample rate, then divided by a Steim2 compression ratio of 3.5.

```
bytes_in_window = sample_rate_hz * 4 * overlap_seconds / 3.5
```

Initial naïve estimate (every channel-epoch × full year) gave ~2 TB and was wrong because:
1. ZX `BRA*` filter was needed — the unfiltered ZX network spans 2003-2022 and includes a New Zealand deployment in 2021/2022.
2. Channel-epochs are short snippets (response changes), not deployment-long.
3. `5M` includes European stations under the same temp code.
4. Channel filter excludes SOH (`ACE`, `LCE`, `LCQ`, ...) and hydrophone.

**Final estimate (seismic 3C + hydrophone, BRAVOSEIS window, all filters applied):**

| Net | Stations | GB |
|---|---|---|
| ZX (EarthScope, 14 stations + GEOFON, 8 stations) | 22 | 460 (incl. hydrophone on EarthScope subset) |
| 5M | 14 | 85 |
| AI | 1 | 15 |
| AM (R4DE2) | 1 | 0.1 (only 5 days of true Bransfield data) |
| **Total** | **38** | **~560 GB** |

**Budget ~1.4 TB free disk** (2.5× for raw + working copies + pick CSVs). Laptop can't host this — running on a cluster with a scratch volume.

## Data-center routing

| Network | Client |
|---|---|
| ZX, AI | `Client("EARTHSCOPE")` |
| 5M | `Client("GFZ")` (GEOFON) |
| AM | `Client("https://data.raspberryshake.org")` |

EarthScope token / authentication: assumed pre-configured on the run machine. Not yet tested for embargo on ZX — if download fails for `ZX`, that's the first thing to check.

## Pipeline layout

```
bransfield-eq/
├── configs/targets.yaml          # single source of truth
├── src/bransfield_eq/
│   ├── config.py                 # paths, daterange, get_client
│   └── stations.py               # resolve targets → station list
├── scripts/
│   ├── 01_data_inventory.py      # metadata + size estimate (DONE)
│   ├── 02_download_waveforms.py  # day-by-day MSEED, idempotent, shardable
│   └── 03_run_phasenet.py        # SeisBench PhaseNet → pick CSV  (next)
├── data/
│   ├── stationxml/               # per-network XML
│   └── waveforms/<NET>/<STA>/<NET>.<STA>.<YYYY>.<JJJ>.mseed
└── catalogs/
    ├── station_inventory.csv
    └── picks/<NET>.<STA>/<YYYY>-<JJJ>.csv
```

## Download strategy

`scripts/02_download_waveforms.py`:

- One MSEED file per (station, day). Idempotent — file existence = "done".
- Empty days written as 0-byte sentinel so 204 responses aren't retried forever.
- `--shard I --of N` partitions the (station × day) Cartesian product across N workers — drop into a SLURM array job.
- Per-channel bulk request expands the channel glob server-side.
- 3 retries with 10 s backoff for transient FDSN failures.

## Picking strategy (next to write)

`scripts/03_run_phasenet.py`:

- SeisBench `PhaseNet` with pretrained weights (start with `stead`; cross-check with `instance` and `ethz`).
- Per station-day file: read → merge gaps → resample to 100 Hz → `model.classify(stream)` → write picks CSV.
- Parameters to tune: `P_threshold`, `S_threshold` (defaults 0.3 / 0.3), `blinding`, `overlap`.
- Outputs: `time, station, network, phase, prob, model_weights`.

## Open questions / TODO

- [ ] Confirm EarthScope auth status on the run machine (especially for `ZX`).
- [ ] Validate ZX 200/100 Hz mixed-rate handling on a single station before full pick run.
- [x] ~~User-provided manual picks~~ — received, loaded into [[manual_picks]]; 46k unique picks across ~7k events.
- [x] ~~Decide on PhaseNet weights~~ — **`instance` @ thresh 0.2 locked**, validated 5× recall improvement over `stead` on 2019-12-26 OBS data (see test below).
- [ ] Should we keep hydrophone (`EDH`) for discrimination later? (Stage 2 concern, but gate the decision now to avoid re-downloading.)

## End-to-end test on 2019-12-26 — weights validation

Ran download + PhaseNet on one day to validate the stack and tune parameters before committing to the full cluster run.

| Setting | ML picks | Stations w/picks | P recall | S recall | P prec (event-window) | S prec (event-window) |
|---|---|---|---|---|---|---|
| `stead` @ 0.3 | 2,068 | 32 | 9% | 17% | 33% | 33% |
| **`instance` @ 0.2** | 3,307 | 35 | **45%** | **42%** | **38%** | **63%** |

`instance` weights (trained on European OBS data) outperform `stead` (land-only) substantially on Bransfield OBS. Both recall and precision improved — domain match is the right lever, not threshold-tuning alone. **Defaults locked** in `03_run_phasenet.py` and `slurm/pick.sbatch`.

Resource usage (35 station-days, CPU on M-series Mac):
- Download: 1.66 GB MSEED.
- Picking: **17 min wall, peak 3.1 GB RAM**.
- Full-year extrapolation: ~135 h sequential / ~17 h with 8-way SLURM array / ~2 h with GPU.

### PhaseNet caught a second event at +24 s — validation win

> [!note] Not necessarily an "aftershock"
> Earlier framing called this an aftershock; without magnitudes or locations that's overclaiming. More likely **swarm pair** for Bransfield's rift+volcanic context. Pin down via Stage 4 magnitudes + locations + waveform CC.

A 4-station cluster fired at **23:51:34–36** (~25 s after the 23:51:10 manual event 2 on Dec 26):

| Station | P | S | S-P |
|---|---|---|---|
| BRA19 | 23:51:34.74 | 23:51:35.33 | 0.59 s |
| BRA21 | 23:51:35.03 | — | — |
| BRA22 | 23:51:35.27 | 23:51:36.11 | 0.84 s |
| BRA20 | 23:51:35.96 | 23:51:36.02 | 0.06 s ⚠ spurious S |

S-P times of 0.6–0.8 s on BRA19/BRA22 are consistent with a local source ~5 km away — same order as event 2's BRA20 S-P of 0.98 s. **Two separate events**, close in time and space; not coda of event 2 (24 s gap is far too long for a local source).

**Significance:**
- Genuine event the manual analyst either missed or merged with event 2 — demonstrates the value of running PhaseNet over the full record, not just QA against a manual catalog.
- 4 stations × right at PyOcto's typical association minimum → would be picked up downstream as a distinct event. Won't be lost.
- **`instance` weights are *less* confident than `stead` was on this borderline event** (BRA19 P prob 0.97 → 0.34). For marginal events, an ensemble of `stead + instance` may add real signal. Revisit if Stage 2 / Stage 3 see many borderline events.

## Run-log

- **2026-05-08** — Initial inventory pulled. ZX/5M findings above.
- **2026-05-08** — Wrote download (`02_download_waveforms.py`) and picking (`03_run_phasenet.py`) scripts. Both are shardable via `--shard I --of N` for SLURM job arrays. Idempotent: skip-if-exists at file granularity (MSEED for downloads, CSV for picks). Configuration consolidated in `configs/targets.yaml` so window/channels/targets aren't duplicated across scripts. SLURM templates added under `scripts/slurm/`.
- Pick CSV schema: `time, trace_id, phase, prob, start, end`. Probabilities preserved per-pick so threshold tuning can be redone without re-running the model.
- Resampling decision: pick at 100 Hz (PhaseNet default). 200 Hz channels (ZX `ELZ`, `EDH`) are downsampled in the picker via `tr.resample(100)`. This avoids the 200/100 Hz cross-component mismatch on ZX OBS but means we lose high-frequency content on the vertical — flag this if local micro-events are missed.
- Empty-day handling: 0-byte sentinel MSEED prevents repeated 204 retries on permanently-empty days (early/late deployment edges). The picker's `>0 bytes` check skips them naturally.
- **Hydrophone added to download (not picking).** `configs/targets.yaml` now has two channel lists: `channels` (download = seismic + `?DH` hydrophone, ~70 GB extra for ZX) and `picking_channels` (PhaseNet input = seismic only). The picking script filters out hydrophone traces before model inference.
- **Station geometry extracted** with `scripts/04_station_geometry.py` → `catalogs/station_geometry.csv`. BRAVOSEIS OBS sit at 1019–1495 m water depth; StationXML `elevation` is reliably negative for OBS, so we have water depth without GEBCO. Land stations have elevation ≥ 0.
- **AM.R4DE2 epoch trap (resolved)** — `R4DE2` is a single Raspberry Shake station code that has been physically relocated multiple times. Within our 2019-01 → 2020-03 window it has three epochs: Uruguay (2019-08 to 2020-01-20), Bransfield (2020-01-20 to 2020-01-23, ~3 days at -62.18°/-58.89°), Uruguay again (2020-01-23 to 2020-02-18), Bransfield again (2020-02-18 to 2020-02-20, ~2 days). Solution: enabled `bbox_filter: true` for AM in `targets.yaml`. The Raspberry Shake FDSN server filters by channel-epoch coordinates, so only the ~5 days of Bransfield data are returned (~0.1 GB). After 2020-08 R4DE2 has been continuously in Bransfield through 2025; **if we ever extend the window past Mar 2020 we get years of permanent Raspberry Shake data**.
- **Refactored** `01_data_inventory.py` to read from `configs/targets.yaml` so window/channels/bbox aren't duplicated across scripts. `04_station_geometry.py` reads StationXML written by `01_*` and adds `water_depth_m` for OBS.
