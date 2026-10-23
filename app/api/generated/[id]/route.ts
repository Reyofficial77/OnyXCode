import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { getMedia, mediaPath } from "@/lib/media";
import { mimeFor } from "@/lib/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const item = await getMedia(id);
  if (!item) return NextResponse.json({ error: "Media tidak ditemukan." }, { status: 404 });
  if (item.remoteUrl) return NextResponse.redirect(item.remoteUrl);
  const file = mediaPath(item);
  if (!file) return NextResponse.json({ error: "File tidak tersedia." }, { status: 404 });
  try {
    const buffer = await fs.readFile(file);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeFor(item.file ?? "", item.type === "image" ? "image/png" : "video/mp4"),
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File media hilang." }, { status: 404 });
  }
}
