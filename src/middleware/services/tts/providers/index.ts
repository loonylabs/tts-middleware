/**
 * TTS Providers
 *
 * Export all provider classes and error types
 */

// Base provider and errors
export {
  BaseTTSProvider,
  TTSError,
  InvalidConfigError,
  InvalidVoiceError,
  QuotaExceededError,
  ProviderUnavailableError,
  SynthesisFailedError,
  NetworkError,
  PayloadTooLargeError,
  supportsDialog,
} from './base-tts-provider';
export type {
  SupportsDialog,
  DialogCapabilities,
} from './base-tts-provider';

// Provider implementations
export { AzureProvider } from './azure-provider';
export { EdenAIProvider } from './edenai-provider';
export { GoogleCloudTTSProvider } from './google-cloud-tts-provider';
export type { GoogleCloudTTSRegion, GoogleCloudTTSConfig } from './google-cloud-tts-provider';
export { FishAudioProvider } from './fish-audio-provider';
export { InworldProvider } from './inworld-provider';
export { VertexAITTSProvider } from './vertex-ai-tts-provider';
export type { VertexAITTSConfig } from './vertex-ai-tts-provider';
export { CartesiaProvider } from './cartesia-provider';
export { ElevenLabsProvider } from './elevenlabs-provider';

// Future provider implementations will be exported here:
// export { OpenAIProvider } from './openai-provider';
// export { DeepgramProvider } from './deepgram-provider';
