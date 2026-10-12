/**
 * Fonctions serveur de Clip Studio, appelables via `/api/modules/call-function`.
 *
 * Le serveur ne calcule aucune image : l'aperçu et l'export se font dans le
 * navigateur. Il range les projets, les médias importés et les clips
 * produits.
 */

import type { GallerySourceImport, GallerySourceItem, GallerySourcePage, GallerySourceQuery } from "@/types/modules";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { ModuleHooks } from "@/types/modules";
import { getAbsoluteUploadPath } from "@/lib/config";
import { announceNewUpload } from "@/lib/gallery-events";
import { prepareVideo } from "@/lib/media/video";
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
import { prefetchTts, prepareVoice as downloadVoice, respeak, synthesize, voiceSample, voiceStatuses, type SpeakInput } from "./lib/tts";
import { isCloudProvider, isKeyProvider, providerStatuses, saveAzureRegion, saveProviderKey, setEdgeEnabled, type ProviderStatus } from "./lib/cloud-tts";
import {
  addMusic,
  downloadTrack,
  listMusic,
  prefetchMusic,
  removeMusic,
  searchMusic as searchOpenverse,
  type MusicCandidate,
  type MusicEntry,
} from "./lib/music";
import {
  cancelAssistantJob,
  getAssistantJob as readAssistantJob,
  listAssistantJobs as readAssistantJobs,
  startAssistant as launchAssistant,
  type AssistantJob,
  type AssistantRequest,
} from "./lib/assistant";
import { cleanFoundImages, importFoundImageById, searchFoundImages } from "./lib/image-search";
import type { FoundImage, ImportedImage } from "./lib/image-search-types";
import {
  enqueuePublish,
  listAccounts,
  listConnectors,
  listJobs,
  type AccountSummary,
  type ConnectorInfo,
  type PublishField,
  type PublishJobSummary,
  type PublishSource,
} from "@/lib/connections";
import type { PublishFollowUpsInput } from "@/lib/connections/types";
import { projectCredits, sanitizeCredits } from "./lib/credits";
import { validateSrt } from "./lib/subtitles";
import { fieldValuesFor, firstCommentFor, postRulesFor, resolvePostTexts, sanitizeExportPost } from "./lib/post-texts";
import type { ExportDetails, ExportPost, PublishTarget } from "./lib/post-types";
import {
  brandHashtagRules,
  changeExport,
  cleanLoudness,
  exportPath,
  findExport,
  isKitId,
  isLanguage,
  loadExportBrand,
  postForExport,
  removeExportFiles,
  siblingName,
  storeCover,
  type CoverInput,
} from "./lib/exports";
import { draftExportPost, type DraftRequest, type DraftResult } from "./lib/post-draft";

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
  let brandCover: string | undefined;
  for (const track of project.tracks) {
    for (const item of track.items) {
      end = Math.max(end, item.start + item.duration);
      itemCount++;
      if (item.type !== "image") continue;
      // Filigrane et carton de fin de la marque : une miniature seulement à défaut d'image du clip.
      if (item.origin === "brand" || track.origin === "brand") brandCover ??= item.source.url;
      else cover ??= item.source.url;
    }
  }
  cover ??= brandCover;
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

const ITEM_TYPES = new Set(["image", "video", "audio", "text", "shape"]);
/** Trente minutes à 60 images par seconde : au-delà, un projet est forcément abîmé. */
const MAX_FRAME = 30 * 60 * 60;

/**
 * Adresse d'un média : un chemin de ce site sous `/api/`. Une adresse
 * extérieure ferait charger n'importe quelle page à qui ouvre le projet.
 */
function isLocalMediaUrl(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length <= 1000 &&
    /^\/api\/[A-Za-z0-9._~%!$&'()*+,;=:@\/-]+$/.test(value) &&
    !value.startsWith("//") &&
    !value.includes("..")
  );
}

function isFrame(value: unknown, min: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= MAX_FRAME;
}

/**
 * Contrôle de forme à l'enregistrement. Il ne décrit pas chaque réglage
 * d'un élément, mais écarte ce qui casserait la liste des projets, figerait
 * l'éditeur (durées démesurées) ou ferait charger une adresse extérieure.
 */
function validateProject(project: ClipProject) {
  if (!project || typeof project !== "object" || project.version !== 1) {
    throw new Error("Projet invalide");
  }
  assertId(project.id, "Identifiant de projet");
  if (typeof project.name !== "string" || project.name.length > 200) {
    throw new Error("Nom de projet invalide");
  }
  if (!Number.isFinite(project.fps) || project.fps < 1 || project.fps > 60) {
    throw new Error("Cadence invalide");
  }
  for (const size of [project.width, project.height]) {
    if (!Number.isInteger(size) || size < 16 || size > 4096) throw new Error("Dimensions invalides");
  }
  if (typeof project.background !== "string" || project.background.length > 64) {
    throw new Error("Fond invalide");
  }
  if (!Array.isArray(project.tracks) || project.tracks.length > 50) {
    throw new Error("Pistes invalides");
  }

  let count = 0;
  for (const track of project.tracks) {
    if (!track || typeof track !== "object" || !Array.isArray(track.items)) throw new Error("Piste invalide");
    if (track.kind !== "visual" && track.kind !== "audio") throw new Error("Type de piste invalide");
    if (typeof track.name !== "string" || track.name.length > 100) throw new Error("Nom de piste invalide");
    for (const item of track.items) {
      count++;
      if (!item || typeof item !== "object" || !ITEM_TYPES.has(item.type)) throw new Error("Élément invalide");
      if (!isFrame(item.start, 0) || !isFrame(item.duration, 1)) throw new Error("Durée d'élément invalide");
      if ("source" in item) {
        const source = item.source;
        if (!source || typeof source !== "object" || !isLocalMediaUrl(source.url)) {
          throw new Error("Adresse de média invalide : seuls les médias de ce site sont acceptés");
        }
      }
      if (item.type === "text" && (typeof item.text !== "string" || item.text.length > 5000)) {
        throw new Error("Texte invalide");
      }
    }
  }
  if (count > 2000) throw new Error("Trop d'éléments dans le projet");

  // Demande de l'assistant : relue par Codex pour rédiger les textes de publication.
  if (project.brief !== undefined) {
    const brief = project.brief;
    if (
      !brief ||
      typeof brief !== "object" ||
      typeof brief.prompt !== "string" ||
      brief.prompt.length > 4000 ||
      (brief.title !== undefined && (typeof brief.title !== "string" || brief.title.length > 200)) ||
      (brief.script !== undefined && (!Array.isArray(brief.script) || brief.script.length > 100 || brief.script.some((line) => typeof line !== "string" || line.length > 2000))) ||
      (brief.checkedAt !== undefined && (typeof brief.checkedAt !== "number" || !Number.isFinite(brief.checkedAt))) ||
      (brief.sources !== undefined && !validBriefSources(brief.sources))
    ) {
      throw new Error("Demande de l'assistant invalide");
    }
  }
}

/** Sources de la vérification des faits : adresses https bornées, comme `fact-check.ts` les range. */
function validBriefSources(sources: unknown): boolean {
  if (!Array.isArray(sources) || sources.length > 300) return false;
  return sources.every((source) => {
    if (!source || typeof source !== "object") return false;
    const { segment, url, title } = source as { segment?: unknown; url?: unknown; title?: unknown };
    if (!Number.isInteger(segment) || (segment as number) < 0 || (segment as number) > 100) return false;
    if (typeof title !== "string" || title.length > 300) return false;
    if (typeof url !== "string" || url.length > 500) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  });
}

// ─── Projets ─────────────────────────────────────────────────────

export async function listProjects(): Promise<ProjectSummary[]> {
  // Un projet illisible est ignoré plutôt que de rendre la liste vide pour tous.
  return listProjectFiles()
    .flatMap((project) => {
      try {
        return [summarize(project)];
      } catch {
        return [];
      }
    })
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
export interface RegisterExportInput {
  file: string;
  projectId: string;
  projectName: string;
  width: number;
  height: number;
  durationMs: number;
  /** Crédits relevés dans le projet au moment du rendu ; absents : relevés par le serveur. */
  credits?: string[];
  /** Volume mesuré du fichier rendu. */
  loudness?: { lufs: number; peakDb: number };
  /** Sous-titres au format SubRip, rendus à côté de la vidéo. */
  subtitles?: { srt: string; language?: string };
  /** Marque du projet au moment du rendu ; absente : celle du projet enregistré. */
  brandKitId?: string;
  /** `updatedAt` du projet rendu. */
  projectUpdatedAt?: number;
}

/** Sous-titres d'un export : même base de nom que la vidéo, 512 Kio au plus, format SubRip contrôlé. */
const SUBTITLES_MAX_BYTES = 512 * 1024;

/**
 * Range un clip exporté. Le navigateur l'a d'abord déposé comme média
 * importé ; on le déplace dans `exports/` pour ne pas le mélanger aux
 * sources. Crédits, volume, sous-titres et marque suivent l'export ; ses
 * textes de publication partent de la marque.
 */
export async function registerExport(input: RegisterExportInput): Promise<ClipExport> {
  assertFileName(input.file);
  assertId(input.projectId, "Identifiant de projet");
  ensureDirs();
  const from = path.join(ASSETS_DIR, input.file);
  if (!fs.existsSync(from)) throw new Error("Fichier exporté introuvable");
  // Contrôlés avant de déplacer la vidéo : un refus ne laisse rien à moitié rangé.
  const srt = input.subtitles?.srt !== undefined ? validateSrt(input.subtitles.srt, SUBTITLES_MAX_BYTES) : null;
  const project = readProject(input.projectId);
  const brandKitId = isKitId(input.brandKitId) ? input.brandKitId : project?.brandKitId;
  const brand = await loadExportBrand(brandKitId);

  const to = path.join(EXPORTS_DIR, input.file);
  fs.renameSync(from, to);

  const now = Date.now();
  const projectUpdatedAt = Number(input.projectUpdatedAt);
  const entry: ClipExport = {
    id: `exp-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    projectId: input.projectId,
    projectName: String(input.projectName).slice(0, 200),
    file: input.file,
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    durationMs: Number(input.durationMs) || 0,
    sizeBytes: fs.statSync(to).size,
    createdAt: now,
    credits: Array.isArray(input.credits) ? sanitizeCredits(input.credits) : projectCredits(project, brand?.language),
    ...(cleanLoudness(input.loudness) ? { loudness: cleanLoudness(input.loudness) } : {}),
    ...(brandKitId ? { brandKitId } : {}),
    ...(Number.isFinite(projectUpdatedAt) && projectUpdatedAt > 0
      ? { projectUpdatedAt: Math.round(projectUpdatedAt) }
      : project
        ? { projectUpdatedAt: project.updatedAt }
        : {}),
  };
  if (srt) {
    const file = siblingName(input.file, "subtitles", "srt");
    fs.writeFileSync(exportPath(file), srt, "utf-8");
    entry.subtitles = { file, language: isLanguage(input.subtitles?.language) ? input.subtitles!.language! : (brand?.language ?? "fr") };
  }
  try {
    entry.post = postForExport(entry, project, brand, now);
  } catch {
    // Un modèle illisible ne doit pas faire perdre le rendu : les textes restent à écrire.
  }
  writeExports([entry, ...readExports()]);
  return entry;
}

export async function deleteExport(id: string): Promise<{ success: boolean }> {
  assertId(id, "Identifiant d'export");
  const exports = readExports();
  const entry = exports.find((item) => item.id === id);
  if (entry) removeExportFiles(entry);
  writeExports(exports.filter((item) => item.id !== id));
  return { success: true };
}

/** Un export, son projet d'origine et sa marque. */
export async function getExport(id: string): Promise<ExportDetails> {
  const entry = findExport(id);
  if (!fs.existsSync(path.join(EXPORTS_DIR, entry.file))) throw new Error("Fichier exporté introuvable");
  const project = readProject(entry.projectId);
  const brand = await loadExportBrand(entry.brandKitId ?? project?.brandKitId);
  return {
    export: entry,
    project: project ? { exists: true, name: project.name, updatedAt: project.updatedAt, brandKitId: project.brandKitId } : { exists: false },
    projectChanged: Boolean(project && entry.projectUpdatedAt && project.updatedAt > entry.projectUpdatedAt),
    brand: brand ? { id: brand.id, name: brand.name } : null,
    hashtagRules: brandHashtagRules(brand),
  };
}

const connectorIds = () => listConnectors().map((connector) => connector.id);

/**
 * Enregistre le jeu de textes d'un export, validé et borné. Avec
 * `expectedUpdatedAt`, refuse un jeu modifié ailleurs entre-temps.
 */
export async function updateExportPost(id: string, post: ExportPost, expectedUpdatedAt?: number): Promise<ExportPost> {
  const clean = sanitizeExportPost(post, connectorIds());
  const saved = changeExport(String(id), (entry) => {
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null && entry.post && Number(expectedUpdatedAt) !== entry.post.updatedAt) {
      throw new Error("Ces textes ont changé ailleurs entre-temps : rechargez la fiche avant de continuer.");
    }
    // Une seconde modification dans la même milliseconde garde un horodatage croissant.
    const updatedAt = Math.max(clean.updatedAt, (entry.post?.updatedAt ?? 0) + 1);
    return { ...entry, post: { ...clean, updatedAt } };
  });
  return saved.post!;
}

/**
 * Fixe la couverture d'un export : une image du clip au curseur (PNG, JPEG
 * ou WebP déposé par la route d'upload du module), ou une image de la
 * galerie ; `null` la retire. Réencodée en JPEG au cadre de la vidéo.
 */
export async function setExportCover(id: string, input: CoverInput | null): Promise<ClipExport> {
  const entry = findExport(id);
  const previous = entry.cover?.file;
  const cover = input ? await storeCover(entry, input) : undefined;
  try {
    const saved = changeExport(entry.id, (current) => {
      const next = { ...current };
      if (cover) next.cover = cover;
      else delete next.cover;
      return next;
    });
    if (previous && previous !== cover?.file) fs.rmSync(exportPath(previous), { force: true });
    return saved;
  } catch (error) {
    if (cover) fs.rmSync(exportPath(cover.file), { force: true });
    throw error;
  }
}

/** Le jeu de textes tiré de la marque, sans l'enregistrer (« Reprendre la marque »). */
export async function defaultPostTexts(id: string): Promise<ExportPost> {
  const entry = findExport(id);
  const project = readProject(entry.projectId);
  const brand = await loadExportBrand(entry.brandKitId ?? project?.brandKitId);
  return postForExport(entry, project, brand);
}

/**
 * Propositions de l'assistant (Codex) pour tout le jeu de textes, ou pour
 * quelques champs, avec une variante courte pour chaque service visé dont
 * les limites l'exigent. Rien n'est enregistré : l'écran marque les champs
 * proposés « à relire ».
 */
export async function draftPostTexts(id: string, request: DraftRequest): Promise<DraftResult> {
  const entry = findExport(id);
  const project = readProject(entry.projectId);
  const brand = await loadExportBrand(entry.brandKitId ?? project?.brandKitId);
  return draftExportPost({ entry, project, brand, connectors: listConnectors(), request });
}

/**
 * Copie un clip exporté dans la galerie, comme une capture ShareX : public
 * par défaut, avec sa couverture et sa durée. Un second envoi ne duplique
 * pas le fichier tant que la copie existe.
 */
export async function sendExportToGallery(id: string): Promise<{ fileName: string }> {
  assertId(id, "Identifiant d'export");
  const exports = readExports();
  const entry = exports.find((item) => item.id === id);
  if (!entry) throw new Error("Export introuvable");
  const source = path.join(EXPORTS_DIR, entry.file);
  if (!fs.existsSync(source)) throw new Error("Fichier exporté introuvable");

  const uploads = getAbsoluteUploadPath();
  if (entry.galleryFile && fs.existsSync(path.join(uploads, entry.galleryFile))) {
    return { fileName: entry.galleryFile };
  }

  const fileName = `${randomBytes(9).toString("base64url")}.mp4`;
  fs.mkdirSync(uploads, { recursive: true });
  fs.copyFileSync(source, path.join(uploads, fileName));
  await prepareVideo(fileName);

  entry.galleryFile = fileName;
  writeExports(exports);
  await announceNewUpload(fileName);
  return { fileName };
}

// ─── Publication (comptes connectés du cœur) ─────────────────────

export interface ExportFile {
  path: string;
  file: string;
  bytes: number;
  name: string;
  width: number;
  height: number;
  durationMs: number;
  mimeType?: string;
}

/** Identifiants des fichiers liés à un export, pour la file : `<export>-cover`, `<export>-subtitles`. */
const coverFileId = (exportId: string) => `${exportId}-cover`;
const LINKED_FILE_ID = /^(exp-[a-z0-9]+)-(cover|subtitles)$/;

/**
 * Chemin contrôlé d'un export, pour la file de publication du cœur : la
 * vidéo, ou sa couverture et ses sous-titres. La file les demande par
 * `resolveExportFile(id, { file, purpose })` (suites de publication) ; la
 * couverture d'une source a aussi son identifiant (`<export>-cover`).
 * Déclarée `public` dans module.json : la route `call-function` la refuse
 * toujours, seul le serveur l'atteint. Aucun chemin ne vient du navigateur.
 */
export async function resolveExportFile(id: string, linkedFile?: string | { file?: string; purpose?: "subtitles" | "cover" }): Promise<ExportFile> {
  assertId(id, "Identifiant d'export");
  const linked = LINKED_FILE_ID.exec(id);
  const entry = readExports().find((item) => item.id === (linked ? linked[1] : id));
  if (!entry) throw new Error("Export introuvable");
  const request: { file?: string; purpose?: string } = typeof linkedFile === "string" ? { file: linkedFile } : (linkedFile ?? {});
  let kind: "video" | "cover" | "subtitles" = linked ? (linked[2] as "cover" | "subtitles") : "video";
  if (request.purpose === "cover" || request.purpose === "subtitles") kind = request.purpose;
  else if (!linked && typeof request.file === "string" && request.file !== entry.file) {
    if (request.file === entry.cover?.file) kind = "cover";
    else if (request.file === entry.subtitles?.file) kind = "subtitles";
    else throw new Error("Fichier inconnu pour cet export");
  }
  const name = kind === "cover" ? entry.cover?.file : kind === "subtitles" ? entry.subtitles?.file : entry.file;
  if (!name) throw new Error(kind === "cover" ? "Cet export n'a pas de couverture" : "Cet export n'a pas de sous-titres");
  // Le fichier demandé doit être celui de l'export : une couverture remplacée entre-temps est refusée.
  if (request.purpose && typeof request.file === "string" && request.file !== name) throw new Error("Ce fichier n'est plus celui de l'export");
  const full = exportPath(name);
  if (!fs.existsSync(full)) throw new Error("Fichier exporté introuvable");
  return {
    path: full,
    file: name,
    bytes: fs.statSync(full).size,
    name: entry.projectName,
    width: kind === "cover" ? entry.cover!.width : entry.width,
    height: kind === "cover" ? entry.cover!.height : entry.height,
    durationMs: kind === "video" ? entry.durationMs : 0,
    // La vidéo garde le type déduit de son extension (MP4, WebM ou MOV selon le navigateur).
    ...(kind === "cover" ? { mimeType: "image/jpeg" } : kind === "subtitles" ? { mimeType: "application/x-subrip" } : {}),
  };
}

/**
 * Comptes capables de publier une vidéo (sans jeton) et descriptions
 * publiques de leurs services, avec les champs de publication à dessiner.
 */
export async function listPublishTargets(): Promise<{ accounts: AccountSummary[]; connectors: ConnectorInfo[]; queueScheduling: boolean }> {
  const accounts = listAccounts({ capability: "publish.video" });
  const used = new Set(accounts.map((account) => account.connector));
  // La file tient elle-même une date de publication, pour les services qui ne
  // programment pas : la fenêtre peut la proposer à tous.
  return { accounts, connectors: listConnectors().filter((connector) => used.has(connector.id)), queueScheduling: true };
}

/** Champs d'un service qui valent pour une vidéo. */
const videoFields = (connector: ConnectorInfo | undefined): PublishField[] =>
  (connector?.publishFields ?? []).filter((field) => !field.sourceKinds || field.sourceKinds.includes("video"));

/**
 * Met un export en file de publication, un travail par compte. Chaque cible
 * reçoit les textes de l'export résolus pour son service (variante, sinon
 * texte commun, règle des hashtags de la marque ou du service), calculés ici
 * et non dans le navigateur ; les options envoyées par l'écran les
 * surchargent. Premier commentaire, sous-titres et couverture partent en
 * suites de publication. Absente de `functions` dans module.json : réservée
 * aux administrateurs.
 */
export async function publishExport(input: {
  exportId: string;
  targets: PublishTarget[];
}): Promise<{ jobs: PublishJobSummary[]; failed: { accountId: string; error: string }[] }> {
  const exportId = String(input?.exportId ?? "");
  const file = await resolveExportFile(exportId);
  const entry = findExport(exportId);
  const targets = Array.isArray(input?.targets) ? input.targets.slice(0, 20) : [];
  if (targets.length === 0) throw new Error("Choisissez au moins un compte.");

  const project = readProject(entry.projectId);
  const brand = await loadExportBrand(entry.brandKitId ?? project?.brandKitId);
  // Un export d'avant les textes de publication reprend ceux de la marque.
  const post = entry.post ?? postForExport(entry, project, brand);
  const brandRules = brandHashtagRules(brand);
  const accounts = new Map(listAccounts({ capability: "publish.video" }).map((account) => [account.id, account]));
  const connectors = new Map(listConnectors().map((connector) => [connector.id, connector]));

  const seen = new Set<string>();
  const jobs: PublishJobSummary[] = [];
  const failed: { accountId: string; error: string }[] = [];
  for (const target of targets) {
    const accountId = String(target?.accountId ?? "");
    if (seen.has(accountId)) continue;
    seen.add(accountId);
    try {
      const connectorId = accounts.get(accountId)?.connector;
      const fields = videoFields(connectorId ? connectors.get(connectorId) : undefined);
      const rules = postRulesFor(connectorId ?? "", fields, connectorId ? brandRules[connectorId] : undefined, {
        hasCover: Boolean(entry.cover) && target?.followUps?.cover !== false,
        hasSubtitles: Boolean(entry.subtitles) && target?.followUps?.subtitles !== false,
      });
      const texts = resolvePostTexts(post, connectorId ?? "");
      const screen = target?.options && typeof target.options === "object" && !Array.isArray(target.options) ? target.options : {};
      const options = { ...fieldValuesFor(fields, texts, rules), ...screen };

      const wanted = target?.followUps ?? {};
      // Une couverture dont le fichier a disparu ne bloque pas la publication : elle part sans.
      const coverPath = entry.cover ? exportPath(entry.cover.file) : null;
      const coverBytes = coverPath && fs.existsSync(coverPath) ? fs.statSync(coverPath).size : 0;
      const comment = wanted.comment === false ? "" : typeof wanted.comment === "string" ? wanted.comment.trim().slice(0, 5000) : firstCommentFor(texts, rules);
      const followUps: PublishFollowUpsInput = {
        ...(comment ? { comment } : {}),
        ...(entry.subtitles && wanted.subtitles !== false ? { subtitles: { file: entry.subtitles.file, language: entry.subtitles.language } } : {}),
        ...(entry.cover && coverBytes > 0 && wanted.cover !== false
          ? {
              cover: {
                id: coverFileId(entry.id),
                file: entry.cover.file,
                mimeType: "image/jpeg",
                width: entry.cover.width,
                height: entry.cover.height,
                bytes: coverBytes,
              },
            }
          : {}),
      };
      const source: PublishSource = {
        module: "clip-studio",
        id: entry.id,
        file: file.file,
        bytes: file.bytes,
        kind: "video",
        name: file.name,
        width: file.width,
        height: file.height,
        durationMs: file.durationMs,
      };
      jobs.push(
        enqueuePublish({
          accountId,
          source,
          options,
          // Date tenue par la file ; elle borne et contrôle la valeur reçue.
          publishAt: typeof target?.publishAt === "number" ? target.publishAt : undefined,
          ...(Object.keys(followUps).length > 0 ? { followUps } : {}),
        })
      );
    } catch (error) {
      failed.push({ accountId, error: error instanceof Error ? error.message : "Publication impossible" });
    }
  }
  return { jobs, failed };
}

/** Publications d'un export, retrouvées dans la file par leur source (réservé aux administrateurs). */
export async function listExportPublications(id: string): Promise<PublishJobSummary[]> {
  const entry = findExport(id);
  return listJobs({ sourceModule: "clip-studio", sourceId: entry.id });
}

/** Suivi des travaux de publication lancés depuis Clip Studio (réservé aux administrateurs). */
export async function getPublishJobs(ids: string[]): Promise<PublishJobSummary[]> {
  const wanted = Array.isArray(ids) ? ids.slice(0, 50).map(String) : [];
  return listJobs({ ids: wanted }).filter((job) => job.source.module === "clip-studio");
}

// ─── Source pour la galerie ──────────────────────────────────────

/** Les clips exportés, proposés dans la fenêtre « Ajouter » de la galerie. */
export async function listGalleryItems(query: GallerySourceQuery = {}): Promise<GallerySourcePage> {
  const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
  const offset = Math.max(0, Math.floor(Number(query.offset) || 0));
  const limit = Math.min(Math.max(Math.floor(Number(query.limit) || 48), 1), 96);

  const items: GallerySourceItem[] = (await listExports())
    .filter((entry) => !search || entry.projectName.toLowerCase().includes(search))
    .map((entry) => ({
      id: entry.id,
      name: entry.projectName,
      kind: "video" as const,
      thumbnail: `/api/modules/clip-studio/data/exports/${encodeURIComponent(entry.file)}`,
      createdAt: entry.createdAt,
      caption: `${entry.width} × ${entry.height}`,
      durationMs: entry.durationMs,
      galleryFile: entry.galleryFile,
    }));
  return { items: items.slice(offset, offset + limit), total: items.length, hasMore: offset + limit < items.length };
}

/** Copie des clips dans la galerie. Un clip déjà copié n'est pas dupliqué. */
export async function importGalleryItems(ids: string[]): Promise<GallerySourceImport> {
  const result: GallerySourceImport = { saved: [], failed: [] };
  if (!Array.isArray(ids)) return result;
  for (const id of ids.slice(0, 20)) {
    try {
      const { fileName } = await sendExportToGallery(String(id));
      result.saved.push({ id: String(id), fileName });
    } catch (error) {
      result.failed.push({ id: String(id), error: error instanceof Error ? error.message : "Copie impossible" });
    }
  }
  return result;
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

/**
 * Fournisseurs de voix en ligne et état de leur clé. Absente de `functions`
 * dans module.json : réservée aux admins, comme `saveTtsKey`.
 */
export async function getTtsProviders(): Promise<ProviderStatus[]> {
  return providerStatuses();
}

/**
 * Enregistre (ou efface, avec une chaîne vide) la clé d'un fournisseur, la
 * région d'Azure, ou active les voix d'Edge. Seuls les champs présents
 * changent. Réservée aux admins, comme `getTtsProviders`.
 */
export async function saveTtsKey(input: { provider: string; key?: string; region?: string; enabled?: boolean }): Promise<ProviderStatus[]> {
  if (!isCloudProvider(input?.provider)) throw new Error("Fournisseur inconnu.");
  if (input.provider === "edge") {
    if (typeof input.enabled === "boolean") setEdgeEnabled(input.enabled);
    return providerStatuses();
  }
  if (input.provider === "azure" && typeof input.region === "string") saveAzureRegion(input.region);
  if (typeof input.key === "string" && isKeyProvider(input.provider)) saveProviderKey(input.provider, input.key);
  return providerStatuses();
}

/** Lit un texte et range le son parmi les médias du module. */
export async function speak(input: SpeakInput) {
  return synthesize(input);
}

/**
 * Extrait d'écoute d'une voix, synthétisé une fois puis gardé en cache dans
 * les données du module. Renvoie son adresse de lecture.
 */
export async function previewVoice(input: { voice: string; speed?: number; tone?: string; locale?: string }): Promise<{ url: string; cached: boolean }> {
  return voiceSample({ voice: String(input?.voice ?? ""), speed: input?.speed, tone: input?.tone, locale: input?.locale });
}

/**
 * Relit une voix de la timeline avec une autre voix, à partir de son texte
 * d'origine (gardé dans la fiche du son). Sert à changer la voix d'une piste.
 */
export async function respeakVoice(input: { ref?: string; text?: string; voice: string; speed?: number; tone?: string }) {
  return respeak({
    ref: typeof input?.ref === "string" ? input.ref : undefined,
    text: typeof input?.text === "string" ? input.text.slice(0, 2000) : undefined,
    voice: String(input?.voice ?? ""),
    speed: typeof input?.speed === "number" ? input.speed : undefined,
    tone: typeof input?.tone === "string" ? input.tone : undefined,
  });
}

// ─── Banque de musique ───────────────────────────────────────────

/** Morceaux de la banque, avec l'état de leur téléchargement. */
export async function getMusic(): Promise<MusicEntry[]> {
  return listMusic();
}

/** Relance le téléchargement d'un morceau (après un échec). */
export async function prepareMusic(id: string): Promise<{ success: boolean }> {
  void downloadTrack(String(id)).catch(() => undefined);
  return { success: true };
}

/** Recherche de morceaux libres (CC0, CC BY) dans Openverse. */
export async function searchMusic(input: { query: string; page?: number }): Promise<MusicCandidate[]> {
  return searchOpenverse(input);
}

export async function addMusicToLibrary(input: { id: string; mood?: string }): Promise<MusicEntry> {
  return addMusic(input);
}

export async function removeMusicFromLibrary(id: string): Promise<{ success: boolean }> {
  removeMusic(String(id));
  return { success: true };
}

// ─── Images trouvées (onglet « Trouver ») ────────────────────────

/**
 * Cherche des images libres dans Openverse (par page), ou sur le web par
 * Codex (droits à vérifier, de vingt à soixante secondes). Les candidates du
 * web sont déjà téléchargées et contrôlées par le serveur.
 */
export async function searchImages(input: { query: string; provider: "openverse" | "web"; page?: number; kind?: "illustration" | "icon" }): Promise<FoundImage[]> {
  return searchFoundImages({ query: String(input?.query ?? ""), provider: input?.provider, page: input?.page, kind: input?.kind === "icon" ? "icon" : undefined });
}

/**
 * Importe une candidate dans les médias du module, avec sa mention et
 * l'état de ses droits. Seul l'identifiant vient du navigateur, jamais une
 * adresse.
 */
export async function importFoundImage(input: { id: string }): Promise<ImportedImage> {
  return importFoundImageById(String(input?.id ?? ""));
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
  // Banque de musique : les morceaux manquants arrivent un par un.
  prefetchMusic();
  // Candidates du web plus vieilles que vingt-quatre heures, jamais importées.
  try {
    cleanFoundImages();
  } catch {
    // Un dossier illisible ne doit pas empêcher le module de démarrer.
  }
  return moduleHooks;
}

export default moduleHooks;
