import fs from "node:fs";
import { z } from "zod";
import * as diff from "diff";
import { resolveWorkspacePath } from "../utils/workspace.js";
import type { ToolDefinition } from "./types.js";

export const editFileTool: ToolDefinition<{
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}> = {
  name: "edit_file",
  description: "Find and replace exact text in an existing file. Fails if oldString is not found or matches multiple times unless replaceAll=true.",
  risk: "write",
  schema: z.object({
    path: z.string().min(1),
    oldString: z.string().min(1),
    newString: z.string(),
    replaceAll: z.boolean().optional(),
  }),
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      oldString: { type: "string" },
      newString: { type: "string" },
      replaceAll: { type: "boolean" },
    },
    required: ["path", "oldString", "newString"],
  },
  subject: (a) => a.path,
  summary: (a) => `edit ${a.path} (replace ${a.oldString.length} chars with ${a.newString.length} chars)`,
  async run(args, ctx) {
    const target = resolveWorkspacePath(args.path, { root: ctx.workspaceRoot });
    if (!fs.existsSync(target.absolute)) {
      return { content: `File not found: ${args.path}`, isError: true };
    }
    const current = fs.readFileSync(target.absolute, "utf8");
    const count = occurrences(current, args.oldString);
    if (count === 0) {
      return {
        content: `Error: oldString was not found in ${args.path}. Inspect the file first to ensure the exact substring matches.`,
        isError: true,
      };
    }
    if (count > 1 && !args.replaceAll) {
      return {
        content: `Error: oldString matches ${count} times in ${args.path}. Provide more surrounding context to match uniquely, or set replaceAll: true.`,
        isError: true,
      };
    }

    ctx.checkpoint?.(target.relative, current);

    let updated: string;
    if (args.replaceAll) {
      updated = current.split(args.oldString).join(args.newString);
    } else {
      const idx = current.indexOf(args.oldString);
      updated = current.slice(0, idx) + args.newString + current.slice(idx + args.oldString.length);
    }

    fs.writeFileSync(target.absolute, updated, "utf8");

    const patch = diff.createTwoFilesPatch(
      target.relative,
      target.relative,
      current,
      updated,
      "before",
      "after",
    );
    return {
      content: `Edited ${target.relative} (${count} replacement${count > 1 ? "s" : ""}):\n${patch}`,
      metadata: { replacements: count },
    };
  },
};

export const applyPatchTool: ToolDefinition<{ patch: string }> = {
  name: "apply_patch",
  description: "Apply a standard unified diff patch to the workspace.",
  risk: "write",
  schema: z.object({ patch: z.string().min(1) }),
  parameters: {
    type: "object",
    properties: { patch: { type: "string" } },
    required: ["patch"],
  },
  subject: () => "(patch)",
  summary: (a) => `apply patch (${a.patch.split("\n").length} lines)`,
  async run(args, ctx) {
    const parsed = diff.parsePatch(args.patch);
    if (!parsed || parsed.length === 0) {
      return { content: "Invalid or empty unified diff patch", isError: true };
    }
    const modified: string[] = [];
    for (const p of parsed) {
      const rawPath = p.newFileName ?? p.oldFileName;
      if (!rawPath) continue;
      const cleanPath = rawPath.replace(/^[ab]\//, "");
      const target = resolveWorkspacePath(cleanPath, { root: ctx.workspaceRoot });
      const current = fs.existsSync(target.absolute) ? fs.readFileSync(target.absolute, "utf8") : "";
      ctx.checkpoint?.(target.relative, current || null);
      const applied = diff.applyPatch(current, p);
      if (typeof applied !== "string") {
        return { content: `Failed to apply patch to ${cleanPath} (hunks did not match)`, isError: true };
      }
      fs.writeFileSync(target.absolute, applied, "utf8");
      modified.push(target.relative);
    }
    return { content: `Applied patch successfully to ${modified.join(", ")}` };
  },
};

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}
