import { OnyxError } from "../utils/errors.js";

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** Retry only idempotent-safe failures (429/5xx/network) — never on POST stream unless retries>0 explicitly. */
  retries?: number;
  retryOn?: (status: number) => boolean;
}

export interface HttpResponse {
  status: number;
  headers: Headers;
  text: string;
  retries: number;
}

const DEFAULT_TIMEOUT = 120_000;

export async function httpFetch(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
  const {
    method = "POST",
    headers = {},
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT,
    maxResponseBytes = 5_000_000,
    retries = 0,
    retryOn = (s) => s === 429 || (s >= 500 && s < 600),
  } = options;

  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
        signal: controller.signal,
        redirect: "follow",
      });
      const text = await readCapped(res, maxResponseBytes);
      if (attempt < retries && retryOn(res.status)) {
        attempt++;
        await sleep(backoff(attempt, res.headers.get("retry-after")));
        continue;
      }
      return { status: res.status, headers: res.headers, text, retries: attempt };
    } catch (err) {
      if (signal?.aborted) {
        throw new OnyxError("E_CANCELLED", "Request cancelled");
      }
      const isTimeout = err instanceof Error && (err.name === "AbortError" || /timeout/i.test(err.message));
      if (attempt < retries && !isTimeout) {
        attempt++;
        await sleep(backoff(attempt));
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new OnyxError(isTimeout ? "E_TIMEOUT" : "E_NETWORK", isTimeout ? "Request timed out" : `Network error: ${msg}`, {
        cause: err,
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > max) {
      chunks.push(value.subarray(0, Math.max(0, value.length - (total - max))));
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

function backoff(attempt: number, retryAfter?: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0 && secs <= 30) return secs * 1000;
  }
  return Math.min(8000, 500 * 2 ** (attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Map an HTTP error status to an OnyxError with a provider-supplied message. */
export function errorFromStatus(status: number, body: string, providerName: string): OnyxError {
  const detail = extractErrorMessage(body);
  if (status === 401 || status === 403) {
    return new OnyxError("E_AUTH", `${providerName} rejected the API key (HTTP ${status})${detail ? `: ${detail}` : ""}`, {
      hint: "Run `onyxcode auth login` to update the key, or `onyxcode provider test` to diagnose.",
    });
  }
  if (status === 404) {
    return new OnyxError("E_MODEL_NOT_FOUND", `${providerName}: endpoint or model not found (HTTP 404)${detail ? `: ${detail}` : ""}`);
  }
  if (status === 429) {
    const quota = /quota|insufficient|billing|exceeded your current quota/i.test(body);
    return new OnyxError(quota ? "E_QUOTA" : "E_RATE_LIMIT", `${providerName}: ${quota ? "quota exceeded" : "rate limited"} (HTTP 429)`, {
      hint: quota ? "Check your plan/billing with the provider." : "Wait a moment and retry.",
    });
  }
  if (status >= 500) {
    return new OnyxError("E_NETWORK", `${providerName}: server error (HTTP ${status})`, { hint: "Provider outage or proxy issue; retry later." });
  }
  return new OnyxError("E_BAD_RESPONSE", `${providerName}: unexpected HTTP ${status}${detail ? `: ${detail}` : ""}`);
}

export function extractErrorMessage(body: string): string | undefined {
  if (!body) return undefined;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const err = json.error;
    if (typeof err === "string") return err.slice(0, 300);
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      const msg = e.message ?? e.msg ?? e.detail;
      if (typeof msg === "string") return msg.slice(0, 300);
    }
    if (typeof json.message === "string") return json.message.slice(0, 300);
    if (typeof json.detail === "string") return json.detail.slice(0, 300);
  } catch {
    // Non-JSON (HTML error pages) — keep a short snippet.
  }
  return body.replace(/\s+/g, " ").slice(0, 200);
}

/** Parse SSE data lines from a ReadableStream. Yields raw `data:` payloads. */
export async function* parseSse(res: Response, signal?: AbortSignal): AsyncGenerator<{ event?: string; data: string }> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (signal?.aborted) throw new OnyxError("E_CANCELLED", "Request cancelled");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + (buffer[idx] === "\r" ? 4 : buffer[idx + 1] === "\n" ? 2 : 2));
        const parsed = parseSseBlock(raw);
        if (parsed) yield parsed;
      }
    }
    if (buffer.trim()) {
      const parsed = parseSseBlock(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseBlock(raw: string): { event?: string; data: string } | undefined {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return undefined;
  return { ...(event ? { event } : {}), data: dataLines.join("\n") };
}
