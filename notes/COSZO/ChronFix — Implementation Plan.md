
A pip-installable Python package for detecting and correcting timing errors in seismic data, with a roadmap toward broader data quality control. Distinct from the gap/jitter diagnostics in [[gap detection]] and [[timestamp variability assessment plan]] — those live inside `coszo-data-collection`; ChronFix is standalone.

## Background & Context

Seismic instruments — especially ocean-bottom seismometers and temporary deployments — commonly accumulate timing errors (clock drift, jumps, offsets) because they lose GPS synchronization. chronfix is a **standalone, general-purpose Python package** that anyone can install and use to detect and fix these issues.

- **ObsPy-style API** — importable functions, works with `Stream`/`Trace` objects
- **Works with any seismic data** — MiniSEED, SAC, or anything ObsPy can read
- **Handles clock jumps by setting boundaries** — not by averaging data across the jump
- **Built from scratch** — no dependencies on any specific data pipeline

> [!tip]
> **Near-term use case:** Fixing the HYS14 timing error (target: before May 18th SAC meeting)

---

## Decisions Needed

> [!important]
> **About HYS14:** What exactly is the timing error on HYS14?
> - Is it a known constant offset? (e.g., "station is 0.3s off")
> - Is it a clock jump at a specific time? (e.g., "clock jumped 2s at 2024-06-15T00:00:00")
> - Is it a drift that accumulated over a deployment?
> - Do you have documentation or logs describing the issue?

> [!important]
> **Clock jumps vs. drift:** Your notes mention handling "timing jumps" by setting boundaries. Should the package:
> 1. **Detect** where jumps occur automatically, or will you provide known jump times?
> 2. **Split** traces at jump boundaries (creating separate segments), or **shift** the data after the jump?

> [!important]
> **Input flexibility:** Should `chronfix` accept:
> - (a) Only ObsPy `Stream`/`Trace` objects (users call `obspy.read()` themselves), or
> - (b) Also accept file paths and read MiniSEED internally?

---

## Proposed Project Structure

```
chronfix/
├── pyproject.toml              # Build config, dependencies, metadata
├── README.md                   # Installation & usage docs
├── LICENSE
├── .gitignore
│
├── src/
│   └── Chronfix/                # The importable package
│       ├── __init__.py         # Public API exports
│       ├── io.py               # Data loading helpers (ObsPy wrappers)
│       ├── timing/
│       │   ├── __init__.py
│       │   ├── detect.py       # Timing error detection algorithms
│       │   └── correct.py      # Timing correction algorithms
│       ├── gaps/               # Phase 2 — future
│       │   ├── __init__.py
│       │   ├── detect.py
│       │   └── fill.py
│       └── utils.py            # Shared helpers (logging, validation)
│
├── tests/
│   ├── conftest.py             # Shared fixtures (synthetic traces)
│   ├── test_io.py
│   ├── test_timing_detect.py
│   └── test_timing_correct.py
│
├── examples/
│   └── basic_timing_fix.py     # Example script
│
└── docs/
    └── usage.md
```

### Design decisions
- **`src/` layout** — prevents accidental imports of uninstalled code
- **`timing/` subpackage** — separates detection from correction
- **`gaps/` placeholder** — ready for Phase 2

---

## Module Details

### `src/Chronfix/io.py` — Data Loading

```python
from Chronfix import read_data

# Read from file
st = read_data("path/to/data.mseed")

# Or pass an existing ObsPy Stream
st = read_data(existing_stream)
```

- Wraps `obspy.read()` with input validation
- Checks for empty streams, missing stats, sample rate consistency
- Auto-detects format (MiniSEED, SAC, etc.)

### `src/chronfix/timing/detect.py` — Detection

| Function | Description |
|---|---|
| `detect_time_jumps(stream, threshold)` | Finds sudden clock jumps within a trace by analyzing sample intervals |
| `detect_sample_rate_anomalies(stream)` | Flags where actual sample intervals diverge from stated rate |
| `detect_clock_drift(stream, reference_stream)` | Cross-correlation-based drift estimation against a reference |

Returns structured results with:
- Jump locations (timestamps)
- Magnitude of each jump
- Affected trace IDs

### `src/chronfix/timing/correct.py` — Correction

| Function | Description |
|---|---|
| `correct_constant_offset(stream, offset_seconds)` | Shifts `starttime` by a known constant |
| `correct_clock_jump(stream, jump_time, jump_magnitude)` | Handles a clock jump — splits or shifts data at the boundary |
| `correct_linear_drift(stream, total_drift, start_time, end_time)` | Interpolates to remove linear drift |
| `split_at_jumps(stream, jump_times)` | Splits a stream into contiguous segments at jump boundaries |

Key behaviors:
- **Never mutates originals** — always works on `stream.copy()`
- **Returns corrected `Stream` + a correction report** (what was changed, by how much)
- `correct_clock_jump` supports two strategies:
  - `mode="split"` — break into separate traces at the jump
  - `mode="shift"` — shift all data after the jump to correct alignment

---

## Example Usage (Phase 1)

```python
from chronfix import read_data
from chornfix.timing import detect_time_jumps, correct_clock_jump, correct_constant_offset

# Load HYS14 data
st = read_data("HYS14_data.mseed")

# Detect timing jumps
jumps = detect_time_jumps(st, threshold=0.01)  # 10ms threshold
print(f"Found {len(jumps)} timing jumps")

# Option A: Split at jump boundaries (creates separate segments)
corrected = split_at_jumps(st, jump_times=[j.time for j in jumps])

# Option B: Shift data after a known jump
corrected = correct_clock_jump(st, 
    jump_time="2024-06-15T00:00:00",
    jump_magnitude=0.5,  # seconds
    mode="shift")

# Write corrected data
corrected.write("HYS14_corrected.mseed", format="MSEED")
```

---

## Phased Roadmap

| Phase | Focus | Target |
|---|---|---|
| **1** | Clock jump detection + correction, constant offset | **Before May 18th** |
| **2** | Linear drift correction, cross-correlation detection | After SAC meeting |
| **3** | Data gap detection & reporting | Future |
| **4** | Gap filling (interpolation, zero-padding) | Future |
| **5** | Broader QC (amplitude anomalies, response checks) | Future |

> [!tip]
> Phase 1 is scoped to directly address the HYS14 timing issue. Phases 2+ expand the package into a general-purpose seismic QC tool.

---

## Dependencies

```toml
[project]
dependencies = [
    "obspy>=1.4.0",
    "numpy>=1.21",
    "scipy>=1.7",
]
```

---

## Testing Strategy

- **Synthetic data fixtures** — create traces with known injected jumps, offsets, and drift
- **Detection tests** — verify algorithms find the correct jump times and magnitudes
- **Correction tests** — verify corrected traces match expected output within tolerance
- **Round-trip test** — read → detect → correct → write → re-read → verify
- **Install test** — `pip install -e .` then `from chronfix import correct_clock_jump`

---

## Open Questions

1. What exactly is the HYS14 timing error? (constant offset, jump, drift?)
2. Do you have logs or documentation describing when/how the timing issue manifests?
3. Should `correct_clock_jump` default to splitting or shifting?
4. Is there a reference station with known-good timing to use for cross-correlation?
5. What license? (MIT appears to be set on GitHub already)
