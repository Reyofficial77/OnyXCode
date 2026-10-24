import { OnyxError } from "../utils/errors.js";
import type { PermissionEngine } from "../permissions/policy.js";
import type { ChatMessage, ContentPart, ProviderAdapter, ToolCallPart, ToolResultPart } from "../providers/types.js";
import type { ToolContext, ToolRegistry } from "../tools/types.js";

export interface AgentLoopOptions {
  adapter: ProviderAdapter;
  model: string;
  tools: ToolRegistry;
  permissions: PermissionEngine;
  workspaceRoot: string;
  maxSteps?: number;
  maxOutputBytes?: number;
  toolTimeoutMs?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolStart?: (name: string, summary: string) => void;
  onToolEnd?: (name: string, output: string, isError?: boolean) => void;
  checkpoint?: (path: string, originalContent: string | null) => void;
}

export interface AgentRunResult {
  messages: ChatMessage[];
  steps: number;
  completed: boolean;
  finalText: string;
}

/**
 * Autonomous agent loop: runs until the model returns a direct text response
 * without tool calls, or until maxSteps is exceeded.
 */
export async function runAgentLoop(
  initialMessages: ChatMessage[],
  options: AgentLoopOptions,
): Promise<AgentRunResult> {
  const maxSteps = options.maxSteps ?? 30;
  const history: ChatMessage[] = [...initialMessages];
  let step = 0;
  let finalText = "";

  while (step < maxSteps) {
    step++;
    if (options.signal?.aborted) throw new OnyxError("E_CANCELLED", "Agent loop cancelled");

    let responseText = "";
    const toolCalls: ToolCallPart[] = [];

    if (options.adapter.supportsStreaming) {
      for await (const evt of options.adapter.stream({
        model: options.model,
        messages: history,
        tools: options.tools.schemas(),
        signal: options.signal,
      })) {
        if (evt.type === "text-delta") {
          responseText += evt.text;
          options.onDelta?.(evt.text);
        } else if (evt.type === "reasoning-delta") {
          options.onReasoning?.(evt.text);
        } else if (evt.type === "tool-call") {
          toolCalls.push(evt.call);
        }
      }
    } else {
      const resp = await options.adapter.chat({
        model: options.model,
        messages: history,
        tools: options.tools.schemas(),
        signal: options.signal,
      });
      responseText = resp.text;
      if (resp.text) options.onDelta?.(resp.text);
      toolCalls.push(...resp.toolCalls);
    }

    finalText = responseText;

    // Record the assistant's turn
    const assistantParts: ContentPart[] = [];
    if (responseText) assistantParts.push({ type: "text", text: responseText });
    for (const call of toolCalls) assistantParts.push(call);
    history.push({ role: "assistant", content: assistantParts });

    if (toolCalls.length === 0) {
      // Completed normally
      return { messages: history, steps: step, completed: true, finalText };
    }

    // Execute each tool call
    const toolResultParts: ToolResultPart[] = [];

    for (const call of toolCalls) {
      if (options.signal?.aborted) throw new OnyxError("E_CANCELLED", "Agent loop cancelled");

      const def = options.tools.get(call.name);
      if (!def) {
        toolResultParts.push({
          type: "tool_result",
          toolCallId: call.id,
          name: call.name,
          content: `Error: tool "${call.name}" is not registered.`,
          isError: true,
        });
        continue;
      }

      // Parse arguments with Zod
      const parsed = def.schema.safeParse(call.arguments);
      if (!parsed.success) {
        toolResultParts.push({
          type: "tool_result",
          toolCallId: call.id,
          name: call.name,
          content: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          isError: true,
        });
        continue;
      }

      const summary = def.summary(parsed.data);
      options.onToolStart?.(call.name, summary);

      // Check permission policy
      const decision = await options.permissions.request({
        tool: call.name,
        summary,
        risk: def.risk,
        sessionScopeKey: def.subject(parsed.data),
      });

      if (!decision.allowed) {
        const msg = decision.reason ?? "Permission denied";
        options.onToolEnd?.(call.name, msg, true);
        toolResultParts.push({
          type: "tool_result",
          toolCallId: call.id,
          name: call.name,
          content: `Action denied: ${msg}`,
          isError: true,
        });
        continue;
      }

      // Execute tool
      const ctx: ToolContext = {
        workspaceRoot: options.workspaceRoot,
        maxOutputBytes: options.maxOutputBytes ?? 200_000,
        timeoutMs: options.toolTimeoutMs ?? 120_000,
        signal: options.signal,
        checkpoint: options.checkpoint,
      };

      try {
        const res = await def.run(parsed.data, ctx);
        options.onToolEnd?.(call.name, res.content, res.isError);
        toolResultParts.push({
          type: "tool_result",
          toolCallId: call.id,
          name: call.name,
          content: res.content,
          isError: res.isError,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        options.onToolEnd?.(call.name, msg, true);
        toolResultParts.push({
          type: "tool_result",
          toolCallId: call.id,
          name: call.name,
          content: `Tool execution failed: ${msg}`,
          isError: true,
        });
      }
    }

    history.push({ role: "tool", content: toolResultParts });
  }

  throw new OnyxError("E_STEP_LIMIT", `Agent reached the maximum step limit (${maxSteps}) without completing.`);
}
