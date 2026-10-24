import { OnyxError } from "../../utils/errors.js";
import { errorFromStatus, httpFetch, parseSse } from "../http.js";
import { toAnthropicTools } from "../schema-tools.js";
import type { ChatMessage, ChatRequest, ChatResponse, ModelInfo, ProviderAdapter, StopReason, StreamEvent, ToolCallPart, Usage } from "../types.js";

export const ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicOptions {
  baseUrl?: string;
  apiKey: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

/** Anthropic requires system prompts top-level and tool results as user blocks. */
export function toAnthropicMessages(messages: ChatMessage[]): { system?: string; messages: Array<{ role: "user" | "assistant"; content: unknown[] }> } {
  const systemParts: string[] = [];
  const out: Array<{ role: "user" | "assistant"; content: unknown[] }> = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n"));
      continue;
    }
    if (msg.role === "tool") {
      const blocks = msg.content
        .filter((p) => p.type === "tool_result")
        .map((p) => ({
          type: "tool_result",
          tool_use_id: (p as { toolCallId: string }).toolCallId,
          content: (p as { content: string }).content,
          is_error: Boolean((p as { isError?: boolean }).isError),
        }));
      if (blocks.length) out.push({ role: "user", content: blocks });
      continue;
    }
    const blocks: unknown[] = [];
    for (const part of msg.content) {
      if (part.type === "text" && part.text) blocks.push({ type: "text", text: part.text });
      if (part.type === "tool_call") {
        blocks.push({ type: "tool_use", id: part.id, name: part.name, input: part.arguments ?? {} });
      }
    }
    if (blocks.length) out.push({ role: msg.role === "assistant" ? "assistant" : "user", content: blocks });
  }
  return { ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}), messages: out };
}

function mapStop(reason: string | undefined): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    case "refusal":
      return "content_filter";
    default:
      return reason ? "unknown" : "stop";
  }
}

function mapUsage(u: Record<string, unknown> | undefined): Usage | undefined {
  if (!u) return undefined;
  const input = typeof u.input_tokens === "number" ? u.input_tokens : undefined;
  const output = typeof u.output_tokens === "number" ? u.output_tokens : undefined;
  if (input === undefined && output === undefined) return undefined;
  return {
    ...(input !== undefined ? { inputTokens: input } : {}),
    ...(output !== undefined ? { outputTokens: output } : {}),
    ...(input !== undefined && output !== undefined ? { totalTokens: input + output } : {}),
  };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly type = "anthropic";
  readonly id = "anthropic";
  readonly supportsTools = true;
  readonly supportsStreaming = true;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: AnthropicOptions) {
    this.baseUrl = (options.baseUrl ?? ANTHROPIC_DEFAULT_BASE).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.extraHeaders = options.headers ?? {};
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      ...this.extraHeaders,
    };
  }

  private body(request: ChatRequest, stream: boolean): Record<string, unknown> {
    const { system, messages } = toAnthropicMessages(request.messages);
    return {
      model: request.model,
      max_tokens: request.maxTokens ?? 8192,
      messages,
      ...(system ? { system } : {}),
      ...(request.tools && request.tools.length ? { tools: toAnthropicTools(request.tools) } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      stream,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const res = await httpFetch(`${this.baseUrl}/messages`, {
      headers: this.headers(),
      body: this.body(request, false),
      ...(request.signal ? { signal: request.signal } : {}),
      timeoutMs: this.timeoutMs,
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, "Anthropic");
    const json = parseJson(res.text, "Anthropic");
    const blocks = (json.content as AnthropicBlock[] | undefined) ?? [];
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const toolCalls: ToolCallPart[] = blocks
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ type: "tool_call", id: b.id ?? "", name: b.name ?? "", arguments: b.input ?? {} }));
    const usage = mapUsage(json.usage as Record<string, unknown> | undefined);
    return { text, toolCalls, ...(usage ? { usage } : {}), stopReason: mapStop(json.stop_reason as string | undefined) };
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(this.body(request, true)),
      signal: request.signal,
    }).catch((err: unknown) => {
      if (request.signal?.aborted) throw new OnyxError("E_CANCELLED", "Request cancelled");
      throw new OnyxError("E_NETWORK", `Network error: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    });
    if (res.status < 200 || res.status >= 300) {
      throw errorFromStatus(res.status, await res.text().catch(() => ""), "Anthropic");
    }

    // Track tool_use blocks by content index.
    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
    let stopReason: string | undefined;
    let usage: Usage | undefined;

    for await (const evt of parseSse(res, request.signal)) {
      const json = tryJson(evt.data);
      if (!json) continue;
      const type = String(json.type ?? evt.event ?? "");
      if (type === "error") {
        const err = json.error as Record<string, unknown> | undefined;
        throw new OnyxError("E_BAD_RESPONSE", `Anthropic: ${String(err?.message ?? "stream error")}`);
      }
      if (type === "message_start") {
        const m = json.message as Record<string, unknown> | undefined;
        usage = mapUsage(m?.usage as Record<string, unknown> | undefined);
        if (usage) yield { type: "usage", usage };
        continue;
      }
      if (type === "message_delta") {
        const d = json.delta as Record<string, unknown> | undefined;
        if (typeof d?.stop_reason === "string") stopReason = d.stop_reason;
        const u = mapUsage(json.usage as Record<string, unknown> | undefined);
        if (u?.outputTokens !== undefined) {
          const inputTokens = usage?.inputTokens;
          const next: Usage = {
            ...(inputTokens !== undefined ? { inputTokens } : {}),
            outputTokens: u.outputTokens,
            ...(inputTokens !== undefined ? { totalTokens: inputTokens + u.outputTokens } : {}),
          };
          yield { type: "usage", usage: next };
        }
        continue;
      }
      if (type === "content_block_start") {
        const index = Number(json.index ?? 0);
        const block = json.content_block as AnthropicBlock | undefined;
        if (block?.type === "tool_use") {
          toolBlocks.set(index, { id: block.id ?? "", name: block.name ?? "", json: "" });
        }
        continue;
      }
      if (type === "content_block_delta") {
        const index = Number(json.index ?? 0);
        const delta = json.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          yield { type: "text-delta", text: delta.text };
        } else if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
          yield { type: "reasoning-delta", text: delta.thinking };
        } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
          const block = toolBlocks.get(index);
          if (block) block.json += delta.partial_json;
        }
        continue;
      }
      if (type === "content_block_stop") {
        const index = Number(json.index ?? 0);
        const block = toolBlocks.get(index);
        if (block) {
          let args: unknown = {};
          try {
            args = block.json.trim() ? JSON.parse(block.json) : {};
          } catch {
            args = { __raw: block.json };
          }
          yield { type: "tool-call", call: { type: "tool_call", id: block.id, name: block.name, arguments: args } };
          toolBlocks.delete(index);
        }
      }
    }
    yield { type: "done", stopReason: mapStop(stopReason) };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const res = await httpFetch(`${this.baseUrl}/models?limit=100`, {
      method: "GET",
      headers: this.headers(),
      ...(signal ? { signal } : {}),
      timeoutMs: 30_000,
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, "Anthropic");
    const json = parseJson(res.text, "Anthropic");
    const data = (json.data as Array<Record<string, unknown>> | undefined) ?? [];
    return data
      .filter((m) => typeof m.id === "string")
      .map((m) => ({ id: String(m.id), ...(typeof m.display_name === "string" ? { name: m.display_name } : {}) }));
  }

  async verify(model: string, signal?: AbortSignal): Promise<void> {
    const res = await httpFetch(`${this.baseUrl}/messages`, {
      headers: this.headers(),
      body: { model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] },
      ...(signal ? { signal } : {}),
      timeoutMs: 45_000,
    });
    if (res.status < 200 || res.status >= 300) throw errorFromStatus(res.status, res.text, "Anthropic");
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
