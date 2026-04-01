#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
 
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const CURRENT_SNAPSHOT = path.join(DATA_DIR, 'snapshot_today.json');
const INDEX_PATH = path.join(DATA_DIR, 'snapshot_index.json');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
 
async function main() {
  if (!fs.existsSync(CURRENT_SNAPSHOT)) {
    console.error(`❌ ${CURRENT_SNAPSHOT} not found`);
    console.error('Make sure you run this from the project root directory');
    process.exit(1);
  }
  
  const current = JSON.parse(fs.readFileSync(CURRENT_SNAPSHOT, 'utf8'));
  
  let previous = null;
  if (fs.existsSync(INDEX_PATH)) {
    const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    if (index.dates && index.dates.length > 1) {
      const prevDate = index.dates[1];
      const prevPath = path.join(SNAPSHOTS_DIR, `snapshot_${prevDate}.json`);
      if (fs.existsSync(prevPath)) {
        previous = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
      }
    }
  }
  
  if (!previous) {
    previous = { countries: {} };
  }
  
  const toProcess = [];
  
  for (const [iso2, currentData] of Object.entries(current.countries)) {
    const prevData = previous.countries[iso2];
    
    if (!currentData.has_pdf) continue;
    
    let changed = false;
    let reason = '';
    
    if (!prevData) {
      changed = true;
      reason = 'new country';
    } else if (prevData.status !== currentData.status) {
      changed = true;
      reason = `status: ${prevData.status} → ${currentData.status}`;
    } else if (prevData.updated_at !== currentData.updated_at) {
      changed = true;
      reason = 'FCDO page updated';
    }
    
    if (changed) {
      toProcess.push({
        iso2,
        name: currentData.name,
        reason
      });
    }
  }
  
  if (toProcess.length === 0) {
    return;
  }
  
  let succeeded = 0;
  let failed = 0;
  
  for (let i = 0; i < toProcess.length; i++) {
    const { iso2, name } = toProcess[i];
    
    try {
      execSync(`node scripts/smart_extract.js ${iso2}`, {
        stdio: 'inherit',
        cwd: ROOT
      });
      succeeded++;
    } catch (err) {
      console.error(`❌ Failed to process ${iso2}\n`);
      failed++;
    }
  }
}
 
main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
