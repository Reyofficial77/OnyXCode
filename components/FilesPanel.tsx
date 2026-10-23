"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceEntry } from "@/lib/types";
import {
  Archive,
  ChevronLeft,
  Code,
  Download,
  FileCode,
  FileText,
  Film,
  Folder,
  FolderPlus,
  ImageIcon,
  Loader,
  Music,
  Plus,
  Refresh,
  Save,
  Search,
  Trash,
  Upload,
  X,
} from "./icons";
import { Button, Field, IconButton, Modal, Spinner, useToast } from "./ui";
import { cn, formatBytes } from "@/lib/utils";

interface FileData {
  path: string;
  binary: boolean;
  content?: string;
  truncated?: boolean;
  size: number;
  url?: string;
  mime?: string;
  kind?: string;
}

function kindFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v", "ogv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["js", "jsx", "ts", "tsx", "py", "go", "rs", "java", "css", "html", "json", "md", "sql", "sh", "ps1"].includes(ext)) return "code";
  return "file";
}

function EntryIcon({ name, isDir }: { name: string; isDir: boolean }) {
  if (isDir) return <Folder size={13} className="text-mute" />;
  const kind = kindFor(name);
  if (kind === "image") return <ImageIcon size={13} className="text-dim" />;
  if (kind === "video") return <Film size={13} className="text-dim" />;
  if (kind === "audio") return <Music size={13} className="text-dim" />;
  if (kind === "archive") return <Archive size={13} className="text-dim" />;
  if (kind === "code") return <FileCode size={13} className="text-dim" />;
  return <FileText size={13} className="text-dim" />;
}

export function FilesPanel({ version }: { version: number }) {
  const { push } = useToast();
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [root, setRoot] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<FileData | null>(null);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createType, setCreateType] = useState<"file" | "dir" | null>(null);
  const [createPath, setCreatePath] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/workspace/tree", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setEntries(data.entries ?? []);
        setRoot(data.root ?? "");
      }
    } catch {
      push("Gagal memuat workspace.", { tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    loadTree();
  }, [loadTree, version]);

  const openFile = useCallback(
    async (path: string) => {
      if (dirty && !window.confirm("Perubahan belum disimpan. Tinggalkan file ini?")) return;
      setSelected(path);
      setFile(null);
      setDraft("");
      setDirty(false);
      try {
        const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal membuka file.");
        setFile(data);
        setDraft(data.content ?? "");
      } catch (error) {
        push(error instanceof Error ? error.message : "Gagal membuka file.", { tone: "error" });
        setSelected(null);
      }
    },
    [dirty, push],
  );

  async function saveFile() {
    if (!selected || !file || file.binary || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/workspace/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected, content: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menyimpan.");
      setDirty(false);
      push(`${selected} tersimpan.`, { tone: "success" });
      await loadTree();
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal menyimpan.", { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function removeFile(path: string) {
    if (!window.confirm(`Hapus "${path}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menghapus.");
      if (selected === path) {
        setSelected(null);
        setFile(null);
        setDirty(false);
      }
      push("Dihapus.", { tone: "success" });
      await loadTree();
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal menghapus.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function createEntry() {
    const path = createPath.trim().replace(/^\/+/, "");
    if (!path) return;
    setBusy(true);
    try {
      const response =
        createType === "dir"
          ? await fetch("/api/workspace/mkdir", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path }),
            })
          : await fetch("/api/workspace/file", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path, content: "" }),
            });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal membuat.");
      setCreateType(null);
      setCreatePath("");
      await loadTree();
      if (createType === "file") await openFile(path);
      push(`${path} dibuat.`, { tone: "success" });
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal membuat.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append("files", file);
      const response = await fetch("/api/workspace/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload gagal.");
      push(`${data.files?.length ?? 0} file diunggah.`, { tone: "success" });
      await loadTree();
    } catch (error) {
      push(error instanceof Error ? error.message : "Upload gagal.", { tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) => entry.path.toLowerCase().includes(term));
  }, [entries, query]);

  const rawUrl = selected ? `/api/workspace/raw?path=${encodeURIComponent(selected)}` : "";
  const fileKind = file?.binary ? file.kind ?? kindFor(selected ?? "") : "text";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        {selected ? (
          <button
            onClick={() => {
              if (dirty && !window.confirm("Perubahan belum disimpan. Kembali?")) return;
              setSelected(null);
              setFile(null);
              setDirty(false);
            }}
            className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[10.5px] text-mute transition hover:bg-box2 hover:text-ink"
          >
            <ChevronLeft size={12} /> Semua file
          </button>
        ) : (
          <>
            <span className="px-1 text-[9px] uppercase tracking-[0.14em] text-faint">Workspace</span>
            <span className="ml-auto flex items-center">
              <IconButton label="Muat ulang" onClick={loadTree} disabled={loading}>
                <Refresh size={13} className={cn(loading && "spin")} />
              </IconButton>
              <IconButton
                label="File baru"
                onClick={() => {
                  setCreateType("file");
                  setCreatePath("");
                }}
              >
                <Plus size={14} />
              </IconButton>
              <IconButton
                label="Folder baru"
                onClick={() => {
                  setCreateType("dir");
                  setCreatePath("");
                }}
              >
                <FolderPlus size={14} />
              </IconButton>
              <IconButton
                label="Unggah file"
                onClick={() => uploadRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Spinner size={12} /> : <Upload size={13} />}
              </IconButton>
            </span>
          </>
        )}
      </div>

      {selected ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-line px-2.5 py-2">
            <EntryIcon name={selected} isDir={false} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[10.5px] text-ink">{selected}</p>
              <p className="text-[9px] text-dim">
                {file ? `${formatBytes(file.size)}${file.truncated ? " · dipotong" : ""}` : "memuat…"}
              </p>
            </div>
            <a
              href={`${rawUrl}&download=1`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-dim transition hover:bg-box2 hover:text-ink"
              aria-label="Unduh"
              title="Unduh"
            >
              <Download size={13} />
            </a>
            <button
              onClick={() => removeFile(selected)}
              disabled={busy}
              className="flex h-7 w-7 items-center justify-center rounded-md text-dim transition hover:bg-box2 hover:text-ink"
              aria-label="Hapus"
              title="Hapus"
            >
              <Trash size={13} />
            </button>
            {!file?.binary ? (
              <button
                onClick={saveFile}
                disabled={!dirty || saving}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2 text-[10.5px] font-medium transition",
                  dirty ? "bg-ink text-black hover:bg-white" : "bg-box2 text-dim",
                )}
              >
                {saving ? <Spinner size={11} className="border-[#666] border-t-black" /> : <Save size={12} />}
                Simpan
              </button>
            ) : null}
          </div>

          {!file ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner size={18} />
            </div>
          ) : file.binary ? (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#070707] p-3">
              {fileKind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rawUrl} alt={selected} className="max-h-full max-w-full rounded-lg border border-line object-contain" />
              ) : fileKind === "video" ? (
                <video src={rawUrl} controls className="max-h-full w-full rounded-lg border border-line" />
              ) : fileKind === "audio" ? (
                <audio src={rawUrl} controls className="w-full" />
              ) : file?.mime === "application/pdf" ? (
                <iframe src={rawUrl} title={selected} className="h-full min-h-[420px] w-full rounded-lg border border-line bg-white" />
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-box p-6 text-center">
                  <EntryIcon name={selected} isDir={false} />
                  <p className="max-w-[220px] break-all text-[11px] text-mute">{selected}</p>
                  <p className="text-[10px] text-dim">Pratinjau tidak tersedia untuk tipe ini.</p>
                  <a
                    href={`${rawUrl}&download=1`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-box2 px-3 text-[11px] text-ink transition hover:border-lineStrong"
                  >
                    <Download size={12} /> Unduh file
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setDirty(true);
                }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                    event.preventDefault();
                    saveFile();
                  }
                }}
                spellCheck={false}
                wrap="off"
                className="min-h-0 flex-1 resize-none bg-[#070707] p-3 font-mono text-[11px] leading-[1.65] text-[#e8e8e8] outline-none [tab-size:2]"
              />
              <div className="flex items-center justify-between border-t border-line px-2.5 py-1.5 text-[9px] text-faint">
                <span>
                  {draft.split(/\r?\n/).length} baris · {draft.length} char
                </span>
                <span className={cn(dirty ? "text-mute" : "text-faint")}>
                  {dirty ? "Belum disimpan · Ctrl+S" : "Tersimpan"}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari file…"
                className="h-8 w-full rounded-lg border border-line bg-surface pl-7 pr-2 text-[11px] text-ink placeholder:text-[#565656] focus:bg-[#101010] focus:outline-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size={18} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <Folder size={22} className="text-faint" />
                <p className="text-[11px] text-mute">
                  {entries.length ? "Tidak ada file yang cocok." : "Workspace masih kosong."}
                </p>
                <p className="text-[9.5px] leading-relaxed text-faint">
                  Minta ONYX membuat file, atau unggah sendiri.
                </p>
                <Button size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
                  <Upload size={12} /> Unggah file
                </Button>
              </div>
            ) : (
              filtered.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => !entry.type.startsWith("dir") && openFile(entry.path)}
                  className={cn(
                    "group flex w-full items-center gap-1.5 rounded-md py-[5px] pr-1.5 text-left transition-colors",
                    entry.type === "dir"
                      ? "cursor-default text-mute"
                      : "text-mute hover:bg-box2 hover:text-ink",
                  )}
                  style={{ paddingLeft: `${6 + (query ? 0 : entry.depth) * 11}px` }}
                  title={entry.path}
                >
                  <EntryIcon name={entry.name} isDir={entry.type === "dir"} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">{entry.name}</span>
                  {entry.type === "file" ? (
                    <>
                      <span className="shrink-0 text-[8.5px] text-faint group-hover:hidden">
                        {formatBytes(entry.size)}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeFile(entry.path);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.stopPropagation();
                            removeFile(entry.path);
                          }
                        }}
                        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-dim hover:bg-box3 hover:text-ink group-hover:flex"
                        aria-label={`Hapus ${entry.name}`}
                      >
                        <Trash size={10} />
                      </span>
                    </>
                  ) : null}
                </button>
              ))
            )}
          </div>

          <div className="border-t border-line px-2.5 py-2">
            <p className="truncate font-mono text-[8.5px] text-faint" title={root}>
              {root || "workspace"}
            </p>
            <p className="mt-0.5 text-[8.5px] text-faint">
              {entries.length} entri · klik file untuk membuka editor
            </p>
          </div>
        </>
      )}

      <input
        ref={uploadRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) uploadFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <Modal open={createType !== null} onClose={() => setCreateType(null)}>
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-dim">
                {createType === "dir" ? "Folder baru" : "File baru"}
              </p>
              <h3 className="mt-1 text-[16px] font-semibold text-ink">
                {createType === "dir" ? "Buat folder" : "Buat file"}
              </h3>
            </div>
            <IconButton label="Tutup" onClick={() => setCreateType(null)}>
              <X size={14} />
            </IconButton>
          </div>
          <Field label="Path relatif" hint="contoh: src/components/Button.tsx">
            <input
              autoFocus
              value={createPath}
              onChange={(event) => setCreatePath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createEntry();
              }}
              placeholder={createType === "dir" ? "src/components" : "src/index.ts"}
              className="input-base font-mono text-[12px]"
            />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateType(null)}>
              Batal
            </Button>
            <Button variant="primary" onClick={createEntry} disabled={!createPath.trim() || busy}>
              {busy ? <Loader size={13} className="spin" /> : <Plus size={13} />}
              Buat
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
