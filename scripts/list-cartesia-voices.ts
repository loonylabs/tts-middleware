import * as fs from 'fs';
import * as path from 'path';

/**
 * Lists available Cartesia voices, filtered to German (de) by default.
 *
 * Usage:
 *   npx ts-node scripts/list-cartesia-voices.ts        - German voices
 *   npx ts-node scripts/list-cartesia-voices.ts all     - All voices
 *   npx ts-node scripts/list-cartesia-voices.ts en      - English voices
 *
 * Requires: CARTESIA_API_KEY
 */

function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^['"](.*)['"]$/, '$1');
    }
  });
}

async function main() {
  loadEnv();
  const key = process.env.CARTESIA_API_KEY || '';
  const version = process.env.CARTESIA_VERSION || '2026-03-01';
  if (!key) {
    console.error('❌ CARTESIA_API_KEY is not set in .env');
    process.exit(1);
  }

  const filter = (process.argv[2] || 'de').toLowerCase();

  const res = await fetch('https://api.cartesia.ai/voices?limit=200', {
    headers: {
      Authorization: `Bearer ${key}`,
      'Cartesia-Version': version,
    },
  });

  if (!res.ok) {
    console.error(`❌ Cartesia /voices error (${res.status}): ${await res.text()}`);
    process.exit(1);
  }

  const data: any = await res.json();
  const voices: any[] = Array.isArray(data) ? data : data.data || [];
  console.log(`Total voices returned: ${voices.length}`);

  const selected =
    filter === 'all'
      ? voices
      : voices.filter((v) => (v.language || '').toLowerCase().startsWith(filter));

  console.log(`\n=== Voices (filter: ${filter}) — ${selected.length} ===`);
  selected.forEach((v) => {
    console.log(`${(v.id || '').padEnd(40)} | ${(v.language || '').padEnd(4)} | ${v.name || ''}`);
  });
}

main();
