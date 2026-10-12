/**
 * Données du module sur le disque. Tout vit dans `data/`, qui n'est ni
 * versionné ni copié dans l'image Docker.
 *
 *   data/kits/<id>/brand.json   la fiche
 *   data/kits/<id>/assets/      logos, mascotte, fonds, références
 *   data/kits/<id>/fonts/       polices importées
 *   data/kits/<id>/exports/     formats exportés en PNG
 *   data/assets/                dépôt de la route d'upload, vidé à l'enregistrement
 *   data/assistant.json         travaux de l'assistant
 *
 * Toutes les écritures passent par un fichier temporaire puis un renommage.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { MODULE_NAME, isKitId, type BrandKit } from "../types";

let dataRootOverride: string | null = null;

/**
 * Déplace les données ailleurs, pour les tests : ils ne doivent jamais écrire
 * dans le vrai `data/`. `null` rétablit l'emplacement normal.
 */
export function setDataRoot(directory: string | null) {
  dataRootOverride = directory;
}

/** Lu à chaque appel, jamais figé au chargement du fichier. */
export function dataRoot(): string {
  return dataRootOverride ?? path.join(process.cwd(), "modules", MODULE_NAME, "data");
}

// `dataRoot()` peut être déplacé par les tests : sans cette mention, le build
// suivrait tout le projet à la trace.
export const kitsDir = () => path.join(/* turbopackIgnore: true */ dataRoot(), "kits");
export const uploadsDir = () => path.join(/* turbopackIgnore: true */ dataRoot(), "assets");

export function kitDir(id: string): string {
  if (!isKitId(id)) throw new Error("Identifiant de marque invalide");
  return path.join(kitsDir(), id);
}

export type KitArea = "assets" | "fonts" | "exports";
export const kitArea = (id: string, area: KitArea) => path.join(kitDir(id), area);

/** Nom de fichier simple, sans dossier ni fichier caché. */
export function isFileName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,120}$/i.test(value) && !value.includes("..");
}

export function ensureDirs() {
  fs.mkdirSync(kitsDir(), { recursive: true });
  fs.mkdirSync(uploadsDir(), { recursive: true });
}

const MAX_KIT_BYTES = 1024 * 1024;

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeJson(file: string, value: unknown, maxBytes = MAX_KIT_BYTES) {
  const serialized = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(serialized) > maxBytes) throw new Error("Fiche trop volumineuse");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, serialized);
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

const kitFile = (id: string) => path.join(kitDir(id), "brand.json");

export function readKit(id: unknown): BrandKit | null {
  if (!isKitId(id)) return null;
  const kit = readJson<BrandKit>(kitFile(id));
  return kit && kit.version === 1 && kit.id === id ? kit : null;
}

export function writeKit(kit: BrandKit) {
  for (const area of ["assets", "fonts", "exports"] as const) fs.mkdirSync(kitArea(kit.id, area), { recursive: true });
  writeJson(kitFile(kit.id), kit);
}

export function listKitFiles(): BrandKit[] {
  ensureDirs();
  return fs
    .readdirSync(/* turbopackIgnore: true */ kitsDir())
    .filter(isKitId)
    .map((id) => readKit(id))
    .filter((kit): kit is BrandKit => kit !== null);
}

export function removeKitDir(id: string) {
  fs.rmSync(kitDir(id), { recursive: true, force: true });
}
