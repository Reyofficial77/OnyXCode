import { createHash } from "node:crypto";
import { getBuiltin } from "../builtins.js";
import { AnthropicAdapter } from "../adapters/anthropic.js";
import { GeminiAdapter } from "../adapters/gemini.js";
import { OpenAICompatibleAdapter } from "../adapters/openai.js";
import { OllamaAdapter } from "../adapters/ollama.js";
import { isOnyxError } from "../../utils/errors.js";
import type { ModelInfo, ProviderAdapter } from "../types.js";

export type VerifyStatus =
  | "detected"
  | "verified"
  | "invalid"
  | "unknown"
  | "network_error"
  | "rate_limited"
  | "unsupported";

export interface VerifyOptions {
  providerId: string;
  apiKey: string;
  /** Model to test with. Falls back to a documented cheap model for builtins. */
  model?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Must be true: the user explicitly agreed to contact the provider. */
  confirmed: boolean;
}

export interface VerifyResult {
  status: VerifyStatus;
  providerId: string;
  /** Stable, non-reversible fingerprint of the key (for "is this the same key?" checks). */
  fingerprint: string;
  message: string;
  models?: ModelInfo[];
  httpStatus?: number;
}

/** Per-provider default test models (documented, low-cost). */
const TEST_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash",
  groq: "llama-3.1-8b-instant",
};

export function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

/**
 * Sends exactly one minimal request to the provider the user selected.
 * Never scans multiple endpoints, never retries auth failures.
 */
export class ProviderVerifier {
  async verify(options: VerifyOptions): Promise<VerifyResult> {
    const fingerprint = keyFingerprint(options.apiKey);
    if (!options.confirmed) {
      return {
        status: "detected",
        providerId: options.providerId,
        fingerprint,
        message: "Detection only. Verification requires explicit confirmation before contacting the provider.",
      };
    }
    const builtin = getBuiltin(options.providerId);
    const type = builtin?.type ?? "openai-compatible";
    const baseUrl = options.baseUrl ?? builtin?.baseUrl;
    if (!baseUrl && type !== "ollama") {
      return {
        status: "unsupported",
        providerId: options.providerId,
        fingerprint,
        message: "No endpoint is known for this provider. Add a base URL for a custom OpenAI-compatible endpoint first.",
      };
    }
    if (!TEST_MODELS[options.providerId] && !options.model) {
      return {
        status: "unsupported",
        providerId: options.providerId,
        fingerprint,
        message: "No verification model is known for this provider. Provide `--model` to test with a specific model.",
      };
    }
    const model = options.model ?? TEST_MODELS[options.providerId]!;
    let adapter: ProviderAdapter;
    try {
      adapter = this.createAdapter(type, options.providerId, options.apiKey, baseUrl!, options.timeoutMs);
    } catch (err) {
      return {
        status: "unsupported",
        providerId: options.providerId,
        fingerprint,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    try {
      await adapter.verify(model, options.signal);
    } catch (err) {
      return this.mapError(err, options.providerId, fingerprint);
    }

    let models: ModelInfo[] | undefined;
    try {
      models = await adapter.listModels(options.signal);
    } catch {
      models = undefined;
    }
    return {
      status: "verified",
      providerId: options.providerId,
      fingerprint,
      message: `Key accepted by ${builtin?.name ?? options.providerId} (test model: ${model})`,
      ...(models && models.length ? { models } : {}),
    };
  }

  private mapError(err: unknown, providerId: string, fingerprint: string): VerifyResult {
    const status = isOnyxError(err) ? err.code : "E_INTERNAL";
    const message = err instanceof Error ? err.message : String(err);
    const map: Record<string, VerifyStatus> = {
      E_AUTH: "invalid",
      E_MODEL_NOT_FOUND: "invalid",
      E_RATE_LIMIT: "rate_limited",
      E_QUOTA: "rate_limited",
      E_NETWORK: "network_error",
      E_TIMEOUT: "network_error",
      E_ENDPOINT_INVALID: "network_error",
      E_BAD_RESPONSE: "unsupported",
      E_CANCELLED: "unknown",
    };
    return {
      status: map[status] ?? "unknown",
      providerId,
      fingerprint,
      message,
    };
  }

  private createAdapter(type: string, id: string, apiKey: string, baseUrl: string, timeoutMs?: number): ProviderAdapter {
    const t = timeoutMs ?? 45_000;
    switch (type) {
      case "anthropic":
        return new AnthropicAdapter({ apiKey, baseUrl, timeoutMs: t });
      case "gemini":
        return new GeminiAdapter({ apiKey, baseUrl, timeoutMs: t });
      case "ollama":
        return new OllamaAdapter({ baseUrl, timeoutMs: t });
      default:
        return new OpenAICompatibleAdapter({ id, name: getBuiltin(id)?.name ?? id, baseUrl, apiKey, timeoutMs: t });
    }
  }
}
