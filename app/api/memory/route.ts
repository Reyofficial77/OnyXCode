import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import type { MemoryFile } from "@/lib/types";
import { memoryFile } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILES: MemoryFile["name"][] = ["SOUL.md", "IDENTITY.md", "MEMORY.md", "SKILL.md"];

async function readAll() {
  const files = await Promise.all(
    FILES.map(async (name) => {
      const full = await memoryFile(name);
      const [content, stat] = await Promise.all([
        fs.readFile(full, "utf8").catch(() => ""),
        fs.stat(full).catch(() => null),
      ]);
      return { name, content, updatedAt: stat?.mtimeMs ?? 0 };
    }),
  );
  return files;
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json({ files: await readAll() });
}

export async function PUT(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    content?: string;
  };
  if (!body.name || !FILES.includes(body.name as MemoryFile["name"])) {
    return NextResponse.json({ error: "Nama file tidak diizinkan." }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "Konten tidak valid." }, { status: 400 });
  }
  if (body.content.length > 300_000) {
    return NextResponse.json({ error: "Konten terlalu besar." }, { status: 400 });
  }
  const target = await memoryFile(body.name);
  await fs.writeFile(target, body.content, "utf8");
  return NextResponse.json({ ok: true, files: await readAll() });
}
