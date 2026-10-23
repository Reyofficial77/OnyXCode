import { NextResponse } from "next/server";
import { guard } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json({
    authenticated: true,
    username: process.env.AUTH_USERNAME ?? "owner",
  });
}
