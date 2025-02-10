import { redirect } from "next/navigation";
import LogsPage from "./page.client";
import { auth } from "@/auth";

export const metadata = {
  title: "Logs - Administration",
  description: "Gestion des logs système",
};

export default async function AdminLogsPage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/");
  }

  return <LogsPage />;
}
