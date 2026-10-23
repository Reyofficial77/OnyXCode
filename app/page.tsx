import { redirect } from "next/navigation";
import { getSession } from "@/lib/server-auth";

export default async function Home() {
  const session = await getSession();
  redirect(session ? "/app" : "/login");
}
