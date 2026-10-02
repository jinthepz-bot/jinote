// Expo inlines EXPO_PUBLIC_* variables from .env at bundle time. Each one must be
// read as a literal `process.env.EXPO_PUBLIC_...` expression for that to work.
//
// Anything inlined here ships inside the JS bundle, so this setup is for local
// development only. Put the key behind a server before sharing the app.
export type Provider = 'gemini' | 'claude';

// Gemini is the default provider: it has a usable free tier. Set
// EXPO_PUBLIC_LLM_PROVIDER=claude to use Claude instead (needs a paid Anthropic key).
const provider: Provider = process.env.EXPO_PUBLIC_LLM_PROVIDER?.trim() === 'claude' ? 'claude' : 'gemini';

export const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';

const gemini = {
  apiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() ?? '',
  // gemini-2.5-flash is no longer available to new API keys; gemini-3.6-flash is
  // Google's current recommended stable replacement and still has a free tier.
  model: process.env.EXPO_PUBLIC_GEMINI_MODEL?.trim() || 'gemini-3.6-flash',
  // Tried once when the main model is still busy after its retries (see gemini.ts).
  // A lighter model with its own free-tier quota, so it's often free when the main
  // one is overloaded. Pinned rather than "-latest", so it can't change underneath.
  fallbackModel: GEMINI_FALLBACK_MODEL,
};

const claude = {
  apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY?.trim() ?? '',
  model: process.env.EXPO_PUBLIC_ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
};

export const config = {
  provider,
  gemini,
  claude,
  forceMock: process.env.EXPO_PUBLIC_USE_MOCK === 'true',
};

// Fall back to canned responses when the selected provider has no key configured.
const activeApiKey = provider === 'claude' ? claude.apiKey : gemini.apiKey;
export const useMock = config.forceMock || activeApiKey === '';
