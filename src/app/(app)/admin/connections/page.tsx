import { redirect } from "next/navigation";
import { privatePageMetadata } from "@/lib/seo";
import { adminSession, connectionsOverview } from "./data";
import { ConnectionsPageClient } from "./page.client";

export const metadata = privatePageMetadata({ title: "Comptes connectés" });

/** Le retour d'une connexion (`connected`, `pending`, `errorCode`…) est relu par la page elle-même (`useConnectionReturn`). */
export default async function ConnectionsPage() {
  if (!(await adminSession())) redirect("/");
  return <ConnectionsPageClient initial={connectionsOverview()} />;
}
