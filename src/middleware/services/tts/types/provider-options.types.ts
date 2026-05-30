/**
 * Provider-specific option types for TTS synthesis
 *
 * These types define all possible provider-specific parameters.
 * All providers are typed NOW (MVP + Future) to prevent breaking API changes.
 *
 * @MVP ✅ Azure options are implemented
 * @Future 🔮 Other providers typed but not implemented yet
 */

import type { RetryConfig } from '../utils/retry.utils';

/**
 * Azure Speech Services provider options
 *
 * @MVP ✅ Implemented
 * @provider Azure Speech Services
 *
 * @see https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice
 */
export interface AzureProviderOptions {
  /**
   * Emotional tone of the speech
   * @MVP ✅ Implemented
   *
   * @description Maps to SSML style attribute. Only supported by
   * specific Azure neural voices (e.g., Jenny, Guy, Aria).
   *
   * @options 'sad', 'angry', 'cheerful', 'friendly', 'terrified',
   *          'shouting', 'whispering', 'hopeful', 'gentle', 'excited',
   *          'empathetic', 'calm', 'fearful', 'disgruntled', 'serious',
   *          'depressed', 'embarrassed'
   *
   * @example 'cheerful'
   */
  emotion?:
    | 'sad'
    | 'angry'
    | 'cheerful'
    | 'friendly'
    | 'terrified'
    | 'shouting'
    | 'whispering'
    | 'hopeful'
    | 'gentle'
    | 'excited'
    | 'empathetic'
    | 'calm'
    | 'fearful'
    | 'disgruntled'
    | 'serious'
    | 'depressed'
    | 'embarrassed';

  /**
   * Speaking style for the voice
   * @MVP ✅ Implemented
   *
   * @description Maps to SSML style attribute. Voice-dependent feature.
   *
   * @options 'chat', 'customerservice', 'newscast', 'assistant',
   *          'newscast-casual', 'newscast-formal', 'chat-casual',
   *          'lyrical', 'advertisement-upbeat', 'narration-professional',
   *          'narration-relaxed', 'sports-commentary',
   *          'sports-commentary-excited'
   *
   * For **Dragon HD Omni** voices (`:DragonHDOmniLatestNeural`) this may also be
   * a free-text natural-language style description (e.g. `'warm bedtime
   * storytelling'`). Plain DragonHD voices ignore styles entirely (use
   * `temperature` instead).
   *
   * @example 'chat'
   * @example 'warm, tender bedtime storytelling' // Dragon HD Omni only
   */
  style?:
    | 'chat'
    | 'customerservice'
    | 'newscast'
    | 'assistant'
    | 'newscast-casual'
    | 'newscast-formal'
    | 'chat-casual'
    | 'lyrical'
    | 'advertisement-upbeat'
    | 'narration-professional'
    | 'narration-relaxed'
    | 'sports-commentary'
    | 'sports-commentary-excited'
    // Allow arbitrary free-text styles (Dragon HD Omni) while keeping the
    // predefined values as autocomplete hints.
    // eslint-disable-next-line @typescript-eslint/ban-types
    | (string & {});

  /**
   * Style intensity/degree (0.01 to 2.0)
   * @Future 🔮 Not implemented in MVP
   *
   * @range 0.01 - 2.0
   * @default 1.0
   */
  styleDegree?: number;

  /**
   * Role play scenario
   * @Future 🔮 Not implemented in MVP
   *
   * @options 'YoungAdultFemale', 'YoungAdultMale', 'OlderAdultFemale', 'OlderAdultMale', 'Girl', 'Boy'
   */
  role?: string;

  /**
   * Output variation for **HD voices** (`:DragonHDLatestNeural` /
   * `:DragonHDOmniLatestNeural`).
   * @MVP ✅ Implemented (HD voices only)
   *
   * @description Emitted as the `temperature` value of the `<voice parameters="…">`
   * attribute. Lower = more stable/predictable delivery, higher = more
   * expressive variation. Ignored for standard neural voices.
   *
   * @range 0 - 1 (Dragon HD default 1.0; Omni default 0.7)
   * @example 0.8
   */
  temperature?: number;

  /**
   * Nucleus-sampling diversity for **Dragon HD Omni** voices.
   * @MVP ✅ Implemented (HD voices only)
   *
   * @description Emitted as `top_p` in the `<voice parameters="…">` attribute.
   * Cartesia/Omni recommend keeping `topP` ≈ `temperature`.
   *
   * @range 0.3 - 1.0
   */
  topP?: number;

  /**
   * Classifier-free-guidance scale for **Dragon HD Omni** voices.
   * @MVP ✅ Implemented (HD voices only)
   *
   * @description Emitted as `cfg_scale` in the `<voice parameters="…">`
   * attribute. Higher = faster speech with stronger contextual relevance.
   *
   * @range 1.0 - 2.0
   */
  cfgScale?: number;
}

/**
 * OpenAI TTS provider options
 *
 * @Future 🔮 Not implemented in MVP
 * @provider OpenAI TTS API
 *
 * @see https://platform.openai.com/docs/guides/text-to-speech
 */
export interface OpenAIProviderOptions {
  /**
   * TTS model to use
   * @Future 🔮 Not implemented in MVP
   *
   * @options
   * - 'tts-1': Standard quality, lower latency
   * - 'tts-1-hd': High quality, higher latency
   * - 'gpt-4o-mini-tts': Token-based model
   *
   * @default 'tts-1'
   */
  model?: 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts';

  /**
   * Response format override
   * @Future 🔮 Not implemented in MVP
   *
   * @description If not specified, uses the format from audio.format
   *
   * @options 'mp3', 'opus', 'aac', 'flac'
   * @default 'mp3'
   */
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac';
}

/**
 * ElevenLabs TTS provider options
 *
 * @provider ElevenLabs TTS API
 * @description Implemented as a **benchmark/test-only** provider — no EU data
 * residency below Enterprise tier. Use for quality comparisons, not EU-compliant
 * production.
 *
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export interface ElevenLabsProviderOptions {
  /**
   * Voice model ID
   * @MVP ✅ Implemented
   *
   * @options
   * - 'eleven_v3': Newest, most expressive model (highest quality)
   * - 'eleven_multilingual_v2': Stable multilingual model
   * - 'eleven_flash_v2_5': Fastest, lower latency
   * - 'eleven_turbo_v2': Fast, lower quality
   *
   * @default 'eleven_multilingual_v2'
   */
  model_id?: string;

  /**
   * Synthesis language (ISO 639-1)
   * @MVP ✅ Implemented
   *
   * @description Enforces a language; omit to let the model auto-detect.
   *
   * @example 'de'
   */
  language_code?: string;

  /**
   * ElevenLabs `output_format` override (query parameter)
   * @MVP ✅ Implemented
   *
   * @description Overrides the auto-mapped output format. Bitrate/sample-rate
   * combinations are tier-gated by ElevenLabs.
   *
   * @options 'mp3_44100_128', 'mp3_44100_192', 'mp3_22050_32',
   *          'opus_48000_128', 'pcm_44100', 'wav_48000'
   * @default 'mp3_44100_128'
   */
  outputFormat?: string;

  /**
   * Voice stability (0.0 - 1.0)
   * @Future 🔮 Not implemented in MVP
   *
   * @description Higher values = more stable/consistent, less expressive
   * Lower values = more variable/expressive
   *
   * @range 0.0 - 1.0
   * @default 0.5
   */
  stability?: number;

  /**
   * Similarity boost (0.0 - 1.0)
   * @Future 🔮 Not implemented in MVP
   *
   * @description Higher values = more similar to original voice sample
   *
   * @range 0.0 - 1.0
   * @default 0.75
   */
  similarity_boost?: number;

  /**
   * Enable speaker boost
   * @Future 🔮 Not implemented in MVP
   *
   * @description Enhances voice clarity and reduces artifacts
   *
   * @default true
   */
  speaker_boost?: boolean;

  /**
   * Style exaggeration (0.0 - 1.0)
   * @Future 🔮 Not implemented in MVP
   *
   * @description Higher values = more exaggerated style (different from Azure style!)
   *
   * @range 0.0 - 1.0
   * @default 0.0
   */
  style?: number;

  /**
   * Use speaker boost (legacy parameter)
   * @Future 🔮 Not implemented in MVP
   * @deprecated Use speaker_boost instead
   */
  use_speaker_boost?: boolean;
}

/**
 * Region rotation configuration for Vertex AI quota management
 *
 * @description When a 429 quota error occurs, the provider automatically retries
 * with the next region in the list. Same pattern as llm-middleware and tti-middleware.
 *
 * @example
 * ```typescript
 * {
 *   regions: ['europe-west4', 'europe-west1', 'europe-west3'],
 *   fallback: 'us-central1',
 * }
 * ```
 */
export interface RegionRotationConfig {
  /**
   * Ordered list of regions to try on quota errors (429 / Resource Exhausted)
   *
   * @example ['europe-west4', 'europe-west1', 'europe-west3']
   */
  regions: string[];

  /**
   * Last-resort fallback region, tried after all `regions` are exhausted
   *
   * @example 'us-central1'
   */
  fallback: string;

  /**
   * Whether to attempt the fallback region one extra time after the main rotation fails
   *
   * @description Mirrors the `alwaysTryFallback` behaviour in llm-middleware.
   * Useful when the fallback is a higher-quota global region.
   *
   * @default true
   */
  alwaysTryFallback?: boolean;
}

/**
 * Supported Google Cloud TTS regions for EU data residency
 *
 * @description Use EU regions for GDPR/CDPA compliance with data residency guarantees.
 * The 'eu' region uses the EU multi-region endpoint (eu-texttospeech.googleapis.com).
 *
 * @see https://cloud.google.com/text-to-speech/docs/endpoints
 */
export type GoogleCloudTTSRegion =
  | 'eu' // EU multi-region endpoint (recommended for DSGVO)
  | 'europe-west1' // Belgium
  | 'europe-west2' // London, UK
  | 'europe-west3' // Frankfurt, Germany (recommended for DACH)
  | 'europe-west4' // Netherlands
  | 'europe-west6' // Zurich, Switzerland
  | 'europe-west9' // Paris, France
  | 'us-central1' // Iowa (NOT EU-compliant)
  | 'global'; // Global endpoint (no data residency guarantee)

/**
 * Google Cloud Text-to-Speech provider options
 *
 * @provider Google Cloud TTS
 * @description Direct Google Cloud TTS integration with EU-regional endpoint support
 * for GDPR/CDPA compliance. Uses Service Account authentication.
 *
 * @see https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize
 */
export interface GoogleCloudTTSProviderOptions {
  /**
   * Region for data residency (EU-compliance)
   *
   * @description Use 'eu' or specific EU regions (europe-west3, etc.) for DSGVO compliance.
   * Data will be processed in the specified region without leaving it.
   *
   * @env GOOGLE_TTS_REGION
   * @default 'eu' (EU multi-region endpoint)
   *
   * @example 'eu' - EU multi-region (recommended)
   * @example 'europe-west3' - Frankfurt, Germany
   */
  region?: GoogleCloudTTSRegion;

  /**
   * Audio effects profile IDs
   *
   * @description Array of audio effect profile IDs to apply.
   * These optimize the audio for specific playback devices.
   *
   * @options
   * - 'wearable-class-device'
   * - 'handset-class-device'
   * - 'headphone-class-device'
   * - 'small-bluetooth-speaker-class-device'
   * - 'medium-bluetooth-speaker-class-device'
   * - 'large-home-entertainment-class-device'
   * - 'large-automotive-class-device'
   * - 'telephony-class-application'
   *
   * @example ['headphone-class-device']
   */
  effectsProfileId?: string[];

}

/**
 * @deprecated Use GoogleCloudTTSProviderOptions instead
 */
export type GoogleCloudProviderOptions = GoogleCloudTTSProviderOptions;

/**
 * Deepgram TTS provider options
 *
 * @Future 🔮 Not implemented in MVP
 * @provider Deepgram TTS API
 *
 * @see https://developers.deepgram.com/docs/tts-rest
 */
export interface DeepgramProviderOptions {
  /**
   * TTS model to use
   * @Future 🔮 Not implemented in MVP
   *
   * @options
   * - 'aura-asteria-en': Female, US English
   * - 'aura-luna-en': Female, US English
   * - 'aura-stella-en': Female, US English
   * - 'aura-athena-en': Female, UK English
   * - 'aura-hera-en': Female, US English
   * - 'aura-orion-en': Male, US English
   * - 'aura-arcas-en': Male, US English
   * - 'aura-perseus-en': Male, US English
   * - 'aura-angus-en': Male, Irish English
   * - 'aura-orpheus-en': Male, US English
   * - 'aura-helios-en': Male, UK English
   * - 'aura-zeus-en': Male, US English
   *
   * @default 'aura-asteria-en'
   */
  model?: string;

  /**
   * Audio encoding format
   * @Future 🔮 Not implemented in MVP
   *
   * @description Alternative to format in AudioOptions
   *
   * @options 'linear16', 'mulaw', 'alaw', 'opus', 'aac', 'mp3'
   * @default 'linear16'
   */
  encoding?: 'linear16' | 'mulaw' | 'alaw' | 'opus' | 'aac' | 'mp3';

  /**
   * Audio container format
   * @Future 🔮 Not implemented in MVP
   *
   * @options 'wav', 'mp3', 'opus', 'flac'
   * @default 'wav'
   */
  container?: 'wav' | 'mp3' | 'opus' | 'flac';

  /**
   * Bitrate for encoded audio
   * @Future 🔮 Not implemented in MVP
   *
   * @example '128000' (128 kbps)
   */
  bitrate?: string;

  /**
   * Sample rate in Hz
   * @Future 🔮 Not implemented in MVP
   *
   * @description Alternative to sampleRate in AudioOptions
   *
   * @options 8000, 16000, 24000, 48000
   * @default 24000
   */
  sampleRate?: number;
}

/**
 * EdenAI TTS provider options
 *
 * @description EdenAI is a multi-provider aggregator that provides access
 * to multiple TTS providers through a single API.
 *
 * @provider EdenAI (multi-provider aggregator)
 *
 * @see https://docs.edenai.co/reference/text_to_speech_create
 */
export interface EdenAIProviderOptions {
  /**
   * Underlying provider to use via EdenAI
   *
   * @description EdenAI acts as an aggregator, routing requests to the selected provider.
   *
   * @options
   * - 'amazon': Amazon Polly
   * - 'google': Google Cloud TTS
   * - 'ibm': IBM Watson TTS
   * - 'microsoft': Microsoft Azure Speech
   * - 'openai': OpenAI TTS
   * - 'elevenlabs': ElevenLabs TTS
   *
   * @default Auto-selected by EdenAI based on language/voice
   */
  provider?:
    | 'amazon'
    | 'google'
    | 'ibm'
    | 'microsoft'
    | 'openai'
    | 'elevenlabs';

  /**
   * Model/quality tier to use (legacy)
   *
   * @description Provider-specific model selection (e.g., 'Neural', 'Standard', 'Wavenet')
   * @deprecated Use `settings` instead for provider-specific voice/model selection
   *
   * @example 'Neural'
   */
  model?: string;

  /**
   * Provider-specific settings for model/voice selection
   *
   * @description Object mapping provider names to their model/voice IDs.
   * This is the correct way to specify OpenAI voices via EdenAI.
   *
   * @example { "openai": "de_nova" }
   * @example { "google": "Neural" }
   */
  settings?: Record<string, string>;

  /**
   * Voice option/gender
   *
   * @description Voice selection for EdenAI. Common values: 'FEMALE', 'MALE', or provider-specific voice IDs.
   * If not specified and voice.id is just a language code, defaults to 'FEMALE'.
   *
   * @example 'FEMALE'
   */
  option?: string;

  /**
   * Specific voice ID for the underlying provider
   *
   * @description Passed as top-level `voice_id` to EdenAI API for provider-specific voice selection.
   * Useful for providers like ElevenLabs where `option` only supports MALE/FEMALE.
   *
   * @example 'Aria' (ElevenLabs)
   * @example 'Roger' (ElevenLabs)
   */
  voice_id?: string;

  /**
   * Audio format override
   *
   * @description If not specified, uses the format from audio.format
   *
   * @options 'mp3', 'wav', 'ogg', 'flac'
   * @default 'mp3'
   */
  audio_format?: 'mp3' | 'wav' | 'ogg' | 'flac';

  /**
   * Sample rate in Hz
   *
   * @description If not specified, uses the sampleRate from audio options
   *
   * @options 8000, 16000, 22050, 24000, 44100, 48000
   * @default 24000
   */
  sampling_rate?: number;

  /**
   * Fallback providers
   *
   * @description List of provider names to use as fallbacks if the primary provider fails
   *
   * @example ['google', 'amazon', 'microsoft']
   */
  fallback_providers?: string[];

  /**
   * Webhook URL for async notifications
   *
   * @description URL to receive notifications when synthesis completes (for async requests)
   */
  webhook_url?: string;

  /**
   * Webhook receiver identifier
   *
   * @description Identifier for the webhook receiver
   */
  webhook_receiver?: string;
}

/**
 * Fish Audio TTS provider options
 *
 * @provider Fish Audio TTS API
 * @description Fish Audio S1 model with 13 language support and 64+ emotional expressions.
 * Test/Admin only – no EU data residency guarantees.
 *
 * @see https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
 */
export interface FishAudioProviderOptions {
  /**
   * TTS model to use
   *
   * @options
   * - 's1': Fish Audio S1 (flagship, 4B params, recommended)
   * - 'speech-1.6': Previous generation, production-tested
   * - 'speech-1.5': Legacy, lower resource demands
   *
   * @default 's1'
   */
  model?: 's1' | 'speech-1.6' | 'speech-1.5';

  /**
   * Voice model reference ID from Fish Audio library
   *
   * @description Use a model ID from the Fish Audio voice library or a custom cloned voice.
   * If not set, uses the default Fish Audio voice.
   *
   * @example '8ef4a238714b45718ce04243307c57a7' (E-girl)
   * @example '802e3bc2b27e49c2995d23ef70e6ac89' (Energetic Male)
   */
  referenceId?: string;

  /**
   * Controls diversity via nucleus sampling
   *
   * @range 0 - 1
   * @default 0.7
   */
  topP?: number;

  /**
   * Reduces repeated patterns in output
   *
   * @default 1.2
   */
  repetitionPenalty?: number;

  /**
   * Latency mode
   *
   * @options 'low', 'normal', 'balanced'
   * @default 'normal'
   */
  latency?: 'low' | 'normal' | 'balanced';

  /**
   * Characters per processing chunk
   *
   * @range 100 - 300
   * @default 300
   */
  chunkLength?: number;

  /**
   * Whether to normalize text (improves stability for numbers)
   *
   * @default true
   */
  normalize?: boolean;

  /**
   * MP3 bitrate in kbps (only for mp3 format)
   *
   * @options 64, 128, 192
   * @default 128
   */
  mp3Bitrate?: 64 | 128 | 192;

  /**
   * Opus bitrate in bps (only for opus format)
   *
   * @options -1000 (auto), 24, 32, 48, 64
   * @default -1000
   */
  opusBitrate?: -1000 | 24 | 32 | 48 | 64;
}

/**
 * Inworld AI TTS provider options
 *
 * @provider Inworld AI TTS API
 * @description Inworld TTS 1.5 models with 15 language support and voice cloning.
 * Test/Admin only – no EU data residency guarantees.
 *
 * @see https://docs.inworld.ai/docs/tts/tts
 */
export interface InworldProviderOptions {
  /**
   * TTS model to use
   *
   * @options
   * - 'inworld-tts-1.5-max': Rich, expressive, ~200ms latency ($10/1M chars)
   * - 'inworld-tts-1.5-mini': Ultra-low latency ~120ms ($5/1M chars)
   *
   * @default 'inworld-tts-1.5-max'
   */
  modelId?: 'inworld-tts-1.5-max' | 'inworld-tts-1.5-mini';

  /**
   * Bitrate in bits per second for compressed formats
   *
   * @default 128000
   */
  bitRate?: number;

  /**
   * Timestamp alignment type
   *
   * @options 'TIMESTAMP_TYPE_UNSPECIFIED', 'WORD', 'CHARACTER'
   * @default 'TIMESTAMP_TYPE_UNSPECIFIED'
   */
  timestampType?: 'TIMESTAMP_TYPE_UNSPECIFIED' | 'WORD' | 'CHARACTER';

  /**
   * Text normalization control
   *
   * @options 'APPLY_TEXT_NORMALIZATION_UNSPECIFIED', 'ON', 'OFF'
   * @default 'APPLY_TEXT_NORMALIZATION_UNSPECIFIED'
   */
  applyTextNormalization?: 'APPLY_TEXT_NORMALIZATION_UNSPECIFIED' | 'ON' | 'OFF';
}

/**
 * Vertex AI TTS provider options
 *
 * @provider Vertex AI TTS (Google Cloud)
 * @description Gemini 2.5 TTS models via Vertex AI using the generateContent endpoint with audio output.
 * Supports 30 voices with 90+ languages (auto-detect). Style control via natural language prompts.
 * Test/Admin only – no EU data residency guarantees.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/text-to-speech
 */
export interface VertexAITTSProviderOptions {
  /**
   * TTS model to use
   *
   * @options
   * - 'gemini-2.5-flash-preview-tts': Budget, fast ($0.50/M input + $10/M audio output tokens)
   * - 'gemini-2.5-pro-preview-tts': Premium, natural ($1.00/M input + $20/M audio output tokens)
   * - 'gemini-3.1-flash-tts-preview': Expressive with audio tags + native multi-speaker
   *   ($1.00/M input + $20/M audio output tokens)
   *
   * @default 'gemini-2.5-flash-preview-tts'
   */
  model?:
    | 'gemini-2.5-flash-preview-tts'
    | 'gemini-2.5-pro-preview-tts'
    | 'gemini-3.1-flash-tts-preview';

  /**
   * Natural language style instruction prepended to the text
   *
   * @description Controls voice style/emotion via prompt engineering.
   * The instruction is prepended to the synthesis text, e.g. "Say cheerfully: {text}".
   *
   * For Gemini 3.1 Flash TTS, inline audio tags like [sigh], [whispering],
   * [laughing], [short pause] can additionally be embedded directly in the text.
   *
   * @example 'Say in a spooky whisper:'
   * @example 'Read this cheerfully:'
   * @example 'Speak in a calm, professional tone:'
   */
  stylePrompt?: string;

  /**
   * Output randomness / expressiveness (Gemini 3.1 Flash TTS only)
   *
   * @description Controls how varied the generated speech is. Higher values
   * produce more expressive delivery. Typical range 0.0–2.0.
   *
   * @default undefined (provider default)
   */
  temperature?: number;

  /**
   * Per-request Vertex AI region override
   *
   * @description Overrides the constructor region and skips any regionRotation config.
   * Use this when you need to pin a specific request to a specific region.
   *
   * @example 'europe-west4'
   * @example 'us-central1'
   */
  region?: string;
}

/**
 * Speaker definition for dialog synthesis
 *
 * @description Maps a speaker alias (used in dialog turns) to a prebuilt voice.
 * Speaker aliases must be alphanumeric without whitespace.
 *
 * @example { speaker: 'Alice', voice: 'Aoede' }
 */
export interface DialogSpeaker {
  /** Alphanumeric alias referenced in DialogTurn.speaker */
  speaker: string;
  /** Prebuilt voice name (e.g. 'Kore', 'Puck', 'Charon', 'Aoede') */
  voice: string;
}

/**
 * Single turn in a dialog segment
 *
 * @description Text may contain Gemini 3.1 audio tags like [sigh], [whispering],
 * [short pause], etc. The assigned speaker must match a DialogSpeaker alias.
 */
export interface DialogTurn {
  /** Must match a DialogSpeaker.speaker in the surrounding request */
  speaker: string;
  /** Turn text, optionally with inline audio tags */
  text: string;
}

/**
 * Dialog segment — one synthesis request with a shared style prompt
 *
 * @description Each segment maps to exactly one Vertex AI request. Use
 * multiple segments when you need different style prompts for different
 * parts of a larger dialog (e.g. narrator → argument → narrator).
 */
export interface DialogSegment {
  /** Global style direction for this segment (applies to all turns) */
  stylePrompt?: string;
  /** Ordered turns within this segment */
  turns: DialogTurn[];
  /** Optional per-segment temperature override */
  temperature?: number;
}

/**
 * Request payload for VertexAITTSProvider.synthesizeDialog()
 *
 * @description Multi-segment, multi-speaker dialog synthesis. The provider
 * runs one Vertex AI request per segment sequentially, concatenates the
 * raw PCM buffers, and returns a single converted audio file. Billing
 * aggregates characters across all segments and turns.
 *
 * Requires model 'gemini-3.1-flash-tts-preview' (or newer).
 *
 * @example
 * ```typescript
 * const result = await provider.synthesizeDialog({
 *   speakers: [
 *     { speaker: 'Narrator', voice: 'Charon' },
 *     { speaker: 'Alice',    voice: 'Aoede'  },
 *     { speaker: 'Bob',      voice: 'Puck'   },
 *   ],
 *   segments: [
 *     {
 *       stylePrompt: 'Calm audiobook narration',
 *       turns: [{ speaker: 'Narrator', text: 'The tavern was loud that night.' }],
 *     },
 *     {
 *       stylePrompt: 'Heated argument between two friends',
 *       turns: [
 *         { speaker: 'Alice', text: '[shouting] You lied to me!' },
 *         { speaker: 'Bob',   text: '[sigh] Calm down, would you?' },
 *       ],
 *     },
 *   ],
 *   voice: { languageCode: 'en-US' },
 *   audio: { format: 'mp3' },
 *   providerOptions: { model: 'gemini-3.1-flash-tts-preview' },
 * });
 * ```
 */
export interface SynthesizeDialogRequest {
  /** Speaker-to-voice mapping, referenced by DialogTurn.speaker */
  speakers: DialogSpeaker[];
  /** One or more dialog segments, synthesized in order */
  segments: DialogSegment[];
  /** Language code and other voice-level config (voice.id is ignored in dialog mode) */
  voice?: { languageCode?: string; id?: string };
  /** Audio output options (format, etc.) */
  audio?: { format?: 'mp3' | 'wav' | string };
  /** Provider-specific options (model, region, temperature) */
  providerOptions?: VertexAITTSProviderOptions;
  /** Retry config for transient errors, as in TTSSynthesizeRequest */
  retry?: boolean | RetryConfig;
}

/**
 * Cartesia TTS provider options
 *
 * @provider Cartesia Sonic TTS API
 * @description Cartesia Sonic (3 / 3.5) — high-quality, low-latency, expressive
 * voices. EU data residency by default with a GDPR-aligned DPA.
 *
 * Speaking speed is controlled via the universal `audio.speed` option (a
 * multiplier, clamped to Cartesia's 0.6–1.5 range). Pauses between sentences
 * are inserted automatically when `sentencePauseMs` is set — useful because
 * Sonic tends to run sentences together.
 *
 * @see https://docs.cartesia.ai/api-reference/tts/bytes
 * @see https://docs.cartesia.ai/build-with-cartesia/capability-guides/ssml-tags
 *
 * @example
 * ```typescript
 * // Slightly slower narration with natural sentence spacing:
 * await ttsService.synthesize({
 *   text: '...',
 *   provider: TTSProvider.CARTESIA,
 *   voice: { id: '38aabb6a-f52b-4fb0-a3d1-988518f4dc06' },
 *   audio: { format: 'mp3', sampleRate: 44100, speed: 0.9 },
 *   providerOptions: {
 *     model: 'sonic-3.5',
 *     language: 'de',
 *     sentencePauseMs: 300,
 *     paragraphPauseMs: 700,
 *   },
 * });
 * ```
 */
export interface CartesiaProviderOptions {
  /**
   * Cartesia model ID.
   *
   * @options 'sonic-3.5', 'sonic-3', 'sonic-latest'
   * @default 'sonic-3.5'
   */
  model?: string;

  /**
   * Language code Cartesia should synthesize in (e.g. 'de', 'en').
   *
   * @description If omitted, Cartesia auto-detects the language from the text.
   * Set it explicitly for reliable pronunciation.
   *
   * @example 'de'
   */
  language?: string;

  /**
   * Inserts a pause (`<break time="...ms"/>`) after each sentence boundary.
   *
   * @description Sonic tends to run sentences together. A small value adds
   * natural spacing between sentences. Inserted only at real sentence
   * boundaries (sentence-ending punctuation followed by a new sentence);
   * mid-dialogue punctuation is left untouched. Set to 0 / omit to disable.
   *
   * @range 0 - ~2000 (milliseconds)
   * @example 300
   * @default undefined (no pauses inserted)
   */
  sentencePauseMs?: number;

  /**
   * Inserts a longer pause at paragraph boundaries (blank lines).
   *
   * @description Only applies when `sentencePauseMs` is set. Defaults to twice
   * `sentencePauseMs` when omitted.
   *
   * @example 700
   */
  paragraphPauseMs?: number;

  /**
   * Emotion tags forwarded to Cartesia's `generation_config.emotion`.
   *
   * @description Beta feature; effect varies by voice/language.
   * @example ['positivity:high', 'curiosity']
   */
  emotion?: string[];
}

/**
 * Union type of all provider options
 *
 * @description Use this type when you need to accept any provider options
 */
export type ProviderOptions =
  | AzureProviderOptions
  | OpenAIProviderOptions
  | ElevenLabsProviderOptions
  | GoogleCloudTTSProviderOptions
  | DeepgramProviderOptions
  | EdenAIProviderOptions
  | FishAudioProviderOptions
  | InworldProviderOptions
  | VertexAITTSProviderOptions
  | CartesiaProviderOptions;

/**
 * Type guard to check if options are for Azure
 */
export function isAzureOptions(
  options: unknown
): options is AzureProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('emotion' in options || 'style' in options)
  );
}

/**
 * Type guard to check if options are for OpenAI
 */
export function isOpenAIOptions(
  options: unknown
): options is OpenAIProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    'model' in options &&
    typeof (options as { model: unknown }).model === 'string'
  );
}

/**
 * Type guard to check if options are for ElevenLabs
 */
export function isElevenLabsOptions(
  options: unknown
): options is ElevenLabsProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('stability' in options || 'similarity_boost' in options)
  );
}

/**
 * Type guard to check if options are for Google Cloud TTS
 */
export function isGoogleCloudTTSOptions(
  options: unknown
): options is GoogleCloudTTSProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('effectsProfileId' in options || 'region' in options)
  );
}

/**
 * @deprecated Use isGoogleCloudTTSOptions instead
 */
export const isGoogleCloudOptions = isGoogleCloudTTSOptions;

/**
 * Type guard to check if options are for Deepgram
 */
export function isDeepgramOptions(
  options: unknown
): options is DeepgramProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('encoding' in options || 'container' in options)
  );
}

/**
 * Type guard to check if options are for EdenAI
 */
export function isEdenAIOptions(
  options: unknown
): options is EdenAIProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('fallback_providers' in options ||
      'webhook_url' in options ||
      'option' in options ||
      'voice_id' in options)
  );
}

/**
 * Type guard to check if options are for Fish Audio
 */
export function isFishAudioOptions(
  options: unknown
): options is FishAudioProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('referenceId' in options ||
      'topP' in options ||
      'repetitionPenalty' in options ||
      'chunkLength' in options)
  );
}

/**
 * Type guard to check if options are for Inworld AI
 */
export function isInworldOptions(
  options: unknown
): options is InworldProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('modelId' in options ||
      'timestampType' in options ||
      'applyTextNormalization' in options)
  );
}

/**
 * Type guard to check if options are for Vertex AI TTS
 */
export function isVertexAITTSOptions(
  options: unknown
): options is VertexAITTSProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('stylePrompt' in options ||
      'regionRotation' in options ||
      ('model' in options &&
        typeof (options as { model: unknown }).model === 'string' &&
        (options as { model: string }).model.startsWith('gemini-')))
  );
}

/**
 * Type guard to check if options are for Cartesia
 */
export function isCartesiaOptions(
  options: unknown
): options is CartesiaProviderOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('sentencePauseMs' in options ||
      'paragraphPauseMs' in options ||
      ('model' in options &&
        typeof (options as { model: unknown }).model === 'string' &&
        (options as { model: string }).model.startsWith('sonic')))
  );
}
