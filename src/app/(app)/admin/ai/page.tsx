import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import { getAiUsageOverview } from "@/lib/ai-usage";
import { privatePageMetadata } from "@/lib/seo";
import { AiUsagePageClient } from "./page.client";

export const metadata = privatePageMetadata({ title: "Intelligence artificielle" });

/** Réservé à l'administration ; l'aperçu est lu côté serveur pour un premier rendu complet. */
export default async function AiUsagePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isAdmin(session)) redirect("/");
  return <AiUsagePageClient initial={await getAiUsageOverview()} />;
}
