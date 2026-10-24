import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { detectDangerousCommand } from "../permissions/policy.js";
import { runProcess } from "../utils/process.js";
import type { ToolDefinition } from "./types.js";

export const runCommandTool: ToolDefinition<{ command: string; timeoutMs?: number }> = {
  name: "run_command",
  description: "Execute a shell command within the workspace directory. Timeouts and large outputs are automatically capped.",
  risk: "dangerous",
  schema: z.object({
    command: z.string().min(1),
    timeoutMs: z.number().int().min(1000).max(600_000).optional(),
  }),
  parameters: {
    type: "object",
    properties: {
      command: { type: "string" },
      timeoutMs: { type: "integer" },
    },
    required: ["command"],
  },
  subject: (a) => a.command,
  summary: (a) => {
    const danger = detectDangerousCommand(a.command);
    const badge = danger.length ? ` [${danger.join(", ")}]` : "";
    return `run command: ${a.command}${badge}`;
  },
  async run(args, ctx) {
    const res = await runProcess(args.command, {
      cwd: ctx.workspaceRoot,
      timeoutMs: args.timeoutMs ?? ctx.timeoutMs,
      maxOutputBytes: ctx.maxOutputBytes,
      signal: ctx.signal,
    });
    const parts = [
      res.stdout ? `stdout:\n${res.stdout}` : "",
      res.stderr ? `stderr:\n${res.stderr}` : "",
      res.timedOut ? `[command timed out after ${res.durationMs}ms]` : "",
      res.truncated ? `[output truncated to ${ctx.maxOutputBytes} bytes]` : "",
      `exit code: ${res.exitCode ?? "(none)"}`,
    ].filter(Boolean);
    return {
      content: parts.join("\n\n") || "(no output)",
      isError: (res.exitCode ?? 0) !== 0 || res.timedOut,
      metadata: { exitCode: res.exitCode, durationMs: res.durationMs },
    };
  },
};

export const runTestsTool: ToolDefinition<{ command?: string }> = {
  name: "run_tests",
  description: "Detect and execute project unit tests, returning a clean summary of failures.",
  risk: "dangerous",
  schema: z.object({ command: z.string().optional() }),
  parameters: {
    type: "object",
    properties: { command: { type: "string", description: "Override auto-detected test command" } },
  },
  subject: (a) => a.command ?? "test",
  summary: (a) => `run tests${a.command ? ` (${a.command})` : ""}`,
  async run(args, ctx) {
    const cmd = args.command ?? detectTestCommand(ctx.workspaceRoot);
    if (!cmd) {
      return { content: "No test runner detected. Provide a test command explicitly.", isError: true };
    }
    const res = await runProcess(cmd, {
      cwd: ctx.workspaceRoot,
      timeoutMs: ctx.timeoutMs,
      maxOutputBytes: ctx.maxOutputBytes,
      signal: ctx.signal,
    });
    return {
      content: `${cmd}\n\n${res.stdout}\n${res.stderr}\nexit code: ${res.exitCode ?? 0}`,
      isError: (res.exitCode ?? 0) !== 0,
    };
  },
};

export const runLinterTool: ToolDefinition<{ command?: string }> = {
  name: "run_linter",
  description: "Detect and run the project linter or typechecker.",
  risk: "dangerous",
  schema: z.object({ command: z.string().optional() }),
  parameters: {
    type: "object",
    properties: { command: { type: "string" } },
  },
  subject: (a) => a.command ?? "lint",
  summary: (a) => `run linter${a.command ? ` (${a.command})` : ""}`,
  async run(args, ctx) {
    const cmd = args.command ?? detectLintCommand(ctx.workspaceRoot);
    if (!cmd) {
      return { content: "No linter detected. Provide a lint command explicitly.", isError: true };
    }
    const res = await runProcess(cmd, {
      cwd: ctx.workspaceRoot,
      timeoutMs: ctx.timeoutMs,
      maxOutputBytes: ctx.maxOutputBytes,
      signal: ctx.signal,
    });
    return {
      content: `${cmd}\n\n${res.stdout}\n${res.stderr}\nexit code: ${res.exitCode ?? 0}`,
      isError: (res.exitCode ?? 0) !== 0,
    };
  },
};

export const projectInfoTool: ToolDefinition<Record<string, never>> = {
  name: "project_info",
  description: "Summarize project metadata (framework, package manager, git status, entry points).",
  risk: "read",
  schema: z.object({}),
  parameters: { type: "object", properties: {} },
  subject: () => ".",
  summary: () => "read project info",
  async run(_args, ctx) {
    const root = ctx.workspaceRoot;
    const pkgPath = path.join(root, "package.json");
    const summary: Record<string, unknown> = { root };

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
        summary.name = pkg.name;
        summary.version = pkg.version;
        summary.scripts = Object.keys((pkg.scripts as Record<string, string> | undefined) ?? {});
        summary.dependencies = Object.keys((pkg.dependencies as Record<string, string> | undefined) ?? {});
      } catch {
        // ignore
      }
    }
    if (fs.existsSync(path.join(root, "Cargo.toml"))) summary.rust = true;
    if (fs.existsSync(path.join(root, "pyproject.toml")) || fs.existsSync(path.join(root, "requirements.txt"))) summary.python = true;
    if (fs.existsSync(path.join(root, "go.mod"))) summary.go = true;
    summary.git = fs.existsSync(path.join(root, ".git"));

    return { content: JSON.stringify(summary, null, 2) };
  },
};

function detectTestCommand(root: string): string | undefined {
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      if (pkg.scripts?.test) return "npm test";
    } catch {
      // ignore
    }
  }
  if (fs.existsSync(path.join(root, "Cargo.toml"))) return "cargo test";
  if (fs.existsSync(path.join(root, "pytest.ini")) || fs.existsSync(path.join(root, "pyproject.toml"))) return "pytest";
  if (fs.existsSync(path.join(root, "go.mod"))) return "go test ./...";
  return undefined;
}

function detectLintCommand(root: string): string | undefined {
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      if (pkg.scripts?.lint) return "npm run lint";
      if (pkg.scripts?.typecheck) return "npm run typecheck";
    } catch {
      // ignore
    }
  }
  return undefined;
}
