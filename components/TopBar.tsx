"use client";

import { Command, Database, Folder, Menu, Settings, Sparkle } from "./icons";
import { Spinner } from "./ui";
import { cn } from "@/lib/utils";

export type DockTab = "files" | "memory" | "studio";

const DOCK_TABS: Array<{ id: DockTab; label: string; icon: typeof Folder }> = [
  { id: "files", label: "Files", icon: Folder },
  { id: "memory", label: "Memory", icon: Database },
  { id: "studio", label: "Studio", icon: Sparkle },
];

export function TopBar({
  title,
  streaming,
  dock,
  onDock,
  onOpenMobile,
  onOpenPalette,
  onOpenSettings,
}: {
  title: string;
  streaming: boolean;
  dock: DockTab | null;
  onDock: (tab: DockTab | null) => void;
  onOpenMobile: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-black/70 px-2.5 backdrop-blur-md sm:px-4">
      <button
        onClick={onOpenMobile}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-mute transition hover:bg-box2 hover:text-ink md:hidden"
        aria-label="Buka menu"
      >
        <Menu size={17} />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden text-[9px] font-medium uppercase tracking-[0.2em] text-faint sm:inline">
          ONYX
        </span>
        <span className="hidden text-faint sm:inline">/</span>
        <p className="max-w-[42vw] truncate text-[12.5px] font-medium text-ink sm:max-w-[36vw]">
          {title}
        </p>
        {streaming ? (
          <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-line bg-box px-2 py-0.5 text-[9.5px] text-mute sm:flex">
            <Spinner size={9} />
            Bekerja
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
          {DOCK_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = dock === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onDock(active ? null : tab.id)}
                className={cn(
                  "btn-press flex h-7 items-center gap-1.5 rounded-md px-2 text-[10.5px] transition-colors",
                  active
                    ? "bg-ink text-black"
                    : "text-mute hover:bg-box2 hover:text-ink",
                )}
                aria-pressed={active}
                title={tab.label}
              >
                <Icon size={12.5} />
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <span className="mx-0.5 hidden h-4 w-px bg-line sm:block" />

        <button
          onClick={onOpenPalette}
          className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[10.5px] text-dim transition hover:border-lineStrong hover:text-ink sm:flex"
          title="Command palette (Ctrl+K)"
        >
          <Command size={12} />
          <span>Cari perintah</span>
          <span className="rounded border border-line px-1 font-mono text-[8.5px]">⌘K</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-mute transition hover:bg-box2 hover:text-ink"
          aria-label="Pengaturan"
          title="Pengaturan"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
}
