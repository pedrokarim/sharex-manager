import { basename } from "path";

import { AuthNotice, AuthShell } from "@/components/front/auth-shell";
import { PageTransition } from "@/components/page-transition";
import { validateDeletionToken } from "@/lib/deletion-tokens";
import { privatePageMetadata } from "@/lib/seo";
import { DeleteConfirm } from "./delete-confirm";

export const metadata = privatePageMetadata({ title: "Supprimer un fichier" });

/**
 * Lien de suppression remis à ShareX (`deletion_url`). ShareX l'ouvre dans le
 * navigateur : la page vérifie le jeton et demande une confirmation, sans rien
 * supprimer à l'ouverture.
 */
export default async function DeleteFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ filename: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { filename } = await params;
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const safe = filename === basename(filename) && !filename.includes("\\") && !filename.startsWith(".");
  const valid = safe && value.length > 0 && (await validateDeletionToken(filename, value));

  return (
    <PageTransition>
      <AuthShell photo="pines">
        {valid ? (
          <DeleteConfirm filename={filename} token={value} />
        ) : (
          <AuthNotice title="Lien" titleAccent="invalide" action={{ label: "Retour au site", href: "/" }}>
            Ce lien de suppression n’est pas valable, ou le fichier a déjà été supprimé.
          </AuthNotice>
        )}
      </AuthShell>
    </PageTransition>
  );
}
