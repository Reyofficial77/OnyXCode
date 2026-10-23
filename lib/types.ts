export type Role = "user" | "assistant";

export type AttachmentKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "code"
  | "archive"
  | "file";

export interface AttachmentMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** Path relatif terhadap workspace, mis. `.uploads/<id>__nama.png` */
  path: string;
  url: string;
  textChars?: number;
  createdAt: number;
}

export interface ToolTrace {
  id: string;
  name: string;
  args: string;
  result: string;
  ok: boolean;
  durationMs: number;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  attachments?: AttachmentMeta[];
  tools?: ToolTrace[];
  reasoning?: string;
  model?: string;
  effort?: Effort;
  usage?: Usage;
  error?: string;
  createdAt: number;
}

export type Effort = "low" | "medium" | "high" | "ultra";

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costCredits?: number;
}

export interface LiveState {
  content: string;
  reasoning: string;
  tools: ToolTrace[];
  error?: string;
  status?: string;
  startedAt: number;
}

export interface Session {
  id: string;
  title: string;
  model: string;
  effort: Effort;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface SessionSummary {
  id: string;
  title: string;
  model: string;
  effort: Effort;
  updatedAt: number;
  messageCount: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  vendor: string;
  context: string;
  tags?: string[];
  inputPrice?: number;
  outputPrice?: number;
  recommended?: boolean;
  live?: boolean;
}

export interface MemoryFile {
  name: "SOUL.md" | "IDENTITY.md" | "MEMORY.md" | "SKILL.md";
  content: string;
  updatedAt: number;
}

export interface WorkspaceEntry {
  path: string;
  name: string;
  type: "file" | "dir";
  size: number;
  depth: number;
}

export interface MediaItem {
  id: string;
  type: "image" | "video";
  model: string;
  prompt: string;
  file?: string;
  remoteUrl?: string;
  jobId?: string;
  aspect?: string;
  resolution?: string;
  seconds?: number;
  status: "done" | "in_progress" | "failed";
  createdAt: number;
  error?: string;
}

export interface MediaModel {
  id: string;
  name: string;
  vendor: string;
  note: string;
  aspect: string[];
  resolutions: string[];
  seconds?: number[];
  quality?: boolean;
}
