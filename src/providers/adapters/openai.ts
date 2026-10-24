import { OnyxError } from "../../utils/errors.js";
import { errorFromStatus, httpFetch, parseSse } from "../http.js";
import { buildOpenAIRequestBody, mapOpenAICompletion, parseOpenAIUsage, parseOpenAIStop, safeParseJson, ToolCallAccumulator } from "../openai-format.js";
import { toOpenAITools } from "../schema-tools.js";
import type { ChatRequest, ChatResponse, ModelInfo, ProviderAdapter, StreamEvent } from "../types.js";

export interface OpenAICompatibleOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  /** Disable tool calling where the endpoint is known not to support it. */
  tools?: boolean;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

/** Adapter for any endpoint implementing the OpenAI chat completions API. */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly type = "openai-compatible";
  readonly id: string;
  readonly supportsTools: boolean;
  readonly supportsStreaming = true;
  protected readonly baseUrl: string;
  protected readonly apiKey: string;
  protected readonly name: string;
  protected readonly extraHeaders: Record<string, string>;
  protected readonly timeoutMs: number;
  protected readonly retries: number;

  constructor(options: OpenAICompatibleOptions) {
    this.id = options.id;
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.extraHeaders = options.headers ?? {};
    this.supportsTools = options.tools !== false;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.retries = options.retries ?? 0;
  }

  protected headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
    };
  }

  protected endpoint(path: string): string {
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const res = await httpFetch(this.endpoint("/chat/completions"), {
      headers: this.headers(),
      body: buildOpenAIRequestBody(request, false, this.supportsTools && request.tools ? toOpenAITools(request.tools) : undefined),
      ...(request.signal ? { signal: request.signal } : {}),
      timeoutMs: this.timeoutMs,
      retries: this.retries,
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, this.name);
    return mapOpenAICompletion(parseJsonBody(res.text, this.name));
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    const res = await fetch(this.endpoint("/chat/completions"), {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(buildOpenAIRequestBody(request, true, this.supportsTools && request.tools ? toOpenAITools(request.tools) : undefined)),
      signal: request.signal,
    }).catch((err: unknown) => {
      if (request.signal?.aborted) throw new OnyxError("E_CANCELLED", "Request cancelled");
      throw new OnyxError("E_NETWORK", `Network error: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    });

    if (res.status < 200 || res.status >= 300) {
      const body = await res.text().catch(() => "");
      throw errorFromStatus(res.status, body, this.name);
    }

    const acc = new ToolCallAccumulator();
    let finish: string | undefined;
    let usage: ReturnType<typeof parseOpenAIUsage>;
    let gotAny = false;

    for await (const evt of parseSse(res, request.signal)) {
      if (evt.data === "[DONE]") break;
      const json = tryJson(evt.data);
      if (!json) continue;
      gotAny = true;
      if (json.error) {
        const err = json.error as Record<string, unknown>;
        throw new OnyxError("E_BAD_RESPONSE", `${this.name}: ${String(err.message ?? "stream error")}`);
      }
      const u = parseOpenAIUsage(json.usage as Record<string, unknown> | undefined);
      if (u) {
        usage = u;
        yield { type: "usage", usage: u };
      }
      const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0];
      if (!choice) continue;
      const delta = (choice.delta as Record<string, unknown> | undefined) ?? {};
      const reasoning = typeof delta.reasoning_content === "string" ? delta.reasoning_content : undefined;
      if (reasoning) yield { type: "reasoning-delta", text: reasoning };
      if (typeof delta.content === "string" && delta.content) {
        yield { type: "text-delta", text: delta.content };
      }
      const toolDeltas = delta.tool_calls as Array<Record<string, unknown>> | undefined;
      if (toolDeltas) {
        for (const t of toolDeltas) {
          acc.add({
            index: typeof t.index === "number" ? t.index : 0,
            ...(typeof t.id === "string" ? { id: t.id } : {}),
            function: (t.function as { name?: string; arguments?: string } | undefined) ?? {},
          });
        }
      }
      if (typeof choice.finish_reason === "string") finish = choice.finish_reason;
    }

    if (!gotAny && finish === undefined) {
      throw new OnyxError("E_BAD_RESPONSE", `${this.name}: stream ended without data`, {
        hint: "The endpoint may not support streaming; disable stream in config.",
      });
    }

    const calls = acc.finish();
    for (const call of calls) yield { type: "tool-call", call };
    if (finish === "tool_calls" || (calls.length > 0 && !finish)) {
      yield { type: "done", stopReason: "tool_calls" };
    } else {
      yield { type: "done", stopReason: parseOpenAIStop(finish) };
    }
    void usage;
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const res = await httpFetch(this.endpoint("/models"), {
      method: "GET",
      headers: this.headers(),
      ...(signal ? { signal } : {}),
      timeoutMs: Math.min(this.timeoutMs, 30_000),
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, this.name);
    const json = parseJsonBody(res.text, this.name);
    const data = (json.data as Array<Record<string, unknown>> | undefined) ?? [];
    return data
      .filter((m) => typeof m.id === "string")
      .map((m) => ({ id: String(m.id), ...(typeof m.name === "string" ? { name: m.name } : {}) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async verify(model: string, signal?: AbortSignal): Promise<void> {
    const res = await httpFetch(this.endpoint("/chat/completions"), {
      headers: this.headers(),
      body: { model, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false },
      ...(signal ? { signal } : {}),
      timeoutMs: Math.min(this.timeoutMs, 45_000),
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, this.name);
  }
}

function parseJsonBody(text: string, provider: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new OnyxError("E_BAD_RESPONSE", `${provider}: response is not valid JSON`, {
      hint: "The endpoint may not be OpenAI-compatible.",
    });
  }
}

function tryJson(text: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export { safeParseJson };
