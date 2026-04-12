// ═══════════════════════════════════════════════════════════════════
// FCDO Travel Advisory Map — scripts.js
// ═══════════════════════════════════════════════════════════════════
 
// ── Mobile detection ──────────────────────────────────────────────────
function isMobile() { return window.innerWidth < 768; }
 
// ── Map init ──────────────────────────────────────────────────────────
const map = L.map('map', {
  center: [20, 10],
  zoom: 3,
  minZoom: 2,
  maxZoom: 10,
  zoomControl: true,
  attributionControl: true,
});
 
map.on('tileerror', () => {
  if (!map._tileErrorShown) {
    map._tileErrorShown = true;
    document.querySelector('.header-status').innerHTML = `
      <span class="status-dot" style="background:#d69e2e;box-shadow:0 0 6px #d69e2e;animation:none"></span>
      Map tiles unavailable
    `;
  }
});
 
window.addEventListener('offline', () => {
  document.querySelector('.header-status').innerHTML = `
    <span class="status-dot" style="background:#e53e3e;box-shadow:0 0 6px #e53e3e;animation:none"></span>
    No internet connection
  `;
});
window.addEventListener('online', () => location.reload());
 
// ── Desktop / mobile layout ───────────────────────────────────────────
function applyDesktopLayout() {
  map.invalidateSize();
  const zoom = map.getZoom();
  const worldWidthPx = map.project(L.latLng(0, 180), zoom).x
                     - map.project(L.latLng(0, -180), zoom).x;
  const mc = document.getElementById('map-container');
  mc.style.flex  = 'none';
  mc.style.width = worldWidthPx + 'px';
  map.invalidateSize();
  const leftEdgePx        = map.project(L.latLng(20, -180), zoom);
  const containerCentrePx = leftEdgePx.add([worldWidthPx / 2, 0]);
  const newCentre         = map.unproject(containerCentrePx, zoom);
  map.setView([20, newCentre.lng], zoom, { animate: false });
}
 
function applyMobileLayout() {
  const mc = document.getElementById('map-container');
  mc.style.flex  = '';
  mc.style.width = '';
  map.invalidateSize();
  map.setView([20, 0], 1, { animate: false });
}
 
requestAnimationFrame(() => isMobile() ? applyMobileLayout() : applyDesktopLayout());
 
window.addEventListener('resize', () => {
  if (isMobile()) {
    const mc = document.getElementById('map-container');
    mc.style.flex  = '';
    mc.style.width = '';
    map.invalidateSize();
  } else {
    applyDesktopLayout();
  }
});
 
// ── Advisory tier colours ─────────────────────────────────────────────
const TIER_COLORS = {
  avoid_all:               '#e53e3e',
  avoid_all_but_essential: '#dd6b20',
  some_parts:              '#d69e2e',
  null:                    '#2d8a5e',
  unknown:                 '#0f1720',
};
const TIER_RANK = { avoid_all: 3, avoid_all_but_essential: 2, some_parts: 1, null: 0 };
 
const HOVER_STYLE = { fillOpacity: 1, weight: 1.5, color: '#3b7dd8', opacity: 1 };
const SEARCH_HIGHLIGHT_STYLE = { fillOpacity: 1, weight: 2.5, color: '#f6e05e', opacity: 1 };
 
function getCountryColor(iso2, snapshot) {
  const advisory = snapshot.countries[iso2];
  if (!advisory) return TIER_COLORS.unknown;
  return TIER_COLORS[advisory.status ?? 'null'] || TIER_COLORS.unknown;
}
 
// ── ISO2 lookup tables ────────────────────────────────────────────────
const NAME_TO_ISO2 = {
  'France': 'FR', 'Norway': 'NO',
  'Timor-Leste': 'TL', 'East Timor': 'TL',
  'Ivory Coast': 'CI', "Côte d'Ivoire": 'CI',
  'W. Sahara': 'EH', 'Dem. Rep. Congo': 'CD', 'Congo': 'CG',
  'Kosovo': 'XK', 'N. Cyprus': 'CY', 'Northern Cyprus': 'CY',
  'Somaliland': 'SO', 'Palestine': 'PS', 'Vatican': 'VA',
  'Micronesia': 'FM', 'Faeroe Is.': 'FO', 'Åland': 'AX',
  'Taiwan': 'TW', 'Greenland': 'GL', 'Guam': 'GU', 'Puerto Rico': 'PR',
  'Falkland Is.': 'FK', 'Falkland Islands': 'FK',
  'S. Geo. and the Is.': 'GS', 'South Georgia & the Islands': 'GS',
  'Baikonur': 'BQ_KZ',
  'St-Martin': 'MF', 'Sint Maarten': 'SX', 'Curaçao': 'CW', 'Aruba': 'AW',
  'St. Vin. and Gren.': 'VC', 'St. Kitts and Nevis': 'KN',
  'St-Barthélemy': 'BL', 'Turks and Caicos Is.': 'TC',
  'Anguilla': 'AI', 'British Virgin Is.': 'VG', 'Cayman Is.': 'KY',
  'Bermuda': 'BM', 'Montserrat': 'MS', 'Pitcairn Is.': 'PN',
  'Saint Helena': 'SH', 'Br. Indian Ocean Ter.': 'IO',
  'Gibraltar': 'GI', 'Jersey': 'JE', 'Guernsey': 'GG', 'Isle of Man': 'IM',
  'Hong Kong': 'HK', 'Macao': 'MO', 'Norfolk Island': 'NF',
  'Cook Is.': 'CK', 'Niue': 'NU', 'Heard I. and McDonald Is.': 'HM',
  'U.S. Minor Outlying Is.': 'UM',
  'French Guiana': 'GF', 'Martinique': 'MQ', 'Guadeloupe': 'GP',
  'Réunion': 'RE', 'Mayotte': 'YT', 'Saint Pierre and Miquelon': 'PM',
  'New Caledonia': 'NC', 'French Polynesia': 'PF',
  'Wallis and Futuna Is.': 'WF', 'Clipperton I.': 'FR',
  'French S. and Antarctic Lands': 'TF',
  'Southern Patagonian Ice Field': 'AR',
  'Siachen Glacier': 'IN',
  'Bir Tawil': 'EG',
};
 
const ISO2_TO_SNAPSHOT_KEY = {
  'AX': 'FI', 'FO': 'DK', 'NF': 'AU', 'NU': 'NZ',
  'HM': 'AU', 'UM': 'US', 'BL': 'MF', 'VA': null, 'BQ_KZ': 'KZ',
};
 
const TERRITORY_TO_PARENT_ISO2 = {
  'RE': 'FR', 'PM': 'FR', 'NC': 'FR', 'TF': 'FR',
  'GU': 'US', 'VI': 'US', 'AS': 'US', 'MP': 'US', 'PR': 'US',
  'GL': 'DK',
};
 
function getISO2FromFeature(feature) {
  const props = feature.properties;
  let iso2 = props.ISO_A2 || props.iso_a2 || props.ISO2 || props.iso2 || null;
  if (!iso2 || iso2 === '-99') iso2 = props.ISO_A2_EH || props.iso_a2_eh || null;
  if (iso2 === 'CN-TW') iso2 = 'TW';
  if (!iso2 || iso2 === '-99') {
    const name = props.NAME || props.name || props.ADMIN || props.admin || '';
    iso2 = NAME_TO_ISO2[name] || null;
  }
  if (!iso2 || iso2 === '-99') return null;
  iso2 = TERRITORY_TO_PARENT_ISO2[iso2] || iso2;
  if (iso2 in ISO2_TO_SNAPSHOT_KEY) return ISO2_TO_SNAPSHOT_KEY[iso2];
  return iso2;
}
 
function getCountryStyle(feature, snapshot) {
  const iso2 = getISO2FromFeature(feature);
  return {
    fillColor: getCountryColor(iso2, snapshot),
    fillOpacity: 0.9,
    color: '#1e2535', weight: 0.8, opacity: 0.5,
  };
}
 
function buildTooltipContent(name, iso2, snapshot) {
  const advisory = snapshot?.countries[iso2];
  if (!advisory) return name;
  const lbl = advisory.status === 'avoid_all'               ? '🔴 Avoid all travel'
            : advisory.status === 'avoid_all_but_essential' ? '🟠 Avoid all but essential'
            : advisory.status === 'some_parts'              ? '🟡 Some parts'
            : '🟢 See travel advice';
  return `${name}<br/><span style="font-size:10px;color:#9ca3af">${lbl}</span>`;
}
 
// ── State ─────────────────────────────────────────────────────────────
let countryLayer = null, graticuleLayer = null;
let currentSnapshot = null, snapshotDates = [], currentIndex = 0;
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
  if (!snap || typeof snap.countries !== 'object')
    throw new Error(`Snapshot for ${date} is missing country data`);
  snapshotCache.set(date, snap);
  return snap;
}
 
function applySnapshot(snapshot) {
  currentSnapshot = snapshot;
  if (countryLayer) countryLayer.eachLayer(l => {
    if (l.feature) l.setStyle(getCountryStyle(l.feature, snapshot));
  });
  updateDateLabel();
}
 
// ── Date label ────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDate(d) {
  const [y, m, dd] = d.split('-');
  return `${parseInt(dd, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}
function updateDateLabel() {
  const date = snapshotDates[currentIndex];
  if (!date) return;
  const isLatest = currentIndex === 0;
  document.getElementById('slider-date-label').textContent = formatDate(date);
  document.getElementById('slider-date-label').classList.toggle('is-latest', isLatest);
  document.getElementById('slider-date-sub').textContent = isLatest ? 'latest' : 'archived';
}
 
// ── Header delta ──────────────────────────────────────────────────────
async function updateHeaderDelta() {
  const el = document.getElementById('header-delta-text');
  const prevIndex = currentIndex + 1;
  if (prevIndex >= snapshotDates.length) {
    el.innerHTML = '<span class="delta-none">No previous data</span>'; return;
  }
  el.innerHTML = '<span class="delta-none">comparing…</span>';
  try {
    const prevSnap = await loadSnapshot(snapshotDates[prevIndex]);
    const curr = currentSnapshot.countries, prev = prevSnap.countries;
    let esc = 0, imp = 0;
    for (const iso2 of new Set([...Object.keys(curr), ...Object.keys(prev)])) {
      const c = TIER_RANK[curr[iso2]?.status ?? null] ?? 0;
      const p = TIER_RANK[prev[iso2]?.status ?? null] ?? 0;
      if (c > p) esc++; else if (c < p) imp++;
    }
    if (esc === 0 && imp === 0) {
      el.innerHTML = '<span class="delta-none">No changes from the previous day</span>';
    } else {
      const parts = [];
      if (esc > 0) parts.push(`<span class="delta-up">↑ ${esc} escalated</span>`);
      if (imp > 0) parts.push(`<span class="delta-down">↓ ${imp} improved</span>`);
      el.innerHTML = parts.join('<span class="delta-sep"> · </span>');
    }
  } catch (err) {
    console.error('Header delta failed:', err);
    el.innerHTML = '<span class="delta-none">—</span>';
  }
}
 
// ── Canvas timeline ───────────────────────────────────────────────────
const TL = {
  padX: 16, trackY: 36, trackH: 2, tickDay: 5, tickMonth: 16, thumbW: 2,
  labelFont: '9px "DM Mono", monospace',
  colorTrack: '#1e2535', colorTick: '#2a3550', colorTickMo: '#3d5278',
  colorLabel: '#4a5568', colorThumb: '#3b7dd8', colorGlow: 'rgba(59,125,216,0.15)',
};
let canvas, ctx, canvasW, canvasH, isDragging = false;
 
function initTimeline() {
  canvas = document.getElementById('timeline-canvas');
  ctx    = canvas.getContext('2d');
  canvas.setAttribute('aria-valuemax', String(snapshotDates.length - 1));
  canvas.setAttribute('aria-valuenow', '0');
  canvas.setAttribute('aria-valuetext', snapshotDates[0]);
  resizeCanvas(); drawTimeline(); bindTimelineEvents();
  window.addEventListener('resize', () => { resizeCanvas(); drawTimeline(); });
}
function resizeCanvas() {
  const wrap = document.getElementById('slider-track-wrap');
  const dpr = window.devicePixelRatio || 1;
  canvasW = wrap.clientWidth; canvasH = wrap.clientHeight;
  canvas.width = canvasW * dpr; canvas.height = canvasH * dpr;
  canvas.style.width = canvasW + 'px'; canvas.style.height = canvasH + 'px';
  ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr, dpr);
}
function indexToX(idx) {
  const usable = canvasW - TL.padX * 2, total = snapshotDates.length - 1;
  if (total === 0) return TL.padX + usable / 2;
  return TL.padX + (idx / total) * usable;
}
function xToIndex(x) {
  const usable = canvasW - TL.padX * 2, total = snapshotDates.length - 1;
  if (total === 0) return 0;
  return Math.round(Math.max(0, Math.min(1, (x - TL.padX) / usable)) * total);
}
function drawTimeline() {
  if (!ctx || snapshotDates.length === 0) return;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = TL.colorTrack;
  ctx.fillRect(TL.padX, TL.trackY - TL.trackH / 2, canvasW - TL.padX * 2, TL.trackH);
  const thumbX = indexToX(currentIndex), labelClear = 30;
  for (let i = 0; i < snapshotDates.length; i++) {
    const x = indexToX(i), [y, m] = snapshotDates[i].split('-');
    const nextDate = snapshotDates[i + 1], [, nm] = nextDate ? nextDate.split('-') : [];
    const isMonthEnd = !nextDate || nm !== m;
    if (isMonthEnd) {
      ctx.fillStyle = TL.colorTickMo;
      ctx.fillRect(x - 0.5, TL.trackY - TL.tickMonth / 2, 1, TL.tickMonth);
      if (Math.abs(x - thumbX) >= labelClear) {
        ctx.font = TL.labelFont; ctx.fillStyle = TL.colorLabel; ctx.textAlign = 'center';
        ctx.fillText(`${MONTHS[parseInt(m,10)-1]} ${y}`, x, TL.trackY - TL.tickMonth / 2 - 5);
      }
    } else {
      ctx.fillStyle = TL.colorTick;
      ctx.fillRect(x - 0.5, TL.trackY - TL.tickDay / 2, 1, TL.tickDay);
    }
  }
  const tx = indexToX(currentIndex);
  ctx.fillStyle = TL.colorGlow; ctx.fillRect(tx - 8, 0, 16, canvasH);
  ctx.fillStyle = TL.colorThumb; ctx.fillRect(tx - TL.thumbW / 2, 6, TL.thumbW, canvasH - 12);
  ctx.beginPath(); ctx.arc(tx, 8, 4, 0, Math.PI * 2); ctx.fillStyle = TL.colorThumb; ctx.fill();
  ctx.beginPath(); ctx.arc(tx, canvasH - 8, 4, 0, Math.PI * 2); ctx.fillStyle = TL.colorThumb; ctx.fill();
}
async function seekToIndex(idx) {
  if (idx === currentIndex && snapshotCache.has(snapshotDates[idx])) return;
  currentIndex = idx; drawTimeline(); updateDateLabel();
  canvas.setAttribute('aria-valuenow', String(idx));
  canvas.setAttribute('aria-valuetext', snapshotDates[idx]);
  try {
    const snap = await loadSnapshot(snapshotDates[idx]);
    applySnapshot(snap); updateHeaderDelta();
  } catch (err) {
    console.error('Failed to load snapshot:', err);
    document.getElementById('slider-date-label').textContent = 'Load error';
    document.getElementById('slider-date-sub').textContent = 'try again';
  }
}
function getClientX(e) {
  const rect = canvas.getBoundingClientRect();
  return (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
}
function bindTimelineEvents() {
  canvas.addEventListener('mousedown', e => { isDragging = true; seekToIndex(xToIndex(getClientX(e))); });
  window.addEventListener('mousemove', e => { if (isDragging) seekToIndex(xToIndex(getClientX(e))); });
  window.addEventListener('mouseup',   () => isDragging = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); isDragging = true; seekToIndex(xToIndex(getClientX(e))); }, { passive: false });
  window.addEventListener('touchmove',  e => { if (!isDragging) return; e.preventDefault(); seekToIndex(xToIndex(getClientX(e))); }, { passive: false });
  window.addEventListener('touchend',   () => isDragging = false);
  canvas.addEventListener('keydown', e => {
    const last = snapshotDates.length - 1;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); seekToIndex(Math.max(currentIndex - 1, 0)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); seekToIndex(Math.min(currentIndex + 1, last)); }
    if (e.key === 'Home')       { e.preventDefault(); seekToIndex(0); }
    if (e.key === 'End')        { e.preventDefault(); seekToIndex(last); }
  });
}
 
// ── Graticule ─────────────────────────────────────────────────────────
function addGraticule() {
  const features = [], SM = 10, MA = 30;
  for (let lon = -180; lon <= 180; lon += SM) {
    const coords = []; for (let lat = -90; lat <= 90; lat++) coords.push([lon, lat]);
    features.push({ type: 'Feature', properties: { isMajor: lon % MA === 0, isPrimary: lon === 0 }, geometry: { type: 'LineString', coordinates: coords } });
  }
  for (let lat = -90; lat <= 90; lat += SM) {
    const coords = []; for (let lon = -180; lon <= 180; lon++) coords.push([lon, lat]);
    features.push({ type: 'Feature', properties: { isMajor: lat % MA === 0, isPrimary: lat === 0 }, geometry: { type: 'LineString', coordinates: coords } });
  }
  graticuleLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
    style(f) {
      if (f.properties.isPrimary) return { color: '#5b7aaa', weight: 0.8, opacity: 0.8, interactive: false };
      if (f.properties.isMajor)   return { color: '#3d5278', weight: 0.5, opacity: 0.7, interactive: false };
      return { color: '#2a3f5f', weight: 0.3, opacity: 0.6, interactive: false };
    },
    interactive: false,
  }).addTo(map);
}
 
// ── Country enrichment data caches ────────────────────────────────────
// keyed by ISO2 uppercase
const restCountriesCache = new Map();
const wikipediaCache     = new Map();
 
// Fetch from restcountries.com — returns flag, capital, population, area, languages
async function fetchRestCountries(iso2) {
  if (!iso2) return null;
  const key = iso2.toUpperCase();
  if (restCountriesCache.has(key)) return restCountriesCache.get(key);
  try {
    const res = await fetch(
      `https://restcountries.com/v3.1/alpha/${key}?fields=name,flags,capital,population,area,languages`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) throw new Error(`REST Countries HTTP ${res.status}`);
    const data = await res.json();
    // API returns an array for alpha lookup
    const country = Array.isArray(data) ? data[0] : data;
    restCountriesCache.set(key, country);
    return country;
  } catch (err) {
    console.warn(`REST Countries fetch failed for ${key}:`, err.message);
    restCountriesCache.set(key, null);
    return null;
  }
}
 
// Fetch Wikipedia summary — returns a short extract (2-3 sentences)
async function fetchWikipediaSummary(countryName) {
  if (!countryName) return null;
  const cacheKey = countryName.toLowerCase();
  if (wikipediaCache.has(cacheKey)) return wikipediaCache.get(cacheKey);
  try {
    // Wikipedia REST API page/summary endpoint — no auth needed, CORS allowed
    const title = encodeURIComponent(countryName);
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
    const data = await res.json();
    // Use the first 2 sentences of the extract if available
    const extract = data.extract || '';
    const sentences = extract.match(/[^.!?]+[.!?]+/g) || [];
    const short = sentences.slice(0, 2).join(' ').trim();
    wikipediaCache.set(cacheKey, short || null);
    return short || null;
  } catch (err) {
    console.warn(`Wikipedia fetch failed for ${countryName}:`, err.message);
    wikipediaCache.set(cacheKey, null);
    return null;
  }
}
 
// Format a number with comma separators
function formatNumber(n) {
  if (n == null) return '—';
  return n.toLocaleString('en-GB');
}
 
// Format population density as X / km²
function formatDensity(population, areaSqKm) {
  if (!population || !areaSqKm) return '—';
  const density = Math.round(population / areaSqKm);
  return `${formatNumber(density)} / km²`;
}
 
// Extract a readable language list from REST Countries languages object
function formatLanguages(languages) {
  if (!languages || typeof languages !== 'object') return '—';
  const list = Object.values(languages);
  if (list.length === 0) return '—';
  if (list.length <= 3) return list.join(', ');
  return list.slice(0, 3).join(', ') + ` +${list.length - 3}`;
}
 
// ── Search ────────────────────────────────────────────────────────────
let searchIndex = [], activeResultIndex = -1, searchHighlightTimer = null;
 
function buildSearchIndex() {
  searchIndex = [];
  if (!countryLayer) return;
  const seen = new Set();
  countryLayer.eachLayer(layer => {
    if (!layer._name || !layer.feature) return;
    const key = layer._name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    searchIndex.push({ name: layer._name, iso2: layer._iso2, layer });
  });
  searchIndex.sort((a, b) => a.name.localeCompare(b.name));
}
 
function tierColorForIso2(iso2) {
  if (!currentSnapshot || !iso2) return TIER_COLORS.unknown;
  const adv = currentSnapshot.countries[iso2];
  if (!adv) return TIER_COLORS.unknown;
  return TIER_COLORS[adv.status ?? 'null'] || TIER_COLORS.unknown;
}
 
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
 
function highlightMatch(name, query) {
  if (!query) return escapeHtml(name);
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(name);
  return escapeHtml(name.slice(0, idx))
    + `<mark>${escapeHtml(name.slice(idx, idx + query.length))}</mark>`
    + escapeHtml(name.slice(idx + query.length));
}
 
function getSearchResults(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase().trim();
  const prefix    = searchIndex.filter(e => e.name.toLowerCase().startsWith(q));
  const substring = searchIndex.filter(e => !e.name.toLowerCase().startsWith(q) && e.name.toLowerCase().includes(q));
  return [...prefix, ...substring].slice(0, 6);
}
 
function renderResults(results, query) {
  const ul = document.getElementById('search-results');
  ul.innerHTML = ''; activeResultIndex = -1;
  if (results.length === 0) {
    ul.innerHTML = `<li class="search-no-results" role="option">No countries found</li>`;
  } else {
    results.forEach((entry, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.dataset.index = i;
      const dot = document.createElement('span');
      dot.className = 'search-result-dot';
      dot.style.background = tierColorForIso2(entry.iso2);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'search-result-name';
      nameSpan.innerHTML = highlightMatch(entry.name, query);
      li.appendChild(dot); li.appendChild(nameSpan);
      li.addEventListener('mousedown', e => { e.preventDefault(); selectResult(entry); });
      li.addEventListener('touchend',  e => { e.preventDefault(); selectResult(entry); });
      ul.appendChild(li);
    });
  }
  ul.classList.add('open');
}
 
function closeResults() {
  document.getElementById('search-results').classList.remove('open');
  document.getElementById('search-results').innerHTML = '';
  activeResultIndex = -1;
}
 
function selectResult(entry) {
  const input = document.getElementById('search-input');
  input.value = ''; document.getElementById('search-clear').style.display = 'none';
  closeResults(); input.blur();
  zoomToLayer(entry.layer);
  highlightLayer(entry.layer);
  showInfoPanel(entry.name, entry.iso2, currentSnapshot?.countries[entry.iso2]);
  if (isMobile()) document.getElementById('sidebar').scrollTo({ top: 0, behavior: 'smooth' });
}
 
function zoomToLayer(layer) {
  try {
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6, animate: true });
  } catch (e) { /* point features etc */ }
}
 
function highlightLayer(layer) {
  if (searchHighlightTimer) { clearTimeout(searchHighlightTimer); searchHighlightTimer = null; }
  layer.setStyle(SEARCH_HIGHLIGHT_STYLE); layer.bringToFront();
  if (graticuleLayer) graticuleLayer.bringToFront();
  searchHighlightTimer = setTimeout(() => {
    if (countryLayer && layer.feature) countryLayer.resetStyle(layer);
    if (graticuleLayer) graticuleLayer.bringToFront();
    searchHighlightTimer = null;
  }, 1800);
}
 
function initSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  const ul = document.getElementById('search-results');
  let currentResults = [];
 
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.style.display = q.length > 0 ? 'block' : 'none';
    if (q.length === 0) { closeResults(); return; }
    currentResults = getSearchResults(q);
    renderResults(currentResults, q);
  });
 
  input.addEventListener('keydown', e => {
    const items = ul.querySelectorAll('li[data-index]');
    if (!ul.classList.contains('open') || items.length === 0) {
      if (e.key === 'Escape') { closeResults(); input.blur(); } return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeResultIndex = Math.min(activeResultIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('active', i === activeResultIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeResultIndex = Math.max(activeResultIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('active', i === activeResultIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = activeResultIndex >= 0 ? activeResultIndex : 0;
      if (currentResults[idx]) selectResult(currentResults[idx]);
    } else if (e.key === 'Escape') {
      closeResults(); input.blur();
    }
  });
 
  clearBtn.addEventListener('click', () => {
    input.value = ''; clearBtn.style.display = 'none'; closeResults(); input.focus();
  });
  document.addEventListener('click', e => { if (!e.target.closest('#search-box')) closeResults(); });
  map.on('movestart', closeResults);
}
 
// ── Error display ─────────────────────────────────────────────────────
function showLoadError(message) {
  document.getElementById('loading').innerHTML = `
    <div style="text-align:center;padding:24px;max-width:320px">
      <div style="font-size:28px;margin-bottom:12px">⚠️</div>
      <div style="font-size:13px;color:#e53e3e;margin-bottom:10px;font-weight:700">Failed to load advisory data</div>
      <div style="font-size:11px;color:#4a5568;font-family:'DM Mono',monospace;line-height:1.8">${message}</div>
      <a href="javascript:location.reload()"
         style="display:inline-block;margin-top:16px;color:#3b7dd8;font-size:12px;
                font-family:'DM Mono',monospace;text-decoration:none;
                border:1px solid #3b7dd8;padding:6px 16px;border-radius:4px">
        Try again
      </a>
    </div>
  `;
  document.querySelector('.header-status').innerHTML = `
    <span class="status-dot" style="background:#e53e3e;box-shadow:0 0 6px #e53e3e;animation:none"></span>
    Load failed
  `;
}

function initResetButton() {
  document.getElementById('reset-map-btn').addEventListener('click', () => {
    if (isMobile()) {
      // Reset mobile to default centred view
      const mc = document.getElementById('map-container');
      mc.style.flex  = '';
      mc.style.width = '';
      map.invalidateSize();
      map.setView([20, 0], 1, { animate: true });
    } else {
      // Reset desktop: first undo any JS-set width so invalidateSize
      // measures the full available container, then re-pin at zoom 3
      const mc = document.getElementById('map-container');
      mc.style.flex  = 'none';
      mc.style.width = ''; // temporarily clear so we can measure
      map.invalidateSize();
      map.setZoom(3, { animate: false });

      // Now re-run the full layout calculation at zoom 3
      const zoom = 3;
      const worldWidthPx = map.project(L.latLng(0, 180), zoom).x
                         - map.project(L.latLng(0, -180), zoom).x;
      mc.style.width = worldWidthPx + 'px';
      map.invalidateSize();

      const leftEdgePx        = map.project(L.latLng(20, -180), zoom);
      const containerCentrePx = leftEdgePx.add([worldWidthPx / 2, 0]);
      const newCentre         = map.unproject(containerCentrePx, zoom);
      map.setView([20, newCentre.lng], zoom, { animate: true });
    }
  });
}
 
// ── Main load chain ───────────────────────────────────────────────────
fetch('data/snapshot_index.json')
  .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} — could not load snapshot index`); return r.json(); })
  .then(index => {
    if (!Array.isArray(index.dates) || index.dates.length === 0)
      throw new Error('Snapshot index is empty — the scraper may not have run yet');
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
  .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} — could not load world polygons`); return r.json(); })
  .then(geojson => {
    if (!geojson.features || geojson.features.length === 0)
      throw new Error('World polygon file is empty or invalid');
 
    countryLayer = L.geoJSON(geojson, {
      style: f => getCountryStyle(f, currentSnapshot),
      onEachFeature(feature, layer) {
        const name = feature.properties?.name || feature.properties?.NAME || feature.properties?.ADMIN || 'Unknown';
        const iso2 = getISO2FromFeature(feature);
        layer.bindTooltip('', { className: 'country-tooltip', sticky: true, offset: [10, 0] });
        layer._iso2 = iso2; layer._name = name;
        layer.on({
          click() {
            showInfoPanel(name, iso2, currentSnapshot.countries[iso2]);
            if (isMobile()) document.getElementById('sidebar').scrollTo({ top: 0, behavior: 'smooth' });
          },
          mouseover(e) {
            if (isMobile()) return;
            e.target.getTooltip().setContent(buildTooltipContent(name, iso2, currentSnapshot));
            e.target.setStyle({ ...getCountryStyle(feature, currentSnapshot), ...HOVER_STYLE });
            e.target.bringToFront();
          },
          mouseout(e) {
            if (isMobile()) return;
            countryLayer.resetStyle(e.target);
            if (graticuleLayer) graticuleLayer.bringToFront();
          },
        });
      },
    }).addTo(map);
 
    addGraticule();
    buildSearchIndex();
    initSearch();
 
    const count = geojson.features?.length ?? 0;
    document.getElementById('count-num').textContent = count;
    document.getElementById('loading').classList.add('hidden');
    document.querySelector('.header-status').innerHTML = `
      <span class="status-dot" style="background:#2d8a5e;box-shadow:0 0 6px #2d8a5e"></span>
      ${count} countries updated
    `;
    updateHeaderDelta();
    updateDateLabel();
    if (snapshotDates.length >= 2) requestAnimationFrame(() => initTimeline());

    initResetButton();
  })
  .catch(err => { console.error('Load failed:', err); showLoadError(err.message); });
 
// ── Info panel ────────────────────────────────────────────────────────
async function showInfoPanel(countryName, iso2, advisory) {
  const detail      = document.getElementById('info-detail');
  const placeholder = document.getElementById('info-placeholder');
 
  // Switch to detail view immediately
  placeholder.classList.add('hidden');
  detail.classList.remove('hidden');
 
  // Reset enriched fields to loading state while fetches run
  const flagEl       = document.getElementById('info-flag');
  const nameEl       = document.getElementById('info-country-name');
  const badgeEl      = document.getElementById('info-status-badge');
  const deltaEl      = document.getElementById('info-delta-badge');
  const factsEl      = document.getElementById('info-facts');
  const extractEl    = document.getElementById('info-extract');
  const descEl       = document.getElementById('info-description');
  const mapWrapEl    = document.getElementById('info-map-wrap');
  const mapImgEl     = document.getElementById('info-map-img');
  const mapLinkEl    = document.getElementById('info-map-link');
  const linkEl       = document.getElementById('info-link');
 
  // Reset state
  flagEl.classList.remove('loaded');
  flagEl.src = '';
  flagEl.alt = `Flag of ${countryName}`;
  nameEl.textContent = countryName;
  deltaEl.textContent = ''; deltaEl.className = 'delta-badge hidden';
  factsEl.classList.add('hidden');
  extractEl.classList.add('hidden'); extractEl.textContent = '';
  mapWrapEl.classList.add('hidden');
  linkEl.classList.add('hidden');
 
  // ── Advisory badge ──────────────────────────────────────────────
  if (!advisory) {
    badgeEl.textContent = 'No advisory data';
    badgeEl.className   = 'status-badge no-data';
    descEl.textContent  = 'This country is not currently in the FCDO travel advice index.';
  } else {
    const status = advisory.status;
    let badgeText = '', badgeClass = 'status-badge ', description = '';
    switch (status) {
      case 'avoid_all':
        badgeText = '🔴 Avoid all travel'; badgeClass += 'avoid-all';
        description = 'The FCDO advises against all travel to this country.';
        break;
      case 'avoid_all_but_essential':
        badgeText = '🟠 Avoid all but essential'; badgeClass += 'avoid-essential';
        description = 'The FCDO advises against all but essential travel to this country.';
        break;
      case 'some_parts':
        badgeText = '🟡 Mixed advisory (some parts)'; badgeClass += 'some-parts';
        description = 'The FCDO advises against travel to some parts of this country.';
        if (advisory.has_pdf) description += ' An advisory zone map is shown below.';
        break;
      default:
        badgeText = '🟢 See travel advice'; badgeClass += 'no-warning';
        description = 'No specific FCDO warning. See the full travel advice for guidance.';
        break;
    }
    badgeEl.textContent = badgeText; badgeEl.className = badgeClass;
    descEl.textContent  = description;
 
    // ── FCDO advisory map image ───────────────────────────────────
    if (advisory.has_pdf && advisory.pdf_url) {
      mapImgEl.src = advisory.pdf_url;
      mapLinkEl.href = advisory.pdf_url;
      mapWrapEl.classList.remove('hidden');
    }
 
    // ── GOV.UK link ───────────────────────────────────────────────
    linkEl.href = `https://www.gov.uk/foreign-travel-advice/${advisory.slug}`;
    linkEl.classList.remove('hidden');
 
    // ── Delta badge ───────────────────────────────────────────────
    const prevIndex = currentIndex + 1;
    if (iso2 && prevIndex < snapshotDates.length) {
      const currRank = TIER_RANK[status ?? null] ?? 0;
      try {
        const prevSnap = await loadSnapshot(snapshotDates[prevIndex]);
        const prevRank = TIER_RANK[prevSnap.countries[iso2]?.status ?? null] ?? 0;
        if (currRank > prevRank) { deltaEl.textContent = '▲ Escalated'; deltaEl.className = 'delta-badge escalated'; }
        else if (currRank < prevRank) { deltaEl.textContent = '▼ Improved'; deltaEl.className = 'delta-badge improved'; }
      } catch (e) { /* non-critical */ }
    }
  }
 
  // ── Fetch REST Countries + Wikipedia in parallel ─────────────────
  // We don't await these before showing the panel — they update the DOM
  // as they arrive so the panel feels fast even on slow connections.
 
  // REST Countries
  fetchRestCountries(iso2).then(data => {
    if (!data) return;
 
    // Flag
    const flagUrl = data.flags?.svg || data.flags?.png;
    if (flagUrl) {
      flagEl.onload  = () => flagEl.classList.add('loaded');
      flagEl.onerror = () => {}; // silently skip broken flags
      flagEl.alt = `Flag of ${countryName}`;
      flagEl.src = flagUrl;
    }
 
    // Facts
    const capital   = Array.isArray(data.capital) ? data.capital.join(', ') : (data.capital || '—');
    const pop       = formatNumber(data.population);
    const density   = formatDensity(data.population, data.area);
    const languages = formatLanguages(data.languages);
 
    document.getElementById('fact-capital').textContent    = capital;
    document.getElementById('fact-population').textContent = pop;
    document.getElementById('fact-density').textContent    = density;
    document.getElementById('fact-languages').textContent  = languages;
    factsEl.classList.remove('hidden');
  });
 
  // Wikipedia
  fetchWikipediaSummary(countryName).then(extract => {
    if (!extract) return;
    extractEl.textContent = extract;
    extractEl.classList.remove('hidden');
  });
}
