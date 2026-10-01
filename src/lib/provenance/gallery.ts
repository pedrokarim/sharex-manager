import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAbsoluteUploadPath } from "@/lib/config";
import { isFileSecure } from "@/lib/secure-files";
import { createProvenanceReader } from "./service";

/** Marques d'origine des fichiers de la galerie. */
export const galleryProvenance = createProvenanceReader(() => getAbsoluteUploadPath());

/**
 * Qui peut lire un fichier de la galerie : tout le monde, sauf s'il est marqué
 * privé, auquel cas il faut une session. C'est la règle de `/api/files/<nom>`,
 * et tout ce qui dérive du fichier (son origine, sa version sans métadonnées)
 * la suit.
 */
export async function visitorAccess(): Promise<{ signedIn: boolean; canRead: (name: string) => Promise<boolean> }> {
  const signedIn = Boolean(await auth.api.getSession({ headers: await headers() }));
  return {
    signedIn,
    canRead: async (name) => signedIn || !(await isFileSecure(name)),
  };
}
