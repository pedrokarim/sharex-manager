import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Metadata } from "next";
import { UpgradePageClient } from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Passer à l'offre supérieure" });


/**
 * Page privée hors du groupe `(app)`, donc sans garde de layout.
 *
 * La vérification est faite ici, sur la page elle-même, et pas dans le proxy :
 * le proxy voit tout le trafic, y compris le domaine d'images et les fichiers
 * statiques, et l'y refermer les emporte avec.
 */
export default async function UpgradePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  return <UpgradePageClient />;
}
