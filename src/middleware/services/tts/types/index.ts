/**
 * TTS Middleware Types
 *
 * Public API exports for all TTS types and interfaces.
 *
 * @module @loonylabs/tts-middleware/types
 */

// ===== Common Types (Universal) =====
export {
  TTSProvider,
  TTSErrorCode,
  AudioFormat,
} from './common.types';

export type {
  AudioOptions,
  VoiceConfig,
  TTSSynthesizeRequest,
  TTSResponse,
  TTSResponseMetadata,
  TTSBillingInfo,
  TTSVoice,
  TTSVoiceMetadata,
} from './common.types';

// ===== Provider-Specific Options =====
export type {
  AzureProviderOptions,
  OpenAIProviderOptions,
  ElevenLabsProviderOptions,
  GoogleCloudTTSProviderOptions,
  GoogleCloudProviderOptions, // deprecated alias
  GoogleCloudTTSRegion,
  DeepgramProviderOptions,
  EdenAIProviderOptions,
  FishAudioProviderOptions,
  InworldProviderOptions,
  VertexAITTSProviderOptions,
  CartesiaProviderOptions,
  DialogSpeaker,
  DialogTurn,
  DialogSegment,
  SynthesizeDialogRequest,
  ProviderOptions,
} from './provider-options.types';

export {
  isAzureOptions,
  isOpenAIOptions,
  isElevenLabsOptions,
  isGoogleCloudTTSOptions,
  isGoogleCloudOptions, // deprecated alias
  isDeepgramOptions,
  isEdenAIOptions,
  isFishAudioOptions,
  isInworldOptions,
  isVertexAITTSOptions,
  isCartesiaOptions,
} from './provider-options.types';

/**
 * Re-export all types for convenience
 *
 * @example
 * ```typescript
 * import type * as TTSTypes from '@loonylabs/tts-middleware/types';
 * ```
 */
export * from './common.types';
export * from './provider-options.types';
