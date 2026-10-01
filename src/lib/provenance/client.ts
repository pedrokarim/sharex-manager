/**
 * Téléchargements d'un fichier de la galerie, côté navigateur : l'original,
 * ou le même sans ses métadonnées.
 */

/** Formats dont les métadonnées se retirent sans recompression. */
const CLEANABLE = /\.(png|jpe?g|webp)$/i;

export const canBeCleaned = (name: string) => CLEANABLE.test(name);

function saveBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Le fichier tel qu'il est sur le serveur. */
export function downloadOriginal(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * La version sans métadonnées, pixels identiques. Rend le nombre d'octets
 * retirés ; lève avec le message du serveur si elle n'est pas disponible.
 */
export async function downloadClean(name: string): Promise<{ savedBytes: number }> {
  const response = await fetch(`/api/files/${encodeURIComponent(name)}/clean`, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  const dot = name.lastIndexOf(".");
  saveBlob(await response.blob(), dot > 0 ? `${name.slice(0, dot)}-clean${name.slice(dot)}` : `${name}-clean`);
  return { savedBytes: Number(response.headers.get("X-Clean-Saved-Bytes") ?? 0) };
}
