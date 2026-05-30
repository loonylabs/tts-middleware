<div align="center">

# TTS Middleware

*Provider-agnostic Text-to-Speech middleware with **GDPR compliance** support. Currently supports Azure Speech Services (incl. Dragon HD), Cartesia Sonic, EdenAI, Google Cloud TTS, ElevenLabs, Fish Audio, Inworld AI, and Vertex AI TTS. Features EU data residency via Azure, Cartesia, and Google Cloud, pluggable logging, character-based billing, and comprehensive error handling.*

<!-- Horizontal Badge Navigation Bar -->
[![npm version](https://img.shields.io/npm/v/@loonylabs/tts-middleware.svg?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/@loonylabs/tts-middleware)
[![npm downloads](https://img.shields.io/npm/dm/@loonylabs/tts-middleware.svg?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/@loonylabs/tts-middleware)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg?style=for-the-badge&logo=typescript&logoColor=white)](#features)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](#prerequisites)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge&logo=opensource&logoColor=white)](#license)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/loonylabs-dev/tts-middleware)

</div>

<!-- Table of Contents -->
<details>
<summary><strong>Table of Contents</strong></summary>

- [Features](#features)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Providers & Models](#providers--models)
- [GDPR / Compliance](#gdpr--compliance)
- [API Reference](#api-reference)
- [Advanced Features](#advanced-features)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)
- [Links](#links)

</details>

---

## Features

- **Multi-Provider Architecture**: Unified API for all TTS providers
  - **Azure Speech Services** (MVP): Neural voices + **Dragon HD / HD Omni** (LLM-based, emotion/style/temperature), EU regions
  - **Cartesia Sonic**: Sonic 3/3.5 high-quality low-latency voices, **EU data residency by default**, sentence/paragraph pause control
  - **EdenAI**: Aggregator with access to Google, OpenAI, Amazon, IBM, ElevenLabs
  - **Google Cloud TTS**: Neural2, WaveNet, Studio voices with EU data residency
  - **ElevenLabs**: Eleven v3 / multilingual v2, native API (test/admin only — benchmark)
  - **Fish Audio**: S1 model with 13 languages & 64+ emotions (test/admin only)
  - **Inworld AI**: TTS 1.5 Max/Mini with 15 languages & voice cloning (test/admin only)
  - **Vertex AI TTS**: Gemini Flash/Pro models with 30 voices, 90+ languages & style prompts (test/admin only)
  - **Ready for:** OpenAI, Deepgram (interfaces prepared)
- **GDPR/DSGVO Compliance**: Built-in EU region support for Azure, Cartesia, and Google Cloud
- **SSML Abstraction**: Auto-generates provider-specific SSML from simple JSON options
- **Character Billing**: Accurate character counting for cost calculation
- **Pluggable Logger**: Bring your own logger (Winston, Pino, etc.) or use the built-in console logger
- **TypeScript First**: Full type safety with comprehensive interfaces
- **Retry with Backoff**: Automatic retry for transient errors (429, 5xx, timeouts) with exponential backoff and jitter
- **Error Handling**: Typed error classes (InvalidConfig, QuotaExceeded, SynthesisFailed, etc.)
- **Zero Lock-in**: Switch providers without changing your application code

## Quick Start

### Installation

Install from npm:

```bash
npm install @loonylabs/tts-middleware
```

Or install directly from GitHub:

```bash
npm install github:loonylabs-dev/tts-middleware
```

### Basic Usage

```typescript
import { ttsService, TTSProvider } from '@loonylabs/tts-middleware';
import fs from 'fs';

const response = await ttsService.synthesize({
  text: 'Hallo Welt! Dies ist ein Test.',
  voice: { id: 'de-DE-KatjaNeural' },
  audio: { format: 'mp3', speed: 1.0 },
});

fs.writeFileSync('output.mp3', response.audio);
console.log('Characters billed:', response.billing.characters);
console.log('Audio length:', response.metadata.audioDuration, 'ms');
```

<details>
<summary><strong>Switching Providers</strong></summary>

```typescript
// Azure with emotion
const azure = await ttsService.synthesize({
  text: 'Great news!',
  provider: TTSProvider.AZURE,
  voice: { id: 'en-US-JennyNeural' },
  providerOptions: { emotion: 'cheerful', style: 'chat' },
});

// Azure Dragon HD (EU-resident, LLM-based, best dialog emphasis)
const azureHd = await ttsService.synthesize({
  text: 'Behutsam öffnete Leah das Fenster.',
  provider: TTSProvider.AZURE,
  voice: { id: 'de-DE-Seraphina:DragonHDLatestNeural' },
  providerOptions: { temperature: 0.8 }, // HD voices: temperature, not prosody
});

// Cartesia Sonic (EU data residency by default, narration-tuned)
const cartesia = await ttsService.synthesize({
  text: 'Behutsam öffnete Leah das Fenster.\n\n"Lumi? Was ist passiert?"',
  provider: TTSProvider.CARTESIA,
  voice: { id: '38aabb6a-f52b-4fb0-a3d1-988518f4dc06' },
  audio: { format: 'mp3', sampleRate: 44100, speed: 0.9 },
  providerOptions: { language: 'de', sentencePauseMs: 300, paragraphPauseMs: 700 },
});

// Google Cloud TTS (EU-compliant)
const google = await ttsService.synthesize({
  text: 'Hallo aus Frankfurt!',
  provider: TTSProvider.GOOGLE,
  voice: { id: 'de-DE-Neural2-C' },
  providerOptions: { region: 'europe-west3' },
});

// EdenAI (OpenAI voices via aggregator)
const edenai = await ttsService.synthesize({
  text: 'Hello World',
  provider: TTSProvider.EDENAI,
  voice: { id: 'en-US' },
  providerOptions: { provider: 'openai', settings: { openai: 'en_nova' } },
});

// EdenAI (ElevenLabs with specific voice)
const elevenlabs = await ttsService.synthesize({
  text: 'Hallo, willkommen!',
  provider: TTSProvider.EDENAI,
  voice: { id: 'de' },
  providerOptions: { provider: 'elevenlabs', voice_id: 'Aria' },
});

// Fish Audio (test/admin only)
const fish = await ttsService.synthesize({
  text: '(excited) Das ist fantastisch!',
  provider: TTSProvider.FISH_AUDIO,
  voice: { id: '90042f762dbf49baa2e7776d011eee6b' },
  providerOptions: { model: 's1' },
});

// Inworld AI (test/admin only)
const inworld = await ttsService.synthesize({
  text: 'Hello from Inworld AI!',
  provider: TTSProvider.INWORLD,
  voice: { id: 'Ashley' },
  providerOptions: { modelId: 'inworld-tts-1.5-max', temperature: 1.1 },
});

// Vertex AI TTS (test/admin only)
const vertexAI = await ttsService.synthesize({
  text: 'Have a wonderful day!',
  provider: TTSProvider.VERTEX_AI,
  voice: { id: 'Kore' },
  providerOptions: { model: 'gemini-2.5-flash-preview-tts', stylePrompt: 'Say cheerfully:' },
});
```

</details>

<details>
<summary><strong>Using OpenAI Voices via EdenAI</strong></summary>

```typescript
// German with OpenAI "nova" voice (female)
const response = await ttsService.synthesize({
  text: 'Hallo Welt! Das ist ein Test.',
  provider: TTSProvider.EDENAI,
  voice: { id: 'de' },
  providerOptions: {
    provider: 'openai',
    settings: { openai: 'de_nova' },
  },
});
```

**Available OpenAI Voices:**

| Voice | Character |
|-------|-----------|
| `alloy` | Neutral |
| `echo` | Male |
| `fable` | Expressive |
| `onyx` | Male, deep |
| `nova` | Female |
| `shimmer` | Female, warm |

Format: `{language}_{voice}` (e.g., `de_nova`, `en_alloy`, `fr_shimmer`)

</details>

<details>
<summary><strong>Using Google Cloud TTS (GDPR/DSGVO-Compliant)</strong></summary>

```typescript
// With Frankfurt endpoint for maximum DSGVO compliance
const response = await ttsService.synthesize({
  text: 'Guten Tag, wie geht es Ihnen?',
  provider: TTSProvider.GOOGLE,
  voice: { id: 'de-DE-Neural2-G' },
  audio: { format: 'mp3' },
  providerOptions: {
    region: 'europe-west3',
    effectsProfileId: ['headphone-class-device'],
  },
});
```

**Available German Voices:**

| Type | Female | Male | Quality |
|------|--------|------|---------|
| Neural2 | `de-DE-Neural2-G` | `de-DE-Neural2-H` | Best value |
| WaveNet | `de-DE-Wavenet-G` | `de-DE-Wavenet-H` | Good |
| Studio | `de-DE-Studio-C` | `de-DE-Studio-B` | Premium |
| Chirp3-HD | `Aoede`, `Kore`, ... | `Fenrir`, `Puck`, ... | Newest |

</details>

## Prerequisites

<details>
<summary><strong>Required Dependencies</strong></summary>

- **Node.js** 18+
- **TypeScript** 5.3+
- Provider credentials (API keys / service accounts)

</details>

<details>
<summary><strong>ffmpeg (for Vertex AI TTS MP3 output)</strong></summary>

The Vertex AI TTS provider outputs raw PCM audio which is converted to MP3 using ffmpeg.
The provider resolves the ffmpeg binary automatically using this priority chain:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | `ffmpegPath` in config | `new VertexAITTSProvider({ ffmpegPath: '/usr/bin/ffmpeg' })` |
| 2 | `FFMPEG_PATH` env var | `FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg` |
| 3 | `ffmpeg-static` npm package | `npm install ffmpeg-static` (recommended for containers) |
| 4 | System `ffmpeg` in PATH | `apt install ffmpeg` or `brew install ffmpeg` |
| 5 | WAV fallback | No ffmpeg needed — outputs WAV instead of MP3 |

**Recommended for containerized deployments** (Railway, Docker, etc.):

```bash
npm install ffmpeg-static
```

This bundles a static ffmpeg binary with your app — no system package needed.

</details>

## Configuration

<details>
<summary><strong>Environment Setup</strong></summary>

Create a `.env` file in your project root:

```env
# Default provider
TTS_DEFAULT_PROVIDER=azure

# Azure Speech Services (EU-compliant)
AZURE_SPEECH_KEY=your-azure-speech-key
# Use westeurope for Dragon HD voices (germanywestcentral has no HD voices)
AZURE_SPEECH_REGION=westeurope

# Cartesia Sonic (EU data residency by default)
CARTESIA_API_KEY=sk_car_your-key
# Optional overridable narration defaults (per-request options always win):
# CARTESIA_DEFAULT_SPEED=0.9
# CARTESIA_DEFAULT_SENTENCE_PAUSE_MS=300
# CARTESIA_DEFAULT_PARAGRAPH_PAUSE_MS=700

# EdenAI (multi-provider aggregator)
EDENAI_API_KEY=your-edenai-api-key

# ElevenLabs (benchmark/test-only – no EU data residency below Enterprise)
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Google Cloud TTS (EU-compliant)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_TTS_REGION=eu

# Fish Audio (test/admin only – no EU data residency)
FISH_AUDIO_API_KEY=your-fish-audio-api-key

# Inworld AI (test/admin only – no EU data residency)
INWORLD_API_KEY=your-inworld-api-key

# Vertex AI TTS (test/admin only – no EU data residency)
# Reuses GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_CLOUD_PROJECT from above
VERTEX_AI_TTS_REGION=us-central1

# Logging
TTS_DEBUG=false
LOG_LEVEL=info
```

</details>

## Providers & Models

### Azure Speech Services (MVP)

| Feature | Details |
|---------|---------|
| **Voices** | 180+ neural voices, incl. **Dragon HD** & **Dragon HD Omni** (LLM-based) |
| **Languages** | 100+ locales |
| **Emotions** | cheerful, sad, angry, friendly, etc. (Omni: free-text styles) |
| **Styles** | chat, newscast, customerservice, etc. |
| **HD control** | `temperature` (HD); `topP`/`cfgScale` (Omni). No `prosody` on HD voices |
| **Audio** | MP3, WAV, Opus |
| **EU Region** | West Europe (Dragon HD: eastus / westeurope / southeastasia) |
| **Pricing** | ~$16/1M chars (standard), ~$22/1M chars (HD) |

### Google Cloud TTS

| Feature | Details |
|---------|---------|
| **Voices** | Neural2, WaveNet, Standard, Studio, Chirp3-HD |
| **Languages** | 40+ languages |
| **Audio** | MP3, WAV, Opus |
| **EU Regions** | eu, europe-west1 through europe-west9 |
| **Pricing** | ~$16/1M characters |

### Cartesia Sonic

| Feature | Details |
|---------|---------|
| **Models** | sonic-3.5 (default), sonic-3, sonic-latest |
| **Languages** | German + many others (`language` option, omit to auto-detect) |
| **Voices** | Referenced by voice ID (UUID); list via `scripts/list-cartesia-voices.ts` |
| **Control** | `audio.speed` (0.6–1.5), `sentencePauseMs` / `paragraphPauseMs` (insert `<break>`), `emotion` |
| **Defaults** | Overridable via `CARTESIA_DEFAULT_*` env vars; per-request options always win |
| **Audio** | MP3 (up to 44.1 kHz), WAV |
| **Pricing** | ~$30/1M characters |
| **EU Compliance** | ✅ EU data residency by default, GDPR DPA |

### EdenAI (Aggregator)

| Feature | Details |
|---------|---------|
| **Providers** | Google, OpenAI, Amazon, IBM, Microsoft, ElevenLabs |
| **Voices** | Depends on underlying provider |
| **OpenAI Voices** | alloy, echo, fable, onyx, nova, shimmer (57 languages) |
| **ElevenLabs Voices** | Aria, Roger, Sarah, Laura, Charlie, George (via `voice_id`) |

### ElevenLabs (Test/Admin Only)

| Feature | Details |
|---------|---------|
| **Models** | eleven_v3 (most expressive), eleven_multilingual_v2, eleven_flash_v2_5 |
| **Voices** | 500+ voices (by voice ID); cloning available; list via `scripts/list-elevenlabs-voices.ts` |
| **Control** | `model_id`, `language_code`, `stability`, `similarity_boost`, `style`, `speaker_boost` |
| **Audio** | MP3 (up to 44.1 kHz), Opus, PCM/WAV via `outputFormat` |
| **Pricing** | ~$150–200/1M characters (plan-dependent) |
| **Plan note** | Free API users **cannot** use library/premade voices (HTTP 402) — requires a paid plan |
| **EU Compliance** | ❌ No EU data residency below Enterprise — benchmark/test-only |

### Fish Audio (Test/Admin Only)

| Feature | Details |
|---------|---------|
| **Models** | S1 (flagship, 4B params), speech-1.6, speech-1.5 |
| **Languages** | 13 with auto-detection (EN, DE, FR, ES, JA, ZH, KO, AR, RU, NL, IT, PL, PT) |
| **Emotions** | 64+ expressions via text markers: `(excited)`, `(sad)`, `(whispering)` |
| **Voices** | Community library + custom voice cloning |
| **Audio** | MP3, WAV, PCM, Opus |
| **Pricing** | $15/1M UTF-8 bytes |
| **EU Compliance** | No data residency guarantees |

### Inworld AI (Test/Admin Only)

| Feature | Details |
|---------|---------|
| **Models** | TTS 1.5 Max (~200ms latency), TTS 1.5 Mini (~120ms latency) |
| **Languages** | 15 languages |
| **Voices** | Instant voice cloning + professional voice cloning |
| **Audio** | MP3, LINEAR16, OGG_OPUS, ALAW, MULAW, FLAC |
| **Controls** | temperature, speakingRate, timestamps, text normalization |
| **Pricing** | $10/1M chars (Max), $5/1M chars (Mini) |
| **EU Compliance** | No data residency guarantees |

### Vertex AI TTS (Test/Admin Only)

| Feature | Details |
|---------|---------|
| **Models** | `gemini-2.5-flash-preview-tts` (budget, fast), `gemini-2.5-pro-preview-tts` (premium), `gemini-3.1-flash-tts-preview` (audio tags + multi-speaker) |
| **Languages** | 90+ with auto-detection (70+ for Gemini 3.1) |
| **Voices** | 30 multilingual: Kore, Puck, Charon, Zephyr, Fenrir, Sulafat, Aoede, etc. |
| **Style Control** | Natural language `stylePrompt` + inline audio tags (Gemini 3.1): `[sigh]`, `[whispering]`, `[laughing]`, `[short pause]`, … |
| **Dialog Mode** | `synthesizeDialog()` for multi-segment, multi-speaker audio in a single call — aggregated billing, segment-level style prompts. **Max 2 distinct speakers per segment** (Vertex AI limit) — split scenes with a narrator into alternating solo/duo segments |
| **Audio** | MP3 (via ffmpeg — auto-detected from `ffmpeg-static`, `FFMPEG_PATH`, config, or system PATH), WAV (fallback) |
| **Auth** | Service Account OAuth2 (reuses `GOOGLE_APPLICATION_CREDENTIALS`) |
| **Region** | `VERTEX_AI_TTS_REGION` env var (default: `us-central1`) |
| **Limits** | 4 KB text + 4 KB stylePrompt, 8 KB combined per request (enforced client-side with typed `PayloadTooLargeError`) |
| **Pricing** | $0.50/M input + $10/M audio output tokens (Flash 2.5); $1.00/M + $20/M (Pro 2.5, Flash 3.1) |
| **EU Compliance** | Preview models currently `us-central1` only — no EU data residency yet |

#### Dialog Mode example (Gemini 3.1 Flash TTS)

Synthesize a multi-speaker dialog with per-segment style direction and inline
audio tags — one call, one audio file, aggregated billing:

```typescript
import { VertexAITTSProvider } from '@loonylabs/tts-middleware';

const provider = new VertexAITTSProvider();

const result = await provider.synthesizeDialog({
  speakers: [
    { speaker: 'Narrator', voice: 'Charon' },
    { speaker: 'Alice',    voice: 'Aoede'  },
    { speaker: 'Bob',      voice: 'Puck'   },
  ],
  segments: [
    {
      stylePrompt: 'Calm audiobook narration',
      turns: [
        { speaker: 'Narrator', text: 'The tavern was loud that night.' },
      ],
    },
    {
      stylePrompt: 'A heated argument between two old friends',
      turns: [
        { speaker: 'Alice', text: '[shouting] You lied to me!' },
        { speaker: 'Bob',   text: '[sigh] [short pause] Calm down, would you?' },
        { speaker: 'Alice', text: '[whispering] Never again.' },
      ],
    },
    {
      stylePrompt: 'Calm audiobook narration',
      turns: [
        { speaker: 'Narrator', text: 'She stood up and left.' },
      ],
    },
  ],
  voice: { languageCode: 'en-US' },
  audio: { format: 'mp3' },
  providerOptions: { model: 'gemini-3.1-flash-tts-preview', temperature: 1.2 },
});

// result.audio           — single concatenated MP3 buffer
// result.billing.characters — total chars sent to Google across ALL segments
```

**Billing:** `result.billing.characters` is the sum of every turn text
(including the `Speaker: ` prefix sent to Google) plus every segment's
`stylePrompt`. Consumer apps can bill customers for the exact amount that
hit Google, not just the first segment.

**Payload limits:** Each segment must stay under 4 KB of text and 8 KB
combined (text + stylePrompt). Exceeding any limit throws
`PayloadTooLargeError` with `segmentIndex` *before* the API call — no
billing for rejected requests.

**Max 2 speakers per segment:** Vertex AI's multi-speaker TTS requires
exactly 2 voices in each `multiSpeakerVoiceConfig`. Scenes with a narrator
plus two dialog speakers (3 voices total) must therefore be split into
alternating segments:

```typescript
segments: [
  { stylePrompt: 'Calm narrator', turns: [ { speaker: 'Narrator', text: '…' } ] },          // 1 voice → single-voice request
  { stylePrompt: 'Friends arguing', turns: [ { speaker: 'Alice', … }, { speaker: 'Bob', … } ] }, // 2 voices → multi-speaker request
  { stylePrompt: 'Narrator outro',  turns: [ { speaker: 'Narrator', text: '…' } ] },          // 1 voice again
]
```

The provider auto-detects 1 vs 2 distinct speakers per segment and picks
the correct request shape (`prebuiltVoiceConfig` vs `multiSpeakerVoiceConfig`).
Segments with >2 distinct speakers throw `InvalidConfigError` with guidance
to split the segment.

**Debugging dialog requests:** Set `DEBUG_TTS_REQUESTS=true` to have one
Markdown file written per segment under `logs/tts/requests/`, capturing the
exact request body, selected shape, speaker→voice mapping, HTTP status, and
timing. See [Request Debug Logging](#advanced-features) below.

### Dialog as a provider capability

Dialog synthesis is a **capability** — providers that support it implement the
`SupportsDialog` interface and expose a `dialogCapabilities` descriptor. Use the
unified `ttsService.synthesizeDialog()` entry point, which routes to the
requested provider and throws a clear error if it is not dialog-capable.

```typescript
import { ttsService, TTSProvider, supportsDialog } from '@loonylabs/tts-middleware';

// Inspect capabilities before building a request:
const provider = ttsService.getProvider(TTSProvider.ELEVENLABS);
if (supportsDialog(provider)) {
  console.log(provider.dialogCapabilities.maxSpeakers); // 10
}

// Unified entry point (routes by request.provider, falls back to default):
const result = await ttsService.synthesizeDialog({
  provider: TTSProvider.ELEVENLABS,
  speakers: [
    { speaker: 'Narrator', voice: 'JBFqnCBsd6RMkjVDRZzb' }, // ElevenLabs voice IDs
    { speaker: 'Leah',     voice: 'EXAVITQu4vr4xnSDxMaL' },
    { speaker: 'Lumi',     voice: 'FGY2WhTYpPnrIDTdsKH5' },
  ],
  segments: [
    { turns: [
      { speaker: 'Narrator', text: 'Behutsam öffnete Leah das Fenster.' },
      { speaker: 'Leah',     text: '[whispers] Lumi? Was ist passiert?' },
      { speaker: 'Lumi',     text: '[giggles] Der Himmel wartet auf uns!' },
    ] },
  ],
  audio: { format: 'mp3' },
  providerOptions: { model_id: 'eleven_v3', language_code: 'de' },
});
```

**Dialog capability matrix:**

| Provider | Max speakers | Per-request limit | Style prompt | Audio tags | EU |
|----------|--------------|-------------------|--------------|-----------|----|
| **ElevenLabs** (Text to Dialogue, `eleven_v3`) | **10** | ~2000 chars (auto-chunked) | ❌ (use inline tags) | ✅ `[whispers]`, `[laughs]`, … | ❌ benchmark-only |
| **Vertex AI / Gemini** (`gemini-3.1-flash-tts-preview`) | 2 per segment | 8 KB combined/segment | ✅ per segment | ✅ `[sigh]`, `[short pause]`, … | ❌ preview, `us-central1` |

ElevenLabs flattens all turns into one Text-to-Dialogue call (best cross-speaker
coherence) and only splits when the character budget is exceeded; Vertex runs one
request per segment and concatenates. Both return a single audio buffer with
billing aggregated across the whole dialog.

## GDPR / Compliance

### Provider Compliance Overview

| Provider | DPA | GDPR | EU Data Residency | Notes |
|----------|-----|------|-------------------|-------|
| **Azure** | Yes | Yes | Yes (West Europe) | Recommended for EU; Dragon HD available |
| **Cartesia** | Yes | Yes | Yes (EU by default) | High quality, low latency |
| **Google Cloud** | Yes | Yes | Yes (EU multi-region) | Full EU endpoint support |
| **EdenAI** | Yes | Depends* | Depends* | Depends on underlying provider |
| **ElevenLabs** | Enterprise only | Enterprise only | Enterprise only | Benchmark/test-only |
| **Fish Audio** | No | No | No | Test/admin only |
| **Inworld AI** | No | No | No | Test/admin only |
| **Vertex AI TTS** | Yes (Vertex DPA) | Partial | No* | Test/admin only |

*EdenAI is an aggregator - compliance depends on the underlying provider.

\*Vertex AI TTS: DPA available, no model training on customer data — but preview models are currently `us-central1` only (no EU data residency until GA with EU region support).

## API Reference

### TTSService

```typescript
class TTSService {
  synthesize(request: TTSSynthesizeRequest): Promise<TTSResponse>;
  getProvider(provider: TTSProvider): BaseTTSProvider;
  setDefaultProvider(provider: TTSProvider): void;
  getAvailableProviders(): TTSProvider[];
  isProviderAvailable(provider: TTSProvider): boolean;
}
```

### TTSSynthesizeRequest

```typescript
interface TTSSynthesizeRequest {
  text: string;
  provider?: TTSProvider;
  voice: { id: string };
  audio?: {
    format?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac';
    speed?: number;        // 0.5 - 2.0
    pitch?: number;        // -20 to 20
    volumeGainDb?: number; // -96 to 16
    sampleRate?: number;
  };
  providerOptions?: Record<string, unknown>;
  retry?: boolean | RetryConfig; // default: true
}
```

### TTSResponse

```typescript
interface TTSResponse {
  audio: Buffer;
  metadata: {
    provider: string;
    voice: string;
    duration: number;        // Synthesis time (API call duration) in ms
    audioDuration?: number;  // Actual audio length in ms (MP3 only)
    audioFormat: string;
    sampleRate: number;
  };
  billing: {
    characters: number;
    tokensUsed?: number;
  };
}
```

## Advanced Features

<details>
<summary><strong>Pluggable Logger</strong></summary>

Replace the default console logger with your own:

```typescript
import { setLogger, silentLogger, setLogLevel } from '@loonylabs/tts-middleware';

// Use Winston, Pino, or any custom logger
setLogger({
  info: (msg, meta) => winston.info(msg, meta),
  warn: (msg, meta) => winston.warn(msg, meta),
  error: (msg, meta) => winston.error(msg, meta),
  debug: (msg, meta) => winston.debug(msg, meta),
});

// Disable all logging
setLogger(silentLogger);

// Control log level
setLogLevel('warn');
```

</details>

<details>
<summary><strong>Request Debug Logging</strong></summary>

For debugging, you can have the middleware write one Markdown file per upstream
TTS API call (e.g. per Google Vertex AI `generateContent` invocation). This is
especially useful for the dialog mode: each segment is one Google request, and
the log shows the exact request body that was sent — so you can verify the
auto-selected `prebuiltVoiceConfig` vs `multiSpeakerVoiceConfig` shape,
speaker→voice mapping, style prompt, and temperature.

```bash
# Enable per-request debug logs
export DEBUG_TTS_REQUESTS=true

# Optional: override log directory (default: <cwd>/logs/tts/requests)
export TTS_REQUEST_LOG_DIR=/tmp/my-tts-logs
```

Each call produces a file named like:

```
2026-04-17T14-30-00-000Z_vertex-ai_dialog-segment_seg0_multi-speaker.md
```

Contents include: timestamp, model, region, endpoint URL, HTTP status, duration,
dialog context (segment index, request shape, speaker→voice mapping), the full
request body (no truncation), response metadata (mime type, audio byte count,
candidate count), and any error body.

**What is *not* logged:** the audio bytes themselves — only metadata — so logs
stay small and safe to inspect.

When the env var is unset (or not truthy), logging is a complete no-op with no
runtime cost.

The logging hook lives on `BaseTTSProvider.logRequest()`, so any provider can
opt in. Currently wired up for `VertexAITTSProvider` (`synthesize()` and
`synthesizeDialog()`); other providers log on demand when they add the hook.

</details>

<details>
<summary><strong>Retry with Exponential Backoff</strong></summary>

All provider calls are automatically retried on transient errors (429 rate limit, 5xx server errors, timeouts). Non-retryable errors (401, 403, 400) are thrown immediately.

```typescript
// Default: retry enabled (3 retries, 1s initial delay, 2x multiplier)
const response = await ttsService.synthesize({
  text: 'Hello World',
  voice: { id: 'en-US-JennyNeural' },
});

// Disable retry
const response = await ttsService.synthesize({
  text: 'Hello World',
  voice: { id: 'en-US-JennyNeural' },
  retry: false,
});

// Custom retry config
const response = await ttsService.synthesize({
  text: 'Hello World',
  voice: { id: 'en-US-JennyNeural' },
  retry: {
    maxRetries: 5,
    initialDelayMs: 500,
    multiplier: 2,
    maxDelayMs: 10000,
  },
});
```

| Error Type | Retried? | Examples |
|------------|----------|----------|
| Rate limit | Yes | 429 Too Many Requests |
| Server error | Yes | 500, 502, 503, 504 |
| Timeout | Yes | Request timeout, ECONNREFUSED, ECONNRESET |
| Auth error | No | 401, 403 |
| Bad request | No | 400, invalid voice |
| Unknown | No | SynthesisFailedError |

</details>

<details>
<summary><strong>Error Handling</strong></summary>

Typed error classes for precise error handling:

```typescript
import {
  TTSError,
  InvalidConfigError,
  InvalidVoiceError,
  QuotaExceededError,
  ProviderUnavailableError,
  SynthesisFailedError,
  NetworkError,
} from '@loonylabs/tts-middleware';

try {
  const result = await ttsService.synthesize({ text: 'test', voice: { id: 'en-US' } });
} catch (error) {
  if (error instanceof QuotaExceededError) {
    console.log('Rate limit hit, try again later');
  } else if (error instanceof InvalidVoiceError) {
    console.log('Voice not found');
  } else if (error instanceof TTSError) {
    console.log(`TTS Error [${error.code}]: ${error.message}`);
  }
}
```

</details>

<details>
<summary><strong>Billing & Cost Calculation</strong></summary>

The middleware returns character counts for cost calculation:

```typescript
const PROVIDER_RATES = {
  [TTSProvider.AZURE]: 16 / 1_000_000,
  [TTSProvider.GOOGLE]: 16 / 1_000_000,
  [TTSProvider.FISH_AUDIO]: 15 / 1_000_000,
  [TTSProvider.INWORLD]: 10 / 1_000_000, // Max model; Mini: $5/1M
};

const response = await ttsService.synthesize({ /* ... */ });
const costUSD = response.billing.characters * PROVIDER_RATES[TTSProvider.AZURE];
```

</details>

## Architecture

```mermaid
graph TD
    App[Your Application] -->|synthesize()| Service[TTSService]
    Service -->|getProvider()| Registry{Provider Registry}

    Registry -->|Select| Azure[AzureProvider]
    Registry -->|Select| Cartesia[CartesiaProvider]
    Registry -->|Select| GCloud[GoogleCloudTTSProvider]
    Registry -->|Select| Eden[EdenAIProvider]
    Registry -->|Select| Eleven[ElevenLabsProvider]
    Registry -->|Select| Fish[FishAudioProvider]
    Registry -->|Select| Inworld[InworldProvider]
    Registry -->|Select| VertexAI[VertexAITTSProvider]

    Azure -->|SSML/SDK| AzureAPI[Azure Speech API]
    Cartesia -->|REST| CartesiaAPI[Cartesia Sonic API]
    GCloud -->|gRPC/SDK| GoogleAPI[Google Cloud TTS API]
    Eden -->|REST| EdenAPI[EdenAI API]
    Eleven -->|REST| ElevenAPI[ElevenLabs API]
    Fish -->|REST| FishAPI[Fish Audio API]
    Inworld -->|REST| InworldAPI[Inworld AI API]
    VertexAI -->|REST/OAuth2| VertexAPI[Vertex AI API]

    GoogleAPI -->|EU Endpoint| EU[eu-texttospeech.googleapis.com]
    EdenAPI -.-> OpenAI[OpenAI TTS]
    EdenAPI -.-> Amazon[Amazon Polly]
```

## Testing

```bash
# Run all tests (600+ tests, >90% coverage)
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage

# Manual test scripts
npx ts-node scripts/manual-test-edenai.ts
npx ts-node scripts/manual-test-google-cloud-tts.ts
npx ts-node scripts/manual-test-fish-audio.ts [en] [de]
npx ts-node scripts/manual-test-inworld.ts [en] [de] [mini]
npx ts-node scripts/manual-test-vertex-ai.ts [en] [de] [pro] [style]

# List available Google Cloud voices
npx ts-node scripts/list-google-voices.ts de-DE
```

## Contributing

We welcome contributions! Please ensure:

1. **Tests:** Add tests for new features
2. **Linting:** Run `npm run lint` before committing
3. **Conventions:** Follow the existing project structure

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- [NPM Package](https://www.npmjs.com/package/@loonylabs/tts-middleware)
- [Issues](https://github.com/loonylabs-dev/tts-middleware/issues)
- [CHANGELOG](CHANGELOG.md)

---

<div align="center">

**Made with care by the LoonyLabs Team**

[![GitHub stars](https://img.shields.io/github/stars/loonylabs-dev/tts-middleware?style=social)](https://github.com/loonylabs-dev/tts-middleware/stargazers)
[![Follow on GitHub](https://img.shields.io/github/followers/loonylabs-dev?style=social&label=Follow)](https://github.com/loonylabs-dev)

</div>
