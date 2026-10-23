import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function requireAuth() {
  const session = await getSession();
  return session !== null;
}

export function unauthorized() {
  return Response.json({ error: "Tidak punya akses. Silakan masuk ulang." }, { status: 401 });
}

export async function guard() {
  if (!(await requireAuth())) return unauthorized();
  return null;
}
