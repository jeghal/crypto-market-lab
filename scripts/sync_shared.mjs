import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const header = '// GENERATED from shared/. Do not edit; run node scripts/sync_shared.mjs.\n';
const targets = {
  'shared/market-core.js': ['trading-dashboard/dashboard/market-core.js', 'ATLASFLOW/js/core/market-core.js', 'data_pipeline/assets/js/market-core.js', 'trading-dashboard/radar/assets/js/market-core.js'],
  'shared/pipeline/api.js': ['data_pipeline/assets/js/api.js', 'trading-dashboard/radar/assets/js/api.js'],
  'shared/pipeline/collectors.js': ['data_pipeline/assets/js/collectors.js', 'trading-dashboard/radar/assets/js/collectors.js'],
  'shared/pipeline/transforms.js': ['data_pipeline/assets/js/transforms.js', 'trading-dashboard/radar/assets/js/transforms.js'],
};
let failures = 0;
for (const [source, destinations] of Object.entries(targets)) {
  const body = fs.readFileSync(path.join(root, source), 'utf8').replace(/\r\n/g, '\n');
  for (const destination of destinations) {
    const profile = destination.endsWith('/transforms.js') ? `globalThis.BinancePipelineProfile = ${JSON.stringify(destination.startsWith('data_pipeline/') ? { limits:[100,300,400,500] } : { limits:[150,400,500,700] })};\n` : '';
    const expected = header + profile + body;
    const target = path.join(root, destination);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== expected) { console.error(`Out of sync: ${destination}`); failures++; }
    } else { fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target, expected); }
  }
}
if (failures) process.exitCode = 1;
else console.log(check ? 'Shared generated files are synchronized.' : 'Shared files generated.');
