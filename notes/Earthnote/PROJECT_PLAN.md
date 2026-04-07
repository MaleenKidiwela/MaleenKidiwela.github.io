## Earthnote: Large-Scale PNW dv/v Project Plan

## Context
Building a large-scale seismic velocity change (dv/v) monitoring system covering ALL PNSN and PNW seismic stations. We start with **single-station cross-component (SC) dv/v** — auto-correlations and cross-component correlations (EN, EZ, NZ) at individual stations — before scaling to inter-station pairs. This approach lets us validate the pipeline on a simpler problem first and identify which stations produce reliable measurements.

NoisePy (installed at `/home/seismic/NoisePy/`) provides the full pipeline: download → cross-correlate → stack → dv/v measurement. PNW data is available locally via PNWstore at `/1-fnp/pnwstore1/`.

---

## Phase 1: Station Inventory & Quality Assessment

**Goal:** Build a catalog of all PNSN/PNW stations and assess which are suitable for SC dv/v.

### 1.1 Pull Full Station Inventory
- Query all networks in PNWstore: UW, UO, PB, CC, OO, NP, SB, UI, TA, CN, IU, US
- For each station, collect: location, operating dates, channels (BH/HH/EH), sampling rate, instrument type
- Sources:
  - Local StationXML: `/1-fnp/pnwstore1/p-wd11/PNWStationXML/{NETWORK}/`
  - FDSN via `obspy.clients.fdsn.Client("IRIS")` for gap-filling
- Output: station inventory DataFrame with metadata

### 1.2 Data Availability Scan
- For each station, check continuous data availability using PNWstore SQLite indexes (`/1-fnp/pnwstore1/p-wd00/PNW{YEAR}/timeseries.sqlite`)
- Flag stations with:
  - Minimum 1 year continuous 3-component data
  - Sampling rate >= 20 Hz (for the frequency bands we care about: 0.1–2 Hz)
  - Minimal gaps (>90% uptime)
- Output: availability matrix (station x time)

### 1.3 Station Quality Screening (Pilot Run)
- Select ~20 diverse stations across the PNW (mix of broadband/short-period, different geological settings)
- Run a short pilot (e.g., 1 month of data) to check:
  - Noise floor / spectral characteristics (PPSD)
  - Cross-component coherence (EN, EZ, NZ)
  - Stability of Green's function recovery
- Score stations by SC cross-correlation SNR
- Output: ranked station list with quality metrics

---

## Phase 2: Single-Station Cross-Component dv/v Pipeline

**Goal:** Compute SC dv/v for all qualifying stations.

### 2.1 Data Access Setup
- Install/configure `pnwstore` package from `/home/seismic/pnwstore/`
- OR use NoisePy's `PNWDataStore` which wraps PNWstore:
  ```python
  from noisepy.seis.io.pnwstore import PNWDataStore
  raw_store = PNWDataStore(DATA_PATH, DB_PATH, catalog, channel_filter, date_range)
  ```
- Key paths:
  - Data: `/1-fnp/pnwstore1/p-wd00/PNW{YEAR}/{NETWORK}/`
  - DB: `/1-fnp/pnwstore1/p-wd00/PNW{YEAR}/timeseries.sqlite`
  - StationXML: `/1-fnp/pnwstore1/p-wd11/PNWStationXML/`

### 2.2 Cross-Correlation Configuration
- NoisePy `ConfigParameters` tuned for SC dv/v:
  ```
  acorr_only: False
  xcorr_only: False       # We want both auto and cross-component
  ncomp: 3                # 3-component (E, N, Z)
  cc_len: 3600            # 1-hour windows
  step: 1800              # 50% overlap
  freqmin: 0.1
  freqmax: 2.0
  freq_norm: rma          # spectral whitening
  time_norm: one_bit      # or rma
  cc_method: xcorr
  maxlag: 200             # seconds
  substack: True
  substack_windows: 1     # keep all individual CCs
  rm_resp: inv            # remove instrument response via StationXML
  ```
- For SC: process each station independently — correlate components E-N, E-Z, N-Z, plus auto-correlations E-E, N-N, Z-Z

### 2.3 Stacking Strategy
- **Daily stacks**: linear stack of all hourly CCs within each day
- **Reference stack**: linear stack over a stable baseline period (e.g., first year, or a known quiet period)
- **Moving window stacks**: 10-day or 30-day windows with 1-day step for smoothed monitoring
- Use NoisePy's `stack_cross_correlations()` with linear stacking initially

### 2.4 dv/v Measurement
- Use NoisePy monitoring module (`/home/seismic/NoisePy/src/noisepy/monitoring/`)
- Primary method: **stretching** (robust, well-tested)
  ```python
  from noisepy.monitoring.monitoring_methods import stretching
  dv, error, cc, cdp = stretching(ref, cur, dv_range=0.03, nbtrial=100, para=para)
  ```
- Secondary: **MWCS** for comparison / validation
- `ConfigParameters_monitoring`:
  ```
  freq: [0.1, 0.5, 1.0, 2.0]   # multiple frequency bands
  epsilon: 0.03                   # +/- 3% dv/v range
  nbtrial: 100
  coda_tbeg: 5.0                  # coda window start (seconds after zero lag)
  coda_tend: 60.0                 # coda window end
  do_stretch: True
  ```
- Measure dv/v for each component pair (EN, EZ, NZ, EE, NN, ZZ) independently
- Output: daily dv/v timeseries per station per component pair

---

## Phase 3: Scaling to Full PNW Network

**Goal:** Run the SC pipeline on all qualifying stations across the full time range.

### 3.1 Compute Strategy
- Use NoisePy's MPI scheduler for parallelization:
  ```python
  from noisepy.seis.scheduler import MPIScheduler
  scheduler = MPIScheduler()
  ```
- Process stations in parallel (each station is independent for SC)
- Storage: ASDF format via `ASDFCCStore` / `ASDFStackStore`
- Chunk by year to manage memory and allow incremental processing

### 3.2 Time Range
- Start with 2009–2023 (where PNWstore has good coverage)
- Extend to full archive (1987+) for long-running stations

### 3.3 Output Structure
```
Earthnote/
  data/
    inventory/          # Station catalogs, quality reports
    cc/                 # Cross-correlation ASDF files (by station)
    stacks/             # Stacked CCs (by station)
    dvv/                # dv/v timeseries (by station, component, freq band)
  notebooks/
    01_station_inventory.ipynb
    02_quality_screening.ipynb
    03_sc_crosscorrelation.ipynb
    04_sc_stacking.ipynb
    05_sc_dvv_measurement.ipynb
    06_sc_dvv_analysis.ipynb
  src/                  # Reusable scripts/modules
  config/               # YAML config files for NoisePy runs
```

---

## Phase 4: Analysis & Visualization

### 4.1 dv/v Timeseries Analysis
- Plot dv/v vs. time for all stations, all component pairs
- Compare component pairs at same station (consistency check)
- Correlate with known events: Cascadia slow slip, large EQs, seasonal loading
- Map spatial patterns of velocity changes

### 4.2 Quality Control
- Flag measurements with low CC coefficient (< 0.5)
- Identify stations with anomalous or noisy dv/v
- Compare stretching vs MWCS results

---

## Immediate Next Steps (What to build first)

1. **Notebook 01**: Station inventory — pull all PNSN stations, check data availability
2. **Notebook 02**: Quality screening — pilot SC cross-correlation on ~20 stations for 1 month
3. **Notebook 03**: Full SC pipeline on best stations for 1 year as proof of concept

---

---

## Phase 5: Inter-Station Cross-Correlation dv/v (Future)

**Goal:** Expand from single-station to station-pair dv/v across the full PNW network.

### 5.1 Station Pair Selection
- Use station inventory from Phase 1
- Compute all pairs within max inter-station distance (e.g., 200 km for 0.1–1 Hz)
- Prioritize pairs along known tectonic structures (Cascadia subduction interface, volcanic arcs)
- Estimate: ~500 stations → ~125,000 pairs (will need filtering)

### 5.2 Inter-Station CC Processing
- Same NoisePy pipeline but with `xcorr_only: True`
- Component pairs: ZZ (primary), plus RR, TT after rotation
- Enable rotation in config: `ncomp: 3`, rotation E-N-Z → R-T-Z
- Much larger compute requirement — MPI parallelization essential
- Storage consideration: Zarr format for cloud-friendly chunked access

### 5.3 Inter-Station dv/v
- Reference traces per station pair (long-term stack)
- Daily/weekly dv/v measurements using stretching + MWCS
- Multiple frequency bands to probe different depth sensitivities
- Sensitivity kernels: low freq (0.1–0.5 Hz) → deeper structure, high freq (0.5–2 Hz) → shallow

---

## Phase 6: Spatial dv/v Mapping & Tomography (Future)

### 6.1 Spatial Interpolation
- Grid dv/v measurements onto regular spatial grid
- Methods: Voronoi tessellation, kriging, or weighted interpolation
- Time-lapse maps of velocity changes across PNW

### 6.2 dv/v Tomography (Advanced)
- Invert station-pair dv/v measurements for spatially resolved velocity change maps
- Use sensitivity kernels (surface wave, coda wave) for depth resolution
- Tools: custom inversion code or existing packages (e.g., SeisMIC, MSNoise inversion modules)

### 6.3 Depth Resolution
- Multi-frequency dv/v → depth-dependent velocity changes
- Surface waves: frequency ↔ depth sensitivity
- Coda waves: more diffuse sensitivity, averaging over depth

---

## Phase 7: Science Targets & Correlation Studies (Future)

### 7.1 Cascadia Subduction Zone
- Slow slip events (ETS): expect dv/v drops during tremor episodes
- Locking/coupling variations along strike
- Seasonal loading from hydrological cycle

### 7.2 Cascade Volcanic Arc
- Monitor Mt. Rainier, Mt. St. Helens, Mt. Hood, Mt. Baker
- Detect magmatic intrusions via dv/v anomalies
- Complement with single-station SC dv/v directly on volcano stations

### 7.3 Tectonic & Environmental Signals
- Co-seismic velocity drops from major earthquakes
- Post-seismic healing/recovery timescales
- Thermoelastic strain (annual cycle)
- Groundwater level changes
- Precipitation / snow loading effects

### 7.4 Machine Learning Applications
- Anomaly detection on dv/v timeseries
- Automated classification of signal sources (tectonic, volcanic, environmental)
- Forecasting / pattern recognition for slow slip

---

## Phase 8: Production Pipeline & Monitoring Dashboard (Future)

### 8.1 Automated Pipeline
- Scheduled daily/weekly processing of new data
- Incremental CC computation (only new time windows)
- Automated QC with alerting for anomalous dv/v

### 8.2 Visualization Dashboard
- Interactive web map of PNW stations with dv/v timeseries
- Spatial dv/v maps with time slider
- Comparison with seismicity catalogs, geodetic data (GPS)
- Tools: Dash/Plotly, Panel, or custom web app

### 8.3 Data Products
- Public dv/v timeseries database for PNW
- API for accessing processed CC and dv/v data
- Integration with PNSN real-time monitoring systems

---

## Key Files & Functions Reference

| Step | NoisePy Function | Location |
|------|-----------------|----------|
| Data access | `PNWDataStore` | `noisepy.seis.io.pnwstore` |
| Cross-correlate | `cross_correlate()` | `noisepy.seis.correlate` |
| Stack | `stack_cross_correlations()` | `noisepy.seis.stack` |
| Stretching dv/v | `stretching()` | `noisepy.monitoring.monitoring_methods` |
| MWCS dv/v | `mwcs_dvv()` | `noisepy.monitoring.monitoring_methods` |
| Config | `ConfigParameters` | `noisepy.seis.io.datatypes` |
| Monitoring config | `ConfigParameters_monitoring` | `noisepy.monitoring.monitoring_utils` |
| MPI parallel | `MPIScheduler` | `noisepy.seis.scheduler` |
