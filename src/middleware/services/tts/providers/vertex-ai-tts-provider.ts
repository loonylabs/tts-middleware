/**
 * Vertex AI TTS Provider
 *
 * @description Provider for Google Vertex AI TTS via the generateContent
 * endpoint with responseModalities: ['AUDIO']. Authenticates via Service Account
 * (same as Google Cloud TTS — reuses GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Supports 30 multilingual voices with auto-detect language and natural language
 * style control. Output is raw PCM (24kHz, 16-bit, mono) which is converted to
 * MP3 via ffmpeg (auto-detected from ffmpeg-static, FFMPEG_PATH, config, or system PATH)
 * or WAV as fallback.
 *
 * Test/Admin only -- no EU data residency guarantees.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/text-to-speech
 */

import { spawn } from 'child_process';
import { chmodSync, constants, accessSync } from 'fs';
import type { TTSSynthesizeRequest, TTSResponse } from '../types';
import { TTSProvider } from '../types';
import { getMp3Duration } from '../utils/mp3-duration.utils';
import {
  BaseTTSProvider,
  InvalidConfigError,
  PayloadTooLargeError,
  type SupportsDialog,
  type DialogCapabilities,
} from './base-tts-provider';
import type {
  VertexAITTSProviderOptions,
  RegionRotationConfig,
  DialogSpeaker,
  DialogSegment,
  SynthesizeDialogRequest,
} from '../types/provider-options.types';
import { isQuotaError } from '../utils/retry.utils';
import type { TTSRequestLogKind } from '../utils/request-logger.utils';

/**
 * Per-request debug context that callers can pass through to `callAPI()` and
 * `callAPIWithRegionRotation()`. Populated with caller-known facts (segment
 * index, speakers, shape) so the request logger can record them.
 *
 * When `DEBUG_TTS_REQUESTS` is disabled this is ignored and adds no cost.
 */
interface CallAPILogContext {
  kind: TTSRequestLogKind;
  segmentIndex?: number;
  speakers?: Array<{ speaker: string; voice: string }>;
  requestShape?: string;
  extras?: Record<string, unknown>;
}

/**
 * Try to extract a JSON-parseable object from an HTTP response error body.
 * Falls back to returning the raw text.
 */
function parseErrorBody(raw: string): unknown {
  if (!raw) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Vertex AI TTS configuration
 */
export interface VertexAITTSConfig {
  /**
   * Path to Service Account JSON file
   * @env GOOGLE_APPLICATION_CREDENTIALS
   */
  keyFilename?: string;

  /**
   * Google Cloud Project ID
   * @env GOOGLE_CLOUD_PROJECT
   */
  projectId?: string;

  /**
   * Vertex AI region
   * @env VERTEX_AI_TTS_REGION
   * @default 'us-central1'
   */
  region?: string;

  /**
   * Path to ffmpeg binary for PCM-to-MP3 conversion.
   *
   * Resolution order (first match wins):
   * 1. This config value
   * 2. `FFMPEG_PATH` environment variable
   * 3. `ffmpeg-static` npm package (if installed)
   * 4. System `ffmpeg` in PATH
   *
   * If ffmpeg is not available, the provider falls back to WAV output.
   */
  ffmpegPath?: string;

  /**
   * Optional region rotation for quota management (429 / Resource Exhausted)
   *
   * @description When configured, the provider automatically rotates through the
   * specified regions on quota errors. Same pattern as llm-middleware and tti-middleware.
   *
   * @example
   * ```typescript
   * {
   *   regions: ['europe-west4', 'europe-west1'],
   *   fallback: 'us-central1',
   * }
   * ```
   */
  regionRotation?: RegionRotationConfig;
}

const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_DIALOG_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_REGION = 'us-central1';

/**
 * Vertex AI Gemini TTS payload byte limits (UTF-8)
 *
 * @description Google rejects requests larger than these limits. We enforce them
 * client-side so consumers get a typed PayloadTooLargeError *before* a billable
 * API call is made.
 */
const GEMINI_TTS_MAX_TEXT_BYTES = 4000;
const GEMINI_TTS_MAX_PROMPT_BYTES = 4000;
const GEMINI_TTS_MAX_COMBINED_BYTES = 8000;

/**
 * Vertex AI TTS provider implementation
 *
 * @description Provides TTS synthesis using Google's Vertex AI generateContent API.
 * Authenticates with Service Account OAuth2 (same credentials as Google Cloud TTS).
 * Outputs raw PCM which is converted to MP3 (via ffmpeg) or WAV (pure Node.js fallback).
 *
 * Billing: Token-based ($0.50-1.00/M input + $10-20/M audio output tokens).
 * For billing compatibility, reports character count like all other providers.
 *
 * @example
 * ```typescript
 * const provider = new VertexAITTSProvider();
 * const response = await provider.synthesize(
 *   "Hello World",
 *   "Kore",
 *   {
 *     text: "Hello World",
 *     voice: { id: "Kore" },
 *     audio: { format: "mp3" },
 *     providerOptions: {
 *       model: "gemini-2.5-flash-preview-tts",
 *       stylePrompt: "Say cheerfully:"
 *     }
 *   }
 * );
 * ```
 */
export class VertexAITTSProvider
  extends BaseTTSProvider
  implements SupportsDialog
{
  /**
   * Dialog capabilities: Vertex AI multi-speaker TTS supports at most 2 distinct
   * speakers per request, honors per-segment style prompts, and accepts Gemini
   * inline audio tags.
   */
  readonly dialogCapabilities: DialogCapabilities = {
    maxSpeakers: 2,
    supportsStylePrompt: true,
    supportsAudioTags: true,
  };

  private config: VertexAITTSConfig;
  private authClient: { getAccessToken: () => Promise<{ token?: string | null }> } | null = null;
  private readonly ffmpegPath: string;

  /**
   * Creates a new Vertex AI TTS provider
   *
   * @param config - Optional configuration (uses env vars if not provided)
   * @throws {InvalidConfigError} If credentials are missing
   */
  constructor(config?: Partial<VertexAITTSConfig>) {
    super(TTSProvider.VERTEX_AI);

    this.config = {
      keyFilename: config?.keyFilename || process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: config?.projectId || process.env.GOOGLE_CLOUD_PROJECT,
      region: config?.region || process.env.VERTEX_AI_TTS_REGION || DEFAULT_REGION,
      regionRotation: config?.regionRotation,
    };

    this.ffmpegPath = this.resolveFfmpegPath(config?.ffmpegPath);

    this.validateVertexAIConfig();

    this.log('info', 'Vertex AI TTS provider initialized', {
      hasCredentials: !!this.config.keyFilename,
      projectId: this.config.projectId ? '***' : undefined,
      region: this.config.region,
      ffmpegPath: this.ffmpegPath,
    });
  }

  /**
   * Validate Vertex AI configuration
   *
   * @private
   * @throws {InvalidConfigError} If configuration is invalid
   */
  private validateVertexAIConfig(): void {
    if (!this.config.keyFilename) {
      throw new InvalidConfigError(
        this.providerName,
        'Google Cloud credentials are required for Vertex AI TTS (GOOGLE_APPLICATION_CREDENTIALS)'
      );
    }

    if (!this.config.projectId) {
      throw new InvalidConfigError(
        this.providerName,
        'Google Cloud Project ID is required for Vertex AI TTS (GOOGLE_CLOUD_PROJECT)'
      );
    }
  }

  /**
   * Get an authenticated access token via Service Account
   *
   * @private
   * @returns OAuth2 access token
   */
  private async getAccessToken(): Promise<string> {
    if (!this.authClient) {
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({
        keyFilename: this.config.keyFilename,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      this.authClient = await auth.getClient() as { getAccessToken: () => Promise<{ token?: string | null }> };
    }

    const tokenResponse = await this.authClient.getAccessToken();
    if (!tokenResponse.token) {
      throw new InvalidConfigError(
        this.providerName,
        'Failed to obtain access token from Service Account'
      );
    }

    return tokenResponse.token;
  }

  /**
   * Synthesize text to speech using Vertex AI TTS
   *
   * @param text - The input text to synthesize
   * @param voiceId - The voice name (e.g. "Kore", "Puck", "Charon")
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
    const options = (request.providerOptions || {}) as VertexAITTSProviderOptions;
    const model = options.model || DEFAULT_MODEL;
    const requestedFormat = request.audio?.format || 'mp3';

    const requestBody = this.buildRequest(text, voiceId, options);

    this.log('debug', 'Synthesizing with Vertex AI TTS', {
      voiceId,
      model,
      textLength: text.length,
      requestedFormat,
    });

    const logContext: CallAPILogContext = {
      kind: 'single-synthesize',
      requestShape: 'single-voice',
      speakers: [{ speaker: 'default', voice: voiceId }],
      extras: {
        textLength: text.length,
        requestedFormat,
      },
    };

    try {
      const { pcmBuffer, region: usedRegion } = await this.callAPIWithRegionRotation(
        requestBody,
        model,
        options.region,
        logContext,
      );
      const { audioBuffer, audioFormat } = await this.convertPcmAudio(pcmBuffer, requestedFormat);
      const duration = Date.now() - startTime;

      this.log('info', 'Synthesis successful', {
        voiceId,
        characters: text.length,
        duration,
        audioSize: audioBuffer.length,
        audioFormat,
        region: usedRegion,
      });

      return {
        audio: audioBuffer,
        metadata: {
          provider: this.providerName,
          voice: voiceId,
          duration,
          audioDuration: audioFormat === 'mp3' ? getMp3Duration(audioBuffer) : undefined,
          audioFormat,
          sampleRate: DEFAULT_SAMPLE_RATE,
          region: usedRegion,
        },
        billing: {
          characters: this.countCharacters(text),
        },
      };
    } catch (error) {
      this.log('error', 'Synthesis failed', {
        voiceId,
        error: (error as Error).message,
      });

      throw this.handleError(error as Error, 'during Vertex AI TTS API call');
    }
  }

  /**
   * Synthesize a multi-segment, multi-speaker dialog in a single call
   *
   * @description Runs one Vertex AI request per segment *sequentially* (keeps
   * region rotation well-behaved and avoids quota bursts), concatenates the
   * resulting raw PCM buffers, and converts once at the end. Billing aggregates
   * characters across every turn and stylePrompt so consumer apps can charge
   * their customers for the full amount actually sent to Google.
   *
   * Requires a Gemini 3.1 model. The 8 KB combined-byte limit is enforced per
   * segment *before* the API call — consumers receive a typed PayloadTooLargeError
   * without incurring cost.
   *
   * @param request - Dialog request with speakers and ordered segments
   * @returns Single concatenated audio response with aggregated billing
   * @throws {InvalidConfigError} If speakers/turns are invalid
   * @throws {PayloadTooLargeError} If any segment exceeds the 8 KB limit
   */
  async synthesizeDialog(request: SynthesizeDialogRequest): Promise<TTSResponse> {
    this.validateDialogRequest(request);

    const startTime = Date.now();
    const options = (request.providerOptions || {}) as VertexAITTSProviderOptions;
    const model = options.model || DEFAULT_DIALOG_MODEL;
    const requestedFormat = request.audio?.format || 'mp3';

    this.log('debug', 'Synthesizing dialog with Vertex AI TTS', {
      model,
      segmentCount: request.segments.length,
      speakerCount: request.speakers.length,
      requestedFormat,
    });

    const pcmChunks: Buffer[] = [];
    const segmentBillings: Array<{ characters: number; region: string }> = [];

    for (let i = 0; i < request.segments.length; i++) {
      const segment = request.segments[i];
      const requestBody = this.buildDialogRequest(
        segment,
        request.speakers,
        options,
        i,
      );

      // Derive log context from the actually-built request body so what we log
      // is exactly what callAPI() will send. Shape is inferred from the
      // speechConfig variant chosen by buildDialogRequest().
      const logContext = this.buildDialogLogContext(requestBody, segment, request.speakers, i);

      try {
        const { pcmBuffer, region } = await this.callAPIWithRegionRotation(
          requestBody,
          model,
          options.region,
          logContext,
        );
        pcmChunks.push(pcmBuffer);
        segmentBillings.push({
          characters: this.countSegmentCharacters(segment),
          region,
        });
      } catch (error) {
        this.log('error', 'Dialog segment synthesis failed', {
          segmentIndex: i,
          error: (error as Error).message,
        });
        throw this.handleError(error as Error, `during Vertex AI TTS dialog segment #${i}`);
      }
    }

    const combinedPcm = Buffer.concat(pcmChunks);
    const { audioBuffer, audioFormat } = await this.convertPcmAudio(
      combinedPcm,
      requestedFormat,
    );
    const duration = Date.now() - startTime;
    const totalCharacters = segmentBillings.reduce(
      (sum, s) => sum + s.characters,
      0,
    );

    this.log('info', 'Dialog synthesis successful', {
      segmentCount: request.segments.length,
      characters: totalCharacters,
      duration,
      audioSize: audioBuffer.length,
      audioFormat,
    });

    return {
      audio: audioBuffer,
      metadata: {
        provider: this.providerName,
        voice: request.speakers.map((s) => `${s.speaker}:${s.voice}`).join(','),
        duration,
        audioDuration: audioFormat === 'mp3' ? getMp3Duration(audioBuffer) : undefined,
        audioFormat,
        sampleRate: DEFAULT_SAMPLE_RATE,
      },
      billing: {
        characters: totalCharacters,
      },
    };
  }

  /**
   * Validate a dialog request (speakers unique, turns reference known speakers, etc.)
   *
   * @private
   * @throws {InvalidConfigError} If the request is structurally invalid
   */
  private validateDialogRequest(request: SynthesizeDialogRequest): void {
    if (!request.speakers || request.speakers.length === 0) {
      throw new InvalidConfigError(
        this.providerName,
        'Dialog request requires at least one speaker',
      );
    }

    if (!request.segments || request.segments.length === 0) {
      throw new InvalidConfigError(
        this.providerName,
        'Dialog request requires at least one segment',
      );
    }

    const speakerAliases = new Set<string>();
    for (const s of request.speakers) {
      if (!s.speaker || !s.voice) {
        throw new InvalidConfigError(
          this.providerName,
          'Every speaker needs both "speaker" and "voice"',
        );
      }
      if (!/^[A-Za-z0-9]+$/.test(s.speaker)) {
        throw new InvalidConfigError(
          this.providerName,
          `Speaker alias "${s.speaker}" must be alphanumeric (no whitespace or symbols)`,
        );
      }
      if (speakerAliases.has(s.speaker)) {
        throw new InvalidConfigError(
          this.providerName,
          `Duplicate speaker alias "${s.speaker}"`,
        );
      }
      speakerAliases.add(s.speaker);
    }

    for (let i = 0; i < request.segments.length; i++) {
      const seg = request.segments[i];
      if (!seg.turns || seg.turns.length === 0) {
        throw new InvalidConfigError(
          this.providerName,
          `Segment #${i} has no turns`,
        );
      }
      for (let j = 0; j < seg.turns.length; j++) {
        const turn = seg.turns[j];
        if (!turn.text || turn.text.trim().length === 0) {
          throw new InvalidConfigError(
            this.providerName,
            `Segment #${i} turn #${j} has empty text`,
          );
        }
        if (!speakerAliases.has(turn.speaker)) {
          throw new InvalidConfigError(
            this.providerName,
            `Segment #${i} turn #${j} references unknown speaker "${turn.speaker}"`,
          );
        }
      }
    }
  }

  /**
   * Count billable characters for a single dialog segment
   *
   * @private
   * @description Counts exactly what `buildDialogRequest()` places in the
   * `contents[0].parts[0].text` string sent to Gemini:
   *   - The stylePrompt (if any)
   *   - Each turn's text
   *   - The `"Speaker: "` prefix is added ONLY for multi-speaker segments
   *     (matching the prefix logic in `buildDialogRequest`), since Google's
   *     documented single-voice TTS format uses plain text without a label.
   */
  private countSegmentCharacters(segment: DialogSegment): number {
    const distinctSpeakers = new Set(segment.turns.map((t) => t.speaker)).size;
    const includeSpeakerPrefix = distinctSpeakers > 1;
    const turnsChars = segment.turns.reduce(
      (sum, t) =>
        sum + (includeSpeakerPrefix ? `${t.speaker}: ${t.text}`.length : t.text.length),
      0,
    );
    const promptChars = segment.stylePrompt?.length ?? 0;
    return turnsChars + promptChars;
  }

  /**
   * Build Vertex AI generateContent request payload (single-voice)
   *
   * @private
   */
  private buildRequest(
    text: string,
    voiceId: string,
    options: VertexAITTSProviderOptions
  ): Record<string, unknown> {
    const synthesisText = options.stylePrompt
      ? `${options.stylePrompt} ${text}`
      : text;

    this.assertPayloadWithinLimits(synthesisText, options.stylePrompt);

    const generationConfig: Record<string, unknown> = {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceId,
          },
        },
      },
    };

    if (typeof options.temperature === 'number') {
      generationConfig.temperature = options.temperature;
    }

    return {
      contents: [
        {
          role: 'user',
          parts: [{ text: synthesisText }],
        },
      ],
      generationConfig,
    };
  }

  /**
   * Build Vertex AI generateContent request payload for a dialog segment
   *
   * @private
   * @description Chooses the request shape based on the number of distinct
   * speakers actually used in the segment's turns:
   * - 1 speaker → `prebuiltVoiceConfig` (single-voice request)
   * - 2 speakers → `multiSpeakerVoiceConfig` (Vertex AI requires exactly 2 entries)
   * - >2 speakers → InvalidConfigError (split the segment so each sub-segment has ≤2 speakers)
   */
  private buildDialogRequest(
    segment: DialogSegment,
    speakers: DialogSpeaker[],
    options: VertexAITTSProviderOptions,
    segmentIndex: number,
  ): Record<string, unknown> {
    // The `"Speaker: "` prefix is ONLY needed for multi-speaker segments, where
    // Gemini uses the label to look up the matching `speakerVoiceConfigs` entry
    // and route each turn to the correct voice. For single-speaker segments
    // there is nothing to route — the prefix becomes an unrecognized token
    // that Gemini's speech-synthesis classifier can mistakenly render aloud
    // (e.g. pronouncing "Alice" as part of the audio).
    //
    // This mirrors Google's documented single-voice format, which uses plain
    // text without any speaker label:
    //   - https://ai.google.dev/gemini-api/docs/speech-generation
    //   - https://docs.cloud.google.com/text-to-speech/docs/gemini-tts
    const distinctSpeakers = new Set(segment.turns.map((t) => t.speaker)).size;
    const includeSpeakerPrefix = distinctSpeakers > 1;

    const turnsText = segment.turns
      .map((t) => (includeSpeakerPrefix ? `${t.speaker}: ${t.text}` : t.text))
      .join('\n');

    const synthesisText = segment.stylePrompt
      ? `${segment.stylePrompt}\n${turnsText}`
      : turnsText;

    this.assertPayloadWithinLimits(synthesisText, segment.stylePrompt, segmentIndex);

    const usedAliases = new Set(segment.turns.map((t) => t.speaker));
    const usedSpeakers = speakers.filter((s) => usedAliases.has(s.speaker));

    if (usedSpeakers.length === 0) {
      throw new InvalidConfigError(
        this.providerName,
        `Segment #${segmentIndex} has no recognized speakers`,
      );
    }
    if (usedSpeakers.length > 2) {
      throw new InvalidConfigError(
        this.providerName,
        `Segment #${segmentIndex} uses ${usedSpeakers.length} distinct speakers, ` +
          `but Vertex AI multi-speaker TTS supports at most 2 speakers per request. ` +
          `Split the segment so each sub-segment has at most 2 speakers.`,
      );
    }

    const temperature = segment.temperature ?? options.temperature;

    const speechConfig: Record<string, unknown> =
      usedSpeakers.length === 1
        ? {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: usedSpeakers[0].voice },
            },
          }
        : {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: usedSpeakers.map((s) => ({
                speaker: s.speaker,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: s.voice },
                },
              })),
            },
          };

    const generationConfig: Record<string, unknown> = {
      responseModalities: ['AUDIO'],
      speechConfig,
    };

    if (typeof temperature === 'number') {
      generationConfig.temperature = temperature;
    }

    return {
      contents: [
        {
          role: 'user',
          parts: [{ text: synthesisText }],
        },
      ],
      generationConfig,
    };
  }

  /**
   * Build a debug log context for one dialog segment.
   *
   * @private
   * @description Inspects the already-built request body so the logged shape
   * and speaker mapping exactly match what will be sent upstream. Reading the
   * body (instead of re-deriving from `segment.turns`) ensures the log stays
   * truthful if `buildDialogRequest()` evolves.
   */
  private buildDialogLogContext(
    requestBody: Record<string, unknown>,
    segment: DialogSegment,
    speakers: DialogSpeaker[],
    segmentIndex: number,
  ): CallAPILogContext {
    const speechConfig =
      (requestBody.generationConfig as Record<string, unknown> | undefined)?.speechConfig as
        | Record<string, unknown>
        | undefined;

    let requestShape: 'single-voice' | 'multi-speaker' = 'single-voice';
    let loggedSpeakers: Array<{ speaker: string; voice: string }> = [];

    const multi = speechConfig?.multiSpeakerVoiceConfig as
      | { speakerVoiceConfigs?: Array<{ speaker: string; voiceConfig?: { prebuiltVoiceConfig?: { voiceName?: string } } }> }
      | undefined;

    if (multi?.speakerVoiceConfigs && multi.speakerVoiceConfigs.length > 0) {
      requestShape = 'multi-speaker';
      loggedSpeakers = multi.speakerVoiceConfigs.map((c) => ({
        speaker: c.speaker,
        voice: c.voiceConfig?.prebuiltVoiceConfig?.voiceName ?? '(unknown)',
      }));
    } else {
      const single = speechConfig?.voiceConfig as
        | { prebuiltVoiceConfig?: { voiceName?: string } }
        | undefined;
      const voiceName = single?.prebuiltVoiceConfig?.voiceName;
      // Find the alias that maps to this voice (for readability in the log)
      const usedAliases = new Set(segment.turns.map((t) => t.speaker));
      const usedSpeaker = speakers.find((s) => usedAliases.has(s.speaker) && s.voice === voiceName);
      loggedSpeakers = voiceName
        ? [{ speaker: usedSpeaker?.speaker ?? '(unknown)', voice: voiceName }]
        : [];
    }

    return {
      kind: 'dialog-segment',
      segmentIndex,
      requestShape,
      speakers: loggedSpeakers,
      extras: {
        turnCount: segment.turns.length,
        hasStylePrompt: !!segment.stylePrompt,
        stylePromptBytes: segment.stylePrompt ? Buffer.byteLength(segment.stylePrompt, 'utf8') : 0,
        temperature: (requestBody.generationConfig as Record<string, unknown> | undefined)?.temperature,
      },
    };
  }

  /**
   * Validate payload byte limits before sending to Vertex AI
   *
   * @private
   * @throws {PayloadTooLargeError} If text or combined payload exceeds limits
   */
  private assertPayloadWithinLimits(
    combinedText: string,
    stylePrompt: string | undefined,
    segmentIndex?: number,
  ): void {
    const combinedBytes = Buffer.byteLength(combinedText, 'utf8');
    const promptBytes = stylePrompt ? Buffer.byteLength(stylePrompt, 'utf8') : 0;
    const textBytes = combinedBytes - promptBytes;
    const segmentLabel = segmentIndex !== undefined ? ` in segment #${segmentIndex}` : '';

    if (textBytes > GEMINI_TTS_MAX_TEXT_BYTES) {
      throw new PayloadTooLargeError(
        this.providerName,
        `Vertex AI TTS text${segmentLabel} is ${textBytes} bytes — exceeds ${GEMINI_TTS_MAX_TEXT_BYTES} byte limit. Split into smaller segments.`,
        textBytes,
        GEMINI_TTS_MAX_TEXT_BYTES,
        segmentIndex,
      );
    }

    if (promptBytes > GEMINI_TTS_MAX_PROMPT_BYTES) {
      throw new PayloadTooLargeError(
        this.providerName,
        `Vertex AI TTS stylePrompt${segmentLabel} is ${promptBytes} bytes — exceeds ${GEMINI_TTS_MAX_PROMPT_BYTES} byte limit.`,
        promptBytes,
        GEMINI_TTS_MAX_PROMPT_BYTES,
        segmentIndex,
      );
    }

    if (combinedBytes > GEMINI_TTS_MAX_COMBINED_BYTES) {
      throw new PayloadTooLargeError(
        this.providerName,
        `Vertex AI TTS combined payload${segmentLabel} is ${combinedBytes} bytes — exceeds ${GEMINI_TTS_MAX_COMBINED_BYTES} byte limit.`,
        combinedBytes,
        GEMINI_TTS_MAX_COMBINED_BYTES,
        segmentIndex,
      );
    }
  }

  /**
   * Call the Vertex AI API with optional region rotation on quota errors
   *
   * @private
   * @param requestBody - The request payload
   * @param model - The model to use
   * @param regionOverride - Optional per-request region override (skips rotation)
   * @returns The PCM audio buffer and the region that processed the request
   */
  private async callAPIWithRegionRotation(
    requestBody: Record<string, unknown>,
    model: string,
    regionOverride?: string,
    logContext?: CallAPILogContext,
  ): Promise<{ pcmBuffer: Buffer; region: string }> {
    // Per-request override: skip rotation entirely
    if (regionOverride) {
      const pcmBuffer = await this.callAPI(requestBody, model, regionOverride, logContext);
      return { pcmBuffer, region: regionOverride };
    }

    const rotationConfig = this.config.regionRotation;

    // No rotation configured: use static region from constructor config
    if (!rotationConfig) {
      const region = this.config.region || DEFAULT_REGION;
      const pcmBuffer = await this.callAPI(requestBody, model, region, logContext);
      return { pcmBuffer, region };
    }

    // Region rotation: try each region in order, rotate on quota errors only
    const regionsToTry = [...rotationConfig.regions, rotationConfig.fallback];
    let lastQuotaError: Error | null = null;

    for (const region of regionsToTry) {
      try {
        const pcmBuffer = await this.callAPI(requestBody, model, region, logContext);
        return { pcmBuffer, region };
      } catch (error) {
        if (isQuotaError(error)) {
          this.log('warn', 'Quota exceeded, rotating to next region', {
            failedRegion: region,
          });
          lastQuotaError = error as Error;
          continue;
        }
        throw error; // Non-quota errors: rethrow immediately
      }
    }

    // Bonus attempt: try fallback one more time (alwaysTryFallback default: true)
    if (rotationConfig.alwaysTryFallback !== false) {
      try {
        const pcmBuffer = await this.callAPI(requestBody, model, rotationConfig.fallback, logContext);
        return { pcmBuffer, region: rotationConfig.fallback };
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        lastQuotaError = error as Error;
      }
    }

    throw lastQuotaError ?? new Error('All Vertex AI TTS regions exhausted');
  }

  /**
   * Call Vertex AI generateContent API
   *
   * @private
   * @param requestBody - The request payload
   * @param model - The model to use
   * @param region - The Vertex AI region to use
   * @param logContext - Optional debug context. When provided (and
   *   `DEBUG_TTS_REQUESTS` is enabled), this call writes a Markdown log file
   *   with the full request body, response metadata, timing, and any error.
   * @returns Promise resolving to raw PCM audio buffer
   */
  private async callAPI(
    requestBody: Record<string, unknown>,
    model: string,
    region: string,
    logContext?: CallAPILogContext,
  ): Promise<Buffer> {
    const accessToken = await this.getAccessToken();

    const projectId = this.config.projectId;
    const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:generateContent`;

    const logEnabled = !!logContext && this.isRequestLoggingEnabled();
    const timestamp = new Date().toISOString();
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      // Network-level failure (no response received)
      if (logEnabled) {
        this.logRequest({
          kind: logContext!.kind,
          timestamp,
          model,
          region,
          endpointUrl: url,
          httpMethod: 'POST',
          segmentIndex: logContext!.segmentIndex,
          speakers: logContext!.speakers,
          requestShape: logContext!.requestShape,
          requestBody,
          durationMs: Date.now() - startedAt,
          error: {
            name: (err as Error).name,
            message: (err as Error).message,
            stack: (err as Error).stack,
          },
          extras: logContext!.extras,
        });
      }
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (logEnabled) {
        this.logRequest({
          kind: logContext!.kind,
          timestamp,
          model,
          region,
          endpointUrl: url,
          httpMethod: 'POST',
          segmentIndex: logContext!.segmentIndex,
          speakers: logContext!.speakers,
          requestShape: logContext!.requestShape,
          requestBody,
          httpStatus: response.status,
          responseBody: parseErrorBody(errorText),
          durationMs: Date.now() - startedAt,
          error: {
            message: `Vertex AI API error (${response.status})`,
          },
          extras: logContext!.extras,
        });
      }
      throw new Error(`Vertex AI API error (${response.status}): ${errorText}`);
    }

    const responseJson = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: {
              mimeType?: string;
              data?: string;
            };
          }>;
        };
      }>;
    };

    const inlineData = responseJson.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
      if (logEnabled) {
        this.logRequest({
          kind: logContext!.kind,
          timestamp,
          model,
          region,
          endpointUrl: url,
          httpMethod: 'POST',
          segmentIndex: logContext!.segmentIndex,
          speakers: logContext!.speakers,
          requestShape: logContext!.requestShape,
          requestBody,
          httpStatus: response.status,
          responseBody: responseJson,
          durationMs: Date.now() - startedAt,
          error: { message: 'Vertex AI API returned no audio data' },
          extras: logContext!.extras,
        });
      }
      throw new Error('Vertex AI API returned no audio data');
    }

    const pcmBuffer = Buffer.from(inlineData.data, 'base64');

    if (logEnabled) {
      this.logRequest({
        kind: logContext!.kind,
        timestamp,
        model,
        region,
        endpointUrl: url,
        httpMethod: 'POST',
        segmentIndex: logContext!.segmentIndex,
        speakers: logContext!.speakers,
        requestShape: logContext!.requestShape,
        requestBody,
        httpStatus: response.status,
        responseBody: {
          mimeType: inlineData.mimeType,
          audioBytes: pcmBuffer.length,
          audioBase64Length: inlineData.data.length,
          candidateCount: responseJson.candidates?.length ?? 0,
        },
        durationMs: Date.now() - startedAt,
        extras: logContext!.extras,
      });
    }

    return pcmBuffer;
  }

  /**
   * Resolve ffmpeg binary path with fallback chain:
   * 1. Explicit config value
   * 2. FFMPEG_PATH environment variable
   * 3. ffmpeg-static npm package (optional peer dependency)
   * 4. System ffmpeg in PATH
   */
  private resolveFfmpegPath(configPath?: string): string {
    if (configPath) {
      this.log('info', 'Using ffmpeg from config', { path: configPath });
      return configPath;
    }

    if (process.env.FFMPEG_PATH) {
      this.log('info', 'Using ffmpeg from FFMPEG_PATH env var', { path: process.env.FFMPEG_PATH });
      return process.env.FFMPEG_PATH;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ffmpegStatic = require('ffmpeg-static') as string | null;
      if (ffmpegStatic) {
        this.ensureExecutable(ffmpegStatic);
        this.log('info', 'Using ffmpeg from ffmpeg-static package', { path: ffmpegStatic });
        return ffmpegStatic;
      }
    } catch {
      // ffmpeg-static not installed — continue to system fallback
    }

    return 'ffmpeg';
  }

  /**
   * Ensure a binary file has execute permissions (Linux/macOS containers).
   * No-op on Windows or if already executable.
   */
  private ensureExecutable(filePath: string): void {
    if (process.platform === 'win32') return;

    try {
      accessSync(filePath, constants.X_OK);
    } catch {
      try {
        chmodSync(filePath, 0o755);
        this.log('info', 'Set execute permission on ffmpeg binary', { path: filePath });
      } catch {
        // Best-effort — if chmod fails, spawn will fail and trigger WAV fallback
      }
    }
  }

  /**
   * Convert raw PCM audio to the requested format
   *
   * @private
   * @param pcmBuffer - Raw PCM buffer (24kHz, 16-bit, mono, little-endian)
   * @param requestedFormat - The desired output format ('mp3', 'wav', etc.)
   * @returns The converted audio buffer and actual format used
   */
  private async convertPcmAudio(
    pcmBuffer: Buffer,
    requestedFormat: string
  ): Promise<{ audioBuffer: Buffer; audioFormat: string }> {
    if (requestedFormat === 'wav') {
      return {
        audioBuffer: this.pcmToWav(pcmBuffer),
        audioFormat: 'wav',
      };
    }

    // For mp3 (and any other format), try ffmpeg first, fall back to WAV
    try {
      const mp3Buffer = await this.pcmToMp3(pcmBuffer);
      return { audioBuffer: mp3Buffer, audioFormat: 'mp3' };
    } catch (error) {
      this.log('warn', 'ffmpeg not available, falling back to WAV output', {
        error: (error as Error).message,
      });
      return {
        audioBuffer: this.pcmToWav(pcmBuffer),
        audioFormat: 'wav',
      };
    }
  }

  /**
   * Convert raw PCM to MP3 using ffmpeg via child_process
   *
   * @private
   * @param pcmBuffer - Raw PCM buffer (24kHz, 16-bit, mono, little-endian)
   * @returns Promise resolving to MP3 buffer
   */
  private pcmToMp3(pcmBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.ffmpegPath, [
        '-f', 's16le',
        '-ar', String(DEFAULT_SAMPLE_RATE),
        '-ac', '1',
        '-i', 'pipe:0',
        '-codec:a', 'libmp3lame',
        '-b:a', '128k',
        '-f', 'mp3',
        'pipe:1',
      ]);

      const chunks: Buffer[] = [];
      ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      ffmpeg.stderr.on('data', () => {});

      ffmpeg.on('error', (err: Error) => {
        reject(new Error(`ffmpeg spawn failed: ${err.message}`));
      });

      ffmpeg.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });

      ffmpeg.stdin.write(pcmBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Convert raw PCM to WAV by prepending a 44-byte WAV header
   *
   * @private
   * @param pcmBuffer - Raw PCM buffer (24kHz, 16-bit, mono, little-endian)
   * @returns WAV buffer
   */
  private pcmToWav(pcmBuffer: Buffer): Buffer {
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = DEFAULT_SAMPLE_RATE * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const dataLength = pcmBuffer.length;

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);       // PCM chunk size
    header.writeUInt16LE(1, 20);        // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(DEFAULT_SAMPLE_RATE, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return Buffer.concat([header, pcmBuffer]);
  }
}
