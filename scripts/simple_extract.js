#!/usr/bin/env node
/**
 * Smart Zone Extractor
 *
 * 1. Downloads PDF/image
 * 2. Samples random points to detect if single-color or mixed
 * 3. Single-color → use whole country polygon
 * 4. Mixed → extract zones with grid sampling
 *
 * Usage: node smart_extract.js <ISO2>
 * Example: node smart_extract.js IL
 */

import fs from 'fs';
import { execSync } from 'child_process';
import sharp from 'sharp';
import * as turf from '@turf/turf';

// ── Config ────────────────────────────────────────────────────────────
const SAMPLE_POINTS = 100; // Random points to check for single-color detection
const SINGLE_COLOR_THRESHOLD = 0.85; // 85%+ same color = single-color map
const GRID_SIZE = 50; // Grid size for mixed maps
const COLOR_TOLERANCE = 60;

// FCDO colors - check yellow first (closest to orange)
const COLORS = {
  some_parts: { rgb: [214, 158, 46], status: 'some_parts' },
  avoid_essential: { rgb: [221, 107, 32], status: 'avoid_all_but_essential' },
  avoid_all: { rgb: [229, 62, 62], status: 'avoid_all' },
};

// ── Color matching ────────────────────────────────────────────────────
function colorDistance(rgb1, rgb2) {
  return Math.sqrt(
    Math.pow(rgb1[0] - rgb2[0], 2) +
    Math.pow(rgb1[1] - rgb2[1], 2) +
    Math.pow(rgb1[2] - rgb2[2], 2)
  );
}

function identifyColor(r, g, b) {
  for (const [name, def] of Object.entries(COLORS)) {
    if (colorDistance([r, g, b], def.rgb) < COLOR_TOLERANCE) {
      return def.status;
    }
  }
  return null;
}

// ── PDF/Image handling ────────────────────────────────────────────────
async function downloadMap(url, iso2) {
  const isImage = url.match(/\.(jpg|jpeg|png)$/i);
  const downloadPath = `../temp/${iso2}_map${isImage ? '.jpg' : '.pdf'}`;

  console.log('Downloading map...');
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(downloadPath, Buffer.from(buffer));
  console.log(`✓ Downloaded ${(buffer.byteLength / 1024).toFixed(1)} KB`);

  return downloadPath;
}

async function convertToPng(inputPath, iso2) {
  const pngPath = `../temp/${iso2}_map.png`;
  const isImage = inputPath.match(/\.(jpg|jpeg|png)$/i);

  if (isImage) {
    fs.copyFileSync(inputPath, pngPath);
  } else {
    console.log('Converting PDF to PNG...');
    try {
      execSync(`pdftoppm -png -singlefile "${inputPath}" "${pngPath.replace('.png', '')}"`,
        { stdio: 'pipe' });
    } catch (err) {
      execSync(`convert "${inputPath}[0]" "${pngPath}"`, { stdio: 'pipe' });
    }
  }

  return pngPath;
}

// ── Country boundary ──────────────────────────────────────────────────
function loadCountryBounds(iso2) {
  const worldPath = '../data/world_10m.json';
  if (!fs.existsSync(worldPath)) {
    throw new Error('world_10m.json not found');
  }

  const geojson = JSON.parse(fs.readFileSync(worldPath, 'utf8'));

  for (const feature of geojson.features) {
    const props = feature.properties;
    const featureIso2 = props.ISO_A2 || props.iso_a2 || props.ISO2;

    if (featureIso2?.toUpperCase() === iso2.toUpperCase()) {
      const bbox = turf.bbox(feature);
      return {
        minLng: bbox[0],
        minLat: bbox[1],
        maxLng: bbox[2],
        maxLat: bbox[3],
        feature: feature
      };
    }
  }

  throw new Error(`Country ${iso2} not found in world_10m.json`);
}

// ── Single-color detection ───────────────────────────────────────────
async function detectMapType(pngPath) {
  console.log('\nAnalyzing map colors...');

  const image = sharp(pngPath);
  const metadata = await image.metadata();
  const { width, height } = metadata;
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });

  const colorCounts = {};
  const channels = metadata.channels;

  // Sample random points
  for (let i = 0; i < SAMPLE_POINTS; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const idx = (y * width + x) * channels;

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const status = identifyColor(r, g, b);
    if (status) {
      colorCounts[status] = (colorCounts[status] || 0) + 1;
    }
  }

  const totalColored = Object.values(colorCounts).reduce((a, b) => a + b, 0);

  if (totalColored === 0) {
    console.log('⚠ No advisory colors detected in sample');
    return { type: 'unknown', status: null };
  }

  // Find dominant color
  const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  const [dominantStatus, count] = sorted[0];
  const percentage = count / totalColored;

  console.log('Color distribution:');
  for (const [status, cnt] of sorted) {
    const pct = ((cnt / totalColored) * 100).toFixed(1);
    console.log(`  ${status}: ${cnt} samples (${pct}%)`);
  }

  if (percentage >= SINGLE_COLOR_THRESHOLD) {
    console.log(`\n✓ Single-color map detected: ${dominantStatus}`);
    return { type: 'single', status: dominantStatus };
  } else {
    console.log(`\n✓ Mixed advisory map detected`);
    return { type: 'mixed', colors: colorCounts };
  }
}

// ── Grid extraction (for mixed maps) ─────────────────────────────────
async function extractZones(pngPath, countryBounds) {
  console.log('\nExtracting zones with grid sampling...');

  const image = sharp(pngPath);
  const metadata = await image.metadata();
  const { width, height } = metadata;
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });

  const { minLng, minLat, maxLng, maxLat } = countryBounds;
  const lngRange = maxLng - minLng;
  const latRange = maxLat - minLat;

  const cellWidth = width / GRID_SIZE;
  const cellHeight = height / GRID_SIZE;
  const cellLngSize = lngRange / GRID_SIZE;
  const cellLatSize = latRange / GRID_SIZE;

  const zones = {};
  const channels = metadata.channels;

  for (let gridY = 0; gridY < GRID_SIZE; gridY++) {
    for (let gridX = 0; gridX < GRID_SIZE; gridX++) {
      const pixelX = Math.floor(gridX * cellWidth + cellWidth / 2);
      const pixelY = Math.floor(gridY * cellHeight + cellHeight / 2);

      const pixelIndex = (pixelY * width + pixelX) * channels;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];

      const status = identifyColor(r, g, b);

      if (status) {
        const lng1 = minLng + gridX * cellLngSize;
        const lat1 = maxLat - gridY * cellLatSize;
        const lng2 = lng1 + cellLngSize;
        const lat2 = lat1 - cellLatSize;

        const coords = [
          [lng1, lat1],
          [lng2, lat1],
          [lng2, lat2],
          [lng1, lat2],
          [lng1, lat1]
        ];

        if (!zones[status]) zones[status] = [];
        zones[status].push(coords);
      }
    }
  }

  console.log('Zones found:');
  for (const [status, polygons] of Object.entries(zones)) {
    console.log(`  ${status}: ${polygons.length} cells`);
  }

  // Convert to GeoJSON
  const features = [];

  for (const [status, polygons] of Object.entries(zones)) {
    for (const coords of polygons) {
      features.push({
        type: 'Feature',
        properties: { status },
        geometry: {
          type: 'Polygon',
          coordinates: [coords]
        }
      });
    }
  }

  // Clip to country boundary
  const clipped = features.map(f => {
    try {
      const intersection = turf.intersect(
        turf.featureCollection([f, countryBounds.feature])
      );
      return intersection || f;
    } catch (err) {
      return f;
    }
  });

  return {
    type: 'FeatureCollection',
    features: clipped.filter(f => f)
  };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const iso2 = process.argv[2];

  if (!iso2) {
    console.log('Usage: node smart_extract.js <ISO2>');
    console.log('Example: node smart_extract.js IL');
    process.exit(1);
  }

  console.log(`\n🗺️  Processing ${iso2}\n`);

  // Load snapshot
  const snapshot = JSON.parse(fs.readFileSync('../data/snapshot_today.json', 'utf8'));
  const country = snapshot.countries[iso2.toUpperCase()];

  if (!country) {
    console.error(`Country ${iso2} not found`);
    process.exit(1);
  }

  if (!country.has_pdf || !country.pdf_url) {
    console.error(`Country ${iso2} has no PDF map`);
    process.exit(1);
  }

  console.log(`Country: ${country.name}`);
  console.log(`Map URL: ${country.pdf_url}\n`);

  // Setup
  fs.mkdirSync('../temp', { recursive: true });

  // Download and convert
  const downloadPath = await downloadMap(country.pdf_url, iso2);
  const pngPath = await convertToPng(downloadPath, iso2);

  // Load country boundary
  console.log('\nLoading country boundary...');
  const bounds = loadCountryBounds(iso2);
  console.log('✓ Boundary loaded');

  // Detect map type
  const mapType = await detectMapType(pngPath);

  let zones;
  let isSingleColor = false;

  if (mapType.type === 'single') {
    // Single-color: use whole country polygon
    isSingleColor = true;
    zones = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { status: mapType.status },
        geometry: bounds.feature.geometry
      }]
    };
    console.log('\n✓ Using whole country polygon');
  } else if (mapType.type === 'mixed') {
    // Mixed: extract zones
    zones = await extractZones(pngPath, bounds);
  } else {
    console.error('\n❌ Could not determine map type');
    process.exit(1);
  }

  // Save
  const output = {
    country: iso2,
    country_name: country.name,
    generated_at: new Date().toISOString(),
    source: 'FCDO PDF Map',
    map_type: mapType.type,
    single_color: isSingleColor,
    grid_size: isSingleColor ? null : GRID_SIZE,
    zones: zones
  };

  fs.mkdirSync('../data/zones', { recursive: true });
  const outputPath = `../data/zones/${iso2}_zones.json`;
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

  console.log(`\n✅ Done`);
  console.log(`Output: ${outputPath}`);
  console.log(`Type: ${mapType.type}`);
  console.log(`Features: ${zones.features.length}`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
