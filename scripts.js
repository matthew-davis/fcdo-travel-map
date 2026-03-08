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

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

// ── Country styles ────────────────────────────────────────────────────
const NEUTRAL_STYLE = {
  fillColor:   '#1e2a3d',
  fillOpacity: 0.7,
  color:       '#0a0d12',
  weight:      0.6,
  opacity:     1,
};

const HOVER_STYLE = {
  fillColor:   '#253348',
  fillOpacity: 0.9,
  weight:      1.2,
  color:       '#3b7dd8',
};

// ── Load GeoJSON ──────────────────────────────────────────────────────
let countryLayer = null;

fetch('data/world_10m.json')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(geojson => {
    countryLayer = L.geoJSON(geojson, {
      style: () => ({ ...NEUTRAL_STYLE }),

      onEachFeature(feature, layer) {
        const name = feature.properties?.name
                  || feature.properties?.NAME
                  || feature.properties?.ADMIN
                  || 'Unknown';

        layer.bindTooltip(name, {
          className: 'country-tooltip',
          sticky: true,
          offset: [10, 0],
        });

        layer.on({
          mouseover(e) {
            e.target.setStyle(HOVER_STYLE);
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
      ${count} polygons rendered
    `;
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
