/**
 * Vidéos de la galerie : couverture, métadonnées et ménage.
 *
 * Une vidéo vit dans les uploads comme une capture. Sa couverture est un JPEG
 * rangé avec les miniatures (`thumb_<nom>.jpg`, le nom complet de la vidéo
 * est gardé pour ne jamais croiser la miniature d'une image homonyme) et ses
 * métadonnées (durée, dimensions) dans `data/media-meta.json`.
 */

import fs from "fs";
import { unlink } from "fs/promises";
import path from "path";
import { getAbsoluteUploadPath } from "@/lib/config";
import { isVideoFile } from "@/lib/media-kind";
import { videoCover, type VideoInfo } from "@/lib/media/ffmpeg";

const META_FILE = path.join(process.cwd(), "data", "media-meta.json");

type MetaStore = Record<string, VideoInfo>;

const cache: { mtimeMs: number; store: MetaStore } = { mtimeMs: -1, store: {} };

function readStore(): MetaStore {
  try {
    const { mtimeMs } = fs.statSync(META_FILE);
    if (mtimeMs !== cache.mtimeMs) {
      cache.store = JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
      cache.mtimeMs = mtimeMs;
    }
    return cache.store;
  } catch {
    return {};
  }
}

// Les écritures passent l'une après l'autre : deux envois simultanés ne
// doivent pas s'écraser leurs métadonnées.
let writeQueue: Promise<void> = Promise.resolve();

function updateStore(change: (store: MetaStore) => void): Promise<void> {
  writeQueue = writeQueue.then(() => {
    const store = { ...readStore() };
    change(store);
    fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
    const temporary = `${META_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
    fs.renameSync(temporary, META_FILE);
  }).catch((error) => console.error("[media] écriture des métadonnées impossible :", error));
  return writeQueue;
}

export function videoMeta(name: string): VideoInfo | undefined {
  return readStore()[name];
}

export function videoCoverPath(name: string): string {
  return path.join(getAbsoluteUploadPath(), "thumbnails", `thumb_${name}.jpg`);
}

/**
 * Prépare une vidéo tout juste écrite dans les uploads. Sans ffmpeg, la vidéo
 * reste lisible et la galerie affiche une icône à la place de la couverture.
 */
export function prepareVideo(name: string): Promise<VideoInfo | null> {
  if (!isVideoFile(name)) return Promise.resolve(null);
  // Une seule extraction à la fois par vidéo, même si la galerie demande la
  // miniature plusieurs fois pendant qu'elle se prépare.
  const running = pending.get(name);
  if (running) return running;
  const input = path.join(getAbsoluteUploadPath(), name);
  const job = videoCover(input, videoCoverPath(name))
    .then(async (info) => {
      if (info) await updateStore((store) => { store[name] = info; });
      return info;
    })
    .catch((error: unknown) => {
      console.error(`[media] couverture impossible pour ${name} :`, error);
      return null;
    })
    .finally(() => pending.delete(name));
  pending.set(name, job);
  return job;
}

const pending = new Map<string, Promise<VideoInfo | null>>();

/** Retire la couverture et les métadonnées d'une vidéo supprimée. */
export async function forgetVideo(name: string): Promise<void> {
  if (!isVideoFile(name)) return;
  await unlink(videoCoverPath(name)).catch(() => undefined);
  if (readStore()[name]) await updateStore((store) => { delete store[name]; });
}
