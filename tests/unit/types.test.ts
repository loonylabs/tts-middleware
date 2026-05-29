/**
 * Tests for TTS Types
 *
 * @description Tests all type definitions, enums, and interfaces
 * @coverage Target: 100%
 */

import type {
  AudioFormat,
  TTSSynthesizeRequest,
  TTSResponse,
  TTSVoice,
  AzureProviderOptions,
  OpenAIProviderOptions,
  ElevenLabsProviderOptions,
  GoogleCloudProviderOptions,
  DeepgramProviderOptions,
} from '../../src/middleware/services/tts/types';

import {
  TTSProvider,
  TTSErrorCode,
  isAzureOptions,
  isOpenAIOptions,
  isElevenLabsOptions,
  isGoogleCloudOptions,
  isDeepgramOptions,
} from '../../src/middleware/services/tts/types';

describe('TTSProvider enum', () => {
  test('has all expected provider values', () => {
    expect(TTSProvider.AZURE).toBe('azure');
    expect(TTSProvider.EDENAI).toBe('edenai');
    expect(TTSProvider.OPENAI).toBe('openai');
    expect(TTSProvider.ELEVENLABS).toBe('elevenlabs');
    expect(TTSProvider.GOOGLE).toBe('google');
    expect(TTSProvider.DEEPGRAM).toBe('deepgram');
    expect(TTSProvider.FISH_AUDIO).toBe('fish_audio');
    expect(TTSProvider.INWORLD).toBe('inworld');
    expect(TTSProvider.VERTEX_AI).toBe('vertex_ai');
    expect(TTSProvider.CARTESIA).toBe('cartesia');
  });

  test('has exactly 10 providers', () => {
    const providerKeys = Object.keys(TTSProvider);
    expect(providerKeys).toHaveLength(10);
  });

  test('enum values are lowercase strings', () => {
    Object.values(TTSProvider).forEach((value) => {
      expect(typeof value).toBe('string');
      expect(value).toBe(value.toLowerCase());
    });
  });
});

describe('TTSErrorCode enum', () => {
  test('has all expected error codes', () => {
    expect(TTSErrorCode.INVALID_CONFIG).toBe('INVALID_CONFIG');
    expect(TTSErrorCode.INVALID_VOICE).toBe('INVALID_VOICE');
    expect(TTSErrorCode.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED');
    expect(TTSErrorCode.PROVIDER_UNAVAILABLE).toBe('PROVIDER_UNAVAILABLE');
    expect(TTSErrorCode.SYNTHESIS_FAILED).toBe('SYNTHESIS_FAILED');
    expect(TTSErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(TTSErrorCode.PAYLOAD_TOO_LARGE).toBe('PAYLOAD_TOO_LARGE');
    expect(TTSErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
  });

  test('has exactly 8 error codes', () => {
    const errorKeys = Object.keys(TTSErrorCode);
    expect(errorKeys).toHaveLength(8);
  });
});

describe('TTSSynthesizeRequest interface', () => {
  test('accepts minimal request with required fields only', () => {
    const request: TTSSynthesizeRequest = {
      text: 'Hello world',
      voice: { id: 'en-US-JennyNeural' },
    };

    expect(request.text).toBe('Hello world');
    expect(request.voice.id).toBe('en-US-JennyNeural');
    expect(request.provider).toBeUndefined();
    expect(request.audio).toBeUndefined();
    expect(request.providerOptions).toBeUndefined();
  });

  test('accepts full request with all optional fields', () => {
    const request: TTSSynthesizeRequest = {
      text: 'Guten Morgen',
      provider: TTSProvider.AZURE,
      voice: { id: 'de-DE-KatjaNeural' },
      audio: {
        format: 'mp3',
        speed: 1.0,
        pitch: 0,
        volumeGainDb: 0,
        sampleRate: 24000,
      },
      providerOptions: {
        emotion: 'cheerful',
        style: 'chat',
      },
    };

    expect(request.text).toBe('Guten Morgen');
    expect(request.provider).toBe(TTSProvider.AZURE);
    expect(request.voice.id).toBe('de-DE-KatjaNeural');
    expect(request.audio?.format).toBe('mp3');
    expect(request.audio?.speed).toBe(1.0);
    expect(request.audio?.sampleRate).toBe(24000);
    expect(request.providerOptions).toEqual({
      emotion: 'cheerful',
      style: 'chat',
    });
  });

  test('accepts any providerOptions structure', () => {
    const request1: TTSSynthesizeRequest = {
      text: 'Test',
      voice: { id: 'voice1' },
      providerOptions: { customParam: 'value' },
    };

    const request2: TTSSynthesizeRequest = {
      text: 'Test',
      voice: { id: 'voice2' },
      providerOptions: { nested: { deep: { value: 123 } } },
    };

    expect(request1.providerOptions).toEqual({ customParam: 'value' });
    expect(request2.providerOptions).toEqual({
      nested: { deep: { value: 123 } },
    });
  });

  test('accepts all valid audio formats', () => {
    const formats: AudioFormat[] = ['mp3', 'wav', 'opus', 'aac', 'flac'];

    formats.forEach((format) => {
      const request: TTSSynthesizeRequest = {
        text: 'Test',
        voice: { id: 'voice1' },
        audio: { format },
      };

      expect(request.audio?.format).toBe(format);
    });
  });
});

describe('TTSResponse interface', () => {
  test('has correct structure with all required fields', () => {
    const response: TTSResponse = {
      audio: Buffer.from('mock-audio-data'),
      metadata: {
        provider: 'azure',
        voice: 'en-US-JennyNeural',
        duration: 2500,
        audioFormat: 'mp3',
        sampleRate: 24000,
      },
      billing: {
        characters: 11,
      },
    };

    expect(response.audio).toBeInstanceOf(Buffer);
    expect(response.metadata.provider).toBe('azure');
    expect(response.metadata.voice).toBe('en-US-JennyNeural');
    expect(response.metadata.duration).toBe(2500);
    expect(response.metadata.audioFormat).toBe('mp3');
    expect(response.metadata.sampleRate).toBe(24000);
    expect(response.billing.characters).toBe(11);
    expect(response.billing.tokensUsed).toBeUndefined();
  });

  test('includes optional tokensUsed for token-based providers', () => {
    const response: TTSResponse = {
      audio: Buffer.from('mock-audio-data'),
      metadata: {
        provider: 'openai',
        voice: 'alloy',
        duration: 1500,
        audioFormat: 'mp3',
        sampleRate: 24000,
      },
      billing: {
        characters: 20,
        tokensUsed: 15,
      },
    };

    expect(response.billing.characters).toBe(20);
    expect(response.billing.tokensUsed).toBe(15);
  });
});

describe('TTSVoice interface', () => {
  test('has correct structure for voice catalog', () => {
    const voice: TTSVoice = {
      id: 'en-US-JennyNeural',
      name: 'Jenny (Neural)',
      language: 'en-US',
      gender: 'female',
      provider: TTSProvider.AZURE,
    };

    expect(voice.id).toBe('en-US-JennyNeural');
    expect(voice.name).toBe('Jenny (Neural)');
    expect(voice.language).toBe('en-US');
    expect(voice.gender).toBe('female');
    expect(voice.provider).toBe(TTSProvider.AZURE);
  });

  test('accepts metadata for provider-specific details', () => {
    const voice: TTSVoice = {
      id: 'en-US-JennyNeural',
      name: 'Jenny',
      language: 'en-US',
      gender: 'female',
      provider: TTSProvider.AZURE,
      metadata: {
        quality: 'neural',
        styles: ['chat', 'customerservice', 'newscast'],
        emotions: ['cheerful', 'sad', 'angry'],
        custom: 'value',
      },
    };

    expect(voice.metadata?.quality).toBe('neural');
    expect(voice.metadata?.styles).toHaveLength(3);
    expect(voice.metadata?.emotions).toContain('cheerful');
    expect(voice.metadata?.custom).toBe('value');
  });
});

describe('Provider-specific options', () => {
  describe('AzureProviderOptions', () => {
    test('accepts valid emotion values', () => {
      const options: AzureProviderOptions = {
        emotion: 'cheerful',
      };

      expect(options.emotion).toBe('cheerful');
    });

    test('accepts valid style values', () => {
      const options: AzureProviderOptions = {
        style: 'chat',
      };

      expect(options.style).toBe('chat');
    });

    test('accepts both emotion and style', () => {
      const options: AzureProviderOptions = {
        emotion: 'friendly',
        style: 'customerservice',
      };

      expect(options.emotion).toBe('friendly');
      expect(options.style).toBe('customerservice');
    });
  });

  describe('OpenAIProviderOptions', () => {
    test('accepts valid model values', () => {
      const options: OpenAIProviderOptions = {
        model: 'tts-1-hd',
      };

      expect(options.model).toBe('tts-1-hd');
    });

    test('accepts responseFormat', () => {
      const options: OpenAIProviderOptions = {
        responseFormat: 'opus',
      };

      expect(options.responseFormat).toBe('opus');
    });
  });

  describe('ElevenLabsProviderOptions', () => {
    test('accepts stability and similarity_boost', () => {
      const options: ElevenLabsProviderOptions = {
        stability: 0.5,
        similarity_boost: 0.75,
      };

      expect(options.stability).toBe(0.5);
      expect(options.similarity_boost).toBe(0.75);
    });

    test('accepts speaker_boost boolean', () => {
      const options: ElevenLabsProviderOptions = {
        speaker_boost: true,
      };

      expect(options.speaker_boost).toBe(true);
    });

    test('accepts style as number', () => {
      const options: ElevenLabsProviderOptions = {
        style: 0.8,
      };

      expect(options.style).toBe(0.8);
    });
  });

  describe('GoogleCloudProviderOptions', () => {
    test('accepts effectsProfileId array', () => {
      const options: GoogleCloudProviderOptions = {
        effectsProfileId: ['headphone-class-device'],
      };

      expect(options.effectsProfileId).toEqual(['headphone-class-device']);
    });

    test('accepts region option', () => {
      const options: GoogleCloudProviderOptions = {
        region: 'eu',
      };

      expect(options.region).toBe('eu');
    });
  });

  describe('DeepgramProviderOptions', () => {
    test('accepts model string', () => {
      const options: DeepgramProviderOptions = {
        model: 'aura-asteria-en',
      };

      expect(options.model).toBe('aura-asteria-en');
    });

    test('accepts encoding and container', () => {
      const options: DeepgramProviderOptions = {
        encoding: 'opus',
        container: 'mp3',
      };

      expect(options.encoding).toBe('opus');
      expect(options.container).toBe('mp3');
    });
  });
});

describe('Type guards', () => {
  describe('isAzureOptions', () => {
    test('returns true for Azure options with emotion', () => {
      expect(isAzureOptions({ emotion: 'cheerful' })).toBe(true);
    });

    test('returns true for Azure options with style', () => {
      expect(isAzureOptions({ style: 'chat' })).toBe(true);
    });

    test('returns false for non-Azure options', () => {
      expect(isAzureOptions({ model: 'tts-1' })).toBe(false);
      expect(isAzureOptions({ stability: 0.5 })).toBe(false);
      expect(isAzureOptions({})).toBe(false);
    });

    test('returns false for null or non-object values', () => {
      expect(isAzureOptions(null)).toBe(false);
      expect(isAzureOptions(undefined)).toBe(false);
      expect(isAzureOptions('string')).toBe(false);
      expect(isAzureOptions(123)).toBe(false);
    });
  });

  describe('isOpenAIOptions', () => {
    test('returns true for OpenAI options with model', () => {
      expect(isOpenAIOptions({ model: 'tts-1' })).toBe(true);
    });

    test('returns false for non-OpenAI options', () => {
      expect(isOpenAIOptions({ emotion: 'cheerful' })).toBe(false);
      expect(isOpenAIOptions({ stability: 0.5 })).toBe(false);
      expect(isOpenAIOptions({})).toBe(false);
    });

    test('returns false if model is not a string', () => {
      expect(isOpenAIOptions({ model: 123 })).toBe(false);
    });

    test('returns false for null or non-object values', () => {
      expect(isOpenAIOptions(null)).toBe(false);
      expect(isOpenAIOptions(undefined)).toBe(false);
    });
  });

  describe('isElevenLabsOptions', () => {
    test('returns true for ElevenLabs options with stability', () => {
      expect(isElevenLabsOptions({ stability: 0.5 })).toBe(true);
    });

    test('returns true for ElevenLabs options with similarity_boost', () => {
      expect(isElevenLabsOptions({ similarity_boost: 0.75 })).toBe(true);
    });

    test('returns false for non-ElevenLabs options', () => {
      expect(isElevenLabsOptions({ emotion: 'cheerful' })).toBe(false);
      expect(isElevenLabsOptions({ model: 'tts-1' })).toBe(false);
      expect(isElevenLabsOptions({})).toBe(false);
    });

    test('returns false for null or non-object values', () => {
      expect(isElevenLabsOptions(null)).toBe(false);
      expect(isElevenLabsOptions(undefined)).toBe(false);
    });
  });

  describe('isGoogleCloudOptions', () => {
    test('returns true for Google options with effectsProfileId', () => {
      expect(isGoogleCloudOptions({ effectsProfileId: ['device'] })).toBe(
        true
      );
    });

    test('returns true for Google options with region', () => {
      expect(isGoogleCloudOptions({ region: 'eu' })).toBe(true);
    });

    test('returns false for non-Google options', () => {
      expect(isGoogleCloudOptions({ emotion: 'cheerful' })).toBe(false);
      expect(isGoogleCloudOptions({ stability: 0.5 })).toBe(false);
      expect(isGoogleCloudOptions({})).toBe(false);
    });

    test('returns false for null or non-object values', () => {
      expect(isGoogleCloudOptions(null)).toBe(false);
      expect(isGoogleCloudOptions(undefined)).toBe(false);
    });
  });

  describe('isDeepgramOptions', () => {
    test('returns true for Deepgram options with encoding', () => {
      expect(isDeepgramOptions({ encoding: 'opus' })).toBe(true);
    });

    test('returns true for Deepgram options with container', () => {
      expect(isDeepgramOptions({ container: 'mp3' })).toBe(true);
    });

    test('returns false for non-Deepgram options', () => {
      expect(isDeepgramOptions({ emotion: 'cheerful' })).toBe(false);
      expect(isDeepgramOptions({ stability: 0.5 })).toBe(false);
      expect(isDeepgramOptions({})).toBe(false);
    });

    test('returns false for null or non-object values', () => {
      expect(isDeepgramOptions(null)).toBe(false);
      expect(isDeepgramOptions(undefined)).toBe(false);
    });
  });
});

describe('Strict type checking', () => {
  test('TTSProvider enum cannot be assigned arbitrary strings', () => {
    // This test ensures TypeScript compilation catches type errors
    const validProvider: TTSProvider = TTSProvider.AZURE;
    expect(validProvider).toBe('azure');

    // The following would cause TypeScript errors (tested at compile time):
    // const invalidProvider: TTSProvider = 'invalid'; // ❌ Type error
  });

  test('audio options are optional but typed correctly when provided', () => {
    // Audio options are all optional
    const request1: TTSSynthesizeRequest = {
      text: 'Test',
      voice: { id: 'voice1' },
    };
    expect(request1.audio).toBeUndefined();

    // When provided, they must match the interface
    const request2: TTSSynthesizeRequest = {
      text: 'Test',
      voice: { id: 'voice2' },
      audio: {
        format: 'mp3',
        speed: 1.0,
        sampleRate: 24000,
      },
    };
    expect(request2.audio?.format).toBe('mp3');
    expect(request2.audio?.speed).toBe(1.0);
    expect(request2.audio?.sampleRate).toBe(24000);
  });

  test('TTSResponse requires all metadata fields', () => {
    const response: TTSResponse = {
      audio: Buffer.from('data'),
      metadata: {
        provider: 'azure',
        voice: 'voice1',
        duration: 1000,
        audioFormat: 'mp3',
        sampleRate: 24000,
      },
      billing: {
        characters: 10,
      },
    };

    expect(response.metadata.provider).toBeDefined();
    expect(response.metadata.voice).toBeDefined();
    expect(response.metadata.duration).toBeDefined();
    expect(response.metadata.audioFormat).toBeDefined();
    expect(response.metadata.sampleRate).toBeDefined();
  });
});
