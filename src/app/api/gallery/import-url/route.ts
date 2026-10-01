import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { announceNewUpload } from "@/lib/gallery-events";
import { recordUpload } from "@/lib/history";
import { fetchRemoteImage } from "@/lib/remote-image";
import { getTrustedClientIp } from "@/lib/request-ip";
import { getServerConfig } from "@/lib/server/config";
import { handleFileUpload } from "@/lib/upload";
import { logDb } from "@/lib/utils/db";

/** Extension d'après le format réellement décodé, jamais d'après le lien. */
const EXTENSIONS: Record<string, { extension: string; mimeType: string }> = {
  png: { extension: "png", mimeType: "image/png" },
  jpeg: { extension: "jpg", mimeType: "image/jpeg" },
  webp: { extension: "webp", mimeType: "image/webp" },
  gif: { extension: "gif", mimeType: "image/gif" },
};

/**
 * Ajoute à la galerie une image hébergée ailleurs. Le serveur la télécharge
 * (adresses internes refusées, taille et durée bornées), vérifie que c'est
 * bien une image, puis la range comme n'importe quel envoi.
 */
export async function POST(request: NextRequest) {
  const access = await requireAccess("user");
  if (!access.ok) return access.response;
  const { session } = access;

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }
  if (typeof url !== "string" || !url.trim() || url.length > 2048) {
    return NextResponse.json({ error: "Lien manquant" }, { status: 400 });
  }

  const config = await getServerConfig();
  if (!config.allowedTypes.images) {
    return NextResponse.json({ error: "L'envoi d'images n'est pas autorisé" }, { status: 400 });
  }

  let buffer: Buffer;
  let name: string;
  try {
    const remote = await fetchRemoteImage(url);
    buffer = Buffer.from(remote.b64, "base64");
    name = remote.name;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import impossible" },
      { status: 422 }
    );
  }

  if (buffer.length > config.limits.maxFileSize * 1024 * 1024) {
    return NextResponse.json(
      { error: `L'image dépasse la limite de ${config.limits.maxFileSize} Mo` },
      { status: 422 }
    );
  }

  // Le type annoncé par le site ne prouve rien : on décode l'en-tête.
  let format: (typeof EXTENSIONS)[string] | undefined;
  try {
    const { default: sharp } = await import("sharp");
    format = EXTENSIONS[(await sharp(buffer).metadata()).format ?? ""];
  } catch {
    format = undefined;
  }
  if (!format) {
    return NextResponse.json({ error: "Ce lien ne donne pas une image PNG, JPEG, WebP ou GIF" }, { status: 422 });
  }

  const baseName = name.replace(/\.[^.]*$/, "").replace(/[^\w.-]+/g, "-").slice(0, 80) || "image";
  const file = new File([new Uint8Array(buffer)], `${baseName}.${format.extension}`, { type: format.mimeType });
  const result = await handleFileUpload(file, config);
  if (!result.success || !result.fileUrl) {
    return NextResponse.json({ error: result.error ?? "Enregistrement impossible" }, { status: 400 });
  }

  const fileName = result.fileUrl.split("/").pop()!;
  await recordUpload({
    filename: fileName,
    originalFilename: file.name,
    fileSize: file.size,
    mimeType: file.type,
    uploadMethod: "web",
    fileUrl: result.fileUrl,
    thumbnailUrl: result.thumbnailUrl,
    deletionToken: result.deletionToken,
    ipAddress: getTrustedClientIp(request.headers),
    userId: session.user.id,
  });
  logDb.createLog({
    level: "info",
    action: "file.upload",
    message: `Import par lien réussi : ${fileName}`,
    userId: session.user.id || undefined,
    userEmail: session.user.email || undefined,
    metadata: { filename: fileName, fileSize: file.size, mimeType: file.type, uploadMethod: "web", source: new URL(url).hostname },
  });
  await announceNewUpload(fileName);

  return NextResponse.json({ fileName, url: result.fileUrl, thumbnailUrl: result.thumbnailUrl });
}
