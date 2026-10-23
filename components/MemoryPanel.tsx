"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemoryFile } from "@/lib/types";
import { Check, Database, Refresh, Save } from "./icons";
import { IconButton, Spinner, useToast } from "./ui";
import { cn, timeAgo } from "@/lib/utils";

const TABS: Array<{ name: MemoryFile["name"]; hint: string }> = [
  { name: "MEMORY.md", hint: "Fakta & pelajaran" },
  { name: "SOUL.md", hint: "Nilai & nada" },
  { name: "IDENTITY.md", hint: "Peran agent" },
  { name: "SKILL.md", hint: "Prosedur" },
];

export function MemoryPanel() {
  const { push } = useToast();
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [active, setActive] = useState<MemoryFile["name"]>("MEMORY.md");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/memory", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal memuat memory.");
      const list = (data.files ?? []) as MemoryFile[];
      setFiles(list);
      const current = list.find((file) => file.name === active);
      if (current) {
        setDraft(current.content);
        setDirty(false);
      }
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal memuat memory.", { tone: "error" });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(name: MemoryFile["name"]) {
    if (name === active) return;
    if (dirty && !window.confirm("Perubahan belum disimpan. Ganti file?")) return;
    setActive(name);
    setDraft(files.find((file) => file.name === name)?.content ?? "");
    setDirty(false);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: active, content: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menyimpan.");
      setFiles(data.files ?? files);
      setDirty(false);
      push(`${active} tersimpan. Dibaca otomatis di percakapan berikutnya.`, { tone: "success" });
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal menyimpan.", { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const activeFile = files.find((file) => file.name === active);
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <span className="flex items-center gap-1.5 px-1 text-[9px] uppercase tracking-[0.14em] text-faint">
          <Database size={11} /> Memory
        </span>
        <span className="ml-auto flex items-center">
          <IconButton label="Muat ulang" onClick={load} disabled={loading}>
            <Refresh size={13} className={cn(loading && "spin")} />
          </IconButton>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={cn(
              "ml-1 flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10.5px] font-medium transition",
              dirty ? "bg-ink text-black hover:bg-white" : "bg-box2 text-dim",
            )}
          >
            {saving ? <Spinner size={11} className="border-[#666] border-t-black" /> : <Save size={12} />}
            Simpan
          </button>
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5 no-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.name}
            onClick={() => select(tab.name)}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 font-mono text-[9.5px] transition-colors",
              active === tab.name
                ? "bg-box2 text-ink"
                : "text-dim hover:bg-box2/60 hover:text-ink",
            )}
            title={tab.hint}
          >
            {tab.name.replace(".md", "")}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10.5px] text-ink">{active}</p>
          <p className="text-[9px] text-dim">{TABS.find((tab) => tab.name === active)?.hint}</p>
        </div>
        <span className="shrink-0 text-[8.5px] text-faint">
          {activeFile?.updatedAt ? timeAgo(activeFile.updatedAt) : "—"}
        </span>
      </div>

      <div className="border-b border-line bg-[#0a0a0a] px-3 py-2">
        <p className="text-[9.5px] leading-relaxed text-dim">
          File ini otomatis disuntikkan ke system prompt setiap percakapan. Jaga tetap ringkas —
          fakta stabil saja.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={18} />
        </div>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setDirty(true);
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                save();
              }
            }}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-[#070707] p-3 font-mono text-[11px] leading-[1.7] text-[#e8e8e8] outline-none"
          />
          <div className="flex items-center justify-between border-t border-line px-2.5 py-1.5 text-[9px] text-faint">
            <span>
              {words} kata · {draft.length} char
            </span>
            <span className={cn("flex items-center gap-1", dirty ? "text-mute" : "text-faint")}>
              {!dirty ? <Check size={10} /> : null}
              {dirty ? "Belum disimpan · Ctrl+S" : "Tersimpan"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
