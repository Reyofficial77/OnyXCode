import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { generateImage } from "@/lib/media";

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
    quality?: string;
  };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt wajib diisi." }, { status: 400 });
  if (prompt.length > 4000) return NextResponse.json({ error: "Prompt maksimal 4000 karakter." }, { status: 400 });

  try {
    const { item } = await generateImage({
      prompt,
      model: body.model,
      aspect: body.aspect,
      resolution: body.resolution,
      quality: body.quality,
    });
    return NextResponse.json({ item, url: `/api/generated/${item.id}` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal membuat gambar." },
      { status: 502 },
    );
  }
}
