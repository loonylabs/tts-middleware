# TTS Provider Parameters Matrix

This document shows which parameters are supported by each TTS provider and their implementation status.

## Legend

- ✅ **MVP**: Implemented in current MVP release
- 🔮 **Future**: Typed but not implemented yet
- ❌ **Not Supported**: Provider doesn't support this feature
- ⚠️ **Partial**: Limited support or specific conditions apply

---

## Universal Parameters (All Providers)

These parameters are part of the core `TTSSynthesizeRequest` interface and work across all providers:

| Parameter | Azure (MVP) | OpenAI | ElevenLabs | Google | Deepgram | Fish Audio | Notes |
|-----------|-------------|--------|------------|--------|----------|------------|-------|
| **text** | ✅ | 🔮 | 🔮 | 🔮 | 🔮 | ✅ | Input text to synthesize |
| **voice.id** | ✅ | 🔮 | 🔮 | 🔮 | 🔮 | ✅ | Voice identifier (provider-specific) |
| **audio.format** | ✅ | 🔮 | 🔮 | 🔮 | 🔮 | ✅ | mp3, wav, opus, aac, flac |
| **audio.speed** | ✅ | 🔮 | 🔮 | 🔮 | 🔮 | ✅ | 0.5 - 2.0 multiplier |
| **audio.sampleRate** | ✅ | 🔮 | 🔮 | 🔮 | 🔮 | ✅ | 8000, 16000, 24000, 48000 Hz |
| **audio.pitch** | 🔮 | ❌ | ❌ | 🔮 | ❌ | ❌ | -20 to 20 semitones |
| **audio.volumeGainDb** | 🔮 | ❌ | ❌ | 🔮 | ❌ | ✅ | -96 to 16 dB |

---

## Provider-Specific Parameters

These parameters are passed via `providerOptions: Record<string, unknown>` in the request.

### Azure Speech Services (MVP ✅)

| Parameter | Status | Type | Range/Options | Description |
|-----------|--------|------|---------------|-------------|
| **emotion** | ✅ MVP | string | 'sad', 'angry', 'cheerful', 'friendly', etc. | Emotional tone of speech (standard neural + Omni) |
| **style** | ✅ MVP | string | predefined style **or** free-text (Omni) | Speaking style. Free-text descriptions work on Dragon HD Omni only |
| **temperature** | ✅ | number | 0 - 1 | HD voices only. Output variation (low = stable, high = expressive) |
| **topP** | ✅ | number | 0.3 - 1.0 | Dragon HD Omni only. Nucleus-sampling diversity (`top_p`) |
| **cfgScale** | ✅ | number | 1.0 - 2.0 | Dragon HD Omni only. Classifier-free-guidance (`cfg_scale`) |
| **styleDegree** | 🔮 Future | number | 0.01 - 2.0 | Style intensity |
| **role** | 🔮 Future | string | 'YoungAdultFemale', 'Boy', etc. | Role play scenario |

**Voice tiers (German example)**:
- **Standard Neural** — e.g. `de-DE-KatjaNeural` (baseline)
- **Multilingual Neural** — e.g. `de-DE-SeraphinaMultilingualNeural`
- **Dragon HD** — e.g. `de-DE-Seraphina:DragonHDLatestNeural` (LLM-based; best dialog emphasis; controlled via `temperature` + text semantics — **no** `express-as`/`prosody`)
- **Dragon HD Omni** — e.g. `de-DE-Seraphina:DragonHDOmniLatestNeural` (supports `express-as` incl. free-text `style`, `temperature`/`topP`/`cfgScale`)

> HD/Omni voices reject `<prosody>` — the provider automatically omits it for `:DragonHD*` voices. `audio.speed` therefore has no effect on HD voices.

**Implementation Status**: MVP (emotion, style, HD temperature/topP/cfgScale implemented)
**Billing Model**: Character-based (~$16 per 1M chars standard, ~$22 per 1M chars HD)
**Free Tier**: 500,000 characters/month (HD voices available on F0)
**EU Compliance**: ✅ (West Europe region; Dragon HD requires eastus/westeurope/southeastasia)

---

### EdenAI (✅ Stable)

EdenAI is a multi-provider aggregator. Use `settings` to configure provider-specific options.

| Parameter | Status | Type | Range/Options | Description |
|-----------|--------|------|---------------|-------------|
| **provider** | ✅ Stable | string | 'google', 'openai', 'amazon', 'ibm', 'microsoft', 'elevenlabs' | Underlying TTS provider |
| **settings** | ✅ Stable | object | `{ openai: 'de_nova' }` | Provider-specific voice/model selection |
| **option** | ✅ Stable | string | 'FEMALE', 'MALE' | Gender option (fallback) |
| **voice_id** | ✅ Stable | string | e.g. 'Aria', 'Roger' | Provider-specific voice name (e.g. ElevenLabs) |
| **model** | ⚠️ Deprecated | string | 'Neural', 'Standard' | Use `settings` instead |

**Implementation Status**: Stable
**Billing Model**: Varies by underlying provider
**Free Tier**: Trial credits available

#### OpenAI Voices via EdenAI

Format: `{language_code}_{voice_name}` (e.g., `de_nova`, `en_alloy`)

| Voice | Character | Example (German) | Example (English) |
|-------|-----------|------------------|-------------------|
| `alloy` | Neutral | `de_alloy` | `en_alloy` |
| `echo` | Male | `de_echo` | `en_echo` |
| `fable` | Expressive | `de_fable` | `en_fable` |
| `onyx` | Male, deep | `de_onyx` | `en_onyx` |
| `nova` | Female | `de_nova` | `en_nova` |
| `shimmer` | Female, warm | `de_shimmer` | `en_shimmer` |

#### ElevenLabs Voices via EdenAI

Use `voice_id` to select a specific ElevenLabs voice:

```typescript
providerOptions: {
  provider: 'elevenlabs',
  voice_id: 'Aria',   // specific voice
  option: 'FEMALE',   // gender fallback
}
```

**Tested ElevenLabs Voices:** Aria, Roger, Sarah, Laura, Charlie, George

#### OpenAI Voices via EdenAI

**Supported Languages (57):** af, ar, az, be, bg, bs, ca, cs, cy, da, de, el, en, es, et, fa, fi, fr, gl, he, hi, hr, hu, hy, id, is, it, ja, kk, kn, ko, lt, lv, mi, mk, mr, ms, ne, nl, no, pl, pt, ro, ru, sk, sl, sr, sv, sw, ta, th, tl, tr, uk, ur, vi, zh

---

### OpenAI TTS (🔮 Future - Direct API)

| Parameter | Status | Type | Range/Options | Description |
|-----------|--------|------|---------------|-------------|
| **model** | 🔮 Future | string | 'tts-1', 'tts-1-hd', 'gpt-4o-mini-tts' | TTS model selection |
| **responseFormat** | 🔮 Future | string | 'mp3', 'opus', 'aac', 'flac' | Output format override |

**Implementation Status**: Not implemented (use EdenAI for OpenAI access)
**Billing Model**: Character-based (~$15 per 1M characters) OR Token-based (gpt-4o-mini-tts)
**Free Tier**: None
**EU Compliance**: ⚠️ (available but US default)

**Voices**: 6 standard voices (alloy, echo, fable, onyx, nova, shimmer)

---

### ElevenLabs (✅ Implemented – Test/Admin Only)

| Parameter | Status | Type | Range/Options | Description |
|-----------|--------|------|---------------|-------------|
| **model_id** | ✅ | string | 'eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5' | Voice model (default `eleven_multilingual_v2`) |
| **language_code** | ✅ | string | ISO 639-1, e.g. 'de' | Enforce language; omit to auto-detect |
| **stability** | ✅ | number | 0.0 - 1.0 | Voice stability vs. expressiveness |
| **similarity_boost** | ✅ | number | 0.0 - 1.0 | Similarity to original voice |
| **style** | ✅ | number | 0.0 - 1.0 | Style exaggeration (different from Azure!) |
| **speaker_boost** | ✅ | boolean | true/false | Enhanced clarity (alias: `use_speaker_boost`) |
| **outputFormat** | ✅ | string | 'mp3_44100_128', 'mp3_22050_32', 'opus_48000_128', … | Override the auto-mapped `output_format` (tier-gated combos) |

**Implementation Status**: Implemented (native API, voice referenced by voice ID)
**Billing Model**: Character/credit-based (~$150-200 per 1M characters depending on plan)
**Free Tier**: ⚠️ Free API users **cannot use library/premade voices** (HTTP 402) — a paid plan (Starter+) is required to synthesize via the API
**EU Compliance**: ❌ No EU data residency below Enterprise; training opt-out (default-on) below Enterprise. **Benchmark/test-only.**

**Models**: Eleven v3 (most expressive), multilingual v2 (stable), flash v2.5 (fastest)
**Voices**: 500+ voices, voice cloning available; list via `scripts/list-elevenlabs-voices.ts`
**Dialog**: `synthesizeDialog()` via Text to Dialogue (eleven_v3) — up to **10 speakers** in one call, inline audio tags. See the dialog capability matrix in the main README.

---

### Google Cloud Text-to-Speech (🔮 Future)

| Parameter | Status | Type | Range/Options | Description |
|-----------|--------|------|---------------|-------------|
| **effectsProfileId** | 🔮 Future | string[] | 'headphone-class-device', 'telephony-class-application', etc. | Audio effects profiles |
| **pitchSemitones** | 🔮 Future | number | -20.0 to 20.0 | Pitch adjustment (overrides audio.pitch) |
| **speakingRate** | 🔮 Future | number | 0.25 - 4.0 | Speaking rate (alternative to speed) |
| **volumeGainDb** | 🔮 Future | number | -96.0 to 16.0 | Volume gain (alternative to volumeGainDb) |

**Implementation Status**: Not implemented (types ready)
**Billing Model**: Character-based (~$16 per 1M characters)
**Free Tier**: 1M characters/month
**EU Compliance**: ✅ (EU region available)

**Voices**: 400+ voices, extensive language support

---

### Fish Audio (✅ Implemented – Test/Admin Only)

| Parameter | Status | Type | Range/Options | Description |
|-----------|--------|------|---------------|-------------|
| **model** | ✅ | string | 's1', 'speech-1.6', 'speech-1.5' | TTS model selection |
| **referenceId** | ✅ | string | Fish Audio model ID | Voice from library or custom clone |
| **temperature** | ✅ | number | 0 - 1 (default: 0.7) | Controls expressiveness |
| **topP** | ✅ | number | 0 - 1 (default: 0.7) | Nucleus sampling diversity |
| **repetitionPenalty** | ✅ | number | default: 1.2 | Reduces repeated patterns |
| **latency** | ✅ | string | 'low', 'normal', 'balanced' | Latency mode |
| **chunkLength** | ✅ | number | 100 - 300 (default: 300) | Characters per chunk |
| **normalize** | ✅ | boolean | true/false (default: true) | Normalize numbers |
| **mp3Bitrate** | ✅ | number | 64, 128, 192 kbps | MP3 bitrate |
| **opusBitrate** | ✅ | number | -1000 (auto), 24, 32, 48, 64 | Opus bitrate |

**Implementation Status**: Implemented (test/admin only – no EU data residency)
**Billing Model**: UTF-8 byte-based ($15 per 1M UTF-8 bytes, ~180k English words)
**Free Tier**: None (pay-as-you-go)
**EU Compliance**: ❌ (no EU data residency guarantees)

**Models**: S1 (flagship, 4B params, #1 TTS-Arena2), speech-1.6 (stable), speech-1.5 (legacy)
**Languages**: 13 with auto-detection (EN, DE, FR, ES, JA, ZH, KO, AR, RU, NL, IT, PL, PT)
**Voices**: Community voice library + custom voice cloning
**Emotions**: 64+ expressions via text markers (e.g., `(excited)`, `(sad)`, `(whispering)`)

---

### Cartesia Sonic (✅ Implemented – EU resident)

Passed via `providerOptions`. Speaking speed uses the universal `audio.speed`.

| Parameter | Status | Type | Range/Options | Description |
|-----------|--------|------|---------------|-------------|
| **model** | ✅ | string | 'sonic-3.5', 'sonic-3', 'sonic-latest' | Cartesia model (default 'sonic-3.5') |
| **language** | ✅ | string | 'de', 'en', … | Synthesis language; omit to auto-detect |
| **sentencePauseMs** | ✅ | number | e.g. 300 | Inserts `<break>` between sentences (Sonic runs sentences together otherwise). 0/omit = off |
| **paragraphPauseMs** | ✅ | number | e.g. 700 | Pause at blank-line paragraph breaks (defaults to 2× sentencePauseMs) |
| **emotion** | ✅ | string[] | e.g. `['positivity:high']` | Forwarded to `generation_config.emotion` (beta) |
| **audio.speed** (universal) | ✅ | number | 0.6 – 1.5 (clamped) | Speaking-rate multiplier (1.0 = default) |

**Overridable defaults**: When a request omits `audio.speed` / `sentencePauseMs` /
`paragraphPauseMs`, the provider applies defaults from the constructor config or
these env vars (per-request values always override them):

| Env var | Maps to |
|---------|---------|
| `CARTESIA_DEFAULT_SPEED` | `audio.speed` |
| `CARTESIA_DEFAULT_SENTENCE_PAUSE_MS` | `sentencePauseMs` |
| `CARTESIA_DEFAULT_PARAGRAPH_PAUSE_MS` | `paragraphPauseMs` |

When none are set, the provider is neutral (no speed change, no pauses).

**Implementation Status**: Implemented
**Billing Model**: Character-based (~$30 per 1M characters)
**EU Compliance**: ✅ (EU data residency by default, GDPR DPA)
**Output**: mp3 (128 kbps) / wav, up to 44.1 kHz
**Voices**: Referenced by Cartesia voice ID (UUID). List German voices via
`scripts/list-cartesia-voices.ts`. Recommended narration default: `speed 0.9`,
`sentencePauseMs 300`, `paragraphPauseMs 700`.

---

### Deepgram TTS (🔮 Future)

| Parameter | Status | Type | Range/Options | Description |
|-----------|--------|------|---------------|-------------|
| **model** | 🔮 Future | string | 'aura-asteria-en', 'aura-luna-en', etc. | TTS model/voice selection |
| **encoding** | 🔮 Future | string | 'linear16', 'mulaw', 'alaw', 'opus', 'aac', 'mp3' | Audio encoding |
| **container** | 🔮 Future | string | 'wav', 'mp3', 'opus', 'flac' | Container format |
| **bitrate** | 🔮 Future | string | '128000' (128 kbps) | Bitrate for encoded audio |
| **sampleRate** | 🔮 Future | number | 8000, 16000, 24000, 48000 | Sample rate override |

**Implementation Status**: Not implemented (types ready)
**Billing Model**: Character-based (~$15 per 1M characters)
**Free Tier**: None
**EU Compliance**: ✅ (api.eu.deepgram.com endpoint)

**Voices**: Limited but high quality, optimized for low latency

---

## Feature Comparison

| Feature | Azure | OpenAI | ElevenLabs | Google | Deepgram | Fish Audio |
|---------|-------|--------|------------|--------|----------|------------|
| **Character Billing** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (UTF-8 bytes) |
| **Token Billing** | ❌ | ⚠️ (gpt-4o-mini-tts only) | ❌ | ❌ | ❌ | ❌ |
| **Speed Control** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Pitch Control** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Emotion/Style** | ✅ | ❌ | ⚠️ (limited) | ❌ | ❌ | ✅ (64+ text markers) |
| **Streaming** | ✅ | ⚠️ (chunks only) | ✅ | ❌ | ✅ | ⚠️ (WebSocket, not impl.) |
| **SSML Support** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **EU Hosting** | ✅ (Frankfurt) | ⚠️ (US default) | ⚠️ (on request) | ✅ (EU available) | ✅ (api.eu.*) | ❌ |
| **DPA/GDPR** | ✅ | ⚠️ (available) | ⚠️ (available) | ✅ | ✅ | ❌ |
| **Free Tier** | 500k/month | ❌ | 10k/month | 1M/month | ❌ | ❌ |

---

## Audio Format Support

| Format | Azure | OpenAI | ElevenLabs | Google | Deepgram | Fish Audio |
|--------|-------|--------|------------|--------|----------|------------|
| **MP3** | ✅ MVP | 🔮 | 🔮 | 🔮 | 🔮 | ✅ |
| **WAV** | ✅ MVP | ❌ | ❌ | 🔮 | 🔮 | ✅ |
| **PCM** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Opus** | ✅ MVP | 🔮 | ❌ | 🔮 | 🔮 | ✅ |
| **AAC** | ❌ | 🔮 | ❌ | ❌ | 🔮 | ❌ |
| **FLAC** | ❌ | 🔮 | ❌ | 🔮 | 🔮 | ❌ |

---

## Sample Rate Support

| Sample Rate | Azure | OpenAI | ElevenLabs | Google | Deepgram | Fish Audio |
|-------------|-------|--------|------------|--------|----------|------------|
| **8000 Hz** | ✅ MVP | ❌ | ❌ | 🔮 | 🔮 | ✅ |
| **16000 Hz** | ✅ MVP | ❌ | ❌ | 🔮 | 🔮 | ✅ |
| **24000 Hz** | ✅ MVP | ❌ | ❌ | 🔮 | 🔮 | ✅ |
| **32000 Hz** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **44100 Hz** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **48000 Hz** | ✅ MVP | ❌ | ❌ | 🔮 | 🔮 | ✅ |

---

## Implementation Roadmap

### Phase 1: MVP (Current)
- ✅ Azure Speech Services
  - Character-based billing
  - Emotion and style support
  - MP3, WAV, Opus formats
  - Multiple sample rates (8k, 16k, 24k, 48k)
  - EU compliance (germanywestcentral)

### Phase 2: Additional Providers
- 🔮 OpenAI TTS
  - Character/token-based billing
  - Simple API (minimal options)
  - High-quality voices (6 standard)

- 🔮 ElevenLabs
  - Character-based billing
  - Voice cloning capability
  - Advanced voice tuning (stability, similarity)

### Phase 3: Enterprise Features
- 🔮 Google Cloud TTS
  - Full feature parity
  - Extensive language support (400+ voices)
  - Audio effects profiles

- 🔮 Deepgram
  - EU endpoint support
  - Low-latency optimization
  - Streaming capabilities

### Future Enhancements
- 🔮 Voice Catalog API
- 🔮 SSML Consumer Input
- 🔮 Streaming Output
- 🔮 Batch Synthesis
- 🔮 Voice Quality Recommendations

---

## Usage Examples

### Azure with Emotion (MVP)

```typescript
const request: TTSSynthesizeRequest = {
  text: "I'm so excited!",
  provider: TTSProvider.AZURE,
  voice: { id: 'en-US-JennyNeural' },
  audio: { speed: 1.0, format: 'mp3' },
  providerOptions: {
    emotion: 'cheerful',
    style: 'chat'
  }
};
```

### OpenAI with Model Selection (Future)

```typescript
const request: TTSSynthesizeRequest = {
  text: "Hello world",
  provider: TTSProvider.OPENAI,
  voice: { id: 'alloy' },
  providerOptions: {
    model: 'tts-1-hd',
    responseFormat: 'opus'
  }
};
```

### ElevenLabs with Voice Tuning (Future)

```typescript
const request: TTSSynthesizeRequest = {
  text: "Custom voice synthesis",
  provider: TTSProvider.ELEVENLABS,
  voice: { id: 'voice_xyz123' },
  providerOptions: {
    stability: 0.5,
    similarity_boost: 0.75,
    speaker_boost: true
  }
};
```

### Google with Audio Effects (Future)

```typescript
const request: TTSSynthesizeRequest = {
  text: "Optimized for headphones",
  provider: TTSProvider.GOOGLE,
  voice: { id: 'en-US-Neural2-A' },
  providerOptions: {
    effectsProfileId: ['headphone-class-device'],
    pitchSemitones: 2.0
  }
};
```

### Fish Audio with Emotion (Implemented)

```typescript
const request: TTSSynthesizeRequest = {
  text: "(excited) Das ist fantastisch!",
  provider: TTSProvider.FISH_AUDIO,
  voice: { id: '90042f762dbf49baa2e7776d011eee6b' }, // German narrator voice
  audio: { format: 'mp3' },
  providerOptions: {
    model: 's1',
    temperature: 0.7,
    latency: 'normal'
  }
};
```

---

## Notes

### Breaking Changes Policy

All provider parameters are typed NOW to prevent breaking API changes:

- ✅ **Adding new providers**: No changes to base types needed
- ✅ **Adding new parameters**: Just update provider-options types
- ✅ **Consumer code**: No changes needed when providers are added
- ✅ **Type safety**: Full TypeScript support for all providers

### Provider Selection Strategy

Consumers should choose providers based on:

1. **Cost**: Azure/OpenAI/Deepgram/Fish Audio (~$15-16/M) vs. ElevenLabs (~$150-200/M)
2. **Quality**: ElevenLabs > Fish Audio > Azure > OpenAI > Google > Deepgram (subjective)
3. **Latency**: Deepgram < OpenAI < Azure < Fish Audio < Google < ElevenLabs
4. **Voice Selection**: ElevenLabs (500+) > Google (400+) > Fish Audio (community library) > Azure (180+) > OpenAI (6)
5. **EU Compliance**: Azure, Google, Deepgram have EU regions (Fish Audio: no EU guarantees)
6. **Free Tier**: Google (1M) > Azure (500k) > ElevenLabs (10k) > Others (none)

### Billing Responsibility

The middleware **does NOT calculate costs**. It only returns:
- `billing.characters`: Character count (excluding SSML)
- `billing.tokensUsed`: Token count (if applicable)

Consumer applications calculate costs based on their provider rates:

```typescript
const PROVIDER_RATES = {
  [TTSProvider.AZURE]: 16 / 1_000_000,
  [TTSProvider.OPENAI]: 15 / 1_000_000,
  [TTSProvider.ELEVENLABS]: 160 / 1_000_000,
  [TTSProvider.GOOGLE]: 16 / 1_000_000,
  [TTSProvider.DEEPGRAM]: 15 / 1_000_000,
  [TTSProvider.FISH_AUDIO]: 15 / 1_000_000, // per 1M UTF-8 bytes
};

const costUSD = response.billing.characters * PROVIDER_RATES[provider];
```

---

**Document Version**: 1.3
**Last Updated**: 2026-01-29
**Status**: Azure + EdenAI + Google Cloud + Fish Audio implemented - Types ready for all providers
