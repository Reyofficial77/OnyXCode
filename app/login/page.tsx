import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server-auth";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Masuk — ONYX",
};

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/app");
  return <LoginForm />;
}
