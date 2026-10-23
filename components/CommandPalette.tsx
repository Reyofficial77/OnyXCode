"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Command, Search } from "./icons";
import { Kbd } from "./ui";
import { cn } from "@/lib/utils";

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.group} ${command.hint ?? ""}`.toLowerCase().includes(term),
    );
  }, [commands, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteCommand[]>();
    for (const command of filtered) {
      const list = map.get(command.group) ?? [];
      list.push(command);
      map.set(command.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
    element?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  if (!open) return null;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = filtered[highlight];
      if (command) {
        onClose();
        command.run();
      }
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[10vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade bg-black/75 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative w-full max-w-[560px] animate-pop overflow-hidden rounded-2xl border border-line bg-[#0b0b0b] panel-shadow">
        <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
          <Search size={16} className="text-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cari perintah, sesi, atau panel…"
            className="h-6 flex-1 bg-transparent text-[13px] text-ink placeholder:text-[#5a5a5a] focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12px] text-dim">
              Tidak ada hasil untuk “{query}”.
            </p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-3.5 pb-1 pt-2 text-[9px] uppercase tracking-[0.16em] text-faint">
                  {group}
                </p>
                {items.map((command) => {
                  const index = filtered.indexOf(command);
                  return (
                    <button
                      key={command.id}
                      data-index={index}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => {
                        onClose();
                        command.run();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors",
                        index === highlight ? "bg-box2" : "hover:bg-box2/60",
                      )}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-surface text-mute">
                        {command.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                        {command.label}
                      </span>
                      {command.hint ? (
                        <span className="shrink-0 font-mono text-[9px] text-faint">{command.hint}</span>
                      ) : null}
                      {index === highlight ? (
                        <ChevronDown size={11} className="-rotate-90 shrink-0 text-dim" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-[9px] text-faint">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigasi
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> pilih
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Command size={10} /> ONYX
          </span>
        </div>
      </div>
    </div>
  );
}
