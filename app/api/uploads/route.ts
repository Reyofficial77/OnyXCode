import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { saveUpload } from "@/lib/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > 70 * 1024 * 1024) {
    return NextResponse.json({ error: "Total upload terlalu besar (maks 70 MB)." }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (!files.length) return NextResponse.json({ error: "Tidak ada file." }, { status: 400 });
    if (files.length > 10) return NextResponse.json({ error: "Maksimal 10 file per pesan." }, { status: 400 });

    const attachments = [];
    for (const file of files) {
      attachments.push(await saveUpload(file));
    }
    return NextResponse.json({ attachments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload gagal." },
      { status: 400 },
    );
  }
}
