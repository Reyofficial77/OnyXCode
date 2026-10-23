import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server-auth";
import AgentApp from "@/components/AgentApp";

export const metadata: Metadata = {
  title: "ONYX — Agent Workspace",
};

export default async function AgentPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <AgentApp username={session.u} />;
}
