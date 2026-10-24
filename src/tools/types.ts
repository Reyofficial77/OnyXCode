import { z } from "zod";
import type { RiskLevel } from "../permissions/policy.js";

export interface ToolContext {
  workspaceRoot: string;
  maxOutputBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Undo checkpoint recorder. */
  checkpoint?: (path: string, originalContent: string | null) => void;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  risk: RiskLevel;
  schema: z.ZodType<TArgs>;
  /** JSON Schema parameters object exposed to providers. */
  parameters: Record<string, unknown>;
  /** Subject evaluated by permission policy (e.g. file path, command string). */
  subject: (args: TArgs) => string | undefined;
  /** Human summary shown in confirmation prompts. */
  summary: (args: TArgs) => string;
  run: (args: TArgs, ctx: ToolContext) => Promise<ToolResult>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<any>>();

  register<T>(tool: ToolDefinition<T>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  schemas(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.list().map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  }
}
