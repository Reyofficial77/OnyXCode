import { OnyxError } from "../../utils/errors.js";
import { errorFromStatus, httpFetch, parseSse } from "../http.js";
import { toGeminiTools } from "../schema-tools.js";
import type { ChatMessage, ChatRequest, ChatResponse, ModelInfo, ProviderAdapter, StopReason, StreamEvent, ToolCallPart, Usage } from "../types.js";

export const GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiOptions {
  baseUrl?: string;
  apiKey: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thought?: boolean;
}

/** Convert internal history to Gemini `contents`. */
export function toGeminiContents(messages: ChatMessage[]): { systemInstruction?: { parts: Array<{ text: string }> }; contents: Array<{ role: string; parts: GeminiPart[] }> } {
  const systemParts: string[] = [];
  const contents: Array<{ role: string; parts: GeminiPart[] }> = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n"));
      continue;
    }
    if (msg.role === "tool") {
      const parts: GeminiPart[] = msg.content
        .filter((p) => p.type === "tool_result")
        .map((p) => ({
          functionResponse: {
            name: (p as { name: string }).name,
            response: { result: (p as { content: string }).content },
          },
        }));
      if (parts.length) contents.push({ role: "user", parts });
      continue;
    }
    const parts: GeminiPart[] = [];
    for (const part of msg.content) {
      if (part.type === "text" && part.text) parts.push({ text: part.text });
      if (part.type === "tool_call") {
        parts.push({ functionCall: { name: part.name, args: (part.arguments as Record<string, unknown>) ?? {} } });
      }
    }
    if (parts.length) contents.push({ role: msg.role === "assistant" ? "model" : "user", parts });
  }
  return {
    ...(systemParts.length ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } } : {}),
    contents,
  };
}

function mapStop(reason: string | undefined): StopReason {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
      return "content_filter";
    default:
      return reason ? "unknown" : "stop";
  }
}

function mapUsage(u: Record<string, unknown> | undefined): Usage | undefined {
  if (!u) return undefined;
  const input = typeof u.promptTokenCount === "number" ? u.promptTokenCount : undefined;
  const output = typeof u.candidatesTokenCount === "number" ? u.candidatesTokenCount : undefined;
  const total = typeof u.totalTokenCount === "number" ? u.totalTokenCount : undefined;
  if (input === undefined && output === undefined) return undefined;
  return {
    ...(input !== undefined ? { inputTokens: input } : {}),
    ...(output !== undefined ? { outputTokens: output } : {}),
    ...(total !== undefined ? { totalTokens: total } : {}),
  };
}

export class GeminiAdapter implements ProviderAdapter {
  readonly type = "gemini";
  readonly id = "gemini";
  readonly supportsTools = true;
  readonly supportsStreaming = true;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: GeminiOptions) {
    this.baseUrl = (options.baseUrl ?? GEMINI_DEFAULT_BASE).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.extraHeaders = options.headers ?? {};
  }

  /** Key goes in a header, never in a URL (URLs leak into logs/proxies). */
  private headers(): Record<string, string> {
    return { "x-goog-api-key": this.apiKey, ...this.extraHeaders };
  }

  private body(request: ChatRequest): Record<string, unknown> {
    const { systemInstruction, contents } = toGeminiContents(request.messages);
    return {
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(request.tools && request.tools.length ? { tools: toGeminiTools(request.tools) } : {}),
      ...(request.temperature !== undefined || request.maxTokens !== undefined
        ? {
            generationConfig: {
              ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
              ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
            },
          }
        : {}),
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const res = await httpFetch(`${this.baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`, {
      headers: this.headers(),
      body: this.body(request),
      ...(request.signal ? { signal: request.signal } : {}),
      timeoutMs: this.timeoutMs,
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, "Gemini");
    const json = parseJson(res.text, "Gemini");
    const candidate = (json.candidates as Array<Record<string, unknown>> | undefined)?.[0];
    const parts = ((candidate?.content as Record<string, unknown> | undefined)?.parts as GeminiPart[] | undefined) ?? [];
    const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text ?? "").join("");
    const toolCalls: ToolCallPart[] = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        type: "tool_call",
        id: `gemini_${Date.now()}_${i}`,
        name: p.functionCall?.name ?? "",
        arguments: p.functionCall?.args ?? {},
      }));
    const usage = mapUsage(json.usageMetadata as Record<string, unknown> | undefined);
    const stop = mapStop(candidate?.finishReason as string | undefined);
    return {
      text,
      toolCalls,
      ...(usage ? { usage } : {}),
      stopReason: toolCalls.length ? "tool_calls" : stop,
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    const res = await fetch(`${this.baseUrl}/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(this.body(request)),
      signal: request.signal,
    }).catch((err: unknown) => {
      if (request.signal?.aborted) throw new OnyxError("E_CANCELLED", "Request cancelled");
      throw new OnyxError("E_NETWORK", `Network error: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    });
    if (res.status < 200 || res.status >= 300) {
      throw errorFromStatus(res.status, await res.text().catch(() => ""), "Gemini");
    }

    let finish: string | undefined;
    let toolIndex = 0;
    let usage: Usage | undefined;

    for await (const evt of parseSse(res, request.signal)) {
      const json = tryJson(evt.data);
      if (!json) continue;
      if (json.error) {
        const err = json.error as Record<string, unknown>;
        throw new OnyxError("E_BAD_RESPONSE", `Gemini: ${String(err.message ?? "stream error")}`);
      }
      const u = mapUsage(json.usageMetadata as Record<string, unknown> | undefined);
      if (u) {
        usage = u;
        yield { type: "usage", usage: u };
      }
      const candidate = (json.candidates as Array<Record<string, unknown>> | undefined)?.[0];
      if (!candidate) continue;
      if (typeof candidate.finishReason === "string") finish = candidate.finishReason;
      const parts = ((candidate.content as Record<string, unknown> | undefined)?.parts as GeminiPart[] | undefined) ?? [];
      for (const part of parts) {
        if (typeof part.text === "string" && part.text) {
          yield { type: part.thought ? "reasoning-delta" : "text-delta", text: part.text };
        }
        if (part.functionCall) {
          yield {
            type: "tool-call",
            call: {
              type: "tool_call",
              id: `gemini_${Date.now()}_${toolIndex++}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args ?? {},
            },
          };
        }
      }
    }
    void usage;
    yield { type: "done", stopReason: toolIndex > 0 ? "tool_calls" : mapStop(finish) };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const res = await httpFetch(`${this.baseUrl}/models?pageSize=200`, {
      method: "GET",
      headers: this.headers(),
      ...(signal ? { signal } : {}),
      timeoutMs: 30_000,
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, "Gemini");
    const json = parseJson(res.text, "Gemini");
    const models = (json.models as Array<Record<string, unknown>> | undefined) ?? [];
    return models
      .filter((m) => typeof m.name === "string")
      .filter((m) => (m.supportedGenerationMethods as string[] | undefined)?.includes("generateContent") ?? true)
      .map((m) => ({
        id: String(m.name).replace(/^models\//, ""),
        ...(typeof m.displayName === "string" ? { name: m.displayName } : {}),
        ...(typeof m.inputTokenLimit === "number" ? { contextWindow: m.inputTokenLimit } : {}),
      }));
  }

  async verify(model: string, signal?: AbortSignal): Promise<void> {
    const res = await httpFetch(`${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      headers: this.headers(),
      body: { contents: [{ role: "user", parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 1 } },
      ...(signal ? { signal } : {}),
      timeoutMs: 45_000,
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, "Gemini");
  }
}

function parseJson(text: string, name: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new OnyxError("E_BAD_RESPONSE", `${name}: response is not valid JSON`);
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
