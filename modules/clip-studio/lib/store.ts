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

const MODULE_DIR = path.join(process.cwd(), "modules", "clip-studio");
export const DATA_DIR = path.join(MODULE_DIR, "data");
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const ASSETS_DIR = path.join(DATA_DIR, "assets");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");
const ASSETS_FILE = path.join(DATA_DIR, "assets.json");
const EXPORTS_FILE = path.join(DATA_DIR, "exports.json");

/** Un projet n'a aucune raison de dépasser cette taille : ce sont des références, pas des médias. */
const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

export function ensureDirs() {
  for (const dir of [DATA_DIR, PROJECTS_DIR, ASSETS_DIR, EXPORTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
