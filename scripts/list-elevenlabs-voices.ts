import * as fs from 'fs';
import * as path from 'path';

/**
 * Lists available ElevenLabs voices (voice_id + name + labels).
 *
 * Usage:
 *   npx ts-node scripts/list-elevenlabs-voices.ts
 *
 * Requires: ELEVENLABS_API_KEY
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
  const key = process.env.ELEVENLABS_API_KEY || '';
  if (!key) {
    console.error('❌ ELEVENLABS_API_KEY is not set in .env');
    process.exit(1);
  }

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': key },
  });
  if (!res.ok) {
    console.error(`❌ /voices error (${res.status}): ${await res.text()}`);
    process.exit(1);
  }

  const data: any = await res.json();
  const voices: any[] = data.voices || [];
  console.log(`Total voices: ${voices.length}\n`);
  voices.forEach((v) => {
    const labels = v.labels || {};
    const desc = [labels.gender, labels.accent, labels.description, labels.use_case]
      .filter(Boolean)
      .join(', ');
    console.log(`${(v.voice_id || '').padEnd(24)} | ${(v.category || '').padEnd(12)} | ${(v.name || '').padEnd(18)} | ${desc}`);
  });
}

main();
