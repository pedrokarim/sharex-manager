import { redirect } from "next/navigation";
import LogsPage from "./page.client";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const metadata = {
  title: "Logs - Administration",
  description: "Gestion des logs système",
};

export default async function AdminLogsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "admin") {
    redirect("/");
  }

  return <LogsPage />;
}
