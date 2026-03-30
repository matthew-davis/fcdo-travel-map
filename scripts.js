// ── Map init ─────────────────────────────────────────────────────────
const map = L.map('map', {
  center: [20, 10],
  zoom: 3,
  minZoom: 2,
  maxZoom: 10,
  zoomControl: true,
  attributionControl: true,
});
 
requestAnimationFrame(() => map.invalidateSize());
 
// No tile layer — we'll just show our colored country polygons on the dark background
 
// ── Advisory tier colours ─────────────────────────────────────────────
const TIER_COLORS = {
  avoid_all:               '#e53e3e',  // red
  avoid_all_but_essential: '#dd6b20',  // orange
  some_parts:              '#d69e2e',  // yellow
  null:                    '#2d8a5e',  // green (see travel advice / no warning)
  unknown:                 '#1e2a3d',  // neutral grey (no data)
};
 
// Advisory tier numeric rank — higher = more severe
const TIER_RANK = {
  avoid_all:               3,
  avoid_all_but_essential: 2,
  some_parts:              1,
  null:                    0,
};
 
// ── Country styles ────────────────────────────────────────────────────
const HOVER_STYLE = {
  fillOpacity: 1,
  weight: 1.5,
  color: '#3b7dd8',
  opacity: 1,
};
 
// ── Helper: get colour for a country ──────────────────────────────────
function getCountryColor(iso2Code, snapshot) {
  const advisory = snapshot.countries[iso2Code];
  if (!advisory) return TIER_COLORS.unknown;
 
  const status = advisory.status ?? 'null';
  return TIER_COLORS[status] || TIER_COLORS.unknown;
}
 
// ── Helper: match GeoJSON property to ISO2 ────────────────────────────
function getISO2FromFeature(feature) {
  const props = feature.properties;
 
  // Try standard ISO code properties (Natural Earth typically uses ISO_A2)
  return props.ISO_A2
    || props.iso_a2
    || props.ISO2
    || props.iso2
    || props.ADM0_A3?.slice(0, 2)  // fallback to first 2 chars of ISO3
    || null;
}
 
// ── Helper: style function for GeoJSON layer ──────────────────────────
function getCountryStyle(feature, snapshot) {
  const iso2 = getISO2FromFeature(feature);
  const fillColor = getCountryColor(iso2, snapshot);
 
  return {
    fillColor,
    fillOpacity: 0.9,
    color: '#1e2535',      // visible border between countries
    weight: 0.8,
    opacity: 0.5,
  };
}
 
// ── State ─────────────────────────────────────────────────────────────
let countryLayer    = null;
let currentSnapshot = null;
let snapshotDates   = [];    // descending: [newest, ..., oldest]
let currentIndex    = 0;     // index into snapshotDates; 0 = newest
 
// Cache for already-fetched snapshots — keyed by date string
const snapshotCache = new Map();
 
// ── Snapshot fetching ─────────────────────────────────────────────────
 
async function loadSnapshot(date) {
  if (snapshotCache.has(date)) return snapshotCache.get(date);
 
  const path = date === snapshotDates[0]
    ? 'data/snapshot_today.json'
    : `data/snapshots/snapshot_${date}.json`;
 
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading snapshot for ${date}`);
  const snap = await res.json();
  snapshotCache.set(date, snap);
  return snap;
}
 
// ── Apply a snapshot to the map ───────────────────────────────────────
 
function applySnapshot(snapshot) {
  currentSnapshot = snapshot;
  if (countryLayer) {
    countryLayer.setStyle((feature) => getCountryStyle(feature, snapshot));
  }
  updateSliderDateLabel();
}
 
// ── Slider UI helpers ─────────────────────────────────────────────────
 
function updateSliderDateLabel() {
  const date = snapshotDates[currentIndex];
  if (!date) return;
 
  const label = document.getElementById('slider-date-label');
  const isLatest = currentIndex === 0;
 
  // Format date nicely: "30 Mar 2026"
  const [y, m, d] = date.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const formatted = `${parseInt(d, 10)} ${months[parseInt(m,10)-1]} ${y}`;
 
  label.textContent = isLatest ? `${formatted} (latest)` : formatted;
  label.classList.toggle('is-latest', isLatest);
}
 
function buildSlider() {
  const slider = document.getElementById('date-slider');
  if (!slider || snapshotDates.length < 2) {
    // Only one snapshot — hide the entire strip
    document.getElementById('slider-strip').classList.add('hidden');
    return;
  }
 
  slider.min   = 0;
  slider.max   = snapshotDates.length - 1;
  slider.value = 0;
 
  // Show date range endpoints
  const oldest = snapshotDates[snapshotDates.length - 1];
  const newest = snapshotDates[0];
  const [oy, om, od] = oldest.split('-');
  const [ny, nm, nd] = newest.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('slider-oldest').textContent =
    `${parseInt(od,10)} ${months[parseInt(om,10)-1]} ${oy}`;
  document.getElementById('slider-newest').textContent =
    `${parseInt(nd,10)} ${months[parseInt(nm,10)-1]} ${ny}`;
 
  updateSliderDateLabel();
 
  slider.addEventListener('input', async () => {
    const idx = parseInt(slider.value, 10);
    currentIndex = idx;
    const date = snapshotDates[idx];
 
    // Show loading state on label
    document.getElementById('slider-date-label').textContent = 'Loading…';
 
    try {
      const snap = await loadSnapshot(date);
      applySnapshot(snap);
    } catch (err) {
      console.error('Failed to load snapshot:', err);
      document.getElementById('slider-date-label').textContent = 'Load failed';
    }
  });
}
 
// ── Load snapshot index then GeoJSON ─────────────────────────────────
 
fetch('data/snapshot_index.json')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} loading snapshot index`);
    return r.json();
  })
  .then(index => {
    snapshotDates = index.dates; // already sorted descending by scraper
 
    // Update loading label
    document.querySelector('.loader-label').textContent = 'Loading advisory data…';
 
    return loadSnapshot(snapshotDates[0]);
  })
  .then(snapshot => {
    currentSnapshot = snapshot;
    snapshotCache.set(snapshotDates[0], snapshot);
 
    // Update loading label
    document.querySelector('.loader-label').textContent = 'Loading world polygons…';
 
    return fetch('data/world_10m.json');
  })
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} loading world polygons`);
    return r.json();
  })
  .then(geojson => {
    countryLayer = L.geoJSON(geojson, {
      style: (feature) => getCountryStyle(feature, currentSnapshot),
 
      onEachFeature(feature, layer) {
        const name = feature.properties?.name
          || feature.properties?.NAME
          || feature.properties?.ADMIN
          || 'Unknown';
 
        const iso2 = getISO2FromFeature(feature);
        const advisory = currentSnapshot.countries[iso2];
 
        // Build tooltip text
        let tooltipText = name;
        if (advisory) {
          const statusLabel = advisory.status === 'avoid_all'              ? '🔴 Avoid all travel'
            : advisory.status === 'avoid_all_but_essential'                ? '🟠 Avoid all but essential'
            : advisory.status === 'some_parts'                             ? '🟡 Some parts'
            : '🟢 See travel advice';
          tooltipText = `${name}<br/><span style="font-size:10px;color:#9ca3af">${statusLabel}</span>`;
        }
 
        layer.bindTooltip(tooltipText, {
          className: 'country-tooltip',
          sticky: true,
          offset: [10, 0],
        });
 
        // Store ISO2 for hover restoration
        layer._iso2 = iso2;
        layer._name = name;
 
        layer.on({
          click() {
            // Read advisory from *current* snapshot at click time (may have changed via slider)
            const liveAdvisory = currentSnapshot.countries[iso2];
            showInfoPanel(name, iso2, liveAdvisory);
          },
          mouseover(e) {
            const currentStyle = getCountryStyle(feature, currentSnapshot);
            e.target.setStyle({ ...currentStyle, ...HOVER_STYLE });
            e.target.bringToFront();
          },
          mouseout(e) {
            countryLayer.resetStyle(e.target);
          },
        });
      },
    }).addTo(map);
 
    // Count features
    const count = geojson.features?.length ?? 0;
    document.getElementById('count-num').textContent = count;
 
    // Hide loading overlay
    document.getElementById('loading').classList.add('hidden');
 
    // Update status indicator
    const statusEl = document.querySelector('.header-status');
    statusEl.innerHTML = `
      <span class="status-dot" style="background:#2d8a5e;box-shadow:0 0 6px #2d8a5e"></span>
      ${count} countries coloured
    `;
 
    // Update header meta with real snapshot date
    document.querySelector('.header-meta').textContent =
      `Snapshot: ${currentSnapshot.date}`;
 
    // Build time slider now that we know how many dates exist
    buildSlider();
  })
  .catch(err => {
    console.error('Load failed:', err);
 
    document.getElementById('loading').innerHTML = `
      <div style="text-align:center;padding:24px">
        <div style="font-size:13px;color:#e53e3e;margin-bottom:8px;font-weight:700">
          ${err.message}
        </div>
        <div style="font-size:11px;color:#4a5568;font-family:'DM Mono',monospace">
          Serve files via a local HTTP server.<br/>
          <code>npx serve .</code> or <code>python3 -m http.server</code>
        </div>
      </div>
    `;
 
    document.querySelector('.header-status').innerHTML = `
      <span class="status-dot" style="background:#e53e3e;box-shadow:0 0 6px #e53e3e;animation:none"></span>
      Load failed
    `;
  });
 
// ── Info panel functions ──────────────────────────────────────────────
 
async function showInfoPanel(countryName, iso2, advisory) {
  const panel    = document.getElementById('info-panel');
  const nameEl   = document.getElementById('info-country-name');
  const badgeEl  = document.getElementById('info-status-badge');
  const descEl   = document.getElementById('info-description');
  const linkEl   = document.getElementById('info-link');
  const deltaEl  = document.getElementById('info-delta-badge');
 
  nameEl.textContent = countryName;
 
  // Clear any previous delta badge
  deltaEl.textContent = '';
  deltaEl.className   = 'delta-badge hidden';
 
  if (!advisory) {
    badgeEl.textContent  = 'No advisory data';
    badgeEl.className    = 'status-badge no-data';
    descEl.textContent   = 'This country is not currently in the FCDO travel advice index.';
    linkEl.classList.add('hidden');
  } else {
    const status = advisory.status;
    let badgeText  = '';
    let badgeClass = 'status-badge ';
    let description = '';
 
    switch (status) {
      case 'avoid_all':
        badgeText   = '🔴 Avoid all travel';
        badgeClass += 'avoid-all';
        description = 'The FCDO advises against all travel to this country.';
        break;
      case 'avoid_all_but_essential':
        badgeText   = '🟠 Avoid all but essential travel';
        badgeClass += 'avoid-essential';
        description = 'The FCDO advises against all but essential travel to this country.';
        break;
      case 'some_parts':
        badgeText   = '🟡 Mixed advisory (some parts)';
        badgeClass += 'some-parts';
        description = 'The FCDO advises against travel to some parts of this country. Check the full advice for regional details.';
        if (advisory.has_pdf) {
          description += ' A PDF briefing map with zones is available.';
        }
        break;
      case null:
      default:
        badgeText   = '🟢 See travel advice';
        badgeClass += 'no-warning';
        description = 'No specific FCDO warning. See the full travel advice for guidance on safety, health, and local laws.';
        break;
    }
 
    badgeEl.textContent = badgeText;
    badgeEl.className   = badgeClass;
    descEl.textContent  = description;
 
    linkEl.href = `https://www.gov.uk/foreign-travel-advice/${advisory.slug}`;
    linkEl.classList.remove('hidden');
 
    // ── Escalation / improvement badge ───────────────────────────────
    // Compare against the previous snapshot in the timeline (if one exists)
    const prevIndex = currentIndex + 1;
    if (iso2 && prevIndex < snapshotDates.length) {
      const prevDate  = snapshotDates[prevIndex];
      const currStatus = advisory.status ?? null;
      const currRank   = TIER_RANK[currStatus] ?? 0;

      try {
        const prevSnap     = await loadSnapshot(prevDate);
        const prevAdvisory = prevSnap.countries[iso2];
        const prevStatus   = prevAdvisory?.status ?? null;
        const prevRank     = TIER_RANK[prevStatus] ?? 0;

        console.log(`delta: curr="${currStatus}" (${currRank}) vs prev="${prevStatus}" (${prevRank})`);

        if (currRank > prevRank) {
          deltaEl.textContent = '▲ Escalated';
          deltaEl.className   = 'delta-badge escalated';
        } else if (currRank < prevRank) {
          deltaEl.textContent = '▼ Improved';
          deltaEl.className   = 'delta-badge improved';
        }
        // Equal ranks — badge stays hidden
      } catch (err) {
        console.error('delta fetch failed:', err);
      }
    }
  }
 
  panel.classList.remove('panel-hidden');
}
 
function closeInfoPanel() {
  document.getElementById('info-panel').classList.add('panel-hidden');
}
 
// Wire up close button
document.getElementById('close-panel').addEventListener('click', closeInfoPanel);
 
// Close panel when clicking the map background
map.on('click', (e) => {
  if (!e.originalEvent.target.closest('.leaflet-interactive')) {
    closeInfoPanel();
  }
});
