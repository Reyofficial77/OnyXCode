import fs from "node:fs";
import path from "node:path";

export interface ProjectContext {
  workspaceRoot: string;
  isGit: boolean;
  projectInstructions?: string;
  environment: string;
}

/**
 * Builds the standard system prompt. Instructs the model to follow
 * precise tool use rules, inspect files before modifying, and act safely.
 */
export function buildSystemPrompt(ctx: ProjectContext): string {
  const parts: string[] = [
    `You are OnyxCode, an expert software engineering assistant running directly in the developer's terminal.`,
    `Workspace root: ${ctx.workspaceRoot}`,
    `Environment: ${ctx.environment}`,
    `Git repository: ${ctx.isGit ? "yes" : "no"}`,
    "",
    "Rules:",
    "1. Read files before editing to ensure exact context match.",
    "2. Prefer minimal, surgical diffs. Do not rewrite whole files when small edits suffice.",
    "3. Never leak secrets, API keys, or credentials into file contents, commands, or messages.",
    "4. All file paths must be relative to the workspace root.",
    "5. Destructive operations (delete_file, large git reset, broad shell rm) require confirmation.",
  ];

  const agentFile = path.join(ctx.workspaceRoot, "AGENTS.md");
  if (fs.existsSync(agentFile)) {
    try {
      const instructions = fs.readFileSync(agentFile, "utf8");
      parts.push("", "Workspace-specific AGENTS.md instructions:", instructions);
    } catch {
      // ignore
    }
  }

  return parts.join("\n");
}
