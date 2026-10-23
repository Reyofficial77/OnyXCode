import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import type { WorkspaceEntry } from "./types";
import { formatBytes } from "./utils";

const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".cache",
  ".turbo",
  "coverage",
]);

export function workspaceRoot() {
  const raw = process.env.WORKSPACE_DIR?.trim() || "./workspace";
  return path.isAbsolute(raw) ? path.normalize(raw) : path.join(process.cwd(), raw);
}

export async function ensureWorkspace() {
  const root = workspaceRoot();
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, ".uploads"), { recursive: true });
  return root;
}

export async function resolveInside(relative: string) {
  const root = await ensureWorkspace();
  const clean = (relative || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^[a-zA-Z]:\//, "");
  const full = path.resolve(root, clean);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Akses ditolak: path berada di luar workspace.");
  }
  return full;
}

export function displayPath(relative: string) {
  const root = workspaceRoot();
  return relative ? `workspace/${relative.replace(/\\/g, "/")}` : "workspace/";
}

function isTextBuffer(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  if (sample.includes(0)) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / Math.max(sample.length, 1) < 0.02;
}

export async function listFiles(relative = "", maxDepth = 4): Promise<WorkspaceEntry[]> {
  const root = await ensureWorkspace();
  const start = await resolveInside(relative);
  const entries: WorkspaceEntry[] = [];
  const limit = 800;

  async function walk(dir: string, depth: number) {
    if (entries.length >= limit || depth > maxDepth) return;
    let items;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    items.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const item of items) {
      if (entries.length >= limit) return;
      if (item.name.startsWith(".") && item.name !== ".env.example") {
        if (item.name !== ".uploads") continue;
      }
      if (SKIP.has(item.name)) continue;
      const full = path.join(dir, item.name);
      const rel = path.relative(root, full).replace(/\\/g, "/");
      if (rel.startsWith(".uploads/") || rel === ".uploads") continue;
      let size = 0;
      if (item.isFile()) {
        size = await fs.stat(full).then((s) => s.size).catch(() => 0);
      }
      entries.push({
        path: rel,
        name: item.name,
        type: item.isDirectory() ? "dir" : "file",
        size,
        depth,
      });
      if (item.isDirectory()) await walk(full, depth + 1);
    }
  }

  const stat = await fs.stat(start).catch(() => null);
  if (!stat) return [];
  if (stat.isFile()) {
    return [
      {
        path: path.relative(root, start).replace(/\\/g, "/"),
        name: path.basename(start),
        type: "file",
        size: stat.size,
        depth: 0,
      },
    ];
  }
  await walk(start, 0);
  return entries;
}

export async function readText(relative: string, maxBytes = 400_000) {
  const full = await resolveInside(relative);
  const stat = await fs.stat(full);
  if (!stat.isFile()) throw new Error("Bukan file.");
  if (stat.size > maxBytes * 4) {
    throw new Error(`File terlalu besar (${formatBytes(stat.size)}). Batas baca ${formatBytes(maxBytes * 4)}.`);
  }
  const buffer = await fs.readFile(full);
  if (!isTextBuffer(buffer)) {
    throw new Error("File biner — tidak bisa ditampilkan sebagai teks.");
  }
  const text = buffer.toString("utf8");
  return {
    content: text.length > maxBytes ? text.slice(0, maxBytes) : text,
    truncated: text.length > maxBytes,
    size: stat.size,
    lines: text.split(/\r?\n/).length,
  };
}

export async function readTextSlice(relative: string, offset = 1, limit = 400) {
  const { content, ...rest } = await readText(relative, 2_000_000);
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, offset - 1);
  const slice = lines.slice(start, start + Math.max(1, Math.min(limit, 2000)));
  const numbered = slice.map((line, index) => `${String(start + index + 1).padStart(4, " ")}│ ${line}`);
  return {
    ...rest,
    totalLines: lines.length,
    content: numbered.join("\n"),
  };
}

export async function writeText(relative: string, content: string) {
  const full = await resolveInside(relative);
  if (!relative || relative.endsWith("/")) throw new Error("Nama file tidak valid.");
  if (content.length > 2_500_000) throw new Error("Konten terlalu besar (maks 2,5 MB).");
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return { path: relative.replace(/\\/g, "/"), bytes: Buffer.byteLength(content, "utf8") };
}

export async function writeBuffer(relative: string, buffer: Buffer) {
  const full = await resolveInside(relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return full;
}

export async function deleteEntry(relative: string) {
  if (!relative) throw new Error("Tidak bisa menghapus root workspace.");
  const full = await resolveInside(relative);
  const stat = await fs.lstat(full).catch(() => null);
  if (!stat) throw new Error("File tidak ditemukan.");
  if (stat.isDirectory()) {
    await fs.rm(full, { recursive: true, force: true });
  } else {
    await fs.unlink(full);
  }
  return { removed: relative };
}

export async function mkdirEntry(relative: string) {
  const full = await resolveInside(relative);
  await fs.mkdir(full, { recursive: true });
  return { path: relative.replace(/\\/g, "/") };
}

export async function renameEntry(from: string, to: string) {
  const src = await resolveInside(from);
  const dst = await resolveInside(to);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.rename(src, dst);
  return { from, to };
}

export async function statEntry(relative: string) {
  const full = await resolveInside(relative);
  const stat = await fs.stat(full);
  return { full, stat };
}

export async function fileType(relative: string) {
  const full = await resolveInside(relative);
  const head = Buffer.alloc(512);
  const handle = await fs.open(full, "r");
  try {
    const { bytesRead } = await handle.read(head, 0, 512, 0);
    return isTextBuffer(head.subarray(0, bytesRead)) ? "text" : "binary";
  } finally {
    await handle.close();
  }
}

export async function searchWorkspace(query: string, maxResults = 40) {
  if (!query || query.length < 2) return [] as string[];
  const root = await ensureWorkspace();
  const needle = query.toLowerCase();
  const results: string[] = [];
  let scanned = 0;

  async function walk(dir: string) {
    if (results.length >= maxResults || scanned > 2500) return;
    const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const item of items) {
      if (results.length >= maxResults || scanned > 2500) return;
      if (item.name.startsWith(".") || SKIP.has(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
        continue;
      }
      const stat = await fs.stat(full).catch(() => null);
      if (!stat || stat.size > 700_000) continue;
      scanned += 1;
      const buffer = await fs.readFile(full).catch(() => null);
      if (!buffer || !isTextBuffer(buffer)) continue;
      const lines = buffer.toString("utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].toLowerCase().includes(needle)) {
          const rel = path.relative(root, full).replace(/\\/g, "/");
          results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 180)}`);
          if (results.length >= maxResults) return;
        }
      }
    }
  }

  await walk(root);
  return results;
}

const BLOCKED = [
  /format\s+[a-z]:/i,
  /shutdown(\s|\/|$)/i,
  /restart-computer/i,
  /stop-computer/i,
  /remove-item\s+(-[a-z]+\s+)*["']?[a-z]:\\?\s*["']?\s*$/i,
  /rd\s+\/s\s+\/q\s+[a-z]:\\?\s*$/i,
  /del\s+\/[fsq]\s+.*[a-z]:\\?\s*$/i,
  /mkfs/i,
  /dd\s+if=.*of=\/dev/i,
  /:\(\)\s*\{/,
  /rm\s+-rf\s+\/(\s|$)/,
  /remove-item\s+.*-recurse.*(\$env:userprofile|\$home|[a-z]:\\)/i,
  // Jangan biarkan shell keluar dari workspace atau membaca rahasia aplikasi.
  /\.\.(\/|\\|$)/,
  /(^|[\s"'`=;|&(])~\//,
  /\$(home|env:userprofile)\b/i,
  /(^|[\\/\s"'`=;|&(])\.env(\.|$|[\\/\s"'`;|&)])/i,
  /(^|[\\/\s"'`=;|&(])\.data([\\/\s"'`;|&)]|$)/i,
  /(auth_secret|auth_password|auth_username|classai_api_key|onyx_session)/i,
  /\b(get-childitem|gci|ls|dir|cat|type|more|gc|get-content)\b[^\n]*\benv:\s*$/i,
  /printenv|\benv\s*($|\|)/i,
];

// Variabel lingkungan yang tidak boleh diwarisi oleh perintah shell agent.
const SECRET_ENV = /^(CLASSAI_API_KEY|AUTH_PASSWORD|AUTH_SECRET|AUTH_USERNAME|NODE_OPTIONS|.*_(KEY|SECRET|TOKEN|PASSWORD))$/i;

function shellEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", TERM: "dumb" };
  for (const key of Object.keys(env)) {
    if (SECRET_ENV.test(key)) delete env[key];
  }
  return env;
}


export async function runCommand(command: string, timeoutMs = 60_000) {
  if (!command.trim()) throw new Error("Perintah kosong.");
  for (const pattern of BLOCKED) {
    if (pattern.test(command)) throw new Error("Perintah diblokir oleh pengaman workspace.");
  }
  const cwd = await ensureWorkspace();
  const started = Date.now();
  return new Promise<{ stdout: string; stderr: string; code: number | null; durationMs: number }>(
    (resolve) => {
      const shell = process.platform === "win32" ? "powershell.exe" : "/bin/bash";
      const args =
        process.platform === "win32"
          ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command]
          : ["-lc", command];
      const child = spawn(shell, args, {
        cwd,
        windowsHide: true,
        env: shellEnv(),
      });
      let stdout = "";
      let stderr = "";
      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        child.kill();
      }, Math.min(Math.max(timeoutMs, 1_000), 180_000));

      const cap = (text: string) => (text.length > 40_000 ? text.slice(0, 40_000) + "\n…(output dipotong)" : text);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ stdout: "", stderr: error.message, code: -1, durationMs: Date.now() - started });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          stdout: cap(stdout),
          stderr: cap(stderr) + (killed ? "\n(timeout — proses dihentikan)" : ""),
          code,
          durationMs: Date.now() - started,
        });
      });
    },
  );
}

export async function workspaceSummary(maxFiles = 70) {
  const entries = await listFiles("", 4).catch(() => []);
  if (!entries.length) return "(workspace masih kosong)";
  const lines = entries
    .slice(0, maxFiles)
    .map((entry) =>
      entry.type === "dir" ? `${"  ".repeat(entry.depth)}▸ ${entry.name}/` : `${"  ".repeat(entry.depth)}· ${entry.path} (${formatBytes(entry.size)})`,
    );
  if (entries.length > maxFiles) lines.push(`… dan ${entries.length - maxFiles} entri lainnya`);
  return lines.join("\n");
}

export async function workspaceHealth() {
  const root = workspaceRoot();
  try {
    await ensureWorkspace();
    const probe = path.join(root, ".onyx-write-test");
    await fs.writeFile(probe, "ok", "utf8");
    await fs.unlink(probe);
    return { root, writable: true };
  } catch {
    return { root, writable: false };
  }
}
