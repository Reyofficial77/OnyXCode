/**
 * Provider detection based on API-key *format*.
 *
 * A format match is only a guess: key formats change and compatible services
 * reuse prefixes (e.g. many gateways issue `sk-...` keys). The detector never
 * performs network requests.
 */
export type ProviderGuess = {
  providerId: string;
  providerName: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export interface DetectResult {
  key: {
    length: number;
    shape: string;
    /** Masked preview, never the full key. */
    masked: string;
  };
  guesses: ProviderGuess[];
  note: string;
}

const MASK = (s: string) => `${s.slice(0, 4)}${"•".repeat(Math.max(3, Math.min(16, s.length - 8)))}${s.slice(-4)}`;

interface Rule {
  providerId: string;
  providerName: string;
  test: (key: string) => boolean;
  confidence: ProviderGuess["confidence"];
  reason: string;
}

const RULES: Rule[] = [
  {
    providerId: "anthropic",
    providerName: "Anthropic",
    test: (k) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k),
    confidence: "high",
    reason: "Key starts with `sk-ant-` (Anthropic's documented prefix)",
  },
  {
    providerId: "openrouter",
    providerName: "OpenRouter",
    test: (k) => /^sk-or-v1-[A-Za-z0-9]{20,}$/.test(k) || /^sk-or-[A-Za-z0-9_-]{20,}$/.test(k),
    confidence: "high",
    reason: "Key starts with `sk-or-` (OpenRouter's documented prefix)",
  },
  {
    providerId: "openai",
    providerName: "OpenAI",
    test: (k) => /^sk-proj-[A-Za-z0-9_-]{20,}$/.test(k),
    confidence: "high",
    reason: "Key starts with `sk-proj-` (OpenAI project keys)",
  },
  {
    providerId: "groq",
    providerName: "Groq",
    test: (k) => /^gsk_[A-Za-z0-9]{20,}$/.test(k),
    confidence: "high",
    reason: "Key starts with `gsk_` (Groq's documented prefix)",
  },
  {
    providerId: "gemini",
    providerName: "Google Gemini",
    test: (k) => /^AIza[0-9A-Za-z_-]{30,}$/.test(k),
    confidence: "high",
    reason: "Key starts with `AIza` (Google API key format)",
  },
  {
    providerId: "openai",
    providerName: "OpenAI or OpenAI-compatible service",
    test: (k) => /^sk-[A-Za-z0-9_-]{20,}$/.test(k),
    confidence: "medium",
    reason: "Key starts with `sk-`, which is used by OpenAI and many compatible gateways",
  },
  {
    providerId: "huggingface",
    providerName: "Hugging Face",
    test: (k) => /^hf_[A-Za-z0-9]{20,}$/.test(k),
    confidence: "high",
    reason: "Key starts with `hf_` (Hugging Face token format); no built-in adapter",
  },
  {
    providerId: "replicate",
    providerName: "Replicate",
    test: (k) => /^r8_[A-Za-z0-9]{20,}$/.test(k),
    confidence: "high",
    reason: "Key starts with `r8_` (Replicate token format); no built-in adapter",
  },
];

function shape(key: string): string {
  return key
    .slice(0, 12)
    .replace(/[A-Z]/g, "A")
    .replace(/[a-z]/g, "a")
    .replace(/\d/g, "9")
    .replace(/[^Aa9_-]/g, "?");
}

export class ProviderDetector {
  detect(apiKey: string): DetectResult {
    const key = apiKey.trim();
    if (!key) {
      return {
        key: { length: 0, shape: "", masked: "" },
        guesses: [],
        note: "No key provided.",
      };
    }
    const keyInfo = { length: key.length, shape: shape(key), masked: MASK(key) };
    const guesses = RULES.filter((r) => r.test(key)).map((r) => ({
      providerId: r.providerId,
      providerName: r.providerName,
      confidence: r.confidence,
      reason: r.reason,
    }));
    const note = guesses.length
      ? "This is an estimate based on the key format only. It is NOT proof that the key is valid."
      : "The key format is not recognized. Choose a provider manually or configure a custom OpenAI-compatible endpoint.";
    return { key: keyInfo, guesses, note };
  }
}
