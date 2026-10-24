export type Role = "system" | "user" | "assistant" | "tool";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolCallPart {
  type: "tool_call";
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolResultPart {
  type: "tool_result";
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
}

export type ContentPart = TextPart | ToolCallPart | ToolResultPart;

export interface ChatMessage {
  role: Role;
  content: ContentPart[];
}

export function textMessage(role: "system" | "user" | "assistant", text: string): ChatMessage {
  return { role, content: [{ type: "text", text }] };
}

export function messageText(msg: ChatMessage): string {
  return msg.content
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema object for parameters. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call"; call: ToolCallPart }
  | { type: "usage"; usage: Usage }
  | { type: "done"; stopReason: StopReason }
  | { type: "error"; error: Error };

export type StopReason = "stop" | "length" | "tool_calls" | "content_filter" | "error" | "unknown";

export interface ChatResponse {
  text: string;
  toolCalls: ToolCallPart[];
  usage?: Usage;
  stopReason: StopReason;
}

export interface ModelInfo {
  id: string;
  name?: string;
  contextWindow?: number;
}

/** Adapter contract implemented by every provider integration. */
export interface ProviderAdapter {
  readonly id: string;
  readonly type: string;
  /** True when the adapter can send tool schemas to the model. */
  readonly supportsTools: boolean;
  readonly supportsStreaming: boolean;

  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<StreamEvent>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  /** Minimal documented request; used by `provider test` / verify. */
  verify(model: string, signal?: AbortSignal): Promise<void>;
}

export interface ProviderRuntimeInfo {
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
}
