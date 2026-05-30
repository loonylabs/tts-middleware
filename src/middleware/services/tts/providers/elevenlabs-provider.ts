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
import type {
  ElevenLabsProviderOptions,
  SynthesizeDialogRequest,
} from '../types/provider-options.types';
import { getMp3Duration } from '../utils/mp3-duration.utils';
import {
  BaseTTSProvider,
  InvalidConfigError,
  type SupportsDialog,
  type DialogCapabilities,
} from './base-tts-provider';

/** Text to Dialogue endpoint (multi-speaker, eleven_v3 only). */
const ELEVENLABS_DIALOGUE_URL = 'https://api.elevenlabs.io/v1/text-to-dialogue';
/** ElevenLabs Text to Dialogue limits. */
const DIALOGUE_MAX_VOICES = 10;
const DIALOGUE_MAX_CHARS_PER_REQUEST = 2000;
/** Safety margin below the hard per-request character cap when chunking. */
const DIALOGUE_CHUNK_CHAR_BUDGET = 1900;

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
export class ElevenLabsProvider
  extends BaseTTSProvider
  implements SupportsDialog
{
  /**
   * Dialog capabilities: ElevenLabs Text to Dialogue (eleven_v3) supports up to
   * 10 distinct voices per dialog and ~2000 characters per request (chunked
   * internally). It has no per-segment style prompt — express delivery with
   * inline audio tags instead.
   */
  readonly dialogCapabilities: DialogCapabilities = {
    maxSpeakers: DIALOGUE_MAX_VOICES,
    maxCharsPerRequest: DIALOGUE_MAX_CHARS_PER_REQUEST,
    supportsStylePrompt: false,
    supportsAudioTags: true,
  };

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

  /**
   * Synthesize a multi-speaker dialog via the ElevenLabs Text to Dialogue API.
   *
   * @description Maps the provider-agnostic {@link SynthesizeDialogRequest} onto
   * ElevenLabs' `POST /v1/text-to-dialogue` endpoint (eleven_v3 only). Each
   * `DialogSpeaker.voice` is an ElevenLabs **voice ID**. Turns across all
   * segments are flattened, in order, into the `inputs` array so the model can
   * manage speaker transitions and interruptions in a single pass — which is
   * what gives ElevenLabs better cross-speaker coherence than per-turn calls.
   *
   * Constraints handled here:
   * - **Up to 10 distinct voices** (validated; ElevenLabs hard limit).
   * - **≤2000 characters per request** — turns are packed into chunks of at most
   *   {@link DIALOGUE_CHUNK_CHAR_BUDGET} characters; each chunk is one API call,
   *   and the resulting MP3 buffers are concatenated. Short dialogs are a single
   *   call (optimal coherence).
   *
   * Inline audio tags (`[whispers]`, `[laughs]`, …) are passed through verbatim
   * in each turn's text. `DialogSegment.stylePrompt` has no ElevenLabs
   * equivalent and is ignored — express delivery with inline tags instead.
   *
   * @param request - Dialog request with speakers and ordered segments
   * @returns Single concatenated audio response with aggregated billing
   * @throws {InvalidConfigError} If speakers/turns are invalid or >10 voices
   */
  async synthesizeDialog(request: SynthesizeDialogRequest): Promise<TTSResponse> {
    const startTime = Date.now();
    const options = (request.providerOptions || {}) as ElevenLabsProviderOptions;
    const model = options.model_id || 'eleven_v3';
    const language =
      options.language_code || request.voice?.languageCode || undefined;
    const format = request.audio?.format || 'mp3';
    const outputFormat = options.outputFormat || 'mp3_44100_128';

    // Resolve speaker alias -> voice ID, and flatten turns in segment order.
    const voiceByAlias = this.buildSpeakerMap(request);
    const inputs = this.flattenDialogTurns(request, voiceByAlias);

    // Validate the ElevenLabs voice-count limit.
    const uniqueVoices = new Set(inputs.map((t) => t.voice_id));
    if (uniqueVoices.size > DIALOGUE_MAX_VOICES) {
      throw new InvalidConfigError(
        this.providerName,
        `Dialog uses ${uniqueVoices.size} distinct voices, but ElevenLabs Text to Dialogue supports at most ${DIALOGUE_MAX_VOICES}.`
      );
    }

    const voiceSettings = this.buildVoiceSettings(options);
    const chunks = this.chunkDialogInputs(inputs);

    this.log('debug', 'Synthesizing dialog with ElevenLabs', {
      model,
      language,
      speakerCount: uniqueVoices.size,
      turnCount: inputs.length,
      chunks: chunks.length,
    });

    const audioChunks: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        audioChunks.push(
          await this.callDialogAPI(
            chunks[i],
            model,
            language,
            voiceSettings,
            outputFormat
          )
        );
      } catch (error) {
        this.log('error', 'Dialog chunk synthesis failed', {
          chunkIndex: i,
          error: (error as Error).message,
        });
        throw this.handleError(
          error as Error,
          `during ElevenLabs Text to Dialogue chunk #${i}`
        );
      }
    }

    const audioBuffer = Buffer.concat(audioChunks);
    const duration = Date.now() - startTime;
    const characters = inputs.reduce(
      (sum, t) => sum + this.countCharacters(t.text),
      0
    );

    this.log('info', 'Dialog synthesis successful', {
      turnCount: inputs.length,
      characters,
      duration,
      audioSize: audioBuffer.length,
    });

    return {
      audio: audioBuffer,
      metadata: {
        provider: this.providerName,
        voice: request.speakers.map((s) => `${s.speaker}:${s.voice}`).join(','),
        duration,
        audioDuration:
          format === 'mp3' ? getMp3Duration(audioBuffer) : undefined,
        audioFormat: format,
        sampleRate: 44100,
      },
      billing: { characters },
    };
  }

  /**
   * Build the speaker-alias → voice-ID map and validate the request shape.
   *
   * @private
   * @throws {InvalidConfigError} If speakers or segments are missing/empty.
   */
  private buildSpeakerMap(
    request: SynthesizeDialogRequest
  ): Map<string, string> {
    if (!request.speakers || request.speakers.length === 0) {
      throw new InvalidConfigError(
        this.providerName,
        'Dialog request requires at least one speaker'
      );
    }
    if (!request.segments || request.segments.length === 0) {
      throw new InvalidConfigError(
        this.providerName,
        'Dialog request requires at least one segment'
      );
    }
    const map = new Map<string, string>();
    for (const s of request.speakers) {
      map.set(s.speaker, s.voice);
    }
    return map;
  }

  /**
   * Flatten all segment turns, in order, into ElevenLabs dialogue inputs.
   *
   * @private
   * @throws {InvalidConfigError} If a turn references an unknown speaker alias.
   */
  private flattenDialogTurns(
    request: SynthesizeDialogRequest,
    voiceByAlias: Map<string, string>
  ): Array<{ text: string; voice_id: string }> {
    const inputs: Array<{ text: string; voice_id: string }> = [];
    for (const segment of request.segments) {
      for (const turn of segment.turns) {
        const voiceId = voiceByAlias.get(turn.speaker);
        if (!voiceId) {
          throw new InvalidConfigError(
            this.providerName,
            `Dialog turn references unknown speaker '${turn.speaker}'. Declare it in request.speakers.`
          );
        }
        inputs.push({ text: turn.text, voice_id: voiceId });
      }
    }
    if (inputs.length === 0) {
      throw new InvalidConfigError(
        this.providerName,
        'Dialog request contains no turns'
      );
    }
    return inputs;
  }

  /**
   * Pack dialogue inputs into chunks that each stay within the per-request
   * character cap, preserving turn order.
   *
   * @private
   */
  private chunkDialogInputs(
    inputs: Array<{ text: string; voice_id: string }>
  ): Array<Array<{ text: string; voice_id: string }>> {
    const chunks: Array<Array<{ text: string; voice_id: string }>> = [];
    let current: Array<{ text: string; voice_id: string }> = [];
    let currentChars = 0;

    for (const input of inputs) {
      const len = input.text.length;
      if (current.length > 0 && currentChars + len > DIALOGUE_CHUNK_CHAR_BUDGET) {
        chunks.push(current);
        current = [];
        currentChars = 0;
      }
      if (len > DIALOGUE_MAX_CHARS_PER_REQUEST) {
        this.log('warn', 'Dialog turn exceeds the ElevenLabs per-request character cap', {
          length: len,
          cap: DIALOGUE_MAX_CHARS_PER_REQUEST,
        });
      }
      current.push(input);
      currentChars += len;
    }
    if (current.length > 0) {
      chunks.push(current);
    }
    return chunks;
  }

  /**
   * Build the optional `settings` object from provider voice options.
   *
   * @private
   */
  private buildVoiceSettings(
    options: ElevenLabsProviderOptions
  ): Record<string, unknown> | undefined {
    const settings: Record<string, unknown> = {};
    if (options.stability !== undefined) settings.stability = options.stability;
    if (options.similarity_boost !== undefined)
      settings.similarity_boost = options.similarity_boost;
    if (options.style !== undefined) settings.style = options.style;
    const speakerBoost = options.speaker_boost ?? options.use_speaker_boost;
    if (speakerBoost !== undefined) settings.use_speaker_boost = speakerBoost;
    return Object.keys(settings).length > 0 ? settings : undefined;
  }

  /**
   * Call the Text to Dialogue endpoint for a single chunk of inputs.
   *
   * @private
   * @returns Promise resolving to the chunk's audio buffer
   */
  private async callDialogAPI(
    inputs: Array<{ text: string; voice_id: string }>,
    model: string,
    language: string | undefined,
    voiceSettings: Record<string, unknown> | undefined,
    outputFormat: string
  ): Promise<Buffer> {
    const body: Record<string, unknown> = { inputs, model_id: model };
    if (language) body.language_code = language;
    if (voiceSettings) body.settings = voiceSettings;

    const url = `${ELEVENLABS_DIALOGUE_URL}?output_format=${outputFormat}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ElevenLabs Text to Dialogue error (${response.status}): ${errorText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
