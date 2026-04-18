# Timestamp Variability Assessment Plan for Sensor Timestamps

## Goal

Assess timestamp variability in the sensor records by separating:

1. the nominal sampling interval,
2. missing-sample gaps,
3. the best-fit true sampling interval for a given day, and
4. the residual timestamp jitter about an ideal linear clock.

This method is based on the **page 2 plan** and uses **least squares** for the final clock fit.

---

## Definitions

For a given day $d$, let the logged timestamps be

$$
t'_j(d), \qquad j = 0, 1, \dots, n-1
$$

where:

- $j$ is the record order in the file,
- the prime ($'$) denotes the logged/measured timestamp,
- $d$ is the day index.

The target outputs are:

- the fitted true sample interval for the day, $\Delta t_{\text{true}}(d)$,
- the fitted start time of the ideal sampling line, $t_{i=0}(d)$,
- timestamp jitter residuals for each record,
- jitter statistics in **milliseconds**,
- jitter statistics as a **fraction of the sample interval**.

---

## Step 1 — Compute adjacent timestamp differences

For each pair of adjacent timestamps, compute the observed interval:

$$
\Delta t'_j = t'_{j+1} - t'_j, \qquad j = 0, 1, \dots, n-2
$$

These are the logged sample-to-sample intervals.

---

## Step 2 — Estimate a first-guess sample interval

Use the median of the adjacent timestamp differences as the first-guess sample interval:

$$
\Delta t_{FG}(d) = \mathrm{median}\!\left(\Delta t'_j\right)
$$

Reason for using the median:

- robust to gaps and missing samples,
- captures the dominant interval for that day.

---

## Step 3 — Convert intervals into sample-step counts

Normalize each observed interval by the first-guess interval:

$$
\Delta i'_j = \frac{t'_{j+1} - t'_j}{\Delta t_{FG}(d)}
$$

Interpretation:

- $\Delta i'_j \approx 1$ → normal consecutive samples,
- $\Delta i'_j \approx 2, 3, \dots$ → one or more missing samples between records.

Convert the floating estimate to an integer sample-step count:

$$
\Delta i_j = \mathrm{round}\!\left(\frac{t'_{j+1} - t'_j}{\Delta t_{FG}(d)}\right)
$$

This gives the estimated integer number of nominal sample intervals between adjacent logged timestamps.

---

## Step 4 — Diagnose missing-sample gaps

Use $\Delta i_j$ to identify gaps.

- **Normal interval**: $\Delta i_j = 1$
- **Gap / missing samples**: $\Delta i_j > 1$

Recommended diagnostic: histogram of $\Delta i'_j$.

Expected behavior:

- strong peak near $1$,
- possible smaller peaks near $2$, $3$, etc. if gaps are present.

---

## Step 5 — Reconstruct the ideal sample index

Construct a new index $i_j$ representing the position on the ideal sample grid, including missing samples.

Set

$$
i_0 = 0
$$

Then propagate using the rounded sample-step counts:

$$
i_{j+1} = i_j + \Delta i_j
$$

Equivalent cumulative form:

$$
i_j = \sum_{k=0}^{j-1} \Delta i_k
$$

This step converts the raw record index $j$ into a reconstructed uniform-grid index $i_j$.

---

## Step 6 — Fit the ideal clock using least squares

Fit the logged timestamps to the linear model

$$
t'_j = t_{i=0}(d) + i_j \, \Delta t_{\text{true}}(d) + e_j
$$

where:

- $t_{i=0}(d)$ is the fitted start time of the ideal grid for day $d$,
- $\Delta t_{\text{true}}(d)$ is the fitted true sample interval for day $d$,
- $e_j$ is the residual timing error for record $j$.

This fit should be done with **ordinary least squares**.

Equivalent ideal time model:

$$
t_{\text{fit}, j} = t_{i=0}(d) + i_j \, \Delta t_{\text{true}}(d)
$$

---

## Step 7 — Define timestamp jitter

Define the timestamp jitter as the residual from the least-squares fitted ideal clock:
$e_j = t'_j - t_{\text{fit}, j}$
or explicitly,
$e_j = t'_j - \left[\, t_{i=0}(d) + i_j \, \Delta t_{\text{true}}(d) \,\right]$
This is the preferred jitter definition for the method.

---
## Step 8 — Report jitter in milliseconds

If timestamps are in seconds, convert residuals to milliseconds:
$e_{j,\mathrm{ms}} = 1000 \, e_j$

Then compute:
- mean jitter (ms),
- standard deviation (ms),
- maximum absolute jitter (ms).

Recommended statistics:
$\mu_{\mathrm{ms}} = \mathrm{mean}(e_{j,\mathrm{ms}})$

$\sigma_{\mathrm{ms}} = \mathrm{std}(e_{j,\mathrm{ms}})$

$e_{\max, \mathrm{ms}} = \max\!\left(\lvert e_{j,\mathrm{ms}} \rvert\right)$

---

## Step 9 — Report jitter as a fraction of the sample interval

Normalize the jitter by the fitted true sample interval:

$f_j = \frac{e_j}{\Delta t_{\text{true}}(d)}$

This gives jitter as a fraction of one sample interval.

Compute:

- mean fractional jitter,
- standard deviation of fractional jitter,
- maximum absolute fractional jitter.

Recommended statistics:
$\mu_f = \mathrm{mean}(f_j)$
$\sigma_f = \mathrm{std}(f_j)$
$f_{\max} = \max\!\left(\lvert f_j \rvert\right)$

This can also be reported as a percentage by multiplying by $100$.

---

## Step 10 — Recommended diagnostics and plots

For each day, generate:

### A. Interval-count histogram

Histogram of $\Delta i'_j$

Purpose:
- check whether the sample intervals cluster around integer multiples of the nominal interval,
- detect missing-sample gaps.

### B. Jitter histogram

Histogram of $e_j$
or equivalently $e_{j,\mathrm{ms}}$.

Purpose:

- visualize the spread of timing residuals,
- check whether the jitter is centered near zero.

### C. Timestamp versus reconstructed sample index

Plot:

- horizontal axis: $i_j$
- vertical axis: $t'_j$

Overlay the least-squares fit:
$$
t_{\text{fit}, j} = t_{i=0}(d) + i_j \, \Delta t_{\text{true}}(d)
$$
Purpose:
- verify that the clock is well described by a straight line.

### D. Residuals versus reconstructed index

Plot:
- horizontal axis: $i_j$
- vertical axis: $e_j$ or $e_{j,\mathrm{ms}}$

Purpose:
- inspect time dependence of the jitter,
- check for systematic drift or structure beyond random scatter.

---

## Optional consistency check: closeness to integer interval counts

A useful diagnostic is the deviation of the floating interval count from the nearest integer:
$\epsilon_j = \Delta i'_j - \mathrm{round}(\Delta i'_j)$
This should cluster near zero if the first-guess interval is appropriate.

Recommended summary: $\max\!\left(\lvert \epsilon_j \rvert\right)$
plus a histogram of $\epsilon_j$.

---

## Day-by-day workflow summary

For each day $d$:

1. Read the logged timestamps $t'_j(d)$
2. Compute adjacent differences $\Delta t'_j$
3. Compute the first-guess interval $\Delta t_{FG}(d)$ using the median
4. Compute floating interval counts $\Delta i'_j$
5. Compute rounded integer interval counts $\Delta i_j$
6. Reconstruct the ideal sample index $i_j$
7. Fit the least-squares line
   $$
   t'_j = t_{i=0}(d) + i_j \, \Delta t_{\text{true}}(d) + e_j
   $$
8. Define jitter as the residuals $e_j$
9. Report jitter in milliseconds
10. Report jitter as a fraction of the sample interval
11. Make the diagnostic plots and histograms

---

## Outputs to save for each day

Recommended saved outputs:

- $\Delta t_{FG}(d)$ — first-guess sample interval
- $\Delta t_{true}(d)$ — fitted true sample interval
- $t_{i_0}(d)$ — fitted start time
- $\Delta i_{float}$` — floating interval counts
- `delta_i_int` — rounded interval counts
- `i_j` — reconstructed sample index
- `e_j` — jitter residuals
- `e_ms` — jitter residuals in milliseconds
- `f_j` — jitter residuals as fraction of the sample interval
- summary statistics:
  - mean jitter (ms)
  - std jitter (ms)
  - max abs jitter (ms)
  - mean fractional jitter
  - std fractional jitter
  - max abs fractional jitter

---

## Compact formula set

**Observed interval**

$$
\Delta t'_j = t'_{j+1} - t'_j
$$

**First-guess interval**

$$
\Delta t_{FG}(d) = \mathrm{median}(\Delta t'_j)
$$

**Floating sample-step count**

$$
\Delta i'_j = \frac{\Delta t'_j}{\Delta t_{FG}(d)}
$$

**Integer sample-step count**

$$
\Delta i_j = \mathrm{round}(\Delta i'_j)
$$

**Reconstructed sample index**

$$
i_0 = 0, \qquad i_{j+1} = i_j + \Delta i_j
$$

**Least-squares clock model**

$$
t'_j = t_{i=0}(d) + i_j \, \Delta t_{\text{true}}(d) + e_j
$$

**Jitter residual**

$$
e_j = t'_j - \left[\, t_{i=0}(d) + i_j \, \Delta t_{\text{true}}(d) \,\right]
$$

**Jitter in milliseconds**

$$
e_{j,\mathrm{ms}} = 1000 \, e_j
$$

**Jitter as fraction of sample interval**

$$
f_j = \frac{e_j}{\Delta t_{\text{true}}(d)}
$$

---

## Interpretation

This method separates the problem into two parts:

1. **Recover the ideal sample index** — using the rounded normalized interval counts.
2. **Measure clock variability** — using residuals from the least-squares fitted ideal timeline.

This makes it possible to distinguish:

- normal sampling,
- missing-sample gaps,
- slow drift in the true sample interval,
- true short-timescale timestamp variability (jitter).
