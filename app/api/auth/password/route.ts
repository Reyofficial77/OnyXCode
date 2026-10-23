import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { safeEqual } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    current?: string;
    next?: string;
  };
  const current = body.current ?? "";
  const next = body.next ?? "";

  if (!safeEqual(current, process.env.AUTH_PASSWORD ?? "")) {
    return NextResponse.json({ error: "Password lama salah." }, { status: 400 });
  }
  if (next.length < 8) {
    return NextResponse.json({ error: "Password baru minimal 8 karakter." }, { status: 400 });
  }
  if (next.length > 120) {
    return NextResponse.json({ error: "Password terlalu panjang." }, { status: 400 });
  }
  if (/[\u0000-\u001f\u007f]/.test(next)) {
    return NextResponse.json(
      { error: "Password tidak boleh mengandung karakter kontrol atau baris baru." },
      { status: 400 },
    );
  }

  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: "Di Vercel, ganti password lewat Project → Settings → Environment Variables (AUTH_PASSWORD)." },
      { status: 501 },
    );
  }

  const envPath = path.join(process.cwd(), ".env");
  let content = await fs.readFile(envPath, "utf8").catch(() => "");
  const line = `AUTH_PASSWORD=${JSON.stringify(next)}`;
  if (/^AUTH_PASSWORD=.*$/m.test(content)) {
    content = content.replace(/^AUTH_PASSWORD=.*$/m, line);
  } else {
    content = `${content.trimEnd()}\n${line}\n`;
  }
  await fs.writeFile(envPath, content, "utf8");
  process.env.AUTH_PASSWORD = next;

  return NextResponse.json({ ok: true, relogin: true });
}
