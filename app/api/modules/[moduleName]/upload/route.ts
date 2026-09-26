import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { auth } from "@/lib/auth";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

/**
 * Dépose un média (image, vidéo, son) dans les données d'un module.
 *
 * Les médias lourds ne passent pas par `call-function` : en base64 dans du
 * JSON, un fichier de 50 Mo en pèse 67 et reste entièrement en mémoire. Ici,
 * le fichier est écrit en flux dans `modules/<nom>/data/assets/`.
 *
 * Un module l'autorise en déclarant `uploads` dans `module.json` :
 * `{ "uploads": { "maxMb": 95, "kinds": ["image", "video", "audio"] } }`.
 */

type MediaKind = "image" | "video" | "audio";

/** Signatures reconnues, lues sur les premiers octets du fichier. */
function sniff(head: Buffer): { kind: MediaKind; extension: string } | null {
  const ascii = (start: number, text: string) =>
    head.subarray(start, start + text.length).toString("latin1") === text;

  if (head[0] === 0x89 && ascii(1, "PNG")) return { kind: "image", extension: "png" };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: "image", extension: "jpg" };
  if (ascii(0, "GIF8")) return { kind: "image", extension: "gif" };
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return { kind: "image", extension: "webp" };
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return { kind: "audio", extension: "wav" };
  if (ascii(0, "OggS")) return { kind: "audio", extension: "ogg" };
  if (ascii(0, "ID3") || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) {
    return { kind: "audio", extension: "mp3" };
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return { kind: "video", extension: "webm" };
  }
  if (ascii(4, "ftyp")) {
    const brand = head.subarray(8, 12).toString("latin1");
    if (brand.startsWith("M4A")) return { kind: "audio", extension: "m4a" };
    if (brand === "qt  ") return { kind: "video", extension: "mov" };
    return { kind: "video", extension: "mp4" };
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { moduleName } = await params;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(moduleName)) {
    return NextResponse.json({ error: "Module invalide" }, { status: 400 });
  }

  await apiModuleManager.ensureInitialized();
  const config = (await apiModuleManager.getModules()).find(
    (module) => module.name === moduleName && module.enabled
  ) as (Record<string, any> & { uploads?: { maxMb?: number; kinds?: MediaKind[] } }) | undefined;
  if (!config?.uploads) {
    return NextResponse.json(
      { error: "Ce module n'accepte pas de fichiers" },
      { status: 403 }
    );
  }

  const maxBytes = Math.min(config.uploads.maxMb ?? 50, 500) * 1024 * 1024;
  const kinds = config.uploads.kinds ?? ["image"];

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes + 64 * 1024) {
    return NextResponse.json(
      { error: `Fichier trop lourd (${config.uploads.maxMb ?? 50} Mo maximum)` },
      { status: 413 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envoi illisible" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `Fichier trop lourd (${config.uploads.maxMb ?? 50} Mo maximum)` },
      { status: 413 }
    );
  }

  const head = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const detected = sniff(head);
  if (!detected || !kinds.includes(detected.kind)) {
    return NextResponse.json(
      { error: "Type de fichier non accepté par ce module" },
      { status: 415 }
    );
  }

  const assetsDir = path.join(process.cwd(), "modules", moduleName, "data", "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const fileName = `${Date.now()}-${randomBytes(5).toString("hex")}.${detected.extension}`;
  const target = path.join(assetsDir, fileName);

  try {
    await pipeline(
      Readable.fromWeb(file.stream() as any),
      fs.createWriteStream(target, { flags: "wx" })
    );
  } catch (error) {
    fs.rmSync(target, { force: true });
    console.error(`[modules/${moduleName}/upload] Écriture impossible :`, error);
    return NextResponse.json({ error: "Écriture du fichier impossible" }, { status: 500 });
  }

  return NextResponse.json({
    file: fileName,
    kind: detected.kind,
    size: file.size,
    originalName: file.name.slice(0, 200),
    ref: `module:${moduleName}/assets/${fileName}`,
    url: `/api/modules/${moduleName}/data/assets/${fileName}`,
  });
}
