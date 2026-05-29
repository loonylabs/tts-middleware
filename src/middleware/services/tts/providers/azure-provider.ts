/**
 * Azure Speech Services TTS Provider
 *
 * @description Implementation of TTS provider for Microsoft Azure Speech Services.
 * This is the MVP provider for EU-compliant TTS synthesis.
 *
 * @see https://learn.microsoft.com/en-us/azure/ai-services/speech-service/
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { TTSSynthesizeRequest, TTSResponse, AudioFormat } from '../types';
import { TTSProvider } from '../types';
import type { AzureProviderOptions } from '../types/provider-options.types';
import { getMp3Duration } from '../utils/mp3-duration.utils';
import {
  BaseTTSProvider,
  InvalidConfigError,
  InvalidVoiceError,
  SynthesisFailedError,
} from './base-tts-provider';

/**
 * Azure-specific configuration
 */
interface AzureConfig {
  subscriptionKey: string;
  region: string;
  endpoint?: string;
}

/**
 * Azure Speech Services provider implementation
 *
 * @description Provides TTS synthesis using Microsoft Azure Speech Services.
 * Supports emotion, style, and multiple audio formats.
 *
 * @example
 * ```typescript
 * const provider = new AzureProvider();
 * const response = await provider.synthesize(
 *   "Hello World",
 *   "en-US-JennyNeural",
 *   {
 *     text: "Hello World",
 *     voice: { id: "en-US-JennyNeural" },
 *     audio: { speed: 1.0, format: "mp3" },
 *     providerOptions: { emotion: "cheerful" }
 *   }
 * );
 * ```
 */
export class AzureProvider extends BaseTTSProvider {
  private config: AzureConfig;
  private speechConfig: sdk.SpeechConfig | null = null;

  /**
   * Creates a new Azure TTS provider
   *
   * @param config - Optional Azure configuration (uses env vars if not provided)
   * @throws {InvalidConfigError} If required configuration is missing
   */
  constructor(config?: Partial<AzureConfig>) {
    super(TTSProvider.AZURE);

    // Load configuration from environment or provided config
    this.config = {
      subscriptionKey:
        config?.subscriptionKey || process.env.AZURE_SPEECH_KEY || '',
      region: config?.region || process.env.AZURE_SPEECH_REGION || '',
      endpoint: config?.endpoint || process.env.AZURE_SPEECH_ENDPOINT,
    };

    // Validate configuration
    this.validateAzureConfig();

    // Initialize speech config
    this.initializeSpeechConfig();
  }

  /**
   * Validate Azure-specific configuration
   *
   * @private
   * @throws {InvalidConfigError} If configuration is invalid
   */
  private validateAzureConfig(): void {
    if (!this.config.subscriptionKey) {
      throw new InvalidConfigError(
        this.providerName,
        'Azure Speech subscription key is required (AZURE_SPEECH_KEY)'
      );
    }

    if (!this.config.region) {
      throw new InvalidConfigError(
        this.providerName,
        'Azure Speech region is required (AZURE_SPEECH_REGION)'
      );
    }
  }

  /**
   * Initialize Azure Speech SDK configuration
   *
   * @private
   */
  private initializeSpeechConfig(): void {
    try {
      if (this.config.endpoint) {
        this.speechConfig = sdk.SpeechConfig.fromEndpoint(
          new URL(this.config.endpoint),
          this.config.subscriptionKey
        );
      } else {
        this.speechConfig = sdk.SpeechConfig.fromSubscription(
          this.config.subscriptionKey,
          this.config.region
        );
      }

      this.log('info', 'Azure Speech SDK initialized', {
        region: this.config.region,
        hasEndpoint: !!this.config.endpoint,
      });
    } catch (error) {
      throw new InvalidConfigError(
        this.providerName,
        `Failed to initialize Azure Speech SDK: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Synthesize text to speech using Azure Speech Services
   *
   * @param text - The input text to synthesize
   * @param voiceId - The voice identifier (e.g., "en-US-JennyNeural")
   * @param request - The full synthesis request with options
   * @returns Promise resolving to the synthesis response
   * @throws {InvalidConfigError} If configuration is invalid
   * @throws {InvalidVoiceError} If voice is not found
   * @throws {SynthesisFailedError} If synthesis fails
   */
  async synthesize(
    text: string,
    voiceId: string,
    request: TTSSynthesizeRequest
  ): Promise<TTSResponse> {
    // Validate configuration
    this.validateConfig(request);

    if (!this.speechConfig) {
      throw new InvalidConfigError(
        this.providerName,
        'Speech configuration not initialized'
      );
    }

    const startTime = Date.now();

    try {
      // Extract options
      const audioFormat = request.audio?.format || 'mp3';
      const speed = request.audio?.speed || 1.0;
      const sampleRate = request.audio?.sampleRate || 24000;

      // Set audio output format
      this.setAudioFormat(audioFormat, sampleRate);

      // Generate SSML
      const ssml = this.generateSSML(text, voiceId, request);

      this.log('debug', 'Synthesizing with Azure', {
        voiceId,
        audioFormat,
        speed,
        sampleRate,
        ssmlLength: ssml.length,
      });

      // Create synthesizer.
      //
      // IMPORTANT: pass `null` as the AudioConfig. When it is omitted, the
      // Speech SDK defaults to the system speaker output, which is a browser
      // construct. In Node.js / server contexts that initialization fails
      // silently — the synthesis callbacks never fire and the process exits
      // with no audio. Passing `null` routes the audio into `result.audioData`
      // (an in-memory buffer) without touching any audio device.
      const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, null);

      // Synthesize speech
      const audioBuffer = await this.synthesizeSSML(synthesizer, ssml);

      // Calculate duration (estimated)
      const duration = Date.now() - startTime;

      // Count billable characters (original text, not SSML)
      const characters = this.countCharacters(text);

      this.log('info', 'Synthesis successful', {
        voiceId,
        characters,
        duration,
        audioSize: audioBuffer.length,
      });

      // Return response
      return {
        audio: audioBuffer,
        metadata: {
          provider: this.providerName,
          voice: voiceId,
          duration,
          audioDuration: getMp3Duration(audioBuffer),
          audioFormat,
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

      throw this.handleError(error as Error, 'during synthesis');
    }
  }

  /**
   * Set audio output format for Azure Speech SDK
   *
   * @private
   * @param format - The audio format (mp3, wav, opus)
   * @param sampleRate - The sample rate in Hz
   */
  private setAudioFormat(format: AudioFormat, sampleRate: number): void {
    if (!this.speechConfig) {
      throw new InvalidConfigError(
        this.providerName,
        'Speech configuration not initialized'
      );
    }

    // Map format and sample rate to Azure format strings
    const azureFormat = this.getAzureAudioFormat(format, sampleRate);

    this.speechConfig.speechSynthesisOutputFormat = azureFormat;

    this.log('debug', 'Audio format set', {
      format,
      sampleRate,
      azureFormat: sdk.SpeechSynthesisOutputFormat[azureFormat],
    });
  }

  /**
   * Map audio format and sample rate to Azure format enum
   *
   * @private
   * @param format - The audio format
   * @param sampleRate - The sample rate in Hz
   * @returns Azure audio format enum value
   */
  private getAzureAudioFormat(
    format: AudioFormat,
    sampleRate: number
  ): sdk.SpeechSynthesisOutputFormat {
    const formatKey = `${format}_${sampleRate}`;

    const formatMap: Record<string, sdk.SpeechSynthesisOutputFormat> = {
      // MP3 formats
      mp3_8000: sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3,
      mp3_16000: sdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3,
      mp3_24000: sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3,
      mp3_48000: sdk.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3,

      // WAV formats
      wav_8000: sdk.SpeechSynthesisOutputFormat.Riff8Khz16BitMonoPcm,
      wav_16000: sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm,
      wav_24000: sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm,
      wav_48000: sdk.SpeechSynthesisOutputFormat.Riff48Khz16BitMonoPcm,

      // Opus formats
      opus_8000: sdk.SpeechSynthesisOutputFormat.Ogg16Khz16BitMonoOpus,
      opus_16000: sdk.SpeechSynthesisOutputFormat.Ogg16Khz16BitMonoOpus,
      opus_24000: sdk.SpeechSynthesisOutputFormat.Ogg24Khz16BitMonoOpus,
      opus_48000: sdk.SpeechSynthesisOutputFormat.Ogg48Khz16BitMonoOpus,
    };

    // Default formats if exact match not found
    const defaultFormats: Record<string, sdk.SpeechSynthesisOutputFormat> = {
      mp3: sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3,
      wav: sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm,
      opus: sdk.SpeechSynthesisOutputFormat.Ogg24Khz16BitMonoOpus,
      aac: sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3, // Fallback to MP3
      flac: sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm, // Fallback to WAV
    };

    return (
      formatMap[formatKey] ||
      defaultFormats[format] ||
      sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3
    );
  }

  /**
   * Generate SSML from plain text and options
   *
   * @private
   * @param text - The input text
   * @param voiceId - The voice identifier
   * @param request - The synthesis request with options
   * @returns SSML string
   */
  private generateSSML(
    text: string,
    voiceId: string,
    request: TTSSynthesizeRequest
  ): string {
    // Extract language from voice ID. Standard: "en-US-JennyNeural" -> "en-US".
    // HD voices use "de-DE-Seraphina:DragonHDOmniLatestNeural" — slicing the
    // first two dash-separated segments still yields the locale ("de-DE").
    const language = voiceId.split('-').slice(0, 2).join('-');

    // HD voice detection. Dragon HD and Dragon HD Omni are LLM-based models
    // with a different SSML feature set than standard neural voices:
    //   - <prosody> is NOT supported (rate/pitch are ignored or rejected).
    //   - <mstts:express-as> is supported only by Omni (plain DragonHD ignores it).
    //   - Variation is instead controlled via the `parameters` attribute
    //     (temperature, top_p, cfg_scale) on the <voice> element.
    const isHd = /:DragonHD/i.test(voiceId);
    const isOmni = /:DragonHDOmni/i.test(voiceId);

    const opts = (request.providerOptions ?? {}) as AzureProviderOptions;
    const emotion = opts.emotion || null;
    const style = opts.style || emotion;
    const temperature = opts.temperature;
    const topP = opts.topP;
    const cfgScale = opts.cfgScale;
    const speed = request.audio?.speed || 1.0;

    // Escape XML special characters
    const escapedText = this.escapeXML(text);

    // HD tuning parameters (only meaningful for HD voices)
    const params: string[] = [];
    if (isHd) {
      if (typeof temperature === 'number') params.push(`temperature=${temperature}`);
      if (typeof topP === 'number') params.push(`top_p=${topP}`);
      if (typeof cfgScale === 'number') params.push(`cfg_scale=${cfgScale}`);
    }
    const paramAttr = params.length ? ` parameters="${params.join(';')}"` : '';

    // express-as is honored for standard neural voices and for Omni (which also
    // accepts free-text style descriptions). Plain DragonHD does not support it.
    const useExpressAs = !!style && (!isHd || isOmni);
    if (style && isHd && !isOmni) {
      this.log(
        'warn',
        'express-as style ignored: plain DragonHD voices do not support styles. Use a DragonHDOmni voice or the `temperature` option instead.',
        { voiceId, style }
      );
    }

    // Build SSML
    let ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${language}">`;
    ssml += `<voice name="${voiceId}"${paramAttr}>`;

    if (useExpressAs && style) {
      ssml += `<mstts:express-as style="${this.escapeXML(style)}">`;
    }

    // <prosody> is only emitted for standard neural voices; HD voices reject it.
    if (!isHd) {
      const rateValue = this.speedToProsodyRate(speed);
      ssml += `<prosody rate="${rateValue}">`;
    }

    ssml += escapedText;

    if (!isHd) {
      ssml += `</prosody>`;
    }
    if (useExpressAs && style) {
      ssml += `</mstts:express-as>`;
    }

    ssml += `</voice>`;
    ssml += `</speak>`;

    return ssml;
  }

  /**
   * Convert speed multiplier to SSML prosody rate value
   *
   * @private
   * @param speed - Speed multiplier (0.5 - 2.0)
   * @returns SSML rate value
   */
  private speedToProsodyRate(speed: number): string {
    // Azure accepts percentage values: "50%" = half speed, "200%" = double speed
    // Or relative values: "x-slow", "slow", "medium", "fast", "x-fast"

    if (speed === 1.0) {
      return 'medium';
    }

    // Convert to percentage (1.0 = 100%, 0.5 = 50%, 2.0 = 200%)
    const percentage = Math.round(speed * 100);
    return `${percentage}%`;
  }

  /**
   * Escape XML special characters
   *
   * @private
   * @param text - The text to escape
   * @returns Escaped text
   */
  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Synthesize SSML using Azure Speech SDK
   *
   * @private
   * @param synthesizer - The speech synthesizer
   * @param ssml - The SSML to synthesize
   * @returns Promise resolving to audio buffer
   * @throws {InvalidVoiceError} If voice is not found
   * @throws {SynthesisFailedError} If synthesis fails
   */
  private async synthesizeSSML(
    synthesizer: sdk.SpeechSynthesizer,
    ssml: string
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            // Convert ArrayBuffer to Buffer
            const audioBuffer = Buffer.from(result.audioData);
            synthesizer.close();
            resolve(audioBuffer);
          } else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellation = sdk.CancellationDetails.fromResult(result);
            synthesizer.close();

            // Check error type
            if (cancellation.ErrorCode === sdk.CancellationErrorCode.AuthenticationFailure) {
              reject(
                new InvalidConfigError(
                  this.providerName,
                  `Authentication failed: ${cancellation.errorDetails}`
                )
              );
            } else if (cancellation.errorDetails?.includes('voice')) {
              reject(
                new InvalidVoiceError(
                  this.providerName,
                  'unknown',
                  `Voice not found: ${cancellation.errorDetails}`
                )
              );
            } else {
              reject(
                new SynthesisFailedError(
                  this.providerName,
                  `Synthesis canceled: ${cancellation.errorDetails || 'Unknown error'}`
                )
              );
            }
          } else {
            synthesizer.close();
            reject(
              new SynthesisFailedError(
                this.providerName,
                `Unexpected result reason: ${sdk.ResultReason[result.reason]}`
              )
            );
          }
        },
        (error) => {
          synthesizer.close();
          reject(this.handleError(new Error(error), 'during Azure SDK call'));
        }
      );
    });
  }
}
