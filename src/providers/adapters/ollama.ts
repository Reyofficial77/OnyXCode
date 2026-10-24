import { OnyxError } from "../../utils/errors.js";
import { errorFromStatus, httpFetch } from "../http.js";
import type { ChatRequest, ChatResponse, ModelInfo, ProviderAdapter, StreamEvent } from "../types.js";
import { OpenAICompatibleAdapter } from "./openai.js";
import { GROQ_DEFAULT_BASE } from "../openai-format.js";

export const OLLAMA_DEFAULT_BASE = "http://localhost:11434";

/** Local Ollama via its native API (no API key). Streaming is NDJSON, not SSE. */
export class OllamaAdapter implements ProviderAdapter {
  readonly id = "ollama";
  readonly type = "ollama";
  readonly supportsTools = true;
  readonly supportsStreaming = true;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: { baseUrl?: string; timeoutMs?: number }) {
    this.baseUrl = (options.baseUrl ?? OLLAMA_DEFAULT_BASE).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  private body(request: ChatRequest, stream: boolean): Record<string, unknown> {
    return {
      model: request.model,
      messages: request.messages.map((m) => {
        const text = m.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
        if (m.role === "tool") {
          const r = m.content.find((p) => p.type === "tool_result") as { content?: string } | undefined;
          return { role: "tool", content: r?.content ?? "" };
        }
        const calls = m.content.filter((p) => p.type === "tool_call") as Array<{ name: string; arguments: unknown }>;
        return {
          role: m.role,
          content: text,
          ...(calls.length
            ? { tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) }
            : {}),
        };
      }),
      stream,
      ...(request.tools && request.tools.length
        ? {
            tools: request.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
      options: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {}),
      },
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const res = await httpFetch(`${this.baseUrl}/api/chat`, {
      headers: {},
      body: this.body(request, false),
      ...(request.signal ? { signal: request.signal } : {}),
      timeoutMs: this.timeoutMs,
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, "Ollama");
    const json = JSON.parse(res.text) as Record<string, unknown>;
    const msg = (json.message as Record<string, unknown> | undefined) ?? {};
    const calls = ((msg.tool_calls as Array<Record<string, unknown>> | undefined) ?? []).map((c, i) => {
      const fn = (c.function as Record<string, unknown> | undefined) ?? {};
      return { type: "tool_call" as const, id: `ollama_${i}`, name: String(fn.name ?? ""), arguments: fn.arguments ?? {} };
    });
    const usage = {
      inputTokens: num(json.prompt_eval_count),
      outputTokens: num(json.eval_count),
    };
    return {
      text: String(msg.content ?? ""),
      toolCalls: calls,
      usage: {
        ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
        ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      },
      stopReason: calls.length ? "tool_calls" : "stop",
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.body(request, true)),
      signal: request.signal,
    }).catch((err: unknown) => {
      if (request.signal?.aborted) throw new OnyxError("E_CANCELLED", "Request cancelled");
      throw new OnyxError("E_NETWORK", `Network error: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    });
    if (res.status < 200 || res.status >= 300) {
      throw errorFromStatus(res.status, await res.text().catch(() => ""), "Ollama");
    }
    const reader = res.body?.getReader();
    if (!reader) throw new OnyxError("E_BAD_RESPONSE", "Ollama: empty stream");
    const decoder = new TextDecoder();
    let buf = "";
    let toolCount = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const json = JSON.parse(line) as Record<string, unknown>;
        const msg = (json.message as Record<string, unknown> | undefined) ?? {};
        if (msg.content) yield { type: "text-delta", text: String(msg.content) };
        const calls = (msg.tool_calls as Array<Record<string, unknown>> | undefined) ?? [];
        for (const c of calls) {
          const fn = (c.function as Record<string, unknown> | undefined) ?? {};
          yield {
            type: "tool-call",
            call: { type: "tool_call", id: `ollama_${Date.now()}_${toolCount++}`, name: String(fn.name ?? ""), arguments: fn.arguments ?? {} },
          };
        }
        if (json.done) {
          yield {
            type: "usage",
            usage: {
              ...(num(json.prompt_eval_count) !== undefined ? { inputTokens: num(json.prompt_eval_count) } : {}),
              ...(num(json.eval_count) !== undefined ? { outputTokens: num(json.eval_count) } : {}),
            },
          };
        }
      }
    }
    yield { type: "done", stopReason: toolCount > 0 ? "tool_calls" : "stop" };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const res = await httpFetch(`${this.baseUrl}/api/tags`, { method: "GET", headers: {}, ...(signal ? { signal } : {}), timeoutMs: 10_000 });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, "Ollama");
    const json = JSON.parse(res.text) as { models?: Array<{ name?: string }> };
    return (json.models ?? []).filter((m) => m.name).map((m) => ({ id: m.name! }));
  }

  async verify(model: string, signal?: AbortSignal): Promise<void> {
    const res = await httpFetch(`${this.baseUrl}/api/chat`, {
      headers: {},
      body: { model, messages: [{ role: "user", content: "ping" }], stream: false, options: { num_predict: 1 } },
      ...(signal ? { signal } : {}),
      timeoutMs: 45_000,
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, "Ollama");
  }
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function createGroqAdapter(apiKey: string, options: { baseUrl?: string; timeoutMs?: number } = {}): OpenAICompatibleAdapter {
  const adapter = new OpenAICompatibleAdapter({
    id: "groq",
    name: "Groq",
    baseUrl: options.baseUrl ?? GROQ_DEFAULT_BASE,
    apiKey,
    tools: true,
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
  return adapter;
}
