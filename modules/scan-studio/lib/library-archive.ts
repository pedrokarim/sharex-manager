/**
 * Lecture d'une archive `.zip` ou `.cbz` dans le navigateur : on en sort les
 * images, rien d'autre, sans jamais rien écrire. Le décompresseur n'est
 * chargé qu'au premier dépôt d'archive.
 */

import { MAX_IMAGE_BYTES, imageMimeOf, isImageName, naturalCompare } from "./library-helpers";

/** Une image à envoyer : un fichier déposé, ou une entrée d'archive. */
export interface ImportSource {
  name: string;
  blob: Blob;
}

/** Au-delà, l'archive n'est sans doute pas un chapitre. */
const MAX_ARCHIVE_IMAGES = 500;

/** Entrées à écarter : dossiers, fichiers cachés, métadonnées de macOS. */
function isHiddenEntry(path: string): boolean {
  return path.endsWith("/") || path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX");
}

/** Nom à plat d'une entrée : le chemin reste lisible et garde l'ordre des sous-dossiers. */
function flatName(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .join("_")
    .replace(/[\\:*?"<>|]/g, "_");
}

/**
 * Rend les images d'une archive, dans l'ordre naturel de leurs chemins, et le
 * nombre d'entrées écartées (autre chose qu'une image, ou image trop lourde).
 */
export async function extractArchiveImages(archive: Blob): Promise<{ images: ImportSource[]; ignored: number }> {
  const { unzip } = await import("fflate");
  const data = new Uint8Array(await archive.arrayBuffer());
  let ignored = 0;
  let kept = 0;

  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(
      data,
      {
        // Le filtre s'applique avant la décompression : une entrée refusée ne coûte rien.
        filter: (entry) => {
          if (isHiddenEntry(entry.name)) return false;
          if (!isImageName(entry.name) || entry.originalSize > MAX_IMAGE_BYTES || kept >= MAX_ARCHIVE_IMAGES) {
            ignored++;
            return false;
          }
          kept++;
          return true;
        },
      },
      (error, files) => (error ? reject(error) : resolve(files))
    );
  });

  const images = Object.keys(entries)
    .sort(naturalCompare)
    .map((path) => {
      const name = flatName(path);
      // Copie dans un tampon neuf : `Blob` n'accepte pas une vue sur un tampon partagé.
      return { name, blob: new Blob([new Uint8Array(entries[path])], { type: imageMimeOf(name) }) };
    });
  return { images, ignored };
}
