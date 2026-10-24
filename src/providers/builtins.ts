/**
 * Built-in provider definitions.
 *
 * `models` lists are *suggestions*: real availability depends on the account and
 * changes over time. `onyxcode models list` fetches the live list from the API.
 */
export interface BuiltinProvider {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "gemini" | "groq" | "openai-compatible" | "ollama";
  baseUrl: string;
  apiKeyEnv: string;
  docs: string;
  requiresKey: boolean;
  supportsTools: boolean;
  models: string[];
  defaultModel?: string;
  apiKeyHint?: string;
}

export const BUILTIN_PROVIDERS: Record<string, BuiltinProvider> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    docs: "https://platform.openai.com/docs/api-reference/chat",
    requiresKey: true,
    supportsTools: true,
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o4-mini"],
    defaultModel: "gpt-4.1-mini",
    apiKeyHint: "Starts with sk- (legacy) or sk-proj-",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    docs: "https://docs.anthropic.com/en/api/messages",
    requiresKey: true,
    supportsTools: true,
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    defaultModel: "claude-sonnet-4-5",
    apiKeyHint: "Starts with sk-ant-",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    type: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnv: "GEMINI_API_KEY",
    docs: "https://ai.google.dev/gemini-api/docs",
    requiresKey: true,
    supportsTools: true,
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    defaultModel: "gemini-2.5-flash",
    apiKeyHint: "Starts with AIza",
  },
  groq: {
    id: "groq",
    name: "Groq",
    type: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    docs: "https://console.groq.com/docs/api-reference",
    requiresKey: true,
    supportsTools: true,
    models: [],
    apiKeyHint: "Starts with gsk_",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    type: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    docs: "https://openrouter.ai/docs",
    requiresKey: true,
    supportsTools: true,
    models: [],
    apiKeyHint: "Starts with sk-or-",
  },
  ollama: {
    id: "ollama",
    name: "Ollama (local)",
    type: "ollama",
    baseUrl: "http://localhost:11434",
    apiKeyEnv: "OLLAMA_API_KEY",
    docs: "https://docs.ollama.com/api",
    requiresKey: false,
    supportsTools: true,
    models: [],
  },
};

export type BuiltinProviderId = keyof typeof BUILTIN_PROVIDERS;

export function getBuiltin(id: string): BuiltinProvider | undefined {
  return BUILTIN_PROVIDERS[id.toLowerCase()];
}

export function listBuiltin(): BuiltinProvider[] {
  return Object.values(BUILTIN_PROVIDERS);
}
