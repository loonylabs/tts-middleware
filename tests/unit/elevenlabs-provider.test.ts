/**
 * Tests for ElevenLabs TTS Provider
 *
 * @description Tests the ElevenLabs provider (benchmark/test-only): request
 * shaping, output-format mapping, voice_settings, and error handling.
 * @coverage Target: >90%
 */

import type {
  TTSSynthesizeRequest,
  SynthesizeDialogRequest,
} from '../../src/middleware/services/tts/types';
import { TTSProvider } from '../../src/middleware/services/tts/types';
import { ElevenLabsProvider } from '../../src/middleware/services/tts/providers/elevenlabs-provider';
import {
  InvalidConfigError,
  supportsDialog,
} from '../../src/middleware/services/tts/providers/base-tts-provider';

global.fetch = jest.fn();

function lastCall() {
  const calls = (fetch as jest.Mock).mock.calls;
  return calls[calls.length - 1];
}
function sentBody(): Record<string, any> {
  return JSON.parse(lastCall()[1].body);
}
function calledUrl(): string {
  return lastCall()[0] as string;
}

describe('ElevenLabsProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ELEVENLABS_API_KEY = 'xi-test-key';
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1500),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const VOICE = '21m00Tcm4TlvDq8ikWAM';
  const req = (overrides: Partial<TTSSynthesizeRequest> = {}): TTSSynthesizeRequest => ({
    text: 'Hallo Welt.',
    voice: { id: VOICE },
    audio: { format: 'mp3', sampleRate: 44100 },
    ...overrides,
  });

  describe('Constructor and Configuration', () => {
    test('initializes from environment variable', () => {
      const provider = new ElevenLabsProvider();
      expect(provider.getProviderName()).toBe(TTSProvider.ELEVENLABS);
    });

    test('initializes with provided API key', () => {
      const provider = new ElevenLabsProvider({ apiKey: 'custom' });
      expect(provider.getProviderName()).toBe(TTSProvider.ELEVENLABS);
    });

    test('throws InvalidConfigError if API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;
      expect(() => new ElevenLabsProvider()).toThrow(InvalidConfigError);
      expect(() => new ElevenLabsProvider()).toThrow(/API key is required/i);
    });

    test('logs initialization info', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      new ElevenLabsProvider();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ElevenLabs provider initialized'),
        expect.objectContaining({ hasApiKey: true })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Synthesize - Basic', () => {
    test('synthesizes successfully with metadata + billing', async () => {
      const provider = new ElevenLabsProvider();
      const result = await provider.synthesize('Hallo Welt.', VOICE, req());
      expect(result.audio).toBeInstanceOf(Buffer);
      expect(result.audio.length).toBe(1500);
      expect(result.metadata.provider).toBe(TTSProvider.ELEVENLABS);
      expect(result.metadata.voice).toBe(VOICE);
      expect(result.metadata.audioFormat).toBe('mp3');
      expect(result.billing.characters).toBe('Hallo Welt.'.length);
    });

    test('sends voice ID in URL with output_format and xi-api-key header', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize('Hallo Welt.', VOICE, req());
      expect(calledUrl()).toBe(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`
      );
      expect(lastCall()[1].headers['xi-api-key']).toBe('xi-test-key');
      expect(lastCall()[1].headers['Accept']).toBe('audio/mpeg');
    });

    test('defaults model to eleven_multilingual_v2', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize('Hallo Welt.', VOICE, req());
      expect(sentBody().model_id).toBe('eleven_multilingual_v2');
    });

    test('uses eleven_v3 when requested', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize(
        'Hallo Welt.',
        VOICE,
        req({ providerOptions: { model_id: 'eleven_v3' } })
      );
      expect(sentBody().model_id).toBe('eleven_v3');
    });
  });

  describe('Request shaping', () => {
    test('includes language_code when provided', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize(
        'Hallo Welt.',
        VOICE,
        req({ providerOptions: { language_code: 'de' } })
      );
      expect(sentBody().language_code).toBe('de');
    });

    test('omits voice_settings when no settings provided', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize('Hallo Welt.', VOICE, req());
      expect(sentBody().voice_settings).toBeUndefined();
    });

    test('builds voice_settings from provided fields', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize(
        'Hallo Welt.',
        VOICE,
        req({
          providerOptions: {
            stability: 0.4,
            similarity_boost: 0.8,
            style: 0.2,
            speaker_boost: false,
          },
        })
      );
      expect(sentBody().voice_settings).toEqual({
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: false,
      });
    });

    test('falls back to use_speaker_boost alias', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize(
        'Hallo Welt.',
        VOICE,
        req({ providerOptions: { use_speaker_boost: true } })
      );
      expect(sentBody().voice_settings.use_speaker_boost).toBe(true);
    });
  });

  describe('Output format mapping', () => {
    test('mp3 @ 22050 maps to mp3_22050_32', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize(
        'Hallo Welt.',
        VOICE,
        req({ audio: { format: 'mp3', sampleRate: 22050 } })
      );
      expect(calledUrl()).toContain('output_format=mp3_22050_32');
    });

    test('opus maps to opus_48000_128', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize(
        'Hallo Welt.',
        VOICE,
        req({ audio: { format: 'opus' } })
      );
      expect(calledUrl()).toContain('output_format=opus_48000_128');
    });

    test('explicit outputFormat overrides mapping', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesize(
        'Hallo Welt.',
        VOICE,
        req({ providerOptions: { outputFormat: 'mp3_44100_192' } })
      );
      expect(calledUrl()).toContain('output_format=mp3_44100_192');
    });
  });

  describe('Error handling', () => {
    test('throws on non-ok API response', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 402,
        text: async () => 'paid_plan_required',
      });
      const provider = new ElevenLabsProvider();
      await expect(
        provider.synthesize('Hallo Welt.', VOICE, req())
      ).rejects.toThrow();
    });
  });

  describe('Dialog (Text to Dialogue)', () => {
    const dialogReq = (
      overrides: Partial<SynthesizeDialogRequest> = {}
    ): SynthesizeDialogRequest => ({
      speakers: [
        { speaker: 'Narrator', voice: 'voice-narrator' },
        { speaker: 'Leah', voice: 'voice-leah' },
      ],
      segments: [
        {
          turns: [
            { speaker: 'Narrator', text: 'Es war einmal.' },
            { speaker: 'Leah', text: '[whispers] Hallo?' },
          ],
        },
      ],
      providerOptions: { model_id: 'eleven_v3', language_code: 'de' },
      ...overrides,
    });

    test('declares dialog capabilities (10 speakers, no style prompt)', () => {
      const provider = new ElevenLabsProvider();
      expect(supportsDialog(provider)).toBe(true);
      expect(provider.dialogCapabilities.maxSpeakers).toBe(10);
      expect(provider.dialogCapabilities.supportsStylePrompt).toBe(false);
      expect(provider.dialogCapabilities.supportsAudioTags).toBe(true);
    });

    test('sends a single Text-to-Dialogue call mapping speakers to voice IDs', async () => {
      const provider = new ElevenLabsProvider();
      const result = await provider.synthesizeDialog(dialogReq());

      expect((fetch as jest.Mock).mock.calls).toHaveLength(1);
      expect(calledUrl()).toBe(
        'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128'
      );
      const body = sentBody();
      expect(body.model_id).toBe('eleven_v3');
      expect(body.language_code).toBe('de');
      expect(body.inputs).toEqual([
        { text: 'Es war einmal.', voice_id: 'voice-narrator' },
        { text: '[whispers] Hallo?', voice_id: 'voice-leah' },
      ]);
      // Billing sums all turn characters.
      expect(result.billing.characters).toBe(
        'Es war einmal.'.length + '[whispers] Hallo?'.length
      );
      expect(result.metadata.provider).toBe(TTSProvider.ELEVENLABS);
    });

    test('throws on unknown speaker alias', async () => {
      const provider = new ElevenLabsProvider();
      await expect(
        provider.synthesizeDialog(
          dialogReq({
            segments: [{ turns: [{ speaker: 'Ghost', text: 'Buh!' }] }],
          })
        )
      ).rejects.toThrow(/unknown speaker/i);
    });

    test('throws when more than 10 distinct voices are used', async () => {
      const speakers = Array.from({ length: 11 }, (_, i) => ({
        speaker: `S${i}`,
        voice: `voice-${i}`,
      }));
      const turns = speakers.map((s) => ({ speaker: s.speaker, text: 'Hi.' }));
      const provider = new ElevenLabsProvider();
      await expect(
        provider.synthesizeDialog(dialogReq({ speakers, segments: [{ turns }] }))
      ).rejects.toThrow(/at most 10/i);
    });

    test('chunks long dialogs into multiple calls and concatenates audio', async () => {
      const provider = new ElevenLabsProvider();
      const longText = 'a'.repeat(1200);
      const result = await provider.synthesizeDialog(
        dialogReq({
          segments: [
            {
              turns: [
                { speaker: 'Narrator', text: longText },
                { speaker: 'Leah', text: longText },
              ],
            },
          ],
        })
      );
      // 2 × 1200 chars exceeds the 1900 budget → two requests.
      expect((fetch as jest.Mock).mock.calls).toHaveLength(2);
      // Concatenated buffer = 2 × mocked 1500-byte response.
      expect(result.audio.length).toBe(3000);
    });

    test('builds settings from voice options (incl. speaker_boost alias)', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesizeDialog(
        dialogReq({
          providerOptions: {
            model_id: 'eleven_v3',
            stability: 0.3,
            similarity_boost: 0.9,
            style: 0.1,
            use_speaker_boost: true,
          },
        })
      );
      expect(sentBody().settings).toEqual({
        stability: 0.3,
        similarity_boost: 0.9,
        style: 0.1,
        use_speaker_boost: true,
      });
    });

    test('omits settings and language when not provided', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesizeDialog(
        dialogReq({ providerOptions: { model_id: 'eleven_v3' } })
      );
      const body = sentBody();
      expect(body.settings).toBeUndefined();
      expect(body.language_code).toBeUndefined();
    });

    test('falls back to request.voice.languageCode and respects outputFormat', async () => {
      const provider = new ElevenLabsProvider();
      await provider.synthesizeDialog(
        dialogReq({
          voice: { languageCode: 'de' },
          providerOptions: { model_id: 'eleven_v3', outputFormat: 'mp3_22050_32' },
        })
      );
      expect(sentBody().language_code).toBe('de');
      expect(calledUrl()).toContain('output_format=mp3_22050_32');
    });

    test('wav format yields undefined audioDuration', async () => {
      const provider = new ElevenLabsProvider();
      const result = await provider.synthesizeDialog(
        dialogReq({ audio: { format: 'wav' } })
      );
      expect(result.metadata.audioFormat).toBe('wav');
      expect(result.metadata.audioDuration).toBeUndefined();
    });

    test('throws on empty speakers', async () => {
      const provider = new ElevenLabsProvider();
      await expect(
        provider.synthesizeDialog(dialogReq({ speakers: [] }))
      ).rejects.toThrow(/at least one speaker/i);
    });

    test('throws on empty segments', async () => {
      const provider = new ElevenLabsProvider();
      await expect(
        provider.synthesizeDialog(dialogReq({ segments: [] }))
      ).rejects.toThrow(/at least one segment/i);
    });

    test('warns but still synthesizes when a single turn exceeds the cap', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const provider = new ElevenLabsProvider();
      const huge = 'a'.repeat(2100);
      const result = await provider.synthesizeDialog(
        dialogReq({ segments: [{ turns: [{ speaker: 'Narrator', text: huge }] }] })
      );
      expect(result.audio).toBeInstanceOf(Buffer);
      expect((fetch as jest.Mock).mock.calls).toHaveLength(1);
      warnSpy.mockRestore();
    });
  });
});
