import type { PermissionMode } from "../config/schema.js";

export type RiskLevel = "read" | "write" | "dangerous";

export interface ApprovalRequest {
  tool: string;
  summary: string;
  risk: RiskLevel;
  /** Full detail (command, diff preview, path) shown to the user before deciding. */
  detail?: string;
  /** If true, user can choose "allow for session" for this exact approval key. */
  sessionScopeKey?: string;
}

export type ApprovalDecision = "allow" | "allow-session" | "deny";

/** Interface implemented by TUI / non-interactive prompters. */
export interface ApprovalPrompt {
  ask(request: ApprovalRequest): Promise<ApprovalDecision>;
}

export interface PolicyDecision {
  allowed: boolean;
  needsApproval: boolean;
  reason?: string;
}

export interface PolicyContext {
  mode: PermissionMode;
  risk: RiskLevel;
  tool: string;
  /** Path or command used to evaluate allow rules. */
  subject?: string;
  allowReadRoots: string[];
  allowWriteRoots: string[];
  allowCommands: string[];
  denyCommands: string[];
}

/**
 * Decide whether an action can proceed without asking.
 *
 * - read-only: only `read` risk actions pass; writes/dangerous always denied.
 * - confirm-risky: reads pass; writes pass only if inside an explicit write root,
 *   dangerous actions always need approval.
 * - allow-all: everything passes, except hard denials (denyCommands).
 */
export function evaluatePolicy(ctx: PolicyContext): PolicyDecision {
  const deniedByPattern = ctx.subject !== undefined && matchesAny(ctx.denyCommands, ctx.subject);
  if (deniedByPattern) {
    return { allowed: false, needsApproval: false, reason: `Denied by policy pattern: ${ctx.subject}` };
  }

  if (ctx.mode === "read-only") {
    if (ctx.risk === "read") return { allowed: true, needsApproval: false };
    return { allowed: false, needsApproval: false, reason: "Read-only mode: file changes and commands are disabled" };
  }

  if (ctx.mode === "allow-all") {
    return { allowed: true, needsApproval: false };
  }

  // confirm-risky
  if (ctx.risk === "read") return { allowed: true, needsApproval: false };
  if (ctx.subject && matchesAny(ctx.allowCommands, ctx.subject)) {
    return { allowed: true, needsApproval: false, reason: "Matched allowCommands" };
  }
  return { allowed: true, needsApproval: true };
}

export function matchesAny(patterns: string[], subject: string): boolean {
  return patterns.some((p) => {
    if (!p) return false;
    if (p.includes("*") || p.includes("?")) {
      // Simple wildcard on command text.
      const re = new RegExp(`^${p.split("*").map(escapeRegExp).join(".*")}$`);
      return re.test(subject);
    }
    return subject.trim().startsWith(p.trim());
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Patterns that warrant extra attention in confirmations. */
export const DANGEROUS_COMMAND_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bsudo\b/i, why: "privilege escalation" },
  { re: /\brm\s+(-[a-z]*[rf][a-z]*\s+)+(\/|~|\*|\.\.)/i, why: "recursive delete of a broad path" },
  { re: /\bRemove-Item\b.*(-Recurse|-Force)/i, why: "recursive delete" },
  { re: /\brmdir\s+\/s\b/i, why: "recursive delete" },
  { re: /\bdel\s+\/[sq]\b/i, why: "recursive delete" },
  { re: /\bgit\s+(push|reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s+\.)/i, why: "destructive git operation" },
  { re: /\bchmod\s+777\b/i, why: "permission change" },
  { re: /\bchown\b/i, why: "ownership change" },
  { re: /:\(\)\s*\{.*\};:/, why: "fork bomb pattern" },
  { re: /\b(curl|wget|iwr|Invoke-WebRequest)\b.*\|\s*(sh|bash|zsh|iex|Invoke-Expression)/i, why: "pipe remote content to shell" },
  { re: /\bnpm\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b/i, why: "publishing package" },
  { re: /\bgit\s+remote\s+(set-url|add|remove)\b/i, why: "remote modification" },
  { re: />\s*(\/dev\/sd|\\\\\.\\PHYSICALDRIVE)/i, why: "raw disk write" },
  { re: /\bmkfs\b|\bformat\s+[a-z]:/i, why: "disk formatting" },
];

export function detectDangerousCommand(command: string): string[] {
  return DANGEROUS_COMMAND_PATTERNS.filter((p) => p.re.test(command)).map((p) => p.why);
}

export type ApprovalSource = "user" | "policy" | "always-allow";

export interface AuditEntry {
  time: string;
  tool: string;
  risk: RiskLevel;
  decision: "allowed" | "denied";
  source: ApprovalSource;
  subject?: string;
}

/** Applies policy + collects per-session approvals. Never persists approvals. */
export class PermissionEngine {
  private readonly sessionAllow = new Set<string>();
  private readonly audit: AuditEntry[] = [];
  private mode: PermissionMode;

  constructor(
    mode: PermissionMode,
    private readonly options: {
      prompt: ApprovalPrompt;
      allowReadRoots?: string[];
      allowWriteRoots?: string[];
      allowCommands?: string[];
      denyCommands?: string[];
      logger?: { info: (m: string, d?: unknown) => void };
    },
  ) {
    this.mode = mode;
  }

  get currentMode(): PermissionMode {
    return this.mode;
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
    this.sessionAllow.clear();
  }

  get auditLog(): readonly AuditEntry[] {
    return this.audit;
  }

  async request(request: ApprovalRequest): Promise<PolicyDecision> {
    const key = request.sessionScopeKey ?? `${request.tool}:${request.summary}`;
    if (this.sessionAllow.has(key)) {
      this.record(request, "allowed", "always-allow");
      return { allowed: true, needsApproval: false, reason: "Approved earlier in this session" };
    }

    const decision = evaluatePolicy({
      mode: this.mode,
      risk: request.risk,
      tool: request.tool,
      ...(request.sessionScopeKey !== undefined ? { subject: request.sessionScopeKey } : {}),
      allowReadRoots: this.options.allowReadRoots ?? [],
      allowWriteRoots: this.options.allowWriteRoots ?? [],
      allowCommands: this.options.allowCommands ?? [],
      denyCommands: this.options.denyCommands ?? [],
    });

    if (!decision.allowed) {
      this.record(request, "denied", "policy");
      return decision;
    }
    if (!decision.needsApproval) {
      this.record(request, "allowed", "policy");
      return decision;
    }

    const answer = await this.options.prompt.ask(request);
    if (answer === "deny") {
      this.record(request, "denied", "user");
      return { allowed: false, needsApproval: true, reason: "Denied by user" };
    }
    if (answer === "allow-session") {
      this.sessionAllow.add(key);
    }
    this.record(request, "allowed", "user");
    return { allowed: true, needsApproval: true, reason: "Approved by user" };
  }

  private record(request: ApprovalRequest, decision: "allowed" | "denied", source: ApprovalSource): void {
    this.audit.push({
      time: new Date().toISOString(),
      tool: request.tool,
      risk: request.risk,
      decision,
      source,
      ...(request.sessionScopeKey ? { subject: request.sessionScopeKey } : {}),
    });
    this.options.logger?.info(`permission ${decision}`, { tool: request.tool, risk: request.risk, source });
  }
}

/** Non-interactive prompt: denies anything needing approval unless overridden. */
export class HeadlessApprovalPrompt implements ApprovalPrompt {
  constructor(private readonly decision: "allow" | "deny" = "deny") {}
  async ask(): Promise<ApprovalDecision> {
    return this.decision;
  }
}
