import type { RetryConfig } from '../utils/retry.utils';

/**
 * Common types and interfaces for TTS Middleware
 *
 * These types form the contract between the TTS middleware and consuming applications.
 * All provider parameters are pre-typed to prevent breaking API changes when adding new providers.
 */

/**
 * Supported TTS providers
 *
 * @MVP ✅ AZURE - Microsoft Azure Speech Services (EU-compliant, free tier)
 * @Current ✅ EDENAI - EdenAI multi-provider aggregator
 * @Future 🔮 OPENAI - OpenAI TTS API
 * @Future 🔮 ELEVENLABS - ElevenLabs TTS API
 * @Future 🔮 GOOGLE - Google Cloud Text-to-Speech
 * @Future 🔮 DEEPGRAM - Deepgram TTS API
 */
export enum TTSProvider {
  AZURE = 'azure',
  EDENAI = 'edenai',
  OPENAI = 'openai',
  ELEVENLABS = 'elevenlabs',
  GOOGLE = 'google',
  DEEPGRAM = 'deepgram',
  FISH_AUDIO = 'fish_audio',
  INWORLD = 'inworld',
  VERTEX_AI = 'vertex_ai',
  CARTESIA = 'cartesia',
}

/**
 * Audio format options supported across providers
 *
 * @MVP ✅ mp3, wav, opus - Supported by Azure
 * @Future 🔮 aac, flac - Additional formats for other providers
 */
export type AudioFormat = 'mp3' | 'wav' | 'opus' | 'aac' | 'flac';

/**
 * Audio configuration options
 */
export interface AudioOptions {
  /**
   * Audio output format
   * @MVP ✅ Implemented: mp3, wav, opus
   * @Future 🔮 aac, flac
   * @default 'mp3'
   */
  format?: AudioFormat;

  /**
   * Speech speed multiplier
   * @MVP ✅ Implemented (Azure)
   * @range 0.25 - 4.0
   * @default 1.0
   * @providers All providers support this
   */
  speed?: number;

  /**
   * Pitch adjustment in semitones
   * @Future 🔮 Google, Azure
   * @range -20 to 20
   * @default 0
   */
  pitch?: number;

  /**
   * Volume gain in decibels
   * @Future 🔮 Google
   * @range -96 to 16
   * @default 0
   */
  volumeGainDb?: number;

  /**
   * Temperature for controlling randomness/expressiveness
   * @range 0 - 2 (providers clamp to their supported range internally)
   * @default Provider-dependent
   * @providers Fish Audio, Inworld AI
   */
  temperature?: number;

  /**
   * Audio sample rate in Hz
   * @MVP ✅ Implemented (Azure)
   * @options 8000, 16000, 24000, 48000
   * @default 24000
   */
  sampleRate?: number;
}

/**
 * Voice configuration
 */
export interface VoiceConfig {
  /**
   * Voice identifier (provider-specific)
   * @MVP ✅ Implemented
   * @example Azure: 'de-DE-KatjaNeural', 'en-US-JennyNeural'
   * @example OpenAI: 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
   * @example ElevenLabs: 'voice_xyz123'
   */
  id: string;
}

/**
 * TTS synthesis request
 *
 * @description Request object for converting text to speech
 *
 * @example
 * ```typescript
 * const request: TTSSynthesizeRequest = {
 *   text: "Hello, how are you?",
 *   provider: TTSProvider.AZURE,
 *   voice: { id: 'en-US-JennyNeural' },
 *   audio: { speed: 1.0, format: 'mp3' }
 * };
 * ```
 */
export interface TTSSynthesizeRequest {
  /**
   * Input text to synthesize
   * @MVP ✅ Implemented
   * @example "Hello, how are you?"
   */
  text: string;

  /**
   * TTS provider to use
   * @MVP ✅ Implemented
   * @optional Uses default provider if not specified
   * @default TTSProvider.AZURE
   */
  provider?: TTSProvider;

  /**
   * Voice configuration
   * @MVP ✅ Implemented
   */
  voice: VoiceConfig;

  /**
   * Audio output options
   * @MVP ✅ Implemented (Azure supports format, speed, sampleRate)
   * @Future 🔮 pitch, volumeGainDb
   */
  audio?: AudioOptions;

  /**
   * Provider-specific options
   * @MVP ✅ Implemented (Azure: emotion, style)
   * @Future 🔮 OpenAI, ElevenLabs, Google, Deepgram options
   *
   * @description Use this for provider-specific parameters that don't fit
   * into the universal interface. See provider-options.types.ts for
   * typed options per provider.
   *
   * @example Azure
   * ```typescript
   * providerOptions: { emotion: 'cheerful', style: 'chat' }
   * ```
   *
   * @example ElevenLabs
   * ```typescript
   * providerOptions: { stability: 0.5, similarity_boost: 0.75 }
   * ```
   */
  providerOptions?: Record<string, unknown>;

  /**
   * Enable retry with exponential backoff for transient errors
   *
   * @description When enabled (default), the middleware automatically retries
   * on transient errors (429 rate limit, 5xx server errors, timeouts).
   * Non-retryable errors (401, 403, 400) are thrown immediately.
   *
   * - `true` — retry with default config (3 retries, 1s initial delay, 2x multiplier)
   * - `false` — no retry, errors thrown immediately
   * - `RetryConfig` object — retry with custom configuration
   *
   * @default true
   *
   * @example
   * ```typescript
   * // Default retry (on)
   * { text: "Hello", voice: { id: "en-US-JennyNeural" } }
   *
   * // Disable retry
   * { text: "Hello", voice: { id: "en-US-JennyNeural" }, retry: false }
   *
   * // Custom retry config
   * { text: "Hello", voice: { id: "en-US-JennyNeural" }, retry: { maxRetries: 5, initialDelayMs: 500, multiplier: 2, maxDelayMs: 10000 } }
   * ```
   */
  retry?: boolean | RetryConfig;
}

/**
 * TTS response metadata
 */
export interface TTSResponseMetadata {
  /**
   * Provider that generated the audio
   * @MVP ✅ Implemented
   */
  provider: string;

  /**
   * Voice ID that was used
   * @MVP ✅ Implemented
   */
  voice: string;

  /**
   * Synthesis duration in milliseconds (how long the API call took)
   * @MVP ✅ Implemented
   */
  duration: number;

  /**
   * Actual audio duration in milliseconds (length of the audio file)
   *
   * @description Calculated by parsing MP3 frame headers from the audio buffer.
   * Only available for MP3 format — `undefined` for other formats (WAV, OPUS, etc.).
   */
  audioDuration?: number;

  /**
   * Audio format of the output
   * @MVP ✅ Implemented
   */
  audioFormat: string;

  /**
   * Sample rate in Hz
   * @MVP ✅ Implemented
   */
  sampleRate: number;

  /**
   * GCP region that processed the request
   *
   * @description Set by Vertex AI-based providers (Vertex AI TTS).
   * Useful for auditing data residency and diagnosing region rotation.
   *
   * @example 'europe-west4'
   * @example 'us-central1'
   */
  region?: string;
}

/**
 * Billing information for the TTS request
 *
 * @description Consumer application uses this to calculate costs based on
 * their provider rates. Middleware does not calculate costs.
 */
export interface TTSBillingInfo {
  /**
   * Number of characters in the input text
   * @MVP ✅ Implemented
   *
   * @description This count excludes SSML markup (for providers that use SSML internally).
   * The count includes spaces, punctuation, and newlines.
   *
   * Consumer apps calculate cost as:
   * - Azure: (characters / 1_000_000) * $16
   * - OpenAI: (characters / 1_000_000) * $15
   * - ElevenLabs: (characters / 1_000_000) * $150-200
   */
  characters: number;

  /**
   * Number of tokens used (for token-based providers)
   * @Future 🔮 OpenAI gpt-4o-mini-tts
   *
   * @description Only populated for token-based providers like OpenAI's newer models.
   * Most providers use character-based billing, so this will be undefined.
   */
  tokensUsed?: number;
}

/**
 * TTS synthesis response
 *
 * @description Response from TTS synthesis containing audio data,
 * metadata, and billing information
 */
export interface TTSResponse {
  /**
   * Raw audio data as Buffer
   * @MVP ✅ Implemented
   *
   * @description Binary audio data in the requested format (MP3, WAV, etc.)
   *
   * @example
   * ```typescript
   * import fs from 'fs';
   * fs.writeFileSync('output.mp3', response.audio);
   * ```
   */
  audio: Buffer;

  /**
   * Metadata about the synthesis
   * @MVP ✅ Implemented
   */
  metadata: TTSResponseMetadata;

  /**
   * Billing information for cost calculation
   * @MVP ✅ Implemented
   */
  billing: TTSBillingInfo;
}

/**
 * Voice information (for future voice catalog feature)
 *
 * @Future 🔮 Not implemented in MVP - used for listVoices() API
 */
export interface TTSVoice {
  /**
   * Unique voice identifier
   */
  id: string;

  /**
   * Human-readable voice name
   */
  name: string;

  /**
   * Language code (e.g., 'en-US', 'de-DE')
   */
  language: string;

  /**
   * Voice gender
   */
  gender: 'male' | 'female' | 'neutral';

  /**
   * Provider that offers this voice
   */
  provider: TTSProvider;

  /**
   * Additional provider-specific metadata
   */
  metadata?: TTSVoiceMetadata;
}

/**
 * Provider-specific voice metadata
 *
 * @Future 🔮 Not implemented in MVP
 */
export interface TTSVoiceMetadata {
  /**
   * Voice quality/tier (e.g., 'standard', 'neural', 'premium')
   */
  quality?: string;

  /**
   * Supported styles (Azure-specific)
   */
  styles?: string[];

  /**
   * Supported emotions (Azure-specific)
   */
  emotions?: string[];

  /**
   * Additional properties
   */
  [key: string]: unknown;
}

/**
 * Error codes for TTS operations
 */
export enum TTSErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  INVALID_VOICE = 'INVALID_VOICE',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  SYNTHESIS_FAILED = 'SYNTHESIS_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
