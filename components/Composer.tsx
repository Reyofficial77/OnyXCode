"use client";

import { useEffect, useRef } from "react";
import type { AttachmentMeta, Effort, ModelInfo } from "@/lib/types";
import {
  Alert,
  Archive,
  FileCode,
  FileText,
  ImageIcon,
  Music,
  Paperclip,
  Settings,
  Stop,
  ArrowUp,
  X,
  Film,
} from "./icons";
import { ModelPicker, EffortPicker } from "./Pickers";
import { Spinner } from "./ui";
import { cn, formatBytes } from "@/lib/utils";

const KIND_ICON = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  document: FileText,
  code: FileCode,
  archive: Archive,
  file: FileText,
};

function AttachmentChip({
  attachment,
  onRemove,
  onPreview,
}: {
  attachment: AttachmentMeta;
  onRemove: () => void;
  onPreview: () => void;
}) {
  const Icon = KIND_ICON[attachment.kind] ?? FileText;
  return (
    <div className="group relative flex w-[172px] shrink-0 items-center gap-2 rounded-lg border border-line bg-surface py-1.5 pl-1.5 pr-6">
      <button
        type="button"
        onClick={onPreview}
        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-box text-mute transition-colors hover:text-ink"
        aria-label={`Pratinjau ${attachment.name}`}
      >
        {attachment.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Icon size={14} />
        )}
      </button>
      <button type="button" onClick={onPreview} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[11px] text-ink">{attachment.name}</span>
        <span className="block text-[9.5px] text-dim">{formatBytes(attachment.size)}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded text-dim transition-colors hover:bg-box2 hover:text-ink"
        aria-label={`Hapus ${attachment.name}`}
      >
        <X size={11} />
      </button>
    </div>
  );
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  attachments,
  uploading,
  onFiles,
  onRemoveAttachment,
  onPreviewAttachment,
  models,
  model,
  onModelChange,
  effort,
  onEffortChange,
  onRefreshModels,
  modelsLoading,
  apiKeyOk,
  onOpenSettings,
  focusSignal,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  attachments: AttachmentMeta[];
  uploading: boolean;
  onFiles: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onPreviewAttachment: (attachment: AttachmentMeta) => void;
  models: ModelInfo[];
  model: string;
  onModelChange: (id: string) => void;
  effort: Effort;
  onEffortChange: (effort: Effort) => void;
  onRefreshModels: () => void;
  modelsLoading: boolean;
  apiKeyOk: boolean;
  onOpenSettings: () => void;
  focusSignal: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => {
    if (focusSignal > 0) {
      const timer = window.setTimeout(() => textareaRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
  }, [focusSignal]);

  const canSend = Boolean(value.trim() || attachments.length) && !streaming && !uploading;

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length) {
      event.preventDefault();
      onFiles(files);
    }
  }

  return (
    <div className="relative px-3 pb-3 pt-1 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-3xl">
        {!apiKeyOk ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="mb-2.5 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-lineStrong bg-[#0d0d0d] px-3 py-2.5 text-left transition-colors hover:border-[#5a5a5a] hover:bg-[#111]"
          >
            <Alert size={15} className="shrink-0 text-ink" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-ink">
                API key Classai belum terpasang
              </span>
              <span className="block text-[10.5px] text-dim">
                Tempel <span className="font-mono">CLASSAI_API_KEY</span> di file .env, lalu restart server.
              </span>
            </span>
            <Settings size={14} className="shrink-0 text-dim" />
          </button>
        ) : null}

        <div
          className={cn(
            "overflow-visible rounded-2xl border border-line bg-[#0c0c0c] transition-[background-color,border-color,box-shadow] duration-200",
            "focus-within:bg-[#0e0e0e]",
            "shadow-[0_18px_50px_-24px_rgba(0,0,0,0.95)]",
          )}
        >
          {attachments.length || uploading ? (
            <div className="flex gap-2 overflow-x-auto px-2.5 pb-1 pt-2.5 no-scrollbar">
              {attachments.map((attachment) => (
                <AttachmentChip
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => onRemoveAttachment(attachment.id)}
                  onPreview={() => onPreviewAttachment(attachment)}
                />
              ))}
              {uploading ? (
                <div className="flex w-[150px] shrink-0 items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-2 py-1.5">
                  <Spinner size={13} />
                  <span className="text-[10.5px] text-dim">Mengunggah…</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <textarea
            id="composer-input"
            name="message"
            aria-label="Pesan untuk ONYX"
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onPaste={onPaste}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSend) onSubmit();
              }
            }}
            rows={1}
            placeholder="Minta ONYX membangun sesuatu…"
            spellCheck={false}
            className="block max-h-[220px] min-h-[54px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[13.5px] leading-relaxed text-ink placeholder:text-[#5b5b5b] focus:outline-none"
          />

          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <input
                ref={fileRef}
                id="composer-files"
                name="files"
                aria-label="Tambah lampiran"
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files?.length) onFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={streaming || uploading}
                className="btn-press flex h-8 w-8 items-center justify-center rounded-lg text-mute transition hover:bg-box2 hover:text-ink disabled:opacity-40"
                aria-label="Tambah lampiran"
                title="Tambah file, foto, video, dokumen"
              >
                <Paperclip size={16} />
              </button>
              <span className="mx-0.5 h-4 w-px bg-line" />
              <ModelPicker
                models={models}
                value={model}
                onChange={onModelChange}
                onRefresh={onRefreshModels}
                loading={modelsLoading}
                disabled={streaming}
              />
              <EffortPicker value={effort} onChange={onEffortChange} disabled={streaming} />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {value.length > 0 ? (
                <span className="hidden text-[9.5px] tabular-nums text-faint sm:inline">
                  {value.length}
                </span>
              ) : null}
              {streaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="btn-press flex h-9 w-9 items-center justify-center rounded-xl border border-lineStrong bg-box2 text-ink transition hover:bg-box3"
                  aria-label="Hentikan"
                  title="Hentikan"
                >
                  <Stop size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!canSend}
                  className={cn(
                    "btn-press flex h-9 w-9 items-center justify-center rounded-xl transition",
                    canSend
                      ? "bg-ink text-black hover:bg-white"
                      : "cursor-not-allowed bg-[#242424] text-[#6a6a6a]",
                  )}
                  aria-label="Kirim pesan"
                  title="Kirim"
                >
                  <ArrowUp size={17} />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[9.5px] text-faint">
          <span>Enter kirim · Shift+Enter baris baru</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Maks 64 MB per file</span>
          <span className="hidden sm:inline">·</span>
          <span>ONYX bisa salah — periksa hasil penting.</span>
        </p>
      </div>
    </div>
  );
}
