import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { auth } from "@/lib/auth";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import { isTrustedOrigin } from "@/lib/api-guard";

/**
 * Dépose un média (image, vidéo, son) dans les données d'un module.
 *
 * Les médias lourds ne passent pas par `call-function` : en base64 dans du
 * JSON, un fichier de 50 Mo en pèse 67 et reste entièrement en mémoire. Ici,
 * le fichier est écrit en flux dans `modules/<nom>/data/assets/`.
 *
 * Un module l'autorise en déclarant `uploads` dans `module.json` :
 * `{ "uploads": { "maxMb": 95, "kinds": ["image", "video", "audio"] } }`.
 *
 * Un fichier plus lourd qu'une requête ne peut l'être (Cloudflare refuse plus
 * de 100 Mo par requête) arrive en morceaux : `?upload=<id>&chunk=<n>&of=<total>
 * &size=<octets>&name=<nom>`, corps brut. Les morceaux sont ajoutés dans l'ordre
 * à un fichier temporaire propre à l'utilisateur ; le dernier vérifie la taille
 * et le type, puis range le fichier comme un envoi ordinaire.
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

/** Un morceau ne dépasse jamais cette taille : bien sous les 100 Mo par requête de Cloudflare. */
const CHUNK_MAX_BYTES = 64 * 1024 * 1024;
/** Un envoi en morceaux abandonné est effacé après ce délai. */
const CHUNK_TTL_MS = 60 * 60 * 1000;
/** Envois en morceaux en cours en même temps, par compte. */
const MAX_PENDING_PER_USER = 2;

interface ChunkState {
  userId: string;
  size: number;
  chunks: number;
  received: number;
  /** Octets déjà écrits : un morceau rejoué ne s'ajoute pas deux fois. */
  bytes: number;
  name: string;
  createdAt: number;
}

/** Un morceau à la fois par envoi : deux requêtes simultanées du même envoi ne s'entremêlent pas. */
const chunkLocks = new Map<string, Promise<unknown>>();

function withChunkLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chunkLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  chunkLocks.set(key, next);
  return next.finally(() => {
    if (chunkLocks.get(key) === next) chunkLocks.delete(key);
  });
}

/** Efface les envois abandonnés ; rend la place que prennent encore ceux en cours. */
function sweepChunks(dir: string, now = Date.now()): { files: string[]; bytes: number } {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return { files: [], bytes: 0 };
  }
  const files: string[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const file = path.join(dir, entry);
    try {
      const stat = fs.statSync(file);
      if (now - stat.mtimeMs > CHUNK_TTL_MS) {
        fs.rmSync(file, { force: true });
        continue;
      }
      files.push(entry);
      bytes += stat.size;
    } catch {
      // Déjà effacé par un autre envoi.
    }
  }
  return { files, bytes };
}

/** Range un fichier reçu en entier : type reconnu sur ses premiers octets, nom tiré au hasard. */
function storeAssembled(moduleName: string, source: string, kinds: MediaKind[], size: number, originalName: string) {
  const head = Buffer.alloc(16);
  const handle = fs.openSync(source, "r");
  try {
    fs.readSync(handle, head, 0, 16, 0);
  } finally {
    fs.closeSync(handle);
  }
  const detected = sniff(head);
  if (!detected || !kinds.includes(detected.kind)) {
    fs.rmSync(source, { force: true });
    return NextResponse.json({ error: "Type de fichier non accepté par ce module" }, { status: 415 });
  }
  const assetsDir = path.join(process.cwd(), "modules", moduleName, "data", "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const fileName = `${Date.now()}-${randomBytes(5).toString("hex")}.${detected.extension}`;
  fs.renameSync(source, path.join(assetsDir, fileName));
  return NextResponse.json({
    file: fileName,
    kind: detected.kind,
    size,
    originalName: originalName.slice(0, 200),
    ref: `module:${moduleName}/assets/${fileName}`,
    url: `/api/modules/${moduleName}/data/assets/${fileName}`,
  });
}

/** Nom d'origine : en-tête `X-File-Name` (encodé) du premier morceau, jamais dans l'adresse ni les journaux. */
function originalName(request: NextRequest): string {
  let raw = request.headers.get("x-file-name") ?? "";
  try {
    raw = decodeURIComponent(raw);
  } catch {
    raw = "";
  }
  return (
    Array.from(raw)
      .filter((char) => char.charCodeAt(0) >= 32)
      .join("")
      .slice(0, 200) || "fichier"
  );
}

/** Un morceau d'un envoi découpé, ajouté à la suite des précédents, dans l'ordre. */
async function receiveChunk(request: NextRequest, moduleName: string, userId: string, maxBytes: number, maxMb: number, kinds: MediaKind[]) {
  const query = request.nextUrl.searchParams;
  const uploadId = query.get("upload") ?? "";
  const index = Number(query.get("chunk"));
  const chunks = Number(query.get("of"));
  const size = Number(query.get("size"));
  if (!/^[a-f0-9]{16,64}$/.test(uploadId) || !Number.isInteger(index) || !Number.isInteger(chunks) || !Number.isInteger(size)) {
    return NextResponse.json({ error: "Morceau d'envoi invalide" }, { status: 400 });
  }
  if (chunks < 1 || chunks > 1000 || index < 0 || index >= chunks || size <= 0) {
    return NextResponse.json({ error: "Morceau d'envoi invalide" }, { status: 400 });
  }
  if (size > maxBytes) {
    return NextResponse.json({ error: `Fichier trop lourd (${maxMb} Mo maximum)` }, { status: 413 });
  }
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) {
    return NextResponse.json({ error: "Taille de l'envoi non annoncée" }, { status: 411 });
  }
  if (declared > CHUNK_MAX_BYTES || !request.body) {
    return NextResponse.json({ error: "Morceau trop lourd" }, { status: 413 });
  }

  const dir = path.join(process.cwd(), "modules", moduleName, "data", ".uploads");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Le propriétaire fait partie du nom : un autre compte ne peut pas compléter cet envoi.
  const owner = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const key = `${owner}-${uploadId}`;
  const partFile = path.join(dir, `${key}.part`);
  const stateFile = path.join(dir, `${key}.json`);
  const abandon = () => {
    fs.rmSync(partFile, { force: true });
    fs.rmSync(stateFile, { force: true });
  };

  return withChunkLock(key, async () => {
    // Nettoyage à chaque morceau : un envoi abandonné ne garde pas sa place longtemps.
    const pending = sweepChunks(dir);
    let state: ChunkState;
    if (index === 0) {
      // Au plus quelques envois en cours par compte, et jamais plus que deux fichiers complets en attente.
      const mine = pending.files.filter((file) => file.startsWith(`${owner}-`) && file.endsWith(".json") && file !== `${key}.json`);
      if (mine.length >= MAX_PENDING_PER_USER) {
        return NextResponse.json({ error: "Trop d'envois en cours : attendez la fin des précédents" }, { status: 429 });
      }
      if (pending.bytes + size > 2 * maxBytes) {
        return NextResponse.json({ error: "Le serveur reçoit déjà de gros fichiers : réessayez dans un moment" }, { status: 503 });
      }
      try {
        if (fs.statfsSync(dir).bavail * fs.statfsSync(dir).bsize < size * 2) {
          return NextResponse.json({ error: "Place insuffisante sur le serveur" }, { status: 507 });
        }
      } catch {
        // `statfs` indisponible : les plafonds ci-dessus suffisent.
      }
      state = { userId, size, chunks, received: 0, bytes: 0, name: originalName(request), createdAt: Date.now() };
    } else {
      try {
        state = JSON.parse(fs.readFileSync(stateFile, "utf-8")) as ChunkState;
      } catch {
        return NextResponse.json({ error: "Envoi inconnu ou expiré : recommencez" }, { status: 409 });
      }
      if (state.userId !== userId || state.size !== size || state.chunks !== chunks) {
        return NextResponse.json({ error: "Envoi inconnu ou expiré : recommencez" }, { status: 409 });
      }
      // La partie écrite doit être exactement celle qu'annonce l'état.
      let onDisk = -1;
      try {
        onDisk = fs.statSync(partFile).size;
      } catch {
        onDisk = -1;
      }
      if (onDisk !== state.bytes) {
        abandon();
        return NextResponse.json({ error: "Envoi incohérent : recommencez" }, { status: 409 });
      }
    }
    if (index !== state.received) {
      return NextResponse.json({ error: "Morceau hors d'ordre : recommencez l'envoi" }, { status: 409 });
    }
    if (state.bytes + declared > size) {
      abandon();
      return NextResponse.json({ error: "Envoi plus lourd qu'annoncé" }, { status: 413 });
    }

    try {
      await pipeline(Readable.fromWeb(request.body as any), fs.createWriteStream(partFile, { flags: index === 0 ? "w" : "a" }));
    } catch (error) {
      console.error(`[modules/${moduleName}/upload] Morceau interrompu :`, error);
      abandon();
      return NextResponse.json({ error: "Envoi interrompu : recommencez" }, { status: 400 });
    }
    const written = fs.statSync(partFile).size;
    if (written > size) {
      abandon();
      return NextResponse.json({ error: "Envoi plus lourd qu'annoncé" }, { status: 413 });
    }

    // Le type se lit dès le premier morceau : un envoi qui n'est pas un média accepté s'arrête là.
    if (index === 0) {
      const head = Buffer.alloc(16);
      const handle = fs.openSync(partFile, "r");
      try {
        fs.readSync(handle, head, 0, 16, 0);
      } finally {
        fs.closeSync(handle);
      }
      const detected = sniff(head);
      if (!detected || !kinds.includes(detected.kind)) {
        abandon();
        return NextResponse.json({ error: "Type de fichier non accepté par ce module" }, { status: 415 });
      }
    }

    state = { ...state, received: index + 1, bytes: written };
    if (state.received < chunks) {
      fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
      return NextResponse.json({ received: state.received, of: chunks });
    }
    fs.rmSync(stateFile, { force: true });
    if (written !== size) {
      fs.rmSync(partFile, { force: true });
      return NextResponse.json({ error: "Envoi incomplet : recommencez" }, { status: 400 });
    }
    return storeAssembled(moduleName, partFile, kinds, size, state.name);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  // Envoi par cookie de session : une page d'un autre sous-domaine d'ascencia.re
  // (cookie SameSite=Lax) ne doit pas pouvoir déposer de fichiers.
  if (!isTrustedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
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

  if (request.nextUrl.searchParams.has("upload")) {
    return receiveChunk(request, moduleName, session.user.id, maxBytes, config.uploads.maxMb ?? 50, kinds);
  }

  // `formData()` charge tout le corps en mémoire : la taille doit être
  // annoncée et raisonnable avant de commencer à lire.
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) {
    return NextResponse.json({ error: "Taille de l'envoi non annoncée" }, { status: 411 });
  }
  // L'envoi d'un seul tenant passe tout le corps en mémoire : au-delà d'un morceau, c'est l'envoi en morceaux.
  if (declared > Math.min(maxBytes, CHUNK_MAX_BYTES) + 64 * 1024) {
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
