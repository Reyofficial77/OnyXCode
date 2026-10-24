import { OnyxError } from "../utils/errors.js";
import { AnthropicAdapter } from "./adapters/anthropic.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { OpenAICompatibleAdapter } from "./adapters/openai.js";
import { OllamaAdapter } from "./adapters/ollama.js";
import { getBuiltin, listBuiltin, type BuiltinProvider } from "./builtins.js";
import type { ModelInfo, ProviderAdapter } from "./types.js";

export interface RegistryDeps {
  getApiKey: (provider: string, apiKeyEnv?: string) => string | undefined;
  timeoutMs?: number;
  retries?: number;
}

/** A registered provider after merging builtin defaults with user config. */
export interface RegisteredProvider {
  id: string;
  name: string;
  type: BuiltinProvider["type"];
  baseUrl: string;
  models: string[];
  defaultModel?: string;
  supportsTools: boolean;
  requiresKey: boolean;
  custom: boolean;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  builtin: boolean;
}

/**
 * Merges builtin providers with configured ones and creates adapters on demand.
 * Config entries can override builtins (same id) or define new custom providers.
 */
export class ProviderRegistry {
  private readonly overrides: Record<string, import("../config/schema.js").ProviderConfig>;
  private readonly defaults: { provider?: string; model?: string };

  constructor(
    private readonly deps: RegistryDeps,
    config: { providers?: Record<string, import("../config/schema.js").ProviderConfig>; defaultProvider?: string; defaultModel?: string } = {},
  ) {
    this.overrides = config.providers ?? {};
    this.defaults = {
      ...(config.defaultProvider ? { provider: config.defaultProvider } : {}),
      ...(config.defaultModel ? { model: config.defaultModel } : {}),
    };
  }

  list(): RegisteredProvider[] {
    const map = new Map<string, RegisteredProvider>();
    for (const b of listBuiltin()) {
      // Builtins are visible only if they are usable: keyed ones need a key or explicit config.
      const override = this.overrides[b.id];
      const hasKey = !b.requiresKey || Boolean(this.deps.getApiKey(b.id, override?.apiKeyEnv ?? b.apiKeyEnv)) || Boolean(override);
      if (!hasKey && !override) continue;
      map.set(b.id, this.mergeBuiltin(b, override));
    }
    for (const [id, cfg] of Object.entries(this.overrides)) {
      if (map.has(id)) continue;
      map.set(id, {
        id,
        name: id,
        type: cfg.type,
        baseUrl: cfg.baseUrl ?? "",
        models: cfg.models,
        ...(cfg.defaultModel ? { defaultModel: cfg.defaultModel } : {}),
        supportsTools: true,
        requiresKey: cfg.type !== "ollama",
        custom: true,
        ...(cfg.apiKeyEnv ? { apiKeyEnv: cfg.apiKeyEnv } : {}),
        ...(cfg.headers ? { headers: cfg.headers } : {}),
        builtin: false,
      });
    }
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): RegisteredProvider | undefined {
    return this.list().find((p) => p.id === id.toLowerCase());
  }

  defaultProviderId(): string | undefined {
    return this.defaults.provider ?? this.list()[0]?.id;
  }

  /** Create an adapter; throws a typed error when the key or type is unusable. */
  adapter(id: string): ProviderAdapter {
    const provider = this.get(id);
    if (!provider) {
      throw new OnyxError("E_PROVIDER_UNKNOWN", `Unknown provider: ${id}`, {
        hint: `Run \`onyxcode provider list\` or \`onyxcode provider add\`.`,
      });
    }
    const apiKey = this.deps.getApiKey(provider.id, provider.apiKeyEnv) ?? "";
    if (provider.requiresKey && !apiKey) {
      throw new OnyxError("E_CREDENTIAL_MISSING", `No API key configured for provider "${provider.id}"`, {
        hint: `Run \`onyxcode auth login --provider ${provider.id}\` or set ${provider.apiKeyEnv ?? "the provider API key env var"}.`,
      });
    }
    const timeoutMs = this.deps.timeoutMs ?? 120_000;
    switch (provider.type) {
      case "anthropic":
        return new AnthropicAdapter({ apiKey, ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}), timeoutMs });
      case "gemini":
        return new GeminiAdapter({ apiKey, ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}), timeoutMs });
      case "ollama":
        return new OllamaAdapter({ baseUrl: provider.baseUrl, timeoutMs });
      case "openai":
      case "groq":
      case "openai-compatible":
      default:
        return new OpenAICompatibleAdapter({
          id: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey,
          tools: provider.supportsTools,
          timeoutMs,
          retries: this.deps.retries ?? 0,
          ...(provider.headers ? { headers: provider.headers } : {}),
        });
    }
  }

  /** Best-effort model discovery with a static fallback from config/builtin. */
  async modelsFor(id: string, signal?: AbortSignal): Promise<{ models: ModelInfo[]; source: "api" | "static" }> {
    const provider = this.get(id);
    if (!provider) throw new OnyxError("E_PROVIDER_UNKNOWN", `Unknown provider: ${id}`);
    const staticModels: ModelInfo[] = provider.models.map((m) => ({ id: m }));
    const apiKey = this.deps.getApiKey(provider.id, provider.apiKeyEnv);
    if (!apiKey && provider.requiresKey) return { models: staticModels, source: "static" };
    try {
      const adapter = this.adapter(id);
      const models = await adapter.listModels(signal);
      const merged = mergeModels(models, staticModels);
      return { models: merged, source: "api" };
    } catch {
      return { models: staticModels, source: "static" };
    }
  }

  private mergeBuiltin(b: BuiltinProvider, override?: import("../config/schema.js").ProviderConfig): RegisteredProvider {
    const configuredModels = override?.models ?? [];
    return {
      id: b.id,
      name: b.name,
      type: override?.type ?? b.type,
      baseUrl: override?.baseUrl ?? b.baseUrl,
      models: configuredModels.length ? configuredModels : b.models,
      ...(override?.defaultModel ?? b.defaultModel ? { defaultModel: override?.defaultModel ?? b.defaultModel! } : {}),
      supportsTools: b.supportsTools,
      requiresKey: b.requiresKey,
      custom: Boolean(override?.custom),
      ...(override?.apiKeyEnv ?? b.apiKeyEnv ? { apiKeyEnv: override?.apiKeyEnv ?? b.apiKeyEnv } : {}),
      ...(override?.headers ? { headers: override.headers } : {}),
      builtin: true,
    };
  }
}

function mergeModels(fromApi: ModelInfo[], staticModels: ModelInfo[]): ModelInfo[] {
  const map = new Map<string, ModelInfo>();
  for (const m of staticModels) map.set(m.id, m);
  for (const m of fromApi) map.set(m.id, { ...(map.get(m.id) ?? {}), ...m });
  return [...map.values()];
}

export { getBuiltin };
