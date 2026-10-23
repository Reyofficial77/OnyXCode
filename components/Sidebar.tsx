"use client";

import { useMemo, useState } from "react";
import type { SessionSummary } from "@/lib/types";
import {
  ChevronLeft,
  ChevronRight,
  Command,
  LogOut,
  Logo,
  Pencil,
  Plus,
  Search,
  Settings,
  Shield,
  Trash,
  X,
} from "./icons";
import { cn, dayGroup, timeAgo, truncate } from "@/lib/utils";

const GROUP_ORDER = ["Hari ini", "Kemarin", "7 hari terakhir", "30 hari terakhir", "Lebih lama"];

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  username,
  apiKeyOk,
  onSettings,
  onLogout,
  onOpenPalette,
}: {
  sessions: SessionSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  username: string;
  apiKeyOk: boolean;
  onSettings: () => void;
  onLogout: () => void;
  onOpenPalette: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter((session) =>
      `${session.title} ${session.model}`.toLowerCase().includes(term),
    );
  }, [sessions, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SessionSummary[]>();
    for (const session of filtered) {
      const group = dayGroup(session.updatedAt);
      const list = map.get(group) ?? [];
      list.push(session);
      map.set(group, list);
    }
    return GROUP_ORDER.filter((group) => map.has(group)).map((group) => ({
      group,
      items: map.get(group) ?? [],
    }));
  }, [filtered]);

  function commitRename(id: string) {
    const value = editValue.trim();
    setEditingId(null);
    if (value) onRename(id, value);
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "z-50 flex h-full shrink-0 flex-col border-r border-line bg-[#050505] transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "w-[64px]" : "w-[272px]",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-[284px]",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )}
      >
        {collapsed ? (
          <div className="flex h-full flex-col items-center gap-2 py-3">
            <button
              onClick={onToggleCollapse}
              className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink transition hover:bg-box2"
              aria-label="Perluas sidebar"
              title="Perluas sidebar"
            >
              <Logo size={22} />
            </button>
            <button
              onClick={onNew}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-black transition hover:bg-white"
              aria-label="Percakapan baru"
              title="Percakapan baru"
            >
              <Plus size={17} />
            </button>
            <button
              onClick={onToggleCollapse}
              className="flex h-8 w-9 items-center justify-center rounded-lg text-dim transition hover:bg-box2 hover:text-ink"
              aria-label="Perluas sidebar"
              title="Perluas sidebar"
            >
              <ChevronRight size={14} />
            </button>
            <div className="mt-2 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto no-scrollbar">
              {sessions.slice(0, 18).map((session) => (
                <button
                  key={session.id}
                  onClick={() => onSelect(session.id)}
                  title={session.title}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[10.5px] font-medium transition",
                    session.id === activeId
                      ? "border-lineStrong bg-box2 text-ink"
                      : "border-transparent text-dim hover:bg-box2 hover:text-ink",
                  )}
                >
                  {session.title.slice(0, 1).toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex flex-col items-center gap-1 border-t border-line pt-2">
              <button
                onClick={onSettings}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-mute transition hover:bg-box2 hover:text-ink"
                aria-label="Pengaturan"
                title="Pengaturan"
              >
                <Settings size={15} />
              </button>
              <button
                onClick={onLogout}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-dim transition hover:bg-box2 hover:text-ink"
                aria-label="Keluar"
                title="Keluar"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3.5 pb-2 pt-4">
              <button onClick={onNew} className="flex items-center gap-2.5 text-left" aria-label="ONYX">
                <Logo size={27} className="text-ink" />
                <span>
                  <span className="block text-[13px] font-semibold tracking-[0.2em] text-ink">ONYX</span>
                  <span className="block text-[8.5px] uppercase tracking-[0.16em] text-dim">
                    Coding agent
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={onCloseMobile}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-dim hover:bg-box2 hover:text-ink md:hidden"
                  aria-label="Tutup menu"
                >
                  <X size={14} />
                </button>
                <button
                  onClick={onToggleCollapse}
                  className="hidden h-7 w-7 items-center justify-center rounded-md text-dim transition hover:bg-box2 hover:text-ink md:flex"
                  aria-label="Ciutkan sidebar"
                  title="Ciutkan sidebar"
                >
                  <ChevronLeft size={14} />
                </button>
              </div>
            </div>

            <div className="px-3 pt-2">
              <button
                onClick={onNew}
                className="btn-press flex h-9 w-full items-center gap-2 rounded-lg bg-ink px-3 text-[12.5px] font-medium text-black transition hover:bg-white"
              >
                <Plus size={15} />
                Percakapan baru
                <span className="ml-auto rounded border border-black/15 px-1.5 py-[1px] font-mono text-[9px] text-black/55">
                  ⌘K
                </span>
              </button>
            </div>

            <div className="px-3 pt-2.5">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
                <input
                  id="session-search"
                  name="session-search"
                  aria-label="Cari percakapan"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari percakapan…"
                  className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[11.5px] text-ink placeholder:text-[#565656] transition-colors focus:bg-[#101010] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {grouped.length === 0 ? (
                <p className="px-2 py-8 text-center text-[11px] text-dim">
                  {sessions.length ? "Tidak ada hasil." : "Belum ada percakapan."}
                </p>
              ) : (
                grouped.map(({ group, items }) => (
                  <div key={group} className="mb-2">
                    <p className="px-2 pb-1 pt-2 text-[8.5px] font-medium uppercase tracking-[0.16em] text-faint">
                      {group}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((session) => (
                        <div key={session.id} className="group/session relative">
                          {editingId === session.id ? (
                            <div className="flex items-center gap-1 rounded-lg border border-lineStrong bg-box px-1.5 py-1">
                              <input
                                autoFocus
                                value={editValue}
                                onChange={(event) => setEditValue(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") commitRename(session.id);
                                  if (event.key === "Escape") setEditingId(null);
                                }}
                                onBlur={() => commitRename(session.id)}
                                className="h-6 min-w-0 flex-1 bg-transparent px-1 text-[11.5px] text-ink focus:outline-none"
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => onSelect(session.id)}
                              className={cn(
                                "relative flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                                session.id === activeId
                                  ? "bg-box2 text-ink"
                                  : "text-mute hover:bg-[#101010] hover:text-ink",
                              )}
                            >
                              <span
                                className={cn(
                                  "mt-[5px] h-1 w-1 shrink-0 rounded-full",
                                  session.id === activeId ? "bg-ink" : "bg-[#4a4a4a]",
                                )}
                              />
                              <span className="min-w-0 flex-1 pr-8">
                                <span className="block truncate text-[11.5px] leading-snug">
                                  {session.title}
                                </span>
                                <span className="mt-0.5 block truncate text-[9px] text-faint">
                                  {truncate(session.model, 20)} · {timeAgo(session.updatedAt)}
                                </span>
                              </span>
                            </button>
                          )}

                          {editingId !== session.id ? (
                            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/session:opacity-100 focus-within:opacity-100">
                              <button
                                onClick={() => {
                                  setEditingId(session.id);
                                  setEditValue(session.title);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded text-dim transition hover:bg-box3 hover:text-ink"
                                aria-label="Ganti nama"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Hapus percakapan "${session.title}"?`)) {
                                    onDelete(session.id);
                                  }
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded text-dim transition hover:bg-box3 hover:text-ink"
                                aria-label="Hapus"
                              >
                                <Trash size={11} />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-line px-3 py-2.5">
              <button
                onClick={onSettings}
                className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-box2"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                    apiKeyOk ? "border-line bg-box text-ink" : "border-dashed border-lineStrong bg-surface text-dim",
                  )}
                >
                  <Shield size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        apiKeyOk ? "bg-ink animate-pulse-soft" : "border border-dim bg-transparent",
                      )}
                    />
                    <span className="truncate text-[10.5px] text-mute">
                      {apiKeyOk ? "Classai terhubung" : "API key belum diisi"}
                    </span>
                  </span>
                  <span className="block truncate pl-3 text-[8.5px] text-faint">
                    router.classai.id
                  </span>
                </span>
                <Settings size={13} className="shrink-0 text-dim" />
              </button>

              <div className="mt-1.5 flex items-center gap-1 border-t border-line pt-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-box text-[10px] font-semibold text-ink">
                  {username.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10.5px] text-mute">{username}</span>
                  <span className="block text-[8.5px] uppercase tracking-[0.12em] text-faint">
                    Owner
                  </span>
                </span>
                <button
                  onClick={onOpenPalette}
                  className="flex h-6 w-6 items-center justify-center rounded text-dim transition hover:bg-box2 hover:text-ink"
                  aria-label="Command palette"
                  title="Command palette (Ctrl+K)"
                >
                  <Command size={12} />
                </button>
                <button
                  onClick={onLogout}
                  className="flex h-6 w-6 items-center justify-center rounded text-dim transition hover:bg-box2 hover:text-ink"
                  aria-label="Keluar"
                  title="Keluar"
                >
                  <LogOut size={12} />
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
