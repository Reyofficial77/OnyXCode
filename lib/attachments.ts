import { promises as fs } from "fs";
import path from "path";
import type { AttachmentKind, AttachmentMeta } from "./types";
import { resolveInside } from "./workspace";
import { uid } from "./utils";
import { DATA_DIR } from "./store";

const META_DIR = path.join(DATA_DIR, "uploads-meta");
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
export const MAX_TEXT_CHARS = 160_000;

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "mdx", "json", "jsonc", "yaml", "yml", "toml", "ini", "env",
  "csv", "tsv", "xml", "html", "htm", "css", "scss", "sass", "less", "js", "jsx", "mjs",
  "cjs", "ts", "tsx", "mts", "cts", "py", "rb", "go", "rs", "java", "kt", "kts", "swift",
  "c", "h", "cpp", "cc", "cxx", "hpp", "cs", "php", "sh", "bash", "zsh", "ps1", "bat",
  "cmd", "sql", "graphql", "gql", "vue", "svelte", "astro", "lua", "r", "dart", "ex",
  "exs", "erl", "hs", "clj", "scala", "pl", "zig", "asm", "dockerfile", "gitignore",
  "editorconfig", "lock", "log", "srt", "vtt",
]);

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  aac: "audio/aac",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  json: "application/json",
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  pdfx: "application/pdf",
};

export function extOf(name: string) {
  return path.extname(name).replace(".", "").toLowerCase();
}

export function mimeFor(name: string, fallback = "application/octet-stream") {
  return MIME_BY_EXT[extOf(name)] ?? fallback;
}

export function kindOf(mime: string, name: string): AttachmentKind {
  const ext = extOf(name);
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "rtf"].includes(ext)) {
    return "document";
  }
  if (TEXT_EXT.has(ext) || mime.startsWith("text/")) return "code";
  return "file";
}

export function safeName(name: string) {
  const base = path.basename(name || "file");
  const cleaned = base.replace(/[^\w.\-() ]+/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 90);
}

async function extractText(meta: Omit<AttachmentMeta, "textChars">, buffer: Buffer) {
  const ext = extOf(meta.name);
  let text: string | null = null;
  try {
    if (TEXT_EXT.has(ext) || meta.mime.startsWith("text/")) {
      const sample = buffer.subarray(0, 8000);
      if (!sample.includes(0)) text = buffer.toString("utf8");
    } else if (ext === "pdf" || meta.mime === "application/pdf") {
      const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractPdf(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (ext === "xlsx" || ext === "xls") {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const chunks: string[] = [];
      for (const sheetName of workbook.SheetNames.slice(0, 8)) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        chunks.push(`## Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet).slice(0, 40_000)}`);
      }
      text = chunks.join("\n\n");
    }
  } catch {
    text = null;
  }
  if (!text) return null;
  return text.trim().slice(0, MAX_TEXT_CHARS);
}

export async function saveUpload(file: File): Promise<AttachmentMeta> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File ${file.name} terlalu besar. Maksimal 64 MB.`);
  }
  await fs.mkdir(META_DIR, { recursive: true });
  const id = uid("a");
  const name = safeName(file.name || "file");
  const ext = extOf(name);
  const filename = `${id}${ext ? "." + ext : ""}`;
  const relPath = `.uploads/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { writeBuffer } = await import("./workspace");
  await writeBuffer(relPath, buffer);

  const mime = file.type || mimeFor(name);
  const kind = kindOf(mime, name);
  const partial: Omit<AttachmentMeta, "textChars"> = {
    id,
    name,
    mime,
    size: buffer.length,
    kind,
    path: relPath,
    url: `/api/uploads/${id}`,
    createdAt: Date.now(),
  };

  const text = await extractText(partial, buffer);
  if (text) {
    await fs.writeFile(path.join(META_DIR, `${id}.txt`), text, "utf8");
  }

  const meta: AttachmentMeta = { ...partial, textChars: text?.length };
  await fs.writeFile(path.join(META_DIR, `${id}.json`), JSON.stringify(meta), "utf8");
  return meta;
}

export async function getUpload(id: string): Promise<AttachmentMeta | null> {
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) return null;
  try {
    const raw = await fs.readFile(path.join(META_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as AttachmentMeta;
  } catch {
    return null;
  }
}

export async function getUploadPath(meta: AttachmentMeta) {
  return resolveInside(meta.path);
}

export async function getUploadText(meta: AttachmentMeta) {
  try {
    return await fs.readFile(path.join(META_DIR, `${meta.id}.txt`), "utf8");
  } catch {
    return null;
  }
}

export async function imageDataUrl(meta: AttachmentMeta, maxBytes = 6 * 1024 * 1024) {
  if (meta.kind !== "image" || meta.size > maxBytes) return null;
  try {
    const buffer = await fs.readFile(await getUploadPath(meta));
    const mime = meta.mime.startsWith("image/") ? meta.mime : mimeFor(meta.name, "image/png");
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function deleteUpload(id: string) {
  const meta = await getUpload(id);
  if (!meta) return false;
  try {
    await fs.unlink(await getUploadPath(meta));
  } catch {
    // sudah tidak ada
  }
  await fs.unlink(path.join(META_DIR, `${id}.json`)).catch(() => undefined);
  await fs.unlink(path.join(META_DIR, `${id}.txt`)).catch(() => undefined);
  return true;
}
