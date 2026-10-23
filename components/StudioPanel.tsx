"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttachmentMeta, MediaItem, MediaModel } from "@/lib/types";
import {
  Alert,
  Download,
  Film,
  ImageIcon,
  Loader,
  Paperclip,
  Play,
  Refresh,
  Sparkle,
  Trash,
  Video,
  X,
} from "./icons";
import { Button, Spinner, useToast } from "./ui";
import { cn, truncate } from "@/lib/utils";

const IMAGE_ASPECTS = ["1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "4:3", "3:2"];
const QUALITIES = ["low", "medium", "high"];

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1 font-mono text-[9.5px] transition-colors",
        active
          ? "border-lineStrong bg-box2 text-ink"
          : "border-line bg-transparent text-dim hover:border-lineStrong hover:text-mute",
      )}
    >
      {children}
    </button>
  );
}

export function StudioPanel({ onAttach }: { onAttach: (attachment: AttachmentMeta) => void }) {
  const { push } = useToast();
  const [mode, setMode] = useState<"image" | "video">("image");
  const [models, setModels] = useState<{ image: MediaModel[]; video: MediaModel[] }>({
    image: [],
    video: [],
  });
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [imageModel, setImageModel] = useState("nano-banana-2");
  const [videoModel, setVideoModel] = useState("veo-3.1-fast");
  const [aspect, setAspect] = useState("1:1");
  const [resolution, setResolution] = useState("1K");
  const [seconds, setSeconds] = useState(8);
  const [quality, setQuality] = useState("medium");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MediaItem | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [attaching, setAttaching] = useState(false);
  const pollRef = useRef<number | null>(null);
  const pollCount = useRef(0);
  const timerRef = useRef<number | null>(null);

  const currentModels = mode === "image" ? models.image : models.video;
  const modelId = mode === "image" ? imageModel : videoModel;
  const currentModel = useMemo(
    () => currentModels.find((model) => model.id === modelId),
    [currentModels, modelId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/media/library", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal memuat studio.");
      setModels(data.models ?? { image: [], video: [] });
      const list = (data.items ?? []) as MediaItem[];
      setItems(list);
      const pendingVideo = list.find(
        (item) => item.type === "video" && item.status === "in_progress",
      );
      if (pendingVideo && !pollRef.current) {
        setResult(pendingVideo);
        setBusy(true);
        startPolling(pendingVideo);
      }
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal memuat studio.", { tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sesuaikan pilihan saat model berganti
  useEffect(() => {
    if (!currentModel) return;
    if (!currentModel.aspect.includes(aspect)) setAspect(currentModel.aspect[0] ?? "1:1");
    if (!currentModel.resolutions.includes(resolution)) {
      setResolution(currentModel.resolutions[0] ?? (mode === "image" ? "1K" : "720p"));
    }
    if (mode === "video" && currentModel.seconds && !currentModel.seconds.includes(seconds)) {
      setSeconds(currentModel.seconds[0] ?? 8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, mode]);

  // Timer selama proses
  useEffect(() => {
    if (!busy) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [busy]);

  async function generateImage() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/media/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: imageModel,
          aspect,
          resolution,
          quality: currentModel?.quality ? quality : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal membuat gambar.");
      setResult(data.item);
      push("Gambar selesai.", { tone: "success" });
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Gagal membuat gambar.");
    } finally {
      setBusy(false);
    }
  }

  async function generateVideo() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/media/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: videoModel, aspect, resolution, seconds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal memulai video.");
      setResult(data.item);
      startPolling(data.item);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Gagal memulai video.");
      setBusy(false);
    }
  }

  function startPolling(item: MediaItem) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollCount.current = 0;
    pollRef.current = window.setInterval(async () => {
      if (pollCount.current >= 90) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy(false);
        setError("Video masih diproses di server. Buka panel ini lagi nanti untuk melanjutkan pemeriksaan.");
        return;
      }
      pollCount.current += 1;
      try {
        const response = await fetch(`/api/media/video?id=${encodeURIComponent(item.id)}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memeriksa video.");
        const updated = data.item as MediaItem;
        setResult(updated);
        if (updated.status !== "in_progress") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
          if (updated.status === "done") push("Video selesai.", { tone: "success" });
          else setError(updated.error || "Video gagal dibuat.");
          load();
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : "Gagal memeriksa video.");
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy(false);
      }
    }, 8000);
  }

  async function attachImage(item: MediaItem) {
    setAttaching(true);
    try {
      const blob = await fetch(`/api/generated/${item.id}`).then((response) => response.blob());
      const file = new File([blob], `onyx-${item.id}.png`, { type: blob.type || "image/png" });
      const form = new FormData();
      form.append("files", file);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal melampirkan.");
      const attachment = data.attachments?.[0] as AttachmentMeta;
      if (attachment) {
        onAttach(attachment);
        push("Gambar dilampirkan ke pesan berikutnya.", { tone: "success" });
      }
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal melampirkan.", { tone: "error" });
    } finally {
      setAttaching(false);
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm("Hapus aset ini dari library?")) return;
    try {
      const response = await fetch(`/api/media/library?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Gagal menghapus.");
      setItems((current) => current.filter((item) => item.id !== id));
      if (result?.id === id) setResult(null);
    } catch (error) {
      push(error instanceof Error ? error.message : "Gagal menghapus.", { tone: "error" });
    }
  }

  const videoSrc = result
    ? result.remoteUrl || `/api/generated/${result.id}`
    : "";
  const canGenerate = prompt.trim().length > 0 && !busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <div className="flex rounded-md border border-line bg-surface p-0.5">
          <button
            onClick={() => {
              setMode("image");
              setAspect("1:1");
              setResolution("1K");
            }}
            className={cn(
              "flex h-6 items-center gap-1 rounded px-2 text-[9.5px] transition",
              mode === "image" ? "bg-ink text-black" : "text-dim hover:text-ink",
            )}
          >
            <ImageIcon size={10} /> Gambar
          </button>
          <button
            onClick={() => {
              setMode("video");
              setAspect("16:9");
              setResolution("720p");
            }}
            className={cn(
              "flex h-6 items-center gap-1 rounded px-2 text-[9.5px] transition",
              mode === "video" ? "bg-ink text-black" : "text-dim hover:text-ink",
            )}
          >
            <Video size={10} /> Video
          </button>
        </div>
        <span className="ml-auto flex items-center">
          <button
            onClick={load}
            disabled={loading}
            className="flex h-7 w-7 items-center justify-center rounded-md text-dim hover:bg-box2 hover:text-ink"
            aria-label="Muat ulang"
          >
            <Refresh size={12} className={cn(loading && "spin")} />
          </button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-2.5 border-b border-line p-3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder={
              mode === "image"
                ? "Deskripsikan gambar… cahaya, komposisi, gaya, suasana."
                : "Deskripsikan adegan video… gerakan kamera, aksi, suara."
            }
            className="w-full resize-none rounded-lg border border-line bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-ink placeholder:text-[#565656] focus:bg-[#101010] focus:outline-none"
          />

          <label className="block">
            <span className="mb-1 block text-[8.5px] uppercase tracking-[0.14em] text-faint">Model</span>
            <select
              value={modelId}
              onChange={(event) =>
                mode === "image" ? setImageModel(event.target.value) : setVideoModel(event.target.value)
              }
              disabled={busy}
              className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[10.5px] text-ink focus:bg-[#101010] focus:outline-none"
            >
              {currentModels.map((model) => (
                <option key={model.id} value={model.id} className="bg-[#111]">
                  {model.name} — {model.vendor}
                </option>
              ))}
            </select>
            {currentModel ? (
              <span className="mt-1 block text-[8.5px] text-dim">{currentModel.note}</span>
            ) : null}
          </label>

          <div>
            <span className="mb-1 block text-[8.5px] uppercase tracking-[0.14em] text-faint">
              Rasio
            </span>
            <div className="flex flex-wrap gap-1">
              {(currentModel?.aspect ?? IMAGE_ASPECTS).map((value) => (
                <Chip key={value} active={aspect === value} onClick={() => setAspect(value)}>
                  {value}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[8.5px] uppercase tracking-[0.14em] text-faint">
              Resolusi
            </span>
            <div className="flex flex-wrap gap-1">
              {(currentModel?.resolutions ?? ["1K"]).map((value) => (
                <Chip key={value} active={resolution === value} onClick={() => setResolution(value)}>
                  {value}
                </Chip>
              ))}
            </div>
          </div>

          {mode === "video" && currentModel?.seconds ? (
            <div>
              <span className="mb-1 block text-[8.5px] uppercase tracking-[0.14em] text-faint">
                Durasi
              </span>
              <div className="flex flex-wrap gap-1">
                {currentModel.seconds.map((value) => (
                  <Chip key={value} active={seconds === value} onClick={() => setSeconds(value)}>
                    {value}s
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "image" && currentModel?.quality ? (
            <div>
              <span className="mb-1 block text-[8.5px] uppercase tracking-[0.14em] text-faint">
                Kualitas
              </span>
              <div className="flex flex-wrap gap-1">
                {QUALITIES.map((value) => (
                  <Chip key={value} active={quality === value} onClick={() => setQuality(value)}>
                    {value}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          <button
            onClick={mode === "image" ? generateImage : generateVideo}
            disabled={!canGenerate}
            className={cn(
              "btn-press flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[11.5px] font-medium transition",
              canGenerate ? "bg-ink text-black hover:bg-white" : "bg-[#242424] text-[#6a6a6a]",
            )}
          >
            {busy ? <Spinner size={13} className="border-[#666] border-t-black" /> : <Sparkle size={13} />}
            {busy
              ? `Memproses… ${elapsed}s`
              : mode === "image"
                ? "Buat gambar"
                : "Buat video"}
          </button>

          <p className="flex items-start gap-1.5 text-[8.5px] leading-relaxed text-faint">
            <Alert size={10} className="mt-[2px] shrink-0" />
            Setiap generate memakai kredit Classai. Video bisa butuh 1–10 menit.
          </p>

          {error ? (
            <div className="flex items-start gap-1.5 rounded-md border border-[#3a3a3a] bg-[#141414] px-2 py-1.5 text-[10px] leading-relaxed text-mute">
              <X size={11} className="mt-[2px] shrink-0" />
              {error}
            </div>
          ) : null}
        </div>

        {result ? (
          <div className="border-b border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[8.5px] uppercase tracking-[0.14em] text-faint">
                {result.type === "image" ? "Hasil gambar" : "Hasil video"}
              </p>
              <span className="rounded border border-line px-1.5 py-[1px] font-mono text-[8px] text-dim">
                {result.model}
              </span>
            </div>

            {result.status === "in_progress" ? (
              <div className="rounded-lg border border-line bg-[#0d0d0d] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Spinner size={12} />
                  <p className="text-[10.5px] text-mute">Video sedang dibuat di server…</p>
                </div>
                <div className="progress-track h-1 overflow-hidden rounded-full bg-[#242424]" />
                <p className="mt-2 font-mono text-[9px] text-faint">
                  {result.jobId ? `job ${result.jobId.slice(0, 12)}` : "menunggu"} · {elapsed}s
                </p>
              </div>
            ) : result.status === "failed" ? (
              <div className="rounded-lg border border-dashed border-lineStrong bg-[#101010] p-3 text-[10.5px] text-mute">
                {result.error || "Video gagal dibuat. Kredit tidak ditagih."}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-line bg-black">
                {result.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/generated/${result.id}`}
                    alt={result.prompt}
                    className="max-h-[320px] w-full object-contain"
                  />
                ) : (
                  <video src={videoSrc} controls playsInline className="max-h-[320px] w-full" />
                )}
                <div className="flex items-center gap-1.5 border-t border-line p-1.5">
                  <a
                    href={
                      result.type === "video"
                        ? `/api/media/video?id=${encodeURIComponent(result.id)}&content=1`
                        : `/api/generated/${result.id}`
                    }
                    download
                    className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-box2 text-[10px] text-ink transition hover:bg-box3"
                  >
                    <Download size={11} /> Unduh
                  </a>
                  {result.type === "image" ? (
                    <button
                      onClick={() => attachImage(result)}
                      disabled={attaching}
                      className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-line bg-transparent text-[10px] text-mute transition hover:border-lineStrong hover:text-ink"
                    >
                      {attaching ? <Spinner size={10} /> : <Paperclip size={11} />} Lampirkan
                    </button>
                  ) : null}
                </div>
              </div>
            )}
            <p className="mt-2 line-clamp-2 text-[9px] leading-relaxed text-dim">{result.prompt}</p>
          </div>
        ) : null}

        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[8.5px] uppercase tracking-[0.14em] text-faint">Library</p>
            <span className="text-[8.5px] text-faint">{items.length} aset</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner size={16} />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line py-8 text-center">
              <Film size={18} className="text-faint" />
              <p className="text-[10px] text-dim">Belum ada aset. Buat yang pertama.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {items.slice(0, 20).map((item) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-lg border border-line bg-surface"
                >
                  <button
                    onClick={() => setResult(item)}
                    className="block aspect-square w-full"
                    title={item.prompt}
                  >
                    {item.type === "image" && item.status === "done" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/generated/${item.id}`}
                        alt={truncate(item.prompt, 30)}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-box2">
                        {item.status === "in_progress" ? (
                          <Loader size={16} className="spin text-mute" />
                        ) : (
                          <Film size={18} className="text-mute" />
                        )}
                      </span>
                    )}
                  </button>
                  {item.type === "video" && item.status === "done" ? (
                    <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white">
                      <Play size={8} />
                    </span>
                  ) : null}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/70 text-mute opacity-0 transition hover:text-ink group-hover:opacity-100"
                    aria-label="Hapus aset"
                  >
                    <Trash size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
