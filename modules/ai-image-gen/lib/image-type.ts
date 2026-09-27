/**
 * Type réel d'une image, lu dans ses premiers octets.
 *
 * L'extension d'un fichier écrit sur le disque ne vient jamais du `mimeType`
 * envoyé par le navigateur : sous Windows, un `mimeType` contenant `..\`
 * faisait écrire le fichier hors de son dossier.
 */

export type ImageKind = { extension: "png" | "jpg" | "webp" | "gif"; mimeType: string };

/** Taille maximale d'une image de référence, une fois décodée. */
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

export function sniffImage(buffer: Uint8Array): ImageKind | null {
  const ascii = (start: number, text: string) =>
    buffer.length >= start + text.length &&
    String.fromCharCode(...buffer.subarray(start, start + text.length)) === text;

  if (buffer[0] === 0x89 && ascii(1, "PNG")) return { extension: "png", mimeType: "image/png" };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: "jpg", mimeType: "image/jpeg" };
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return { extension: "webp", mimeType: "image/webp" };
  if (ascii(0, "GIF8")) return { extension: "gif", mimeType: "image/gif" };
  return null;
}

/** Décode une image en base64 et vérifie son type et sa taille. */
export function decodeImage(b64: string): { buffer: Buffer; kind: ImageKind } {
  if (typeof b64 !== "string" || b64.length > Math.ceil((MAX_REFERENCE_BYTES * 4) / 3) + 4) {
    throw new Error("Image de référence trop lourde (20 Mo maximum).");
  }
  const buffer = Buffer.from(b64, "base64");
  const kind = sniffImage(buffer);
  if (!kind) throw new Error("Image de référence illisible : PNG, JPEG, WebP ou GIF attendu.");
  return { buffer, kind };
}
