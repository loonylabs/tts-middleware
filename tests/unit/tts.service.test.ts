/**
 * Tests for TTS Service Orchestrator
 *
 * @description Tests the main TTS service that orchestrates provider access
 * @coverage Target: 85%
 */

import { TTSService, ttsService } from '../../src/middleware/services/tts/tts.service';
import type { TTSSynthesizeRequest } from '../../src/middleware/services/tts/types';
import { TTSProvider } from '../../src/middleware/services/tts/types';
import {
  QuotaExceededError,
  InvalidConfigError,
} from '../../src/middleware/services/tts/providers/base-tts-provider';
import * as retryUtils from '../../src/middleware/services/tts/utils/retry.utils';

// Mock the Azure provider
jest.mock('../../src/middleware/services/tts/providers/azure-provider', () => {
  return {
    AzureProvider: jest.fn().mockImplementation(() => ({
      synthesize: jest.fn().mockResolvedValue({
        audio: Buffer.from('mock-audio'),
        metadata: {
          provider: 'azure',
          voice: 'en-US-JennyNeural',
          duration: 1000,
          audioFormat: 'mp3',
          sampleRate: 24000,
        },
        billing: {
          characters: 11,
        },
      }),
      getProviderName: jest.fn().mockReturnValue('azure'),
    })),
  };
});

describe('TTSService', () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    process.env.AZURE_SPEECH_KEY = 'test-key';
    process.env.AZURE_SPEECH_REGION = 'germanywestcentral';

    // Clear module cache to get fresh instances
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Singleton Pattern', () => {
    test('exports a singleton instance', () => {
      expect(ttsService).toBeInstanceOf(TTSService);
    });

    test('ttsService is the same instance', () => {
      const service1 = ttsService;
      const service2 = ttsService;

      expect(service1).toBe(service2);
    });

    test('can create new instances if needed', () => {
      const service = new TTSService();
      expect(service).toBeInstanceOf(TTSService);
      expect(service).not.toBe(ttsService);
    });
  });

  describe('Initialization', () => {
    test('initializes with Azure as default provider', () => {
      const service = new TTSService();
      expect(service.getDefaultProvider()).toBe(TTSProvider.AZURE);
    });

    test('reads default provider from environment', () => {
      process.env.TTS_DEFAULT_PROVIDER = 'azure';
      const service = new TTSService();

      expect(service.getDefaultProvider()).toBe(TTSProvider.AZURE);
    });

    test('handles case-insensitive environment variable', () => {
      process.env.TTS_DEFAULT_PROVIDER = 'AZURE';
      const service = new TTSService();

      expect(service.getDefaultProvider()).toBe(TTSProvider.AZURE);
    });

    test('falls back to Azure if env var is invalid', () => {
      process.env.TTS_DEFAULT_PROVIDER = 'invalid-provider';
      const service = new TTSService();

      expect(service.getDefaultProvider()).toBe(TTSProvider.AZURE);
    });

    test('initializes with Azure provider available', () => {
      const service = new TTSService();
      const providers = service.getAvailableProviders();

      expect(providers).toContain(TTSProvider.AZURE);
    });
  });

  describe('Provider Management', () => {
    let service: TTSService;

    beforeEach(() => {
      service = new TTSService();
    });

    describe('getProvider', () => {
      test('returns Azure provider instance', () => {
        const provider = service.getProvider(TTSProvider.AZURE);

        expect(provider).toBeDefined();
        expect(provider.getProviderName()).toBe(TTSProvider.AZURE);
      });

      test('throws error for unregistered provider', () => {
        expect(() => service.getProvider(TTSProvider.OPENAI)).toThrow(
          /not available/i
        );
      });

      test('error message lists available providers', () => {
        // Need to ensure at least one provider is available for the message
        expect(() => service.getProvider(TTSProvider.OPENAI)).toThrow(/azure/i);
      });
    });

    describe('setDefaultProvider', () => {
      test('sets default provider successfully', () => {
        service.setDefaultProvider(TTSProvider.AZURE);

        expect(service.getDefaultProvider()).toBe(TTSProvider.AZURE);
      });

      test('throws error for unregistered provider', () => {
        expect(() => service.setDefaultProvider(TTSProvider.OPENAI)).toThrow(
          /not available/i
        );
      });

      test('error message lists available providers', () => {
        expect(() => service.setDefaultProvider(TTSProvider.OPENAI)).toThrow(
          /azure/i
        );
      });
    });

    describe('getDefaultProvider', () => {
      test('returns current default provider', () => {
        const defaultProvider = service.getDefaultProvider();

        expect(defaultProvider).toBe(TTSProvider.AZURE);
      });

      test('returns updated default after change', () => {
        service.setDefaultProvider(TTSProvider.AZURE);

        expect(service.getDefaultProvider()).toBe(TTSProvider.AZURE);
      });
    });

    describe('getAvailableProviders', () => {
      test('returns array of available providers', () => {
        const providers = service.getAvailableProviders();

        expect(Array.isArray(providers)).toBe(true);
        expect(providers).toContain(TTSProvider.AZURE);
      });

      test('returns available providers including Azure', () => {
        const providers = service.getAvailableProviders();

        expect(providers).toContain(TTSProvider.AZURE);
      });
    });

    describe('isProviderAvailable', () => {
      test('returns true for Azure', () => {
        expect(service.isProviderAvailable(TTSProvider.AZURE)).toBe(true);
      });

      test('returns false for OpenAI (not implemented in MVP)', () => {
        expect(service.isProviderAvailable(TTSProvider.OPENAI)).toBe(false);
      });

      test('returns false for ElevenLabs (not implemented in MVP)', () => {
        expect(service.isProviderAvailable(TTSProvider.ELEVENLABS)).toBe(false);
      });

      test('returns false for Google (not implemented in MVP)', () => {
        expect(service.isProviderAvailable(TTSProvider.GOOGLE)).toBe(false);
      });

      test('returns false for Deepgram (not implemented in MVP)', () => {
        expect(service.isProviderAvailable(TTSProvider.DEEPGRAM)).toBe(false);
      });
    });
  });

  describe('Synthesis', () => {
    let service: TTSService;

    beforeEach(() => {
      service = new TTSService();
    });

    test('synthesizes with default provider when none specified', async () => {
      const request: TTSSynthesizeRequest = {
        text: 'Hello World',
        voice: { id: 'en-US-JennyNeural' },
      };

      const response = await service.synthesize(request);

      expect(response.audio).toBeInstanceOf(Buffer);
      expect(response.metadata.provider).toBe('azure');
      expect(response.billing.characters).toBe(11);
    });

    test('synthesizes with specified provider', async () => {
      const request: TTSSynthesizeRequest = {
        text: 'Hello World',
        provider: TTSProvider.AZURE,
        voice: { id: 'en-US-JennyNeural' },
      };

      const response = await service.synthesize(request);

      expect(response.audio).toBeInstanceOf(Buffer);
      expect(response.metadata.provider).toBe('azure');
    });

    test('passes request to provider.synthesize()', async () => {
      const request: TTSSynthesizeRequest = {
        text: 'Test message',
        voice: { id: 'en-US-JennyNeural' },
        audio: {
          speed: 1.5,
          format: 'mp3',
        },
      };

      const provider = service.getProvider(TTSProvider.AZURE);
      const synthesizeSpy = jest.spyOn(provider, 'synthesize');

      await service.synthesize(request);

      expect(synthesizeSpy).toHaveBeenCalledWith(
        'Test message',
        'en-US-JennyNeural',
        request
      );
    });

    test('returns TTSResponse with all required fields', async () => {
      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        voice: { id: 'en-US-JennyNeural' },
      };

      const response = await service.synthesize(request);

      // Audio
      expect(response.audio).toBeInstanceOf(Buffer);

      // Metadata
      expect(response.metadata.provider).toBeDefined();
      expect(response.metadata.voice).toBeDefined();
      expect(response.metadata.duration).toBeGreaterThan(0);
      expect(response.metadata.audioFormat).toBeDefined();
      expect(response.metadata.sampleRate).toBeGreaterThan(0);

      // Billing
      expect(response.billing.characters).toBeGreaterThan(0);
    });

    test('throws error for unavailable provider', async () => {
      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        provider: TTSProvider.OPENAI,
        voice: { id: 'alloy' },
      };

      await expect(service.synthesize(request)).rejects.toThrow(
        /not available/i
      );
    });

    test('re-throws provider errors', async () => {
      const provider = service.getProvider(TTSProvider.AZURE);
      const mockError = new Error('Synthesis failed');

      jest.spyOn(provider, 'synthesize').mockRejectedValue(mockError);

      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        voice: { id: 'en-US-JennyNeural' },
      };

      await expect(service.synthesize(request)).rejects.toThrow(
        'Synthesis failed'
      );
    });
  });

  describe('Concurrency', () => {
    let service: TTSService;

    beforeEach(() => {
      service = new TTSService();
    });

    test('handles multiple concurrent requests', async () => {
      const requests = Array(5)
        .fill(null)
        .map((_, i) => ({
          text: `Message ${i}`,
          voice: { id: 'en-US-JennyNeural' },
        }));

      const promises = requests.map((req) => service.synthesize(req));
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(5);
      responses.forEach((response) => {
        expect(response.audio).toBeInstanceOf(Buffer);
      });
    });

    test('handles concurrent requests to different providers', async () => {
      // Note: In MVP only Azure is available, but this tests the pattern
      const requests: TTSSynthesizeRequest[] = [
        { text: 'Test 1', voice: { id: 'voice1' }, provider: TTSProvider.AZURE },
        { text: 'Test 2', voice: { id: 'voice2' }, provider: TTSProvider.AZURE },
      ];

      const promises = requests.map((req) => service.synthesize(req));
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    let service: TTSService;

    beforeEach(() => {
      service = new TTSService();
    });

    test('delegates to provider for validation', async () => {
      // Service doesn't validate - it delegates to provider
      // The real provider will validate, but our mock doesn't
      const request: TTSSynthesizeRequest = {
        text: '',
        voice: { id: 'en-US-JennyNeural' },
      };

      // With mocked provider, this succeeds (mock doesn't validate)
      const response = await service.synthesize(request);
      expect(response.audio).toBeInstanceOf(Buffer);

      // Note: Real AzureProvider would throw InvalidConfigError for empty text
    });

    test('handles very long text', async () => {
      const longText = 'a'.repeat(10000);
      const request: TTSSynthesizeRequest = {
        text: longText,
        voice: { id: 'en-US-JennyNeural' },
      };

      const response = await service.synthesize(request);

      expect(response.audio).toBeInstanceOf(Buffer);
    });

    test('handles requests with all optional parameters', async () => {
      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        provider: TTSProvider.AZURE,
        voice: { id: 'en-US-JennyNeural' },
        audio: {
          format: 'mp3',
          speed: 1.0,
          sampleRate: 24000,
        },
        providerOptions: {
          emotion: 'cheerful',
          style: 'chat',
        },
      };

      const response = await service.synthesize(request);

      expect(response.audio).toBeInstanceOf(Buffer);
    });
  });

  describe('Retry', () => {
    let service: TTSService;

    beforeEach(() => {
      service = new TTSService();
      // Mock sleep to avoid real delays
      jest.spyOn(retryUtils, 'sleep').mockResolvedValue(undefined);
    });

    test('retries on retryable error with default config (retry: undefined)', async () => {
      const provider = service.getProvider(TTSProvider.AZURE);
      jest
        .spyOn(provider, 'synthesize')
        .mockRejectedValueOnce(new QuotaExceededError('azure', 'Rate limited'))
        .mockResolvedValue({
          audio: Buffer.from('mock-audio'),
          metadata: {
            provider: 'azure',
            voice: 'en-US-JennyNeural',
            duration: 1000,
            audioFormat: 'mp3',
            sampleRate: 24000,
          },
          billing: { characters: 5 },
        });

      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        voice: { id: 'en-US-JennyNeural' },
      };

      const response = await service.synthesize(request);

      expect(response.audio).toBeInstanceOf(Buffer);
      expect(provider.synthesize).toHaveBeenCalledTimes(2);
    });

    test('retries when retry: true', async () => {
      const provider = service.getProvider(TTSProvider.AZURE);
      jest
        .spyOn(provider, 'synthesize')
        .mockRejectedValueOnce(new QuotaExceededError('azure'))
        .mockResolvedValue({
          audio: Buffer.from('mock-audio'),
          metadata: {
            provider: 'azure',
            voice: 'en-US-JennyNeural',
            duration: 1000,
            audioFormat: 'mp3',
            sampleRate: 24000,
          },
          billing: { characters: 5 },
        });

      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        voice: { id: 'en-US-JennyNeural' },
        retry: true,
      };

      const response = await service.synthesize(request);

      expect(response.audio).toBeInstanceOf(Buffer);
      expect(provider.synthesize).toHaveBeenCalledTimes(2);
    });

    test('does not retry when retry: false', async () => {
      const provider = service.getProvider(TTSProvider.AZURE);
      const error = new QuotaExceededError('azure', 'Rate limited');
      jest.spyOn(provider, 'synthesize').mockRejectedValue(error);

      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        voice: { id: 'en-US-JennyNeural' },
        retry: false,
      };

      await expect(service.synthesize(request)).rejects.toThrow(
        QuotaExceededError
      );
      expect(provider.synthesize).toHaveBeenCalledTimes(1);
    });

    test('uses custom retry config', async () => {
      const provider = service.getProvider(TTSProvider.AZURE);
      jest
        .spyOn(provider, 'synthesize')
        .mockRejectedValueOnce(new QuotaExceededError('azure'))
        .mockResolvedValue({
          audio: Buffer.from('mock-audio'),
          metadata: {
            provider: 'azure',
            voice: 'en-US-JennyNeural',
            duration: 1000,
            audioFormat: 'mp3',
            sampleRate: 24000,
          },
          billing: { characters: 5 },
        });

      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        voice: { id: 'en-US-JennyNeural' },
        retry: {
          maxRetries: 1,
          initialDelayMs: 100,
          multiplier: 2,
          maxDelayMs: 1000,
        },
      };

      const response = await service.synthesize(request);

      expect(response.audio).toBeInstanceOf(Buffer);
      expect(provider.synthesize).toHaveBeenCalledTimes(2);
    });

    test('does not retry non-retryable errors even with retry: true', async () => {
      const provider = service.getProvider(TTSProvider.AZURE);
      const error = new InvalidConfigError('azure', 'Bad API key');
      jest.spyOn(provider, 'synthesize').mockRejectedValue(error);

      const request: TTSSynthesizeRequest = {
        text: 'Hello',
        voice: { id: 'en-US-JennyNeural' },
        retry: true,
      };

      await expect(service.synthesize(request)).rejects.toThrow(
        InvalidConfigError
      );
      expect(provider.synthesize).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dialog', () => {
    let service: TTSService;

    beforeEach(() => {
      service = new TTSService();
    });

    test('throws when the resolved provider does not support dialog', async () => {
      // Only the (mocked) Azure provider is registered here, and it is not
      // dialog-capable, so the default-provider dialog call must be rejected.
      await expect(
        service.synthesizeDialog({
          speakers: [{ speaker: 'A', voice: 'v1' }],
          segments: [{ turns: [{ speaker: 'A', text: 'Hi.' }] }],
        })
      ).rejects.toThrow(InvalidConfigError);
    });

    test('error message names the unsupported provider', async () => {
      await expect(
        service.synthesizeDialog({
          provider: TTSProvider.AZURE,
          speakers: [{ speaker: 'A', voice: 'v1' }],
          segments: [{ turns: [{ speaker: 'A', text: 'Hi.' }] }],
        })
      ).rejects.toThrow(/does not support dialog/i);
    });
  });
});