import { promises as fs } from "fs";
import path from "path";
import type { MediaItem, MediaModel } from "./types";
import { apiKey, authHeaders, baseUrl, hasApiKey } from "./classai";
import { DATA_DIR } from "./store";
import { uid } from "./utils";

const GEN_DIR = path.join(DATA_DIR, "generated");
const LIBRARY = path.join(DATA_DIR, "media.json");

export const IMAGE_MODELS: MediaModel[] = [
  {
    id: "nano-banana-2",
    name: "Nano Banana 2",
    vendor: "Google",
    note: "Serbaguna · 10–25 dtk",
    aspect: ["1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "4:3", "3:2", "21:9"],
    resolutions: ["1K", "2K", "4K"],
  },
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    vendor: "Google",
    note: "Detail terbaik · 15–40 dtk",
    aspect: ["1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "4:3", "3:2", "21:9"],
    resolutions: ["1K", "2K", "4K"],
  },
  {
    id: "nano-banana-2-lite",
    name: "Nano Banana 2 Lite",
    vendor: "Google",
    note: "Cepat & murah · 5–10 dtk",
    aspect: ["1:1", "4:5", "3:4", "9:16", "16:9"],
    resolutions: ["1K"],
  },
  {
    id: "gpt-image-1.5",
    name: "GPT Image 1.5",
    vendor: "OpenAI",
    note: "Teks rapi · 8–60 dtk",
    aspect: ["1:1", "3:2", "2:3"],
    resolutions: ["1K"],
    quality: true,
  },
  {
    id: "gpt-image-2.5-flare",
    name: "GPT Image 2.5 Flare",
    vendor: "OpenAI",
    note: "Eksperimental · 10–45 dtk",
    aspect: ["1:1", "3:2", "2:3"],
    resolutions: ["1K", "2K"],
    quality: true,
  },
  {
    id: "flux-2-pro",
    name: "FLUX.2 Pro",
    vendor: "Black Forest Labs",
    note: "Fotorealistis · 5–10 dtk",
    aspect: ["1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "4:3", "3:2", "21:9"],
    resolutions: ["1K", "2K"],
  },
  {
    id: "flux-2-klein",
    name: "FLUX.2 Klein",
    vendor: "Black Forest Labs",
    note: "Tercepat · 2–6 dtk",
    aspect: ["1:1", "4:5", "3:4", "9:16", "16:9"],
    resolutions: ["1K", "2K"],
  },
  {
    id: "seedream-5",
    name: "Seedream 5.0",
    vendor: "ByteDance",
    note: "Artistik · 30–40 dtk",
    aspect: ["1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "4:3", "3:2", "21:9"],
    resolutions: ["2K", "3K"],
  },
  {
    id: "mai-image-2.6-flash",
    name: "MAI-Image 2.6 Flash",
    vendor: "Microsoft",
    note: "Cepat · 12–20 dtk",
    aspect: ["1:1", "4:5", "3:4", "9:16", "16:9"],
    resolutions: ["1K"],
  },
];

export const VIDEO_MODELS: MediaModel[] = [
  {
    id: "veo-3.1-fast",
    name: "Veo 3.1 Fast",
    vendor: "Google",
    note: "Audio asli · 1–2 mnt",
    aspect: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    seconds: [4, 6, 8],
  },
  {
    id: "veo-3.1",
    name: "Veo 3.1",
    vendor: "Google",
    note: "Kualitas sinema · 1–3 mnt",
    aspect: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    seconds: [4, 6, 8],
  },
  {
    id: "seedance-2.0-fast",
    name: "Seedance 2.0 Fast",
    vendor: "ByteDance",
    note: "Cepat · 1–3 mnt",
    aspect: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    resolutions: ["480p", "720p"],
    seconds: [4, 6, 8, 10],
  },
  {
    id: "seedance-2.0",
    name: "Seedance 2.0",
    vendor: "ByteDance",
    note: "Detail tinggi · 2–3 mnt",
    aspect: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    resolutions: ["480p", "720p", "1080p"],
    seconds: [4, 6, 8, 10, 12, 15],
  },
  {
    id: "wan-3.0",
    name: "Wan 3.0",
    vendor: "Alibaba",
    note: "Ekonomis · 2–3 mnt",
    aspect: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    resolutions: ["480p", "720p", "1080p"],
    seconds: [4, 6, 8, 10],
  },
  {
    id: "minimax-h3",
    name: "MiniMax H3",
    vendor: "MiniMax",
    note: "Kreatif · 3–10 mnt",
    aspect: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    resolutions: ["768p"],
    seconds: [4, 6, 8, 10, 12, 15],
  },
  {
    id: "oxygen-1.0",
    name: "Oxygen 1.0",
    vendor: "AZ8",
    note: "Termurah · 1–3 mnt",
    aspect: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    resolutions: ["480p", "768p"],
    seconds: [4, 6, 8, 10],
  },
];

async function ensureGen() {
  await fs.mkdir(GEN_DIR, { recursive: true });
}

async function readLibrary(): Promise<MediaItem[]> {
  try {
    const raw = await fs.readFile(LIBRARY, "utf8");
    const items = JSON.parse(raw) as MediaItem[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function writeLibrary(items: MediaItem[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LIBRARY, JSON.stringify(items.slice(0, 200)), "utf8");
}

export async function listMedia() {
  const items = await readLibrary();
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getMedia(id: string) {
  const items = await readLibrary();
  return items.find((item) => item.id === id) ?? null;
}

async function upsertMedia(item: MediaItem) {
  const items = await readLibrary();
  const existing = items.findIndex((entry) => entry.id === item.id);
  if (existing >= 0) items[existing] = item;
  else items.unshift(item);
  await writeLibrary(items);
}

async function removeMedia(id: string) {
  const items = await readLibrary();
  await writeLibrary(items.filter((item) => item.id !== id));
}

function extFromMagic(buffer: Buffer) {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer.length > 12 && buffer.subarray(8, 12).toString() === "WEBP") return "webp";
  return "png";
}

async function saveImageBuffer(buffer: Buffer, item: MediaItem) {
  await ensureGen();
  const ext = extFromMagic(buffer);
  const file = `${item.id}.${ext}`;
  await fs.writeFile(path.join(GEN_DIR, file), buffer);
  item.file = file;
  item.status = "done";
  await upsertMedia(item);
  return item;
}

export async function generateImage(input: {
  prompt: string;
  model?: string;
  aspect?: string;
  resolution?: string;
  quality?: string;
}) {
  if (!hasApiKey()) throw new Error("CLASSAI_API_KEY belum diisi di .env.");
  const model = input.model || "nano-banana-2";
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    aspect_ratio: input.aspect || "1:1",
    resolution: input.resolution || "1K",
    response_format: "b64_json",
    n: 1,
  };
  if (input.quality && model.startsWith("gpt-image")) body.quality = input.quality;

  async function request(payload: Record<string, unknown>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300_000);
    try {
      const res = await fetch(`${baseUrl()}/images/generations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          message = parsed?.error?.message || message;
        } catch {
          message = text.slice(0, 240) || message;
        }
        const error = new Error(message) as Error & { status?: number };
        error.status = res.status;
        throw error;
      }
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  let json: any;
  try {
    json = await request(body);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 400) {
      json = await request({ ...body, response_format: "url" });
    } else {
      throw error;
    }
  }

  const entry = json?.data?.[0] ?? json?.images?.[0] ?? json?.[0];
  if (!entry) throw new Error("Respons gambar tidak berisi data.");
  const item: MediaItem = {
    id: uid("img"),
    type: "image",
    model,
    prompt: input.prompt,
    aspect: input.aspect,
    resolution: input.resolution,
    status: "in_progress",
    createdAt: Date.now(),
  };
  if (entry.b64_json) {
    const base64 = String(entry.b64_json).replace(/^data:[^;]+;base64,/, "");
    return { item: await saveImageBuffer(Buffer.from(base64, "base64"), item) };
  }
  if (entry.url) {
    const res = await fetch(entry.url);
    if (!res.ok) throw new Error(`Gagal mengunduh gambar (HTTP ${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { item: await saveImageBuffer(buffer, item) };
  }
  throw new Error("Format respons gambar tidak dikenali.");
}

export async function createVideo(input: {
  prompt: string;
  model?: string;
  aspect?: string;
  resolution?: string;
  seconds?: number;
}) {
  if (!hasApiKey()) throw new Error("CLASSAI_API_KEY belum diisi di .env.");
  const model = input.model || "veo-3.1-fast";
  const body = {
    model,
    prompt: input.prompt,
    aspect_ratio: input.aspect || "16:9",
    resolution: input.resolution || "720p",
    seconds: String(input.seconds || 8),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let json: any;
  try {
    const res = await fetch(`${baseUrl()}/videos`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        message = JSON.parse(text)?.error?.message || message;
      } catch {
        message = text.slice(0, 240) || message;
      }
      throw new Error(message);
    }
    json = JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
  const jobId =
    json?.id ||
    json?.task_id ||
    json?.taskId ||
    json?.video_id ||
    json?.job_id ||
    json?.request_id ||
    json?.data?.id ||
    json?.data?.task_id;
  if (!jobId) throw new Error("Respons video tidak berisi ID tugas.");
  const item: MediaItem = {
    id: uid("vid"),
    type: "video",
    model,
    prompt: input.prompt,
    aspect: input.aspect,
    resolution: input.resolution,
    seconds: input.seconds || 8,
    jobId: String(jobId),
    status: "in_progress",
    createdAt: Date.now(),
  };
  await upsertMedia(item);
  return item;
}

export async function checkVideo(itemId: string) {
  if (!hasApiKey()) throw new Error("CLASSAI_API_KEY belum diisi di .env.");
  const item = await getMedia(itemId);
  if (!item) throw new Error("Media tidak ditemukan.");
  if (!item.jobId) return item;
  if (item.status !== "in_progress") return item;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${baseUrl()}/videos/${encodeURIComponent(item.jobId)}`, {
      headers: authHeaders(),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    const json = JSON.parse(text);
    const status = String(
      json?.status ?? json?.data?.status ?? json?.output?.status ?? json?.result?.status ?? "",
    ).toLowerCase();
    const candidates = [
      json?.url,
      json?.video_url,
      json?.output_url,
      json?.video?.url,
      json?.output?.url,
      Array.isArray(json?.output) ? json.output[0]?.url : undefined,
      json?.data?.url,
      json?.data?.video_url,
      Array.isArray(json?.data) ? json.data[0]?.url : undefined,
      json?.result?.url,
      json?.result?.video_url,
    ];
    const freshUrl = candidates.find((value) => typeof value === "string" && value.startsWith("http"));
    if (freshUrl) item.remoteUrl = freshUrl;

    const processing = [
      "queued",
      "pending",
      "processing",
      "running",
      "in_progress",
      "in-progress",
      "generating",
      "starting",
    ];
    if (["completed", "complete", "succeeded", "done", "success", "finished"].includes(status)) {
      item.status = "done";
    } else if (["failed", "error", "cancelled", "canceled", "timeout"].includes(status)) {
      item.status = "failed";
      item.error = json?.error?.message || json?.error || json?.data?.error || "Video gagal dibuat.";
    } else if (freshUrl && !processing.includes(status)) {
      // Sebagian provider hanya mengembalikan URL ketika video sudah siap.
      item.status = "done";
    }
    if (item.status === "done" && !item.remoteUrl && !item.file) {
      item.status = "failed";
      item.error = "Video selesai tetapi URL hasil tidak ditemukan.";
    }
    await upsertMedia(item);
    return item;
  } finally {
    clearTimeout(timer);
  }
}

export async function deleteMedia(id: string) {
  const item = await getMedia(id);
  if (!item) return false;
  if (item.file) {
    await fs.unlink(path.join(GEN_DIR, item.file)).catch(() => undefined);
  }
  await removeMedia(id);
  return true;
}

export function mediaPath(item: MediaItem) {
  if (!item.file) return null;
  return path.join(GEN_DIR, item.file);
}

export async function mediaModels() {
  return { image: IMAGE_MODELS, video: VIDEO_MODELS, configured: Boolean(apiKey()) };
}
