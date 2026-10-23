"use client";

import { useEffect, useState } from "react";
import type { Effort, ModelInfo } from "@/lib/types";
import {
  Alert,
  Check,
  Copy,
  Database,
  Download,
  Folder,
  Key,
  Lock,
  LogOut,
  Palette,
  Refresh,
  Shield,
  Sparkle,
  Trash,
  User,
  X,
} from "./icons";
import { Button, Field, Modal, Segmented, Spinner, useToast } from "./ui";
import { EffortBars } from "./Pickers";
import { cn, formatBytes } from "@/lib/utils";

interface SettingsStatus {
  apiConfigured: boolean;
  baseUrl: string;
  keyHint: string;
  username: string;
  workspace: { root: string; writable: boolean };
  sessionCount: number;
  node: string;
  version: string;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[11px] text-dim">{label}</span>
      <span className="min-w-0 text-right text-[11px] text-mute">{children}</span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative flex h-5 w-9 items-center rounded-full border transition-colors",
        checked ? "border-ink bg-ink" : "border-lineStrong bg-box",
      )}
    >
      <span
        className={cn(
          "absolute h-3 w-3 rounded-full transition-transform",
          checked ? "translate-x-[18px] bg-black" : "translate-x-[3px] bg-mute",
        )}
      />
    </button>
  );
}

export function SettingsDialog({
  open,
  onClose,
  username,
  models,
  model,
  effort,
  onModelChange,
  onEffortChange,
  onLogout,
  onOpenFiles,
  onSessionsCleared,
  onRefreshModels,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
  models: ModelInfo[];
  model: string;
  effort: Effort;
  onModelChange: (id: string) => void;
  onEffortChange: (effort: Effort) => void;
  onLogout: () => void;
  onOpenFiles: () => void;
  onSessionsCleared: () => void;
  onRefreshModels: () => void;
}) {
  const { push } = useToast();
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [changing, setChanging] = useState(false);
  const [motion, setMotion] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/settings", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (response.ok) setStatus(data);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    const stored = window.localStorage.getItem("onyx.motion");
    setMotion(stored !== "off");
    setTestResult(null);
  }, [open]);

  function toggleMotion(value: boolean) {
    setMotion(value);
    window.localStorage.setItem("onyx.motion", value ? "on" : "off");
    document.documentElement.dataset.motion = value ? "on" : "off";
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await response.json();
      setTestResult(
        response.ok
          ? { ok: Boolean(data.ok), message: data.message || "Selesai." }
          : { ok: false, message: data.error || "Gagal menguji koneksi." },
      );
      if (response.ok && data.ok) {
        onRefreshModels();
        push("Koneksi Classai berhasil.", { tone: "success" });
      }
    } catch {
      setTestResult({ ok: false, message: "Tidak dapat menghubungi server." });
    } finally {
      setTesting(false);
    }
  }

  async function changePassword() {
    if (next !== confirm) {
      push("Konfirmasi password tidak cocok.", { tone: "error" });
      return;
    }
    if (next.length < 8) {
      push("Password baru minimal 8 karakter.", { tone: "error" });
      return;
    }
    setChanging(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal mengganti password.");
      push("Password diganti. Silakan masuk ulang.", { tone: "success" });
      window.setTimeout(() => onLogout(), 900);
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal mengganti password.", { tone: "error" });
    } finally {
      setChanging(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("Hapus SEMUA percakapan? Tindakan ini tidak bisa dibatalkan.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/sessions", { method: "DELETE" });
      if (!response.ok) throw new Error("Gagal menghapus sesi.");
      onSessionsCleared();
      push("Semua percakapan dihapus.", { tone: "success" });
      setStatus((value) => (value ? { ...value, sessionCount: 0 } : value));
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal menghapus.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const envSnippet = `CLASSAI_API_KEY=sk_live_...\nCLASSAI_BASE_URL=https://router.classai.id/v1`;

  return (
    <Modal open={open} onClose={onClose} wide labelledBy="settings-title">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div>
          <p className="text-[9.5px] uppercase tracking-[0.16em] text-dim">Workspace</p>
          <h2 id="settings-title" className="mt-0.5 text-[16px] font-semibold text-ink">
            Pengaturan
          </h2>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-dim transition hover:bg-box2 hover:text-ink"
          aria-label="Tutup"
        >
          <X size={16} />
        </button>
      </div>

      <div className="max-h-[calc(100vh-160px)] overflow-y-auto">
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {/* Koneksi */}
          <section className="sm:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <Key size={13} className="text-mute" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">Koneksi</h3>
            </div>
            <div className="rounded-xl border border-line bg-[#0d0d0d] p-3.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    status?.apiConfigured ? "bg-ink animate-pulse-soft" : "border border-dim",
                  )}
                />
                <p className="text-[11.5px] text-ink">
                  {loading ? "Memeriksa…" : status?.apiConfigured ? "Classai Router terhubung" : "API key belum diisi"}
                </p>
                <span className="ml-auto rounded border border-line px-1.5 py-[1px] font-mono text-[8.5px] text-dim">
                  {status?.baseUrl ?? "router.classai.id/v1"}
                </span>
              </div>

              <div className="mt-2 border-t border-line pt-2">
                <Row label="Key">{status?.keyHint || "—"}</Row>
                <Row label="Model aktif">{models.length || "—"}</Row>
              </div>

              <div className="mt-2.5 flex gap-2">
                <Button size="sm" variant="secondary" onClick={testConnection} disabled={testing}>
                  {testing ? <Spinner size={11} /> : <Refresh size={12} />}
                  Uji koneksi
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(envSnippet).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  Salin template .env
                </Button>
              </div>

              {testResult ? (
                <p
                  className={cn(
                    "mt-2 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[10px] leading-relaxed",
                    testResult.ok
                      ? "border-line bg-box text-mute"
                      : "border-dashed border-lineStrong bg-[#101010] text-mute",
                  )}
                >
                  {testResult.ok ? <Check size={11} className="mt-[2px] shrink-0" /> : <Alert size={11} className="mt-[2px] shrink-0" />}
                  {testResult.message}
                </p>
              ) : null}

              <p className="mt-2.5 text-[9.5px] leading-relaxed text-faint">
                Key hanya dibaca di server. Tempel di <span className="font-mono text-dim">.env</span>{" "}
                lalu restart <span className="font-mono text-dim">npm run dev</span>.
              </p>
            </div>
          </section>

          {/* Defaults */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Sparkle size={13} className="text-mute" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">Default</h3>
            </div>
            <div className="space-y-2.5 rounded-xl border border-line bg-[#0d0d0d] p-3.5">
              <Field label="Model default">
                <select
                  value={model}
                  onChange={(event) => onModelChange(event.target.value)}
                  className="h-8 w-full rounded-md border border-line bg-surface px-2 font-mono text-[10.5px] text-ink focus:bg-[#101010] focus:outline-none"
                >
                  {models.map((item) => (
                    <option key={item.id} value={item.id} className="bg-[#111]">
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <p className="mb-1.5 flex items-center gap-2 text-[10.5px] text-mute">
                  <EffortBars level={effort} /> Effort default
                </p>
                <Segmented
                  value={effort}
                  onChange={(value) => onEffortChange(value)}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Med" },
                    { value: "high", label: "High" },
                    { value: "ultra", label: "Ultra" },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* Tampilan */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Palette size={13} className="text-mute" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">Tampilan</h3>
            </div>
            <div className="space-y-2.5 rounded-xl border border-line bg-[#0d0d0d] p-3.5">
              <Row label="Tema">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 rounded-full border border-line bg-black" />
                  <span className="h-3.5 w-3.5 rounded-full border border-line bg-[#141414]" />
                  <span className="h-3.5 w-3.5 rounded-full border border-[#555] bg-white" />
                  <span className="ml-1">Monokrom</span>
                </span>
              </Row>
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-[11px] text-dim">Animasi halus</span>
                <Toggle checked={motion} onChange={toggleMotion} label="Animasi halus" />
              </div>
              <p className="text-[9px] leading-relaxed text-faint">
                Palet dikunci hitam–abu–putih. Tidak ada warna lain yang dimuat.
              </p>
            </div>
          </section>

          {/* Workspace */}
          <section className="sm:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <Folder size={13} className="text-mute" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">Workspace</h3>
            </div>
            <div className="rounded-xl border border-line bg-[#0d0d0d] p-3.5">
              <p className="break-all font-mono text-[10px] text-mute">{status?.workspace.root ?? "—"}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[9.5px] text-dim">
                <span className="flex items-center gap-1">
                  <Check size={10} /> {status?.workspace.writable ? "Dapat ditulis" : "Tidak dapat ditulis"}
                </span>
                <span className="flex items-center gap-1">
                  <Database size={10} /> {status?.sessionCount ?? 0} percakapan
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={onOpenFiles}>
                  <Folder size={12} /> Buka file manager
                </Button>
                <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
                  <Refresh size={12} /> Muat ulang aplikasi
                </Button>
              </div>
            </div>
          </section>

          {/* Keamanan */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Shield size={13} className="text-mute" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">Keamanan</h3>
            </div>
            <div className="space-y-2.5 rounded-xl border border-line bg-[#0d0d0d] p-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] text-mute">
                  <User size={12} /> {username}
                </span>
                <span className="rounded border border-line px-1.5 py-[1px] text-[8.5px] uppercase tracking-wide text-dim">
                  owner
                </span>
              </div>
              <div className="border-t border-line pt-2.5">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] text-dim">
                  <Lock size={11} /> Ganti password
                </p>
                <div className="space-y-1.5">
                  <input
                    type="password"
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                    placeholder="Password lama"
                    autoComplete="current-password"
                    className="input-base h-8 text-[11px]"
                  />
                  <input
                    type="password"
                    value={next}
                    onChange={(event) => setNext(event.target.value)}
                    placeholder="Password baru (min. 8)"
                    autoComplete="new-password"
                    className="input-base h-8 text-[11px]"
                  />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Ulangi password baru"
                    autoComplete="new-password"
                    className="input-base h-8 text-[11px]"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={changePassword}
                    disabled={changing || !current || !next}
                  >
                    {changing ? <Spinner size={11} /> : <Lock size={11} />}
                    Simpan password
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Data */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Database size={13} className="text-mute" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">Data</h3>
            </div>
            <div className="space-y-2 rounded-xl border border-line bg-[#0d0d0d] p-3.5">
              <Button
                size="sm"
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  window.location.href = "/api/export";
                }}
              >
                <Download size={12} /> Ekspor semua percakapan
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start border-dashed"
                onClick={clearAll}
                disabled={busy}
              >
                <Trash size={12} /> Hapus semua percakapan
              </Button>
              <p className="text-[9px] leading-relaxed text-faint">
                Percakapan disimpan lokal di <span className="font-mono">.data/</span>. Tidak dikirim
                ke mana pun selain model yang kamu pilih.
              </p>
            </div>
          </section>

          {/* Tentang */}
          <section className="sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-[#0a0a0a] px-3.5 py-3">
              <div>
                <p className="text-[11px] font-medium text-ink">ONYX v{status?.version ?? "1.0.0"}</p>
                <p className="text-[9px] text-dim">
                  Next.js · React · Tailwind · Classai Router · Node {status?.node ?? ""}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={onLogout}>
                <LogOut size={12} /> Keluar
              </Button>
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}
