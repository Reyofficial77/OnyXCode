"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AttachmentMeta,
  ChatMessage,
  Effort,
  LiveState,
  ModelInfo,
  Session,
  SessionSummary,
} from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { TopBar, type DockTab } from "./TopBar";
import { ChatView } from "./ChatView";
import { Composer } from "./Composer";
import { FilesPanel } from "./FilesPanel";
import { MemoryPanel } from "./MemoryPanel";
import { StudioPanel } from "./StudioPanel";
import { SettingsDialog } from "./SettingsDialog";
import { CommandPalette, type PaletteCommand } from "./CommandPalette";
import { Modal, ToastProvider, useToast } from "./ui";
import {
  Alert,
  Database,
  Download,
  FileText,
  Film,
  Folder,
  ImageIcon,
  LogOut,
  Music,
  Play,
  Plus,
  Refresh,
  Settings,
  Sparkle,
  Stop,
  X,
} from "./icons";
import { cn, formatBytes, timeAgo } from "@/lib/utils";

const DEFAULT_MODEL = "deepseek-v4.1-flash";

function summaryOf(session: Session): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    model: session.model,
    effort: session.effort,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  };
}

function parseError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string") return value;
  }
  return fallback;
}

export default function AgentApp({ username }: { username: string }) {
  return (
    <ToastProvider>
      <Shell username={username} />
    </ToastProvider>
  );
}

function Shell({ username }: { username: string }) {
  const { push } = useToast();

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [apiKeyOk, setApiKeyOk] = useState(true);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [effort, setEffort] = useState<Effort>("medium");

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const [live, setLive] = useState<LiveState | null>(null);
  const [streaming, setStreaming] = useState(false);

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);

  const [dock, setDock] = useState<DockTab | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [settings, setSettings] = useState(false);
  const [preview, setPreview] = useState<AttachmentMeta | null>(null);
  const [filesVersion, setFilesVersion] = useState(0);

  const sessionRef = useRef<Session | null>(null);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const booted = useRef(false);
  const prefsReady = useRef(false);
  const loadToken = useRef(0);
  const sendLock = useRef(false);
  const liveBuffer = useRef({ content: "", reasoning: "" });
  const liveTimer = useRef<number | null>(null);
  const regenerateRef = useRef<() => void>(() => {});
  const stableRegenerate = useCallback(() => regenerateRef.current(), []);

  function updateSession(updater: (current: Session | null) => Session | null) {
    setSession((current) => {
      const next = updater(current);
      sessionRef.current = next;
      return next;
    });
  }

  const refreshSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/sessions", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setSessions(data.sessions ?? []);
    } catch {
      // diamkan — daftar sesi bukan hal kritis
    }
  }, []);

  const loadModels = useCallback(
    async (force = false) => {
      setModelsLoading(true);
      try {
        const response = await fetch(`/api/models${force ? "?force=1" : ""}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (response.ok) {
          setModels(data.models ?? []);
          setApiKeyOk(Boolean(data.hasKey));
        }
      } catch {
        // model offline tetap memakai daftar statis di server
      } finally {
        setModelsLoading(false);
      }
    },
    [],
  );

  const openSession = useCallback(
    async (id: string, background = false) => {
      if (streamingRef.current) {
        if (!background) push("Hentikan proses yang berjalan dulu.", { tone: "error" });
        return;
      }
      const token = ++loadToken.current;
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (response.status === 404) {
            setSessions((current) => current.filter((item) => item.id !== id));
            window.localStorage.removeItem("onyx.sessionId");
          }
          return;
        }
        const data = await response.json();
        if (token !== loadToken.current) return;
        const loaded = data.session as Session;
        setSession(loaded);
        sessionRef.current = loaded;
        setActiveId(loaded.id);
        setModel(loaded.model || DEFAULT_MODEL);
        setEffort(loaded.effort || "medium");
        setLive(null);
        setMobileNav(false);
        window.localStorage.setItem("onyx.sessionId", loaded.id);
      } catch {
        if (!background) push("Gagal membuka percakapan.", { tone: "error" });
      }
    },
    [push],
  );

  const refreshCurrent = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      const loaded = data.session as Session;
      setSession(loaded);
      sessionRef.current = loaded;
      setLive(null);
    } catch {
      // biarkan tampilan sementara
    }
  }, []);

  /* ── Boot ─────────────────────────────────────────────── */
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    const savedModel = window.localStorage.getItem("onyx.model");
    const savedEffort = window.localStorage.getItem("onyx.effort");
    if (savedModel) setModel(savedModel);
    if (savedEffort === "low" || savedEffort === "medium" || savedEffort === "high" || savedEffort === "ultra") {
      setEffort(savedEffort);
    }
    setCollapsed(window.localStorage.getItem("onyx.collapsed") === "1");
    const motion = window.localStorage.getItem("onyx.motion");
    document.documentElement.dataset.motion = motion === "off" ? "off" : "on";
    prefsReady.current = true;

    void loadModels();
    (async () => {
      const response = await fetch("/api/sessions", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json();
      const list = (data.sessions ?? []) as SessionSummary[];
      setSessions(list);
      const last = window.localStorage.getItem("onyx.sessionId");
      if (last && list.some((item) => item.id === last)) {
        void openSession(last, true);
      }
    })();
  }, [loadModels, openSession]);

  useEffect(() => {
    if (!prefsReady.current) return;
    window.localStorage.setItem("onyx.model", model);
  }, [model]);

  useEffect(() => {
    if (!prefsReady.current) return;
    window.localStorage.setItem("onyx.effort", effort);
  }, [effort]);

  useEffect(() => {
    if (!prefsReady.current) return;
    window.localStorage.setItem("onyx.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  /* ── Shortcuts ────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((value) => !value);
      } else if (mod && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setCollapsed((value) => !value);
      } else if (event.key === "Escape") {
        setPalette(false);
        setSettings(false);
        setPreview(null);
        setMobileNav(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── Streaming ────────────────────────────────────────── */
  function flushLive() {
    if (liveTimer.current !== null) {
      window.clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    const { content, reasoning } = liveBuffer.current;
    if (!content && !reasoning) return;
    liveBuffer.current = { content: "", reasoning: "" };
    setLive((current) =>
      current
        ? {
            ...current,
            content: current.content + content,
            reasoning: current.reasoning + reasoning,
            status: content ? undefined : current.status,
          }
        : current,
    );
  }

  function queueLive(kind: "content" | "reasoning", text: string) {
    if (!text) return;
    liveBuffer.current[kind] += text;
    if (liveTimer.current !== null) return;
    liveTimer.current = window.setTimeout(() => {
      liveTimer.current = null;
      flushLive();
    }, 50);
  }

  function handleEvent(event: Record<string, any>, tempUserId: string | null) {
    switch (event.type) {
      case "meta": {
        if (typeof event.sessionId === "string") {
          setActiveId(event.sessionId);
          window.localStorage.setItem("onyx.sessionId", event.sessionId);
        }
        updateSession((current) => {
          if (!current) return current;
          let messages = current.messages;
          if (tempUserId && event.userMessage) {
            messages = messages.map((message) =>
              message.id === tempUserId ? (event.userMessage as ChatMessage) : message,
            );
          }
          return {
            ...current,
            id: typeof event.sessionId === "string" ? event.sessionId : current.id,
            title: typeof event.title === "string" ? event.title : current.title,
            messages,
          };
        });
        break;
      }
      case "delta":
        queueLive("content", String(event.text ?? ""));
        break;
      case "reasoning":
        queueLive("reasoning", String(event.text ?? ""));
        break;
      case "status":
        flushLive();
        setLive((current) => (current ? { ...current, status: String(event.text ?? "") } : current));
        break;
      case "notice":
        push(String(event.text ?? ""));
        break;
      case "tool_start":
        flushLive();
        setLive((current) =>
          current
            ? {
                ...current,
                status: `Menjalankan ${event.name}…`,
                tools: [
                  ...current.tools,
                  {
                    id: String(event.id),
                    name: String(event.name),
                    args: String(event.args ?? ""),
                    result: "",
                    ok: true,
                    durationMs: 0,
                  },
                ],
              }
            : current,
        );
        break;
      case "tool_end":
        flushLive();
        setLive((current) =>
          current
            ? {
                ...current,
                status: undefined,
                tools: current.tools.map((tool) =>
                  tool.id === event.id
                    ? {
                        ...tool,
                        ok: Boolean(event.ok),
                        result: String(event.result ?? ""),
                        durationMs: Number(event.durationMs ?? 0),
                      }
                    : tool,
                ),
              }
            : current,
        );
        break;
      case "error":
        flushLive();
        setLive((current) => (current ? { ...current, error: String(event.message ?? "Gagal.") } : current));
        break;
      case "done": {
        flushLive();
        const message = event.message as ChatMessage | undefined;
        updateSession((current) => {
          if (!current) return current;
          const messages = [...current.messages];
          if (message && !messages.some((item) => item.id === message.id)) messages.push(message);
          return {
            ...current,
            title: typeof event.title === "string" ? event.title : current.title,
            messages,
          };
        });
        setLive(null);
        setFilesVersion((value) => value + 1);
        break;
      }
      default:
        break;
    }
  }

  async function runStream(options: {
    sessionId: string;
    content: string;
    attachmentIds: string[];
    regenerate: boolean;
    tempUserId: string | null;
  }) {
    if (streamingRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    streamingRef.current = true;
    setStreaming(true);
    setLive({
      content: "",
      reasoning: "",
      tools: [],
      startedAt: Date.now(),
      status: "Menyiapkan konteks…",
    });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: options.sessionId,
          content: options.content,
          attachmentIds: options.attachmentIds,
          regenerate: options.regenerate,
          model,
          effort,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(parseError(data, `HTTP ${response.status}`));
      }
      if (!response.body) throw new Error("Server tidak mengirim stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf("\n\n");
        while (index >= 0) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const line = frame
            .split("\n")
            .map((row) => row.trim())
            .find((row) => row.startsWith("data:"));
          if (line) {
            const payload = line.slice(5).trim();
            if (payload) {
              try {
                handleEvent(JSON.parse(payload), options.tempUserId);
              } catch {
                // frame tidak lengkap
              }
            }
          }
          index = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        push("Proses dihentikan.");
        const id = sessionRef.current?.id;
        window.setTimeout(() => {
          if (id) void refreshCurrent(id);
        }, 900);
      } else {
        const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
        setLive((current) => (current ? { ...current, error: message } : current));
        push(message, { tone: "error" });
      }
    } finally {
      streamingRef.current = false;
      setStreaming(false);
      abortRef.current = null;
      void refreshSessions();
    }
  }

  async function sendMessage(explicit?: string) {
    if (sendLock.current || streamingRef.current || uploading) return;
    sendLock.current = true;
    try {
      await sendMessageInner(explicit);
    } finally {
      sendLock.current = false;
    }
  }

  async function sendMessageInner(explicit?: string) {
    if (streamingRef.current || uploading) return;
    const content = (explicit ?? draft).trim();
    if (!content && !pending.length) return;

    let current = sessionRef.current;
    if (!current) {
      try {
        const response = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, effort }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(parseError(data, "Gagal membuat percakapan."));
        current = data.session as Session;
        setSession(current);
        sessionRef.current = current;
        setActiveId(current.id);
        window.localStorage.setItem("onyx.sessionId", current.id);
        setSessions((existing) => [summaryOf(current as Session), ...existing]);
      } catch (error) {
        push(error instanceof Error ? error.message : "Gagal membuat percakapan.", { tone: "error" });
        return;
      }
    }

    const attachments = pending;
    const tempUserId = `local_${Date.now()}`;
    const tempUser: ChatMessage = {
      id: tempUserId,
      role: "user",
      content,
      attachments: attachments.length ? attachments : undefined,
      createdAt: Date.now(),
    };
    const optimistic: Session = {
      ...current,
      model,
      effort,
      messages: [...current.messages, tempUser],
    };
    setSession(optimistic);
    sessionRef.current = optimistic;
    setDraft("");
    setPending([]);

    await runStream({
      sessionId: current.id,
      content,
      attachmentIds: attachments.map((attachment) => attachment.id),
      regenerate: false,
      tempUserId,
    });
  }

  async function regenerate() {
    if (sendLock.current || streamingRef.current || !sessionRef.current) return;
    sendLock.current = true;
    try {
      await regenerateInner();
    } finally {
      sendLock.current = false;
    }
  }

  regenerateRef.current = () => {
    void regenerate();
  };

  async function regenerateInner() {
    if (streamingRef.current || !sessionRef.current) return;
    const current = sessionRef.current;
    const messages = [...current.messages];
    while (messages.length && messages[messages.length - 1].role === "assistant") messages.pop();
    if (!messages.some((message) => message.role === "user")) {
      push("Tidak ada pesan untuk dibuat ulang.", { tone: "error" });
      return;
    }
    const next = { ...current, messages };
    setSession(next);
    sessionRef.current = next;
    await runStream({
      sessionId: current.id,
      content: "",
      attachmentIds: [],
      regenerate: true,
      tempUserId: null,
    });
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  /* ── Sessions ─────────────────────────────────────────── */
  function newChat() {
    if (streamingRef.current) {
      push("Hentikan proses yang berjalan dulu.", { tone: "error" });
      return;
    }
    if (sessionRef.current && sessionRef.current.messages.length === 0) {
      setDraft("");
      setPending([]);
      setMobileNav(false);
      setFocusSignal((value) => value + 1);
      return;
    }
    setSession(null);
    sessionRef.current = null;
    setActiveId(null);
    setLive(null);
    setDraft("");
    setPending([]);
    setMobileNav(false);
    window.localStorage.removeItem("onyx.sessionId");
    setFocusSignal((value) => value + 1);
  }

  async function deleteSessionById(id: string) {
    try {
      await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
      setSessions((current) => current.filter((item) => item.id !== id));
      if (sessionRef.current?.id === id) {
        setSession(null);
        sessionRef.current = null;
        setActiveId(null);
        setLive(null);
        window.localStorage.removeItem("onyx.sessionId");
      }
      push("Percakapan dihapus.", { tone: "success" });
    } catch {
      push("Gagal menghapus percakapan.", { tone: "error" });
    }
  }

  async function renameSession(id: string, title: string) {
    setSessions((current) =>
      current.map((item) => (item.id === id ? { ...item, title } : item)),
    );
    if (sessionRef.current?.id === id) {
      const next = { ...sessionRef.current, title };
      setSession(next);
      sessionRef.current = next;
    }
    try {
      await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch {
      push("Gagal mengganti nama.", { tone: "error" });
    }
  }

  function changeModel(id: string) {
    setModel(id);
    if (sessionRef.current) {
      const next = { ...sessionRef.current, model: id };
      setSession(next);
      sessionRef.current = next;
      void fetch(`/api/sessions/${encodeURIComponent(next.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: id }),
      }).catch(() => undefined);
    }
  }

  function changeEffort(value: Effort) {
    setEffort(value);
    if (sessionRef.current) {
      const next = { ...sessionRef.current, effort: value };
      setSession(next);
      sessionRef.current = next;
      void fetch(`/api/sessions/${encodeURIComponent(next.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effort: value }),
      }).catch(() => undefined);
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // tetap keluar
    }
    window.location.href = "/login";
  }

  /* ── Attachments ──────────────────────────────────────── */
  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    if (uploading) return;
    if (pending.length + list.length > 10) {
      push("Maksimal 10 lampiran per pesan.", { tone: "error" });
      return;
    }
    const oversized = list.find((file) => file.size > 64 * 1024 * 1024);
    if (oversized) {
      push(`${oversized.name} melebihi 64 MB.`, { tone: "error" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of list) form.append("files", file);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(parseError(data, "Upload gagal."));
      setPending((current) => [...current, ...((data.attachments ?? []) as AttachmentMeta[])]);
    } catch (error) {
      push(error instanceof Error ? error.message : "Upload gagal.", { tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  function attachFromStudio(attachment: AttachmentMeta) {
    setPending((current) => (current.length >= 10 ? current : [...current, attachment]));
  }

  /* ── Commands ─────────────────────────────────────────── */
  const commands: PaletteCommand[] = useMemo(
    () => [
      {
        id: "new",
        label: "Percakapan baru",
        group: "Aksi",
        icon: <Plus size={13} />,
        run: newChat,
      },
      {
        id: "files",
        label: "Buka file workspace",
        group: "Panel",
        icon: <Folder size={13} />,
        run: () => setDock("files"),
      },
      {
        id: "memory",
        label: "Buka memory agent",
        group: "Panel",
        icon: <Database size={13} />,
        run: () => setDock("memory"),
      },
      {
        id: "studio",
        label: "Buka studio gambar & video",
        group: "Panel",
        icon: <Sparkle size={13} />,
        run: () => setDock("studio"),
      },
      {
        id: "settings",
        label: "Pengaturan & keamanan",
        group: "Panel",
        icon: <Settings size={13} />,
        run: () => setSettings(true),
      },
      {
        id: "models",
        label: "Muat ulang daftar model",
        group: "Aksi",
        icon: <Refresh size={13} />,
        run: () => {
          void loadModels(true);
          push("Memuat ulang model…");
        },
      },
      {
        id: "export",
        label: "Ekspor semua percakapan",
        group: "Data",
        icon: <Download size={13} />,
        run: () => {
          window.location.href = "/api/export";
        },
      },
      {
        id: "logout",
        label: "Keluar dari ONYX",
        group: "Data",
        icon: <LogOut size={13} />,
        run: () => void logout(),
      },
      ...(streaming
        ? [
            {
              id: "stop",
              label: "Hentikan proses",
              group: "Aksi",
              icon: <Stop size={13} />,
              run: stopStreaming,
            },
          ]
        : []),
      ...sessions.slice(0, 8).map((item) => ({
        id: `session-${item.id}`,
        label: item.title,
        group: "Percakapan",
        hint: timeAgo(item.updatedAt),
        icon: <FileText size={13} />,
        run: () => void openSession(item.id),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, streaming, model, effort, draft, pending],
  );

  const previewKind = preview?.kind ?? "file";
  const previewUrl = preview?.url ?? "";

  const title = session?.title || "Percakapan baru";

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-bg">
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={(id) => void openSession(id)}
        onNew={newChat}
        onDelete={(id) => void deleteSessionById(id)}
        onRename={(id, value) => void renameSession(id, value)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        mobileOpen={mobileNav}
        onCloseMobile={() => setMobileNav(false)}
        username={username}
        apiKeyOk={apiKeyOk}
        onSettings={() => setSettings(true)}
        onLogout={() => void logout()}
        onOpenPalette={() => setPalette(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          streaming={streaming}
          dock={dock}
          onDock={(tab) => {
            setDock(tab);
            setMobileNav(false);
          }}
          onOpenMobile={() => setMobileNav(true)}
          onOpenPalette={() => setPalette(true)}
          onOpenSettings={() => setSettings(true)}
        />

        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ChatView
              session={session}
              live={live}
              streaming={streaming}
              onRegenerate={stableRegenerate}
              onPreview={setPreview}
              onFiles={(files) => void addFiles(files)}
              onSuggestion={(text) => {
                setDraft(text);
                setFocusSignal((value) => value + 1);
              }}
              composer={
                <Composer
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => void sendMessage()}
                  onStop={stopStreaming}
                  streaming={streaming}
                  attachments={pending}
                  uploading={uploading}
                  onFiles={(files) => void addFiles(files)}
                  onRemoveAttachment={(id) =>
                    setPending((current) => current.filter((item) => item.id !== id))
                  }
                  onPreviewAttachment={setPreview}
                  models={models}
                  model={model}
                  onModelChange={changeModel}
                  effort={effort}
                  onEffortChange={changeEffort}
                  onRefreshModels={() => void loadModels(true)}
                  modelsLoading={modelsLoading}
                  apiKeyOk={apiKeyOk}
                  onOpenSettings={() => setSettings(true)}
                  focusSignal={focusSignal}
                />
              }
            />
          </main>

          {dock ? (
            <>
              <div
                className="fixed inset-0 z-40 animate-fade bg-black/60 xl:hidden"
                onClick={() => setDock(null)}
                aria-hidden="true"
              />
              <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(440px,100vw)] flex-col animate-[onyx-slide-right_0.3s_cubic-bezier(0.22,1,0.36,1)] border-l border-line bg-[#070707] xl:static xl:z-auto xl:w-[400px] xl:animate-none">
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
                  {dock === "files" ? (
                    <Folder size={14} className="text-mute" />
                  ) : dock === "memory" ? (
                    <Database size={14} className="text-mute" />
                  ) : (
                    <Sparkle size={14} className="text-mute" />
                  )}
                  <p className="text-[11.5px] font-medium text-ink">
                    {dock === "files" ? "Files" : dock === "memory" ? "Memory" : "Studio"}
                  </p>
                  <p className="hidden text-[9px] text-faint sm:block">
                    {dock === "files"
                      ? "workspace"
                      : dock === "memory"
                        ? "SOUL · IDENTITY · MEMORY · SKILL"
                        : "gambar & video"}
                  </p>
                  <div className="ml-auto flex items-center gap-0.5">
                    {(["files", "memory", "studio"] as DockTab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setDock(tab)}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md transition",
                          dock === tab ? "bg-box2 text-ink" : "text-dim hover:bg-box2 hover:text-mute",
                        )}
                        aria-label={tab}
                        title={tab}
                      >
                        {tab === "files" ? (
                          <Folder size={12} />
                        ) : tab === "memory" ? (
                          <Database size={12} />
                        ) : (
                          <Sparkle size={12} />
                        )}
                      </button>
                    ))}
                    <span className="mx-1 h-4 w-px bg-line" />
                    <button
                      onClick={() => setDock(null)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-dim transition hover:bg-box2 hover:text-ink"
                      aria-label="Tutup panel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div key={dock} className="flex min-h-0 flex-1 flex-col animate-enter">
                  {dock === "files" ? <FilesPanel version={filesVersion} /> : null}
                  {dock === "memory" ? <MemoryPanel /> : null}
                  {dock === "studio" ? <StudioPanel onAttach={attachFromStudio} /> : null}
                </div>
              </aside>
            </>
          ) : null}
        </div>
      </div>

      <SettingsDialog
        open={settings}
        onClose={() => setSettings(false)}
        username={username}
        models={models}
        model={model}
        effort={effort}
        onModelChange={changeModel}
        onEffortChange={changeEffort}
        onLogout={() => void logout()}
        onOpenFiles={() => {
          setSettings(false);
          setDock("files");
        }}
        onSessionsCleared={() => {
          setSessions([]);
          setSession(null);
          sessionRef.current = null;
          setActiveId(null);
          setLive(null);
          window.localStorage.removeItem("onyx.sessionId");
        }}
        onRefreshModels={() => void loadModels(true)}
      />

      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        className="max-w-3xl"
        labelledBy="preview-title"
      >
        {preview ? (
          <div>
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-box text-mute">
                {previewKind === "image" ? (
                  <ImageIcon size={13} />
                ) : previewKind === "video" ? (
                  <Film size={13} />
                ) : previewKind === "audio" ? (
                  <Music size={13} />
                ) : (
                  <FileText size={13} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p id="preview-title" className="truncate text-[12px] text-ink">
                  {preview.name}
                </p>
                <p className="text-[9.5px] text-dim">
                  {formatBytes(preview.size)} · {preview.mime}
                </p>
              </div>
              <a
                href={`${previewUrl}?download=1`}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-box2 px-2.5 text-[10.5px] text-ink transition hover:border-lineStrong"
              >
                <Download size={12} /> Unduh
              </a>
              <button
                onClick={() => setPreview(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-dim transition hover:bg-box2 hover:text-ink"
                aria-label="Tutup pratinjau"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex max-h-[72vh] min-h-[220px] items-center justify-center overflow-auto bg-black p-3">
              {previewKind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={preview.name} className="max-h-[68vh] max-w-full object-contain" />
              ) : previewKind === "video" ? (
                <video src={previewUrl} controls autoPlay className="max-h-[68vh] w-full rounded-lg" />
              ) : previewKind === "audio" ? (
                <div className="flex w-full flex-col items-center gap-4 py-10">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-box">
                    <Music size={24} className="text-mute" />
                  </span>
                  <audio src={previewUrl} controls className="w-full max-w-md" />
                </div>
              ) : preview.mime === "application/pdf" ? (
                <iframe
                  src={previewUrl}
                  title={preview.name}
                  className="h-[68vh] w-full rounded-lg border border-line bg-white"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-box text-mute">
                    <FileText size={22} />
                  </span>
                  <p className="max-w-xs break-all text-[11.5px] text-mute">{preview.name}</p>
                  <p className="text-[10px] text-dim">
                    Tidak ada pratinjau inline. Unduh untuk membuka.
                  </p>
                </div>
              )}
            </div>
            {preview.textChars ? (
              <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-[9.5px] text-dim">
                <Alert size={11} /> Teks diekstrak ({preview.textChars.toLocaleString("id-ID")}{" "}
                karakter) dan dikirim ke model sebagai konteks.
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
