import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import ignore from "ignore";
import { resolveWorkspacePath, isSensitivePath, validateFileName } from "../utils/workspace.js";
import type { ToolDefinition } from "./types.js";

const DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".onyxcode",
  ".next",
  ".nuxt",
  "target",
  "vendor",
];

export const listFilesTool: ToolDefinition<{ path?: string; recursive?: boolean; maxResults?: number }> = {
  name: "list_files",
  description: "List files and directories in the workspace, respecting .gitignore and hiding sensitive files by default.",
  risk: "read",
  schema: z.object({
    path: z.string().optional().describe("Directory relative to workspace root (default: .)"),
    recursive: z.boolean().optional().describe("Recurse into subdirectories (default: false)"),
    maxResults: z.number().int().min(1).max(500).optional().describe("Maximum entries to return (default: 100)"),
  }),
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory relative to workspace root (default: .)" },
      recursive: { type: "boolean", description: "Recurse into subdirectories (default: false)" },
      maxResults: { type: "integer", description: "Maximum entries to return (default: 100)" },
    },
  },
  subject: (a) => a.path ?? ".",
  summary: (a) => `list files in ${a.path ?? "."}${a.recursive ? " (recursive)" : ""}`,
  async run(args, ctx) {
    const dir = resolveWorkspacePath(args.path ?? ".", { root: ctx.workspaceRoot });
    const ig = loadGitignore(ctx.workspaceRoot);
    const results: string[] = [];
    const max = args.maxResults ?? 100;

    function walk(current: string, relBase: string) {
      if (results.length >= max) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (results.length >= max) break;
        const rel = path.join(relBase, e.name).split(path.sep).join("/");
        if (DEFAULT_IGNORE.includes(e.name) || ig.ignores(rel)) continue;
        if (isSensitivePath(e.name)) continue;
        if (e.isDirectory()) {
          results.push(`${rel}/`);
          if (args.recursive) walk(path.join(current, e.name), rel);
        } else {
          results.push(rel);
        }
      }
    }

    walk(dir.absolute, args.path ? dir.relative : "");
    return { content: results.join("\n") || "(empty directory)" };
  },
};

export const readFileTool: ToolDefinition<{ path: string; offset?: number; limit?: number }> = {
  name: "read_file",
  description: "Read the contents of a file within the workspace with optional line offset/limit.",
  risk: "read",
  schema: z.object({
    path: z.string().min(1).describe("File path relative to workspace root"),
    offset: z.number().int().min(1).optional().describe("Start line (1-based)"),
    limit: z.number().int().min(1).max(2000).optional().describe("Maximum lines to read"),
  }),
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to workspace root" },
      offset: { type: "integer", description: "Start line (1-based)" },
      limit: { type: "integer", description: "Maximum lines to read" },
    },
    required: ["path"],
  },
  subject: (a) => a.path,
  summary: (a) => `read ${a.path}${a.offset ? ` (from line ${a.offset})` : ""}`,
  async run(args, ctx) {
    const target = resolveWorkspacePath(args.path, { root: ctx.workspaceRoot });
    if (!fs.existsSync(target.absolute)) {
      return { content: `File not found: ${args.path}`, isError: true };
    }
    const stat = fs.statSync(target.absolute);
    if (stat.isDirectory()) {
      return { content: `Path is a directory, not a file: ${args.path}`, isError: true };
    }
    const raw = fs.readFileSync(target.absolute, "utf8");
    const lines = raw.split("\n");
    const offset = Math.max(1, args.offset ?? 1);
    const limit = args.limit ?? 500;
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice.map((l, i) => `${offset + i}: ${l}`).join("\n");
    return {
      content: numbered || "(file is empty)",
      metadata: { totalLines: lines.length, offset, returnedLines: slice.length },
    };
  },
};

export const writeFileTool: ToolDefinition<{ path: string; content: string }> = {
  name: "write_file",
  description: "Create or completely overwrite a file in the workspace.",
  risk: "write",
  schema: z.object({
    path: z.string().min(1),
    content: z.string(),
  }),
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  subject: (a) => a.path,
  summary: (a) => `write ${a.path} (${a.content.length} chars)`,
  async run(args, ctx) {
    const nameErr = validateFileName(path.basename(args.path));
    if (nameErr) return { content: nameErr, isError: true };
    const target = resolveWorkspacePath(args.path, { root: ctx.workspaceRoot });
    const original = fs.existsSync(target.absolute) ? fs.readFileSync(target.absolute, "utf8") : null;
    ctx.checkpoint?.(target.relative, original);
    fs.mkdirSync(path.dirname(target.absolute), { recursive: true });
    fs.writeFileSync(target.absolute, args.content, "utf8");
    return { content: `Wrote ${args.content.length} bytes to ${target.relative}` };
  },
};

export const deleteFileTool: ToolDefinition<{ path: string }> = {
  name: "delete_file",
  description: "Delete a file inside the workspace.",
  risk: "dangerous",
  schema: z.object({ path: z.string().min(1) }),
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
  subject: (a) => a.path,
  summary: (a) => `delete ${a.path}`,
  async run(args, ctx) {
    const target = resolveWorkspacePath(args.path, { root: ctx.workspaceRoot });
    if (!fs.existsSync(target.absolute)) return { content: `File does not exist: ${args.path}`, isError: true };
    const original = fs.readFileSync(target.absolute, "utf8");
    ctx.checkpoint?.(target.relative, original);
    fs.unlinkSync(target.absolute);
    return { content: `Deleted ${target.relative}` };
  },
};

export const searchFilesTool: ToolDefinition<{ query: string; path?: string; maxResults?: number }> = {
  name: "search_files",
  description: "Search file contents in the workspace for a literal substring or regex.",
  risk: "read",
  schema: z.object({
    query: z.string().min(1),
    path: z.string().optional(),
    maxResults: z.number().int().min(1).max(200).optional(),
  }),
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      path: { type: "string" },
      maxResults: { type: "integer" },
    },
    required: ["query"],
  },
  subject: (a) => a.path ?? ".",
  summary: (a) => `search for "${a.query}" in ${a.path ?? "."}`,
  async run(args, ctx) {
    const base = resolveWorkspacePath(args.path ?? ".", { root: ctx.workspaceRoot });
    const ig = loadGitignore(ctx.workspaceRoot);
    const matches: string[] = [];
    const max = args.maxResults ?? 50;

    let re: RegExp;
    try {
      re = new RegExp(args.query, "i");
    } catch {
      re = new RegExp(args.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }

    function searchDir(dir: string, relBase: string) {
      if (matches.length >= max) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (matches.length >= max) break;
        const rel = path.join(relBase, e.name).split(path.sep).join("/");
        if (DEFAULT_IGNORE.includes(e.name) || ig.ignores(rel) || isSensitivePath(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          searchDir(full, rel);
        } else {
          try {
            const content = fs.readFileSync(full, "utf8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length && matches.length < max; i++) {
              if (re.test(lines[i]!)) {
                matches.push(`${rel}:${i + 1}: ${lines[i]!.trim()}`);
              }
            }
          } catch {
            // binary or unreadable, ignore
          }
        }
      }
    }

    searchDir(base.absolute, args.path ? base.relative : "");
    return { content: matches.join("\n") || "No matches found." };
  },
};

function loadGitignore(root: string): ReturnType<typeof ignore> {
  const ig = ignore();
  const file = path.join(root, ".gitignore");
  if (fs.existsSync(file)) {
    try {
      ig.add(fs.readFileSync(file, "utf8"));
    } catch {
      // ignore
    }
  }
  return ig;
}
