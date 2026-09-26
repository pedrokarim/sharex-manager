import { getFileMetadata } from "@/lib/file-metadata";
import { gallerySSEManager } from "@/lib/sse";

/**
 * Annonce aux galeries ouvertes qu'un fichier vient d'apparaître dans les
 * uploads.
 *
 * La galerie ne surveille pas le dossier : elle n'apprend l'arrivée d'un
 * fichier que par cet événement. Tout code serveur qui écrit dans les uploads
 * sans passer par la route d'upload ShareX (traitement de module, envoi
 * depuis un studio…) doit donc l'appeler, sans quoi le fichier n'apparaît
 * qu'au prochain rechargement.
 */
export async function announceNewUpload(fileName: string): Promise<void> {
  try {
    const file = await getFileMetadata(fileName);
    if (!file) return;
    gallerySSEManager.broadcast("gallery", {
      type: "new_file",
      file,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // L'annonce est un confort : un échec ne doit pas faire échouer l'écriture.
    console.error("[gallery-events] Annonce impossible :", error);
  }
}
