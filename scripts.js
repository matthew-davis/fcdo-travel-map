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
 
// ── Load snapshot then GeoJSON ────────────────────────────────────────
let countryLayer = null;
let currentSnapshot = null;
 
fetch('data/snapshot_today.json')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} loading snapshot`);
    return r.json();
  })
  .then(snapshot => {
    currentSnapshot = snapshot;
 
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
        layer._advisory = advisory;
        layer._name = name;
 
        layer.on({
          click() {
            showInfoPanel(name, iso2, advisory);
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
 
function showInfoPanel(countryName, iso2, advisory) {
  const panel    = document.getElementById('info-panel');
  const nameEl   = document.getElementById('info-country-name');
  const badgeEl  = document.getElementById('info-status-badge');
  const descEl   = document.getElementById('info-description');
  const linkEl   = document.getElementById('info-link');
 
  nameEl.textContent = countryName;
 
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
