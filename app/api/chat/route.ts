import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { addMessage, createSession, getSession, saveSession } from "@/lib/store";
import { runAgent, type Emit } from "@/lib/agent";
import { DEFAULT_MODEL } from "@/lib/classai";
import { getUpload } from "@/lib/attachments";
import type { AttachmentMeta, ChatMessage, Effort } from "@/lib/types";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EFFORTS: Effort[] = ["low", "medium", "high", "ultra"];

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  let body: {
    sessionId?: string;
    content?: string;
    model?: string;
    effort?: string;
    attachmentIds?: string[];
    regenerate?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON valid." }, { status: 400 });
  }

  const model = typeof body.model === "string" && body.model ? body.model : DEFAULT_MODEL;
  const effort: Effort = EFFORTS.includes(body.effort as Effort)
    ? (body.effort as Effort)
    : "medium";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const regenerate = Boolean(body.regenerate);

  let session = body.sessionId ? await getSession(body.sessionId) : null;
  if (!session) {
    session = await createSession(model, effort);
  }
  session.model = model;
  session.effort = effort;

  let userMessage: ChatMessage | null = null;

  if (regenerate) {
    while (session.messages.length && session.messages[session.messages.length - 1].role === "assistant") {
      session.messages.pop();
    }
    if (!session.messages.some((message) => message.role === "user")) {
      return NextResponse.json({ error: "Tidak ada pesan untuk dibuat ulang." }, { status: 400 });
    }
    await saveSession(session);
  } else {
    const attachments: AttachmentMeta[] = [];
    if (Array.isArray(body.attachmentIds)) {
      for (const id of body.attachmentIds.slice(0, 10)) {
        if (typeof id !== "string") continue;
        const meta = await getUpload(id);
        if (meta) attachments.push(meta);
      }
    }
    if (!content && !attachments.length) {
      return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
    }
    userMessage = {
      id: uid("m"),
      role: "user",
      content,
      attachments: attachments.length ? attachments : undefined,
      createdAt: Date.now(),
    };
    addMessage(session, userMessage);
    await saveSession(session);
  }

  const sessionId = session.id;
  const sessionTitle = session.title;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (request.signal.aborted) controller.abort();
  request.signal.addEventListener("abort", abort);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      let closed = false;
      const emit: Emit = (event) => {
        if (closed) return;
        try {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      emit({
        type: "meta",
        sessionId,
        title: sessionTitle,
        userMessage,
      });

      try {
        const assistant = await runAgent({
          session: session!,
          model,
          effort,
          signal: controller.signal,
          emit,
        });
        addMessage(session!, assistant);
        await saveSession(session!);
        emit({
          type: "done",
          sessionId,
          title: session!.title,
          message: assistant,
          usage: assistant.usage ?? null,
        });
      } catch (error) {
        // Klien berhenti (tombol Stop / koneksi putus): simpan pesan user saja.
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
        emit({ type: "error", message });
        const fallback: ChatMessage = {
          id: uid("m"),
          role: "assistant",
          content: "",
          error: message,
          model,
          effort,
          createdAt: Date.now(),
        };
        addMessage(session!, fallback);
        await saveSession(session!).catch(() => undefined);
        emit({ type: "done", sessionId, title: session!.title, message: fallback, usage: null });
      } finally {
        request.signal.removeEventListener("abort", abort);
        closed = true;
        try {
          streamController.close();
        } catch {
          // sudah tertutup
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Session-Id": sessionId,
    },
  });
}
