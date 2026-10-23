import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { checkVideo, createVideo, getMedia } from "@/lib/media";
import { authHeaders, baseUrl } from "@/lib/classai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    model?: string;
    aspect?: string;
    resolution?: string;
    seconds?: number;
  };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt wajib diisi." }, { status: 400 });
  try {
    const item = await createVideo({
      prompt,
      model: body.model,
      aspect: body.aspect,
      resolution: body.resolution,
      seconds: Number(body.seconds) || 8,
    });
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memulai video." },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id wajib." }, { status: 400 });

  if (url.searchParams.get("content") === "1") {
    const item = await getMedia(id);
    if (!item) return NextResponse.json({ error: "Media tidak ditemukan." }, { status: 404 });
    let source = item.remoteUrl;
    let headers: Record<string, string> = {};
    if (!source && item.jobId) {
      source = `${baseUrl()}/videos/${encodeURIComponent(item.jobId)}/content`;
      headers = authHeaders();
    }
    if (!source) return NextResponse.json({ error: "Video belum siap." }, { status: 409 });
    const upstream = await fetch(source, { headers, cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `Gagal mengambil video (HTTP ${upstream.status}).` }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `attachment; filename="onyx-${item.id}.mp4"`,
      },
    });
  }

  try {
    const item = await checkVideo(id);
    if (!item) return NextResponse.json({ error: "Media tidak ditemukan." }, { status: 404 });
    return NextResponse.json({
      item,
      url: item.remoteUrl || (item.status === "done" ? `/api/generated/${item.id}` : null),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memeriksa status." },
      { status: 502 },
    );
  }
}
