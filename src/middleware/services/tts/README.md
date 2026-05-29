# TTS Middleware Service

Provider-agnostic Text-to-Speech synthesis service.

---

## 📋 Structure

```
tts/
├── providers/              # Provider implementations
│   ├── base-tts-provider.ts       # Abstract base class
│   ├── azure-provider.ts          # Azure Speech Services + Dragon HD (MVP)
│   ├── cartesia-provider.ts       # Cartesia Sonic (EU-resident)
│   ├── edenai-provider.ts         # EdenAI multi-provider aggregator
│   ├── google-cloud-tts-provider.ts # Google Cloud TTS (EU-compliant)
│   ├── fish-audio-provider.ts     # Fish Audio S1 (test/admin only)
│   ├── inworld-provider.ts        # Inworld AI (test/admin only)
│   ├── vertex-ai-tts-provider.ts  # Vertex AI / Gemini TTS (test/admin only)
│   └── index.ts
├── types/                  # TypeScript interfaces & types
│   ├── common.types.ts            # Universal types
│   ├── provider-options.types.ts   # Provider-specific options
│   ├── PROVIDER_PARAMETERS.md     # Feature matrix
│   └── index.ts
├── utils/                  # Utility functions
│   ├── character-counter.utils.ts  # Character counting (billing)
│   └── index.ts
├── tts.service.ts         # Main orchestrator (singleton)
├── index.ts               # Public API exports
└── __tests__/             # Test files
```

---

## 🚀 Quick Start

```typescript
import { ttsService, TTSProvider } from '@tts-middleware/tts';

// Synthesis request
const response = await ttsService.synthesize({
  text: "Hallo Welt",
  provider: TTSProvider.AZURE,
  voice: { id: 'de-DE-KatjaNeural' },
  audio: {
    speed: 1.0,
    sampleRate: 24000,
    format: 'mp3'
  }
});

// Response contains audio buffer + billing metadata
console.log(response.audio);           // Buffer with MP3 data
console.log(response.billing.characters); // Character count for billing
console.log(response.metadata);         // Provider, voice, duration, etc.

// Consumer app calculates cost
const costUSD = (response.billing.characters / 1_000_000) * 16; // $16/1M for Azure
```

---

## 📚 Implementation Stories

Start with these stories in order:

1. **TTS-001** - [Define TTS Types & Interfaces](../../../../../../../TTS_MIDDLEWARE_TECHNICAL_STORIES.md#story-1-define-tts-types--interfaces)
   - Files: `types/common.types.ts`, `types/provider-options.types.ts`

2. **TTS-002** - [Implement BaseTTSProvider](../../../../../../../TTS_MIDDLEWARE_TECHNICAL_STORIES.md#story-2-implement-basetsprovider-abstract-class)
   - Files: `providers/base-tts-provider.ts`

3. **TTS-003** - [Character Counting Utility](../../../../../../../TTS_MIDDLEWARE_TECHNICAL_STORIES.md#story-3-implement-character-counting-utility)
   - Files: `utils/character-counter.utils.ts`

4. **TTS-004** - [Azure Provider](../../../../../../../TTS_MIDDLEWARE_TECHNICAL_STORIES.md#story-4-implement-azure-tts-provider)
   - Files: `providers/azure-provider.ts`

5. **TTS-005** - [TTSService Orchestrator](../../../../../../../TTS_MIDDLEWARE_TECHNICAL_STORIES.md#story-5-implement-ttsservice-orchestrator)
   - Files: `tts.service.ts`

6. **TTS-006** - [Public API Exports](../../../../../../../TTS_MIDDLEWARE_TECHNICAL_STORIES.md#story-6-create-public-api-exports--index)
   - Files: `index.ts`, `providers/index.ts`, `types/index.ts`, `utils/index.ts`

7. **TTS-007** - [Configuration](../../../../../../../TTS_MIDDLEWARE_TECHNICAL_STORIES.md#story-7-setup-configuration--environment)
   - Files: `../shared/config/tts.config.ts`

8. **TTS-008** - [Testing & Docs](../../../../../../../TTS_MIDDLEWARE_TECHNICAL_STORIES.md#story-8-comprehensive-testing--documentation)
   - Files: `__tests__/*.test.ts`

---

## 🧪 Testing

Each story has specific test requirements. Follow the acceptance criteria (ACs) in the technical stories document.

Run tests:

```bash
# All tests
npm run test

# Specific test file
npm run test character-counter.test.ts

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## 📝 Key Files to Create

### TTS-001: Types
- `types/common.types.ts` - TTSProvider enum, TTSSynthesizeRequest, TTSResponse
- `types/provider-options.types.ts` - AzureProviderOptions, OpenAIProviderOptions, etc.
- `types/PROVIDER_PARAMETERS.md` - Feature matrix (who supports what)

### TTS-002: Base Provider
- `providers/base-tts-provider.ts` - Abstract class, error classes

### TTS-003: Character Counter
- `utils/character-counter.utils.ts` - countCharacters(), countCharactersWithoutSSML()

### TTS-004: Azure Provider
- `providers/azure-provider.ts` - SSML generation, synthesis, error handling

### TTS-005: TTSService
- `tts.service.ts` - Provider registry, singleton pattern

### TTS-006: Exports
- `index.ts` - Main exports
- `providers/index.ts` - Provider exports
- `types/index.ts` - Type exports
- `utils/index.ts` - Utility exports

### TTS-007: Config
- `../shared/config/tts.config.ts` - Environment variables, validation

### TTS-008: Tests & Docs
- `__tests__/types.test.ts` - Type validation
- `__tests__/base-tts-provider.test.ts` - Abstract class tests
- `__tests__/character-counter.test.ts` - Character counting tests
- `__tests__/azure-provider.test.ts` - Azure provider tests
- `__tests__/tts.service.test.ts` - Service orchestrator tests
- `__tests__/integration.test.ts` - End-to-end tests

---

## 🎯 Acceptance Criteria

Each story has detailed acceptance criteria in the technical stories document. Example:

```
TTS-001 AC1.1: File types/common.types.ts created with:
  - enum TTSProvider with values: AZURE, OPENAI, ELEVENLABS, GOOGLE, DEEPGRAM
  - interface TTSSynthesizeRequest with all required and optional fields
  - interface TTSResponse with audio, metadata, billing fields
  - ...more criteria
```

Check off each AC as you complete them.

---

## ✅ Quality Requirements

- **Coverage:** >80% overall (critical paths 100%)
- **TypeScript:** Strict mode, no `any` types
- **Tests:** Deterministic, no timing-dependent assertions
- **Documentation:** JSDoc, inline comments, README

---

## 🚀 Ready to Start?

1. Read the **TTS_MIDDLEWARE_TECHNICAL_STORIES.md** file
2. Start with **Story TTS-001** (Define Types)
3. Follow the acceptance criteria exactly
4. Write tests first
5. Verify >80% coverage before moving to next story

Good luck! 🎯
