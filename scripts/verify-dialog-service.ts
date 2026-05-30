import * as fs from 'fs';
import * as path from 'path';
import { TTSProvider } from '../src/middleware/services/tts/types';

/**
 * End-to-end verification of the CONSUMER-FACING public API:
 *   - ttsService.synthesize()        (ElevenLabs single-voice)
 *   - ttsService.synthesizeDialog()  (ElevenLabs + Gemini, via the service)
 *
 * Proves the new abstraction layer works against the real APIs, not just mocks.
 *
 * Usage: npx ts-node scripts/verify-dialog-service.ts [skip-gemini]
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
  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  // Dynamic import AFTER env load so providers initialize with their keys.
  const { ttsService } = await import('../src/middleware/services/tts/tts.service');
  const { supportsDialog } = await import('../src/middleware/services/tts/providers/base-tts-provider');

  console.log('Available providers:', ttsService.getAvailableProviders().join(', '));

  // --- 0. Capability introspection via the public API ---
  const el = ttsService.getProvider(TTSProvider.ELEVENLABS);
  console.log('ElevenLabs supportsDialog:', supportsDialog(el),
    '| caps:', JSON.stringify((el as any).dialogCapabilities));

  // --- 1. ElevenLabs single-voice via ttsService.synthesize() ---
  try {
    const res = await ttsService.synthesize({
      provider: TTSProvider.ELEVENLABS,
      text: 'Behutsam öffnete Leah das Fenster und lauschte der stillen Nacht.',
      voice: { id: 'EXAVITQu4vr4xnSDxMaL' }, // Sarah (premade)
      audio: { format: 'mp3', sampleRate: 44100 },
      providerOptions: { model_id: 'eleven_v3', language_code: 'de' },
    });
    fs.writeFileSync(path.join(outputDir, 'verify-elevenlabs-single.mp3'), res.audio);
    console.log(`✅ ElevenLabs single-voice: ${res.audio.length} bytes, billed ${res.billing.characters}`);
  } catch (e) {
    console.error('❌ ElevenLabs single-voice FAILED:', e instanceof Error ? e.message : e);
  }

  // --- 2. ElevenLabs dialog via ttsService.synthesizeDialog() (service entry) ---
  try {
    const res = await ttsService.synthesizeDialog({
      provider: TTSProvider.ELEVENLABS,
      speakers: [
        { speaker: 'Narrator', voice: 'JBFqnCBsd6RMkjVDRZzb' },
        { speaker: 'Leah', voice: 'EXAVITQu4vr4xnSDxMaL' },
        { speaker: 'Lumi', voice: 'FGY2WhTYpPnrIDTdsKH5' },
      ],
      segments: [{
        turns: [
          { speaker: 'Narrator', text: 'Behutsam öffnete Leah das Fenster.' },
          { speaker: 'Leah', text: '[whispers] Lumi? Bist du da?' },
          { speaker: 'Lumi', text: '[giggles] Ich bin hier, Leah!' },
        ],
      }],
      audio: { format: 'mp3' },
      providerOptions: { model_id: 'eleven_v3', language_code: 'de' },
    });
    fs.writeFileSync(path.join(outputDir, 'verify-elevenlabs-dialog-service.mp3'), res.audio);
    console.log(`✅ ElevenLabs dialog via service: ${res.audio.length} bytes, billed ${res.billing.characters}`);
  } catch (e) {
    console.error('❌ ElevenLabs dialog via service FAILED:', e instanceof Error ? e.message : e);
  }

  // --- 3. Gemini dialog via ttsService.synthesizeDialog() (small, 2 speakers) ---
  if (!process.argv.includes('skip-gemini') && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const res = await ttsService.synthesizeDialog({
        provider: TTSProvider.VERTEX_AI,
        speakers: [
          { speaker: 'Leah', voice: 'Aoede' },
          { speaker: 'Lumi', voice: 'Puck' },
        ],
        segments: [{
          stylePrompt: 'Warme Gutenachtgeschichte, ruhig.',
          turns: [
            { speaker: 'Leah', text: 'Lumi? [short pause] Bist du da?' },
            { speaker: 'Lumi', text: 'Ich bin hier, Leah!' },
          ],
        }],
        voice: { languageCode: 'de-DE' },
        audio: { format: 'mp3' },
        providerOptions: { model: 'gemini-3.1-flash-tts-preview', temperature: 1.0 },
      });
      fs.writeFileSync(path.join(outputDir, 'verify-gemini-dialog-service.mp3'), res.audio);
      console.log(`✅ Gemini dialog via service: ${res.audio.length} bytes, billed ${res.billing.characters}`);
    } catch (e) {
      console.error('❌ Gemini dialog via service FAILED:', e instanceof Error ? e.message : e);
    }
  } else {
    console.log('ℹ️  Skipping Gemini (no creds or skip-gemini flag).');
  }
}

main();
