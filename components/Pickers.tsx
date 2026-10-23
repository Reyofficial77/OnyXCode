"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Effort, ModelInfo } from "@/lib/types";
import { Check, ChevronDown, Refresh, Search, Sparkle } from "./icons";
import { Spinner } from "./ui";
import { cn, truncate } from "@/lib/utils";

const EFFORTS: Array<{ value: Effort; label: string; hint: string }> = [
  { value: "low", label: "Rendah", hint: "Cepat, jawaban singkat" },
  { value: "medium", label: "Sedang", hint: "Seimbang (disarankan)" },
  { value: "high", label: "Tinggi", hint: "Analisis & verifikasi menyeluruh" },
  { value: "ultra", label: "Ultra", hint: "Maksimal, lebih lama" },
];

export function EffortBars({ level, className }: { level: Effort; className?: string }) {
  const filled = { low: 1, medium: 2, high: 3, ultra: 4 }[level];
  return (
    <span className={cn("inline-flex h-3.5 items-end gap-[2px]", className)} aria-hidden="true">
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className="w-[2px] rounded-sm transition-colors"
          style={{
            height: `${4 + bar * 2.4}px`,
            background: bar <= filled ? "var(--ink)" : "#3a3a3a",
          }}
        />
      ))}
    </span>
  );
}

export function EffortPicker({
  value,
  onChange,
  disabled,
}: {
  value: Effort;
  onChange: (value: Effort) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = EFFORTS.find((item) => item.value === value) ?? EFFORTS[1];

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="btn-press inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[11.5px] text-mute transition hover:border-lineStrong hover:text-ink disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Level effort"
      >
        <EffortBars level={value} />
        <span className="hidden sm:inline">Effort</span>
        <span className="font-medium text-ink">{current.label}</span>
        <ChevronDown size={12} className={cn("text-dim transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[260px] animate-pop overflow-hidden rounded-xl border border-line bg-[#0e0e0e] panel-shadow">
          <p className="border-b border-line px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-dim">
            Level effort
          </p>
          {EFFORTS.map((item) => (
            <button
              key={item.value}
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-box2",
                item.value === value && "bg-box2",
              )}
            >
              <EffortBars level={item.value} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium text-ink">{item.label}</span>
                <span className="block text-[10.5px] text-dim">{item.hint}</span>
              </span>
              {item.value === value ? <Check size={13} className="text-ink" /> : null}
            </button>
          ))}
          <p className="border-t border-line px-3 py-2 text-[10px] leading-relaxed text-faint">
            Effort mengatur kedalaman analisis dan batas langkah tool.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ModelPicker({
  models,
  value,
  onChange,
  onRefresh,
  loading,
  disabled,
}: {
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = models.find((model) => model.id === value);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return models;
    return models.filter((model) =>
      `${model.name} ${model.id} ${model.vendor} ${(model.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(term),
    );
  }, [models, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const model of filtered) {
      const list = map.get(model.vendor) ?? [];
      list.push(model);
      map.set(model.vendor, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
    element?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const model = flat[highlight];
      if (model) {
        onChange(model.id);
        setOpen(false);
        setQuery("");
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const vendorBadge = (vendor: string) => vendor.slice(0, 1).toUpperCase();

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="btn-press inline-flex h-8 max-w-[220px] items-center gap-2 rounded-lg border border-line bg-surface px-1.5 pr-2 text-[11.5px] text-mute transition hover:border-lineStrong disabled:opacity-50 sm:max-w-[260px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Pilih model"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line bg-box2 font-mono text-[9.5px] font-semibold text-ink">
          {selected ? vendorBadge(selected.vendor) : "?"}
        </span>
        <span className="truncate font-medium text-ink">
          {selected?.name ?? value ?? "Pilih model"}
        </span>
        <span className="hidden shrink-0 rounded border border-line px-1 py-[1px] font-mono text-[9px] text-dim sm:inline">
          {selected?.context ?? "—"}
        </span>
        <ChevronDown size={12} className={cn("shrink-0 text-dim transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 flex max-h-[430px] w-[min(380px,calc(100vw-2rem))] animate-pop flex-col overflow-hidden rounded-xl border border-line bg-[#0c0c0c] panel-shadow">
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Cari model, vendor, atau kemampuan…"
                className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[12px] text-ink placeholder:text-[#565656] focus:bg-[#101010] focus:outline-none"
              />
            </div>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
            {grouped.length === 0 ? (
              <p className="px-3 py-8 text-center text-[12px] text-dim">Tidak ada model yang cocok.</p>
            ) : (
              grouped.map(([vendor, items]) => (
                <div key={vendor}>
                  <p className="sticky top-0 z-[1] bg-[#0c0c0c] px-3 pb-1 pt-2 text-[9.5px] uppercase tracking-[0.14em] text-faint">
                    {vendor}
                  </p>
                  {items.map((model) => {
                    const index = flat.indexOf(model);
                    return (
                      <button
                        key={model.id}
                        data-index={index}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => {
                          onChange(model.id);
                          setOpen(false);
                          setQuery("");
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                          index === highlight ? "bg-box2" : "hover:bg-box2",
                        )}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-box font-mono text-[10px] text-mute">
                          {vendorBadge(model.vendor)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[12.5px] text-ink">{model.name}</span>
                            {model.recommended ? <Sparkle size={10} className="shrink-0 text-mute" /> : null}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-dim">
                            <span className="font-mono">{model.id}</span>
                            <span className="text-faint">·</span>
                            <span>{model.context}</span>
                            {model.tags?.slice(0, 2).map((tag) => (
                              <span key={tag} className="rounded border border-line px-1 text-[8.5px] uppercase tracking-wide">
                                {tag}
                              </span>
                            ))}
                          </span>
                        </span>
                        {model.id === value ? <Check size={13} className="shrink-0 text-ink" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
            <span className="text-[10px] text-dim">
              {models.length} model · {models.some((m) => m.live) ? "live" : "offline"}
            </span>
            {onRefresh ? (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-dim transition-colors hover:bg-box2 hover:text-ink disabled:opacity-50"
              >
                {loading ? <Spinner size={11} /> : <Refresh size={11} />}
                Muat ulang
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function fmtModel(id: string) {
  return truncate(id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), 26);
}
