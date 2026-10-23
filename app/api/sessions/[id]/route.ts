import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { deleteSession, getSession, saveSession, setSessionTitle } from "@/lib/store";
import type { Effort } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EFFORTS: Effort[] = ["low", "medium", "high", "ultra"];

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ session });
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    model?: string;
    effort?: string;
  };
  if (typeof body.title === "string") {
    await setSessionTitle(id, body.title);
  }
  if (typeof body.model === "string" && body.model) {
    session.model = body.model;
  }
  if (body.effort && EFFORTS.includes(body.effort as Effort)) {
    session.effort = body.effort as Effort;
  }
  await saveSession(session);
  const updated = await getSession(id);
  return NextResponse.json({ session: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await deleteSession(id);
  return NextResponse.json({ ok: true });
}
