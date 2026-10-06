/**
 * Archives de pages, dans les deux sens. L'écriture (`writeArchive`, export
 * d'un chapitre en `.cbz`) est à la fin du fichier.
 *
 * Lecture d'une archive `.zip` ou `.cbz` dans le navigateur : on en sort les
 * images, rien d'autre, sans jamais rien écrire. Le décompresseur n'est
 * chargé qu'au premier dépôt d'archive.
 */

import { MAX_IMAGE_BYTES, archivePageName, imageMimeOf, isImageName, naturalCompare } from "./library-helpers";

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

// ─── Écriture d'une archive .cbz ─────────────────────────────────

/** Une page à ranger dans l'archive. Elle n'est lue qu'au moment d'y entrer. */
export interface ArchiveEntry {
  /** Nom dans l'archive : `007.png`. */
  name: string;
  read: () => Promise<Uint8Array>;
}

/** Là où part l'archive, morceau par morceau : un `Blob` en construction, un fichier, une liste pour les tests. */
export interface ArchiveSink {
  write: (chunk: Uint8Array) => void | Promise<void>;
}

export interface WriteArchiveOptions {
  signal?: AbortSignal;
  /** Appelé quand une page vient d'entrer dans l'archive : son rang, à partir de zéro. */
  onEntry?: (index: number) => void;
}

/**
 * Écrit une archive `.cbz` (un zip) page après page, sans jamais tenir plus
 * d'une page en mémoire : la page est lue, rangée, envoyée au `sink`, puis
 * lâchée avant que la suivante ne soit lue. Les pages sont rangées telles
 * quelles, sans compression : ce sont déjà des images compressées, et un
 * lecteur ouvre plus vite une archive qui n'est pas à décompresser.
 *
 * Rend le nombre d'octets écrits. Lève si une page ne peut pas être lue, ou si
 * l'arrêt est demandé : l'archive entamée est alors à jeter.
 */
export async function writeArchive(entries: ArchiveEntry[], sink: ArchiveSink, options: WriteArchiveOptions = {}): Promise<number> {
  const { Zip, ZipPassThrough } = await import("fflate");
  let pending: Uint8Array[] = [];
  let failure: Error | null = null;
  let bytes = 0;

  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else if (chunk.length > 0) pending.push(chunk);
  });
  /** Envoie ce que le zip vient de produire, et attend que ce soit pris avant de continuer. */
  const flush = async () => {
    if (failure) throw failure;
    const chunks = pending;
    pending = [];
    for (const chunk of chunks) {
      bytes += chunk.length;
      await sink.write(chunk);
    }
  };

  for (let index = 0; index < entries.length; index++) {
    if (options.signal?.aborted) throw new Error("Export arrêté.");
    const entry = entries[index];
    const data = await entries[index].read();
    const file = new ZipPassThrough(entry.name);
    zip.add(file);
    file.push(data, true);
    await flush();
    options.onEntry?.(index);
  }
  zip.end();
  await flush();
  return bytes;
}

/** Type d'une archive de bande dessinée. */
export const CBZ_MIME = "application/vnd.comicbook+zip";

/**
 * Reçoit une archive dans un `Blob`. Les morceaux sont fondus dans le `Blob`
 * au fur et à mesure (`flushBytes`) : le navigateur peut alors les ranger hors
 * de la mémoire vive, au lieu de garder chaque page dans un tableau jusqu'à la
 * fin.
 */
export function createBlobSink(flushBytes = 32 * 1024 * 1024): ArchiveSink & { finish: () => Blob } {
  let blob = new Blob([], { type: CBZ_MIME });
  let parts: BlobPart[] = [];
  let waiting = 0;
  const merge = () => {
    blob = new Blob([blob, ...parts], { type: CBZ_MIME });
    parts = [];
    waiting = 0;
  };
  return {
    write(chunk) {
      // Copie : le zip peut rendre une vue sur un tampon qu'il réutilise.
      parts.push(new Uint8Array(chunk));
      waiting += chunk.length;
      if (waiting >= flushBytes) merge();
    },
    finish() {
      merge();
      return blob;
    },
  };
}

/** Ce qu'une archive de chapitre contiendra, d'après les pages du chapitre. */
export interface ChapterArchivePlan {
  /** Pages rangées, dans l'ordre de lecture. */
  pages: { pageId: string; url: string; name: string }[];
  /** Pages ni exportées ni « laissées telles quelles » : absentes de l'archive. */
  missing: number;
}

function extensionOfUrl(url: string): string {
  const file = url.split(/[?#]/)[0];
  const dot = file.lastIndexOf(".");
  return dot < 0 ? "png" : file.slice(dot + 1);
}

/**
 * Pages d'une archive de chapitre, dans l'ordre de lecture : le rendu de
 * chaque page exportée, et l'image telle quelle d'une page « laissée telle
 * quelle » (couverture, bannière), à sa place. Une page qui n'est ni l'un ni
 * l'autre n'est pas prête : elle est comptée, pas rangée. Les noms se suivent
 * sans trou, complétés de zéros.
 */
export function planChapterArchive(pages: { id: string; skipped: boolean; imageUrl: string; exportUrl?: string }[]): ChapterArchivePlan {
  const kept = pages.flatMap((page) => {
    const url = page.skipped ? page.imageUrl : page.exportUrl;
    return url ? [{ pageId: page.id, url }] : [];
  });
  return {
    pages: kept.map((page, index) => ({ ...page, name: archivePageName(index, kept.length, extensionOfUrl(page.url)) })),
    missing: pages.length - kept.length,
  };
}
