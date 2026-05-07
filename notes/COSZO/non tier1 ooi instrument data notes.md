Detailed notes: Non-Tier 1 OOI Instrument Data Channels (Existing + New)

## What this file appears to be

This CSV is a working inventory of non-Tier 1 OOI data channels, mixing already existing channels with candidate or newly documented channels. It is organized by site, then by instrument type, and provides the platform name, reference designator, network/station naming, location code, proposed or existing seed channel, and notes.

The file also includes links to FDSN channel/location-code definitions and to selected IRIS/SAGE Metadata Aggregator (MDA) station pages that can be used to verify what is already published.

## Main references included in the CSV

- FDSN channel codes: https://docs.fdsn.org/projects/source-identifiers/en/latest/channel-codes.html
- FDSN location codes: https://docs.fdsn.org/projects/source-identifiers/en/latest/location-codes.html
- HYSB1 MDA: https://ds.iris.edu/mda/OO/HYSB1/
- HYS14 MDA: https://ds.iris.edu/mda/OO/HYS14/
- AXBA1 MDA: https://ds.iris.edu/mda/OO/AXBA1/
- AXCC1 MDA: https://ds.iris.edu/mda/OO/AXCC1/?starttime=2014-07-25T21:05:00&endtime=2599-12-31T23:59:59

## FDSN naming reminders

- A channel code is composed of **Band + Source + Subsource**.
- The **band code** indicates the sampling-rate / response class. Relevant ones here include **B** (broadband), **H** (high broadband / >=80 to <250 sps), **E** (extremely short period / >=80 to <250 sps but short-period response), **M** (>1 to <10 sps), **L** (~1 sps), and **U** (>=0.01 to <0.1 sps).
- The **source code** indicates what is being measured. Relevant source codes here are **D** = pressure, **K** = temperature, **O** = water current, **H/L/N/P** = seismometer families depending on gain/type.
- Location codes logically group related channels within one station. Empty location codes are acceptable when a station historically did not use location codes.

## Quick channel cheat sheet used in this file

| Code | Meaning | Typical sample rate in linked MDA |
| --- | --- | --- |
| BHE/BHN/BHZ | Broadband seismometer, E/N/Z components | 40 Hz |
| EHE/EHN/EHZ | Short-period seismometer, E/N/Z components |  |
| HHE/HHN/HHZ | High-sample-rate seismometer, E/N/Z components | 200 Hz |
| LHE/LHN/LHZ | Long-period seismometer, E/N/Z components | 1 Hz |
| MHE/MHN/MHZ | Mid-period seismometer, E/N/Z components | 8 Hz |
| HNE/HNN/HNZ | Accelerometer, E/N/Z components | 200 Hz |
| HDH | Hydrophone / differential pressure acoustic channel | 200 Hz |
| LDH | Hydrophone / differential pressure acoustic channel | 1 Hz |
| LDO | Long-period pressure, outside | 1 Hz |
| UDO | Ultra-long-period pressure, outside | 0.066667 Hz |
| LK1 | Long-period temperature channel (cabinet/source 1) | 1 Hz |
| UK1 | Ultra-long-period temperature channel (cabinet/source 1) | 0.066667 Hz |
| [L?]OE | Water-current eastward component (band code to verify) | not listed in linked pages |
| [L?]ON | Water-current northward component (band code to verify) | not listed in linked pages |
| [L?]OZ | Water-current upward component (band code to verify) | not listed in linked pages |
| [L?]KO | Temperature, outside environment (band code to verify) | not listed in linked pages |
| BDO | Broadband pressure, outside | not shown in snippet |


## Slope Base

**Context:** Oregon Slope Base Seafloor / RSN Hydrate Slope Base

**Stations mentioned in CSV:** HYSB1

**Published station metadata from linked MDA pages:**
- **HYSB1** — RSN Hydrate Slope Base; start 2014-09-13T00:00:01; lat/lon 44.509772, -125.405299; elevation -2909.0 m; MDA: https://ds.iris.edu/mda/OO/HYSB1/

### BB Seismometer + Hydrophone (existing)

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Velocity (m s-1), Acceleration (m s-2) | Oregon Slope Base Seafloor |  | OO | HYSB1 | -- | BHE,BHN,BHZ | RSN Hydrate Slope Base | https://ds.iris.edu/mda/OO/HYSB1/ |

Interpretation:
- These rows appear to represent already published seismic / hydrophone / BOTPT channels rather than new proposals.
- The linked MDA pages confirm that several of these stations already expose multiple derived rate classes (for example B, H, L, and M bands at HYS14 and AXCC1).

### Pressure

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pressure (PSI) | Oregon Slope Base Seafloor | RS01SLBS-MJ01A-06-PRESTA101 | OO | HYSB1 | 10 | LDO | RSN Hydrate Slope Base | Unprocessed data is in PSI. Need to convert to Pa. Sample period = 1 s. |
| Internal Temperature (°C) | Oregon Slope Base Seafloor | RS01SLBS-MJ01A-06-PRESTA101 | OO | HYSB1 | 10 | LK1 | RSN Hydrate Slope Base |  |

Interpretation:
- Pressure channels are listed together with an internal temperature channel from the same pressure package.
- The notes explicitly say the raw pressure values are in **PSI**, so downstream processing will need a unit conversion before scientific use.
- The linked MDA pages show a transition at some sites between older **UDO/UK1** ultra-long-period channels (~0.066667 Hz) and newer **LDO/LK1** long-period channels (1 Hz).

### 3-D Single Point Velocity

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Eastward Velocity (m s-1) | Oregon Slope Base Seafloor | RS01SLBS-MJ01A-12-VEL3DB101 | OO | HYSB1 | 20 | [L?]OE | RSN Hydrate Slope Base | Verify sample rate |
| Northward Velocity (m s-1) | Oregon Slope Base Seafloor | RS01SLBS-MJ01A-12-VEL3DB101 | OO | HYSB1 | 20 | [L?]ON | RSN Hydrate Slope Base | Verify sample rate |
| Upward Velocity (m s-) | Oregon Slope Base Seafloor | RS01SLBS-MJ01A-12-VEL3DB101 | OO | HYSB1 | 20 | [L?]OZ | RSN Hydrate Slope Base | Verify sample rate |
| Seawater Temperature | Oregon Slope Base Seafloor | RS01SLBS-MJ01A-12-VEL3DB101 | OO | HYSB1 | 20 | [L?]KO | RSN Hydrate Slope Base | Verify sample rate |

Interpretation:
- These rows describe eastward, northward, upward, and seawater-temperature outputs from a 3-D single-point current meter / velocity package.
- The proposed seed-channel patterns follow the FDSN source-code logic well: **O** for water current and **K** for temperature.
- The CSV itself flags all of these with **"Verify sample rate"**, so these channel assignments are not yet fully verified.

## Southern Hydrate Ridge

**Context:** Southern Hydrate Summit 1 cluster and RSN Hydrate Summit 1-4

**Stations mentioned in CSV:** HYS11, HYS12, HYS13, HYS14

**Published station metadata from linked MDA pages:**
- **HYS14** — RSN Hydrate Summit 1-4; start 2014-09-07T10:22:00; lat/lon 44.569218, -125.148115; elevation -773.0 m; MDA: https://ds.iris.edu/mda/OO/HYS14/

### Short Period Seismometer (existing)

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Velocity (m s-1) | Southern Hydrate Summit 1 Seafloor |  | OO | HYS11 | -- | EHE,EHN,EHZ | RSN Hydrate Summit 1-1 | RCA did not use location codes. |
| Velocity (m s-1) | Southern Hydrate Summit 1 Seafloor |  | OO | HYS12 | -- | EHE,EHN,EHZ | RSN Hydrate Summit 1-2 | RCA did not use location codes. |
| Velocity (m s-1) | Southern Hydrate Summit 1 Seafloor |  | OO | HYS13 | -- | EHE,EHN,EHZ | RSN Hydrate Summit 1-3 | RCA did not use location codes. |

Interpretation:
- These rows appear to represent already published seismic / hydrophone / BOTPT channels rather than new proposals.
- The linked MDA pages confirm that several of these stations already expose multiple derived rate classes (for example B, H, L, and M bands at HYS14 and AXCC1).

### BB Seismometer + Hydrophone (existing)

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Velocity (m s-1), Acceleration (m s-2) | Southern Hydrate Summit 1 Seafloor |  | OO | HYS14 | -- | BHE,BHN,BHZ | RSN Hydrate Summit 1-4 | RCA did not use location codes. https://ds.iris.edu/mda/OO/HYS14/ |

Interpretation:
- These rows appear to represent already published seismic / hydrophone / BOTPT channels rather than new proposals.
- The linked MDA pages confirm that several of these stations already expose multiple derived rate classes (for example B, H, L, and M bands at HYS14 and AXCC1).

### Pressure

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pressure (PSI) | Southern Hydrate Summit 1 Seafloor | RS01SUM1-LJ01B-09-PRESTB102 | OO | HYS14 | 10 | LDO | RSN Hydrate Summit 1-4 | Unprocessed data is in PSI. Need to convert to Pa. Sample period = 1 s. |
| Internal Temperature (°C) | Southern Hydrate Summit 1 Seafloor | RS01SUM1-LJ01B-09-PRESTB102 | OO | HYS14 | 10 | LK1 | RSN Hydrate Summit 1-4 |  |

Interpretation:
- Pressure channels are listed together with an internal temperature channel from the same pressure package.
- The notes explicitly say the raw pressure values are in **PSI**, so downstream processing will need a unit conversion before scientific use.
- The linked MDA pages show a transition at some sites between older **UDO/UK1** ultra-long-period channels (~0.066667 Hz) and newer **LDO/LK1** long-period channels (1 Hz).

### 3-D Single Point Velocity

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Eastward Velocity (m s-1) | Southern Hydrate Summit 1 Seafloor | RS01SUM1-LJ01B-12-VEL3DB104 | OO | HYS14 | 20 | [L?]OE | RSN Hydrate Summit 1-4 | Verify sample rate |
| Northward Velocity (m s-1) | Southern Hydrate Summit 1 Seafloor | RS01SUM1-LJ01B-12-VEL3DB104 | OO | HYS14 | 20 | [L?]ON | RSN Hydrate Summit 1-4 | Verify sample rate |
| Upward Velocity (m s-) | Southern Hydrate Summit 1 Seafloor | RS01SUM1-LJ01B-12-VEL3DB104 | OO | HYS14 | 20 | [L?]OZ | RSN Hydrate Summit 1-4 | Verify sample rate |
| Seawater Temperature (°C) | Southern Hydrate Summit 1 Seafloor | RS01SUM1-LJ01B-12-VEL3DB104 | OO | HYS14 | 20 | [L?]KO | RSN Hydrate Summit 1-4 | Verify sample rate |

Interpretation:
- These rows describe eastward, northward, upward, and seawater-temperature outputs from a 3-D single-point current meter / velocity package.
- The proposed seed-channel patterns follow the FDSN source-code logic well: **O** for water current and **K** for temperature.
- The CSV itself flags all of these with **"Verify sample rate"**, so these channel assignments are not yet fully verified.

### Notes on station naming and location codes

- The three short-period stations **HYS11**, **HYS12**, and **HYS13** are listed with **no location code (`--`)** and a note saying **"RCA did not use location codes."**
- The broadband/hydrophone and pressure/current package at **HYS14** does use location codes (**10** for pressure package and **20** for current meter package in the CSV).

## Axial Base Seafloor

**Context:** Axial Base Seafloor / RSN Axial Base 1

**Stations mentioned in CSV:** AXBA1

**Published station metadata from linked MDA pages:**
- **AXBA1** — RSN Axial Base 1; start 2014-08-08T16:39:00; lat/lon 45.820222, -129.736393; elevation -2610.0 m; MDA: https://ds.iris.edu/mda/OO/AXBA1/

### BB Seismometer + Hydrophone (existing)

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Velocity (m s-1), Acceleration (m s-2) | Axial Base Seafloor |  | OO | AXBA1 | -- | BHE,BHN,BHZ | RSN Axial Base 1 | https://ds.iris.edu/mda/OO/AXBA1/ |

Interpretation:
- These rows appear to represent already published seismic / hydrophone / BOTPT channels rather than new proposals.
- The linked MDA pages confirm that several of these stations already expose multiple derived rate classes (for example B, H, L, and M bands at HYS14 and AXCC1).

### Pressure

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pressure (PSI) | Axial Base Seafloor | RS03AXBS-MJ03A-06-PRESTA301 | OO | AXBA1 | 10 | UDO | RSN Axial Base 1 | Unprocessed data is in PSI. Need to convert to Pa. Sample period = 15 s. |
| Internal Temperature (°C) | Axial Base Seafloor | RS03AXBS-MJ03A-06-PRESTA301 | OO | AXBA1 | 10 | UK1 | RSN Axial Base 1 |  |

Interpretation:
- Pressure channels are listed together with an internal temperature channel from the same pressure package.
- The notes explicitly say the raw pressure values are in **PSI**, so downstream processing will need a unit conversion before scientific use.
- The linked MDA pages show a transition at some sites between older **UDO/UK1** ultra-long-period channels (~0.066667 Hz) and newer **LDO/LK1** long-period channels (1 Hz).

### 3-D Single Point Velocity

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Eastward Velocity (m s-1) | Axial Base Seafloor | RS03AXBS-MJ03A-12-VEL3DB301 | OO | AXBA1 | 20 | [L?]OE | RSN Axial Base 1 | Verify sample rate |
| Northward Velocity (m s-1) | Axial Base Seafloor | RS03AXBS-MJ03A-12-VEL3DB301 | OO | AXBA1 | 20 | [L?]ON | RSN Axial Base 1 | Verify sample rate |
| Upward Velocity (m s-) | Axial Base Seafloor | RS03AXBS-MJ03A-12-VEL3DB301 | OO | AXBA1 | 20 | [L?]ON | RSN Axial Base 1 | Verify sample rate |
| Seawater Temperature (°C) | Axial Base Seafloor | RS03AXBS-MJ03A-12-VEL3DB301 | OO | AXBA1 | 20 | [L?]KO | RSN Axial Base 1 | Verify sample rate |

Interpretation:
- These rows describe eastward, northward, upward, and seawater-temperature outputs from a 3-D single-point current meter / velocity package.
- The proposed seed-channel patterns follow the FDSN source-code logic well: **O** for water current and **K** for temperature.
- The CSV itself flags all of these with **"Verify sample rate"**, so these channel assignments are not yet fully verified.

## Axial Central Caldera

**Context:** Central Caldera / RSN Axial Central Caldera 1

**Stations mentioned in CSV:** AXCC1

**Published station metadata from linked MDA pages:**
- **AXCC1** — RSN Axial Central Caldera 1; start 2014-07-25T21:05:00; lat/lon 45.954683, -130.008979; elevation -1527.0 m; MDA: https://ds.iris.edu/mda/OO/AXCC1/?starttime=2014-07-25T21:05:00&endtime=2599-12-31T23:59:59

### BOTPT (existing)

| Measurement | Platform Name | Reference Designator | Network | Station | Loc | Seed Channel | Station Site | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pressure (PSI) | Central Caldera | RS03CCAL-MJ03F-05-BOTPTA301 | OO | AXCC1 | 11 | BDO | RSN Axial Central Caldera 1 | https://ds.iris.edu/mda/OO/AXCC1/?starttime=2014-07-25T21:05:00&endtime=2599-12-31T23:59:59 |

Interpretation:
- These rows appear to represent already published seismic / hydrophone / BOTPT channels rather than new proposals.
- The linked MDA pages confirm that several of these stations already expose multiple derived rate classes (for example B, H, L, and M bands at HYS14 and AXCC1).

### Notes on AXCC1 / BOTPT

- The CSV only includes **BOTPT (existing)** for this section, with station **AXCC1** and location code **11**.
- The linked MDA page confirms AXCC1 has a broader published seismic + accelerometer + hydrophone channel set in addition to the location-code-11 package.
- In the CSV, the proposed channel for BOTPT pressure is **BDO**, which reads naturally as broadband pressure outside; however, the MDA snippet opened from the station page did not expose the exact AXCC1 location-code-11 channel names in the visible excerpt, so this one is worth verifying directly on the station page or in stationXML.

## Cross-checks against the linked MDA pages

- **HYSB1** (Hydrate Slope Base): linked MDA confirms site metadata and shows published seismic and hydrophone channels under location `--`, plus pressure/temperature channels under location `10`.
- **HYS14** (Hydrate Summit 1-4): linked MDA confirms seismic/hydrophone/accelerometer channels under location `--` and pressure/temperature channels under location `10`.
- **AXBA1** (Axial Base 1): linked MDA confirms long-running seismic/hydrophone channels under location `--`, with pressure/temperature channels under location `10`. The linked page also shows that AXBA1 pressure channels have been represented as **UDO/UK1** across multiple epochs, rather than the **LDO/LK1** pattern seen at some hydrate sites.
- **AXCC1** (Axial Central Caldera 1): linked MDA confirms a broad existing station inventory and a separate location-code `11` package, matching the CSV’s focus on BOTPT.

## Things that should be checked before this inventory is finalized

1. **Sample rate for the 3-D Single Point Velocity package.** The CSV explicitly says to verify it for all OE/ON/OZ/KO channels.
2. **Band code for the 3-D velocity channels.** The CSV writes these as `[L?]OE`, `[L?]ON`, `[L?]OZ`, and `[L?]KO`, which signals that the exact band letter is still uncertain.
3. **Possible typo at AXBA1 upward velocity row.** In the CSV, the row labeled *Upward Velocity* uses seed channel **[L?]ON** rather than **[L?]OZ**. Because upward is the vertical component, this likely deserves correction or explicit confirmation.
4. **Unit wording.** Several rows say `Pressure (PSI)` and note that the unprocessed data are in PSI; it may help to add the intended converted unit (likely dbar, Pa, or equivalent project-specific unit) in future versions of the notes.
5. **BOTPT channel verification at AXCC1.** The CSV lists **BDO**, but the visible MDA excerpt did not show the full location-code-11 channel names. This should be confirmed against station metadata / StationXML.
6. **Consistency of location-code use across sites.** Some stations historically use no location code, whereas others group channels by package (`10`, `11`, `20`). That logic is acceptable per FDSN, but it is worth documenting explicitly so future users know this is intentional.

## Bottom-line interpretation

This file is best read as a practical channel-mapping worksheet for selected OOI non-Tier 1 instruments. It combines:
- already published channels that can be verified from IRIS/SAGE MDA pages,
- proposed or partially specified seed-channel names for pressure/current/temperature packages, and
- implementation notes about unit conversion, missing location codes, and sample-rate verification.

The most important unresolved items are the exact band code and sample rate for the 3-D single-point-velocity channels, the likely AXBA1 vertical-channel typo, and verification of the AXCC1 BOTPT channel naming.
