# Gap Detection — coszo-data-collection

Source file: `bin/OOI_data_request_and_convert_mseed.py`
Updated: 2026-03-23 (Mika — made detection more robust)

---

## Why Gap Detection Is Non-Trivial

Real-world OOI time series are rarely perfectly evenly sampled. Clock jitter, ingestion delays, and partial request windows are all common. A naive fixed-Δt threshold produces many false positives. The pipeline instead uses a data-driven approach that estimates the actual sample period from the timestamps themselves.

**Nominal sample rates are never used for detection.** They are only consulted for alerting.

---

## High-Level Strategy

1. Ensure there is enough data to reason about timing
2. Estimate the actual sample period from the timestamps
3. Decide whether the window appears complete
4. Detect discontinuities using an adaptive threshold
5. Split the time series at detected gaps
6. Write each contiguous segment as a separate MiniSEED file

---

## Timing Jitter — What It Is and How It's Handled

**Clock jitter** is small random variation in the recorded timestamp of each sample relative to its true arrival time. For OOI instruments this comes from:
- Oscillator drift on the seafloor instrument
- Network ingestion delays between the instrument and the OOI data system
- Timestamp rounding during NetCDF serialisation

Jitter does not represent missing data — the sample is real, just slightly mis-timed. The pipeline handles jitter at four distinct points so it never triggers false gap detections or false alerts.

### 1. Filtering out non-physical intervals before estimation

```python
dt = dt_all[np.isfinite(dt_all) & (dt_all > 0.0)]
```

Any zero or negative Δt (which can result from timestamp anomalies or duplicated samples) is discarded before the sample period is estimated. These are not jitter — they are bad timestamps and should not influence the baseline.

### 2. Median instead of mean for sample period estimation

```python
sp = median(dt_clean)
```

The median is inherently resistant to outliers. A handful of jittered intervals — even large ones — do not pull the estimated `sp` away from the true sample period. A mean would be distorted by even a few bad values.

The 90th-percentile cutoff applied before the median provides a second layer:

```python
gap_cut = np.percentile(dt, 90.0)
dt_clean = dt[dt <= gap_cut]
```

This strips the upper tail (large genuine gaps) before the median is computed, so the baseline is anchored to the majority of well-timed samples.

### 3. Completeness tolerance absorbs jitter-induced count drift

```python
tol = max(5, int(0.001 * expected_npts))   # ±5 samples or 0.1%, whichever is larger
is_full = abs(npts - expected_npts) <= tol
```

Clock jitter can cause a few samples to fall just outside the request window boundary, making the count slightly low. The tolerance of ±5 samples (or 0.1% for large windows) absorbs this so a window with minor boundary effects is still classified as complete rather than triggering the stricter incomplete-mode thresholds.

For a 24-hour 1 Hz window (~86,400 samples), `tol = max(5, 86) = 86` — allows up to 86 samples of drift before the window is considered incomplete.

### 4. Higher gap threshold multiplier for complete windows

When `is_full = True`, a *larger* multiplier is applied to `sp`:

| Sensor | Incomplete multiplier | Complete multiplier |
|---|---|---|
| 15 s PREST (dep 1) | 3.0× → threshold 45 s | **4.0× → threshold 60 s** |
| 1 s PREST (dep 2) | 2.5× → threshold 2.5 s | **3.5× → threshold 3.5 s** |

The reasoning: if the sample count matches expectations, any sub-threshold interval is almost certainly jitter — applying a larger multiplier ensures those jittered intervals are never flagged as gaps. Only an interval large enough to represent a genuine dropout (instrument outage, transmission failure) exceeds the threshold.

### 5. Hybrid alert threshold absorbs jitter in sample period deviation checks

The sample-period deviation alert uses:

```python
thr = max(abs_floor, rel_frac × sp_nominal)
# defaults: abs_floor = 0.05 s (50 ms), rel_frac = 0.05 (5%)
```

The 50 ms absolute floor ensures that small but consistent clock drifts — well within normal jitter for deep-sea instruments — do not generate spurious alert emails. For a 15 s sensor, 5% relative gives 0.75 s tolerance before alerting. For a 1 s sensor, the 50 ms floor is the binding constraint.

Both parameters can be overridden per station in `run_prest.txt`:
```
sp_alert_abs_floor = 0.1    # raise floor to 100 ms if jitter is known to be larger
sp_alert_rel_frac  = 0.03   # tighten to 3% if tighter clock control is expected
```

---

## Step-by-Step

### Step 0 — Too few points check (`npts < 2`)

If fewer than 2 samples are returned, gap detection is impossible (cannot compute Δt).

**Causes:** instrument offline, ingestion delay, request window overlaps deployment boundary.

**Action:**
- Advances the endtime file to the requested end of the window (so the same empty interval is not re-requested)
- Logs `TOO_FEW_POINTS` to the gap file (if enabled)
- Sends a warning email to the operator
- Exits cleanly

---

### Step 1 — Convert to relative time

All timestamps are converted to seconds relative to the first sample:

```
t_sec[i] = seconds since t0
```

This simplifies all downstream arithmetic.

---

### Step 2 — Robust sample period estimation

```
dt_all = np.diff(t_sec)               # all consecutive intervals
dt     = dt_all[finite & positive]    # remove bad values
gap_cut = np.percentile(dt, 90.0)     # upper-tail cutoff
dt_clean = dt[dt <= gap_cut]          # remove large gaps from the estimate
sp = median(dt_clean)                 # robust sample period
sr = 1.0 / sp                         # sample rate
```

Using the **median of the lower 90th percentile** avoids large gaps inflating the estimated sample period. If trimming removes all values, the untrimmed set is used as a fallback.

---

### Step 2b — Sample period deviation alert (email)

After estimating `sp`, it is compared against the deployment's nominal period from the parameter files using a **hybrid threshold**:

```
thr = max(abs_floor, rel_frac × sp_nominal)
```

Defaults (overridable in `run_prest.txt`):
- `sp_alert_abs_floor = 0.05 s` (50 ms floor)
- `sp_alert_rel_frac  = 0.05`   (5% of nominal period)

If `|sp_calc − sp_nominal| ≥ thr`, an email is sent. This catches sensor or clock anomalies before they affect the archive.

---

### Step 3 — Completeness check

```
expected_npts = round(request_duration / sp) + 1
tol = max(5, int(0.001 × expected_npts))   # ±5 samples or 0.1%
is_full = |npts − expected_npts| ≤ tol
```

`is_full = True` means the window appears complete (only jitter expected).
`is_full = False` means data is clearly missing — the adaptive threshold is tightened.

---

### Step 4 — Adaptive gap threshold

The threshold is `multiplier × sp`. The multiplier depends on sample period and completeness:

| Sample period | Window complete | Window incomplete | Threshold (15 s sensor) | Threshold (1 s sensor) |
|---|---|---|---|---|
| ≥ 10 s (long-period) | 4.0× | 3.0× | 60 s | — |
| 0.5–10 s (mid-range) | 3.5× | 2.5× | — | 3.5 s |
| < 0.5 s (high-rate) | 2.5× | 2.0× | — | — |

**Rationale:**
- Long-period sensors (15 s PREST) have larger absolute timing jitter → higher multiplier avoids false positives
- 1 Hz sensors have tighter timing → lower multiplier stays sensitive to real dropouts
- Incomplete windows: multiplier reduced → more sensitive to gap boundaries
- Complete windows: multiplier raised → tolerant of jitter only

Breakpoints were chosen for PREST sensors and are empirical starting points. Can be adjusted after inspecting real gap reports.

---

### Step 5 — Gap identification and logging

```python
gap_idx = np.where(dt_all > gap_threshold)[0]
```

For each detected gap:
- Prints timestamps before and after the gap, Δt, and estimated missing samples
- If gap logging is enabled (`gap = 1` in `run_prest.txt`): appends a line to `log/gap_<station>_prest.txt`

Gap log format:
```
GAP: <utc_before> <utc_after> Δt=<seconds>s (threshold=<seconds>s, ~<N> missing)
```

Special case — incomplete but no gaps detected:
```
MISSING DATA: actual start=..., actual end=..., got N, expected ~M
```

---

### Step 6 — Segment splitting

The time series is split at every gap boundary into contiguous segments:

```python
split_idx = gap_idx + 1
data_split = np.split(timestamps, split_idx)
```

Each segment is then written independently as a MiniSEED file. Segment `i` spans from its first to last timestamp, so gap boundaries in the archive are explicit rather than filled with zeros or NaNs.

---

## Gap Logging

Controlled by the `gap` key in `run_prest.txt`:

```
gap = 1     # enable gap logging
```

Log file written to: `log/gap_<reference>_prest.txt`

Three event types logged:

| Type | Meaning |
|---|---|
| `GAP` | Interval exceeds adaptive threshold — real dropout detected |
| `MISSING DATA` | Window is incomplete but no single large gap found |
| `TOO_FEW_POINTS` | Fewer than 2 samples returned for the request window |

---

## Deployment End Warning

Separate from gap detection — while processing each channel, the pipeline checks whether the current request window is approaching the deployment's end date (`c_end` in the channel parameter file).

- Warning sent if within `deploy_warn_days` (default: 3 days) of `c_end`
- Separate email sent if `c_end` has already passed

---

## PREST Sensor Reference

| Station | Dep 1 | Dep 2 |
|---|---|---|
| RS01SLBS (Slope Base) | 15 s period (UDO/UK1) | 1 s period (LDO/LK1) |
| RS01SUM1 (Hydrate Ridge) | 15 s period (UDO/UK1) | 1 s period (LDO/LK1) |
| RS03AXBS (Axial Base) | 15 s period, 4 deployments | — |

Gap thresholds for dep 1 (15 s): 45–60 s
Gap thresholds for dep 2 (1 s): 2.5–3.5 s
