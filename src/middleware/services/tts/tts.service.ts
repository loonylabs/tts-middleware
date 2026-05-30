/**
 * TTS Service Orchestrator
 *
 * @description Main service class that orchestrates TTS provider access.
 * This is the primary API that consuming applications use.
 *
 * Analogous to LLMService in the LLM middleware.
 */

import type {
  TTSSynthesizeRequest,
  TTSResponse,
  SynthesizeDialogRequest,
} from './types';
import { TTSProvider } from './types';
import type { BaseTTSProvider } from './providers/base-tts-provider';
import { supportsDialog } from './providers/base-tts-provider';
import { InvalidConfigError } from './providers/base-tts-provider';
import { AzureProvider } from './providers/azure-provider';
import { CartesiaProvider } from './providers/cartesia-provider';
import { ElevenLabsProvider } from './providers/elevenlabs-provider';
import { EdenAIProvider } from './providers/edenai-provider';
import { GoogleCloudTTSProvider } from './providers/google-cloud-tts-provider';
import { FishAudioProvider } from './providers/fish-audio-provider';
import { InworldProvider } from './providers/inworld-provider';
import { VertexAITTSProvider } from './providers/vertex-ai-tts-provider';
import {
  executeWithRetry,
  DEFAULT_RETRY_CONFIG,
} from './utils/retry.utils';
import type { RetryConfig } from './utils/retry.utils';

/**
 * TTS Service - Main orchestrator for TTS operations
 *
 * @description Singleton service that manages TTS providers and provides
 * a unified API for text-to-speech synthesis across multiple providers.
 *
 * @example
 * ```typescript
 * import { ttsService, TTSProvider } from '@loonylabs/tts-middleware';
 *
 * // Using default provider
 * const response = await ttsService.synthesize({
 *   text: "Hello World",
 *   voice: { id: "en-US-JennyNeural" }
 * });
 *
 * // Using specific provider
 * const response = await ttsService.synthesize({
 *   text: "Guten Tag",
 *   provider: TTSProvider.AZURE,
 *   voice: { id: "de-DE-KatjaNeural" }
 * });
 * ```
 */
export class TTSService {
  /**
   * Provider registry - maps provider enum to provider instance
   */
  private providers: Map<TTSProvider, BaseTTSProvider>;

  /**
   * Default provider to use when none is specified
   */
  private defaultProvider: TTSProvider;

  /**
   * Creates a new TTS Service instance
   *
   * @description Initializes the service with all available providers.
   * Providers are lazily initialized - they're only created when first accessed.
   */
  constructor() {
    this.providers = new Map();

    // Set default provider from environment or use Azure as fallback
    const envDefaultProvider = process.env.TTS_DEFAULT_PROVIDER?.toLowerCase();
    this.defaultProvider = this.parseProvider(envDefaultProvider) || TTSProvider.AZURE;

    // Initialize MVP provider (Azure)
    this.initializeProviders();

    this.log('info', 'TTS Service initialized', {
      defaultProvider: this.defaultProvider,
      availableProviders: this.getAvailableProviders(),
    });
  }

  /**
   * Initialize available providers
   *
   * @private
   */
  private initializeProviders(): void {
    // Data-driven registry: each provider is constructed independently and a
    // failure (e.g. missing credentials) only skips that provider. Adding a new
    // provider is a single entry here.
    const factories: ReadonlyArray<readonly [TTSProvider, () => BaseTTSProvider]> = [
      [TTSProvider.AZURE, () => new AzureProvider()],
      [TTSProvider.CARTESIA, () => new CartesiaProvider()],
      [TTSProvider.ELEVENLABS, () => new ElevenLabsProvider()],
      [TTSProvider.EDENAI, () => new EdenAIProvider()],
      [TTSProvider.GOOGLE, () => new GoogleCloudTTSProvider()],
      [TTSProvider.FISH_AUDIO, () => new FishAudioProvider()],
      [TTSProvider.INWORLD, () => new InworldProvider()],
      [TTSProvider.VERTEX_AI, () => new VertexAITTSProvider()],
    ];

    for (const [name, factory] of factories) {
      try {
        this.providers.set(name, factory());
        this.log('debug', `${name} provider initialized`);
      } catch (error) {
        this.log('warn', `Failed to initialize ${name} provider`, {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Parse provider string to TTSProvider enum
   *
   * @private
   * @param provider - Provider string (case-insensitive)
   * @returns TTSProvider enum value or undefined
   */
  private parseProvider(provider?: string): TTSProvider | undefined {
    if (!provider) {
      return undefined;
    }

    const normalized = provider.toLowerCase();
    const providerMap: Record<string, TTSProvider> = {
      azure: TTSProvider.AZURE,
      edenai: TTSProvider.EDENAI,
      openai: TTSProvider.OPENAI,
      elevenlabs: TTSProvider.ELEVENLABS,
      google: TTSProvider.GOOGLE,
      deepgram: TTSProvider.DEEPGRAM,
      fish_audio: TTSProvider.FISH_AUDIO,
      inworld: TTSProvider.INWORLD,
      vertex_ai: TTSProvider.VERTEX_AI,
      cartesia: TTSProvider.CARTESIA,
    };

    return providerMap[normalized];
  }

  /**
   * Synthesize text to speech
   *
   * @param request - The synthesis request
   * @returns Promise resolving to synthesis response with audio buffer
   * @throws {Error} If provider is not available or synthesis fails
   *
   * @example
   * ```typescript
   * const response = await ttsService.synthesize({
   *   text: "Hello World",
   *   voice: { id: "en-US-JennyNeural" },
   *   audio: { speed: 1.0, format: "mp3" }
   * });
   *
   * fs.writeFileSync('output.mp3', response.audio);
   * console.log(`Cost: ${response.billing.characters} characters`);
   * ```
   */
  async synthesize(request: TTSSynthesizeRequest): Promise<TTSResponse> {
    // Determine which provider to use
    const providerEnum = request.provider || this.defaultProvider;

    // Get provider instance
    const provider = this.getProvider(providerEnum);

    // Log synthesis request
    this.log('info', 'Synthesizing speech', {
      provider: providerEnum,
      voiceId: request.voice.id,
      textLength: request.text.length,
    });

    // Resolve retry configuration
    const retryConfig = this.resolveRetryConfig(request.retry);

    const synthesizeFn = async () => {
      const response = await provider.synthesize(
        request.text,
        request.voice.id,
        request
      );
      return response;
    };

    try {
      const response = retryConfig
        ? await executeWithRetry(
            synthesizeFn,
            retryConfig,
            (level, message, meta) =>
              this.log(level, message, { provider: providerEnum, ...meta })
          )
        : await synthesizeFn();

      this.log('info', 'Synthesis completed', {
        provider: providerEnum,
        characters: response.billing.characters,
        audioSize: response.audio.length,
      });

      return response;
    } catch (error) {
      this.log('error', 'Synthesis failed', {
        provider: providerEnum,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Synthesize a multi-speaker dialog.
   *
   * @description Routes to a dialog-capable provider's `synthesizeDialog()`.
   * The provider is taken from `request.provider` (falling back to the default
   * provider). Throws a clear error if the resolved provider does not support
   * dialog synthesis — inspect `provider.dialogCapabilities` (via
   * {@link getProvider}) to discover limits such as max speakers beforehand.
   *
   * @param request - Dialog request with speakers and ordered segments
   * @returns Single concatenated audio response with aggregated billing
   * @throws {InvalidConfigError} If the provider is not registered or does not
   *   support dialog synthesis
   *
   * @example
   * ```typescript
   * const audio = await ttsService.synthesizeDialog({
   *   provider: TTSProvider.ELEVENLABS,
   *   speakers: [
   *     { speaker: 'Narrator', voice: 'JBFqnCBsd6RMkjVDRZzb' },
   *     { speaker: 'Leah', voice: 'EXAVITQu4vr4xnSDxMaL' },
   *   ],
   *   segments: [{ turns: [{ speaker: 'Narrator', text: 'Es war einmal…' }] }],
   *   providerOptions: { model_id: 'eleven_v3', language_code: 'de' },
   * });
   * ```
   */
  async synthesizeDialog(
    request: SynthesizeDialogRequest
  ): Promise<TTSResponse> {
    const providerEnum = request.provider || this.defaultProvider;
    const provider = this.getProvider(providerEnum);

    if (!supportsDialog(provider)) {
      const capable = this.getAvailableProviders().filter((p) => {
        const inst = this.providers.get(p);
        return inst && supportsDialog(inst);
      });
      throw new InvalidConfigError(
        providerEnum,
        `Provider '${providerEnum}' does not support dialog synthesis. ` +
          `Dialog-capable providers: ${capable.length ? capable.join(', ') : 'none registered'}.`
      );
    }

    this.log('info', 'Synthesizing dialog', {
      provider: providerEnum,
      speakerCount: request.speakers?.length,
      segmentCount: request.segments?.length,
    });

    try {
      const response = await provider.synthesizeDialog(request);
      this.log('info', 'Dialog synthesis completed', {
        provider: providerEnum,
        characters: response.billing.characters,
        audioSize: response.audio.length,
      });
      return response;
    } catch (error) {
      this.log('error', 'Dialog synthesis failed', {
        provider: providerEnum,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get a provider instance
   *
   * @param provider - The provider enum
   * @returns The provider instance
   * @throws {Error} If provider is not registered
   *
   * @example
   * ```typescript
   * const azureProvider = ttsService.getProvider(TTSProvider.AZURE);
   * ```
   */
  public getProvider(provider: TTSProvider): BaseTTSProvider {
    const providerInstance = this.providers.get(provider);

    if (!providerInstance) {
      const availableProviders = this.getAvailableProviders().join(', ');
      throw new Error(
        `Provider '${provider}' is not available. Available providers: ${availableProviders}`
      );
    }

    return providerInstance;
  }

  /**
   * Set the default provider
   *
   * @param provider - The provider to set as default
   * @throws {Error} If provider is not registered
   *
   * @example
   * ```typescript
   * ttsService.setDefaultProvider(TTSProvider.AZURE);
   * ```
   */
  public setDefaultProvider(provider: TTSProvider): void {
    // Validate that provider exists
    if (!this.providers.has(provider)) {
      const availableProviders = this.getAvailableProviders().join(', ');
      throw new Error(
        `Cannot set default provider '${provider}': provider is not available. Available providers: ${availableProviders}`
      );
    }

    this.defaultProvider = provider;

    this.log('info', 'Default provider changed', {
      newDefault: provider,
    });
  }

  /**
   * Get the current default provider
   *
   * @returns The default provider enum
   *
   * @example
   * ```typescript
   * const defaultProvider = ttsService.getDefaultProvider();
   * console.log(`Using ${defaultProvider} by default`);
   * ```
   */
  public getDefaultProvider(): TTSProvider {
    return this.defaultProvider;
  }

  /**
   * Get list of available providers
   *
   * @returns Array of available provider enums
   *
   * @example
   * ```typescript
   * const providers = ttsService.getAvailableProviders();
   * console.log(`Available: ${providers.join(', ')}`);
   * ```
   */
  public getAvailableProviders(): TTSProvider[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is available
   *
   * @param provider - The provider to check
   * @returns True if provider is available
   *
   * @example
   * ```typescript
   * if (ttsService.isProviderAvailable(TTSProvider.AZURE)) {
   *   // Use Azure
   * }
   * ```
   */
  public isProviderAvailable(provider: TTSProvider): boolean {
    return this.providers.has(provider);
  }

  /**
   * Resolve retry configuration from request
   *
   * @private
   * @param retry - Retry option from request (true, false, or RetryConfig)
   * @returns RetryConfig if retry is enabled, null if disabled
   */
  private resolveRetryConfig(
    retry?: boolean | RetryConfig
  ): RetryConfig | null {
    // Default: retry enabled
    if (retry === undefined || retry === true) {
      return DEFAULT_RETRY_CONFIG;
    }
    if (retry === false) {
      return null;
    }
    // Custom config object
    return retry;
  }

  /**
   * Log a message
   *
   * @private
   * @param level - Log level
   * @param message - Log message
   * @param meta - Optional metadata
   */
  private log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    meta?: Record<string, unknown>
  ): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [TTSService] [${level.toUpperCase()}]`;

    if (meta) {
      console[level](prefix, message, meta);
    } else {
      console[level](prefix, message);
    }
  }
}

/**
 * Singleton instance of TTS Service
 *
 * @description This is the main export that consuming applications should use.
 *
 * @example
 * ```typescript
 * import { ttsService } from '@loonylabs/tts-middleware';
 *
 * const response = await ttsService.synthesize({
 *   text: "Hello World",
 *   voice: { id: "en-US-JennyNeural" }
 * });
 * ```
 */
export const ttsService = new TTSService();
