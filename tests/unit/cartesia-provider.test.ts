/**
 * Tests for Cartesia TTS Provider
 *
 * @description Tests the Cartesia (Sonic) provider implementation, including the
 * sentence/paragraph pause insertion, speed clamping, and overridable defaults.
 * @coverage Target: >90%
 */

import type { TTSSynthesizeRequest } from '../../src/middleware/services/tts/types';
import { TTSProvider } from '../../src/middleware/services/tts/types';
import { CartesiaProvider } from '../../src/middleware/services/tts/providers/cartesia-provider';
import { InvalidConfigError } from '../../src/middleware/services/tts/providers/base-tts-provider';

// Mock fetch globally
global.fetch = jest.fn();

/** Parse the JSON body sent to fetch on a given call (default: first call). */
function sentBody(call = 0): Record<string, any> {
  return JSON.parse((fetch as jest.Mock).mock.calls[call][1].body);
}

describe('CartesiaProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CARTESIA_API_KEY = 'sk_car_test';
    // Ensure no leaked default env from the host machine.
    delete process.env.CARTESIA_DEFAULT_SPEED;
    delete process.env.CARTESIA_DEFAULT_SENTENCE_PAUSE_MS;
    delete process.env.CARTESIA_DEFAULT_PARAGRAPH_PAUSE_MS;
    delete process.env.CARTESIA_VERSION;
    jest.clearAllMocks();

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(2048),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const req = (overrides: Partial<TTSSynthesizeRequest> = {}): TTSSynthesizeRequest => ({
    text: 'Hallo Welt.',
    voice: { id: 'voice-123' },
    audio: { format: 'mp3', sampleRate: 44100 },
    ...overrides,
  });

  describe('Constructor and Configuration', () => {
    test('initializes from environment variable', () => {
      const provider = new CartesiaProvider();
      expect(provider.getProviderName()).toBe(TTSProvider.CARTESIA);
    });

    test('initializes with provided API key', () => {
      const provider = new CartesiaProvider({ apiKey: 'sk_car_custom' });
      expect(provider.getProviderName()).toBe(TTSProvider.CARTESIA);
    });

    test('throws InvalidConfigError if API key is missing', () => {
      delete process.env.CARTESIA_API_KEY;
      expect(() => new CartesiaProvider()).toThrow(InvalidConfigError);
      expect(() => new CartesiaProvider()).toThrow(/API key is required/i);
    });

    test('logs initialization info', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      new CartesiaProvider();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cartesia provider initialized'),
        expect.objectContaining({ hasApiKey: true })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Synthesize - Basic', () => {
    test('synthesizes successfully and returns metadata + billing', async () => {
      const provider = new CartesiaProvider();
      const result = await provider.synthesize('Hallo Welt.', 'voice-123', req());

      expect(result.audio).toBeInstanceOf(Buffer);
      expect(result.audio.length).toBe(2048);
      expect(result.metadata.provider).toBe(TTSProvider.CARTESIA);
      expect(result.metadata.voice).toBe('voice-123');
      expect(result.metadata.audioFormat).toBe('mp3');
      expect(result.metadata.sampleRate).toBe(44100);
      // Billing counts the original text, not the pause-augmented transcript.
      expect(result.billing.characters).toBe('Hallo Welt.'.length);
    });

    test('sends correct endpoint, headers and version', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize('Hallo Welt.', 'voice-123', req());

      expect(fetch).toHaveBeenCalledWith(
        'https://api.cartesia.ai/tts/bytes',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_car_test',
            'Cartesia-Version': '2026-03-01',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    test('honors CARTESIA_VERSION override', async () => {
      process.env.CARTESIA_VERSION = '2025-01-01';
      const provider = new CartesiaProvider();
      await provider.synthesize('Hallo Welt.', 'voice-123', req());
      expect((fetch as jest.Mock).mock.calls[0][1].headers['Cartesia-Version']).toBe(
        '2025-01-01'
      );
    });
  });

  describe('Request body', () => {
    test('builds default body (model, voice, mp3 output_format)', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize('Hallo Welt.', 'voice-123', req());
      const body = sentBody();

      expect(body.model_id).toBe('sonic-3.5');
      expect(body.voice).toEqual({ mode: 'id', id: 'voice-123' });
      expect(body.output_format).toEqual({
        container: 'mp3',
        sample_rate: 44100,
        bit_rate: 128000,
      });
    });

    test('maps wav format to pcm output_format', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ audio: { format: 'wav', sampleRate: 24000 } })
      );
      const body = sentBody();
      expect(body.output_format).toEqual({
        container: 'wav',
        encoding: 'pcm_s16le',
        sample_rate: 24000,
      });
    });

    test('overrides model via providerOptions', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ providerOptions: { model: 'sonic-3' } })
      );
      expect(sentBody().model_id).toBe('sonic-3');
    });

    test('omits language when not provided (auto-detect)', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize('Hallo Welt.', 'voice-123', req());
      expect(sentBody().language).toBeUndefined();
    });

    test('sends language when provided', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ providerOptions: { language: 'de' } })
      );
      expect(sentBody().language).toBe('de');
    });
  });

  describe('Speed control', () => {
    test('maps audio.speed to generation_config.speed', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ audio: { format: 'mp3', speed: 0.9 } })
      );
      expect(sentBody().generation_config.speed).toBe(0.9);
    });

    test('omits generation_config.speed at speed 1.0', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ audio: { format: 'mp3', speed: 1.0 } })
      );
      expect(sentBody().generation_config).toBeUndefined();
    });

    test('clamps speed below minimum to 0.6', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ audio: { format: 'mp3', speed: 0.3 } })
      );
      expect(sentBody().generation_config.speed).toBe(0.6);
    });

    test('clamps speed above maximum to 1.5', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ audio: { format: 'mp3', speed: 2.0 } })
      );
      expect(sentBody().generation_config.speed).toBe(1.5);
    });
  });

  describe('Pause insertion (applyPauses)', () => {
    const text = 'Eins. Zwei. Drei.';

    test('no pauses by default', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize(text, 'voice-123', req({ text }));
      expect(sentBody().transcript).toBe(text);
      expect(sentBody().transcript).not.toContain('<break');
    });

    test('inserts sentence breaks when sentencePauseMs set', async () => {
      const provider = new CartesiaProvider();
      await provider.synthesize(
        text,
        'voice-123',
        req({ text, providerOptions: { sentencePauseMs: 300 } })
      );
      const transcript = sentBody().transcript;
      expect(transcript).toContain('<break time="300ms"/>');
      // Two internal sentence boundaries (after "Eins." and "Zwei.").
      expect(transcript.match(/<break/g)).toHaveLength(2);
    });

    test('does not break mid-dialogue punctuation', async () => {
      const dialogue = 'Hallo?", sagte er. Tschüss.';
      const provider = new CartesiaProvider();
      await provider.synthesize(
        dialogue,
        'voice-123',
        req({ text: dialogue, providerOptions: { sentencePauseMs: 300 } })
      );
      const transcript = sentBody().transcript;
      // Only the real boundary "er. Tschüss" gets a break (the ?" inside the
      // quote is followed by a comma + lowercase, so it is left untouched).
      expect(transcript.match(/<break/g)).toHaveLength(1);
      expect(transcript).toContain('er.<break time="300ms"/> Tschüss.');
    });

    test('inserts a longer paragraph break (defaults to 2x sentence)', async () => {
      const para = 'Ende.\n\nNeuer Absatz.';
      const provider = new CartesiaProvider();
      await provider.synthesize(
        para,
        'voice-123',
        req({ text: para, providerOptions: { sentencePauseMs: 300 } })
      );
      expect(sentBody().transcript).toContain('<break time="600ms"/>');
    });

    test('respects explicit paragraphPauseMs', async () => {
      const para = 'Ende.\n\nNeuer Absatz.';
      const provider = new CartesiaProvider();
      await provider.synthesize(
        para,
        'voice-123',
        req({ text: para, providerOptions: { sentencePauseMs: 300, paragraphPauseMs: 900 } })
      );
      expect(sentBody().transcript).toContain('<break time="900ms"/>');
    });
  });

  describe('Overridable defaults (env / config)', () => {
    test('applies CARTESIA_DEFAULT_SPEED when request omits speed', async () => {
      process.env.CARTESIA_DEFAULT_SPEED = '0.9';
      const provider = new CartesiaProvider();
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ audio: { format: 'mp3' } })
      );
      expect(sentBody().generation_config.speed).toBe(0.9);
    });

    test('per-request audio.speed overrides default speed', async () => {
      process.env.CARTESIA_DEFAULT_SPEED = '0.9';
      const provider = new CartesiaProvider();
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ audio: { format: 'mp3', speed: 1.2 } })
      );
      expect(sentBody().generation_config.speed).toBe(1.2);
    });

    test('applies CARTESIA_DEFAULT_SENTENCE_PAUSE_MS when request omits it', async () => {
      process.env.CARTESIA_DEFAULT_SENTENCE_PAUSE_MS = '300';
      const text = 'Eins. Zwei.';
      const provider = new CartesiaProvider();
      await provider.synthesize(text, 'voice-123', req({ text }));
      expect(sentBody().transcript).toContain('<break time="300ms"/>');
    });

    test('per-request sentencePauseMs=0 disables default pauses', async () => {
      process.env.CARTESIA_DEFAULT_SENTENCE_PAUSE_MS = '300';
      const text = 'Eins. Zwei.';
      const provider = new CartesiaProvider();
      await provider.synthesize(
        text,
        'voice-123',
        req({ text, providerOptions: { sentencePauseMs: 0 } })
      );
      expect(sentBody().transcript).not.toContain('<break');
    });

    test('constructor config defaults take effect', async () => {
      const provider = new CartesiaProvider({ defaults: { speed: 0.8 } });
      await provider.synthesize(
        'Hallo Welt.',
        'voice-123',
        req({ audio: { format: 'mp3' } })
      );
      expect(sentBody().generation_config.speed).toBe(0.8);
    });
  });

  describe('Error handling', () => {
    test('throws on non-ok API response', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });
      const provider = new CartesiaProvider();
      await expect(
        provider.synthesize('Hallo Welt.', 'voice-123', req())
      ).rejects.toThrow();
    });
  });
});
