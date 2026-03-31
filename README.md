# FCDO Travel Advisory World Map — Project Knowledge Base

**Last updated:** March 2026  
**Status:** In progress — scraper and GitHub Actions written; map UI not yet started.

---

## What This Project Is

A website displaying a world map coloured by UK Foreign, Commonwealth & Development Office (FCDO) travel advisory levels. Users can click any country to see advisory details and a link to the full FCDO advice page. A time slider lets users scrub back through history to watch advisories change over time.

The site updates daily via an automated scraper pulling from the GOV.UK Content API.

---

## Repository & Files

Claude has access to all repo files via the project, **except** files in `data/` which are too large for the context window.

| File | Description |
|------|-------------|
| `index.html` | Main map page — **not yet written** |
| `scripts.js` | Front-end JS — currently contains hardcoded sample snapshot data; map wiring not yet done |
| `scripts/scraper.js` | Node.js scraper hitting the GOV.UK Content API |
| `.github/workflows/daily_scrape.yml` | GitHub Actions cron job (06:30 UTC daily) |

| Data file | Description |
|-----------|-------------|
| `data/world_10m.json` | Natural Earth 10m base map (~240 countries) — exists locally, not in context |
| `data/snapshots/` | Daily snapshot JSONs — directory exists; populated by scraper |

---

## Progress Checklist

Work through these steps in order. Update the status marker for each task as work progresses.

**Status key:** `[ ]` not started · `[~]` in progress · `[x]` done

---

### Step 1 — Static map shell
> Build `index.html`: Leaflet map with CartoDB dark tiles, load `data/world_10m.json`, render all countries in a neutral colour. No advisory logic yet — just confirm polygons load and display correctly.

- [X] Create `index.html` with Leaflet and CartoDB tile layer
- [X] Load and render `data/world_10m.json` country polygons
- [X] Confirm all ~240 countries display correctly in browser

---

### Step 2 — Colour countries from snapshot
> Wire the map to colour countries using a snapshot JSON. Use the sample data already in `scripts.js` or write a hand-crafted snapshot file. Confirm all four advisory tiers render with the correct colours.

- [X] Define the four tier colours in JS (red / orange / yellow / green)
- [X] Load a snapshot JSON and apply colours to matching country polygons
- [X] Confirm all four status values render correctly
- [X] Handle `null` status (green / no warning) and unknown ISO codes gracefully

---

### Step 3 — Country click panel
> Add a side panel. Clicking a country polygon shows: name, advisory level, human-readable description, and a link to `gov.uk/foreign-travel-advice/{slug}`.

- [X] Add side panel HTML/CSS to `index.html`
- [X] Wire Leaflet click events on country polygons
- [X] Display name, status badge, description text, and GOV.UK link
- [X] Handle click on a country with no advisory data

---

### Step 4 — GOV.UK scraper
> `scripts/scraper.js` is written. Run it manually, validate the output, and produce a real snapshot file.

- [X] `scripts/scraper.js` written
- [X] Run scraper manually and confirm it completes without errors
- [X] Validate output JSON against the data model (correct ISO2 codes, valid status values)
- [X] Commit a real snapshot file to `data/snapshots/`
- [X] Wire `index.html` to load `data/snapshot_today.json` (symlink or latest file)

---

### Step 5 — GitHub Actions automation
> `.github/workflows/daily_scrape.yml` is written. Verify it runs correctly end-to-end.

- [X] `daily_scrape.yml` written (cron at 06:30 UTC)
- [X] Trigger the workflow manually from the Actions tab and confirm it succeeds
- [X] Confirm snapshot file is committed and pushed by the bot
- [X] Confirm GitHub Pages rebuilds after the push
- [X] Check the live site reflects the new snapshot

---

### Step 6 — Time slider
> Add a date slider to the header. The page loads an index of available snapshots and lets the user scrub between dates.

- [X] Generate / maintain a `data/snapshot_index.json` listing all available snapshot dates
- [X] Update the scraper to append to this index on each run
- [X] Add slider UI to the page header
- [X] Wire slider to swap the active snapshot and re-colour the map
- [X] Show a **▲ escalated** / **▼ improved** badge in the info panel when a country's status differs from previous snapshot
- [X] Need to troubleshoot colours updating when the slider moves
- [X] Need to confirm the badge appears when required
- [X] Re-design the slider bar (remove date at beginning and end)
- [X] Remove snapshot and date from header and add something else
- [X] Slightly less dark water colour, lighter grey
- [X] Can I lay lat long lines over the map?
- [X] Better map placement? Against left side of window? Maybe a info bar on right instead of overlap
- [X] Country pop up Country name in title area
- [X] Missing Country data which does exist? France?

---

### Step 7 — Sub-national PDF zones
> For ~27 countries where `has_pdf: true`, extract zone polygons from FCDO PDF briefing maps and produce `data/{country}_zones.json` files. Overlay these on the Leaflet map.

- [ ] Decide on extraction approach / tooling (TBD — JS or other)
- [ ] Extract zones for a simple case first (e.g. Libya — expected to be all-red)
- [ ] Validate GeoJSON output and render as a Leaflet overlay
- [ ] Process remaining PDF countries (Israel, Ukraine, etc.)
- [ ] Only re-process a country when `public_updated_at` changes
- [ ] Remove Mixed colour option from ledgend and countries

---

### Step 8 — Polish & mobile
> Responsive layout, graceful error handling, optional search.

- [ ] Responsive layout for info panel and time slider on small screens
- [ ] Graceful error handling (missing PDFs, API failures, unknown country codes)
- [ ] Optional: search box to zoom/highlight a country by name
- [ ] Need to generate some kind of stats on visitors optional to also denote where they are looking at the site from
- [ ] Limit the number of days kept 1 year? peraps maybe just a few months?
- [X] Add a custom domain
- [ ] "Loading world polygons..." becomes "Loading world..."
- [ ] xxx countries coloured becomes countries updated
- [ ] Move the ledged further down givig the country information panel a bit more room
- [ ] Add country details to the country details panel (Maybe pulled from Wikipedia side bar, includes flag, capital and details)
- [ ] Refactor all of the code
- [ ] Rewrite Readme file

---

## Design Decisions

- **Leaflet.js** for the map — open source, no API key, fully client-side
- **CartoDB dark tiles** for the basemap — free, no key required
- **Natural Earth 10m** for country polygons — `data/world_10m.geojson`
- **Four advisory tiers** matching FCDO's classification:
  - 🔴 `avoid_all` — advises against all travel
  - 🟠 `avoid_all_but_essential` — avoid all but essential travel
  - 🟡 `some_parts` — mixed sub-national advisory
  - 🟢 `null` — see travel advice / no specific warning
- **GitHub Pages** for hosting — free, static, no server required
- **GitHub Actions** for scheduling — daily cron at 06:30 UTC
- **No Python** — all scripting is JavaScript / Node.js
- **Pre-processed zone JSON** — PDF zone extraction runs offline; outputs static `{country}_zones.json` committed to repo

---

## Data Model

Each daily snapshot: `data/snapshots/snapshot_{YYYY-MM-DD}.json`

```json
{
  "date": "2026-03-03",
  "generated_at": "2026-03-03T08:00:00Z",
  "source": "FCDO Foreign Travel Advice",
  "countries": {
    "IL": { "status": "some_parts", "name": "Israel", "slug": "israel", "has_pdf": true },
    "FR": { "status": null, "name": "France", "slug": "france", "has_pdf": false }
  }
}
```

`status` values: `"avoid_all"` · `"avoid_all_but_essential"` · `"some_parts"` · `null`

`has_pdf` — whether the FCDO page includes a PDF briefing map with sub-national zones.

---

## GOV.UK Content API

No authentication required.

```
GET https://www.gov.uk/api/content/foreign-travel-advice/{slug}
GET https://www.gov.uk/api/content/foreign-travel-advice   ← full country index
```

Key response fields:
- `details.alert_status` — array of machine-readable advisory level strings
- `details.image.url` — PDF briefing map URL (if present)
- `public_updated_at` — ISO timestamp of last update

Example slugs: `israel`, `france`, `south-korea`, `democratic-republic-of-the-congo`, `usa`

---

## Useful Links

- FCDO travel advice index: https://www.gov.uk/foreign-travel-advice
- GOV.UK Content API docs: https://content-api.publishing.service.gov.uk/reference.html
- API example: https://www.gov.uk/api/content/foreign-travel-advice/israel
- Natural Earth data: https://naciscdn.org/naturalearth/
- world-atlas npm package: https://www.npmjs.com/package/world-atlas
