# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.17.0] - 2026-11-02

### Added
- **Gemini 3.8 TTS on Vertex AI** — `gemini-3.8-flash-tts` and
  `gemini-3.8-flash-lite-tts` (single voice and 2-speaker dialog).
  - Request schema per Google's migration guide: `stylePrompt` →
    `speechMetadata.style`, dialog turn → one part with
    `speechMetadata.speaker`, voice → `voiceConfig.voice`. The text is a
    verbatim transcript; nothing is prepended to it.
  - New option `languageCode` (BCP-47, sent as `speechConfig.languageCode`).
  - `temperature` is not sent for 3.8 (the API rejects it); a warning is logged.
- **Multi-region locations `eu` / `us` / `global`.** The host is resolved per
  location (`aiplatform.eu.rep.googleapis.com`, `aiplatform.googleapis.com`,
  `<region>-aiplatform.googleapis.com`). `eu-aiplatform.googleapis.com` is not
  a valid host (measured: HTTP 400 "Invalid hostname").

### Changed
- Unary Gemini 3.8 responses are a complete WAV file; the provider unwraps the
  `data` chunk so MP3/WAV conversion works on PCM as before.
- Dialog debug logs read the voice from `voiceConfig.voice` as well as
  `prebuiltVoiceConfig.voiceName`.

### Notes
- Still **max 2 distinct speakers per request** on 3.8 (measured 2026-11-02:
  3 speakers → `INVALID_ARGUMENT`).
- Inline tags are angle-bracket on 3.8 (`<sigh>`); `[sigh]` is not converted.
- Payload limits (4 KB text / 4 KB style / 8 KB combined) are kept from 3.1 and
  were not re-verified for 3.8 (Google lists an 8192-token input limit).

## [0.16.0] - 2026-05-30

### Changed
- **Provider registration is now data-driven** — `TTSService.initializeProviders()`
  iterates a `[provider, factory]` registry instead of nine near-identical
  try/catch blocks (~90 fewer lines; adding a provider is one entry). Behavior
  is unchanged: a provider that fails to construct is skipped with a warning.
- **`SynthesizeDialogRequest` is now generic** in its provider options
  (`SynthesizeDialogRequest<TProviderOptions>`, defaulting to the built-in
  Vertex/ElevenLabs union). New dialog providers parameterize the generic
  instead of widening a shared union. Its `audio` now also accepts `sampleRate`.
- `DialogSpeaker.voice` documentation clarified (Gemini prebuilt name vs.
  ElevenLabs voice ID).

### Fixed
- **ElevenLabs dialog output format mismatch** — `synthesizeDialog()` now derives
  the ElevenLabs `output_format` from the requested `audio.format` (via the same
  mapping as single-voice synthesis), so `metadata.audioFormat` always matches
  the bytes returned. Previously a `wav` request returned MP3 bytes while
  reporting `wav`. `wav` now maps to `wav_48000`.
- **ElevenLabs dialog now warns when `stylePrompt` is supplied** — it has no
  ElevenLabs equivalent and was silently dropped; a debug warning surfaces it
  (helps Gemini→ElevenLabs migration). Express delivery with inline audio tags.

## [0.15.0] - 2026-05-30

### Added
- **Dialog synthesis as a first-class provider capability.**
  - New `SupportsDialog` interface + `DialogCapabilities` descriptor +
    `supportsDialog()` type guard (exported from the package). Dialog-capable
    providers now declare their limits (`maxSpeakers`, `maxCharsPerRequest`,
    `supportsStylePrompt`, `supportsAudioTags`) so consumers can check before
    building a request.
  - New unified entry point **`ttsService.synthesizeDialog(request)`** — routes
    by `request.provider` (falling back to the default provider) and throws a
    clear, provider-named error if the resolved provider is not dialog-capable.
  - `SynthesizeDialogRequest` gained an optional `provider` field; its
    `providerOptions` now accepts `ElevenLabsProviderOptions` in addition to
    `VertexAITTSProviderOptions`.
- **ElevenLabs Text to Dialogue** (`ElevenLabsProvider.synthesizeDialog()`) —
  multi-speaker dialog via the `eleven_v3` Text to Dialogue endpoint:
  - **Up to 10 distinct speakers** in a single call (vs. Vertex's 2 per segment),
    with the model managing speaker transitions for better cross-speaker
    coherence.
  - Turns are flattened across segments and packed into ≤2000-character chunks
    (ElevenLabs hard limit); chunk MP3s are concatenated. Short dialogs are a
    single call. Billing aggregates all turn characters.
  - Inline audio tags (`[whispers]`, `[laughs]`, …) pass through in turn text.
    `stylePrompt` has no ElevenLabs equivalent and is ignored.
  - `dialogCapabilities`: `{ maxSpeakers: 10, maxCharsPerRequest: 2000,
    supportsStylePrompt: false, supportsAudioTags: true }`.
  - Helper script: `scripts/manual-test-elevenlabs-dialog.ts`.
- **VertexAITTSProvider** now formally implements `SupportsDialog` with
  `dialogCapabilities` `{ maxSpeakers: 2, supportsStylePrompt: true,
  supportsAudioTags: true }` (behavior unchanged).

## [0.14.0] - 2026-05-30

### Added
- **ElevenLabs provider** (`TTSProvider.ELEVENLABS`) — native integration of the
  ElevenLabs text-to-speech API, including the newest **Eleven v3** model plus
  multilingual v2 / flash. Synthesizes via `POST /v1/text-to-speech/{voice_id}`,
  voices referenced by voice ID.
  - `AzureProviderOptions`-style typed options: `model_id`, `language_code`,
    `stability`, `similarity_boost`, `style`, `speaker_boost`, `outputFormat`.
  - Output-format auto-mapping (`mp3_44100_128` default) with override.
  - New exports: `ElevenLabsProvider` (the `ElevenLabsProviderOptions` /
    `isElevenLabsOptions` types were already public).
  - Helper scripts: `scripts/list-elevenlabs-voices.ts`,
    `scripts/manual-test-elevenlabs.ts`.
  - **Benchmark/test-only** — no EU data residency below Enterprise; training is
    opt-out (default-on) below Enterprise. Note: free API plans cannot use
    library/premade voices (HTTP 402) — a paid plan is required to synthesize.

## [0.13.0] - 2026-05-30

### Added
- **Cartesia Sonic provider** (`TTSProvider.CARTESIA`) — high-quality, low-latency
  voices with **EU data residency by default** and a GDPR-aligned DPA. Synthesizes
  via Cartesia's `POST /tts/bytes` endpoint (Sonic 3 / 3.5), voices referenced by
  voice ID, MP3/WAV up to 44.1 kHz.
  - **Sentence/paragraph pause control** — `sentencePauseMs` / `paragraphPauseMs`
    insert Cartesia `<break>` tags at sentence and paragraph boundaries (Sonic
    otherwise runs sentences together). Dialog-safe: mid-dialogue punctuation is
    left untouched.
  - **Speaking-speed control** via the universal `audio.speed` (clamped to
    Cartesia's 0.6–1.5 range).
  - **Overridable defaults** — `CARTESIA_DEFAULT_SPEED`,
    `CARTESIA_DEFAULT_SENTENCE_PAUSE_MS`, `CARTESIA_DEFAULT_PARAGRAPH_PAUSE_MS`
    (or constructor `defaults`) apply when a request omits the value; per-request
    options always override them. No values are hardcoded in the middleware.
  - New exports: `CartesiaProvider`, `CartesiaProviderOptions`, `isCartesiaOptions`.
  - Helper scripts: `scripts/list-cartesia-voices.ts`, `scripts/manual-test-cartesia.ts`.
- **Azure Dragon HD / Dragon HD Omni support** — HD voices
  (`:DragonHDLatestNeural`, `:DragonHDOmniLatestNeural`) are now first-class:
  - New `AzureProviderOptions`: `temperature` (HD), `topP` / `cfgScale` (Omni),
    emitted via the `<voice parameters="…">` attribute.
  - `style` widened to accept free-text natural-language descriptions for Dragon
    HD Omni voices.
  - SSML generation is now voice-type aware: `<prosody>` is omitted for HD voices
    (which reject it), and `<mstts:express-as>` is only emitted for standard
    neural or Omni voices (plain DragonHD logs a warning and ignores styles).

### Fixed
- **Azure provider produced no audio in Node.js** — `SpeechSynthesizer` was
  constructed without an `AudioConfig`, causing the SDK to target the default
  system speaker. In server/Node contexts this initialization fails silently, the
  synthesis callbacks never fire, and the process exits with no audio. The
  synthesizer is now created with `null` as the AudioConfig, routing audio into
  the in-memory `result.audioData` buffer. This makes the Azure provider usable
  server-side for the first time.

## [0.12.3] - 2026-05-01

### Fixed
- **Vertex AI empty-response not retried** — `isRetryableError()` did not classify
  `"Vertex AI API returned no audio data"` as retryable. This error occurs when
  the Gemini TTS API responds with HTTP 200 but an empty `inlineData` body — a
  known transient behavior of the preview model under sequential load. The error
  message now matches the `no audio data` pattern so `executeWithRetry()` applies
  the standard exponential backoff (up to 3 retries, 1 s → 2 s → 4 s) instead of
  rethrowing immediately. Affects both `synthesize()` and `synthesizeDialog()`.

## [0.12.2] - 2026-04-17

### Fixed
- **Speaker name occasionally pronounced in single-voice dialog segments** —
  `VertexAITTSProvider.synthesizeDialog()` previously prefixed every turn with
  `"Speaker: "` regardless of whether the segment was single- or multi-speaker.
  For single-speaker segments (those routed through `prebuiltVoiceConfig`) this
  is inconsistent with Google's documented single-voice TTS input format, which
  passes plain text without any speaker label
  ([ai.google.dev/gemini-api/docs/speech-generation](https://ai.google.dev/gemini-api/docs/speech-generation),
  [docs.cloud.google.com/text-to-speech/docs/gemini-tts](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)).
  Gemini's speech-synthesis classifier would sometimes treat the unrecognized
  label as content and render it aloud — most commonly with fantasy names the
  tokenizer doesn't map to a known role word. The prefix is now emitted **only**
  for multi-speaker segments, where it is functionally required so Gemini can
  route each turn to the matching `speakerVoiceConfigs` entry. Billing in
  `countSegmentCharacters()` adjusted to match the actual bytes sent.
- No impact on `synthesize()` (non-dialog single-voice path) — that code path
  already used plain text.
- No impact on existing multi-speaker dialog requests — the prefix is kept
  unchanged there.

## [0.12.1] - 2026-04-17

### Added
- **Per-request Markdown debug logs** — provider-agnostic request/response logger
  that writes one `.md` file per upstream TTS API call when
  `DEBUG_TTS_REQUESTS=true` is set. Especially useful for debugging the v0.12.0
  dialog mode, where each dialog segment produces exactly one Google Vertex AI
  request: the log shows the full request body that was sent (so you can verify
  the auto-selected `prebuiltVoiceConfig` vs `multiSpeakerVoiceConfig` shape,
  speaker→voice mapping, and style prompt), response metadata, HTTP status,
  timing, and any error body.
  - Log directory: `<cwd>/logs/tts/requests/` (override via `TTS_REQUEST_LOG_DIR`)
  - Filename pattern: `{ISO}_{provider}_{kind}[_seg{N}]_{shape}.md`
  - Wired into `VertexAITTSProvider` for both `synthesize()` and
    `synthesizeDialog()`; hook is available on `BaseTTSProvider` for every
    provider to opt in
  - No-op when disabled — zero runtime overhead
  - Audio bytes are **not** written to disk; only metadata (mime, byte count,
    candidate count, duration)
  - New exports: `writeRequestLog`, `isRequestLoggingEnabled`, `TTSRequestLogEntry`,
    `TTSRequestLogKind`

---

## [0.12.0] - 2026-04-17

### Added
- **Gemini 3.1 Flash TTS support** — new model option `gemini-3.1-flash-tts-preview`
  for the VertexAITTSProvider, enabling inline audio tags (`[sigh]`, `[whispering]`,
  `[short pause]`, etc.) and native multi-speaker dialog synthesis
- **`synthesizeDialog()` method** on `VertexAITTSProvider` for multi-segment,
  multi-speaker dialog synthesis in a single call. Each segment becomes one
  Vertex AI request; the resulting PCM buffers are concatenated and converted
  once at the end. Segment-level `stylePrompt` and `temperature` overrides are
  supported.
  - **Auto request-shape selection per segment:** 1 distinct speaker → `prebuiltVoiceConfig`
    (single-voice request); 2 distinct speakers → `multiSpeakerVoiceConfig`;
    \>2 speakers → `InvalidConfigError` with guidance to split the segment.
    This reflects Vertex AI's hard constraint that `multi_speaker_voice_config`
    must contain exactly 2 voices.
  - **Speaker filtering:** Only speakers actually used in a segment's turns
    are sent to Vertex AI — the global `speakers` list can contain more
    speakers (e.g. a narrator that only appears in some segments).
- **Client-side payload byte guard** — enforces the 8 KB combined / 4 KB text /
  4 KB prompt limits before the API call, throwing the new `PayloadTooLargeError`
  (with `segmentIndex` for dialog mode) so consumer apps avoid billing for rejected requests
- **Aggregated billing for dialog mode** — `billing.characters` sums every turn
  and stylePrompt across all segments, matching what is actually sent to Google
  (including `Speaker: ` prefixes) so consumer apps can bill their customers accurately
- New exports: `DialogSpeaker`, `DialogTurn`, `DialogSegment`, `SynthesizeDialogRequest`,
  `PayloadTooLargeError`, `TTSErrorCode.PAYLOAD_TOO_LARGE`
- New option: `VertexAITTSProviderOptions.temperature` (0.0–2.0) for Gemini 3.1 Flash TTS

---

## [0.11.1] - 2026-04-08

### Fixed
- Ensure ffmpeg-static binary has execute permissions on Linux containers (chmod 755)
  before spawning — fixes ENOENT on Railway/Docker where postinstall may not preserve permissions

---

## [0.11.0] - 2026-04-08

### Added
- **ffmpeg auto-detection for Vertex AI TTS:** The provider now automatically resolves the ffmpeg
  binary path using a priority chain:
  1. `ffmpegPath` in `VertexAITTSConfig` (explicit config)
  2. `FFMPEG_PATH` environment variable
  3. `ffmpeg-static` npm package (optional peer dependency — auto-detected if installed)
  4. System `ffmpeg` in PATH
  5. WAV fallback (existing behavior)
- **New config option:** `VertexAITTSConfig.ffmpegPath` for explicit ffmpeg binary path
- **New optional peer dependency:** `ffmpeg-static` (>=5.0.0) — install it to get MP3 output
  in containerized environments (Railway, Docker, etc.) without system ffmpeg

### Fixed
- Vertex AI TTS now works in containerized deployments (Railway, Docker) where system ffmpeg
  is not in PATH — previously fell back to WAV which caused downstream MP3 validation errors

---

## [0.10.0] - 2026-03-02

### Breaking Changes
- **Rename: `GeminiProvider` → `VertexAITTSProvider`** — The provider class has been renamed to reflect
  that it uses the Vertex AI API (not the Gemini API / Google AI Studio), which provides regional
  data residency and enterprise DPA coverage.
  - `TTSProvider.GEMINI = 'gemini'` → `TTSProvider.VERTEX_AI = 'vertex_ai'`
  - Class `GeminiProvider` → `VertexAITTSProvider`
  - Interface `GeminiConfig` → `VertexAITTSConfig`
  - Interface `GeminiProviderOptions` → `VertexAITTSProviderOptions`
  - Type guard `isGeminiOptions()` → `isVertexAITTSOptions()`
  - Env var `GEMINI_REGION` → `VERTEX_AI_TTS_REGION`
  - Provider file `gemini-provider.ts` → `vertex-ai-tts-provider.ts`
  - **DB migration required:** Update stored `'gemini'` values to `'vertex_ai'` in all consumer applications

**Migration example:**
```typescript
// Before
import { GeminiProvider, TTSProvider } from '@loonylabs/tts-middleware';
const provider = new GeminiProvider({ region: 'us-central1' });
// provider: TTSProvider.GEMINI

// After
import { VertexAITTSProvider, TTSProvider } from '@loonylabs/tts-middleware';
const provider = new VertexAITTSProvider({ region: 'us-central1' });
// provider: TTSProvider.VERTEX_AI
```

### Google Provider — Datenschutz-Übersicht

Both Google-based TTS providers use the same Service Account credentials
(`GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_CLOUD_PROJECT`) but access different GCP services:

| Provider | Enum | GCP Service | EU-fähig? | Empfehlung |
|---|---|---|---|---|
| `GoogleCloudTTSProvider` | `TTSProvider.GOOGLE` | Cloud Text-to-Speech API | ✅ Ja | Produktion (EU/DACH) |
| `VertexAITTSProvider` | `TTSProvider.VERTEX_AI` | Vertex AI generateContent | ⚠️ Preview | Test/Admin only |

**Google Cloud TTS (`TTSProvider.GOOGLE`):**
- GDPR/CDPA-konform, EU Multi-Region (`region: 'eu'`)
- Zero Data Retention: Audiodaten werden nicht gespeichert oder für Training genutzt
- Supports: Neural2, Standard, Chirp3 voices — stabile GA-Modelle
- Empfohlen für Produktivbetrieb in EU/DACH

**Vertex AI TTS (`TTSProvider.VERTEX_AI`):**
- Vertex AI Data Processing Addendum (DPA) verfügbar — kein Training auf Kundendaten per DPA
- Regionaler Endpoint konfigurierbar via `VERTEX_AI_TTS_REGION` oder `regionRotation`
- Preview-Modelle (`gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts`) aktuell nur `us-central1`
- Für EU-Produktivbetrieb: Warten auf GA-Release mit EU-Region-Support
- Aktuell: Test/Admin only

---

## [0.9.0] - 2026-02-17

### Added
- **Gemini TTS Provider:** New provider for Google Gemini TTS via Vertex AI (test/admin only)
  - Uses Vertex AI `generateContent` endpoint with `responseModalities: ['AUDIO']`
  - Service Account authentication (reuses `GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_CLOUD_PROJECT`)
  - 2 models: `gemini-2.5-flash-preview-tts` (budget, $0.50/M input + $10/M audio output tokens) and `gemini-2.5-pro-preview-tts` (premium, $1.00/M input + $20/M audio output tokens)
  - 30 multilingual voices with auto-detect language (90+ languages)
  - Natural language style control via `stylePrompt` option (e.g. "Say cheerfully:", "Read in a spooky whisper:")
  - PCM-to-MP3 conversion via ffmpeg (child_process) with automatic WAV fallback if ffmpeg unavailable
  - **Note:** No EU data residency guarantees – intended for test/admin use only
- **New Environment Variable:** `GEMINI_REGION` for Vertex AI region (default: `us-central1`)
- **New Types:** `GeminiProviderOptions`, `isGeminiOptions()` type guard
- **New Tests:** 32 unit tests for Gemini TTS provider
- **Manual Test Script:** `scripts/manual-test-gemini.ts` with German and English voice tests

### Changed
- **TTSProvider enum:** Added `GEMINI = 'gemini'`
- **ProviderOptions union:** Includes `GeminiProviderOptions`

## [0.8.0] - 2026-02-02

### Breaking Changes
- **Removed redundant provider-specific fields** — use generic `audio.*` options instead:
  - Google Cloud: `providerOptions.speakingRate` → `audio.speed`
  - Google Cloud: `providerOptions.pitchSemitones` → `audio.pitch`
  - Google Cloud: `providerOptions.volumeGainDb` → `audio.volumeGainDb`
  - Inworld: `providerOptions.speakingRate` → `audio.speed`
  - Inworld: `providerOptions.temperature` → `audio.temperature`
  - Fish Audio: `providerOptions.temperature` → `audio.temperature`
  - EdenAI: Removed dead code fields `speaking_rate`, `speaking_pitch`, `speaking_volume` (were never read)

### Added
- **Inworld AI TTS Provider:** New provider for Inworld AI's TTS 1.5 models (test/admin only)
  - REST API integration via `POST https://api.inworld.ai/tts/v1/voice` (zero dependencies)
  - 2 models: `inworld-tts-1.5-max` (expressive, ~200ms, $10/1M chars) and `inworld-tts-1.5-mini` (ultra-low latency ~120ms, $5/1M chars)
  - 15 languages with instant voice cloning
  - Audio formats: MP3 (default), LINEAR16, OGG_OPUS, ALAW, MULAW, FLAC
  - Sample rates: 8000–48000 Hz (default 48000)
  - Synthesis controls: `temperature`, `timestampType`, `applyTextNormalization`, `bitRate`
  - Billing data from API response (`usage.processedCharactersCount`) with local fallback
  - HTTP Basic authentication via base64-encoded API key
  - **Note:** No EU data residency guarantees – intended for test/admin use only
- **New Environment Variable:** `INWORLD_API_KEY` for Inworld AI API authentication
- **New Types:** `InworldProviderOptions`, `isInworldOptions()` type guard
- **New Tests:** 30 unit tests for Inworld AI provider
- **`AudioOptions.temperature`**: Generic temperature field (range 0–2) for controlling expressiveness
  - Supported by Fish Audio and Inworld AI providers
  - Providers clamp to their supported range internally

### Changed
- **TTSProvider enum:** Added `INWORLD = 'inworld'`
- **ProviderOptions union:** Includes `InworldProviderOptions`
- **`AudioOptions.speed`**: Extended range from 0.5–2.0 to 0.25–4.0
- **Type guards**: Updated `isGoogleCloudTTSOptions`, `isEdenAIOptions`, `isFishAudioOptions`, `isInworldOptions` to reflect removed fields

## [0.7.0] - 2026-01-29

### Added
- **Audio Duration Metadata:** New `metadata.audioDuration` field in `TTSResponse`
  - Actual audio length in milliseconds, calculated by parsing MP3 frame headers from the audio buffer
  - Supports all MPEG versions (1, 2, 2.5), all layers (1, 2, 3), VBR and CBR
  - Zero external dependencies — pure TypeScript implementation (~130 lines)
  - Returns `undefined` for non-MP3 formats (WAV, Opus, etc.)
  - Handles ID3v2 and ID3v1 tags gracefully
- **New Utility:** `getMp3Duration(buffer)` — standalone MP3 duration parser, exported for direct use
- **New Tests:** 11 unit tests for MP3 duration parsing (invalid input, single/multi frame, ID3 tags, corrupt data)

### Changed
- **TTSResponseMetadata:** Clarified `duration` JSDoc as synthesis time (API call duration), added new optional `audioDuration` field
- **All Providers:** Azure, EdenAI, Fish Audio, Google Cloud TTS now populate `audioDuration` automatically

## [0.6.0] - 2026-01-29

### Added
- **Retry with Exponential Backoff:** Automatic retry for transient provider errors
  - Retries on: 429 (rate limit), 408, 5xx (server errors), timeouts, connection errors
  - No retry on: 401/403 (auth), 400 (bad request), permanent errors
  - Exponential backoff with full jitter (Google Cloud best practices)
  - Default: 3 retries, 1s initial delay, 2x multiplier, 30s max delay
  - Configurable via `retry` field in `TTSSynthesizeRequest`:
    - `retry: true` (default) — retry with default config
    - `retry: false` — disable retry
    - `retry: { maxRetries, initialDelayMs, multiplier, maxDelayMs }` — custom config
  - Consistent with `tti-middleware` (`retry: true` pattern)
  - Retry attempts logged at `warn` level with delay and error details
- **New Exports:** `executeWithRetry`, `isRetryableError`, `DEFAULT_RETRY_CONFIG`, `RetryConfig`, `RetryLogger`
- **New Tests:** 44 retry unit tests + 5 service integration tests for retry behavior

### Changed
- **TTSSynthesizeRequest:** New optional `retry` field (`boolean | RetryConfig`, default: `true`)
- **TTSService.synthesize():** Now wraps provider calls with retry logic

## [0.5.1] - 2026-01-29

### Added
- **EdenAI `voice_id` Support:** Pass provider-specific voice names to EdenAI API
  - New `voice_id` field in `EdenAIProviderOptions` for specific voice selection
  - Enables ElevenLabs voices (Aria, Roger, Sarah, Laura, Charlie, George) via EdenAI
  - Works with any EdenAI-supported provider, not just ElevenLabs
  - Example: `providerOptions: { provider: 'elevenlabs', voice_id: 'Aria' }`

### Documentation
- Updated PROVIDER_PARAMETERS.md with `voice_id` parameter and ElevenLabs voice examples
- Updated README with ElevenLabs via EdenAI usage example

## [0.5.0] - 2026-01-29

### Added
- **Fish Audio TTS Provider:** New provider for Fish Audio's S1 model (test/admin only)
  - REST API integration via `POST https://api.fish.audio/v1/tts` (zero dependencies)
  - 3 models: `s1` (flagship, 4B params), `speech-1.6`, `speech-1.5`
  - 13 languages with automatic detection (EN, DE, FR, ES, JA, ZH, KO, AR, RU, NL, IT, PL, PT)
  - 64+ emotional expressions via text markers (e.g., `(excited)`, `(sad)`, `(whispering)`)
  - Voice selection via `reference_id` from Fish Audio voice library or custom cloned voices
  - Quality controls: `temperature`, `topP`, `repetitionPenalty`
  - Latency modes: `low`, `normal`, `balanced`
  - Audio formats: MP3, WAV, PCM, Opus with configurable bitrate and sample rate
  - Prosody controls: speed and volume via universal `AudioOptions`
  - **Note:** No EU data residency guarantees – intended for test/admin use only
- **New Environment Variable:** `FISH_AUDIO_API_KEY` for Fish Audio API authentication
- **New Types:** `FishAudioProviderOptions`, `isFishAudioOptions()` type guard
- **Manual Test Script:** `scripts/manual-test-fish-audio.ts` with native German and English voice sets

### Changed
- **TTSProvider enum:** Added `FISH_AUDIO = 'fish_audio'`
- **ProviderOptions union:** Includes `FishAudioProviderOptions`

## [0.4.1] - 2026-01-16

### Fixed
- **Google Cloud TTS Region Override:** Region from `providerOptions` is now correctly applied
  - Previously, `providerOptions.region` was ignored and only the config/environment region was used
  - Now, per-request region override works as documented
  - Example: `providerOptions: { region: 'europe-west3' }` correctly uses Frankfurt endpoint
- **Client Caching per Region:** TTS clients are now cached per region
  - Enables efficient runtime region switching without recreating clients
  - Each unique region gets its own cached client instance

### Added
- **New Unit Tests:** 2 tests for region override and per-region client caching

## [0.4.0] - 2026-01-16

### Added
- **Google Cloud Text-to-Speech Provider:** Full DSGVO/GDPR-compliant TTS integration
  - EU regional endpoints (`eu-texttospeech.googleapis.com`, `europe-west3` for Frankfurt)
  - Service Account authentication via `GOOGLE_APPLICATION_CREDENTIALS`
  - Support for Neural2, WaveNet, Standard, Studio, and Chirp3-HD voices
  - Audio configuration: MP3, WAV, Opus formats with speed, pitch, and volume controls
  - Effects profiles for device-optimized audio (headphone, speaker, etc.)
  - Automatic language code extraction from voice IDs
- **New Environment Variables:**
  - `GOOGLE_APPLICATION_CREDENTIALS` - Path to Service Account JSON
  - `GOOGLE_CLOUD_PROJECT` - Google Cloud Project ID
  - `GOOGLE_TTS_REGION` - Region for data residency (default: `eu`)
- **Voice Listing Script:** `scripts/list-google-voices.ts` to query available voices
- **Manual Test Script:** `scripts/manual-test-google-cloud-tts.ts` for verification
- **Comprehensive Tests:** 71 new tests for Google Cloud TTS (unit + integration)

### Changed
- **Exports:** Added `GoogleCloudTTSProvider`, `GoogleCloudTTSRegion`, `GoogleCloudTTSConfig` to public API
- **Dependencies:** Added `@google-cloud/text-to-speech` SDK

### Documentation
- Updated README with Google Cloud TTS usage examples
- Added German voice reference (Neural2-G/H, WaveNet-G/H, Studio-B/C, Chirp3-HD)

## [0.3.0] - 2026-01-08

### Added
- **EdenAI OpenAI Voice Selection:** Support for specific OpenAI voice selection via EdenAI
  - New `settings` field in `EdenAIProviderOptions` for provider-specific voice/model selection
  - Format: `settings: { openai: 'de_nova' }` to select specific voices
  - Supports all 6 OpenAI voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`
  - Supports all 57 languages via language prefix (e.g., `de_nova`, `en_alloy`, `fr_shimmer`)

### Changed
- **EdenAI Provider:** Updated request building to use `settings` object for voice selection
  - `settings` field now correctly passed to EdenAI API for provider-specific configuration
  - `model` field deprecated in favor of `settings` (still works for backwards compatibility)

### Documentation
- Updated README with EdenAI + OpenAI voice selection examples
- Updated PROVIDER_PARAMETERS.md with EdenAI settings documentation

## [0.2.0] - 2026-01-06

### Fixed
- **EdenAI Provider:** Corrected API request payload format
  - `providers` field now correctly placed at top level (was incorrectly in `settings`)
  - `option` field now defaults to `'FEMALE'` (EdenAI requires this field)
  - Removed unsupported fields from `settings`: `speaking_rate`, `speaking_pitch`, `speaking_volume`, `audio_format`, `sampling_rate`
  - Added new `option` and `model` fields to `EdenAIProviderOptions`

### Added
- **E2E Tests:** Real API integration tests for EdenAI provider (`tests/e2e/`)
- **Test Scripts:** New npm scripts for targeted testing
  - `npm run test:unit` - Run unit tests only
  - `npm run test:integration` - Run integration tests only
  - `npm run test:e2e` - Run E2E tests (requires `EDENAI_API_KEY`)

### Changed
- **Test Structure:** Reorganized tests into centralized `tests/` directory
  - `tests/unit/` - Unit tests (mocked)
  - `tests/integration/` - Integration tests (mocked)
  - `tests/e2e/` - End-to-end tests (real API calls)
- **EdenAI Options:** Removed deprecated options that were never functional
  - `speaking_rate`, `speaking_pitch`, `speaking_volume` - Not supported by EdenAI API
  - `audio_format`, `sampling_rate` - Not supported in settings object

### Breaking Changes
- **EdenAI `providerOptions`:** The following options are no longer passed to the API:
  - `speaking_rate` - Use `option: 'FEMALE'` or `option: 'MALE'` instead
  - `speaking_pitch`, `speaking_volume` - Not supported by EdenAI
  - `audio_format`, `sampling_rate` - Configure via `audio` parameter instead

## [0.1.1] - 2026-01-05

### Added
- **Pluggable Logger Interface:**
  - `setLogger()` - Replace default console logger with custom implementation (Winston, Pino, etc.)
  - `silentLogger` - Disable all logging output
  - `setLogLevel()` / `getLogLevel()` - Control log verbosity (debug, info, warn, error)
  - `resetLogger()` - Restore default console logger
- **Documentation:**
  - `CONTRIBUTING.md` - Contribution guidelines for developers

### Fixed
- **EdenAI Provider:** Corrected API request payload structure (`settings` object)
- **Package Exports:** Added root `src/index.ts` for proper module resolution

### Changed
- **Coverage Threshold:** Increased from 80% to 90% (lines/functions/statements), 85% (branches)

## [0.1.0] - 2026-01-01

### Added
- **Core Architecture:**
  - Provider-agnostic `TTSService` orchestrator.
  - Abstract `BaseTTSProvider` for standardized provider implementation.
  - Comprehensive TypeScript types for requests, responses, and options.
- **Providers:**
  - **Azure Speech Services:** Full support for neural voices, styles, and emotions.
  - **EdenAI:** Support for multi-provider aggregation (access to Google, OpenAI, etc. via EdenAI).
- **Features:**
  - **Character Counting:** Accurate billing estimation logic.
  - **Audio Formats:** Support for MP3, WAV, and Opus.
  - **SSML Generation:** Automatic SSML construction for Azure with prosody and style support.
- **Infrastructure:**
  - Configuration management via `tts.config.ts`.
  - Full test suite with Jest (Unit & Integration tests).
  - Manual test scripts for verification.
  - ESLint and Prettier configuration.
