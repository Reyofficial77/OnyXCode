"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AttachmentMeta, LiveState, Session } from "@/lib/types";
import { MessageItem } from "./MessageItem";
import {
  ArrowRight,
  ChevronDown,
  Code,
  Database,
  Folder,
  Sparkle,
  Terminal,
  Video,
  Wrench,
  X,
} from "./icons";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  {
    icon: Code,
    title: "Buat landing page",
    text: "Monokrom, animasi halus, responsif.",
    prompt:
      "Buat landing page Next.js + Tailwind di folder baru: hero dengan animasi halus, fitur, testimoni, dan CTA. Tema hitam–abu–putih saja. Pastikan responsive dan build bersih.",
  },
  {
    icon: Wrench,
    title: "Debug error build",
    text: "Telusuri stack trace sampai akar.",
    prompt:
      "Saya punya error build. Tolong periksa workspace, jalankan build untuk mereproduksi error, temukan akar masalahnya, perbaiki, lalu verifikasi ulang. Jelaskan singkat penyebabnya.",
  },
  {
    icon: Database,
    title: "REST API lengkap",
    text: "CRUD, validasi, dan test.",
    prompt:
      "Bangun REST API sederhana dengan Next.js route handlers: CRUD item, validasi input, penyimpanan JSON lokal, dan test dasar. Sertakan dokumentasi endpoint singkat.",
  },
  {
    icon: Video,
    title: "Aset visual",
    text: "Gambar hero & video dari prompt.",
    prompt:
      "Buat gambar hero monokrom beresolusi tinggi untuk landing page bertema AI coding agent, lalu simpan ke workspace dan jelaskan cara memakainya.",
  },
];

export function ChatView({
  session,
  live,
  streaming,
  composer,
  onRegenerate,
  onPreview,
  onFiles,
  onSuggestion,
}: {
  session: Session | null;
  live: LiveState | null;
  streaming: boolean;
  composer: ReactNode;
  onRegenerate: () => void;
  onPreview: (attachment: AttachmentMeta) => void;
  onFiles: (files: FileList | File[]) => void;
  onSuggestion: (text: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const messages = session?.messages ?? [];
  const empty = messages.length === 0 && !live;

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
  }

  function onScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    setAtBottom(distance < 140);
  }

  useEffect(() => {
    if (empty) return;
    if (atBottom || streaming) {
      scrollToBottom(streaming ? "auto" : "smooth");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, live?.content.length, live?.tools.length, live?.reasoning.length, streaming]);

  useEffect(() => {
    if (streaming) {
      setAtBottom(true);
      requestAnimationFrame(() => scrollToBottom("auto"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        if (event.dataTransfer?.types?.includes("Files")) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (event.dataTransfer?.files?.length) onFiles(event.dataTransfer.files);
      }}
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto overscroll-contain scroll-soft"
        >
          {empty ? (
            <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 sm:px-6">
              <div className="relative mb-7 flex h-28 w-28 items-center justify-center">
                <span className="absolute inset-0 rounded-full border border-white/10" />
                <span className="absolute inset-3 rounded-full border border-white/[0.07]" />
                <span className="absolute inset-0 animate-orbit">
                  <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/60" />
                </span>
                <span className="absolute inset-0 animate-orbit [animation-direction:reverse] [animation-duration:30s]">
                  <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/30" />
                </span>
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-lineStrong bg-[#101010] panel-shadow">
                  <span className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_60%)]" />
                  <Sparkle size={26} className="relative text-ink" />
                </div>
              </div>

              <p className="text-[10px] uppercase tracking-[0.24em] text-dim">ONYX workspace</p>
              <h1 className="mt-2.5 text-center text-[26px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[32px]">
                Apa yang kita bangun?
              </h1>
              <p className="mt-2 max-w-md text-center text-[12.5px] leading-relaxed text-mute">
                Beri instruksi. ONYX membaca workspace, menjalankan tool, menulis kode, dan
                memverifikasi hasilnya.
              </p>

              <div className="mt-7 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => onSuggestion(item.prompt)}
                      className="group flex animate-enter items-center gap-3 rounded-xl border border-line bg-[#0b0b0b] p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-lineStrong hover:bg-[#101010]"
                      style={{ animationDelay: `${index * 60}ms` }}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-box text-mute transition-colors group-hover:text-ink">
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-ink">{item.title}</span>
                        <span className="block truncate text-[10.5px] text-dim">{item.text}</span>
                      </span>
                      <ArrowRight
                        size={13}
                        className="shrink-0 text-faint transition-all group-hover:translate-x-0.5 group-hover:text-mute"
                      />
                    </button>
                  );
                })}
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[9.5px] uppercase tracking-[0.12em] text-faint">
                <span className="flex items-center gap-1.5">
                  <Folder size={11} /> Workspace lokal
                </span>
                <span className="flex items-center gap-1.5">
                  <Terminal size={11} /> Tool eksekusi
                </span>
                <span className="flex items-center gap-1.5">
                  <Database size={11} /> Memory permanen
                </span>
                <span className="flex items-center gap-1.5">
                  <Video size={11} /> Gambar & video
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl pb-6">
              {messages.map((message, index) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isLast={index === lastAssistantIndex}
                  streaming={streaming}
                  onRegenerate={onRegenerate}
                  onPreview={onPreview}
                />
              ))}
              {live ? (
                <MessageItem
                  message={{
                    id: "live",
                    role: "assistant",
                    content: "",
                    model: session?.model,
                    effort: session?.effort,
                    createdAt: live.startedAt,
                  }}
                  live={live}
                  streaming={streaming}
                  onPreview={onPreview}
                />
              ) : null}
            </div>
          )}
        </div>

        {!empty && !atBottom ? (
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 animate-pop items-center gap-1.5 rounded-full border border-lineStrong bg-[#111] px-3 py-1.5 text-[10.5px] text-mute shadow-xl transition-colors hover:text-ink"
          >
            <ChevronDown size={12} />
            Pesan terbaru
          </button>
        ) : null}
      </div>

      {composer}

      {dragging ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-[2px]">
          <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-lineStrong bg-[#0d0d0d] px-8 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-box text-ink">
              <ArrowRight size={20} className="rotate-90" />
            </span>
            <p className="text-[14px] font-medium text-ink">Lepaskan file di sini</p>
            <p className="text-[11px] text-dim">Foto, video, dokumen, arsip — maks 64 MB per file.</p>
            <button
              type="button"
              onClick={() => setDragging(false)}
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-mute hover:text-ink"
            >
              <X size={11} /> Batal
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
