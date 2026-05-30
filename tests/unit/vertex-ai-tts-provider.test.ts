/**
 * Tests for Vertex AI TTS Provider
 *
 * @description Tests Vertex AI TTS provider implementation including
 * Vertex AI auth, PCM-to-MP3/WAV conversion, and error handling.
 * @coverage Target: >90%
 */

import type { TTSSynthesizeRequest } from '../../src/middleware/services/tts/types';
import { TTSProvider } from '../../src/middleware/services/tts/types';
import { VertexAITTSProvider } from '../../src/middleware/services/tts/providers/vertex-ai-tts-provider';
import {
  InvalidConfigError,
  QuotaExceededError,
  SynthesisFailedError,
  PayloadTooLargeError,
  supportsDialog,
} from '../../src/middleware/services/tts/providers/base-tts-provider';
import type { SynthesizeDialogRequest } from '../../src/middleware/services/tts/types';

// Mock fetch globally
global.fetch = jest.fn();

// Mock google-auth-library
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getClient: jest.fn().mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'mock-access-token' }),
    }),
  })),
}));

// Mock child_process.spawn for ffmpeg
jest.mock('child_process', () => {
  const { EventEmitter } = require('events');
  const { Readable, Writable } = require('stream');

  return {
    spawn: jest.fn(() => {
      const proc = new EventEmitter();

      // Create stdout as a Readable stream
      const stdout = new Readable({ read() {} });
      proc.stdout = stdout;

      // Create stderr as a Readable stream
      const stderr = new Readable({ read() {} });
      proc.stderr = stderr;

      // Create stdin as a Writable stream
      const stdin = new Writable({
        write(_chunk: Buffer, _encoding: string, callback: () => void) {
          callback();
        },
      });
      stdin.on('finish', () => {
        // Simulate ffmpeg producing MP3 output
        const fakeMp3 = Buffer.from('fake-mp3-output');
        stdout.push(fakeMp3);
        stdout.push(null);
        // Emit close with success code
        process.nextTick(() => proc.emit('close', 0));
      });
      proc.stdin = stdin;

      return proc;
    }),
  };
});

/**
 * Helper to create a mock Vertex AI API response with PCM audio data
 */
function mockVertexAIResponse(audioSize = 1024) {
  const pcmData = Buffer.alloc(audioSize).toString('base64');
  return {
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/pcm;rate=24000',
                  data: pcmData,
                },
              },
            ],
          },
        },
      ],
    }),
  };
}

describe('VertexAITTSProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './vertex-ai-service-account.json';
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    jest.clearAllMocks();

    // Default successful fetch response
    (fetch as jest.Mock).mockResolvedValue(mockVertexAIResponse());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Constructor and Configuration', () => {
    test('initializes with environment variables', () => {
      const provider = new VertexAITTSProvider();
      expect(provider.getProviderName()).toBe(TTSProvider.VERTEX_AI);
    });

    test('initializes with provided config', () => {
      const provider = new VertexAITTSProvider({
        keyFilename: './custom-credentials.json',
        projectId: 'custom-project',
        region: 'europe-west4',
      });
      expect(provider.getProviderName()).toBe(TTSProvider.VERTEX_AI);
    });

    test('throws InvalidConfigError if credentials are missing', () => {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      expect(() => new VertexAITTSProvider()).toThrow(InvalidConfigError);
      expect(() => new VertexAITTSProvider()).toThrow(/credentials are required/i);
    });

    test('throws InvalidConfigError if project ID is missing', () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      expect(() => new VertexAITTSProvider()).toThrow(InvalidConfigError);
      expect(() => new VertexAITTSProvider()).toThrow(/Project ID is required/i);
    });

    test('logs initialization info', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      new VertexAITTSProvider();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vertex AI TTS provider initialized'),
        expect.objectContaining({ hasCredentials: true, region: 'us-central1', ffmpegPath: 'ffmpeg' })
      );
      consoleSpy.mockRestore();
    });

    test('uses VERTEX_AI_TTS_REGION env var', () => {
      process.env.VERTEX_AI_TTS_REGION = 'europe-west4';
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      new VertexAITTSProvider();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vertex AI TTS provider initialized'),
        expect.objectContaining({ region: 'europe-west4' })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('ffmpeg Path Resolution', () => {
    test('uses config ffmpegPath when provided', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      new VertexAITTSProvider({ ffmpegPath: '/custom/ffmpeg' });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vertex AI TTS provider initialized'),
        expect.objectContaining({ ffmpegPath: '/custom/ffmpeg' })
      );
      consoleSpy.mockRestore();
    });

    test('uses FFMPEG_PATH env var when set', () => {
      process.env.FFMPEG_PATH = '/env/ffmpeg';
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      new VertexAITTSProvider();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vertex AI TTS provider initialized'),
        expect.objectContaining({ ffmpegPath: '/env/ffmpeg' })
      );
      consoleSpy.mockRestore();
    });

    test('config ffmpegPath takes priority over FFMPEG_PATH env var', () => {
      process.env.FFMPEG_PATH = '/env/ffmpeg';
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      new VertexAITTSProvider({ ffmpegPath: '/config/ffmpeg' });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vertex AI TTS provider initialized'),
        expect.objectContaining({ ffmpegPath: '/config/ffmpeg' })
      );
      consoleSpy.mockRestore();
    });

    test('falls back to system ffmpeg when no config or env var', () => {
      delete process.env.FFMPEG_PATH;
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      new VertexAITTSProvider();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vertex AI TTS provider initialized'),
        expect.objectContaining({ ffmpegPath: 'ffmpeg' })
      );
      consoleSpy.mockRestore();
    });

    test('uses resolved ffmpeg path when spawning for MP3 conversion', async () => {
      const { spawn } = require('child_process');
      const provider = new VertexAITTSProvider({ ffmpegPath: '/custom/ffmpeg' });
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        audio: { format: 'mp3' },
      };

      await provider.synthesize('test', 'Kore', request);

      expect(spawn).toHaveBeenCalledWith('/custom/ffmpeg', expect.arrayContaining([
        '-f', 's16le',
      ]));
    });
  });

  describe('Synthesize - Basic', () => {
    test('synthesizes text successfully', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'Hello World',
        voice: { id: 'Kore' },
        audio: { format: 'mp3' },
      };

      const result = await provider.synthesize('Hello World', 'Kore', request);

      expect(result.audio).toBeInstanceOf(Buffer);
      expect(result.metadata.provider).toBe(TTSProvider.VERTEX_AI);
      expect(result.metadata.voice).toBe('Kore');
      expect(result.metadata.sampleRate).toBe(24000);
      expect(result.billing.characters).toBe(11);
    });

    test('uses default format mp3 when not specified', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      const result = await provider.synthesize('test', 'Kore', request);
      // mp3 via ffmpeg mock, or wav fallback
      expect(['mp3', 'wav']).toContain(result.metadata.audioFormat);
    });

    test('returns sampleRate 24000', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      const result = await provider.synthesize('test', 'Kore', request);
      expect(result.metadata.sampleRate).toBe(24000);
    });

    test('sends Bearer token in Authorization header', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      await provider.synthesize('test', 'Kore', request);

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-access-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    test('calls Vertex AI endpoint with project and region', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      await provider.synthesize('test', 'Kore', request);

      const calledUrl = (fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('us-central1-aiplatform.googleapis.com');
      expect(calledUrl).toContain('projects/test-project');
      expect(calledUrl).toContain('locations/us-central1');
    });

    test('uses default model gemini-2.5-flash-preview-tts', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      await provider.synthesize('test', 'Kore', request);

      const calledUrl = (fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('gemini-2.5-flash-preview-tts');
    });
  });

  describe('Synthesize - Request Body', () => {
    test('sends correct generateContent payload', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'Hello World',
        voice: { id: 'Kore' },
      };

      await provider.synthesize('Hello World', 'Kore', request);

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(body).toEqual({
        contents: [{ role: 'user', parts: [{ text: 'Hello World' }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Kore',
              },
            },
          },
        },
      });
    });

    test('sends voiceName from voiceId', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Puck' },
      };

      await provider.synthesize('test', 'Puck', request);

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Puck');
    });
  });

  describe('Synthesize - Region Handling', () => {
    test('returns region in response metadata', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      const result = await provider.synthesize('test', 'Kore', request);
      expect(result.metadata.region).toBe('us-central1');
    });

    test('uses per-request region from providerOptions', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        providerOptions: { region: 'europe-west4' },
      };

      await provider.synthesize('test', 'Kore', request);

      const calledUrl = (fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('europe-west4-aiplatform.googleapis.com');
      expect(calledUrl).toContain('locations/europe-west4');
    });

    test('per-request region override returns correct region in metadata', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        providerOptions: { region: 'europe-west4' },
      };

      const result = await provider.synthesize('test', 'Kore', request);
      expect(result.metadata.region).toBe('europe-west4');
    });

    test('per-request region takes precedence over constructor region', async () => {
      const provider = new VertexAITTSProvider({ region: 'us-central1' });
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        providerOptions: { region: 'europe-west4' },
      };

      await provider.synthesize('test', 'Kore', request);

      const calledUrl = (fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('europe-west4-aiplatform.googleapis.com');
    });
  });

  describe('Synthesize - Region Rotation', () => {
    test('rotates to next region on quota error (429)', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Rate limit exceeded' })
        .mockResolvedValueOnce(mockVertexAIResponse());

      const provider = new VertexAITTSProvider({
        regionRotation: {
          regions: ['europe-west4', 'europe-west1'],
          fallback: 'us-central1',
        },
      });
      const request: TTSSynthesizeRequest = { text: 'test', voice: { id: 'Kore' } };

      const result = await provider.synthesize('test', 'Kore', request);

      expect(fetch).toHaveBeenCalledTimes(2);
      const secondUrl = (fetch as jest.Mock).mock.calls[1][0] as string;
      expect(secondUrl).toContain('europe-west1-aiplatform.googleapis.com');
      expect(result.metadata.region).toBe('europe-west1');
    });

    test('returns region of successful attempt in metadata', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'quota' })
        .mockResolvedValueOnce(mockVertexAIResponse());

      const provider = new VertexAITTSProvider({
        regionRotation: {
          regions: ['europe-west4', 'us-central1'],
          fallback: 'us-central1',
        },
      });
      const request: TTSSynthesizeRequest = { text: 'test', voice: { id: 'Kore' } };

      const result = await provider.synthesize('test', 'Kore', request);
      expect(result.metadata.region).toBe('us-central1');
    });

    test('does not rotate on non-quota errors (400)', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      const provider = new VertexAITTSProvider({
        regionRotation: {
          regions: ['europe-west4', 'europe-west1'],
          fallback: 'us-central1',
        },
      });
      const request: TTSSynthesizeRequest = { text: 'test', voice: { id: 'Kore' } };

      await expect(provider.synthesize('test', 'Kore', request)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('tries fallback region after all regions exhausted', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'quota' })
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'quota' })
        .mockResolvedValueOnce(mockVertexAIResponse());

      const provider = new VertexAITTSProvider({
        regionRotation: {
          regions: ['europe-west4', 'europe-west1'],
          fallback: 'us-central1',
        },
      });
      const request: TTSSynthesizeRequest = { text: 'test', voice: { id: 'Kore' } };

      const result = await provider.synthesize('test', 'Kore', request);

      // europe-west4 (429) → europe-west1 (429) → us-central1 fallback (success)
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result.metadata.region).toBe('us-central1');
    });

    test('throws QuotaExceededError when all regions fail with alwaysTryFallback: false', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      const provider = new VertexAITTSProvider({
        regionRotation: {
          regions: ['europe-west4', 'europe-west1'],
          fallback: 'us-central1',
          alwaysTryFallback: false,
        },
      });
      const request: TTSSynthesizeRequest = { text: 'test', voice: { id: 'Kore' } };

      await expect(provider.synthesize('test', 'Kore', request)).rejects.toThrow(QuotaExceededError);
      // 3 calls: europe-west4 + europe-west1 + us-central1 (fallback in rotation list)
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    test('logs warning on quota error rotation', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'quota' })
        .mockResolvedValueOnce(mockVertexAIResponse());

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const provider = new VertexAITTSProvider({
        regionRotation: {
          regions: ['europe-west4', 'us-central1'],
          fallback: 'us-central1',
        },
      });
      const request: TTSSynthesizeRequest = { text: 'test', voice: { id: 'Kore' } };

      await provider.synthesize('test', 'Kore', request);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Quota exceeded'),
        expect.objectContaining({ failedRegion: 'europe-west4' })
      );
      consoleSpy.mockRestore();
    });

    test('per-request region override skips rotation entirely', async () => {
      // Would fail with 429 if europe-west4 were used, but override should use europe-west3
      (fetch as jest.Mock).mockResolvedValueOnce(mockVertexAIResponse());

      const provider = new VertexAITTSProvider({
        regionRotation: {
          regions: ['europe-west4'],
          fallback: 'us-central1',
        },
      });
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        providerOptions: { region: 'europe-west3' },
      };

      const result = await provider.synthesize('test', 'Kore', request);

      expect(fetch).toHaveBeenCalledTimes(1);
      const calledUrl = (fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('europe-west3-aiplatform.googleapis.com');
      expect(result.metadata.region).toBe('europe-west3');
    });
  });

  describe('Synthesize - Provider Options', () => {
    test('uses custom model', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        providerOptions: { model: 'gemini-2.5-pro-preview-tts' },
      };

      await provider.synthesize('test', 'Kore', request);

      const calledUrl = (fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('gemini-2.5-pro-preview-tts');
    });

    test('prepends stylePrompt to text', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'Have a wonderful day!',
        voice: { id: 'Kore' },
        providerOptions: { stylePrompt: 'Say cheerfully:' },
      };

      await provider.synthesize('Have a wonderful day!', 'Kore', request);

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.contents[0].parts[0].text).toBe('Say cheerfully: Have a wonderful day!');
    });

    test('does not prepend stylePrompt when not provided', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        voice: { id: 'Kore' },
      };

      await provider.synthesize('Hello', 'Kore', request);

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.contents[0].parts[0].text).toBe('Hello');
    });
  });

  describe('Synthesize - Audio Conversion', () => {
    test('returns WAV format when wav is requested', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        audio: { format: 'wav' },
      };

      const result = await provider.synthesize('test', 'Kore', request);

      expect(result.metadata.audioFormat).toBe('wav');
      // WAV header starts with "RIFF"
      expect(result.audio.subarray(0, 4).toString()).toBe('RIFF');
      // Followed by "WAVE"
      expect(result.audio.subarray(8, 12).toString()).toBe('WAVE');
    });

    test('WAV output has correct header structure', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        audio: { format: 'wav' },
      };

      const result = await provider.synthesize('test', 'Kore', request);

      // Check WAV header fields
      expect(result.audio.readUInt16LE(20)).toBe(1); // PCM format
      expect(result.audio.readUInt16LE(22)).toBe(1); // mono
      expect(result.audio.readUInt32LE(24)).toBe(24000); // sample rate
      expect(result.audio.readUInt16LE(34)).toBe(16); // bits per sample
    });

    test('attempts MP3 conversion via ffmpeg for mp3 format', async () => {
      const { spawn } = require('child_process');
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        audio: { format: 'mp3' },
      };

      await provider.synthesize('test', 'Kore', request);

      expect(spawn).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([
        '-f', 's16le',
        '-ar', '24000',
        '-ac', '1',
      ]));
    });

    test('falls back to WAV when ffmpeg fails', async () => {
      // Override spawn mock to simulate ffmpeg failure
      const { spawn } = require('child_process');
      const { EventEmitter } = require('events');
      const { Readable, Writable } = require('stream');

      spawn.mockImplementationOnce(() => {
        const proc = new EventEmitter();
        proc.stdout = new Readable({ read() {} });
        proc.stderr = new Readable({ read() {} });
        proc.stdin = new Writable({
          write(_chunk: Buffer, _encoding: string, callback: () => void) {
            callback();
          },
        });
        proc.stdin.on('finish', () => {
          proc.stdout.push(null);
          process.nextTick(() => proc.emit('close', 1));
        });
        return proc;
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        audio: { format: 'mp3' },
      };

      const result = await provider.synthesize('test', 'Kore', request);

      expect(result.metadata.audioFormat).toBe('wav');
      expect(result.audio.subarray(0, 4).toString()).toBe('RIFF');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ffmpeg not available'),
        expect.any(Object)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Synthesize - Audio Duration', () => {
    test('audioDuration is undefined for wav format', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        audio: { format: 'wav' },
      };

      const result = await provider.synthesize('test', 'Kore', request);
      expect(result.metadata.audioDuration).toBeUndefined();
    });

    test('audioDuration is computed for mp3 format', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
        audio: { format: 'mp3' },
      };

      const result = await provider.synthesize('test', 'Kore', request);
      // Mock ffmpeg produces fake data, so getMp3Duration returns undefined
      expect(result.metadata).toHaveProperty('audioDuration');
    });
  });

  describe('Synthesize - Billing', () => {
    test('reports character count from text length', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'Hello World',
        voice: { id: 'Kore' },
      };

      const result = await provider.synthesize('Hello World', 'Kore', request);
      expect(result.billing.characters).toBe(11);
    });

    test('counts characters correctly for longer text', async () => {
      const longText = 'Dies ist ein langer deutscher Text zum Testen.';
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: longText,
        voice: { id: 'Kore' },
      };

      const result = await provider.synthesize(longText, 'Kore', request);
      expect(result.billing.characters).toBe(longText.length);
    });
  });

  describe('Synthesize - Error Handling', () => {
    test('throws on API error response', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request: invalid voice name',
      });

      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'InvalidVoice' },
      };

      await expect(provider.synthesize('test', 'InvalidVoice', request)).rejects.toThrow(
        /Vertex AI API error \(400\)/
      );
    });

    test('throws InvalidConfigError on 403', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden: invalid credentials',
      });

      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      await expect(provider.synthesize('test', 'Kore', request)).rejects.toThrow(InvalidConfigError);
    });

    test('throws QuotaExceededError on 429', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      await expect(provider.synthesize('test', 'Kore', request)).rejects.toThrow(QuotaExceededError);
    });

    test('throws SynthesisFailedError on unknown errors', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Something unexpected'));

      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      await expect(provider.synthesize('test', 'Kore', request)).rejects.toThrow(SynthesisFailedError);
    });

    test('throws on empty audio data in response', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{}] } }],
        }),
      });

      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      await expect(provider.synthesize('test', 'Kore', request)).rejects.toThrow(
        /no audio data/
      );
    });

    test('throws on missing candidates in response', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      await expect(provider.synthesize('test', 'Kore', request)).rejects.toThrow(
        /no audio data/
      );
    });

    test('logs error on failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: 'Kore' },
      };

      await expect(provider.synthesize('test', 'Kore', request)).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Synthesis failed'),
        expect.objectContaining({ error: 'Connection refused' })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Synthesize - Validation', () => {
    test('throws on empty text', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: '',
        voice: { id: 'Kore' },
      };

      await expect(provider.synthesize('', 'Kore', request)).rejects.toThrow(InvalidConfigError);
    });

    test('throws on missing voice id', async () => {
      const provider = new VertexAITTSProvider();
      const request: TTSSynthesizeRequest = {
        text: 'test',
        voice: { id: '' },
      };

      await expect(provider.synthesize('test', '', request)).rejects.toThrow(InvalidConfigError);
    });
  });

  describe('Synthesize - Payload Limits (single)', () => {
    test('throws PayloadTooLargeError when text exceeds 4000 bytes', async () => {
      const provider = new VertexAITTSProvider();
      const hugeText = 'a'.repeat(4001);
      const request: TTSSynthesizeRequest = {
        text: hugeText,
        voice: { id: 'Kore' },
      };

      await expect(provider.synthesize(hugeText, 'Kore', request)).rejects.toThrow(
        PayloadTooLargeError,
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    test('includes actualBytes and maxBytes on PayloadTooLargeError', async () => {
      const provider = new VertexAITTSProvider();
      const hugeText = 'a'.repeat(4500);
      const request: TTSSynthesizeRequest = { text: hugeText, voice: { id: 'Kore' } };

      try {
        await provider.synthesize(hugeText, 'Kore', request);
        fail('expected PayloadTooLargeError');
      } catch (err) {
        expect(err).toBeInstanceOf(PayloadTooLargeError);
        const typed = err as PayloadTooLargeError;
        expect(typed.actualBytes).toBe(4500);
        expect(typed.maxBytes).toBe(4000);
      }
    });
  });

  describe('synthesizeDialog', () => {
    function makeRequest(overrides: Partial<SynthesizeDialogRequest> = {}): SynthesizeDialogRequest {
      return {
        speakers: [
          { speaker: 'Alice', voice: 'Aoede' },
          { speaker: 'Bob', voice: 'Puck' },
        ],
        segments: [
          {
            stylePrompt: 'Casual conversation',
            turns: [
              { speaker: 'Alice', text: 'Hi Bob!' },
              { speaker: 'Bob', text: '[laughing] Hey Alice.' },
            ],
          },
        ],
        audio: { format: 'wav' },
        providerOptions: { model: 'gemini-3.1-flash-tts-preview' },
        ...overrides,
      };
    }

    test('synthesizes a single-segment dialog successfully', async () => {
      const provider = new VertexAITTSProvider();
      const result = await provider.synthesizeDialog(makeRequest());

      expect(result.audio).toBeInstanceOf(Buffer);
      expect(result.metadata.provider).toBe(TTSProvider.VERTEX_AI);
      expect(result.metadata.sampleRate).toBe(24000);
      expect(result.billing.characters).toBeGreaterThan(0);
    });

    test('sends multiSpeakerVoiceConfig in request body', async () => {
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog(makeRequest());

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.generationConfig.speechConfig.multiSpeakerVoiceConfig).toBeDefined();
      expect(body.generationConfig.speechConfig.voiceConfig).toBeUndefined();
      const speakerConfigs = body.generationConfig.speechConfig.multiSpeakerVoiceConfig
        .speakerVoiceConfigs;
      expect(speakerConfigs).toHaveLength(2);
      expect(speakerConfigs[0].speaker).toBe('Alice');
      expect(speakerConfigs[0].voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
    });

    test('uses gemini-3.1-flash-tts-preview as default dialog model', async () => {
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog({
        speakers: [{ speaker: 'A', voice: 'Kore' }],
        segments: [{ turns: [{ speaker: 'A', text: 'hi' }] }],
        audio: { format: 'wav' },
      });

      const calledUrl = (fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('gemini-3.1-flash-tts-preview');
    });

    test('inlines stylePrompt above turns in the text field', async () => {
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog(makeRequest());

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      const text = body.contents[0].parts[0].text as string;
      expect(text.startsWith('Casual conversation\n')).toBe(true);
      expect(text).toContain('Alice: Hi Bob!');
      expect(text).toContain('Bob: [laughing] Hey Alice.');
    });

    test('sets temperature when provided on segment', async () => {
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog(
        makeRequest({
          segments: [
            {
              stylePrompt: 'test',
              temperature: 1.5,
              turns: [{ speaker: 'Alice', text: 'hi' }],
            },
          ],
        }),
      );

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.generationConfig.temperature).toBe(1.5);
    });

    test('runs multiple segments sequentially and concatenates PCM', async () => {
      const provider = new VertexAITTSProvider();
      (fetch as jest.Mock)
        .mockResolvedValueOnce(mockVertexAIResponse(100))
        .mockResolvedValueOnce(mockVertexAIResponse(200))
        .mockResolvedValueOnce(mockVertexAIResponse(300));

      const result = await provider.synthesizeDialog({
        speakers: [{ speaker: 'A', voice: 'Kore' }],
        segments: [
          { turns: [{ speaker: 'A', text: 'one' }] },
          { turns: [{ speaker: 'A', text: 'two' }] },
          { turns: [{ speaker: 'A', text: 'three' }] },
        ],
        audio: { format: 'wav' },
      });

      expect(fetch).toHaveBeenCalledTimes(3);
      // WAV header (44 bytes) + 100 + 200 + 300 = 644
      expect(result.audio.length).toBe(44 + 600);
    });

    test('aggregates billing characters across all segments and turns', async () => {
      const provider = new VertexAITTSProvider();
      (fetch as jest.Mock)
        .mockResolvedValueOnce(mockVertexAIResponse())
        .mockResolvedValueOnce(mockVertexAIResponse());

      const result = await provider.synthesizeDialog({
        speakers: [
          { speaker: 'Alice', voice: 'Aoede' },
          { speaker: 'Bob', voice: 'Puck' },
        ],
        segments: [
          {
            stylePrompt: 'Calm',
            turns: [
              { speaker: 'Alice', text: 'Hello' },
              { speaker: 'Bob', text: 'Hi' },
            ],
          },
          {
            stylePrompt: 'Excited',
            turns: [{ speaker: 'Alice', text: 'Whoa!' }],
          },
        ],
        audio: { format: 'wav' },
      });

      // Segment 1 (2 speakers → prefix kept): "Calm"(4) + "Alice: Hello"(12) + "Bob: Hi"(7) = 23
      // Segment 2 (1 speaker → prefix dropped): "Excited"(7) + "Whoa!"(5) = 12
      // Total: 35
      expect(result.billing.characters).toBe(35);
    });

    test('throws PayloadTooLargeError when a segment exceeds 4000 bytes with segment index', async () => {
      const provider = new VertexAITTSProvider();
      const longText = 'x'.repeat(4001);

      try {
        await provider.synthesizeDialog({
          speakers: [{ speaker: 'A', voice: 'Kore' }],
          segments: [
            { turns: [{ speaker: 'A', text: 'short' }] },
            { turns: [{ speaker: 'A', text: longText }] },
          ],
          audio: { format: 'wav' },
        });
        fail('expected PayloadTooLargeError');
      } catch (err) {
        expect(err).toBeInstanceOf(PayloadTooLargeError);
        expect((err as PayloadTooLargeError).segmentIndex).toBe(1);
      }
    });

    test('throws InvalidConfigError when turn references unknown speaker', async () => {
      const provider = new VertexAITTSProvider();
      await expect(
        provider.synthesizeDialog({
          speakers: [{ speaker: 'Alice', voice: 'Aoede' }],
          segments: [{ turns: [{ speaker: 'Bob', text: 'hi' }] }],
          audio: { format: 'wav' },
        }),
      ).rejects.toThrow(/unknown speaker "Bob"/);
    });

    test('throws InvalidConfigError on duplicate speaker alias', async () => {
      const provider = new VertexAITTSProvider();
      await expect(
        provider.synthesizeDialog({
          speakers: [
            { speaker: 'Alice', voice: 'Aoede' },
            { speaker: 'Alice', voice: 'Kore' },
          ],
          segments: [{ turns: [{ speaker: 'Alice', text: 'hi' }] }],
          audio: { format: 'wav' },
        }),
      ).rejects.toThrow(/Duplicate speaker alias/);
    });

    test('throws InvalidConfigError on non-alphanumeric speaker alias', async () => {
      const provider = new VertexAITTSProvider();
      await expect(
        provider.synthesizeDialog({
          speakers: [{ speaker: 'Alice Wonder', voice: 'Aoede' }],
          segments: [{ turns: [{ speaker: 'Alice Wonder', text: 'hi' }] }],
          audio: { format: 'wav' },
        }),
      ).rejects.toThrow(/must be alphanumeric/);
    });

    test('throws InvalidConfigError on empty segments array', async () => {
      const provider = new VertexAITTSProvider();
      await expect(
        provider.synthesizeDialog({
          speakers: [{ speaker: 'A', voice: 'Kore' }],
          segments: [],
        }),
      ).rejects.toThrow(/at least one segment/);
    });

    test('metadata.voice lists speaker:voice pairs', async () => {
      const provider = new VertexAITTSProvider();
      const result = await provider.synthesizeDialog(makeRequest());
      expect(result.metadata.voice).toBe('Alice:Aoede,Bob:Puck');
    });

    test('segment with a single speaker uses prebuiltVoiceConfig (not multiSpeakerVoiceConfig)', async () => {
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog({
        speakers: [
          { speaker: 'Narrator', voice: 'Charon' },
          { speaker: 'Alice', voice: 'Aoede' },
        ],
        segments: [
          {
            stylePrompt: 'Calm narrator intro',
            turns: [{ speaker: 'Narrator', text: 'It was a quiet morning.' }],
          },
        ],
        audio: { format: 'wav' },
      });

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.generationConfig.speechConfig.voiceConfig).toBeDefined();
      expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
      expect(body.generationConfig.speechConfig.multiSpeakerVoiceConfig).toBeUndefined();
    });

    test('single-speaker segment omits the "Speaker: " prefix (matches Google single-voice docs)', async () => {
      // Google's documented single-voice input format passes plain text
      // without any speaker label (https://ai.google.dev/gemini-api/docs/speech-generation).
      // Gemini's synthesis classifier will otherwise treat the label as
      // unrecognized content and sometimes read it aloud (especially for
      // fantasy names the tokenizer doesn't know).
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog({
        speakers: [{ speaker: 'Turbosahne', voice: 'Aoede' }],
        segments: [
          {
            stylePrompt: 'Energetic narrator',
            turns: [{ speaker: 'Turbosahne', text: 'Hallo, ich bin eine Ente.' }],
          },
        ],
        audio: { format: 'wav' },
      });

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      const text = body.contents[0].parts[0].text as string;
      expect(text).not.toContain('Turbosahne:');
      expect(text).toContain('Hallo, ich bin eine Ente.');
      // stylePrompt is still inlined above the turn text
      expect(text.startsWith('Energetic narrator\n')).toBe(true);
    });

    test('multi-speaker segment keeps the "Speaker: " prefix (needed for voice routing)', async () => {
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog({
        speakers: [
          { speaker: 'Alice', voice: 'Aoede' },
          { speaker: 'Bob', voice: 'Puck' },
        ],
        segments: [
          {
            turns: [
              { speaker: 'Alice', text: 'Hi Bob!' },
              { speaker: 'Bob', text: 'Hey.' },
            ],
          },
        ],
        audio: { format: 'wav' },
      });

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      const text = body.contents[0].parts[0].text as string;
      expect(text).toContain('Alice: Hi Bob!');
      expect(text).toContain('Bob: Hey.');
    });

    test('single-speaker billing drops the "Speaker: " prefix length', async () => {
      const provider = new VertexAITTSProvider();
      const result = await provider.synthesizeDialog({
        speakers: [{ speaker: 'A', voice: 'Kore' }],
        segments: [
          {
            stylePrompt: 'Style',
            turns: [{ speaker: 'A', text: 'hello' }],
          },
        ],
        audio: { format: 'wav' },
      });

      // "Style"(5) + "hello"(5) — prefix "A: " is NOT billed for single-voice
      expect(result.billing.characters).toBe(10);
    });

    test('throws InvalidConfigError when a segment uses more than 2 distinct speakers', async () => {
      const provider = new VertexAITTSProvider();
      await expect(
        provider.synthesizeDialog({
          speakers: [
            { speaker: 'A', voice: 'Aoede' },
            { speaker: 'B', voice: 'Puck' },
            { speaker: 'C', voice: 'Charon' },
          ],
          segments: [
            {
              turns: [
                { speaker: 'A', text: 'hi' },
                { speaker: 'B', text: 'hello' },
                { speaker: 'C', text: 'hey' },
              ],
            },
          ],
          audio: { format: 'wav' },
        }),
      ).rejects.toThrow(/at most 2 speakers/);
    });

    test('filters speakerVoiceConfigs to only the speakers actually used in a segment', async () => {
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog({
        speakers: [
          { speaker: 'Narrator', voice: 'Charon' },
          { speaker: 'Alice', voice: 'Aoede' },
          { speaker: 'Bob', voice: 'Puck' },
        ],
        segments: [
          {
            turns: [
              { speaker: 'Alice', text: 'Hi Bob' },
              { speaker: 'Bob', text: 'Hi Alice' },
            ],
          },
        ],
        audio: { format: 'wav' },
      });

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      const configs = body.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs;
      expect(configs).toHaveLength(2);
      const aliases = configs.map((c: { speaker: string }) => c.speaker);
      expect(aliases).toEqual(['Alice', 'Bob']);
      expect(aliases).not.toContain('Narrator');
    });
  });

  describe('Request Debug Logging', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = require('os');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');

    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-vertex-log-'));
      process.env.DEBUG_TTS_REQUESTS = 'true';
      process.env.TTS_REQUEST_LOG_DIR = tempDir;
    });

    afterEach(() => {
      delete process.env.DEBUG_TTS_REQUESTS;
      delete process.env.TTS_REQUEST_LOG_DIR;
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('does not write logs when DEBUG_TTS_REQUESTS is unset', async () => {
      delete process.env.DEBUG_TTS_REQUESTS;
      const provider = new VertexAITTSProvider();
      await provider.synthesize('hi', 'Kore', {
        text: 'hi',
        voice: { id: 'Kore' },
        audio: { format: 'wav' },
      });
      expect(fs.readdirSync(tempDir)).toHaveLength(0);
    });

    test('writes one log file per dialog segment with multi-speaker shape', async () => {
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog({
        speakers: [
          { speaker: 'Alice', voice: 'Aoede' },
          { speaker: 'Bob', voice: 'Puck' },
        ],
        segments: [
          {
            stylePrompt: 'casual',
            turns: [
              { speaker: 'Alice', text: 'hi' },
              { speaker: 'Bob', text: 'hello' },
            ],
          },
        ],
        audio: { format: 'wav' },
      });

      const files = fs.readdirSync(tempDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('dialog-segment');
      expect(files[0]).toContain('seg0');
      expect(files[0]).toContain('multi-speaker');

      const md = fs.readFileSync(path.join(tempDir, files[0]), 'utf8');
      expect(md).toContain('## Request Body');
      expect(md).toContain('multiSpeakerVoiceConfig');
      expect(md).toContain('`Alice` → `Aoede`');
      expect(md).toContain('`Bob` → `Puck`');
      expect(md).toContain('## Response');
      expect(md).toContain('audioBytes');
    });

    test('logs single-voice shape when segment uses one speaker', async () => {
      const provider = new VertexAITTSProvider();
      await provider.synthesizeDialog({
        speakers: [
          { speaker: 'Narrator', voice: 'Charon' },
          { speaker: 'Alice', voice: 'Aoede' },
        ],
        segments: [
          { turns: [{ speaker: 'Narrator', text: 'Once upon a time' }] },
        ],
        audio: { format: 'wav' },
      });

      const [filename] = fs.readdirSync(tempDir);
      expect(filename).toContain('single-voice');
      const md = fs.readFileSync(path.join(tempDir, filename), 'utf8');
      expect(md).toContain('`Narrator` → `Charon`');
    });

    test('writes error log with response body when API returns non-OK', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error":"bad request"}',
      });
      const provider = new VertexAITTSProvider();
      await expect(
        provider.synthesize('hi', 'Kore', {
          text: 'hi',
          voice: { id: 'Kore' },
          audio: { format: 'wav' },
        }),
      ).rejects.toThrow();

      const files = fs.readdirSync(tempDir);
      expect(files).toHaveLength(1);
      const md = fs.readFileSync(path.join(tempDir, files[0]), 'utf8');
      expect(md).toContain('## Error');
      expect(md).toContain('Vertex AI API error (400)');
      expect(md).toContain('"error": "bad request"');
      expect(md).toContain('- **HTTP Status**: 400');
    });

    test('writes error log when API returns no audio data', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{}] } }] }),
      });
      const provider = new VertexAITTSProvider();
      await expect(
        provider.synthesize('hi', 'Kore', {
          text: 'hi',
          voice: { id: 'Kore' },
          audio: { format: 'wav' },
        }),
      ).rejects.toThrow('no audio data');

      const [filename] = fs.readdirSync(tempDir);
      const md = fs.readFileSync(path.join(tempDir, filename), 'utf8');
      expect(md).toContain('Vertex AI API returned no audio data');
    });

    test('writes error log when fetch throws (network failure)', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('connect ECONNREFUSED'), { name: 'FetchError' }),
      );
      const provider = new VertexAITTSProvider();
      await expect(
        provider.synthesize('hi', 'Kore', {
          text: 'hi',
          voice: { id: 'Kore' },
          audio: { format: 'wav' },
        }),
      ).rejects.toThrow();

      const [filename] = fs.readdirSync(tempDir);
      const md = fs.readFileSync(path.join(tempDir, filename), 'utf8');
      expect(md).toContain('## Error');
      expect(md).toContain('ECONNREFUSED');
      expect(md).toContain('- **Name**: FetchError');
      expect(md).not.toContain('- **HTTP Status**:');
    });
  });

  describe('Dialog capability', () => {
    test('implements SupportsDialog with 2-speaker capabilities', () => {
      const provider = new VertexAITTSProvider();
      expect(supportsDialog(provider)).toBe(true);
      expect(provider.dialogCapabilities.maxSpeakers).toBe(2);
      expect(provider.dialogCapabilities.supportsStylePrompt).toBe(true);
      expect(provider.dialogCapabilities.supportsAudioTags).toBe(true);
    });
  });
});
