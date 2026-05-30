import * as fs from 'fs';
import * as path from 'path';
import { TTSProvider, TTSSynthesizeRequest } from '../src/middleware/services/tts/types';

/**
 * Manual test script for the ElevenLabs provider (benchmark/test-only).
 *
 * Usage:
 *   npx ts-node scripts/manual-test-elevenlabs.ts [voiceId] [model] [label]
 *
 * Defaults: voiceId = Rachel (premade), model = eleven_multilingual_v2.
 * Requires: ELEVENLABS_API_KEY (with text_to_speech permission).
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
    console.log(`   - Latency: ${duration}ms | Audio: ${response.audio.length} bytes`);
  } catch (error) {
    console.error(`❌ Test '${testName}' Failed:`, error instanceof Error ? error.message : error);
  }
}

async function main() {
  loadEnv();
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY is not set in .env');
    process.exit(1);
  }

  // Rachel — a premade voice available to all accounts (no voices_read needed).
  const voiceId = process.argv[2] || '21m00Tcm4TlvDq8ikWAM';
  const model = process.argv[3] || 'eleven_multilingual_v2';
  const label = process.argv[4] || model.replace(/^eleven_/, '');

  const germanText =
    'Behutsam öffnete Leah das Fenster. Die kühle Nachtluft strömte herein und brachte den Duft von feuchtem Gras mit sich. "Lumi? Was ist denn passiert?", flüsterte sie mit besorgter Stimme. Das Glühwürmchen landete auf ihrer Handfläche. Seine Beinchen fühlten sich an wie zarte Seidenfäden.\n\n"Leah, ich... ich schaffe es nicht allein", piepste Lumi so leise, dass sie sich weit vorbeugen musste. "Ich muss zum Sterne-Atelier. Der neue Abendstern wartet auf mich. Ohne mein Licht bleibt der Himmel heute Nacht dunkel. Aber der Weg ist so weit und die Milchstraße so groß!"\n\nLeah spürte, wie ihr Herz schneller schlug. Das war der Ruf zu ihrer geheimen Nachtschicht. Sie strich Lumi vorsichtig mit der Fingerspitze über den Rücken. "Hab keine Angst, kleiner Freund. Ich bin bei dir. Gemeinsam finden wir den Weg."';

  await runSynthesisTest(
    `ElevenLabs ${model} (de)`,
    {
      text: germanText,
      provider: TTSProvider.ELEVENLABS,
      voice: { id: voiceId },
      audio: { format: 'mp3', sampleRate: 44100 },
      providerOptions: { model_id: model, language_code: 'de' },
    },
    `elevenlabs-de-${label}.mp3`
  );
}

main();
