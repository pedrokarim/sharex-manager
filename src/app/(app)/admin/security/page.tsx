import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import { resolveAuthConfig } from "@/lib/auth-config";
import SecurityPageClient from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Sécurité" });

/** Adresse publique d'Ascencia ID, pour le lien de l'onglet Connexion ; rien en mode « builtin ». */
function ascenciaIssuer(): string | null {
  try {
    const config = resolveAuthConfig();
    return config.provider === "ascencia" ? config.issuer : null;
  } catch {
    return null;
  }
}

export default async function SecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isAdmin(session)) redirect("/");
  return <SecurityPageClient ascenciaIssuer={ascenciaIssuer()} />;
}
