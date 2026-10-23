"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Alert, Check, X } from "./icons";
import { cn } from "@/lib/utils";

/* ── Button ───────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "outline" | "soft";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-black hover:bg-white border border-transparent disabled:bg-[#3a3a3a] disabled:text-[#8a8a8a]",
  secondary:
    "bg-box2 text-ink border border-line hover:bg-box3 hover:border-lineStrong disabled:opacity-50",
  outline:
    "bg-transparent text-ink border border-lineStrong hover:bg-box2 disabled:opacity-50",
  ghost:
    "bg-transparent text-mute border border-transparent hover:text-ink hover:bg-box2 disabled:opacity-40",
  soft:
    "bg-[rgba(255,255,255,0.06)] text-ink border border-transparent hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-40",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-[13px] rounded-xl gap-2",
  lg: "h-11 px-5 text-[13.5px] rounded-xl gap-2",
  icon: "h-9 w-9 rounded-lg justify-center",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "btn-press inline-flex select-none items-center justify-center font-medium outline-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "btn-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-mute outline-none",
        "hover:bg-box2 hover:text-ink",
        active && "bg-box2 text-ink border-line",
        "disabled:opacity-40 disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ── Spinner ──────────────────────────────────────────── */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full border-2 border-[#3a3a3a] border-t-ink spin", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

/* ── Modal ────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  children,
  className,
  labelledBy,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="absolute inset-0 animate-fade bg-black/75 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full animate-pop overflow-hidden rounded-2xl border border-line bg-[#0b0b0b] panel-shadow",
          wide ? "max-w-3xl" : "max-w-xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Segmented ────────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  className,
}: {
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5",
        className,
      )}
      role="tablist"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          title={option.hint}
          onClick={() => onChange(option.value)}
          className={cn(
            "btn-press rounded-[6px] font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-[11.5px]" : "px-3 py-1.5 text-[12.5px]",
            value === option.value
              ? "bg-ink text-black"
              : "text-mute hover:text-ink hover:bg-box2",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ── Kbd ──────────────────────────────────────────────── */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[19px] min-w-[19px] items-center justify-center rounded border border-line bg-box px-1 font-mono text-[10px] text-dim">
      {children}
    </kbd>
  );
}

/* ── Field ────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-ink">{label}</span>
        {hint ? <span className="text-[10.5px] text-dim">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

/* ── Toasts ───────────────────────────────────────────── */

export interface ToastItem {
  id: number;
  title?: string;
  message: string;
  tone?: "info" | "success" | "error";
}

const ToastContext = createContext<{
  push: (message: string, options?: { title?: string; tone?: ToastItem["tone"] }) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (message: string, options?: { title?: string; tone?: ToastItem["tone"] }) => {
      const id = Date.now() + Math.random();
      setItems((current) => [
        ...current.slice(-3),
        { id, message, title: options?.title, tone: options?.tone ?? "info" },
      ]);
      window.setTimeout(() => remove(id), options?.tone === "error" ? 7000 : 4500);
    },
    [remove],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto animate-pop overflow-hidden rounded-xl border border-line bg-[#111] panel-shadow"
            role="status"
          >
            <div className="flex items-start gap-3 p-3.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-box2 text-ink">
                {item.tone === "success" ? (
                  <Check size={13} />
                ) : item.tone === "error" ? (
                  <Alert size={13} />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {item.title ? (
                  <p className="text-[12.5px] font-semibold text-ink">{item.title}</p>
                ) : null}
                <p className="text-[12px] leading-relaxed text-mute whitespace-pre-wrap break-words">
                  {item.message}
                </p>
              </div>
              <button
                onClick={() => remove(item.id)}
                className="btn-press -mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded-md text-dim hover:bg-box2 hover:text-ink"
                aria-label="Tutup notifikasi"
              >
                <X size={13} />
              </button>
            </div>
            <div className="h-[2px] w-full bg-[rgba(255,255,255,0.06)]">
              <div
                className="h-full bg-[#8a8a8a]"
                style={{
                  animation: `onyx-progress-out ${item.tone === "error" ? 7 : 4.5}s linear forwards`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes onyx-progress-out { from { width: 100%; } to { width: 0%; } }`}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast harus dipakai di dalam ToastProvider");
  return context;
}
