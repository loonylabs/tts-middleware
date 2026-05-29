import * as fs from 'fs';
import * as path from 'path';
import { TTSProvider, TTSSynthesizeRequest } from '../src/middleware/services/tts/types';

/**
 * Manual test script for the Cartesia TTS provider (Sonic).
 *
 * Usage:
 *   npx ts-node scripts/manual-test-cartesia.ts <voiceId>
 *   npx ts-node scripts/manual-test-cartesia.ts <voiceId> sonic-3
 *
 * Requires: CARTESIA_API_KEY
 *
 * Find a German voice ID with: npx ts-node scripts/list-cartesia-voices.ts
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

async function runSynthesisTest(testName: string, params: TTSSynthesizeRequest, filename: string) {
  const outputDir = path.join(__dirname, '../output');
  const outputPath = path.join(outputDir, filename);
  if (fs.existsSync(outputPath)) {
    console.log(`\n--- Skipping: ${testName} (file exists: ${filename}) ---`);
    return;
  }
  const { ttsService } = await import('../src/middleware/services/tts/tts.service');
  console.log(`\n--- Running Test: ${testName} ---`);
  console.log(`Text length: ${params.text.length} chars | Voice: ${params.voice.id}`);
  try {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    const startTime = Date.now();
    const response = await ttsService.synthesize(params);
    const duration = Date.now() - startTime;
    fs.writeFileSync(outputPath, response.audio);
    console.log(`✅ Success! Output: ${outputPath}`);
    console.log(`   - Latency: ${duration}ms | Audio: ${response.audio.length} bytes | Format: ${response.metadata.audioFormat}`);
  } catch (error) {
    console.error(`❌ Test '${testName}' Failed:`, error instanceof Error ? error.message : error);
  }
}

async function main() {
  loadEnv();
  if (!process.env.CARTESIA_API_KEY) {
    console.error('❌ CARTESIA_API_KEY is not set in .env');
    process.exit(1);
  }

  const voiceId = process.argv[2];
  const model = process.argv[3] || 'sonic-3.5';
  const label = process.argv[4] || voiceId.slice(0, 8);
  if (!voiceId) {
    console.error('❌ Missing voice ID. Usage: npx ts-node scripts/manual-test-cartesia.ts <voiceId> [model]');
    console.error('   List German voices: npx ts-node scripts/list-cartesia-voices.ts');
    process.exit(1);
  }

  const germanText =
    'Behutsam öffnete Leah das Fenster. Die kühle Nachtluft strömte herein und brachte den Duft von feuchtem Gras mit sich. "Lumi? Was ist denn passiert?", flüsterte sie mit besorgter Stimme. Das Glühwürmchen landete auf ihrer Handfläche. Seine Beinchen fühlten sich an wie zarte Seidenfäden.\n\n"Leah, ich... ich schaffe es nicht allein", piepste Lumi so leise, dass sie sich weit vorbeugen musste. "Ich muss zum Sterne-Atelier. Der neue Abendstern wartet auf mich. Ohne mein Licht bleibt der Himmel heute Nacht dunkel. Aber der Weg ist so weit und die Milchstraße so groß!"\n\nLeah spürte, wie ihr Herz schneller schlug. Das war der Ruf zu ihrer geheimen Nachtschicht. Sie strich Lumi vorsichtig mit der Fingerspitze über den Rücken. "Hab keine Angst, kleiner Freund. Ich bin bei dir. Gemeinsam finden wir den Weg."';

  // Explicitly tuned per request (overrides any provider defaults).
  await runSynthesisTest(
    `Cartesia ${model} (de, ${label}, tuned)`,
    {
      text: germanText,
      provider: TTSProvider.CARTESIA,
      voice: { id: voiceId },
      // A tick slower than default + sentence/paragraph pauses for narration.
      audio: { format: 'mp3', sampleRate: 44100, speed: 0.9 },
      providerOptions: {
        model,
        language: 'de',
        sentencePauseMs: 300,
        paragraphPauseMs: 700,
      },
    },
    `cartesia-de-${label}-${model}-tuned.mp3`
  );

  // Relies ONLY on provider defaults (CARTESIA_DEFAULT_* env vars).
  // No speed/pause options in the request — should sound like "tuned".
  await runSynthesisTest(
    `Cartesia ${model} (de, ${label}, env-defaults)`,
    {
      text: germanText,
      provider: TTSProvider.CARTESIA,
      voice: { id: voiceId },
      audio: { format: 'mp3', sampleRate: 44100 },
      providerOptions: { model, language: 'de' },
    },
    `cartesia-de-${label}-${model}-defaults.mp3`
  );
}

main();
