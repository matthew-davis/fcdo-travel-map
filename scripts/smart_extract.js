#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import sharp from 'sharp';
 
const ROOT = process.cwd();
const TEMP_DIR = path.join(ROOT, 'temp');
const DATA_DIR = path.join(ROOT, 'data');
const MAPS_DIR = path.join(DATA_DIR, 'maps');
const SNAPSHOT_PATH = path.join(DATA_DIR, 'snapshot_today.json');
 
const PIXEL_SKIP = 3;
const MIN_PIXELS_THRESHOLD = 30;
const COLOR_TOLERANCE = 35;
 
const COLORS = {
  avoid_all: { rgb: [230, 82, 54], status: 'avoid_all' },
  avoid_essential: { rgb: [252, 185, 19], status: 'avoid_all_but_essential' },
  no_warning: { rgb: [197, 213, 80], status: null },
};

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
      return name;
    }
  }
  return null;
}

async function downloadAndConvert(url, iso2, date) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  
  const isImage = url.match(/\.(jpg|jpeg|png)$/i);
  const tempPath = path.join(TEMP_DIR, `${iso2}_download${isImage ? '.jpg' : '.pdf'}`);
  
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(tempPath, Buffer.from(buffer));
  let jpgPath = path.join(TEMP_DIR, `${iso2}_temp.jpg`);
  
  if (isImage) {
    fs.copyFileSync(tempPath, jpgPath);
  } else {
    try {
      execSync(`pdftoppm -jpeg -singlefile "${tempPath}" "${jpgPath.replace('.jpg', '')}"`, 
        { stdio: 'pipe' });
    } catch (err) {
      execSync(`convert "${tempPath}[0]" "${jpgPath}"`, { stdio: 'pipe' });
    }
  }

  const finalJpgPath = path.join(MAPS_DIR, `${iso2}_${date}.jpg`);
  
  return { jpgPath, finalJpgPath, tempPath };
}

async function scanImageColors(jpgPath) {
  const image = sharp(jpgPath);
  const metadata = await image.metadata();
  const { width, height } = metadata;
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  
  const colorCounts = {};
  const channels = metadata.channels;
  
  let pixelsChecked = 0;
  for (let y = 0; y < height; y += PIXEL_SKIP) {
    for (let x = 0; x < width; x += PIXEL_SKIP) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      const colorName = identifyColor(r, g, b);
      if (colorName) {
        colorCounts[colorName] = (colorCounts[colorName] || 0) + 1;
      }
      pixelsChecked++;
    }
  }
  
  const significant = Object.entries(colorCounts)
    .filter(([_, count]) => count >= MIN_PIXELS_THRESHOLD)
    .map(([name]) => name);
  
  return significant;
}

function determineStatus(detectedColors) {
  const warnings = detectedColors.filter(c => c !== 'no_warning');
  
  if (warnings.length === 0) {
    return { type: 'no_warning', status: null };
  }
  
  if (warnings.length === 1) {
    const status = COLORS[warnings[0]].status;
    return { type: 'single', status };
  }
  
  return { type: 'mixed', status: 'some_parts' };
}

async function main() {
  const iso2 = process.argv[2];
  
  if (!iso2) {
    console.log('Usage: node scripts/smart_extract.js <ISO2>');
    console.log('Example: node scripts/smart_extract.js IL');
    console.log('\nMUST BE RUN FROM PROJECT ROOT');
    process.exit(1);
  }
  
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error(`❌ ${SNAPSHOT_PATH} not found`);
    console.error('Make sure you run this from the project root directory');
    process.exit(1);
  }
  
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const country = snapshot.countries[iso2.toUpperCase()];
  
  if (!country) {
    console.error(`❌ Country ${iso2} not found in snapshot`);
    process.exit(1);
  }
  
  if (!country.has_pdf || !country.pdf_url) {
    console.error(`❌ Country ${iso2} has no PDF map`);
    process.exit(1);
  }
  
  const today = new Date().toISOString().slice(0, 10);
  const { jpgPath, finalJpgPath, tempPath } = await downloadAndConvert(country.pdf_url, iso2, today);
  const detectedColors = await scanImageColors(jpgPath);
  determineStatus(detectedColors);
  
  const warnings = detectedColors.filter(c => c !== 'no_warning');
  const needsMap = warnings.length > 1 || (warnings.length === 1 && detectedColors.includes('no_warning'));
  
  if (needsMap) {
    fs.mkdirSync(MAPS_DIR, { recursive: true });
    fs.copyFileSync(jpgPath, finalJpgPath);
  }

  fs.unlinkSync(tempPath);
  fs.unlinkSync(jpgPath);
}
 
main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
