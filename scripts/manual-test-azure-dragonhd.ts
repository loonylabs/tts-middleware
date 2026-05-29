import * as fs from 'fs';
import * as path from 'path';
import { TTSProvider, TTSSynthesizeRequest } from '../src/middleware/services/tts/types';

/**
 * Manual test script for Azure Speech – Dragon HD voices (EU / West Europe)
 *
 * Usage:
 *   npx ts-node scripts/manual-test-azure-dragonhd.ts          - Run all tests
 *   npx ts-node scripts/manual-test-azure-dragonhd.ts baseline - Standard Neural baseline only
 *   npx ts-node scripts/manual-test-azure-dragonhd.ts hd       - Dragon HD voices only
 *
 * Requires:
 *   - AZURE_SPEECH_KEY
 *   - AZURE_SPEECH_REGION  (must be westeurope for Dragon HD availability)
 */

// Simple .env parser since dotenv might not be installed
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const envConfig = fs.readFileSync(envPath, 'utf8');
      envConfig.split('\n').forEach((line) => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      console.log('.env file loaded from root.');
    } else {
      console.warn('No .env file found in root. Relying on system environment variables.');
    }
  } catch (error) {
    console.error('Error loading .env file:', error);
  }
}

async function runSynthesisTest(
  testName: string,
  params: TTSSynthesizeRequest,
  filename: string
) {
  const outputDir = path.join(__dirname, '../output');
  const outputPath = path.join(outputDir, filename);

  if (fs.existsSync(outputPath)) {
    console.log(`\n--- Skipping: ${testName} (file exists: ${filename}) ---`);
    return;
  }

  // Dynamically import ttsService to ensure env vars are loaded first
  const { ttsService } = await import('../src/middleware/services/tts/tts.service');

  console.log(`\n--- Running Test: ${testName} ---`);
  console.log(`Text length: ${params.text.length} chars`);
  console.log(`Voice: ${params.voice.id}`);

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const startTime = Date.now();
    const response = await ttsService.synthesize(params);
    const duration = Date.now() - startTime;

    fs.writeFileSync(outputPath, response.audio);

    console.log(`✅ Success!`);
    console.log(`   - Output: ${outputPath}`);
    console.log(`   - Billed chars: ${response.billing.characters}`);
    console.log(`   - Latency: ${duration}ms`);
    console.log(`   - Audio size: ${response.audio.length} bytes`);
    console.log(`   - Audio format: ${response.metadata.audioFormat}`);
    console.log(`   - Audio duration: ${response.metadata.audioDuration ?? 'N/A'}ms`);
  } catch (error) {
    console.error(`❌ Test '${testName}' Failed:`, error instanceof Error ? error.message : error);
  }
}

async function main() {
  loadEnv();

  if (!process.env.AZURE_SPEECH_KEY) {
    console.error('❌ Error: AZURE_SPEECH_KEY is not set.');
    process.exit(1);
  }
  if (!process.env.AZURE_SPEECH_REGION) {
    console.error('❌ Error: AZURE_SPEECH_REGION is not set.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const runBaseline = args.length === 0 || args.includes('baseline');
  const runHd = args.length === 0 || args.includes('hd');
  const runOmni = args.length === 0 || args.includes('omni');

  console.log('Usage: npx ts-node scripts/manual-test-azure-dragonhd.ts [baseline] [hd]');
  console.log(`Region: ${process.env.AZURE_SPEECH_REGION}`);

  const germanText =
    'Behutsam öffnete Leah das Fenster. Die kühle Nachtluft strömte herein und brachte den Duft von feuchtem Gras mit sich. "Lumi? Was ist denn passiert?", flüsterte sie mit besorgter Stimme. Das Glühwürmchen landete auf ihrer Handfläche. Seine Beinchen fühlten sich an wie zarte Seidenfäden.\n\n"Leah, ich... ich schaffe es nicht allein", piepste Lumi so leise, dass sie sich weit vorbeugen musste. "Ich muss zum Sterne-Atelier. Der neue Abendstern wartet auf mich. Ohne mein Licht bleibt der Himmel heute Nacht dunkel. Aber der Weg ist so weit und die Milchstraße so groß!"\n\nLeah spürte, wie ihr Herz schneller schlug. Das war der Ruf zu ihrer geheimen Nachtschicht. Sie strich Lumi vorsichtig mit der Fingerspitze über den Rücken. "Hab keine Angst, kleiner Freund. Ich bin bei dir. Gemeinsam finden wir den Weg."';
  const englishText =
    'Good evening. This is a test of the Azure Dragon HD voice running in the West Europe region.';

  // Baseline: standard Neural voice – confirms the Azure pipeline works at all
  if (runBaseline) {
    await runSynthesisTest(
      'Baseline (de-DE-KatjaNeural, Standard)',
      {
        text: germanText,
        provider: TTSProvider.AZURE,
        voice: { id: 'de-DE-KatjaNeural' },
        audio: { format: 'mp3' },
      },
      'azure-de-katja-standard.mp3'
    );
  }

  // Dragon HD voices – the actual goal (Gemini-Flash-tier quality, EU resident)
  if (runHd) {
    await runSynthesisTest(
      'Dragon HD (de-DE-Seraphina:DragonHDLatestNeural)',
      {
        text: germanText,
        provider: TTSProvider.AZURE,
        voice: { id: 'de-DE-Seraphina:DragonHDLatestNeural' },
        audio: { format: 'mp3' },
      },
      'azure-de-seraphina-dragonhd.mp3'
    );

    await runSynthesisTest(
      'Dragon HD (en-US-Ava:DragonHDLatestNeural)',
      {
        text: englishText,
        provider: TTSProvider.AZURE,
        voice: { id: 'en-US-Ava:DragonHDLatestNeural' },
        audio: { format: 'mp3' },
      },
      'azure-en-ava-dragonhd.mp3'
    );
  }

  // Dragon HD Omni – newest model (audiobook/storytelling tier).
  // Fair render: clean SSML (no <prosody>) + tuned temperature.
  if (runOmni) {
    await runSynthesisTest(
      'Omni neutral, temperature=0.8 (de-DE-Seraphina)',
      {
        text: germanText,
        provider: TTSProvider.AZURE,
        voice: { id: 'de-DE-Seraphina:DragonHDOmniLatestNeural' },
        audio: { format: 'mp3' },
        providerOptions: { temperature: 0.8 },
      },
      'azure-de-seraphina-omni-fair.mp3'
    );

    // Free-text style description (the Gemini-like control), Omni only
    await runSynthesisTest(
      'Omni free-text style (warm bedtime storytelling)',
      {
        text: germanText,
        provider: TTSProvider.AZURE,
        voice: { id: 'de-DE-Seraphina:DragonHDOmniLatestNeural' },
        audio: { format: 'mp3' },
        providerOptions: {
          temperature: 0.8,
          style: 'warm, tender bedtime storytelling for a child',
        },
      },
      'azure-de-seraphina-omni-style-bedtime.mp3'
    );
  }
}

main();
