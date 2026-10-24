import fs from "node:fs";
import path from "node:path";
import { getAppPaths } from "../utils/paths.js";
import { OnyxError } from "../utils/errors.js";
import type { ChatMessage } from "../providers/types.js";

export interface SessionMetadata {
  id: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  workspaceRoot: string;
  messageCount: number;
  title?: string;
}

export interface SessionRecord {
  type: "meta" | "message";
  data: SessionMetadata | ChatMessage;
}

/**
 * Persists sessions as append-only JSONL files so recovery from crashes is trivial.
 * Indexes are maintained in memory and on disk.
 */
export class SessionStore {
  private readonly dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? getAppPaths().sessionsDir;
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
  }

  create(metadata: Omit<SessionMetadata, "createdAt" | "updatedAt" | "messageCount">): SessionMetadata {
    const meta: SessionMetadata = {
      ...metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
    const file = this.sessionFile(meta.id);
    const line: SessionRecord = { type: "meta", data: meta };
    fs.writeFileSync(file, `${JSON.stringify(line)}\n`, { mode: 0o600, encoding: "utf8" });
    return meta;
  }

  append(id: string, message: ChatMessage): void {
    const file = this.sessionFile(id);
    if (!fs.existsSync(file)) throw new OnyxError("E_SESSION_NOT_FOUND", `Session not found: ${id}`);
    const line: SessionRecord = { type: "message", data: message };
    fs.appendFileSync(file, `${JSON.stringify(line)}\n`, "utf8");
  }

  load(id: string): { metadata: SessionMetadata; messages: ChatMessage[] } {
    const file = this.sessionFile(id);
    if (!fs.existsSync(file)) throw new OnyxError("E_SESSION_NOT_FOUND", `Session not found: ${id}`);
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    let metadata: SessionMetadata | undefined;
    const messages: ChatMessage[] = [];

    for (const l of lines) {
      try {
        const record = JSON.parse(l) as SessionRecord;
        if (record.type === "meta") metadata = record.data as SessionMetadata;
        else if (record.type === "message") messages.push(record.data as ChatMessage);
      } catch {
        // Skip corrupt line, recover rest
      }
    }

    if (!metadata) {
      throw new OnyxError("E_SESSION_CORRUPT", `Session ${id} has no valid metadata record`);
    }
    metadata.messageCount = messages.length;
    return { metadata, messages };
  }

  list(): SessionMetadata[] {
    const items: SessionMetadata[] = [];
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return items;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const id = name.replace(/\.jsonl$/, "");
      try {
        const firstLine = readFirstLine(path.join(this.dir, name));
        if (firstLine) {
          const record = JSON.parse(firstLine) as SessionRecord;
          if (record.type === "meta") items.push(record.data as SessionMetadata);
        }
      } catch {
        // ignore unreadable session
      }
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  export(id: string, format: "json" | "markdown"): string {
    const session = this.load(id);
    if (format === "json") return JSON.stringify(session, null, 2);
    const lines: string[] = [
      `# OnyxCode Session: ${session.metadata.title ?? session.metadata.id}`,
      `- Date: ${session.metadata.createdAt}`,
      `- Provider: ${session.metadata.provider} (${session.metadata.model})`,
      `- Workspace: ${session.metadata.workspaceRoot}`,
      "",
    ];
    for (const msg of session.messages) {
      lines.push(`## ${msg.role.toUpperCase()}`);
      for (const p of msg.content) {
        if (p.type === "text") lines.push(p.text);
        if (p.type === "tool_call") lines.push(`*Tool call: ${p.name}*\n\`\`\`json\n${JSON.stringify(p.arguments, null, 2)}\n\`\`\``);
        if (p.type === "tool_result") lines.push(`*Tool result: ${p.name}*\n\`\`\`\n${p.content}\n\`\`\``);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  private sessionFile(id: string): string {
    return path.join(this.dir, `${id}.jsonl`);
  }
}

function readFirstLine(file: string): string | undefined {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(4096);
  const bytes = fs.readSync(fd, buf, 0, 4096, 0);
  fs.closeSync(fd);
  const text = buf.subarray(0, bytes).toString("utf8");
  const nl = text.indexOf("\n");
  return nl >= 0 ? text.slice(0, nl) : text;
}
