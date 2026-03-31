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

// ── Advisory tier colours ─────────────────────────────────────────────
const TIER_COLORS = {
  avoid_all:               '#e53e3e',
  avoid_all_but_essential: '#dd6b20',
  some_parts:              '#d69e2e',
  null:                    '#2d8a5e',
  unknown:                 '#0f1720',  // dark — no advisory data
};

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

function getCountryColor(iso2Code, snapshot) {
  const advisory = snapshot.countries[iso2Code];
  if (!advisory) return TIER_COLORS.unknown;
  const status = advisory.status ?? 'null';
  return TIER_COLORS[status] || TIER_COLORS.unknown;
}

// ── Helper: match GeoJSON property to ISO2 ────────────────────────────
// Natural Earth 10m has a known bug where France, Norway, Kosovo and
// several other countries return ISO_A2 = "-99". We fall back to a
// name-based lookup table for those cases.
const NAME_TO_ISO2 = {
  // ── Natural Earth -99 bug fixes ───────────────────────────────────
  'France':                        'FR',
  'Norway':                        'NO',

  // ── Name mismatches vs what scraper/snapshot expects ─────────────
  'Timor-Leste':                   'TL',   // NE uses hyphenated form
  'East Timor':                    'TL',   // fallback
  'Ivory Coast':                   'CI',
  "Côte d'Ivoire":                 'CI',   // NE uses accented form
  'W. Sahara':                     'EH',
  'Dem. Rep. Congo':               'CD',
  'Congo':                         'CG',
  'Kosovo':                        'XK',
  'N. Cyprus':                     'CY',
  'Northern Cyprus':               'CY',
  'Somaliland':                    'SO',
  'Palestine':                     'PS',
  'Vatican':                       'VA',
  'Micronesia':                    'FM',
  'Faeroe Is.':                    'FO',
  'Åland':                         'AX',

  // ── Taiwan special case — NE stores ISO as "CN-TW" ───────────────
  'Taiwan':                        'TW',

  // ── Territories mapped to parent country below ────────────────────
  'Greenland':                     'GL',
  'Guam':                          'GU',
  'Puerto Rico':                   'PR',
  'Falkland Is.':                  'FK',
  'Falkland Islands':              'FK',
  'S. Geo. and the Is.':           'GS',
  'South Georgia & the Islands':   'GS',
  'Baikonur':                      'BQ_KZ',   // direct remap below
  'St-Martin':                     'MF',
  'Sint Maarten':                  'SX',
  'Curaçao':                       'CW',
  'Aruba':                         'AW',
  'St. Vin. and Gren.':            'VC',
  'St. Kitts and Nevis':           'KN',
  'St-Barthélemy':                 'BL',
  'Turks and Caicos Is.':          'TC',
  'Anguilla':                      'AI',
  'British Virgin Is.':            'VG',
  'Cayman Is.':                    'KY',
  'Bermuda':                       'BM',
  'Montserrat':                    'MS',
  'Pitcairn Is.':                  'PN',
  'Saint Helena':                  'SH',
  'Br. Indian Ocean Ter.':         'IO',
  'Gibraltar':                     'GI',
  'Jersey':                        'JE',
  'Guernsey':                      'GG',
  'Isle of Man':                   'IM',
  'Hong Kong':                     'HK',
  'Macao':                         'MO',
  'Norfolk Island':                'NF',
  'Cook Is.':                      'CK',
  'Niue':                          'NU',
  'Heard I. and McDonald Is.':     'HM',
  'U.S. Minor Outlying Is.':       'UM',

  // ── French territories ────────────────────────────────────────────
  'French Guiana':                 'GF',
  'Martinique':                    'MQ',
  'Guadeloupe':                    'GP',
  'Réunion':                       'RE',
  'Mayotte':                       'YT',
  'Saint Pierre and Miquelon':     'PM',
  'New Caledonia':                 'NC',
  'French Polynesia':              'PF',
  'Wallis and Futuna Is.':         'WF',
  'Clipperton I.':                 'FR',
  'French S. and Antarctic Lands': 'TF',
};

// Snapshot key overrides — the FCDO scraper sometimes stores data under
// a different ISO2 than what Natural Earth resolves to.
// Maps resolved ISO2 → the actual key used in snapshot.countries{}
const ISO2_TO_SNAPSHOT_KEY = {
  // ── Scraper slug-derived key overrides ────────────────────────────
  // These countries weren't matched in country_list.json so the scraper
  // fell back to slugToKey() which uppercases the slug instead of using ISO2
  'CZ': 'CZECHIA',
  'CI': 'COTE_D_IVOIRE',
  'XK': 'KOSOVO',
  'CG': 'CONGO',
  'TL': 'TIMOR_LESTE',
  'GM': 'THE_GAMBIA',
  'EH': 'WESTERN_SAHARA',

  // ── Territory → parent remaps ─────────────────────────────────────
  'AX':    'FI',   // Åland → Finland
  'FO':    'DK',   // Faroe Islands → Denmark
  'HK':    'CN',   // Hong Kong → China
  'MO':    'CN',   // Macao → China
  'NF':    'AU',   // Norfolk Island → Australia
  'CK':    'NZ',   // Cook Islands → New Zealand
  'NU':    'NZ',   // Niue → New Zealand
  'HM':    'AU',   // Heard & McDonald → Australia
  'UM':    'US',   // US Minor Outlying Islands → USA
  'MF':    'FR',   // St Martin (French part) → France
  'BL':    'FR',   // St Barthélemy → France
  'SX':    'NL',   // Sint Maarten → Netherlands
  'CW':    'NL',   // Curaçao → Netherlands
  'AW':    'NL',   // Aruba → Netherlands
  'VA':    null,   // Vatican — no FCDO advisory
  'BQ_KZ': 'KZ',  // Baikonur → Kazakhstan
};

// Territories → parent country snapshot key
const TERRITORY_TO_PARENT_ISO2 = {
  // French territories
  'GF': 'FR',  'MQ': 'FR',  'GP': 'FR',  'RE': 'FR',
  'YT': 'FR',  'PM': 'FR',  'NC': 'FR',  'PF': 'FR',
  'WF': 'FR',  'TF': 'FR',

  // British territories
  'FK': 'GB',  'GS': 'GB',  'SH': 'GB',  'IO': 'GB',
  'PN': 'GB',  'GI': 'GB',  'GG': 'GB',  'JE': 'GB',
  'IM': 'GB',  'TC': 'GB',  'VG': 'GB',  'KY': 'GB',
  'MS': 'GB',  'AI': 'GB',  'BM': 'GB',

  // US territories
  'GU': 'US',  'PR': 'US',  'VI': 'US',  'AS': 'US',  'MP': 'US',

  // Greenland → Denmark
  'GL': 'DK',
};

function getISO2FromFeature(feature) {
  const props = feature.properties;

  // Try standard ISO2 fields
  let iso2 = props.ISO_A2 || props.iso_a2 || props.ISO2 || props.iso2 || null;

  // Natural Earth bug: -99 means the code is missing
  if (!iso2 || iso2 === '-99') {
    iso2 = props.ISO_A2_EH || props.iso_a2_eh || null;
  }

  // Taiwan special case — NE stores it as "CN-TW"
  if (iso2 === 'CN-TW') iso2 = 'TW';

  if (!iso2 || iso2 === '-99') {
    const name = props.NAME || props.name || props.ADMIN || props.admin || '';
    iso2 = NAME_TO_ISO2[name] || null;
  }

  if (!iso2 || iso2 === '-99') return null;

  // Apply territory → parent remapping
  iso2 = TERRITORY_TO_PARENT_ISO2[iso2] || iso2;

  // Apply snapshot key remapping (handles scraper key differences)
  if (iso2 in ISO2_TO_SNAPSHOT_KEY) {
    return ISO2_TO_SNAPSHOT_KEY[iso2]; // may be null for genuinely unadvised territories
  }

  return iso2;
}

function getCountryStyle(feature, snapshot) {
  const iso2 = getISO2FromFeature(feature);
  const fillColor = getCountryColor(iso2, snapshot);
  return {
    fillColor,
    fillOpacity: 0.9,
    color: '#1e2535',
    weight: 0.8,
    opacity: 0.5,
  };
}

function buildTooltipContent(name, iso2, snapshot) {
  const advisory = snapshot?.countries[iso2];
  if (!advisory) return name;
  const statusLabel =
      advisory.status === 'avoid_all'               ? '🔴 Avoid all travel'
    : advisory.status === 'avoid_all_but_essential' ? '🟠 Avoid all but essential'
    : advisory.status === 'some_parts'              ? '🟡 Some parts'
    : '🟢 See travel advice';
  return `${name}<br/><span style="font-size:10px;color:#9ca3af">${statusLabel}</span>`;
}

// ── State ─────────────────────────────────────────────────────────────
let countryLayer    = null;
let graticuleLayer  = null;
let currentSnapshot = null;
let snapshotDates   = [];
let currentIndex    = 0;
const snapshotCache = new Map();

// ── Snapshot loading ──────────────────────────────────────────────────
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

// ── Apply snapshot to map ─────────────────────────────────────────────
function applySnapshot(snapshot) {
  currentSnapshot = snapshot;
  if (countryLayer) {
    countryLayer.eachLayer((layer) => {
      if (layer.feature) {
        layer.setStyle(getCountryStyle(layer.feature, snapshot));
      }
    });
  }
  updateDateLabel();
}

// ── Date label ────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

function updateDateLabel() {
  const date    = snapshotDates[currentIndex];
  if (!date) return;
  const isLatest = currentIndex === 0;
  const labelEl  = document.getElementById('slider-date-label');
  const subEl    = document.getElementById('slider-date-sub');
  labelEl.textContent = formatDate(date);
  labelEl.classList.toggle('is-latest', isLatest);
  subEl.textContent   = isLatest ? 'latest' : 'archived';
}

// ── Header delta indicator ────────────────────────────────────────────
// Compares currentSnapshot against the snapshot one step back in the
// slider (currentIndex + 1). Counts how many countries escalated or
// improved across all four tiers.
async function updateHeaderDelta() {
  const el = document.getElementById('header-delta-text');

  // On the oldest snapshot — nothing to compare against
  const prevIndex = currentIndex + 1;
  if (prevIndex >= snapshotDates.length) {
    el.innerHTML = '<span class="delta-none">No previous data</span>';
    return;
  }

  // Show loading state while fetching prev snapshot (likely cached)
  el.innerHTML = '<span class="delta-none">comparing…</span>';

  try {
    const prevSnap = await loadSnapshot(snapshotDates[prevIndex]);
    const currCountries = currentSnapshot.countries;
    const prevCountries = prevSnap.countries;

    let escalated = 0;
    let improved  = 0;

    // Union of all ISO2 codes across both snapshots
    const allKeys = new Set([
      ...Object.keys(currCountries),
      ...Object.keys(prevCountries),
    ]);

    for (const iso2 of allKeys) {
      const currRank = TIER_RANK[currCountries[iso2]?.status ?? null] ?? 0;
      const prevRank = TIER_RANK[prevCountries[iso2]?.status ?? null] ?? 0;
      if (currRank > prevRank) escalated++;
      else if (currRank < prevRank) improved++;
    }

    if (escalated === 0 && improved === 0) {
      el.innerHTML = '<span class="delta-none">No changes from the previous day</span>';
    } else {
      const parts = [];
      if (escalated > 0) {
        parts.push(`<span class="delta-up">↑ ${escalated} escalated</span>`);
      }
      if (improved > 0) {
        parts.push(`<span class="delta-down">↓ ${improved} improved</span>`);
      }
      el.innerHTML = parts.join('<span class="delta-sep"> · </span>');
    }
  } catch (err) {
    console.error('Header delta failed:', err);
    el.innerHTML = '<span class="delta-none">—</span>';
  }
}

// ── Canvas timeline ───────────────────────────────────────────────────
// Orientation: newest (index 0) = RIGHT edge, oldest = LEFT edge.
// This matches reading direction — time flows left to right.

const TL = {
  padX:         16,
  trackY:       36,
  trackH:       2,
  tickDay:      5,
  tickMonth:    16,
  thumbW:       2,
  labelFont:    '9px "DM Mono", monospace',
  colorTrack:   '#1e2535',
  colorTick:    '#2a3550',
  colorTickMo:  '#3d5278',
  colorLabel:   '#4a5568',
  colorThumb:   '#3b7dd8',
  colorGlow:    'rgba(59,125,216,0.15)',
};

let canvas, ctx, canvasW, canvasH;
let isDragging = false;

function initTimeline() {
  canvas = document.getElementById('timeline-canvas');
  ctx    = canvas.getContext('2d');
  resizeCanvas();
  drawTimeline();
  bindTimelineEvents();
  window.addEventListener('resize', () => { resizeCanvas(); drawTimeline(); });
}

function resizeCanvas() {
  const wrap = document.getElementById('slider-track-wrap');
  const dpr  = window.devicePixelRatio || 1;
  canvasW    = wrap.clientWidth;
  canvasH    = wrap.clientHeight;
  canvas.width  = canvasW * dpr;
  canvas.height = canvasH * dpr;
  canvas.style.width  = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

// Index 0 (newest) → LEFT edge; index max (oldest) → RIGHT edge
// Dragging right goes back in time — thumb starts at left on load.
function indexToX(idx) {
  const usable = canvasW - TL.padX * 2;
  const total  = snapshotDates.length - 1;
  if (total === 0) return TL.padX + usable / 2;
  return TL.padX + (idx / total) * usable;
}

// x pixel → nearest index (newest = left = 0)
function xToIndex(x) {
  const usable = canvasW - TL.padX * 2;
  const total  = snapshotDates.length - 1;
  if (total === 0) return 0;
  const frac = Math.max(0, Math.min(1, (x - TL.padX) / usable));
  return Math.round(frac * total);
}

function drawTimeline() {
  if (!ctx || snapshotDates.length === 0) return;
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Track line
  ctx.fillStyle = TL.colorTrack;
  ctx.fillRect(TL.padX, TL.trackY - TL.trackH / 2, canvasW - TL.padX * 2, TL.trackH);

  // Pre-compute thumb x so we can suppress labels that would overlap it
  const thumbX        = indexToX(currentIndex);
  const labelClear    = 30; // px either side of thumb to suppress month label

  // Ticks — iterate every snapshot date
  for (let i = 0; i < snapshotDates.length; i++) {
    const dateStr  = snapshotDates[i];
    const x        = indexToX(i);
    const [y, m]   = dateStr.split('-');

    // snapshotDates is descending (i+1 is older).
    // Month boundary: different month from next entry, or very last entry.
    const nextDate   = snapshotDates[i + 1];
    const [, nm]     = nextDate ? nextDate.split('-') : [];
    const isMonthEnd = !nextDate || nm !== m;

    if (isMonthEnd) {
      // Tall tick — always draw the tick itself
      ctx.fillStyle = TL.colorTickMo;
      ctx.fillRect(x - 0.5, TL.trackY - TL.tickMonth / 2, 1, TL.tickMonth);

      // Only draw the label if it won't collide with the thumb
      if (Math.abs(x - thumbX) >= labelClear) {
        ctx.font      = TL.labelFont;
        ctx.fillStyle = TL.colorLabel;
        ctx.textAlign = 'center';
        ctx.fillText(`${MONTHS[parseInt(m, 10) - 1]} ${y}`, x, TL.trackY - TL.tickMonth / 2 - 5);
      }
    } else {
      // Short daily tick
      ctx.fillStyle = TL.colorTick;
      ctx.fillRect(x - 0.5, TL.trackY - TL.tickDay / 2, 1, TL.tickDay);
    }
  }

  // Thumb
  const tx = indexToX(currentIndex);

  // Glow
  ctx.fillStyle = TL.colorGlow;
  ctx.fillRect(tx - 8, 0, 16, canvasH);

  // Bar
  ctx.fillStyle = TL.colorThumb;
  ctx.fillRect(tx - TL.thumbW / 2, 6, TL.thumbW, canvasH - 12);

  // Cap dots
  ctx.beginPath();
  ctx.arc(tx, 8, 4, 0, Math.PI * 2);
  ctx.fillStyle = TL.colorThumb;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(tx, canvasH - 8, 4, 0, Math.PI * 2);
  ctx.fillStyle = TL.colorThumb;
  ctx.fill();
}

async function seekToIndex(idx) {
  if (idx === currentIndex && snapshotCache.has(snapshotDates[idx])) return;
  currentIndex = idx;
  drawTimeline();
  updateDateLabel();

  const date = snapshotDates[idx];
  try {
    const snap = await loadSnapshot(date);
    applySnapshot(snap);
    updateHeaderDelta();
  } catch (err) {
    console.error('Failed to load snapshot:', err);
    document.getElementById('slider-date-label').textContent = 'Failed';
  }
}

function getClientX(e) {
  const rect = canvas.getBoundingClientRect();
  const cx   = e.touches ? e.touches[0].clientX : e.clientX;
  return cx - rect.left;
}

function bindTimelineEvents() {
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    seekToIndex(xToIndex(getClientX(e)));
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    seekToIndex(xToIndex(getClientX(e)));
  });
  window.addEventListener('mouseup', () => { isDragging = false; });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDragging = true;
    seekToIndex(xToIndex(getClientX(e)));
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    seekToIndex(xToIndex(getClientX(e)));
  }, { passive: false });
  window.addEventListener('touchend', () => { isDragging = false; });
}

// ── Graticule ─────────────────────────────────────────────────────────
// Generates lat/long grid lines as a GeoJSON layer.
// 10° minor lines (faint), 30° major lines (slightly more visible),
// Equator and Prime Meridian highlighted.
function addGraticule() {
  const features = [];

  const STEP_MINOR = 10;
  const STEP_MAJOR = 30;

  // Longitude lines (meridians) — vertical
  for (let lon = -180; lon <= 180; lon += STEP_MINOR) {
    const coords = [];
    for (let lat = -90; lat <= 90; lat += 1) {
      coords.push([lon, lat]);
    }
    const isMajor   = lon % STEP_MAJOR === 0;
    const isPrimary = lon === 0;
    features.push({
      type: 'Feature',
      properties: { isMajor, isPrimary, isMinor: !isMajor },
      geometry: { type: 'LineString', coordinates: coords },
    });
  }

  // Latitude lines (parallels) — horizontal
  for (let lat = -90; lat <= 90; lat += STEP_MINOR) {
    const coords = [];
    for (let lon = -180; lon <= 180; lon += 1) {
      coords.push([lon, lat]);
    }
    const isMajor   = lat % STEP_MAJOR === 0;
    const isPrimary = lat === 0; // Equator
    features.push({
      type: 'Feature',
      properties: { isMajor, isPrimary, isMinor: !isMajor },
      geometry: { type: 'LineString', coordinates: coords },
    });
  }

  graticuleLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
    style(feature) {
      const { isPrimary, isMajor } = feature.properties;
      if (isPrimary) return { color: '#5b7aaa', weight: 0.8, opacity: 0.8, interactive: false };
      if (isMajor)   return { color: '#3d5278', weight: 0.5, opacity: 0.7, interactive: false };
      return            { color: '#2a3f5f', weight: 0.3, opacity: 0.6, interactive: false };
    },
    interactive: false,   // never intercept mouse events
  }).addTo(map);
}

// ── Load snapshot index → advisory data → world polygons ─────────────
fetch('data/snapshot_index.json')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} loading snapshot index`);
    return r.json();
  })
  .then(index => {
    snapshotDates = index.dates;
    document.querySelector('.loader-label').textContent = 'Loading advisory data…';
    return loadSnapshot(snapshotDates[0]);
  })
  .then(snapshot => {
    currentSnapshot = snapshot;
    snapshotCache.set(snapshotDates[0], snapshot);
    document.querySelector('.loader-label').textContent = 'Loading world…';
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

        layer.bindTooltip('', {
          className: 'country-tooltip',
          sticky: true,
          offset: [10, 0],
        });

        layer._iso2 = iso2;
        layer._name = name;

        layer.on({
          click() {
            showInfoPanel(name, iso2, currentSnapshot.countries[iso2]);
          },
          mouseover(e) {
            e.target.getTooltip().setContent(buildTooltipContent(name, iso2, currentSnapshot));
            e.target.setStyle({ ...getCountryStyle(feature, currentSnapshot), ...HOVER_STYLE });
            e.target.bringToFront();
          },
          mouseout(e) {
            countryLayer.resetStyle(e.target);
            if (graticuleLayer) graticuleLayer.bringToFront();
          },
        });
      },
    }).addTo(map);

    // Graticule sits above country polygons, below UI panels
    addGraticule();

    const count = geojson.features?.length ?? 0;
    document.getElementById('count-num').textContent = count;
    document.getElementById('loading').classList.add('hidden');

    document.querySelector('.header-status').innerHTML = `
      <span class="status-dot" style="background:#2d8a5e;box-shadow:0 0 6px #2d8a5e"></span>
      ${count} countries updated
    `;

    // Kick off the initial delta comparison
    updateHeaderDelta();

    if (snapshotDates.length < 2) {
      document.getElementById('slider-strip').classList.add('hidden');
    } else {
      updateDateLabel();
      requestAnimationFrame(() => initTimeline());
    }
  })
  .catch(err => {
    console.error('Load failed:', err);
    document.getElementById('loading').innerHTML = `
      <div style="text-align:center;padding:24px">
        <div style="font-size:13px;color:#e53e3e;margin-bottom:8px;font-weight:700">${err.message}</div>
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

// ── Info panel ────────────────────────────────────────────────────────
async function showInfoPanel(countryName, iso2, advisory) {
  const placeholder = document.getElementById('info-placeholder');
  const detail      = document.getElementById('info-detail');
  const nameEl      = document.getElementById('info-country-name');
  const badgeEl     = document.getElementById('info-status-badge');
  const descEl      = document.getElementById('info-description');
  const linkEl      = document.getElementById('info-link');
  const deltaEl     = document.getElementById('info-delta-badge');

  // Switch from placeholder to detail view
  placeholder.classList.add('hidden');
  detail.classList.remove('hidden');

  nameEl.textContent  = countryName;
  deltaEl.textContent = '';
  deltaEl.className   = 'delta-badge hidden';

  if (!advisory) {
    badgeEl.textContent = 'No advisory data';
    badgeEl.className   = 'status-badge no-data';
    descEl.textContent  = 'This country is not currently in the FCDO travel advice index.';
    linkEl.classList.add('hidden');
  } else {
    const status = advisory.status;
    let badgeText = '', badgeClass = 'status-badge ', description = '';

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
        if (advisory.has_pdf) description += ' A PDF briefing map with zones is available.';
        break;
      default:
        badgeText   = '🟢 See travel advice';
        badgeClass += 'no-warning';
        description = 'No specific FCDO warning. See the full travel advice for guidance on safety, health, and local laws.';
        break;
    }

    badgeEl.textContent = badgeText;
    badgeEl.className   = badgeClass;
    descEl.textContent  = description;
    linkEl.href         = `https://www.gov.uk/foreign-travel-advice/${advisory.slug}`;
    linkEl.classList.remove('hidden');

    // Escalation / improvement badge
    const prevIndex = currentIndex + 1;
    if (iso2 && prevIndex < snapshotDates.length) {
      const currRank = TIER_RANK[advisory.status ?? null] ?? 0;
      try {
        const prevSnap = await loadSnapshot(snapshotDates[prevIndex]);
        const prevRank = TIER_RANK[prevSnap.countries[iso2]?.status ?? null] ?? 0;
        if (currRank > prevRank) {
          deltaEl.textContent = '▲ Escalated';
          deltaEl.className   = 'delta-badge escalated';
        } else if (currRank < prevRank) {
          deltaEl.textContent = '▼ Improved';
          deltaEl.className   = 'delta-badge improved';
        }
      } catch (err) {
        console.error('delta fetch failed:', err);
      }
    }
  }
}
