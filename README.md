# FCDO Travel Advisory World Map
 
A live, interactive world map showing UK Foreign, Commonwealth & Development Office (FCDO) travel advisory levels for every country. The map updates automatically every day, pulling the latest advice directly from the GOV.UK Content API.
 
---
 
## What It Does
 
Every country on the map is coloured by its current FCDO advisory tier:
 
| Colour | Tier | Meaning |
|--------|------|---------|
| 🔴 Red | Avoid all travel | FCDO advises against all travel to this country |
| 🟠 Orange | Avoid all but essential | FCDO advises against all but essential travel |
| 🟡 Yellow | Mixed (some parts) | Advisory applies to parts of the country only |
| 🟢 Green | See travel advice | No specific warning — check the full advice |
| ⬛ Dark | No data | Country not currently in the FCDO index |
 
Clicking or tapping any country opens a detail panel showing:
 
- The country's flag, capital, population, population density and official languages
- A short Wikipedia summary of the country
- The current FCDO advisory tier and description
- An FCDO zone map image for countries with mixed advisories
- A direct link to the full advice on GOV.UK
- An escalation or improvement badge when the advisory has changed since the previous day
 
A **time slider** at the top of the page lets you scrub back through the full history of snapshots to watch how advisories have changed over time.
 
A **search box** in the sidebar lets you find any country by name — the map zooms to it and highlights it automatically.
 
---
 
## How It Works
 
### Data pipeline
 
A Node.js scraper (`scripts/scraper.js`) hits the GOV.UK Content API each day and writes a snapshot JSON file to `data/snapshots/snapshot_YYYY-MM-DD.json`. It also maintains `data/snapshot_today.json` (always the latest) and `data/snapshot_index.json` (the list of all available dates for the time slider).
 
The scraper runs automatically at **06:30 UTC daily** via a GitHub Actions workflow (`.github/workflows/daily_scrape.yml`). If the advisory data has changed since the previous run, the workflow commits the new snapshot and redeploys the site to GitHub Pages. If nothing has changed, no commit is made.
 
### Front end
 
The site is entirely static — no server, no database, no build step. It is a single HTML page (`index.html`) with a CSS stylesheet (`styles.css`) and a JavaScript file (`scripts.js`).
 
On load, the page fetches `snapshot_index.json` to discover available dates, loads the latest snapshot, then loads the Natural Earth 10m world polygon GeoJSON (`data/world_10m.json`) and renders it with [Leaflet.js](https://leafletjs.com/). Each country polygon is coloured by matching its ISO 3166-1 alpha-2 code against the snapshot data.
 
Country detail data (flag, capital, population, languages) is fetched on demand from the [REST Countries API](https://restcountries.com/). The Wikipedia summary extract is fetched on demand from the [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/). Both are cached in memory for the session.
 
### Advisory zone maps
 
For countries where the FCDO publishes a PDF briefing map showing specific zones (`has_pdf: true` in the snapshot), the scraper downloads and converts the PDF to a JPEG image, which is stored in `data/maps/` and displayed in the country detail panel.
 
---
 
## Repository Structure
 
```
├── index.html                  # Main page
├── styles.css                  # Stylesheet
├── scripts.js                  # Front-end JavaScript
├── scripts/
│   ├── scraper.js              # Daily GOV.UK scraper
│   ├── smart_extract.js        # PDF advisory map extractor
│   └── update_maps.js          # Checks for changed countries and re-extracts maps
├── data/
│   ├── world_10m.json          # Natural Earth 10m country polygons
│   ├── country_list.json       # ISO2 ↔ slug mapping used by the scraper
│   ├── snapshot_today.json     # Latest snapshot (symlink / copy)
│   ├── snapshot_index.json     # Index of all available snapshot dates
│   ├── snapshots/              # Daily snapshot archive
│   │   └── snapshot_YYYY-MM-DD.json
│   └── maps/                   # FCDO advisory zone images
│       └── {ISO2}_{date}.jpg
└── .github/
    └── workflows/
        └── daily_scrape.yml    # GitHub Actions cron job
```
 
---
 
## Snapshot Format
 
Each daily snapshot is a JSON file with the following structure:
 
```json
{
  "date": "2026-04-01",
  "generated_at": "2026-04-01T06:35:12Z",
  "source": "FCDO Foreign Travel Advice",
  "countries": {
    "IL": {
      "status": "some_parts",
      "name": "Israel",
      "slug": "israel",
      "has_pdf": true,
      "pdf_url": "https://assets.publishing.service.gov.uk/...",
      "updated_at": "2026-03-28T10:00:00Z"
    },
    "FR": {
      "status": null,
      "name": "France",
      "slug": "france",
      "has_pdf": false,
      "updated_at": "2026-02-18T11:39:22Z"
    }
  }
}
```
 
`status` is one of `"avoid_all"`, `"avoid_all_but_essential"`, `"some_parts"`, or `null` (no specific warning).
 
---
 
## Running Locally
 
The front end requires files to be served over HTTP — opening `index.html` directly from the filesystem will not work due to browser fetch restrictions.
 
```bash
# Using Node.js
npx serve .
```
 
Then open `http://localhost:3000` (or whichever port is shown).
 
To run the scraper manually:
 
```bash
npm install
node scripts/scraper.js
```
 
---
 
## Tech Stack
 
| Component | Technology |
|-----------|------------|
| Map rendering | [Leaflet.js](https://leafletjs.com/) |
| Base map tiles | [CartoDB Dark Matter](https://carto.com/basemaps/) (free, no API key) |
| Country polygons | [Natural Earth 10m](https://www.naturalearthdata.com/) |
| Advisory data | [GOV.UK Content API](https://content-api.publishing.service.gov.uk/) |
| Country facts | [REST Countries API](https://restcountries.com/) |
| Country summaries | [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) |
| Hosting | [GitHub Pages](https://pages.github.com/) |
| Automation | [GitHub Actions](https://github.com/features/actions) |
| Fonts | [Google Fonts](https://fonts.google.com/) — Syne + DM Mono |
 
---
 
## Data Sources & Licences
 
- **FCDO travel advice** — Crown Copyright, published under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
- **Natural Earth** — Public domain
- **REST Countries** — [Mozilla Public Licence 2.0](https://restcountries.com/)
- **Wikipedia extracts** — [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

---

## Possible improvements to come

- [ ] Functionality review
- [ ] Refactor the code
- [ ] Rewrite the Readme
- [ ] Integrate with GDELT data depicting conflicts
