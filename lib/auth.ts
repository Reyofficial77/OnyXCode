/**
 * Autentikasi single-user berbasis cookie bertanda tangan HMAC.
 * Edge-safe: hanya memakai Web Crypto.
 */

export const SESSION_COOKIE = "onyx_session";
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 hari

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET belum diatur di .env (minimal 16 karakter).");
  }
  return value;
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Versi password: berubah saat password diganti, sehingga cookie lama otomatis gugur. */
export async function passwordVersion() {
  const password = process.env.AUTH_PASSWORD ?? "";
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(password));
  return base64url(new Uint8Array(digest)).slice(0, 16);
}

export interface SessionPayload {
  u: string;
  pv: string;
  iat: number;
  exp: number;
}

export async function createSessionToken() {
  const username = process.env.AUTH_USERNAME ?? "owner";
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    u: username,
    pv: await passwordVersion(),
    iat: now,
    exp: now + SESSION_TTL,
  };
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return {
    token: `${body}.${base64url(new Uint8Array(signature))}`,
    payload,
  };
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;
    const json = new TextDecoder().decode(fromBase64url(body));
    const payload = JSON.parse(json) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.exp || payload.exp < now) return null;
    if (payload.u !== (process.env.AUTH_USERNAME ?? "owner")) return null;
    if (payload.pv !== (await passwordVersion())) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Perbandingan string constant-time sederhana. */
export function safeEqual(a: string, b: string) {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
