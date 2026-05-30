import * as fs from 'fs';
import * as path from 'path';
import { ElevenLabsProvider } from '../src/middleware/services/tts/providers/elevenlabs-provider';
import type { SynthesizeDialogRequest } from '../src/middleware/services/tts/types';

/**
 * Manual test for ElevenLabs Text to Dialogue (eleven_v3) — multi-speaker.
 *
 * Demonstrates:
 *   - 3 speakers (Narrator + Leah + Lumi) in a SINGLE Text-to-Dialogue call
 *     (ElevenLabs has no 2-speaker limit, unlike Gemini)
 *   - Inline audio tags ([whispers], [giggles], [sighs], …)
 *
 * Usage:
 *   npx ts-node scripts/manual-test-elevenlabs-dialog.ts
 *
 * Requires: ELEVENLABS_API_KEY (paid plan — library voices need Starter+).
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

/**
 * 3-speaker scene using ElevenLabs premade voices (voice IDs):
 *   - Narrator: George  (JBFqnCBsd6RMkjVDRZzb) — warm storyteller
 *   - Leah:     Sarah   (EXAVITQu4vr4xnSDxMaL) — warm female
 *   - Lumi:     Laura   (FGY2WhTYpPnrIDTdsKH5) — bright, quirky
 */
function buildDialogRequest(): SynthesizeDialogRequest {
  return {
    speakers: [
      { speaker: 'Narrator', voice: 'JBFqnCBsd6RMkjVDRZzb' },
      { speaker: 'Leah', voice: 'EXAVITQu4vr4xnSDxMaL' },
      { speaker: 'Lumi', voice: 'FGY2WhTYpPnrIDTdsKH5' },
    ],
    segments: [
      {
        turns: [
          {
            speaker: 'Narrator',
            text:
              'Behutsam öffnete Leah das Fenster. Die kühle Nachtluft strömte herein und brachte den Duft von feuchtem Gras mit sich.',
          },
          {
            speaker: 'Leah',
            text: '[whispers] Lumi? Was ist denn passiert?',
          },
          {
            speaker: 'Lumi',
            text:
              '[sighs] Leah, ich... ich schaffe es nicht allein. Ich muss zum Sterne-Atelier. Der neue Abendstern wartet auf mich.',
          },
          {
            speaker: 'Leah',
            text:
              'Hab keine Angst, kleiner Freund. [softly] Ich bin bei dir. Gemeinsam finden wir den Weg.',
          },
          {
            speaker: 'Lumi',
            text: '[giggles] Wirklich? Dann kann der Himmel heute Nacht doch noch leuchten!',
          },
          {
            speaker: 'Narrator',
            text: 'Und so machten sich die beiden auf den Weg, hinaus in die funkelnde Milchstraße.',
          },
        ],
      },
    ],
    voice: { languageCode: 'de' },
    audio: { format: 'mp3' },
    providerOptions: { model_id: 'eleven_v3', language_code: 'de', stability: 0.5 },
  };
}

async function main() {
  loadEnv();
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY is not set in .env');
    process.exit(1);
  }

  const outputDir = path.join(__dirname, '../output');
  const outputPath = path.join(outputDir, 'elevenlabs-dialog-demo.mp3');
  if (fs.existsSync(outputPath)) {
    console.log(`\nℹ️  Output already exists: ${outputPath} (delete to re-synthesize).`);
    return;
  }
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const provider = new ElevenLabsProvider();
  const request = buildDialogRequest();

  const totalChars = request.segments
    .flatMap((s) => s.turns)
    .reduce((sum, t) => sum + t.text.length, 0);

  console.log('\n=== ElevenLabs Dialog Request ===');
  console.log(`Speakers: ${request.speakers.map((s) => `${s.speaker}(${s.voice.slice(0, 8)}…)`).join(', ')}`);
  console.log(`Turns: ${request.segments.flatMap((s) => s.turns).length} | Total chars: ${totalChars}`);
  console.log('--- Synthesizing dialog... ---');

  const startTime = Date.now();
  try {
    const response = await provider.synthesizeDialog(request);
    const duration = Date.now() - startTime;
    fs.writeFileSync(outputPath, response.audio);

    console.log('\n✅ Success!');
    console.log(`   Output:        ${outputPath}`);
    console.log(`   Audio size:    ${response.audio.length.toLocaleString()} bytes`);
    console.log(`   Audio dur.:    ${response.metadata.audioDuration ? `${(response.metadata.audioDuration / 1000).toFixed(2)}s` : 'N/A'}`);
    console.log(`   Latency:       ${duration}ms`);
    console.log(`   Billed chars:  ${response.billing.characters}`);
    console.log(`   Voices:        ${response.metadata.voice}`);
  } catch (error) {
    console.error('\n❌ Dialog synthesis failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
