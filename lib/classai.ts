import type { ModelInfo } from "./types";

export const DEFAULT_MODEL = "deepseek-v4.1-flash";

export function baseUrl() {
  return (process.env.CLASSAI_BASE_URL || "https://router.classai.id/v1").replace(/\/+$/, "");
}

export function apiKey() {
  return process.env.CLASSAI_API_KEY?.trim() ?? "";
}

export function hasApiKey() {
  return apiKey().length > 8 && !apiKey().includes("xxxx");
}

export function authHeaders(extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
    // Agen coding mengirim kode/angka; jangan biarkan sensor PII merusak isi file.
    "x-classai-pii": process.env.CLASSAI_PII || "off",
    ...extra,
  };
}

type CatalogSeed = [id: string, name: string, vendor: string, context: string, input: number, output: number, tags?: string[], recommended?: boolean];

const SEED: CatalogSeed[] = [
  ["claude-opus-5.5", "Claude Opus 5.5", "Anthropic", "1M", 30, 150, ["reasoning", "coding", "agen"], true],
  ["claude-sonnet-5.5", "Claude Sonnet 5.5", "Anthropic", "1M", 45, 225, ["coding", "agen", "1M"], true],
  ["claude-fable-5.1", "Claude Fable 5.1", "Anthropic", "200K", 65.2, 324, ["reasoning", "coding"]],
  ["claude-fable-5", "Claude Fable 5", "Anthropic", "200K", 64.8, 324, ["reasoning", "coding"]],
  ["claude-opus-5", "Claude Opus 5", "Anthropic", "200K", 30, 150, ["reasoning", "coding"]],
  ["claude-sonnet-5", "Claude Sonnet 5", "Anthropic", "200K", 21.4, 105, ["coding", "agen"]],
  ["claude-opus-4.8", "Claude Opus 4.8", "Anthropic", "1M", 30, 150, ["reasoning", "coding"]],
  ["claude-opus-4.7", "Claude Opus 4.7", "Anthropic", "200K", 30, 150, ["reasoning", "coding"]],
  ["claude-opus-4.6", "Claude Opus 4.6", "Anthropic", "200K", 30, 150, ["reasoning", "coding"]],
  ["claude-sonnet-4.6", "Claude Sonnet 4.6", "Anthropic", "200K", 18, 90, ["coding"]],
  ["claude-haiku-5.5", "Claude Haiku 5.5", "Anthropic", "1M", 10.8, 30, ["cepat", "murah"]],
  ["claude-haiku-4.5", "Claude Haiku 4.5", "Anthropic", "200K", 6, 30, ["cepat", "murah"]],
  ["gpt-6-astra", "GPT-6 Astra", "OpenAI", "400K", 64.8, 324, ["reasoning", "coding"], true],
  ["gpt-6.1-sol", "GPT 6.1 Sol", "OpenAI", "1.1M", 34.2, 100, ["reasoning", "1M"]],
  ["gpt-6-sol", "GPT-6 Sol", "OpenAI", "1M", 34.2, 100, ["reasoning", "1M"]],
  ["gpt-6-luna", "GPT-6 Luna", "OpenAI", "1M", 11.3, 56.3, ["cepat", "murah"]],
  ["gpt-5.6-sol", "GPT-5.6 Sol", "OpenAI", "400K", 34.2, 108, ["reasoning"]],
  ["gpt-5.6-terra", "GPT-5.6 Terra", "OpenAI", "1M", 28.8, 81.1, ["reasoning"]],
  ["gpt-5.6-luna", "GPT-5.6 Luna", "OpenAI", "1M", 12.2, 60.8, ["cepat"]],
  ["gpt-4.1", "GPT-4.1", "OpenAI", "128K", 3.5, 18, ["murah", "vision"]],
  ["gpt-4o", "GPT-4o", "OpenAI", "64K", 3.5, 18, ["vision", "murah"]],
  ["gpt-4o-mini", "GPT-4o mini", "OpenAI", "128K", 6.3, 25, ["cepat", "murah"]],
  ["gemini-3.1-pro", "Gemini 3.1 Pro", "Google", "1M", 14, 72, ["reasoning", "1M"], true],
  ["gemini-3.8-flash", "Gemini 3.8 Flash", "Google", "1M", 14, 56, ["cepat", "vision"]],
  ["gemini-3.7-flash", "Gemini 3.7 Flash", "Google", "1M", 8.8, 43.4, ["cepat", "murah"]],
  ["gemini-3.8-series", "Gemini 3.8 Series", "Google", "1M", 9, 43.6, ["1M"]],
  ["deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "DeepSeek", "1M", 7.7, 28, ["cepat", "murah", "coding"], true],
  ["deepseek-v4.1-flash-1017", "DeepSeek V4.1 Flash 1017", "DeepSeek", "1M", 7.7, 28, ["cepat", "murah"]],
  ["deepseek-v4-pro", "DeepSeek V4 Pro", "DeepSeek", "1M", 20.9, 54, ["reasoning", "coding"]],
  ["deepseek-v4-pro-0813", "DeepSeek V4 Pro 0813", "DeepSeek", "1M", 21.4, 54.5, ["reasoning"]],
  ["deepseek-v4-flash", "DeepSeek V4 Flash", "DeepSeek", "1M", 6.8, 27.1, ["murah"]],
  ["deepseek-v4-flash-0731", "DeepSeek V4 Flash 0731", "DeepSeek", "1M", 7.2, 27.5, ["murah"]],
  ["glm-5.3", "GLM 5.3", "GLM", "1M", 12.5, 60.8, ["coding", "1M"], true],
  ["glm-5.3-flash", "GLM 5.3 Flash", "GLM", "1M", 7.4, 28, ["cepat", "murah"]],
  ["glm-5.2", "GLM 5.2", "GLM", "1M", 12.3, 60.7, ["coding"]],
  ["glm-5.1", "GLM 5.1", "GLM", "200K", 12.1, 60.5, ["coding"]],
  ["kimi-k3", "Kimi K3", "Kimi", "256K", 19.5, 97.2, ["reasoning", "agen"]],
  ["kimi-k2.7-code", "Kimi K2.7 Code", "Kimi", "250K", 8.4, 41.2, ["coding", "murah"], true],
  ["kimi-k2.6", "Kimi K2.6", "Kimi", "256K", 8.3, 41.1, ["coding"]],
  ["qwen3.8-max", "Qwen 3.8 Max", "Qwen", "1M", 13, 64.8, ["reasoning", "1M"]],
  ["qwen3.7-max", "Qwen 3.7 Max", "Qwen", "1M", 9.6, 47.8, ["1M"]],
  ["qwen3.7-plus", "Qwen 3.7 Plus", "Qwen", "1M", 5.4, 24.2, ["murah"]],
  ["qwen-3.8-27b", "Qwen 3.8 27B", "Qwen", "128K", 5.4, 24.2, ["murah"]],
  ["minimax-m3", "MiniMax M3", "MiniMax", "1M", 6, 22.7, ["murah", "1M"]],
  ["minimax-m2.7", "MiniMax M2.7", "MiniMax", "200K", 5.3, 12, ["murah"]],
  ["grok-4.7", "Grok 4.7", "xAI", "500K", 14.7, 60, ["reasoning"]],
  ["grok-4.6", "Grok 4.6", "xAI", "256K", 3.6, 10, ["murah"]],
  ["grok-4.5", "Grok 4.5", "xAI", "256K", 3.2, 9.6, ["murah"]],
  ["muse-spark-1.3", "Muse Spark 1.3", "Meta", "1M", 5.3, 5.3, ["murah"]],
  ["muse-spark-1.2", "Muse Spark 1.2", "Meta", "1M", 11, 54.2, ["1M"]],
  ["mimo-v2.5-pro", "MiMo v2.5 Pro", "MiMo", "256K", 5.4, 5.4, ["murah"]],
  ["hy4-preview", "Hunyuan HY4 Preview", "Hunyuan", "128K", 9.8, 48.6, ["reasoning"]],
  ["hy3", "Hunyuan HY3", "Hunyuan", "256K", 9.8, 48.6, ["reasoning"]],
  ["nemotron-3.5-super", "Nemotron 3.5 Super", "NVIDIA", "128K", 10, 13.3, ["reasoning"]],
  ["coding-us-auto", "Coding Plan US (auto)", "Classai", "200K", 30, 150, ["coding", "plan"], true],
  ["coding-china-auto", "Coding Plan China (auto)", "Classai", "1M", 12.5, 60.8, ["coding", "plan", "murah"], true],
];

export const STATIC_MODELS: ModelInfo[] = SEED.map(
  ([id, name, vendor, context, inputPrice, outputPrice, tags, recommended]) => ({
    id,
    name,
    vendor,
    context,
    inputPrice,
    outputPrice,
    tags,
    recommended,
  }),
);

let cache: { at: number; models: ModelInfo[]; live: boolean; error?: string } | null = null;
const CACHE_MS = 5 * 60 * 1000;

function normalizeLive(item: unknown): ModelInfo | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  if (!id) return null;
  const known = STATIC_MODELS.find((m) => m.id === id);
  const ctxRaw =
    record.context_length ?? record.context ?? record.context_window ?? record.max_context;
  const context =
    typeof ctxRaw === "number" ? `${Math.round(ctxRaw / 1000)}K` : known?.context ?? "—";
  const name =
    (typeof record.name === "string" && record.name) ||
    (typeof record.display_name === "string" && record.display_name) ||
    known?.name ||
    id;
  return {
    id,
    name,
    vendor: known?.vendor ?? "Other",
    context,
    tags: known?.tags,
    inputPrice: known?.inputPrice,
    outputPrice: known?.outputPrice,
    recommended: known?.recommended,
    live: true,
  };
}

export async function getModels(force = false): Promise<{
  models: ModelInfo[];
  live: boolean;
  error?: string;
}> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return { models: cache.models, live: cache.live, error: cache.error };
  }
  if (!hasApiKey()) {
    const result = { models: STATIC_MODELS, live: false, error: "CLASSAI_API_KEY belum diisi." };
    cache = { at: Date.now(), ...result };
    return result;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(`${baseUrl()}/models`, {
      headers: authHeaders(),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const raw: unknown[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.models)
          ? json.models
          : [];
    const liveModels = raw.map(normalizeLive).filter((m): m is ModelInfo => Boolean(m));
    if (!liveModels.length) throw new Error("Daftar model kosong");
    const merged = [...liveModels];
    for (const model of STATIC_MODELS) {
      if (!merged.some((m) => m.id === model.id)) merged.push(model);
    }
    merged.sort((a, b) => {
      if (Boolean(b.recommended) !== Boolean(a.recommended)) return b.recommended ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    cache = { at: Date.now(), models: merged, live: true };
    return { models: merged, live: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memuat model";
    const result = { models: STATIC_MODELS, live: false, error: message };
    cache = { at: Date.now(), models: result.models, live: false, error: message };
    return result;
  }
}

export function supportsReasoningEffort(model: string) {
  return /^(gpt-5|gpt-6|o[1-9])/i.test(model);
}

export async function testConnection() {
  if (!hasApiKey()) return { ok: false, message: "API key belum diisi di .env" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${baseUrl()}/models`, {
      headers: authHeaders(),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, message: `HTTP ${res.status} ${text.slice(0, 160)}` };
    }
    const json = await res.json();
    const count = Array.isArray(json?.data) ? json.data.length : Array.isArray(json) ? json.length : 0;
    return { ok: true, message: `Terhubung. ${count} model aktif.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Tidak dapat terhubung",
    };
  }
}
