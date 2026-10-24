import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runProcess } from "../utils/process.js";
import type { ToolDefinition } from "./types.js";

function requireGit(root: string): string | undefined {
  if (!fs.existsSync(path.join(root, ".git"))) {
    return "Workspace is not a Git repository. Run `git init` first.";
  }
  return undefined;
}

export const gitStatusTool: ToolDefinition<Record<string, never>> = {
  name: "git_status",
  description: "Show repository working tree status (clean/modified/untracked files).",
  risk: "read",
  schema: z.object({}),
  parameters: { type: "object", properties: {} },
  subject: () => "(git status)",
  summary: () => "read git status",
  async run(_args, ctx) {
    const err = requireGit(ctx.workspaceRoot);
    if (err) return { content: err, isError: true };
    const res = await runProcess("git status --short --branch", {
      cwd: ctx.workspaceRoot,
      timeoutMs: 15_000,
      signal: ctx.signal,
    });
    return { content: res.stdout || "(working tree clean)" };
  },
};

export const gitDiffTool: ToolDefinition<{ staged?: boolean; path?: string }> = {
  name: "git_diff",
  description: "Show git diff of unstaged or staged changes.",
  risk: "read",
  schema: z.object({
    staged: z.boolean().optional(),
    path: z.string().optional(),
  }),
  parameters: {
    type: "object",
    properties: {
      staged: { type: "boolean", description: "Show staged diff instead of working tree diff" },
      path: { type: "string", description: "Restrict diff to this file or directory" },
    },
  },
  subject: (a) => a.path ?? "(repo)",
  summary: (a) => `git diff${a.staged ? " --staged" : ""}${a.path ? ` for ${a.path}` : ""}`,
  async run(args, ctx) {
    const err = requireGit(ctx.workspaceRoot);
    if (err) return { content: err, isError: true };
    const cmd = ["git diff", args.staged ? "--staged" : "", args.path ? `-- "${args.path}"` : ""]
      .filter(Boolean)
      .join(" ");
    const res = await runProcess(cmd, { cwd: ctx.workspaceRoot, timeoutMs: 30_000, signal: ctx.signal });
    return { content: res.stdout || "(no changes)" };
  },
};

export const gitLogTool: ToolDefinition<{ limit?: number; oneline?: boolean }> = {
  name: "git_log",
  description: "Show recent commit history.",
  risk: "read",
  schema: z.object({
    limit: z.number().int().min(1).max(50).optional(),
    oneline: z.boolean().optional(),
  }),
  parameters: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Number of commits (default: 10)" },
      oneline: { type: "boolean", description: "Compact one-line per commit format" },
    },
  },
  subject: () => "(git log)",
  summary: (a) => `git log (limit: ${a.limit ?? 10})`,
  async run(args, ctx) {
    const err = requireGit(ctx.workspaceRoot);
    if (err) return { content: err, isError: true };
    const limit = args.limit ?? 10;
    const format = args.oneline ? "--oneline" : "--stat";
    const res = await runProcess(`git log -n ${limit} ${format}`, {
      cwd: ctx.workspaceRoot,
      timeoutMs: 15_000,
      signal: ctx.signal,
    });
    return { content: res.stdout || "(no commits yet)" };
  },
};
