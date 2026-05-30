/**
 * Base TTS Provider Abstract Class
 *
 * All TTS providers must extend this class and implement the abstract methods.
 * This ensures consistency across all providers.
 *
 * @abstract
 */

import type {
  TTSProvider,
  TTSSynthesizeRequest,
  TTSResponse,
  TTSErrorCode,
  SynthesizeDialogRequest,
} from '../types';
import { log as logUtil } from '../utils/logger.utils';
import {
  writeRequestLog,
  isRequestLoggingEnabled,
  type TTSRequestLogEntry,
} from '../utils/request-logger.utils';

/**
 * Base error class for all TTS errors
 */
export class TTSError extends Error {
  /**
   * Creates a new TTS error
   *
   * @param provider - The provider that threw the error
   * @param code - Error code for categorization
   * @param message - Human-readable error message
   * @param cause - Optional underlying error that caused this error
   */
  constructor(
    public readonly provider: string,
    public readonly code: TTSErrorCode,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TTSError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TTSError);
    }
  }

  /**
   * Returns a formatted error message with context
   */
  toString(): string {
    return `[${this.provider}] ${this.code}: ${this.message}${
      this.cause ? ` (caused by: ${this.cause.message})` : ''
    }`;
  }
}

/**
 * Error thrown when TTS configuration is invalid or missing
 */
export class InvalidConfigError extends TTSError {
  constructor(provider: string, message: string, cause?: Error) {
    super(provider, 'INVALID_CONFIG' as TTSErrorCode, message, cause);
    this.name = 'InvalidConfigError';
  }
}

/**
 * Error thrown when voice ID is invalid or not found
 */
export class InvalidVoiceError extends TTSError {
  constructor(
    provider: string,
    voiceId: string,
    message?: string,
    cause?: Error
  ) {
    super(
      provider,
      'INVALID_VOICE' as TTSErrorCode,
      message || `Voice not found: ${voiceId}`,
      cause
    );
    this.name = 'InvalidVoiceError';
  }
}

/**
 * Error thrown when provider quota/rate limit is exceeded
 */
export class QuotaExceededError extends TTSError {
  constructor(provider: string, message?: string, cause?: Error) {
    super(
      provider,
      'QUOTA_EXCEEDED' as TTSErrorCode,
      message || 'Provider quota or rate limit exceeded',
      cause
    );
    this.name = 'QuotaExceededError';
  }
}

/**
 * Error thrown when provider service is unavailable
 */
export class ProviderUnavailableError extends TTSError {
  constructor(provider: string, message?: string, cause?: Error) {
    super(
      provider,
      'PROVIDER_UNAVAILABLE' as TTSErrorCode,
      message || 'Provider service is temporarily unavailable',
      cause
    );
    this.name = 'ProviderUnavailableError';
  }
}

/**
 * Error thrown when synthesis fails for unknown reasons
 */
export class SynthesisFailedError extends TTSError {
  constructor(provider: string, message: string, cause?: Error) {
    super(provider, 'SYNTHESIS_FAILED' as TTSErrorCode, message, cause);
    this.name = 'SynthesisFailedError';
  }
}

/**
 * Error thrown when network operation fails
 */
export class NetworkError extends TTSError {
  constructor(provider: string, message: string, cause?: Error) {
    super(provider, 'NETWORK_ERROR' as TTSErrorCode, message, cause);
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when the input payload exceeds a provider byte/character limit.
 *
 * @description Thrown *before* the remote API call, so consumers can split or
 * shorten the input without incurring a failed request billing. For multi-segment
 * dialogs, `segmentIndex` identifies the offending segment.
 */
export class PayloadTooLargeError extends TTSError {
  constructor(
    provider: string,
    message: string,
    public readonly actualBytes?: number,
    public readonly maxBytes?: number,
    public readonly segmentIndex?: number,
    cause?: Error
  ) {
    super(provider, 'PAYLOAD_TOO_LARGE' as TTSErrorCode, message, cause);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * Abstract base class for all TTS providers
 *
 * @abstract
 *
 * @description All provider implementations must:
 * - Extend this class
 * - Implement the abstract synthesize() method
 * - Call super() in constructor with the provider name
 * - Use the provided error classes for consistent error handling
 *
 * @example
 * ```typescript
 * class AzureProvider extends BaseTTSProvider {
 *   constructor() {
 *     super(TTSProvider.AZURE);
 *   }
 *
 *   async synthesize(text: string, voiceId: string, request: TTSSynthesizeRequest): Promise<TTSResponse> {
 *     this.validateConfig(request);
 *     // ... implementation
 *   }
 * }
 * ```
 */
export abstract class BaseTTSProvider {
  /**
   * The provider name (e.g., 'azure', 'openai')
   */
  protected readonly providerName: TTSProvider;

  /**
   * Creates a new TTS provider
   *
   * @param providerName - The provider identifier
   */
  constructor(providerName: TTSProvider) {
    this.providerName = providerName;
  }

  /**
   * Synthesize text to speech
   *
   * @abstract
   * @param text - The input text to synthesize
   * @param voiceId - The voice identifier (provider-specific)
   * @param request - The full synthesis request with options
   * @returns Promise resolving to the synthesis response with audio buffer
   * @throws {InvalidConfigError} If provider configuration is invalid
   * @throws {InvalidVoiceError} If voice ID is not found
   * @throws {QuotaExceededError} If provider quota is exceeded
   * @throws {ProviderUnavailableError} If provider service is unavailable
   * @throws {SynthesisFailedError} If synthesis fails for other reasons
   */
  abstract synthesize(
    text: string,
    voiceId: string,
    request: TTSSynthesizeRequest
  ): Promise<TTSResponse>;

  /**
   * Get the provider name
   *
   * @returns The provider identifier
   */
  public getProviderName(): TTSProvider {
    return this.providerName;
  }

  /**
   * Validate provider configuration
   *
   * @protected
   * @param request - The synthesis request to validate
   * @throws {InvalidConfigError} If configuration is invalid
   *
   * @description Subclasses should override this to validate provider-specific
   * configuration (e.g., API keys, region settings)
   */
  protected validateConfig(request: TTSSynthesizeRequest): void {
    if (!request.text || request.text.trim().length === 0) {
      throw new InvalidConfigError(
        this.providerName,
        'Text cannot be empty'
      );
    }

    if (!request.voice || !request.voice.id) {
      throw new InvalidConfigError(
        this.providerName,
        'Voice ID is required'
      );
    }
  }

  /**
   * Count characters in text for billing purposes
   *
   * @protected
   * @param text - The input text to count
   * @returns The number of characters (including spaces and punctuation)
   *
   * @description This is the base implementation that counts all characters.
   * Providers that use SSML or have special character counting rules
   * should override this method.
   *
   * @example
   * ```typescript
   * const count = this.countCharacters("Hello World!"); // returns 12
   * ```
   */
  protected countCharacters(text: string): number {
    return text.length;
  }

  /**
   * Validate that a voice exists
   *
   * @protected
   * @param _voiceId - The voice identifier to validate (unused in base implementation)
   * @returns Promise resolving to true if voice exists
   * @throws {InvalidVoiceError} If voice does not exist
   *
   * @description Base implementation always returns true. Providers should
   * override this to validate voice IDs against their voice catalogs.
   */
  protected async validateVoiceExists(_voiceId: string): Promise<boolean> {
    // Base implementation: assume voice exists
    // Subclasses should override to validate against provider's voice catalog
    return true;
  }

  /**
   * Create a standardized error from a provider-specific error
   *
   * @protected
   * @param error - The original error
   * @param context - Additional context for debugging
   * @returns A standardized TTS error
   *
   * @description Wraps provider-specific errors in our error classes
   * for consistent error handling across providers.
   */
  protected handleError(error: Error, context?: string): TTSError {
    // If it's already a TTSError, return it
    if (error instanceof TTSError) {
      return error;
    }

    // Check for common HTTP error codes
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('401') || errorMessage.includes('403')) {
      return new InvalidConfigError(
        this.providerName,
        `Authentication failed${context ? `: ${context}` : ''}`,
        error
      );
    }

    if (errorMessage.includes('429')) {
      return new QuotaExceededError(
        this.providerName,
        `Rate limit exceeded${context ? `: ${context}` : ''}`,
        error
      );
    }

    if (
      errorMessage.includes('503') ||
      errorMessage.includes('504') ||
      errorMessage.includes('502')
    ) {
      return new ProviderUnavailableError(
        this.providerName,
        `Service temporarily unavailable${context ? `: ${context}` : ''}`,
        error
      );
    }

    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound')
    ) {
      return new NetworkError(
        this.providerName,
        `Network error${context ? `: ${context}` : ''}`,
        error
      );
    }

    // Default to SynthesisFailedError for unknown errors
    return new SynthesisFailedError(
      this.providerName,
      `Synthesis failed${context ? `: ${context}` : ''}: ${error.message}`,
      error
    );
  }

  /**
   * Log a message using the pluggable logger
   *
   * @protected
   * @param level - Log level
   * @param message - Log message
   * @param meta - Optional metadata
   *
   * @description Uses the global TTS logger which can be customized via setLogger().
   * By default uses console logging, but can be replaced with any logger (Winston, Pino, etc.)
   *
   * @example
   * ```typescript
   * // In application code:
   * import { setLogger, silentLogger } from '@loonylabs/tts-middleware';
   *
   * // Disable all logging
   * setLogger(silentLogger);
   *
   * // Use custom logger
   * setLogger({
   *   info: (msg, meta) => myLogger.info(msg, meta),
   *   // ...
   * });
   * ```
   */
  protected log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    meta?: Record<string, unknown>
  ): void {
    logUtil(this.providerName, level, message, meta);
  }

  /**
   * Check if per-request debug logging is enabled.
   *
   * @protected
   * @returns true when `DEBUG_TTS_REQUESTS` is truthy in the environment.
   *
   * @description Providers can gate expensive body capture/cloning behind this
   * flag to avoid overhead when logging is disabled.
   */
  protected isRequestLoggingEnabled(): boolean {
    return isRequestLoggingEnabled();
  }

  /**
   * Write a debug Markdown log file for a single upstream API call.
   *
   * @protected
   * @param entry - Log entry data. The provider name is injected automatically
   *   if omitted. No-op when `DEBUG_TTS_REQUESTS` is disabled.
   *
   * @description Provider-agnostic request logger. Each call produces exactly
   * one `.md` file under `<cwd>/logs/tts/requests/` (override via
   * `TTS_REQUEST_LOG_DIR`). Use this to capture exactly what was sent to and
   * received from an upstream TTS API (Vertex AI, Azure, etc.).
   *
   * @example
   * ```typescript
   * this.logRequest({
   *   kind: 'dialog-segment',
   *   timestamp: new Date().toISOString(),
   *   model,
   *   region,
   *   endpointUrl: url,
   *   segmentIndex: i,
   *   speakers: usedSpeakers,
   *   requestShape: 'multi-speaker',
   *   requestBody,
   *   httpStatus: response.status,
   *   durationMs: Date.now() - startedAt,
   *   responseBody: { audioBytes: buf.length, mimeType: 'audio/pcm' },
   * });
   * ```
   */
  protected logRequest(entry: Omit<TTSRequestLogEntry, 'provider'> & { provider?: string }): void {
    writeRequestLog({
      ...entry,
      provider: entry.provider ?? this.providerName,
    });
  }
}

/**
 * Declares what a dialog-capable provider supports.
 *
 * @description Consumers can read these before building a request (e.g. to
 * check whether a 3-speaker scene fits, or whether per-segment style prompts
 * are honored) instead of discovering limits via runtime errors.
 */
export interface DialogCapabilities {
  /** Maximum number of distinct speakers the provider supports per dialog. */
  maxSpeakers: number;
  /**
   * Maximum characters accepted per upstream request. The provider chunks
   * larger dialogs internally. Undefined = no fixed documented cap.
   */
  maxCharsPerRequest?: number;
  /** Whether `DialogSegment.stylePrompt` influences delivery (Gemini) or is ignored (ElevenLabs). */
  supportsStylePrompt: boolean;
  /** Whether inline audio tags (e.g. `[whispers]`) in turn text affect delivery. */
  supportsAudioTags: boolean;
}

/**
 * Capability interface for providers that support multi-speaker dialog
 * synthesis via {@link BaseTTSProvider}.
 *
 * @description Implemented by providers with a native dialog/multi-speaker
 * endpoint (e.g. Vertex AI / Gemini, ElevenLabs Text to Dialogue). Use
 * {@link supportsDialog} to narrow a provider instance to this interface.
 */
export interface SupportsDialog {
  /** Static description of the provider's dialog limits and features. */
  readonly dialogCapabilities: DialogCapabilities;
  /**
   * Synthesize a multi-segment, multi-speaker dialog into a single audio file.
   *
   * @param request - Dialog request with speakers and ordered segments
   * @returns Single audio response with aggregated billing
   */
  synthesizeDialog(request: SynthesizeDialogRequest): Promise<TTSResponse>;
}

/**
 * Type guard: narrows a provider to {@link SupportsDialog} when it implements
 * the dialog capability.
 */
export function supportsDialog(
  provider: BaseTTSProvider
): provider is BaseTTSProvider & SupportsDialog {
  const candidate = provider as Partial<SupportsDialog>;
  return (
    typeof candidate.synthesizeDialog === 'function' &&
    typeof candidate.dialogCapabilities === 'object' &&
    candidate.dialogCapabilities !== null
  );
}
