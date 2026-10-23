import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { baseUrl, apiKey, hasApiKey, testConnection } from "@/lib/classai";
import { listSessions } from "@/lib/store";
import { workspaceHealth } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const [sessions, health] = await Promise.all([listSessions(), workspaceHealth()]);
  const key = apiKey();
  return NextResponse.json({
    apiConfigured: hasApiKey(),
    baseUrl: baseUrl(),
    keyHint: key ? `${key.slice(0, 7)}…${key.slice(-4)}` : "",
    username: process.env.AUTH_USERNAME ?? "owner",
    workspace: health,
    sessionCount: sessions.length,
    node: process.version,
    version: "1.0.0",
  });
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "test") {
    const result = await testConnection();
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
}
