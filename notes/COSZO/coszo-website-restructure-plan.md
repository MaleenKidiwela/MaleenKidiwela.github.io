## COSZO website restructure plan

Plan to implement the William-meeting changes captured in [[06-18-26 Notes]] against the `coszo-hub.github.io` repo.

## Implementation status — last updated 2026-06-18

**Everything below is built AND pushed live** to `coszo-hub.github.io` (HEAD ≈ `cd977a9`). The original plan (Phases 1–5) is done; many further changes were made during review and are recorded under "Beyond the original plan."

### Original plan — DONE
- **Phase 1 (nav/footer):** Home removed; Science→**About**; People removed as top tab (now under About); Infrastructure stays clickable; Data dropdown trimmed; Outreach trimmed to REU + Early Career Workshop; Archives → Early Warning dropdown. Footer relabeled About/Infrastructure/Engage. Utility bar = Contact + Search. Hero eyebrow removed + OOI linked.
- **Phase 2 (content):** ASP rewritten (new overview, stations table with verified IRIS MDA links, Specs + Citation removed; later the EarthScope data-access line was also removed); instrument pages reworked (see below — superseded by later rewrites); Publications → "Coming soon"; Hydrate Ridge map placeholder; Hydrophone rename.
- **Phase 3 (deletions):** Future Opportunities, Meetings, Axial Seamount fully deleted; Partners de-linked but kept.
- **Phase 4 (new pages):** Oregon Shelf + Cruises pages.
- **Phase 5a (People):** data-driven from `data/people.csv`; **Google Sheet + GitHub Action** sync (`.github/workflows/sync-people.yml`, reads repo var `PEOPLE_SHEET_CSV_URL`). Populated with real people scraped from **APL**, **College of the Environment**, and **Oceanography** directories; photos in `assets/people/`. Groups: Leadership / Research / Postdocs (Maleen Kidiwela) / Graduate Students.
- **Phase 5b (Blog from Sea):** separate **`blog-from-sea.html`** page with square blocks + one generated page per post; submit→approve pipeline via **GitHub Issues** (`.github/ISSUE_TEMPLATE/blog-from-sea.yml` → `approved` label → `bin/build_blog_csv.py` → `.github/workflows/sync-blog.yml`); `data/blog.csv`. Cruises page shows recent blocks.
- **Phase 5c (Live video):** PARKED — placeholder on Cruises page until a stream URL exists.

### Resolved decisions
- **COSZO Instruments list:** aligned to the 8 Data instruments (Strong-Motion/GSSM/Hydrophone reinstated as part of the new instrument-based list — see below).
- **People mechanism:** Google Sheet + Action; for now `data/people.csv` is committed directly with the scraped data (importable into the Sheet later).
- **ASP channel codes:** `UDO/UK1/LDO/LK1` (verified); AXBA1 U-channels only.
- Utility bar = Contact + Search; Archives under Early Warning; short-period kept.

### Beyond the original plan (review changes, all pushed)
- **Search:** functional client-side search (`search.html` + `search-index.json` built in `main()`); Search links wired in utility bar + footer.
- **About hub:** About is now a **clickable tab → `about.html`** (square cards: Motivation, Objectives, Publications, People, Contact). Old combined **`science.html` deleted**; breadcrumbs repointed to `about.html`.
- **Data products redefined to 8 instrument-based items** (Broadband Seismometer & Strong Motion, Short-Period Seismometer, Differential Pressure Gauge, Hydrophone, Absolute Pressure Gauge, GSSM — Calibrated Pressure & Acceleration, CSCPR — Calibrated Pressure, Current Meter) in dropdown + hub. **"Data Products" → "Data" everywhere**; Pressure/Motion/Water dropdown labels removed.
- **COSZO Instruments** rewritten to those 8, **description-left / figure-right** layout.
- **Existing Instruments** fully rewritten from `coszo.org/story/Existing_Instruments` + the OOI instrument pages: organized **by instrument** (sites named *in* each description and linked to the site pages), with make/model (Güralp CMG-1T, CMG-6TF, HTI-90-U, Sea-Bird SBE 54, Nobska MAVS-4 / Nortek Vector), full descriptions, and **real OOI photos scraped into `assets/instruments/`** (downscaled). Redundant external "details" links removed.
- **Sites populated** from OOI platform descriptions (Slope Base, Southern Hydrate Ridge, Oregon Shelf) + **Oregon Offshore (CE04OSBP) site added**; OOI site links removed per request; site pages linked from instrument descriptions.
- **Homepage:** hero CTA buttons removed; hero grammar fixed ("how the Cascadia subduction zone fault works"); quick-access tiles reordered to match nav + **About tile added**; Welcome SVG replaced with **`cascadia_zoomed.jpg`** (optimized 9.8 MB → 314 KB).
- **Cruises:** the "Recent Operations" cruise timeline **moved here from Infrastructure**; RR2603 + TN430 entries removed.
- **Contact form:** switched from `mailto:` action to a **JS-built mailto on submit** (fixes Chrome "insecure form / autofill off" warning); Project office block kept; target `usherm42@uw.edu`.
- **Misc:** Early Career Workshop dates → **TBD**; "Why these matter for COSZO" section removed from Existing Instruments; instrument-row spacing + underlined/accent site links.

### Still open / parked
- Phase 5c **video embed** — awaiting a live-stream URL.
- **People gaps:** Kellen Rosburg & Joel White (no role/photo, not on any directory); a few APL staff with no portrait; Dobashi's photo is ~2.1 MB and could be downscaled.
- **"Axial Base"** mention on the pressure-gauge sites line is unlinked (no Axial site page).
- **GitHub one-time setup (user side):** create an `approved` label; enable Actions **read/write** permissions; set the `PEOPLE_SHEET_CSV_URL` repo variable if/when moving People editing to the Google Sheet.

> The phase-by-phase sections below are the **original plan as written** (kept for reference); where the live site now differs, the status above is authoritative.

---

## How the site is built (constraints that shape every change)

- The entire site is generated by **`build_pages.py`**. Each page is a Python string (`*_BODY`), registered in the `PAGES` list near the bottom as `(filename, title, active_key, body)`, and written out by `main()`.
- Shared chrome: **`build_header(active)`** (utility bar + logo + nav with hover dropdowns) and **`FOOTER`**. The `active` key (`home`/`science`/`infrastructure`/`data`/`people`/`outreach`/`ew`) controls the highlighted tab.
- After any edit, the site is regenerated with **`python3 build_pages.py`** — this rewrites all `*.html`. **We never hand-edit the generated `.html` files**; all changes go into `build_pages.py` (or its data inputs).
- `.pages.yml` is the Pages-CMS field config (lets non-developers edit page content in a web UI). When we add/rename/remove pages we keep this file in sync.
- It's a **static GitHub Pages site** — no server. Anything requiring user submissions or live data (people spreadsheet, sea blog, video) needs a static-compatible mechanism (build-time data file, GitHub Action, or external form/embed). Those are isolated in Phase 5.

Deploy = commit + push to the `coszo-hub.github.io` repo (GitHub Pages serves it). We rebuild and eyeball locally before pushing.

---

## Phase 1 — Navigation + footer restructure (`build_header`, `FOOTER`)

The biggest single change. New top-level nav:

| Old top tab | New top tab | Clickable? | Dropdown |
|---|---|---|---|
| Home | **(removed)** | — | logo still links to `index.html` |
| Science | **About** | non-link (span) | Motivation, Objectives, Publications, People, Contact |
| Infrastructure | Infrastructure | link (stays clickable → `infrastructure.html`) | Seafloor Sites, Existing Instruments, COSZO Instruments, Cruises |
| Data | Data | link | (data dropdown — Phase 2e rename; "All Data Products" item removed) |
| People | **(removed as top tab)** | — | moved under About |
| Outreach | Outreach | link | Research Experiences for Undergraduates, 2027 Early Career Workshop |

**Redundant "overview" dropdown items removed** (the top tab already lands on that page): drop **Infrastructure Overview**, **All Data Products**, and **Outreach Overview**. This supersedes the original note's "make Infrastructure non-clickable" — Infrastructure stays a clickable link to its main page.
| Early Warning | Early Warning | link | Early Warning Overview, 2019 Feasibility Study, **Archives** |

Concrete tasks:

- [ ] **Remove the Home nav item** (`<div class="nav-item"><a href="index.html">Home</a></div>`). Logo already links home.
- [ ] **Rename Science → About**; change the dropdown to: `Motivation` → `motivation.html` (or `science.html#motivation`), `Objectives` → `science.html#objectives`, `Publications` → `publications.html`, **`People` → `people.html`**, **`Contact` → `contact.html`**. Update the `active` key from `science` to `about` (and the `cls()`/PAGES `active` values for motivation/objectives/publications/people/contact).
- [ ] **Remove the People top tab** (its dropdown content is dropped; People becomes a single link under About).
- [ ] **Infrastructure stays clickable** — keep `<a href="infrastructure.html">Infrastructure</a>`. **Remove the "Infrastructure Overview" dropdown item** (redundant — the tab already lands there).
- [ ] **Infrastructure dropdown** = **Seafloor Sites** (`sites.html`, renamed from "Sites"), Existing Instruments, COSZO Instruments, **Cruises** (`cruises.html`, new — Phase 4). Remove **Future Opportunities** (Phase 3) and **Infrastructure Overview**.
- [ ] **Data dropdown** — remove the **"All Data Products"** item (the Data tab already lands on `data.html`). Keep the rest (with the Hydrophone rename, Phase 2e).
- [ ] **Outreach dropdown** — remove **Outreach Overview** (redundant), **Graduate Students**, **Meetings**, and **Partners**. Result: Research Experiences for Undergraduates, 2027 Early Career Workshop.
- [ ] **Early Warning dropdown** — add **Archives** (`archives.html`).
- [ ] **Utility bar** — keep **Contact** and **Search** only; remove the **Archives** link (it moves into the Early Warning dropdown).
- [ ] **Footer (`FOOTER`)** — reconcile with the new structure: drop Future Opportunities (Infrastructure col), drop Partners + Meetings (Community col), and re-label the Science col to About. People stays (now an About item).
- [ ] **Homepage hero eyebrow** — remove the `Geophysical Observations · Early Warning` eyebrow text (`INDEX_BODY`); keep the lede about supporting offshore earthquake + tsunami early warning, and ensure **OOI / Ocean Observatories Initiative is a link** in the hero lede (it's currently only linked in the Welcome section).

---

## Phase 2 — Page content edits

### 2a. Absolute Seafloor Pressure (`ASP_BODY`)
- [ ] **Delete the lede paragraph** ("Absolute Seafloor Pressure (ASP) captures the total hydrostatic pressure…").
- [ ] **Rewrite the Overview**: *"Pressure incorporates tidal pressure gauges sampling at rates varying from 0.0667 Hz to 1.0 Hz. Each instrument also carries a temperature channel."* (Rates verified via FDSN: U-band = 0.0667 Hz / 15 s, L-band = 1.0 Hz / 1 s.)
- [ ] **Replace the Stations intro sentence** ("PREST instruments on the OOI Regional Cabled Array…") with: *"The table below lists the station, location code, and channels for the data."*
- [ ] **Rebuild the Stations table** with columns: **Site, Station, Location code, Channel name, Channel codes (sample rate in parentheses)**. Verified channel inventory (FDSN station service, `OO` net, loc `10`):
  - **HYS14** (Southern Hydrate Ridge): `UDO` (0.0667 Hz), `UK1` (0.0667 Hz), `LDO` (1.0 Hz), `LK1` (1.0 Hz)
  - **HYSB1** (Slope Base): `UDO` (0.0667 Hz), `UK1` (0.0667 Hz), `LDO` (1.0 Hz), `LK1` (1.0 Hz)
  - **AXBA1** (Axial Base): `UDO` (0.0667 Hz), `UK1` (0.0667 Hz) — **U-channels only, no L-channels**
  - Channel *name* grouping: `DO` = absolute pressure, `K1` = internal pressure-temperature reading.
- [ ] **Make the channel codes clickable** → EarthScope/IRIS MDA, format `https://ds.iris.edu/mda/OO/<STA>/10/<CHAN>/` (e.g. `…/OO/HYS14/10/LK1/`). **Resolved:** the channels are `UK1`/`LK1`, **not** the `UKO`/`LKO` in the note's links (those were typos — confirmed against the FDSN station service). Verify each generated URL returns a live MDA page during implementation.
- [ ] **Delete the Specifications section** (and its "On This Page" sidebar link).
- [ ] **Delete the Citation section** (and its sidebar link).
- [ ] Resulting sidebar: Overview, Stations, Data Access.

### 2b. COSZO Instruments (`COSZO_INSTR_BODY`) + Existing Instruments (`EXISTING_BODY`)
- [ ] **Convert spec tables → technical descriptions with picture placeholders** ("same format without tables"). Each instrument = heading + short technical description + an image placeholder (`<figure>` with a placeholder `<img>`/box and caption) + site name(s).
- [ ] **Reorder / revise the COSZO instrument list** per the notes:
  1. **Broadband seismometers** (at top)
  2. **Buried 3-component seismometer** — Nanometrics, "Atlantis COBSO"
  3. **Differential pressure gauge**
  4. **Cabled self-calibrating pressure recorder (SCPR)**
  5. **Tidal pressure gauges**
  6. **Current meters**
- [ ] ~~Remove short-period seismometers~~ — **deferred. Keep short-period seismometers for now** (revisit later). No change this pass.
- [ ] Keep GSSM/other items only if still relevant (confirm with William — not mentioned in notes).

### 2c. Publications (`PUBLICATIONS_BODY`)
- [ ] **Replace the whole page body with a "Coming soon" stub** (keep the hero + breadcrumb, swap the article content for a short "Publications — coming soon" block). Preserve the existing rich content in a comment or git history so it can be restored.

### 2d. Hydrate Ridge site page (`HYDRATE_RIDGE_BODY`)
- [ ] **Add a map of Hydrate Ridge** (image placeholder `<figure>` for now).

### 2e. Data products rename (`DATA_PRODUCT_CARDS`, data dropdown in `build_header`)
- [ ] **Rename "Low-Frequency Acoustic Pressure" → "Hydrophone"** in the data dropdown and in the `DATA_PRODUCT_CARDS` list.

---

## Phase 3 — Deletions

- [ ] **Future Opportunities — FULLY DELETE.** Remove from Infrastructure dropdown, the Infrastructure hub cards (`INFRASTRUCTURE_BODY`), the footer, the `PAGES` registry, `.pages.yml`, and delete the generated `future-opportunities.html` + `FUTURE_BODY`.
- [ ] **Partners — DE-LINK ONLY.** Remove from Outreach dropdown and the Outreach hub cards, **but keep `partners.html` + `PARTNERS_BODY` in `build_pages.py` and in `PAGES`** ("keep the HTML for future use"). It still builds, just isn't linked anywhere.
- [ ] **Meetings — FULLY DELETE.** Remove from Outreach dropdown, hub cards, footer (Community col), `PAGES`, `.pages.yml`, and delete `meetings.html` + `MEETINGS_BODY`.
- [ ] **Graduate Students — DELETE.** Remove the Outreach "Graduate Students" hub card (and the dropdown entry, already covered in Phase 1).
- [ ] **Axial Seamount — FULLY DELETE.** Remove from the Seafloor Sites overview cards (`SITES_BODY`), any nav, `PAGES`, `.pages.yml`, and delete `axial-seamount.html` + `AXIAL_SEAMOUNT_BODY`. **Note:** this is the *Axial Seamount site page* only — it does **not** affect the **AXBA1 / Axial Base** PREST station, which stays in the ASP stations table.

---

## Phase 4 — New pages

### 4a. Oregon Shelf site
- [ ] Add an **Oregon Shelf** card to `SITES_BODY`, a new `OREGON_SHELF_BODY` (mirroring the existing site-stub pattern), `oregon-shelf.html` in `PAGES`, and an entry in `.pages.yml`.

### 4b. Cruises (Infrastructure → Cruises)
- [ ] New `CRUISES_BODY` / `cruises.html`, added to the Infrastructure dropdown, `PAGES`, and `.pages.yml`. The page hosts four capabilities:
  1. **Plan for the day** — editable daily plan section.
  2. **Blog from sea** — daily blog entries with a submit-then-approve workflow (mechanism in Phase 5).
  3. **Cruise diary** — chronological diary entries.
  4. **Stream video** — embedded live video.
- [ ] Move the existing "Cruises and deployments" timeline currently sitting on `INFRASTRUCTURE_BODY` onto this page (or link to it), so cruises live in one place.

---

## Phase 5 — Dynamic / editable features (need a mechanism decision)

These three can't be pure hand-written HTML; each needs a static-site-compatible data path. **Proposed defaults below; all three are flagged in Open Decisions.**

### 5a. Manageable People page from a spreadsheet — DECIDED
Requirements (from review): editing the spreadsheet is the *only* action an editor takes — **removing a row removes the person from the site; adding a row adds them — automatically**, no code or manual HTML. Must be very user-friendly. Profile photos linked per-row.

**Mechanism:**
- **Data source:** a **Google Sheet** published to CSV (friendliest for non-technical editors — they just edit a spreadsheet, no Git). Columns: `name`, `role`, `group` (Leadership / PI / Research Team / Students / Collaborators / Advisory), `affiliation`, `photo`, `link`, `order`.
- **Auto-rebuild:** a **GitHub Action** fetches the published CSV and runs `python3 build_pages.py` on a schedule (e.g. nightly) **and** on manual dispatch, committing the regenerated `people.html`. So add/remove in the Sheet propagates to the live site automatically. `build_pages.py` is refactored so `PEOPLE_BODY` is generated by reading the CSV and grouping rows (replacing today's hard-coded placeholder cards).
- **Fallback if no external service is wanted:** a committed `data/people.csv` edited through the existing **Pages CMS** (add a `people` collection to `.pages.yml`), with the same Action rebuilding on push. Same end result, in-repo.
- **Profile photos:** a `photo` column holds either a committed image path (`assets/people/<name>.jpg`) or a URL. We write a **one-off scraper helper** to seed pictures from public faculty/institution profile pages into `assets/people/`, then reference them from the Sheet. Editors can later just paste an image URL or upload a file and link it.
- **Graceful gaps:** missing `photo` → fall back to the current generated SVG avatar; missing `link` → non-clickable card.

> Sub-choice still open for the build step: **Google Sheet + Action** (recommended) vs **committed CSV + Pages CMS**. Both satisfy auto add/remove; the Sheet is friendlier for non-devs, the CSV keeps everything in one repo.

### 5b. "Blog from sea" — submit + approve — DECIDED (Option B)
**GitHub Issues as the submission inbox.** A "Submit a post" link on the Cruises page opens a **pre-filled GitHub Issue** (issue template with title/date/body/photo fields). A maintainer reviews and adds an **`approved`** label; a **GitHub Action** renders all `approved`-labelled issues into the Blog-from-sea section and rebuilds. Approval = clicking a label. No external form service, fully inside GitHub.

### 5c. Stream video
- [ ] Embed a **YouTube Live / Vimeo** iframe in the Cruises page; show a "stream offline" placeholder until a URL is set. No backend needed.

---

## Open decisions — RESOLVED

1. **ASP channel codes:** ✅ Use `UDO`, `UK1`, `LDO`, `LK1` (the note's `UKO`/`LKO` were typos — confirmed via the FDSN station service). AXBA1 has U-channels only. Links: `https://ds.iris.edu/mda/OO/<STA>/10/<CHAN>/`.
2. **People spreadsheet mechanism:** ✅ Spreadsheet-driven, build-time generated, auto add/remove via a GitHub Action; photos linked per-row with a scraper to seed them. Recommended **Google Sheet + Action**; committed-CSV-via-Pages-CMS is the in-repo fallback (one small sub-choice left — see 5a).
3. **Blog-from-sea mechanism:** ✅ **Option B** — GitHub Issues + `approved` label + Action.
4. **De-link vs delete:** ✅ **Partners** → de-link, keep file. **Meetings, Axial Seamount, Future Opportunities** → fully delete (files + `PAGES` + `.pages.yml` + nav/footer/cards).
5. **Short-period seismometers:** ✅ **Keep for now**, revisit later. No change this pass.
6. **Utility bar:** ✅ **Contact + Search only**; Archives moves to the Early Warning dropdown.

One remaining micro-choice: the People build step (Google Sheet + Action vs committed CSV + Pages CMS) — both meet the auto add/remove requirement. I'll default to Google Sheet + Action unless you prefer everything in-repo.

---

## Build / verification checklist (every phase)

- [ ] Edit `build_pages.py` (and `.pages.yml` / `data/*.csv` as needed) — never the generated `.html`.
- [ ] Run `python3 build_pages.py`; confirm "Generated N pages".
- [ ] Open the affected pages locally; check nav highlight (`active` key), dropdowns, breadcrumbs, and that removed links are gone.
- [ ] Grep the generated HTML for any dangling links to removed pages.
- [ ] Commit + push to `coszo-hub.github.io`; verify on the live GitHub Pages site.

## Suggested execution order

1. Phase 1 (nav + footer) — the structural skeleton.
2. Phase 3 (deletions) — fewer pages to carry forward.
3. Phase 2 (content edits: ASP, instruments, publications, hydrate map, data rename).
4. Phase 4 (Oregon Shelf, Cruises pages).
5. Phase 5 (dynamic features) — last, after the mechanism decisions.
