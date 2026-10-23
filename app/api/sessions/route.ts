import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { clearSessions, createSession, getSession, listSessions } from "@/lib/store";
import { DEFAULT_MODEL } from "@/lib/classai";
import type { Effort } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EFFORTS: Effort[] = ["low", "medium", "high", "ultra"];

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json({ sessions: await listSessions() });
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    model?: string;
    effort?: string;
  };
  const model = typeof body.model === "string" && body.model ? body.model : DEFAULT_MODEL;
  const effort = EFFORTS.includes(body.effort as Effort) ? (body.effort as Effort) : "medium";

  // Bersihkan sesi kosong agar daftar tetap rapi.
  const existing = await listSessions();
  for (const summary of existing.filter((s) => s.messageCount === 0)) {
    const full = await getSession(summary.id);
    if (full && full.messages.length === 0) {
      const { deleteSession } = await import("@/lib/store");
      await deleteSession(summary.id);
    }
  }

  const session = await createSession(model, effort);
  return NextResponse.json({ session });
}

export async function DELETE() {
  const denied = await guard();
  if (denied) return denied;
  await clearSessions();
  return NextResponse.json({ ok: true });
}
