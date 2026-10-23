import { NextResponse } from "next/server";
import { safeEqual, createSessionToken, SESSION_COOKIE, SESSION_TTL } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW = 10 * 60 * 1000;
const PER_KEY_LIMIT = 12;
const GLOBAL_LIMIT = 40;
const attempts = new Map<string, { count: number; reset: number }>();
let globalAttempt = { count: 0, reset: 0 };

function clientKey(request: Request) {
  // Jangan percaya X-Forwarded-For kecuali memang berjalan di belakang reverse proxy tepercaya.
  if (process.env.TRUST_PROXY !== "true") return "local";
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function prune(now: number) {
  if (attempts.size < 2000) return;
  for (const [key, record] of attempts) {
    if (record.reset <= now) attempts.delete(key);
  }
}

function limited(record: { count: number; reset: number } | undefined, limit: number, now: number) {
  return Boolean(record && record.reset > now && record.count >= limit);
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origin tidak diizinkan." }, { status: 403 });
  }

  const key = clientKey(request);
  const now = Date.now();
  prune(now);
  const record = attempts.get(key);
  if (limited(record, PER_KEY_LIMIT, now) || limited(globalAttempt, GLOBAL_LIMIT, now)) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Tunggu 10 menit." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const expectedUser = process.env.AUTH_USERNAME ?? "owner";
  const expectedPass = process.env.AUTH_PASSWORD ?? "";

  const userOk = safeEqual(username, expectedUser);
  const passOk = safeEqual(password, expectedPass);
  const ok = userOk && passOk && expectedPass.length > 0;

  if (!ok) {
    const current = attempts.get(key);
    attempts.set(key, {
      count: current && current.reset > now ? current.count + 1 : 1,
      reset: current && current.reset > now ? current.reset : now + WINDOW,
    });
    globalAttempt = {
      count: globalAttempt.reset > now ? globalAttempt.count + 1 : 1,
      reset: globalAttempt.reset > now ? globalAttempt.reset : now + WINDOW,
    };
    await new Promise((resolve) => setTimeout(resolve, 450));
    return NextResponse.json(
      { error: "Username atau password salah." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  attempts.delete(key);
  globalAttempt = { count: 0, reset: 0 };
  const { token } = await createSessionToken();
  const response = NextResponse.json(
    { ok: true, username: expectedUser },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL,
  });
  return response;
}
