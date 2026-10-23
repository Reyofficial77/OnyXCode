import { promises as fs } from "fs";
import type { ChatMessage, Effort, Session, ToolTrace, Usage } from "./types";
import { authHeaders, baseUrl, hasApiKey, supportsReasoningEffort } from "./classai";
import { TOOL_DEFS, executeTool } from "./tools";
import { getUpload, getUploadText, imageDataUrl } from "./attachments";
import { workspaceRoot, workspaceSummary } from "./workspace";
import { uid } from "./utils";
import { memoryFile } from "./paths";

export type Emit = (event: Record<string, unknown>) => void;

/** Model yang pernah menolak tool calling — jangan kirim tools lagi agar tidak dobel request. */
const NO_TOOLS = new Set<string>();

interface EffortConfig {
  label: string;
  maxTokens: number;
  reasoning: "low" | "medium" | "high";
  steps: number;
  directive: string;
}

export function effortConfig(effort: Effort): EffortConfig {
  switch (effort) {
    case "low":
      return {
        label: "Rendah",
        maxTokens: 4096,
        reasoning: "low",
        steps: 4,
        directive:
          "Kecepatan di atas kedalaman. Jawab langsung, tool seperlunya, tanpa analisis panjang.",
      };
    case "high":
      return {
        label: "Tinggi",
        maxTokens: 12288,
        reasoning: "high",
        steps: 8,
        directive:
          "Lakukan analisis mendalam sebelum menulis kode. Periksa edge case, verifikasi dengan build/test, dan jelaskan trade-off penting.",
      };
    case "ultra":
      return {
        label: "Ultra",
        maxTokens: 16384,
        reasoning: "high",
        steps: 12,
        directive:
          "Mode maksimal: rencanakan bertahap, periksa ulang setiap perubahan, jalankan verifikasi menyeluruh, dan jangan berhenti sebelum tugas benar-benar selesai. Abaikan optimasi kecepatan.",
      };
    case "medium":
    default:
      return {
        label: "Sedang",
        maxTokens: 8192,
        reasoning: "medium",
        steps: 6,
        directive:
          "Seimbang antara kecepatan dan ketelitian. Baca file yang relevan, lakukan perubahan, lalu verifikasi.",
      };
  }
}

const MEMORY_FILES = ["SOUL.md", "IDENTITY.md", "MEMORY.md", "SKILL.md"] as const;

async function readMemoryBlock() {
  const chunks: string[] = [];
  for (const file of MEMORY_FILES) {
    const content = await memoryFile(file)
      .then((target) => fs.readFile(target, "utf8"))
      .catch(() => "(belum ada)");
    const tag = file.replace(".md", "").toLowerCase();
    chunks.push(`<${tag}>\n${content.trim().slice(0, 24_000)}\n</${tag}>`);
  }
  return chunks.join("\n\n");
}

export async function buildSystemPrompt(effort: Effort) {
  const cfg = effortConfig(effort);
  const memory = await readMemoryBlock();
  const summary = await workspaceSummary();
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `Kamu adalah ONYX, AI coding agent yang berjalan di aplikasi web lokal milik satu pengguna.

## Identitas & nilai
${memory}

## Workspace
Root absolut: ${workspaceRoot()}
Di tool, semua path relatif terhadap root itu. Isi saat ini:
\`\`\`
${summary}
\`\`\`

## Tool
Kamu punya: list_files, read_file, write_file, edit_file, delete_file, search_files, run_command, save_memory, fetch_url, generate_image.
Aturan:
- Baca file sebelum mengubahnya. Jangan menebak isi file.
- Gunakan path relatif (contoh: "src/app.tsx"), bukan path absolut.
- Setelah menulis kode, jalankan verifikasi nyata (typecheck/build/test) lewat run_command.
- Jangan pernah menjalankan perintah destruktif terhadap sistem.
- Jangan membocorkan isi .env, API key, atau kredensial.
- Lampiran pengguna disimpan di folder ".uploads/" di dalam workspace dan bisa dibaca dengan read_file bila berupa teks.

## Gaya jawaban
- Bahasa pengguna (default Bahasa Indonesia).
- Ringkas, jelas, markdown rapi. Sebut file yang diubah dan hasil verifikasi.
- Jangan mengklaim sudah mengerjakan sesuatu bila tool tidak dijalankan.
- Untuk UI baru: monokrom (hitam, abu-abu, putih), animasi halus, tanpa warna lain.

## Level effort: ${cfg.label}
${cfg.directive}

Tanggal hari ini: ${today}.`;
}

interface ApiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<Record<string, unknown>> | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

async function textForAttachments(message: ChatMessage, detailed: boolean) {
  if (!message.attachments?.length) return "";
  const rows: string[] = [];
  let budget = detailed ? 28_000 : 0;
  for (const meta of message.attachments) {
    const detail = await getUpload(meta.id);
    const info = detail ?? meta;
    rows.push(
      `- ${info.name} (${info.mime}, ${(info.size / 1024).toFixed(0)} KB) · path: ${info.path}`,
    );
    if (budget <= 0) continue;
    if (info.kind === "video" || info.kind === "audio") {
      rows.push(`  Media ${info.kind}: tidak dikirim ke model. Gunakan run_command (ffmpeg/ffprobe) bila perlu.`);
      continue;
    }
    const text = await getUploadText(info);
    if (text && text.trim()) {
      const slice = text.slice(0, Math.min(budget, 12_000));
      budget -= slice.length;
      rows.push(`\n--- isi ${info.name} ---\n${slice}\n--- akhir ${info.name} ---`);
    }
  }
  if (!detailed) return `\n\nLampiran pada pesan ini:\n${rows.join("\n")}`;
  return `\n\nLampiran:\n${rows.join("\n")}`;
}

export async function buildHistory(session: Session, effort: Effort): Promise<ApiMessage[]> {
  const system: ApiMessage = {
    role: "system",
    content: await buildSystemPrompt(effort),
  };

  const messages = session.messages.filter((m) => !m.error && (m.content || m.attachments?.length));
  const windowed = messages.slice(-28);
  const result: ApiMessage[] = [system];
  let charBudget = 150_000;
  let imageBudget = 14 * 1024 * 1024;
  let imageTurns = 3;

  // Cari pesan user terakhir yang punya lampiran
  const lastUserIndex = (() => {
    for (let i = windowed.length - 1; i >= 0; i -= 1) {
      if (windowed[i].role === "user") return i;
    }
    return -1;
  })();
  const lastAttachmentIndex = (() => {
    for (let i = windowed.length - 1; i >= 0; i -= 1) {
      if (windowed[i].role === "user" && windowed[i].attachments?.length) return i;
    }
    return -1;
  })();

  for (let i = 0; i < windowed.length; i += 1) {
    const message = windowed[i];
    const isLatest = i === lastUserIndex;
    const isAttachmentTurn = i === lastAttachmentIndex;
    let text = message.content?.trim() ?? "";
    if (charBudget < 20_000) text = text.slice(-Math.max(2_000, charBudget));
    text += await textForAttachments(message, isAttachmentTurn);
    charBudget -= text.length;
    if (charBudget <= 0) break;

    if (message.role === "assistant") {
      result.push({ role: "assistant", content: text || "(selesai)" });
      continue;
    }

    const imageRefs: Array<Record<string, unknown>> = [];
    if (isLatest && message.attachments?.length) {
      const images = message.attachments.filter((a) => a.kind === "image");
      for (const meta of images) {
        if (imageTurns <= 0 || imageBudget <= 0) break;
        if (meta.size > 5_500_000) continue;
        const dataUrl = await imageDataUrl(meta, 5_500_000);
        if (!dataUrl) continue;
        imageBudget -= dataUrl.length;
        imageRefs.push({ type: "text", text: `Gambar: ${meta.name}` });
        imageRefs.push({ type: "image_url", image_url: { url: dataUrl } });
      }
      imageTurns -= 1;
    }

    if (imageRefs.length) {
      result.push({
        role: "user",
        content: [{ type: "text", text: text || "(lihat lampiran)" }, ...imageRefs],
      });
    } else {
      result.push({ role: "user", content: text || "(tanpa teks)" });
    }
  }

  return result;
}

interface StreamOutcome {
  content: string;
  reasoning: string;
  toolCalls: Array<{ id: string; name: string; args: string }>;
  usage?: Usage;
  finishReason?: string;
}

async function streamOnce(
  messages: ApiMessage[],
  options: {
    model: string;
    effort: Effort;
    tools: boolean;
    signal: AbortSignal;
    emit: Emit;
  },
): Promise<StreamOutcome> {
  const cfg = effortConfig(options.effort);
  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: cfg.maxTokens,
  };
  if (options.tools) {
    body.tools = TOOL_DEFS;
    body.tool_choice = "auto";
  }
  if (supportsReasoningEffort(options.model)) {
    body.reasoning_effort = cfg.reasoning;
  }

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || message;
    } catch {
      if (text) message = text.slice(0, 300);
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const content = { text: "", reasoning: "", tools: new Map<number, { id: string; name: string; args: string }>(), usage: undefined as Usage | undefined, finishReason: "" };

  const handleChunk = (json: any) => {
    const choice = json?.choices?.[0];
    if (json?.usage) {
      content.usage = {
        promptTokens: json.usage.prompt_tokens,
        completionTokens: json.usage.completion_tokens,
        totalTokens: json.usage.total_tokens,
      };
    }
    if (!choice) return;
    const delta = choice.delta ?? choice.message ?? {};
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
      content.reasoning += delta.reasoning_content;
      options.emit({ type: "reasoning", text: delta.reasoning_content });
    } else if (typeof delta.reasoning === "string" && delta.reasoning) {
      content.reasoning += delta.reasoning;
      options.emit({ type: "reasoning", text: delta.reasoning });
    }
    const piece = delta.content;
    if (typeof piece === "string" && piece) {
      content.text += piece;
      options.emit({ type: "delta", text: piece });
    } else if (Array.isArray(piece)) {
      for (const part of piece) {
        if (part?.type === "text" && typeof part.text === "string") {
          content.text += part.text;
          options.emit({ type: "delta", text: part.text });
        }
      }
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const call of delta.tool_calls) {
        const index = typeof call.index === "number" ? call.index : content.tools.size;
        const existing = content.tools.get(index) ?? { id: "", name: "", args: "" };
        if (call.id) existing.id = call.id;
        if (call.function?.name) existing.name = call.function.name;
        if (call.function?.arguments) existing.args += call.function.arguments;
        content.tools.set(index, existing);
      }
    }
    if (choice.finish_reason) content.finishReason = choice.finish_reason;
  };

  if (contentType.includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Respons streaming kosong.");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data === "[DONE]") {
            buffer = "";
            break;
          }
          try {
            handleChunk(JSON.parse(data));
          } catch {
            // chunk tidak lengkap / bukan JSON
          }
        }
        index = buffer.indexOf("\n");
      }
    }
  } else {
    const json = await res.json();
    handleChunk(json);
  }

  return {
    content: content.text,
    reasoning: content.reasoning,
    toolCalls: [...content.tools.values()].filter((call) => call.name),
    usage: content.usage,
    finishReason: content.finishReason,
  };
}

function friendlyError(error: unknown) {
  const err = error as Error & { status?: number };
  const status = err?.status;
  const message = err?.message || "Terjadi kesalahan.";
  if (status === 401) return "API key ditolak. Periksa CLASSAI_API_KEY di .env.";
  if (status === 402) return "Kredit/paket Classai habis. Isi ulang di router.classai.id, lalu coba lagi.";
  if (status === 403) return "Akses model ditolak. Key mungkin dibatasi ke model lain.";
  if (status === 404) return `Model tidak tersedia (${message}). Pilih model lain.`;
  if (status === 429) return "Rate limit tercapai. Tunggu sebentar lalu coba lagi.";
  if (status === 503 || status === 502) return "Server model sedang bermasalah. Coba lagi atau ganti model.";
  if (/abort/i.test(message)) return "Dibatalkan.";
  return message;
}

export async function runAgent(options: {
  session: Session;
  model: string;
  effort: Effort;
  signal: AbortSignal;
  emit: Emit;
}): Promise<ChatMessage> {
  const { session, model, effort, signal, emit } = options;
  const cfg = effortConfig(effort);
  const traces: ToolTrace[] = [];
  let content = "";
  let reasoning = "";
  let usage: Usage | undefined;
  let errorMessage: string | undefined;

  if (!hasApiKey()) {
    throw new Error("CLASSAI_API_KEY belum diisi di .env. Buka file .env lalu tempel API key dari router.classai.id.");
  }

  let messages = await buildHistory(session, effort);
  let toolsEnabled = !NO_TOOLS.has(model);
  emit({ type: "status", text: "Menghubungkan ke model…" });

  try {
    for (let step = 0; step < cfg.steps; step += 1) {
      if (signal.aborted) break;
      let outcome: StreamOutcome;
      try {
        outcome = await streamOnce(messages, { model, effort, tools: toolsEnabled, signal, emit });
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (toolsEnabled && (status === 400 || status === 422)) {
          NO_TOOLS.add(model);
          toolsEnabled = false;
          emit({
            type: "notice",
            text: "Model ini menolak tool calling — melanjutkan dalam mode chat biasa.",
          });
          outcome = await streamOnce(messages, { model, effort, tools: false, signal, emit });
        } else {
          throw error;
        }
      }

      content += outcome.content;
      reasoning += outcome.reasoning;
      if (outcome.usage) usage = outcome.usage;
      if (!outcome.toolCalls.length) break;

      messages = [
        ...messages,
        {
          role: "assistant",
          content: outcome.content || null,
          tool_calls: outcome.toolCalls.map((call) => ({
            id: call.id || uid("call"),
            type: "function",
            function: { name: call.name, arguments: call.args || "{}" },
          })),
        },
      ];

      for (const call of outcome.toolCalls) {
        if (signal.aborted) break;
        const id = call.id || uid("call");
        const started = Date.now();
        emit({
          type: "tool_start",
          id,
          name: call.name,
          args: call.args.slice(0, 1200),
        });
        const result = await executeTool(call.name, call.args, signal);
        const trace: ToolTrace = {
          id,
          name: call.name,
          args: call.args.slice(0, 4000),
          result: result.output.slice(0, 20_000),
          ok: result.ok,
          durationMs: Date.now() - started,
        };
        traces.push(trace);
        emit({
          type: "tool_end",
          id,
          name: call.name,
          ok: result.ok,
          display: result.display,
          result: result.output.slice(0, 4000),
          durationMs: trace.durationMs,
        });
        messages.push({
          role: "tool",
          tool_call_id: id,
          content: result.output.slice(0, 16_000),
        });
      }
    }
  } catch (error) {
    // Pengguna menekan Stop: jangan simpan pesan error palsu ke riwayat.
    if (signal.aborted) throw error;
    errorMessage = friendlyError(error);
    emit({ type: "error", message: errorMessage });
  }

  const message: ChatMessage = {
    id: uid("m"),
    role: "assistant",
    content: content.trim(),
    reasoning: reasoning.trim() ? reasoning.slice(0, 40_000) : undefined,
    tools: traces.length ? traces : undefined,
    model,
    effort,
    usage,
    error: errorMessage,
    createdAt: Date.now(),
  };

  return message;
}
