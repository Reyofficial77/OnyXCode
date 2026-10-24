import type { ChatMessage, ChatRequest, ChatResponse, ContentPart, StopReason, StreamEvent, ToolCallPart, Usage } from "./types.js";

export const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
export const GROQ_DEFAULT_BASE = "https://api.groq.com/openai/v1";

interface OpenAIMessage {
  role: string;
  content: string | Array<{ type: string; text?: string }> | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

/** Convert internal messages to OpenAI chat format (also used by Groq / compatible). */
export function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  for (const msg of messages) {
    const texts = msg.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
    if (msg.role === "tool") {
      for (const part of msg.content) {
        if (part.type === "tool_result") {
          out.push({ role: "tool", tool_call_id: part.toolCallId, content: part.content });
        }
      }
      continue;
    }
    if (msg.role === "assistant") {
      const calls = msg.content.filter((p): p is ToolCallPart => p.type === "tool_call");
      if (calls.length) {
        out.push({
          role: "assistant",
          content: texts || null,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
          })),
        });
      } else if (texts) {
        out.push({ role: "assistant", content: texts });
      }
      continue;
    }
    if (texts) out.push({ role: msg.role, content: texts });
  }
  return out;
}

export function parseOpenAIStop(finish: string | null | undefined): StopReason {
  switch (finish) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "content_filter":
      return "content_filter";
    default:
      return finish ? "unknown" : "stop";
  }
}

export function parseOpenAIUsage(usage: Record<string, unknown> | undefined): Usage | undefined {
  if (!usage) return undefined;
  const input = num(usage.prompt_tokens);
  const output = num(usage.completion_tokens);
  const total = num(usage.total_tokens) ?? (input !== undefined && output !== undefined ? input + output : undefined);
  if (input === undefined && output === undefined && total === undefined) return undefined;
  return { ...(input !== undefined ? { inputTokens: input } : {}), ...(output !== undefined ? { outputTokens: output } : {}), ...(total !== undefined ? { totalTokens: total } : {}) };
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function buildOpenAIRequestBody(request: ChatRequest, stream: boolean, tools?: unknown[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: toOpenAIMessages(request.messages),
    stream,
  };
  if (stream) body.stream_options = { include_usage: true };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
  return body;
}

/** Accumulates incremental tool_call argument fragments per index. */
export class ToolCallAccumulator {
  private readonly map = new Map<number, { id: string; name: string; args: string }>();

  add(delta: { index?: number; id?: string; function?: { name?: string; arguments?: string } }): void {
    const index = delta.index ?? 0;
    const existing = this.map.get(index) ?? { id: "", name: "", args: "" };
    if (delta.id) existing.id = delta.id;
    if (delta.function?.name) existing.name += delta.function.name;
    if (delta.function?.arguments) existing.args += delta.function.arguments;
    this.map.set(index, existing);
  }

  finish(): ToolCallPart[] {
    const out: ToolCallPart[] = [];
    for (const [index, v] of [...this.map.entries()].sort((a, b) => a[0] - b[0])) {
      if (!v.name) continue;
      out.push({
        type: "tool_call",
        id: v.id || `call_${index}_${Date.now()}`,
        name: v.name,
        arguments: safeParseJson(v.args),
      });
    }
    return out;
  }
}

export function safeParseJson(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text };
  }
}

/** Map a non-streaming OpenAI-style completion to ChatResponse. */
export function mapOpenAICompletion(json: Record<string, unknown>): ChatResponse {
  const choices = (json.choices as Array<Record<string, unknown>> | undefined) ?? [];
  const choice = choices[0];
  const message = (choice?.message as Record<string, unknown> | undefined) ?? {};
  const text = typeof message.content === "string" ? message.content : "";
  const calls = ((message.tool_calls as Array<Record<string, unknown>> | undefined) ?? []).map((c, i) => {
    const fn = (c.function as Record<string, unknown> | undefined) ?? {};
    return {
      type: "tool_call" as const,
      id: String(c.id ?? `call_${i}`),
      name: String(fn.name ?? ""),
      arguments: safeParseJson(String(fn.arguments ?? "{}")),
    };
  });
  const usage = parseOpenAIUsage(json.usage as Record<string, unknown> | undefined);
  return {
    text,
    toolCalls: calls,
    ...(usage ? { usage } : {}),
    stopReason: parseOpenAIStop(choice?.finish_reason as string | undefined),
  };
}

export function contentPartsToText(parts: ContentPart[]): string {
  return parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
}

export type { StreamEvent };
