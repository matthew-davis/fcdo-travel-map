#!/usr/bin/env node
import fs from "fs";
import path from "path";
 
const GOV_UK_INDEX = "https://www.gov.uk/api/content/foreign-travel-advice";
const GOV_UK_COUNTRY = (slug) =>
  `https://www.gov.uk/api/content/foreign-travel-advice/${slug}`;
const CONCURRENCY = 8;
const BATCH_DELAY_MS = 500;
 
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
    return "avoid_all_but_essential";
  }
 
  const hasPartAvoidAll = hasParts("avoid_all_travel");
  const hasPartAvoidEssential = hasParts("avoid_all_but_essential");
 
  if (hasPartAvoidAll || hasPartAvoidEssential) {
    return "some_parts";
  }
 
  if (statuses.length > 0 && !statuses.every((s) => s === "")) {
    console.warn(`  ⚠ Unknown alert_status values: ${statuses.join(", ")}`);
    return "some_parts";
  }
 
  return null;
}

let slugToIso2 = {};
 
function loadCountryList() {
  const countryListPath = "./data/country_list.json";
  
  if (!fs.existsSync(countryListPath)) {
    console.warn("⚠ country_list.json not found in ./data/ — ISO2 codes will be derived from slugs (less reliable)");
    return;
  }
  
  try {
    const list = JSON.parse(fs.readFileSync(countryListPath, "utf8"));
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
  } catch (e) {
    console.warn(`  Could not parse ${countryListPath}: ${e.message}`);
  }
}

function slugToKey(slug) {
  return slugToIso2[slug] || slug.toUpperCase().replace(/-/g, "_");
}

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

const SNAPSHOT_INDEX_PATH = "./data/snapshot_index.json";

function readSnapshotIndex() {
  if (fs.existsSync(SNAPSHOT_INDEX_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SNAPSHOT_INDEX_PATH, "utf8"));
    } catch (e) {
      console.warn(`  ⚠ Could not parse snapshot_index.json: ${e.message} — will recreate`);
    }
  }
  return { dates: [], latest: null };
}

function updateSnapshotIndex(date) {
  const index = readSnapshotIndex();
 
  if (!index.dates.includes(date)) {
    index.dates.push(date);
  }
 
  index.dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  index.latest = index.dates[0];
 
  fs.writeFileSync(SNAPSHOT_INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
}

async function fetchIndex() {
  const data = await fetchJson(GOV_UK_INDEX);
  const children = data?.links?.children ?? [];
  if (children.length === 0) throw new Error("Index returned no children — check the API response");
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
      raw_alert_status: alertStatus,
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
  const args = process.argv.slice(2);
  const dateArg = args[args.indexOf("--date") + 1];
  const outArg = args[args.indexOf("--out") + 1];
 
  const today = dateArg ?? new Date().toISOString().slice(0, 10);
  const generatedAt = new Date().toISOString();
 
  loadCountryList();
 
  const countries = await fetchIndex();
 
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
 
  let previousSnapshot = null;
  const todayPath = "./data/snapshot_today.json";
  
  if (fs.existsSync(todayPath)) {
    try {
      previousSnapshot = JSON.parse(fs.readFileSync(todayPath, "utf8"));
    } catch (e) {
      console.warn(`  ⚠ Could not load previous snapshot: ${e.message}`);
    }
  }

  const changedCountries = [];
  let hasChanges = false;
  
  if (previousSnapshot) {
    for (const [key, newData] of Object.entries(snapshot.countries)) {
      const oldData = previousSnapshot.countries[key];
      
      if (!oldData) {
        changedCountries.push({ iso2: key, reason: 'new country' });
        hasChanges = true;
      } else if (oldData.status !== newData.status) {
        changedCountries.push({ 
          iso2: key, 
          reason: 'status changed',
          from: oldData.status,
          to: newData.status
        });
        hasChanges = true;
      } else if (oldData.updated_at !== newData.updated_at) {
        changedCountries.push({ 
          iso2: key, 
          reason: 'FCDO page updated'
        });
        hasChanges = true;
      }
    }
    
    for (const key of Object.keys(previousSnapshot.countries)) {
      if (!snapshot.countries[key]) {
        changedCountries.push({ iso2: key, reason: 'country removed' });
        hasChanges = true;
      }
    }
  } else {
    hasChanges = true;
  }
 
  fs.writeFileSync(todayPath, JSON.stringify(snapshot, null, 2), "utf8");
 
  if (hasChanges) {
    const dir = "./data/snapshots";
    fs.mkdirSync(dir, { recursive: true });
    const datedPath = path.join(dir, `snapshot_${today}.json`);
    
    if (!outArg) {
      fs.writeFileSync(datedPath, JSON.stringify(snapshot, null, 2), "utf8");
      updateSnapshotIndex(today);
    } else {
      fs.writeFileSync(outArg, JSON.stringify(snapshot, null, 2), "utf8");
    }
  }
}
 
scrape().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
