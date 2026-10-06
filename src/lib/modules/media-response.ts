import { createReadStream, statSync } from "fs";
import path from "path";
import { Readable } from "stream";

/** Types servis par les routes de médias. Le SVG en est volontairement absent. */
export const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".srt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  // Modèle de détection qu'un module fait tourner dans le navigateur (Scan Studio).
  ".onnx": "application/octet-stream",
};

export function mediaTypeOf(file: string): string {
  return MEDIA_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Sert un fichier en flux, avec prise en charge de `Range`.
 *
 * Un lecteur vidéo demande des morceaux (`bytes=…`) pour se déplacer dans le
 * temps, et un décodeur comme Mediabunny ne lit que les parties utiles d'un
 * fichier. Sans réponse `206`, il faudrait télécharger la vidéo entière avant
 * la moindre image. Le fichier n'est jamais chargé en mémoire.
 */
export function serveMediaFile(
  request: Request,
  absolutePath: string,
  options: { cacheControl?: string } = {}
): Response {
  const stats = statSync(absolutePath);
  const size = stats.size;
  const etag = `"${size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
  const baseHeaders: Record<string, string> = {
    "Content-Type": mediaTypeOf(absolutePath),
    "Accept-Ranges": "bytes",
    "Cache-Control": options.cacheControl ?? "private, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (match[1] === "" && match[2] === "")) {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
      });
    }
    let start: number;
    let end: number;
    if (match[1] === "") {
      // « bytes=-500 » : les 500 derniers octets.
      start = Math.max(0, size - Number(match[2]));
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
      });
    }
    const stream = Readable.toWeb(createReadStream(absolutePath, { start, end }));
    return new Response(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(absolutePath));
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
