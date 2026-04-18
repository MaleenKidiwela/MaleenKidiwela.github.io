
This is the Phase 1 Plan — coszo-data-collection under [[Cascadia Offshore Subduction Zone Observatory]]
## Goal

Take over the OOI tidal pressure data pipeline from Mika and get it running locally, then resume operations on the COSZO VM.

---

## 1. Local Environment Setup

- [x] Install Miniconda on local machine
- [x] Clone `coszo-data-collection` repo
- [x] Create conda env from `bin/environment.yml`
- [x] Create OOI account and obtain API credentials (username + token)
- [x] Create `.ooi_env` file with credentials (not committed)
- [x] Test a data request locally (one station, one 24h window)
- [x] Verify MiniSEED output files are generated correctly
- [x] Adapt shell wrappers to run locally (VM paths kept as comments)
- [x] Run 24h historical chunk via main pipeline (`miniseed2dmc`)
- [x] Run 24h test via standalone `testk/pull_data.py` (seedlink-equivalent)
- [x] Run 24h real-time chunk via main pipeline (`seedlink`)

## 2. Access & Permissions

- [x] Confirm COSZO Drive access (granted during meeting)
- [ ] Get VPN access to COSZO VM (waiting on Ken)
- [ ] SSH into COSZO VM (140.142.14.93) and verify directory structure
- [x] Update email notification address in `run_data_collection.sh` to route alerts to Maleen
- [x] Verify push access to GitHub repo (working on `dev/maleen` branch)

## 3. Understand the Pipeline

- [x] Read through the [[COSZO Data Collection — Code Walkthrough|code walkthrough]]
- [ ] Review materials in COSZO Drive → "Non-Tier 1 Data Flow" folder
  - Channel code conventions
  - StationXML documentation
  - Metadata reference materials
- [ ] Understand the cron schedule (daily 18:00–18:29 window)
- [ ] Understand the Ring server startup sequence (Ring server → cron job, not reverse)
- [ ] Review `ring.conf` configuration

## 4. Verify Current Pipeline State

- [ ] Check `run/endtime_*.txt` files — where is each station's processing at?
- [ ] Check log files in `log/` for recent errors or gaps
- [ ] Confirm which deployments each station is on:
  - Slope Base (RS01SLBS): Dep 1 = 15s, Dep 2 = 1s
  - Southern Hydrate Ridge (RS01SUM1): Dep 1 = 15s, Dep 2 = 1s
  - Axial Base (RS03AXBS): 4 deployments, all 15s
- [ ] Check if historical data processing (miniseed2dmc) is still paused

## 5. Resume Operations on COSZO VM

- [ ] VPN in and SSH to COSZO VM
- [ ] Pull latest code from `dev/maleen` branch
- [ ] Verify conda env is set up on VM
- [ ] Start Ring server (`start_ring_server.sh`)
- [ ] Enable cron jobs for real-time (seedlink) processing
- [ ] Monitor first successful automated run
- [ ] Resume historical data backfill (miniseed2dmc) if ready

## 6. Documentation & Handoff

- [ ] Document any issues found during local testing
- [ ] Update README if procedures have changed
- [ ] Note any parameter file changes needed for current deployments

---

## Key Contacts

| Person | Role |
|--------|------|
| **Mika** | Current operator, available for collaboration |
| **Orist Kawka** | OOI contact for metadata/data behavior questions |
| **William** | Project supervisor |
| **Ken** | IT support for VPN (currently on vacation) |

## Constraints

- COSZO VM:** 20GB storage, 2GB RAM — cannot parallelize
- **Historical processing:** ~6 days per station at 2-min intervals
- **MiniSEED files** kept ~1 month on VM for verification, then deleted
- **Ring server must be started before cron job** or files get ignored as "old data"

## Timeline

| Task | When |
|------|------|
| Local env + first test run | This week |
| VPN access + VM login | When Ken returns |
| Resume real-time pipeline | After VM access |
| Resume historical backfill | After real-time confirmed working |

---

## Local Test Details (2026-04-06)

### What was built
Created `coszo-data-collection/testk/` with two standalone scripts:

- **`pull_data.py`** — pulls 24h of OOI tidal pressure data for RS01SLBS-MJ01A-06-PRESTA101 via the M2M API, polls async job, opens NetCDF via OPeNDAP, detects gaps, and writes MiniSEED to `testk/output/mseed/`
- **`verify_mseed.py`** — reads back the MiniSEED files, prints stats (sample count, start/end, min/max/mean), and saves a plot to `testk/output/verify_plot.png`

Both scripts reuse `bin/read_param.py` and `bin/convert_utc.py` from the main repo.

### Test result (2025-01-01, RS01SLBS)
- 86,400 data points pulled (~1 Hz, 24h)
- No gaps detected
- 2 MiniSEED files written: `OO.HYSB1.10.LDO` (absolute pressure) and `OO.HYSB1.10.LK1` (temperature)
- Pressure range: 29.58–29.61 MPa (expected at ~2900m depth)
- Temperature: stable ~1.9°C

### Bug identified in main pipeline
In `bin/OOI_data_request_and_convert_mseed.py`, for the **seedlink** path, channel list selection uses `dep = int(run["deployment"][0])` (= 1 from `run_prest.txt`), but the data is fetched from the most recent deployment (`deployment_id` from the API = 2 for RS01SLBS and RS01SUM1). Deployment 1 and 2 have different channel codes, sample rates, and sensor IDs:

| | Dep 1 (UDO/UK1) | Dep 2 (LDO/LK1) |
|---|---|---|
| Sample rate | 0.066667 Hz (15s) | 1.0 Hz (1s) |
| Active | Ended 2018-06-26 | Still active |

This mismatch would cause a KeyError when trying to read dep-1 channel variables from a dep-2 NetCDF. **Needs to be verified with Mika before fixing** — unclear whether `deployment_id` from the API always maps directly to the `channels_<N>` numbering in the param files.

---

## What Comes After Phase 1

- Extend pipeline to **current meter** data (new parameter files)
- Extend pipeline to **SCPR** data (daily script from PI NAS)
- Evaluate **vector current** data quality (identify bad data)
- Information about instruments are found in [[non_tier1_ooi_instrument_data_notes]]
- Consider requesting additional VM for other data types
