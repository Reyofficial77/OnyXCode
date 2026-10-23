import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";
import { DEFAULT_MODEL, baseUrl, getModels, hasApiKey } from "@/lib/classai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const force = new URL(request.url).searchParams.get("force") === "1";
  const result = await getModels(force);
  return NextResponse.json({
    ...result,
    hasKey: hasApiKey(),
    baseUrl: baseUrl(),
    defaultModel: DEFAULT_MODEL,
  });
}
