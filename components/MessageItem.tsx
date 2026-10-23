"use client";

import { memo, useState } from "react";
import type { AttachmentMeta, ChatMessage, LiveState, ToolTrace } from "@/lib/types";
import { Markdown } from "./Markdown";
import {
  Alert,
  Archive,
  Brain,
  Check,
  ChevronDown,
  Copy,
  FileCode,
  FileText,
  Film,
  ImageIcon,
  Logo,
  Music,
  Play,
  Refresh,
  Wrench,
  X,
} from "./icons";
import { Spinner } from "./ui";
import { cn, formatBytes, timeAgo } from "@/lib/utils";

const KIND_ICON = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  document: FileText,
  code: FileCode,
  archive: Archive,
  file: FileText,
};

export function AttachmentGrid({
  attachments,
  onPreview,
  compact,
}: {
  attachments: AttachmentMeta[];
  onPreview: (attachment: AttachmentMeta) => void;
  compact?: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <div className={cn("mt-2 grid gap-2", compact ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")}>
      {attachments.map((attachment) => {
        const Icon = KIND_ICON[attachment.kind] ?? FileText;
        const isVisual = attachment.kind === "image" || attachment.kind === "video";
        return (
          <button
            key={attachment.id}
            type="button"
            onClick={() => onPreview(attachment)}
            className={cn(
              "group/att relative overflow-hidden rounded-lg border border-line bg-surface text-left transition-colors hover:border-lineStrong",
              isVisual ? "aspect-[16/10]" : "flex items-center gap-2.5 px-2.5 py-2",
            )}
          >
            {isVisual ? (
              <>
                {attachment.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover/att:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-box2">
                    <Film size={22} className="text-mute" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5">
                  <Icon size={10} className="shrink-0 text-mute" />
                  <span className="truncate text-[9.5px] text-[#d4d4d4]">{attachment.name}</span>
                </div>
                {attachment.kind === "video" ? (
                  <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white backdrop-blur-sm">
                    <Play size={10} />
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-box text-mute">
                  <Icon size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-ink">{attachment.name}</span>
                  <span className="block text-[9.5px] text-dim">{formatBytes(attachment.size)}</span>
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ToolRow({ tool, live }: { tool: ToolTrace; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const running = live && !tool.result;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-box2"
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
            running
              ? "border-line bg-box text-mute"
              : tool.ok
                ? "border-line bg-box text-ink"
                : "border-[#4a4a4a] bg-[#1b1b1b] text-ink",
          )}
        >
          {running ? (
            <Spinner size={10} />
          ) : tool.ok ? (
            <Check size={11} />
          ) : (
            <X size={11} />
          )}
        </span>
        <Wrench size={11} className="shrink-0 text-dim" />
        <span className="shrink-0 font-mono text-[10.5px] text-ink">{tool.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-dim">
          {tool.result
            ? tool.result.split("\n")[0]?.slice(0, 70)
            : tool.args.slice(0, 70) || "berjalan…"}
        </span>
        {tool.durationMs > 0 ? (
          <span className="shrink-0 font-mono text-[9px] text-faint">{(tool.durationMs / 1000).toFixed(1)}s</span>
        ) : null}
        <ChevronDown
          size={11}
          className={cn("shrink-0 text-dim transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="border-t border-line px-2.5 py-2">
          <p className="mb-1 text-[9px] uppercase tracking-[0.14em] text-faint">Argumen</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded border border-line bg-black/50 p-2 font-mono text-[10px] text-mute">
            {tool.args || "{}"}
          </pre>
          <p className="mb-1 mt-2 text-[9px] uppercase tracking-[0.14em] text-faint">Hasil</p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-black/50 p-2 font-mono text-[10px] text-mute">
            {tool.result || (running ? "Menjalankan…" : "(tanpa output)")}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function ToolList({ tools, live }: { tools: ToolTrace[]; live?: boolean }) {
  if (!tools.length) return null;
  return (
    <div className="my-3 space-y-1.5">
      {tools.length > 1 ? (
        <p className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] text-faint">
          <Wrench size={10} /> {tools.length} tool dijalankan
        </p>
      ) : null}
      {tools.map((tool) => (
        <ToolRow key={tool.id} tool={tool} live={live} />
      ))}
    </div>
  );
}

function Reasoning({ text, open }: { text: string; open?: boolean }) {
  return (
    <details open={open} className="group my-2 overflow-hidden rounded-lg border border-line bg-[#0b0b0b]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[10.5px] text-dim transition-colors hover:bg-box2">
        <Brain size={11} />
        <span>Proses berpikir</span>
        <span className="font-mono text-[9px] text-faint">{text.length} char</span>
        <ChevronDown size={11} className="ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-3 py-2.5">
        <p className="max-h-60 overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-mute">
          {text}
        </p>
      </div>
    </details>
  );
}

function UsageLine({ message }: { message: ChatMessage }) {
  const usage = message.usage;
  if (!usage?.totalTokens) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[9px] text-faint">
      <span>{usage.totalTokens.toLocaleString("en-US")} token</span>
      {usage.promptTokens ? <span>· masuk {usage.promptTokens.toLocaleString("en-US")}</span> : null}
      {usage.completionTokens ? <span>· keluar {usage.completionTokens.toLocaleString("en-US")}</span> : null}
    </p>
  );
}

export function AssistantAvatar() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-box text-ink">
      <Logo size={15} />
    </span>
  );
}

function MessageItemInner({
  message,
  live,
  isLast,
  streaming,
  onRegenerate,
  onPreview,
}: {
  message: ChatMessage;
  live?: LiveState;
  isLast?: boolean;
  streaming?: boolean;
  onRegenerate?: () => void;
  onPreview: (attachment: AttachmentMeta) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex animate-enter justify-end px-4 py-2.5 sm:px-6">
        <div className="max-w-[86%] sm:max-w-[75%]">
          <div className="inset-line rounded-2xl rounded-br-md border border-line bg-box px-3.5 py-2.5">
            {message.content ? (
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
                {message.content}
              </p>
            ) : null}
            {message.attachments?.length ? (
              <AttachmentGrid attachments={message.attachments} onPreview={onPreview} />
            ) : null}
          </div>
          <p className="mt-1 pr-1 text-right text-[9px] text-faint">
            {timeAgo(message.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  const content = live ? live.content : message.content;
  const reasoning = live ? live.reasoning : message.reasoning;
  const tools = live ? live.tools : message.tools ?? [];
  const error = live ? live.error : message.error;

  return (
    <div className="group/msg flex animate-enter gap-2.5 px-4 py-3 sm:px-6">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11.5px] font-semibold tracking-[0.14em] text-ink">ONYX</span>
          {message.model ? (
            <span className="rounded border border-line px-1.5 py-[1px] font-mono text-[9px] text-dim">
              {message.model}
            </span>
          ) : null}
          {message.effort ? (
            <span className="rounded border border-line px-1.5 py-[1px] text-[9px] uppercase tracking-[0.1em] text-dim">
              {message.effort}
            </span>
          ) : null}
          <span className="text-[9px] text-faint">{timeAgo(message.createdAt)}</span>
        </div>

        {reasoning ? <Reasoning text={reasoning} open={Boolean(live && !content)} /> : null}
        {tools.length ? <ToolList tools={tools} live={Boolean(live)} /> : null}

        {content ? (
          <div className={cn(live && streaming && "caret")}>
            <Markdown content={content} />
          </div>
        ) : null}

        {!content && !error && live && streaming ? (
          <div className="flex items-center gap-2 py-1.5">
            <span className="flex items-center gap-1">
              <span className="typing-dot h-1 w-1 rounded-full bg-ink" />
              <span className="typing-dot h-1 w-1 rounded-full bg-ink" />
              <span className="typing-dot h-1 w-1 rounded-full bg-ink" />
            </span>
            <span className="text-[11px] text-dim">{live.status || "Berpikir…"}</span>
          </div>
        ) : null}

        {error ? (
          <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-dashed border-lineStrong bg-[#101010] px-3 py-2.5">
            <Alert size={14} className="mt-0.5 shrink-0 text-ink" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-medium text-ink">Gagal menyelesaikan permintaan</p>
              <p className="mt-0.5 break-words text-[11px] leading-relaxed text-mute">{error}</p>
            </div>
          </div>
        ) : null}

        <UsageLine message={message} />

        {!live ? (
          <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100 focus-within:opacity-100">
            {content ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(content);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-dim transition-colors hover:bg-box2 hover:text-ink"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "Tersalin" : "Salin"}
              </button>
            ) : null}
            {isLast && !streaming && onRegenerate ? (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-dim transition-colors hover:bg-box2 hover:text-ink"
              >
                <Refresh size={11} />
                Buat ulang
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const MessageItem = memo(
  MessageItemInner,
  (prev, next) =>
    prev.message === next.message &&
    prev.live === next.live &&
    prev.isLast === next.isLast &&
    prev.streaming === next.streaming &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onPreview === next.onPreview,
);
