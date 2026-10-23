import { promises as fs } from "fs";
import path from "path";
import type { ChatMessage, Effort, Session, SessionSummary } from "./types";
import { uid } from "./utils";
import { DATA_DIR } from "./paths";

const SESSION_DIR = path.join(DATA_DIR, "sessions");
const MAX_SESSIONS = 300;

const queues = new Map<string, Promise<unknown>>();

function queue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(
    key,
    next.finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    }),
  );
  return next;
}

function validId(id: string) {
  return /^[a-zA-Z0-9_-]{6,64}$/.test(id);
}

async function ensureDirs() {
  await fs.mkdir(SESSION_DIR, { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, "uploads-meta"), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, "generated"), { recursive: true });
}

function sessionPath(id: string) {
  return path.join(SESSION_DIR, `${id}.json`);
}

export async function listSessions(): Promise<SessionSummary[]> {
  await ensureDirs();
  const files = await fs.readdir(SESSION_DIR).catch(() => [] as string[]);
  const summaries: SessionSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(SESSION_DIR, file), "utf8");
      const session = JSON.parse(raw) as Session;
      if (!session?.id) continue;
      summaries.push({
        id: session.id,
        title: session.title || "Percakapan baru",
        model: session.model,
        effort: session.effort,
        updatedAt: session.updatedAt,
        messageCount: session.messages?.length ?? 0,
      });
    } catch {
      // file korup dilewati
    }
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
}

export async function getSession(id: string): Promise<Session | null> {
  if (!validId(id)) return null;
  try {
    const raw = await fs.readFile(sessionPath(id), "utf8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function createSession(model: string, effort: Effort): Promise<Session> {
  await ensureDirs();
  const now = Date.now();
  const session: Session = {
    id: uid("s"),
    title: "Percakapan baru",
    model,
    effort,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await saveSession(session);
  return session;
}

export async function saveSession(session: Session): Promise<void> {
  await ensureDirs();
  if (!validId(session.id)) throw new Error("ID sesi tidak valid");
  await queue(session.id, async () => {
    session.updatedAt = Date.now();
    const trimmed: Session = {
      ...session,
      messages: session.messages.slice(-200).map((message) => ({
        ...message,
        content:
          message.content.length > 300_000
            ? message.content.slice(0, 300_000) + "\n\n…(dipotong)"
            : message.content,
        reasoning: message.reasoning?.slice(0, 40_000),
        tools: message.tools?.map((tool) => ({
          ...tool,
          result: tool.result.slice(0, 24_000),
          args: tool.args.slice(0, 4_000),
        })),
      })),
    };
    await fs.writeFile(sessionPath(session.id), JSON.stringify(trimmed), "utf8");
  });
  await prune();
}

async function prune() {
  const sessions = await listSessions();
  if (sessions.length <= MAX_SESSIONS) return;
  for (const session of sessions.slice(MAX_SESSIONS)) {
    await deleteSession(session.id);
  }
}

export async function deleteSession(id: string): Promise<void> {
  if (!validId(id)) return;
  await fs.unlink(sessionPath(id)).catch(() => undefined);
}

export function titleFromText(text: string) {
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = clean || "Percakapan baru";
  return base.length > 54 ? base.slice(0, 54).trimEnd() + "…" : base;
}

export function addMessage(session: Session, message: ChatMessage) {
  session.messages.push(message);
  if (session.messages.length === 1 && message.role === "user") {
    session.title = titleFromText(message.content || message.attachments?.[0]?.name || "");
  }
}

export async function appendExchange(
  sessionId: string,
  user: ChatMessage,
  assistant: ChatMessage | null,
) {
  const session = await getSession(sessionId);
  if (!session) return null;
  addMessage(session, user);
  if (assistant) addMessage(session, assistant);
  await saveSession(session);
  return session;
}

export async function setSessionTitle(id: string, title: string) {
  const session = await getSession(id);
  if (!session) return null;
  session.title = title.trim().slice(0, 120) || "Percakapan baru";
  await saveSession(session);
  return session;
}

export async function updateSessionSettings(id: string, model: string, effort: Effort) {
  const session = await getSession(id);
  if (!session) return null;
  session.model = model;
  session.effort = effort;
  await saveSession(session);
  return session;
}

export async function clearSessions() {
  await ensureDirs();
  const files = await fs.readdir(SESSION_DIR).catch(() => [] as string[]);
  await Promise.all(
    files.filter((f) => f.endsWith(".json")).map((f) => fs.unlink(path.join(SESSION_DIR, f)).catch(() => undefined)),
  );
}

export async function exportAll() {
  const sessions = await listSessions();
  const full = await Promise.all(
    sessions.map(async (summary) => ({
      ...summary,
      session: await getSession(summary.id),
    })),
  );
  return { exportedAt: new Date().toISOString(), sessions: full };
}

export { DATA_DIR };
