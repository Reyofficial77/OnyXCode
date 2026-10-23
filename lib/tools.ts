import { promises as fs } from "fs";
import path from "path";
import {
  deleteEntry,
  listFiles,
  readTextSlice,
  runCommand,
  searchWorkspace,
  writeText,
  workspaceRoot,
} from "./workspace";
import { formatBytes } from "./utils";
import { memoryFile, DATA_DIR } from "./paths";

export interface ToolResult {
  ok: boolean;
  output: string;
  display: string;
}

export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List files and folders inside the user's workspace. Use this before reading or editing a project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative folder path. Empty string = workspace root." },
          depth: { type: "number", description: "How deep to traverse (1-6). Default 3." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file inside the workspace. Returns numbered lines.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path, e.g. src/app.tsx" },
          offset: { type: "number", description: "First line number (1-based). Default 1." },
          limit: { type: "number", description: "Max lines to return (default 400, max 2000)." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or overwrite a text file inside the workspace. Parent folders are created automatically.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path." },
          content: { type: "string", description: "Full file content." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace an exact snippet in a file. old_text must match exactly once. Read the file first.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path." },
          old_text: { type: "string", description: "Exact text to find (include indentation)." },
          new_text: { type: "string", description: "Replacement text." },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file or folder inside the workspace. Ask the user first for anything important.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative path to delete." } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search text across files in the workspace. Returns file:line matches.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Text to search (case-insensitive)." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a shell command (PowerShell on Windows) inside the workspace. Use for installs, builds, tests, git. Returns stdout, stderr and exit code.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Command to execute." },
          timeout_seconds: { type: "number", description: "Timeout, 5-180 seconds. Default 60." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Update ONYX long-term memory. file must be MEMORY.md, SOUL.md, IDENTITY.md or SKILL.md. Use append for new notes, replace to rewrite.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", enum: ["MEMORY.md", "SOUL.md", "IDENTITY.md", "SKILL.md"] },
          content: { type: "string", description: "Markdown content to write or append." },
          mode: { type: "string", enum: ["append", "replace"] },
        },
        required: ["file", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch a public web page and return readable text. Useful for docs and error research.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "https URL" },
          max_chars: { type: "number", description: "Max characters to return. Default 12000." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Generate an image from a text prompt and save it into workspace/assets. Costs credits from the user's account.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Detailed visual description." },
          aspect_ratio: { type: "string", description: "1:1, 16:9, 9:16, 4:3, 3:2 or 4:5." },
          model: { type: "string", description: "Optional image model id, default nano-banana-2." },
        },
        required: ["prompt"],
      },
    },
  },
] as const;

const MEMORY_FILES = new Set(["MEMORY.md", "SOUL.md", "IDENTITY.md", "SKILL.md"]);

function argString(args: Record<string, unknown>, key: string, fallback = "") {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function argNumber(args: Record<string, unknown>, key: string, fallback: number) {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function blockPrivateUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "::"].includes(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^127\./.test(host) || /^0\./.test(host)) return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (/^(fc|fd|fe80)/i.test(host)) return true;
  return false;
}

export async function executeTool(
  name: string,
  rawArgs: string,
  signal?: AbortSignal,
): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs?.trim() ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, output: "Argumen tool bukan JSON yang valid.", display: "argumen tidak valid" };
  }

  try {
    switch (name) {
      case "list_files": {
        const target = argString(args, "path");
        const depth = Math.max(1, Math.min(6, argNumber(args, "depth", 3)));
        const entries = await listFiles(target, depth);
        if (!entries.length) {
          return { ok: true, output: "(kosong)", display: target || "workspace" };
        }
        const lines = entries.map((entry) =>
          entry.type === "dir"
            ? `${"  ".repeat(entry.depth)}${entry.name}/`
            : `${"  ".repeat(entry.depth)}${entry.path}  (${formatBytes(entry.size)})`,
        );
        return {
          ok: true,
          output: lines.join("\n"),
          display: `${entries.length} entri · ${target || "workspace"}`,
        };
      }

      case "read_file": {
        const file = argString(args, "path");
        if (!file) return { ok: false, output: "path wajib diisi.", display: "path kosong" };
        const result = await readTextSlice(
          file,
          argNumber(args, "offset", 1),
          argNumber(args, "limit", 400),
        );
        const footer = result.truncated
          ? `\n\n…dipotong pada ${formatBytes(result.size)}.`
          : "";
        return {
          ok: true,
          output: `${result.content}${footer}`,
          display: `${file} · ${result.totalLines} baris`,
        };
      }

      case "write_file": {
        const file = argString(args, "path");
        const content = argString(args, "content");
        if (!file) return { ok: false, output: "path wajib diisi.", display: "path kosong" };
        const result = await writeText(file, content);
        return {
          ok: true,
          output: `Tersimpan: ${result.path} (${formatBytes(result.bytes)})`,
          display: `${result.path} · ${formatBytes(result.bytes)}`,
        };
      }

      case "edit_file": {
        const file = argString(args, "path");
        const oldText = argString(args, "old_text");
        const newText = argString(args, "new_text");
        if (!file || !oldText) {
          return { ok: false, output: "path dan old_text wajib diisi.", display: "argumen kurang" };
        }
        const { readText } = await import("./workspace");
        const existing = await readText(file, 2_000_000);
        const occurrences = existing.content.split(oldText).length - 1;
        if (occurrences === 0) {
          return {
            ok: false,
            output: "old_text tidak ditemukan. Baca ulang file dan salin teks persis (termasuk indentasi).",
            display: `${file} · tidak cocok`,
          };
        }
        if (occurrences > 1) {
          return {
            ok: false,
            output: `old_text cocok ${occurrences} kali. Sertakan konteks lebih unik.`,
            display: `${file} · ambigu`,
          };
        }
        const updated = existing.content.replace(oldText, newText);
        await writeText(file, updated);
        return { ok: true, output: `Diedit: ${file}`, display: `${file} · 1 perubahan` };
      }

      case "delete_file": {
        const target = argString(args, "path");
        if (!target) return { ok: false, output: "path wajib diisi.", display: "path kosong" };
        await deleteEntry(target);
        return { ok: true, output: `Dihapus: ${target}`, display: target };
      }

      case "search_files": {
        const query = argString(args, "query");
        if (!query) return { ok: false, output: "query wajib diisi.", display: "query kosong" };
        const results = await searchWorkspace(query, 50);
        return {
          ok: true,
          output: results.length ? results.join("\n") : "Tidak ada hasil.",
          display: `${results.length} hasil · "${query}"`,
        };
      }

      case "run_command": {
        const command = argString(args, "command");
        if (!command) return { ok: false, output: "command wajib diisi.", display: "perintah kosong" };
        if (signal?.aborted) return { ok: false, output: "Dibatalkan.", display: "dibatalkan" };
        const timeout = Math.max(5, Math.min(180, argNumber(args, "timeout_seconds", 60))) * 1000;
        const result = await runCommand(command, timeout);
        const output = [
          `$ ${command}`,
          `exit: ${result.code ?? "?"} · ${result.durationMs}ms`,
          result.stdout ? `\n── stdout ──\n${result.stdout}` : "",
          result.stderr ? `\n── stderr ──\n${result.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        return {
          ok: result.code === 0,
          output,
          display: `${command.slice(0, 60)} · exit ${result.code ?? "?"}`,
        };
      }

      case "save_memory": {
        const file = argString(args, "file", "MEMORY.md");
        const content = argString(args, "content");
        const mode = argString(args, "mode", "append");
        if (!MEMORY_FILES.has(file)) {
          return { ok: false, output: "file harus MEMORY.md, SOUL.md, IDENTITY.md atau SKILL.md.", display: "file ditolak" };
        }
        if (!content.trim()) return { ok: false, output: "content kosong.", display: "konten kosong" };
        const target = await memoryFile(file);
        const existing = await fs.readFile(target, "utf8").catch(() => "");
        const next =
          mode === "replace"
            ? content.slice(0, 200_000)
            : `${existing.trimEnd()}\n\n${content.slice(0, 200_000)}\n`;
        await fs.writeFile(target, next, "utf8");
        return { ok: true, output: `${file} diperbarui (${mode}).`, display: `${file} · ${mode}` };
      }

      case "fetch_url": {
        const raw = argString(args, "url");
        if (!raw) return { ok: false, output: "url wajib diisi.", display: "url kosong" };
        let url: URL;
        try {
          url = new URL(raw);
        } catch {
          return { ok: false, output: "URL tidak valid.", display: "URL invalid" };
        }
        if (!["http:", "https:"].includes(url.protocol)) {
          return { ok: false, output: "Hanya http/https.", display: "protokol ditolak" };
        }
        if (blockPrivateUrl(url)) {
          return { ok: false, output: "URL lokal/privat diblokir.", display: "url privat" };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort);
        try {
          let current = url;
          let res: Response | null = null;
          for (let hop = 0; hop < 5; hop += 1) {
            res = await fetch(current, {
              signal: controller.signal,
              redirect: "manual",
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; ONYX/1.0; +local)",
                Accept: "text/html,application/xhtml+xml,text/plain,application/json",
              },
            });
            if (res.status < 300 || res.status >= 400) break;
            const location = res.headers.get("location");
            if (!location) break;
            const next = new URL(location, current);
            if (!["http:", "https:"].includes(next.protocol) || blockPrivateUrl(next)) {
              return { ok: false, output: "Redirect ke URL lokal/privat diblokir.", display: "redirect ditolak" };
            }
            current = next;
          }
          if (!res) throw new Error("Tidak ada respons.");
          const type = res.headers.get("content-type") ?? "";
          const body = await res.text();
          const max = Math.max(1000, Math.min(30_000, argNumber(args, "max_chars", 12_000)));
          let text: string;
          if (type.includes("html")) text = htmlToText(body);
          else if (type.includes("json")) {
            try {
              text = JSON.stringify(JSON.parse(body), null, 2);
            } catch {
              text = body;
            }
          } else text = body;
          text = text.slice(0, max);
          return {
            ok: res.ok,
            output: `HTTP ${res.status} · ${current.href}\n\n${text || "(tanpa isi teks)"}`,
            display: `${current.hostname} · ${res.status}`,
          };
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        }
      }

      case "generate_image": {
        const prompt = argString(args, "prompt");
        if (!prompt) return { ok: false, output: "prompt wajib diisi.", display: "prompt kosong" };
        const { generateImage } = await import("./media");
        const aspect = argString(args, "aspect_ratio", "1:1");
        const model = argString(args, "model", "nano-banana-2");
        const { item } = await generateImage({ prompt, model, aspect, resolution: "1K" });
        if (!item.file) throw new Error("Gambar gagal disimpan.");
        const source = path.join(DATA_DIR, "generated", item.file);
        const ext = path.extname(item.file) || ".png";
        const rel = `assets/onyx-${item.id}${ext}`;
        const target = path.join(workspaceRoot(), rel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(source, target);
        return {
          ok: true,
          output: `Gambar dibuat dan disimpan di ${rel}. URL pratinjau: /api/generated/${item.id}\nPrompt: ${prompt}`,
          display: rel,
        };
      }

      default:
        return { ok: false, output: `Tool tidak dikenal: ${name}`, display: name };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool gagal.";
    return { ok: false, output: message, display: message.slice(0, 80) };
  }
}
