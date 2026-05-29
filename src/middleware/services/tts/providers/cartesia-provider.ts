/**
 * Cartesia TTS Provider
 *
 * @description Provider for Cartesia's Sonic text-to-speech API.
 * EU-compliant: by default all voice data is processed within EU-resident
 * infrastructure, with a GDPR-aligned DPA. High-quality, low-latency,
 * expressive voices (Sonic 3 / 3.5) suited for narration and dialog.
 *
 * @see https://docs.cartesia.ai/api-reference/tts/bytes
 */

import type { TTSSynthesizeRequest, TTSResponse } from '../types';
import { TTSProvider } from '../types';
import type { CartesiaProviderOptions } from '../types/provider-options.types';
import { getMp3Duration } from '../utils/mp3-duration.utils';
import { BaseTTSProvider, InvalidConfigError } from './base-tts-provider';

/**
 * Provider-level defaults for Cartesia synthesis.
 *
 * @description These are applied when a request does not specify the
 * corresponding value, and are always overridable per request (via
 * `audio.speed` / `providerOptions`). They are NOT hardcoded in the
 * middleware: they come from the constructor config or environment variables
 * (`CARTESIA_DEFAULT_SPEED`, `CARTESIA_DEFAULT_SENTENCE_PAUSE_MS`,
 * `CARTESIA_DEFAULT_PARAGRAPH_PAUSE_MS`). When unset, the provider applies no
 * speed change and inserts no pauses (neutral behavior).
 */
export interface CartesiaDefaults {
  /** Default speaking speed multiplier (0.6–1.5). */
  speed?: number;
  /** Default inter-sentence pause in ms (0/undefined = none). */
  sentencePauseMs?: number;
  /** Default paragraph pause in ms. */
  paragraphPauseMs?: number;
}

/**
 * Cartesia configuration
 */
interface CartesiaConfig {
  apiKey: string;
  apiUrl?: string;
  /** Cartesia API version pin (sent as the `Cartesia-Version` header). */
  apiVersion?: string;
  /** Overridable provider-level defaults (see {@link CartesiaDefaults}). */
  defaults?: CartesiaDefaults;
}

/** Cartesia's `generation_config.speed` accepted range (multiplier on default). */
const CARTESIA_SPEED_MIN = 0.6;
const CARTESIA_SPEED_MAX = 1.5;

/** Parse a numeric environment variable, returning undefined when unset/invalid. */
function numFromEnv(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Cartesia provider implementation
 *
 * @description Synthesizes speech via Cartesia's `POST /tts/bytes` REST endpoint.
 * Voices are referenced by their Cartesia voice ID (a UUID-like string).
 *
 * @example
 * ```typescript
 * const provider = new CartesiaProvider();
 * const response = await provider.synthesize(
 *   "Guten Tag",
 *   "<cartesia-voice-id>",
 *   {
 *     text: "Guten Tag",
 *     voice: { id: "<cartesia-voice-id>" },
 *     audio: { format: "mp3", sampleRate: 44100 },
 *     providerOptions: { model: "sonic-3.5", language: "de" }
 *   }
 * );
 * ```
 */
export class CartesiaProvider extends BaseTTSProvider {
  private config: CartesiaConfig;
  private readonly apiUrl: string;
  private readonly apiVersion: string;
  private readonly defaults: CartesiaDefaults;

  /**
   * Creates a new Cartesia TTS provider
   *
   * @param config - Optional configuration (uses env vars if not provided)
   * @throws {InvalidConfigError} If API key is missing
   */
  constructor(config?: Partial<CartesiaConfig>) {
    super(TTSProvider.CARTESIA);

    this.config = {
      apiKey: config?.apiKey || process.env.CARTESIA_API_KEY || '',
      apiUrl: config?.apiUrl,
      apiVersion: config?.apiVersion,
    };

    this.apiUrl = this.config.apiUrl || 'https://api.cartesia.ai/tts/bytes';
    this.apiVersion =
      this.config.apiVersion || process.env.CARTESIA_VERSION || '2026-03-01';

    // Resolve overridable defaults: explicit config wins over environment.
    // Unset -> neutral behavior (no speed change, no pauses).
    this.defaults = {
      speed:
        config?.defaults?.speed ?? numFromEnv(process.env.CARTESIA_DEFAULT_SPEED),
      sentencePauseMs:
        config?.defaults?.sentencePauseMs ??
        numFromEnv(process.env.CARTESIA_DEFAULT_SENTENCE_PAUSE_MS),
      paragraphPauseMs:
        config?.defaults?.paragraphPauseMs ??
        numFromEnv(process.env.CARTESIA_DEFAULT_PARAGRAPH_PAUSE_MS),
    };

    this.validateCartesiaConfig();

    this.log('info', 'Cartesia provider initialized', {
      hasApiKey: !!this.config.apiKey,
      apiUrl: this.apiUrl,
      apiVersion: this.apiVersion,
      defaults: this.defaults,
    });
  }

  /**
   * Validate Cartesia configuration
   *
   * @private
   * @throws {InvalidConfigError} If configuration is invalid
   */
  private validateCartesiaConfig(): void {
    if (!this.config.apiKey) {
      throw new InvalidConfigError(
        this.providerName,
        'Cartesia API key is required (CARTESIA_API_KEY)'
      );
    }
  }

  /**
   * Synthesize text to speech using Cartesia
   *
   * @param text - The input text to synthesize
   * @param voiceId - The Cartesia voice ID
   * @param request - The full synthesis request with options
   * @returns Promise resolving to the synthesis response
   */
  async synthesize(
    text: string,
    voiceId: string,
    request: TTSSynthesizeRequest
  ): Promise<TTSResponse> {
    this.validateConfig(request);

    const startTime = Date.now();
    const options = (request.providerOptions || {}) as CartesiaProviderOptions;
    const format = request.audio?.format || 'mp3';
    const sampleRate = request.audio?.sampleRate || 44100;

    const requestBody = this.buildRequest(text, voiceId, request, options);

    this.log('debug', 'Synthesizing with Cartesia', {
      voiceId,
      model: options.model || 'sonic-3.5',
      language: options.language ?? '(auto-detect)',
      textLength: text.length,
      format,
    });

    try {
      const audioBuffer = await this.callAPI(requestBody);
      const duration = Date.now() - startTime;
      const characters = this.countCharacters(text);

      this.log('info', 'Synthesis successful', {
        voiceId,
        characters,
        duration,
        audioSize: audioBuffer.length,
      });

      return {
        audio: audioBuffer,
        metadata: {
          provider: this.providerName,
          voice: voiceId,
          duration,
          audioDuration:
            format === 'mp3' ? getMp3Duration(audioBuffer) : undefined,
          audioFormat: format,
          sampleRate,
        },
        billing: {
          characters,
        },
      };
    } catch (error) {
      this.log('error', 'Synthesis failed', {
        voiceId,
        error: (error as Error).message,
      });

      throw this.handleError(error as Error, 'during Cartesia API call');
    }
  }

  /**
   * Build the Cartesia `/tts/bytes` request payload
   *
   * @private
   */
  private buildRequest(
    text: string,
    voiceId: string,
    request: TTSSynthesizeRequest,
    options: CartesiaProviderOptions
  ): Record<string, unknown> {
    const format = request.audio?.format || 'mp3';
    const sampleRate = request.audio?.sampleRate || 44100;

    // Map our universal audio format to Cartesia's output_format object.
    let outputFormat: Record<string, unknown>;
    if (format === 'wav') {
      outputFormat = {
        container: 'wav',
        encoding: 'pcm_s16le',
        sample_rate: sampleRate,
      };
    } else {
      // Default to MP3
      outputFormat = {
        container: 'mp3',
        sample_rate: sampleRate,
        bit_rate: 128000,
      };
    }

    // Resolve effective pause settings: per-request options override provider
    // defaults; defaults override nothing (neutral) when unset.
    const sentencePauseMs =
      options.sentencePauseMs ?? this.defaults.sentencePauseMs;
    const paragraphPauseMs =
      options.paragraphPauseMs ?? this.defaults.paragraphPauseMs;

    const body: Record<string, unknown> = {
      model_id: options.model || 'sonic-3.5',
      transcript: this.applyPauses(text, sentencePauseMs, paragraphPauseMs),
      voice: {
        mode: 'id',
        id: voiceId,
      },
      output_format: outputFormat,
    };

    // Language: explicit value wins; otherwise omit and let Cartesia auto-detect.
    if (options.language) {
      body.language = options.language;
    }

    // Optional prosody/emotion tuning via generation_config.
    // Effective speed: per-request audio.speed overrides the provider default.
    const generationConfig: Record<string, unknown> = {};
    const effectiveSpeed = request.audio?.speed ?? this.defaults.speed;
    if (typeof effectiveSpeed === 'number' && effectiveSpeed !== 1.0) {
      // Cartesia speed is a multiplier (1.0 = default). Clamp to the valid range.
      generationConfig.speed = Math.min(
        CARTESIA_SPEED_MAX,
        Math.max(CARTESIA_SPEED_MIN, effectiveSpeed)
      );
    }
    if (options.emotion && options.emotion.length > 0) {
      generationConfig.emotion = options.emotion;
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generation_config = generationConfig;
    }

    return body;
  }

  /**
   * Insert `<break>` pauses into the transcript at sentence/paragraph boundaries.
   *
   * @private
   * @description Cartesia Sonic tends to run sentences together with little
   * spacing. This inserts Cartesia's native `<break time="...ms"/>` SSML tag
   * after sentence-ending punctuation (`.`/`!`/`?`, optionally followed by a
   * closing quote) when a new sentence begins (next non-space char is a capital
   * letter or an opening quote). Blank lines become a longer paragraph break.
   *
   * No-op when `sentencePauseMs` is unset/0. Mid-dialogue punctuation such as
   * `passiert?", flüsterte` is left untouched because the following word is
   * lowercase.
   */
  private applyPauses(
    text: string,
    sentencePauseMs?: number,
    paragraphPauseMs?: number
  ): string {
    const sentenceMs = sentencePauseMs ?? 0;
    if (!sentenceMs || sentenceMs <= 0) {
      return text;
    }
    const paragraphMs = paragraphPauseMs ?? sentenceMs * 2;

    // Paragraph (blank-line) boundaries first, then collapse remaining newlines.
    let out = text.replace(/\n{2,}/g, ` <break time="${paragraphMs}ms"/> `);
    out = out.replace(/\n+/g, ' ');

    // Sentence boundaries: punctuation (+ optional closing quote), whitespace,
    // followed by a capital letter or an opening quote.
    out = out.replace(
      /([.!?]["»']?)\s+(?=["«A-ZÄÖÜ])/g,
      `$1<break time="${sentenceMs}ms"/> `
    );

    return out;
  }

  /**
   * Call the Cartesia API
   *
   * @private
   * @param requestBody - The request payload
   * @returns Promise resolving to audio buffer
   */
  private async callAPI(requestBody: Record<string, unknown>): Promise<Buffer> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Cartesia-Version': this.apiVersion,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cartesia API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
