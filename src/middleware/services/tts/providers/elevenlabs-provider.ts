/**
 * ElevenLabs TTS Provider
 *
 * @description Provider for the ElevenLabs text-to-speech API. Includes the
 * newest **Eleven v3** model (most expressive) plus multilingual v2 / flash.
 *
 * Test/Admin only — **no EU data residency** on non-Enterprise tiers, and
 * training is opt-out (default-on) below Enterprise. Use as a quality benchmark,
 * not for EU-compliant production. Mirrors the Fish Audio / Inworld posture.
 *
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */

import type { TTSSynthesizeRequest, TTSResponse } from '../types';
import { TTSProvider } from '../types';
import type { ElevenLabsProviderOptions } from '../types/provider-options.types';
import { getMp3Duration } from '../utils/mp3-duration.utils';
import { BaseTTSProvider, InvalidConfigError } from './base-tts-provider';

/**
 * ElevenLabs configuration
 */
interface ElevenLabsConfig {
  apiKey: string;
  /** Base URL for the text-to-speech endpoint (voice ID is appended). */
  apiUrl?: string;
}

/**
 * Maps the universal audio format + sample rate to an ElevenLabs
 * `output_format` query value (e.g. `mp3_44100_128`).
 */
function mapOutputFormat(
  format: string | undefined,
  sampleRate: number | undefined
): string {
  if (format === 'mp3' && sampleRate === 22050) return 'mp3_22050_32';
  if (format === 'opus') return 'opus_48000_128';
  // Default / mp3 — broadly available on all tiers.
  return 'mp3_44100_128';
}

/**
 * ElevenLabs provider implementation
 *
 * @description Synthesizes speech via `POST /v1/text-to-speech/{voice_id}`.
 * Voices are referenced by their ElevenLabs voice ID.
 *
 * @example
 * ```typescript
 * const provider = new ElevenLabsProvider();
 * const response = await provider.synthesize(
 *   "Guten Tag",
 *   "21m00Tcm4TlvDq8ikWAM",
 *   {
 *     text: "Guten Tag",
 *     voice: { id: "21m00Tcm4TlvDq8ikWAM" },
 *     audio: { format: "mp3", sampleRate: 44100 },
 *     providerOptions: { model_id: "eleven_v3", language_code: "de" }
 *   }
 * );
 * ```
 */
export class ElevenLabsProvider extends BaseTTSProvider {
  private config: ElevenLabsConfig;
  private readonly apiUrl: string;

  /**
   * Creates a new ElevenLabs TTS provider
   *
   * @param config - Optional configuration (uses env vars if not provided)
   * @throws {InvalidConfigError} If API key is missing
   */
  constructor(config?: Partial<ElevenLabsConfig>) {
    super(TTSProvider.ELEVENLABS);

    this.config = {
      apiKey: config?.apiKey || process.env.ELEVENLABS_API_KEY || '',
      apiUrl: config?.apiUrl,
    };

    this.apiUrl =
      this.config.apiUrl || 'https://api.elevenlabs.io/v1/text-to-speech';

    this.validateElevenLabsConfig();

    this.log('info', 'ElevenLabs provider initialized', {
      hasApiKey: !!this.config.apiKey,
      apiUrl: this.apiUrl,
    });
  }

  /**
   * Validate ElevenLabs configuration
   *
   * @private
   * @throws {InvalidConfigError} If configuration is invalid
   */
  private validateElevenLabsConfig(): void {
    if (!this.config.apiKey) {
      throw new InvalidConfigError(
        this.providerName,
        'ElevenLabs API key is required (ELEVENLABS_API_KEY)'
      );
    }
  }

  /**
   * Synthesize text to speech using ElevenLabs
   *
   * @param text - The input text to synthesize
   * @param voiceId - The ElevenLabs voice ID
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
    const options = (request.providerOptions || {}) as ElevenLabsProviderOptions;
    const format = request.audio?.format || 'mp3';
    const sampleRate = request.audio?.sampleRate || 44100;
    const model = options.model_id || 'eleven_multilingual_v2';

    const outputFormat =
      options.outputFormat || mapOutputFormat(format, sampleRate);
    const requestBody = this.buildRequest(text, options, model);

    this.log('debug', 'Synthesizing with ElevenLabs', {
      voiceId,
      model,
      outputFormat,
      textLength: text.length,
    });

    try {
      const audioBuffer = await this.callAPI(voiceId, outputFormat, requestBody);
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

      throw this.handleError(error as Error, 'during ElevenLabs API call');
    }
  }

  /**
   * Build the ElevenLabs request payload
   *
   * @private
   */
  private buildRequest(
    text: string,
    options: ElevenLabsProviderOptions,
    model: string
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      text,
      model_id: model,
    };

    if (options.language_code) {
      body.language_code = options.language_code;
    }

    // voice_settings — only include fields the caller actually set.
    const voiceSettings: Record<string, unknown> = {};
    if (options.stability !== undefined) voiceSettings.stability = options.stability;
    if (options.similarity_boost !== undefined)
      voiceSettings.similarity_boost = options.similarity_boost;
    if (options.style !== undefined) voiceSettings.style = options.style;
    const speakerBoost = options.speaker_boost ?? options.use_speaker_boost;
    if (speakerBoost !== undefined) voiceSettings.use_speaker_boost = speakerBoost;
    if (Object.keys(voiceSettings).length > 0) {
      body.voice_settings = voiceSettings;
    }

    return body;
  }

  /**
   * Call the ElevenLabs API
   *
   * @private
   * @param voiceId - The voice ID (path parameter)
   * @param outputFormat - The `output_format` query value
   * @param requestBody - The JSON request payload
   * @returns Promise resolving to audio buffer
   */
  private async callAPI(
    voiceId: string,
    outputFormat: string,
    requestBody: Record<string, unknown>
  ): Promise<Buffer> {
    const url = `${this.apiUrl}/${encodeURIComponent(voiceId)}?output_format=${outputFormat}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
