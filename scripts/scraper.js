#!/usr/bin/env node
/**
 * FCDO Travel Advisory Scraper
 * Fetches advisory levels for all countries from the GOV.UK Content API
 * and writes a daily snapshot JSON file.
 *
 * Usage:
 *   node scraper.js                        # writes data/snapshots/snapshot_YYYY-MM-DD.json
 *   node scraper.js --date 2026-01-15      # write snapshot for a specific date label
 *   node scraper.js --out ./my-output.json # custom output path
 *   node scraper.js --dry-run              # fetch + print, don't write
 *
 * Output format matches the project data model:
 * {
 *   "date": "2026-03-05",
 *   "generated_at": "2026-03-05T08:00:00Z",
 *   "source": "FCDO Foreign Travel Advice",
 *   "countries": {
 *     "IL": { "status": "avoid_all", "name": "Israel", "slug": "israel", "has_pdf": true, "updated_at": "..." },
 *     ...
 *   }
 * }
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GOV_UK_INDEX = "https://www.gov.uk/api/content/foreign-travel-advice";
const GOV_UK_COUNTRY = (slug) =>
  `https://www.gov.uk/api/content/foreign-travel-advice/${slug}`;

// How many country pages to fetch in parallel.
// GOV.UK has no documented rate limit, but be polite.
const CONCURRENCY = 8;

// Delay (ms) between batches — keeps us well within GOV.UK's comfort zone
const BATCH_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// alert_status → our status enum
// ---------------------------------------------------------------------------

/**
 * Maps FCDO alert_status array to our four-value enum.
 *
 * FCDO publishes these known values (from live observation):
 *   "avoid_all_travel_to_whole_country"
 *   "avoid_all_travel_to_parts_of_country"
 *   "avoid_all_but_essential_travel_to_whole_country"
 *   "avoid_all_but_essential_travel_to_parts_of_country"
 *
 * Priority order (highest wins): avoid_all > avoid_essential > some_parts > null
 */
function mapAlertStatus(alertStatusArray) {
  if (!Array.isArray(alertStatusArray) || alertStatusArray.length === 0) {
    return null;
  }

  const statuses = alertStatusArray.map((s) => s.toLowerCase());

  const hasWhole = (keyword) =>
    statuses.some((s) => s.includes(keyword) && s.includes("whole_country"));
  const hasParts = (keyword) =>
    statuses.some((s) => s.includes(keyword) && s.includes("parts"));

  if (hasWhole("avoid_all_travel") || statuses.some((s) => s === "avoid_all_travel_to_whole_country")) {
    return "avoid_all";
  }

  if (hasWhole("avoid_all_but_essential") || statuses.some((s) => s === "avoid_all_but_essential_travel_to_whole_country")) {
    // Could still have parts-level alerts too — whole-country takes precedence
    return "avoid_all_but_essential";
  }

  // Parts-level alerts: whole-country not flagged, but parts are
  const hasPartAvoidAll = hasParts("avoid_all_travel");
  const hasPartAvoidEssential = hasParts("avoid_all_but_essential");

  if (hasPartAvoidAll || hasPartAvoidEssential) {
    return "some_parts";
  }

  // Catch-all for any other alert_status values we haven't mapped
  if (statuses.length > 0 && !statuses.every((s) => s === "")) {
    console.warn(`  ⚠ Unknown alert_status values: ${statuses.join(", ")}`);
    return "some_parts"; // conservative fallback
  }

  return null;
}

// ---------------------------------------------------------------------------
// ISO2 lookup — slug → ISO2 code
// Loaded from country_list.json if present, otherwise we build a best-effort
// map from the index response (slug-based, no ISO2).
// ---------------------------------------------------------------------------

let slugToIso2 = {};

function loadCountryList() {
  const candidates = [
    "./country_list.json",
    "./data/country_list.json",
    path.join(path.dirname(fileURLToPath(import.meta.url)), "country_list.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const list = JSON.parse(fs.readFileSync(p, "utf8"));
        // Support both array and object forms
        if (Array.isArray(list)) {
          list.forEach(({ iso2, slug }) => {
            if (iso2 && slug) slugToIso2[slug] = iso2.toUpperCase();
          });
        } else if (typeof list === "object") {
          Object.entries(list).forEach(([iso2, entry]) => {
            const slug = entry.slug || entry;
            if (slug) slugToIso2[slug] = iso2.toUpperCase();
          });
        }
        console.log(`📋 Loaded ${Object.keys(slugToIso2).length} slug→ISO2 mappings from ${p}`);
        return;
      } catch (e) {
        console.warn(`  Could not parse ${p}: ${e.message}`);
      }
    }
  }
  console.warn("⚠ No country_list.json found — ISO2 codes will be derived from slugs (less reliable)");
}

// Fallback: uppercase the slug as a placeholder key
function slugToKey(slug) {
  return slugToIso2[slug] || slug.toUpperCase().replace(/-/g, "_");
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchJson(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "FCDO-Map-Scraper/1.0 (github.com/your-org/fcdo-map)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = attempt * 1000;
      console.warn(`  Retry ${attempt}/${retries} for ${url} (${err.message}) — waiting ${delay}ms`);
      await sleep(delay);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Batch concurrency helper
// ---------------------------------------------------------------------------

async function runInBatches(items, batchSize, fn, delayMs = 0) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main scrape logic
// ---------------------------------------------------------------------------

async function fetchIndex() {
  console.log("🌍 Fetching country index from GOV.UK…");
  const data = await fetchJson(GOV_UK_INDEX);
  const children = data?.links?.children ?? [];
  if (children.length === 0) throw new Error("Index returned no children — check the API response");
  console.log(`   Found ${children.length} countries in index`);
  return children.map((c) => ({
    slug: c.details?.country?.slug ?? c.base_path.replace("/foreign-travel-advice/", ""),
    name: c.details?.country?.name ?? c.title?.replace(" travel advice", "") ?? "Unknown",
  }));
}

async function fetchCountry(slug, name) {
  try {
    const data = await fetchJson(GOV_UK_COUNTRY(slug));
    const details = data?.details ?? {};

    const alertStatus = details.alert_status ?? [];
    const status = mapAlertStatus(alertStatus);

    // PDF: look for details.image.url (the briefing map PDF)
    const pdfUrl = details.image?.url ?? null;
    const hasPdf = Boolean(pdfUrl);

    const updatedAt = data.public_updated_at ?? null;

    return {
      slug,
      name: details.country?.name ?? name,
      status,
      has_pdf: hasPdf,
      pdf_url: pdfUrl,
      updated_at: updatedAt,
      raw_alert_status: alertStatus, // keep raw for debugging
    };
  } catch (err) {
    console.error(`  ❌ Failed to fetch ${slug}: ${err.message}`);
    return {
      slug,
      name,
      status: null,
      has_pdf: false,
      pdf_url: null,
      updated_at: null,
      error: err.message,
    };
  }
}

async function scrape() {
  // Parse CLI args
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dateArg = args[args.indexOf("--date") + 1];
  const outArg = args[args.indexOf("--out") + 1];

  const today = dateArg ?? new Date().toISOString().slice(0, 10);
  const generatedAt = new Date().toISOString();

  loadCountryList();

  // Step 1: get full country list
  const countries = await fetchIndex();

  // Step 2: fetch each country page in batches
  console.log(`\n🔍 Fetching advisory data for ${countries.length} countries (${CONCURRENCY} at a time)…`);

  let done = 0;
  const countryData = await runInBatches(
    countries,
    CONCURRENCY,
    async ({ slug, name }) => {
      const result = await fetchCountry(slug, name);
      done++;
      const icon = result.status === "avoid_all" ? "🔴"
        : result.status === "avoid_all_but_essential" ? "🟠"
        : result.status === "some_parts" ? "🟡"
        : result.error ? "❌"
        : "🟢";
      process.stdout.write(`\r   ${done}/${countries.length} — ${icon} ${slug.padEnd(35)}`);
      return result;
    },
    BATCH_DELAY_MS
  );
  console.log("\n");

  // Step 3: build output object
  const snapshot = {
    date: today,
    generated_at: generatedAt,
    source: "FCDO Foreign Travel Advice",
    countries: {},
  };

  let stats = { avoid_all: 0, avoid_all_but_essential: 0, some_parts: 0, null: 0, error: 0 };

  for (const c of countryData) {
    const key = slugToKey(c.slug);
    snapshot.countries[key] = {
      status: c.status,
      name: c.name,
      slug: c.slug,
      has_pdf: c.has_pdf,
      ...(c.pdf_url && { pdf_url: c.pdf_url }),
      ...(c.updated_at && { updated_at: c.updated_at }),
      ...(c.error && { error: c.error }),
    };
    if (c.error) stats.error++;
    else stats[c.status ?? "null"]++;
  }

  // Step 4: print summary
  console.log("📊 Summary:");
  console.log(`   🔴 Avoid all travel:              ${stats.avoid_all}`);
  console.log(`   🟠 Avoid all but essential:       ${stats.avoid_all_but_essential}`);
  console.log(`   🟡 Some parts (PDF maps):         ${stats.some_parts}`);
  console.log(`   🟢 See advice / no warning:       ${stats.null}`);
  console.log(`   ❌ Errors:                        ${stats.error}`);
  console.log(`   Total:                            ${countryData.length}`);

  const hasPdfCount = countryData.filter((c) => c.has_pdf).length;
  console.log(`\n   📄 Countries with PDF briefing maps: ${hasPdfCount}`);

  if (dryRun) {
    console.log("\n🧪 Dry run — not writing output.");
    console.log(JSON.stringify(snapshot, null, 2).slice(0, 2000) + "\n  … (truncated)");
    return;
  }

  // Step 5: write output
  let outputPath;
  if (outArg) {
    outputPath = outArg;
  } else {
    const dir = "./data/snapshots";
    fs.mkdirSync(dir, { recursive: true });
    outputPath = path.join(dir, `snapshot_${today}.json`);
  }

  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), "utf8");
  console.log(`\n✅ Written to ${outputPath}`);

  // Also write/overwrite snapshot_today.json for easy access by the map
  const todayPath = "./data/snapshot_today.json";
  fs.writeFileSync(todayPath, JSON.stringify(snapshot, null, 2), "utf8");
  console.log(`✅ Also written to ${todayPath}`);
}

scrape().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
