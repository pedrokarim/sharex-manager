/**
 * Stockage de Clip Studio.
 *
 * Un fichier JSON par projet : l'enregistrement automatique réécrit souvent,
 * un fichier unique pour tous les projets deviendrait vite coûteux. Toutes
 * les écritures passent par un fichier temporaire puis un renommage, pour
 * qu'une coupure ne laisse jamais un projet à moitié écrit.
 */

import fs from "fs";
import path from "path";
import type { ClipAsset, ClipExport, ClipProject } from "../engine/types";
import { ensureSfxBank } from "./sfx";

const MODULE_DIR = path.join(process.cwd(), "modules", "clip-studio");
export const DATA_DIR = path.join(MODULE_DIR, "data");
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const ASSETS_DIR = path.join(DATA_DIR, "assets");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");
/** Vignettes des projets : une image du clip rendue par le navigateur, servie par la route des données. */
export const THUMBS_DIR = path.join(DATA_DIR, "thumbs");
const THUMBS_FILE = path.join(DATA_DIR, "thumbs.json");
/** Conversations de l'assistant de l'éditeur : un fichier par projet (`editor-chat.ts`). */
export const EDITOR_CHATS_DIR = path.join(DATA_DIR, "editor-chats");
const ASSETS_FILE = path.join(DATA_DIR, "assets.json");
const EXPORTS_FILE = path.join(DATA_DIR, "exports.json");

/** Un projet n'a aucune raison de dépasser cette taille : ce sont des références, pas des médias. */
const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

export function ensureDirs() {
  for (const dir of [DATA_DIR, PROJECTS_DIR, ASSETS_DIR, EXPORTS_DIR, THUMBS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Bruitages synthétisés (D3) : écrits au premier passage, vérifiés une fois par processus.
  ensureSfxBank();
}

export function assertId(id: unknown, label = "identifiant"): asserts id is string {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{2,80}$/i.test(id)) {
    throw new Error(`${label} invalide`);
  }
}

/** Nom de fichier simple, sans dossier ni fichier caché. */
export function assertFileName(name: unknown): asserts name is string {
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9._-]{0,120}$/i.test(name) || name.includes("..")) {
    throw new Error("Nom de fichier invalide");
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file: string, value: unknown) {
  ensureDirs();
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}

// ─── Projets ─────────────────────────────────────────────────────

function projectFile(id: string) {
  assertId(id, "Identifiant de projet");
  return path.join(PROJECTS_DIR, `${id}.json`);
}

export function readProject(id: string): ClipProject | null {
  const file = projectFile(id);
  return fs.existsSync(file) ? readJson<ClipProject | null>(file, null) : null;
}

export function writeProject(project: ClipProject) {
  const serialized = JSON.stringify(project);
  if (serialized.length > MAX_PROJECT_BYTES) {
    throw new Error("Projet trop volumineux");
  }
  writeJsonAtomic(projectFile(project.id), project);
}

export function listProjectFiles(): ClipProject[] {
  ensureDirs();
  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<ClipProject | null>(path.join(PROJECTS_DIR, file), null))
    .filter((project): project is ClipProject => project !== null);
}

export function removeProject(id: string) {
  fs.rmSync(projectFile(id), { force: true });
  removeThumb(id);
  // Sa conversation avec l'assistant de l'éditeur part avec lui.
  fs.rmSync(path.join(EDITOR_CHATS_DIR, `${id}.json`), { force: true });
}

// ─── Vignettes ───────────────────────────────────────────────────

/** Vignette d'un projet : son fichier et l'`updatedAt` du projet rendu. */
export interface ProjectThumb {
  file: string;
  at: number;
}

export function readThumbs(): Record<string, ProjectThumb> {
  return readJson<Record<string, ProjectThumb>>(THUMBS_FILE, {});
}

export function writeThumbs(thumbs: Record<string, ProjectThumb>) {
  writeJsonAtomic(THUMBS_FILE, thumbs);
}

/** Retire la vignette d'un projet (fichier et entrée). */
export function removeThumb(id: string) {
  const thumbs = readThumbs();
  const entry = thumbs[id];
  if (!entry) return;
  if (/^[a-z0-9][a-z0-9._-]{0,120}$/i.test(entry.file)) fs.rmSync(path.join(THUMBS_DIR, entry.file), { force: true });
  delete thumbs[id];
  writeThumbs(thumbs);
}

// ─── Médias importés ─────────────────────────────────────────────

export function readAssets(): ClipAsset[] {
  return readJson<ClipAsset[]>(ASSETS_FILE, []);
}

export function writeAssets(assets: ClipAsset[]) {
  writeJsonAtomic(ASSETS_FILE, assets);
}

// ─── Exports ─────────────────────────────────────────────────────

export function readExports(): ClipExport[] {
  return readJson<ClipExport[]>(EXPORTS_FILE, []);
}

export function writeExports(exports: ClipExport[]) {
  writeJsonAtomic(EXPORTS_FILE, exports);
}
