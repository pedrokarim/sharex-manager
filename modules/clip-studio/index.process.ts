/**
 * Fonctions serveur de Clip Studio, appelables via `/api/modules/call-function`.
 *
 * Le serveur ne calcule aucune image : l'aperçu et l'export se font dans le
 * navigateur. Il range les projets, les médias importés et les clips
 * produits.
 */

import fs from "fs";
import path from "path";
import { ModuleHooks } from "../../types/modules";
import type { ClipAsset, ClipExport, ClipProject } from "./engine/types";
import {
  ASSETS_DIR,
  EXPORTS_DIR,
  assertFileName,
  assertId,
  ensureDirs,
  listProjectFiles,
  readAssets,
  readExports,
  readProject,
  removeProject,
  writeAssets,
  writeExports,
  writeProject,
} from "./lib/store";
import { prefetchTts, prepareVoice as downloadVoice, synthesize, voiceStatuses } from "./lib/tts";
import {
  cancelAssistantJob,
  getAssistantJob as readAssistantJob,
  listAssistantJobs as readAssistantJobs,
  startAssistant as launchAssistant,
  type AssistantJob,
  type AssistantRequest,
} from "./lib/assistant";

export interface ProjectSummary {
  id: string;
  name: string;
  aspect: ClipProject["aspect"];
  width: number;
  height: number;
  durationFrames: number;
  fps: number;
  itemCount: number;
  /** Première image du projet, pour la carte. */
  cover?: string;
  createdAt: number;
  updatedAt: number;
}

function summarize(project: ClipProject): ProjectSummary {
  let end = 0;
  let itemCount = 0;
  let cover: string | undefined;
  for (const track of project.tracks) {
    for (const item of track.items) {
      end = Math.max(end, item.start + item.duration);
      itemCount++;
      if (!cover && item.type === "image") cover = item.source.url;
    }
  }
  return {
    id: project.id,
    name: project.name,
    aspect: project.aspect,
    width: project.width,
    height: project.height,
    durationFrames: end,
    fps: project.fps,
    itemCount,
    cover,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Contrôle de forme minimal : on refuse ce qui n'est manifestement pas un projet. */
function validateProject(project: ClipProject) {
  if (!project || typeof project !== "object" || project.version !== 1) {
    throw new Error("Projet invalide");
  }
  assertId(project.id, "Identifiant de projet");
  if (typeof project.name !== "string" || project.name.length > 200) {
    throw new Error("Nom de projet invalide");
  }
  if (!Array.isArray(project.tracks) || project.tracks.length > 50) {
    throw new Error("Pistes invalides");
  }
  const items = project.tracks.reduce((total, track) => total + (track.items?.length ?? 0), 0);
  if (items > 2000) throw new Error("Trop d'éléments dans le projet");
  if (!Number.isFinite(project.fps) || project.fps < 1 || project.fps > 60) {
    throw new Error("Cadence invalide");
  }
}

// ─── Projets ─────────────────────────────────────────────────────

export async function listProjects(): Promise<ProjectSummary[]> {
  return listProjectFiles()
    .map(summarize)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<ClipProject | null> {
  return readProject(id);
}

export async function saveProject(project: ClipProject): Promise<{ updatedAt: number }> {
  validateProject(project);
  const saved = { ...project, updatedAt: Date.now() };
  writeProject(saved);
  return { updatedAt: saved.updatedAt };
}

export async function deleteProject(id: string): Promise<{ success: boolean }> {
  assertId(id, "Identifiant de projet");
  removeProject(id);
  return { success: true };
}

export async function duplicateProject(id: string): Promise<ProjectSummary> {
  const project = readProject(id);
  if (!project) throw new Error("Projet introuvable");
  const now = Date.now();
  const copy: ClipProject = {
    ...structuredClone(project),
    id: `clip-${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name: `${project.name} (copie)`,
    createdAt: now,
    updatedAt: now,
  };
  writeProject(copy);
  return summarize(copy);
}

// ─── Médias importés ─────────────────────────────────────────────

export async function listAssets(): Promise<ClipAsset[]> {
  return readAssets()
    .filter((asset) => fs.existsSync(path.join(ASSETS_DIR, asset.file)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Enregistre les métadonnées d'un fichier déposé par la route d'upload des
 * modules (dimensions et durée lues par le navigateur).
 */
export async function registerAsset(asset: ClipAsset): Promise<ClipAsset> {
  assertFileName(asset.file);
  if (!fs.existsSync(path.join(ASSETS_DIR, asset.file))) {
    throw new Error("Fichier introuvable");
  }
  if (!["image", "video", "audio"].includes(asset.kind)) throw new Error("Type invalide");
  const clean: ClipAsset = {
    file: asset.file,
    kind: asset.kind,
    originalName: String(asset.originalName ?? asset.file).slice(0, 200),
    size: Number(asset.size) || 0,
    width: Number(asset.width) || undefined,
    height: Number(asset.height) || undefined,
    durationMs: Number(asset.durationMs) || undefined,
    createdAt: Date.now(),
  };
  writeAssets([clean, ...readAssets().filter((entry) => entry.file !== clean.file)]);
  return clean;
}

export async function deleteAsset(file: string): Promise<{ success: boolean }> {
  assertFileName(file);
  fs.rmSync(path.join(ASSETS_DIR, file), { force: true });
  writeAssets(readAssets().filter((asset) => asset.file !== file));
  return { success: true };
}

// ─── Exports ─────────────────────────────────────────────────────

export async function listExports(): Promise<ClipExport[]> {
  return readExports()
    .filter((entry) => fs.existsSync(path.join(EXPORTS_DIR, entry.file)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Range un clip exporté. Le navigateur l'a d'abord déposé comme média
 * importé ; on le déplace dans `exports/` pour ne pas le mélanger aux sources.
 */
export async function registerExport(input: {
  file: string;
  projectId: string;
  projectName: string;
  width: number;
  height: number;
  durationMs: number;
}): Promise<ClipExport> {
  assertFileName(input.file);
  assertId(input.projectId, "Identifiant de projet");
  ensureDirs();
  const from = path.join(ASSETS_DIR, input.file);
  if (!fs.existsSync(from)) throw new Error("Fichier exporté introuvable");
  const to = path.join(EXPORTS_DIR, input.file);
  fs.renameSync(from, to);

  const entry: ClipExport = {
    id: `exp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    projectId: input.projectId,
    projectName: String(input.projectName).slice(0, 200),
    file: input.file,
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    durationMs: Number(input.durationMs) || 0,
    sizeBytes: fs.statSync(to).size,
    createdAt: Date.now(),
  };
  writeExports([entry, ...readExports()]);
  return entry;
}

export async function deleteExport(id: string): Promise<{ success: boolean }> {
  assertId(id, "Identifiant d'export");
  const exports = readExports();
  const entry = exports.find((item) => item.id === id);
  if (entry) fs.rmSync(path.join(EXPORTS_DIR, entry.file), { force: true });
  writeExports(exports.filter((item) => item.id !== id));
  return { success: true };
}

// ─── Assistant IA ────────────────────────────────────────────────

/** Lance la création d'un short par l'assistant ; le suivi se fait par `getAssistantJob`. */
export async function startAssistant(request: AssistantRequest): Promise<AssistantJob> {
  return launchAssistant(request);
}

export async function getAssistantJob(id: string): Promise<AssistantJob | null> {
  assertId(id, "Identifiant de travail");
  return readAssistantJob(id);
}

export async function listAssistantJobs(): Promise<AssistantJob[]> {
  return readAssistantJobs();
}

export async function cancelAssistant(id: string): Promise<{ success: boolean }> {
  assertId(id, "Identifiant de travail");
  cancelAssistantJob(id);
  return { success: true };
}

// ─── Voix de synthèse ────────────────────────────────────────────

/** Voix disponibles, avec l'état de leur téléchargement. */
export async function getVoices() {
  return voiceStatuses();
}

/** Télécharge une voix sans attendre la première synthèse. */
export async function prepareVoice(id: string): Promise<{ success: boolean }> {
  void downloadVoice(String(id)).catch(() => undefined);
  return { success: true };
}

/** Lit un texte et range le son parmi les médias du module. */
export async function speak(input: { text: string; voice?: string; speed?: number }) {
  return synthesize(input);
}

// ─── Cycle de vie ────────────────────────────────────────────────

const moduleHooks: ModuleHooks = {
  onInit: () => ensureDirs(),
};

export function initModule() {
  ensureDirs();
  // Moteur et voix par défaut téléchargés en arrière-plan au démarrage, une
  // seule fois : ils restent ensuite dans le volume de données du module.
  prefetchTts();
  return moduleHooks;
}

export default moduleHooks;
