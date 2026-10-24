import { registerRedactor } from "./errors.js";

/** Patterns for known credential shapes. Order matters: specific before generic. */
const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "anthropic", re: /\bsk-ant-[A-Za-z0-9_\-]{8,}/g },
  { name: "openai-project", re: /\bsk-proj-[A-Za-z0-9_\-]{8,}/g },
  { name: "openrouter", re: /\bsk-or-[A-Za-z0-9_\-]{8,}/g },
  { name: "openai", re: /\bsk-[A-Za-z0-9_\-]{16,}/g },
  { name: "groq", re: /\bgsk_[A-Za-z0-9]{16,}/g },
  { name: "google", re: /\bAIza[0-9A-Za-z_\-]{20,}/g },
  { name: "github", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "bearer", re: /\bBearer\s+[A-Za-z0-9._\-+/=]{12,}/gi },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  {
    name: "generic-assignment",
    re: /\b(api[_-]?key|token|secret|password|passwd|authorization)\b(\s*[:=]\s*)("[^"]{6,}"|'[^']{6,}'|[^\s,;]{8,})/gi,
  },
];

export const REDACTED = "***REDACTED***";

/** Replace every known secret-looking substring. Idempotent. */
export function redactString(input: string): string {
  let out = input;
  // Whole generic assignments: keep key name, drop value.
  out = out.replace(
    /\b(api[_-]?key|token|secret|password|passwd)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi,
    (_m, key: string, sep: string) => `${key}${sep}${REDACTED}`,
  );
  out = out.replace(/\bAuthorization\b(\s*:\s*)([^\r\n]+)/gi, (_m, sep: string) => `Authorization${sep}${REDACTED}`);
  for (const { re } of SECRET_PATTERNS) {
    if (re.source.startsWith("\\b(api[_-]?key") || re.source.startsWith("\\b(api")) continue;
    out = out.replace(re, REDACTED);
  }
  return out;
}

/** Deep-redact strings inside arbitrary JSON-ish values (never mutates input). */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth-limit]";
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^(api[_-]?key|apikey|authorization|token|password|secret|access[_-]?token|refresh[_-]?token)$/i.test(k)) {
      out[k] = value === undefined || v === undefined || v === "" ? v : REDACTED;
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

/** Build a safe display form of a key: first 4 + last 4, or just length for short keys. */
export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "•".repeat(secret.length);
  return `${secret.slice(0, 4)}${"•".repeat(Math.min(12, Math.max(4, secret.length - 8)))}${secret.slice(-4)}`;
}

registerRedactor(redact);
