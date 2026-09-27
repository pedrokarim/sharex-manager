/**
 * Nature d'un fichier de la galerie, utilisable côté client comme côté
 * serveur (aucune dépendance Node).
 */

export const IMAGE_FILE = /\.(jpg|jpeg|png|gif|webp)$/i;
export const VIDEO_FILE = /\.(mp4|webm|mov)$/i;

export type FileKind = "image" | "video" | "file";

export function fileKind(name: string): FileKind {
  if (IMAGE_FILE.test(name)) return "image";
  if (VIDEO_FILE.test(name)) return "video";
  return "file";
}

export const isImageFile = (name: string) => IMAGE_FILE.test(name);
export const isVideoFile = (name: string) => VIDEO_FILE.test(name);

/**
 * Format réel d'une vidéo, lu dans ses premiers octets. L'extension seule ne
 * suffit pas : n'importe quel fichier peut s'appeler « .mp4 ».
 */
export function sniffVideo(head: Uint8Array): "mp4" | "mov" | "webm" | null {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...head.subarray(start, start + length));
  if (head.length >= 12 && ascii(4, 4) === "ftyp") {
    return ascii(8, 4) === "qt  " ? "mov" : "mp4";
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  return null;
}

/** Limite des vidéos en Mo : réglée à part, les vidéos pèsent plus lourd que les captures. */
export const DEFAULT_MAX_VIDEO_MB = 95;

export function maxVideoMb(limits: { maxVideoSize?: number | null }): number {
  return limits.maxVideoSize ?? DEFAULT_MAX_VIDEO_MB;
}

/** « 1:05 » pour une durée en millisecondes. */
export function formatDuration(ms: number | undefined): string | null {
  if (!ms || !Number.isFinite(ms)) return null;
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}
