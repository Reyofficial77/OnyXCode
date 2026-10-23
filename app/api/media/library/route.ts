import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { deleteMedia, listMedia, mediaModels } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const [items, models] = await Promise.all([listMedia(), mediaModels()]);
  return NextResponse.json({ items, models });
}

export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id wajib." }, { status: 400 });
  await deleteMedia(id);
  return NextResponse.json({ ok: true });
}
