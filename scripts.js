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
  avoid_all:              '#e53e3e',  // red
  avoid_all_but_essential: '#dd6b20',  // orange
  some_parts:             '#d69e2e',  // yellow
  null:                   '#2d8a5e',  // green (see travel advice / no warning)
  unknown:                '#1e2a3d',  // neutral grey (no data)
};

// ── Country styles ────────────────────────────────────────────────────
const HOVER_STYLE = {
  fillOpacity: 1,
  weight: 1.5,
  color: '#3b7dd8',
  opacity: 1,
};

// ── Sample snapshot data ──────────────────────────────────────────────
// This will be replaced by loading data/snapshot_today.json in Step 4
const SAMPLE_SNAPSHOT = {
  date: '2026-03-30',
  generated_at: '2026-03-30T08:00:00Z',
  source: 'FCDO Foreign Travel Advice',
  countries: {
    // Avoid all travel (red)
    IL: { status: 'avoid_all', name: 'Israel', slug: 'israel', has_pdf: true },
    LY: { status: 'avoid_all', name: 'Libya', slug: 'libya', has_pdf: true },
    SY: { status: 'avoid_all', name: 'Syria', slug: 'syria', has_pdf: false },
    YE: { status: 'avoid_all', name: 'Yemen', slug: 'yemen', has_pdf: true },
    AF: { status: 'avoid_all', name: 'Afghanistan', slug: 'afghanistan', has_pdf: false },
    SO: { status: 'avoid_all', name: 'Somalia', slug: 'somalia', has_pdf: true },

    // Avoid all but essential (orange)
    IR: { status: 'avoid_all_but_essential', name: 'Iran', slug: 'iran', has_pdf: false },
    SD: { status: 'avoid_all_but_essential', name: 'Sudan', slug: 'sudan', has_pdf: true },
    IQ: { status: 'avoid_all_but_essential', name: 'Iraq', slug: 'iraq', has_pdf: true },

    // Some parts (yellow - mixed advisory)
    UA: { status: 'some_parts', name: 'Ukraine', slug: 'ukraine', has_pdf: true },
    PK: { status: 'some_parts', name: 'Pakistan', slug: 'pakistan', has_pdf: true },
    EG: { status: 'some_parts', name: 'Egypt', slug: 'egypt', has_pdf: true },
    IN: { status: 'some_parts', name: 'India', slug: 'india', has_pdf: true },
    PH: { status: 'some_parts', name: 'Philippines', slug: 'philippines', has_pdf: true },
    NG: { status: 'some_parts', name: 'Nigeria', slug: 'nigeria', has_pdf: true },

    // No warning / see travel advice (green)
    FR: { status: null, name: 'France', slug: 'france', has_pdf: false },
    ES: { status: null, name: 'Spain', slug: 'spain', has_pdf: false },
    DE: { status: null, name: 'Germany', slug: 'germany', has_pdf: false },
    US: { status: null, name: 'USA', slug: 'usa', has_pdf: false },
    JP: { status: null, name: 'Japan', slug: 'japan', has_pdf: false },
    AU: { status: null, name: 'Australia', slug: 'australia', has_pdf: false },
    GB: { status: null, name: 'United Kingdom', slug: 'uk', has_pdf: false },
    CA: { status: null, name: 'Canada', slug: 'canada', has_pdf: false },
    NZ: { status: null, name: 'New Zealand', slug: 'new-zealand', has_pdf: false },
    IT: { status: null, name: 'Italy', slug: 'italy', has_pdf: false },
  }
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

// ── Load GeoJSON and apply snapshot colours ───────────────────────────
let countryLayer = null;
let currentSnapshot = SAMPLE_SNAPSHOT;

fetch('data/world_10m.json')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
          const statusLabel = advisory.status === 'avoid_all' ? '🔴 Avoid all travel'
            : advisory.status === 'avoid_all_but_essential' ? '🟠 Avoid all but essential'
              : advisory.status === 'some_parts' ? '🟡 Some parts'
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
          click(e) {
            showInfoPanel(name, iso2, advisory);
          },
          mouseover(e) {
            const currentStyle = getCountryStyle(feature, currentSnapshot);
            e.target.setStyle({
              ...currentStyle,
              ...HOVER_STYLE,
            });
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

    // Count countries by tier
    const tierCounts = {
      avoid_all: 0,
      avoid_all_but_essential: 0,
      some_parts: 0,
      null: 0,
      unknown: 0,
    };

    geojson.features.forEach(feature => {
      const iso2 = getISO2FromFeature(feature);
      const advisory = currentSnapshot.countries[iso2];
      const status = advisory ? (advisory.status ?? 'null') : 'unknown';
      tierCounts[status]++;
    });

    // Hide loading overlay
    document.getElementById('loading').classList.add('hidden');

    // Update status indicator
    const statusEl = document.querySelector('.header-status');
    statusEl.innerHTML = `
      <span class="status-dot" style="background:#2d8a5e;box-shadow:0 0 6px #2d8a5e"></span>
      ${count} countries coloured
    `;

    // Update header meta
    document.querySelector('.header-meta').textContent =
      `Step 2 — Snapshot: ${currentSnapshot.date}`;
  })
  .catch(err => {
    console.error('Failed to load world_10m.json:', err);

    document.getElementById('loading').innerHTML = `
      <div style="text-align:center;padding:24px">
        <div style="font-size:13px;color:#e53e3e;margin-bottom:8px;font-weight:700">
          Could not load world_10m.json
        </div>
        <div style="font-size:11px;color:#4a5568;font-family:'DM Mono',monospace">
          Serve this file from <code>data/world_10m.json</code><br/>
          or run via a local HTTP server.
        </div>
      </div>
    `;

    document.querySelector('.header-status').innerHTML = `
      <span class="status-dot" style="background:#e53e3e;box-shadow:0 0 6px #e53e3e;animation:none"></span>
      GeoJSON load failed
    `;
  });

// ── Info panel functions ──────────────────────────────────────────────

function showInfoPanel(countryName, iso2, advisory) {
  const panel = document.getElementById('info-panel');
  const nameEl = document.getElementById('info-country-name');
  const badgeEl = document.getElementById('info-status-badge');
  const descEl = document.getElementById('info-description');
  const linkEl = document.getElementById('info-link');

  // Set country name
  nameEl.textContent = countryName;

  // Set status badge
  if (!advisory) {
    badgeEl.textContent = 'No advisory data';
    badgeEl.className = 'status-badge no-data';
    descEl.textContent = 'This country is not currently in the FCDO travel advice index.';
    linkEl.classList.add('hidden');
  } else {
    const status = advisory.status;

    // Set badge text and style
    let badgeText = '';
    let badgeClass = 'status-badge ';
    let description = '';

    switch (status) {
      case 'avoid_all':
        badgeText = '🔴 Avoid all travel';
        badgeClass += 'avoid-all';
        description = 'The FCDO advises against all travel to this country.';
        break;
      case 'avoid_all_but_essential':
        badgeText = '🟠 Avoid all but essential travel';
        badgeClass += 'avoid-essential';
        description = 'The FCDO advises against all but essential travel to this country.';
        break;
      case 'some_parts':
        badgeText = '🟡 Mixed advisory (some parts)';
        badgeClass += 'some-parts';
        description = 'The FCDO advises against travel to some parts of this country. Check the full advice for regional details.';
        if (advisory.has_pdf) {
          description += ' A PDF briefing map with zones is available.';
        }
        break;
      case null:
      default:
        badgeText = '🟢 See travel advice';
        badgeClass += 'no-warning';
        description = 'No specific FCDO warning. See the full travel advice for guidance on safety, health, and local laws.';
        break;
    }

    badgeEl.textContent = badgeText;
    badgeEl.className = badgeClass;
    descEl.textContent = description;

    // Set GOV.UK link
    linkEl.href = `https://www.gov.uk/foreign-travel-advice/${advisory.slug}`;
    linkEl.classList.remove('hidden');
  }

  // Show panel
  panel.classList.remove('panel-hidden');
}

function closeInfoPanel() {
  document.getElementById('info-panel').classList.add('panel-hidden');
}

// Wire up close button
document.getElementById('close-panel').addEventListener('click', closeInfoPanel);

// Close panel when clicking the map background
map.on('click', (e) => {
  // Only close if clicking the map itself, not a country
  if (!e.originalEvent.target.closest('.leaflet-interactive')) {
    closeInfoPanel();
  }
});
