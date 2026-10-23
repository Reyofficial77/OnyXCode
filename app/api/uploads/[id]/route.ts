import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { deleteUpload, getUpload, getUploadPath, mimeFor, safeName } from "@/lib/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const meta = await getUpload(id);
  if (!meta) return NextResponse.json({ error: "Lampiran tidak ditemukan." }, { status: 404 });
  try {
    const full = await getUploadPath(meta);
    const buffer = await fs.readFile(full);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const mime = meta.mime || mimeFor(meta.name);
    const active = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|application\/javascript|text\/javascript)/i.test(mime);
    const forceDownload = download || active;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
        ...(active
          ? { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" }
          : {}),
        "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${safeName(meta.name)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File lampiran hilang." }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await deleteUpload(id);
  return NextResponse.json({ ok: true });
}
