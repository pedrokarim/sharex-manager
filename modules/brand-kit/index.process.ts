/**
 * Fonctions serveur d'Image de marque, appelables via `/api/modules/call-function`
 * (dossier 07). Le serveur range les fiches et leurs fichiers ; les formats
 * (bannière, avatar…) sont dessinés dans le navigateur par le moteur de Clip
 * Studio, puis déposés ici.
 */

import fs from "fs";
import path from "path";
import { ModuleHooks } from "@/types/modules";
import { listAccounts, listConnectors, setProfileImage, type PublishField, type WatermarkTiming } from "@/lib/connections";
import type { TextCount } from "@/lib/connections/types";
import { defaultHashtagRule } from "@/modules/clip-studio/lib/post-texts";
import type { HashtagRule } from "@/modules/clip-studio/lib/post-types";
import type { BrandKit, BrandTheme, KitSummary } from "./lib/types";
import { formatImageAsset } from "./lib/mascot";
import { ensureDirs, kitArea } from "./lib/server/store";
import {
  createKit as create,
  deleteKit as remove,
  exportKit as zipKit,
  getBrandTheme as theme,
  getWatermarkImage as watermark,
  importFont as addFont,
  importGalleryAsset as fromGallery,
  importKit as unzipKit,
  importSvgAsset as fromSvg,
  listFormatExports,
  listKits as list,
  readFontFile as fontFile,
  registerKitAsset as register,
  removeFont as dropFont,
  removeKitAsset as dropAsset,
  clearFormatImage as dropFormatImage,
  setFormatImageFrom as storeFormatImage,
  requireKit,
  saveFormatExport as saveFormat,
  saveKit as save,
  sendFormatToGallery as formatToGallery,
  setDefaultKit as makeDefault,
  type FormatExport,
} from "./lib/server/kits";
import {
  cancelKitAssistant,
  getKitAssistantJob as readAssistantJob,
  listKitAssistantJobs,
  regenerateAsset as redo,
  startKitAssistant as launchAssistant,
  type KitAssistantRequest,
} from "./lib/server/assistant";
import {
  acceptPoseCandidate as acceptPose,
  cancelPoseJob as cancelPoses,
  listPoseJobs as readPoseJobs,
  rejectPoseCandidate as rejectPose,
  startPoseGeneration as launchPoses,
} from "./lib/server/poses";

// ─── Fiches ──────────────────────────────────────────────────────

export async function listKits(): Promise<KitSummary[]> {
  return list();
}

export async function getKit(id: string): Promise<{ kit: BrandKit; exports: FormatExport[] }> {
  const kit = requireKit(id);
  return { kit, exports: listFormatExports(kit.id) };
}

export async function createKit(input: { name: string; from?: string }): Promise<BrandKit> {
  return create(input ?? {});
}

/** Enregistrement automatique ; refusé si la fiche a changé ailleurs depuis `expectedUpdatedAt`. */
export async function saveKit(kit: BrandKit, expectedUpdatedAt?: number): Promise<BrandKit> {
  return save(kit, expectedUpdatedAt);
}

export async function deleteKit(id: string): Promise<{ success: boolean }> {
  remove(id);
  return { success: true };
}

export async function setDefaultKit(id: string): Promise<KitSummary[]> {
  return makeDefault(id);
}

export async function getBrandTheme(id: string): Promise<BrandTheme> {
  return theme(id);
}

// ─── Images ──────────────────────────────────────────────────────

export async function registerKitAsset(kitId: string, input: { file: string; kind: string; label?: string }) {
  return register(kitId, input);
}

export async function importGalleryAsset(kitId: string, input: { name: string; kind: string }) {
  return fromGallery(kitId, input);
}

export async function importSvgAsset(kitId: string, input: { svg: string; kind: string; label?: string }) {
  return fromSvg(kitId, input);
}

export async function removeKitAsset(kitId: string, assetId: string): Promise<BrandKit> {
  return dropAsset(kitId, assetId);
}

// ─── Polices ─────────────────────────────────────────────────────

export async function importFont(kitId: string, input: { name?: string; data: Buffer | string }): Promise<BrandKit> {
  return addFont(kitId, input);
}

export async function readFontFile(kitId: string, fontId: string): Promise<string> {
  return fontFile(kitId, fontId);
}

export async function removeFont(kitId: string, fontId: string): Promise<BrandKit> {
  return dropFont(kitId, fontId);
}

// ─── Formats et archives ─────────────────────────────────────────

export async function saveFormatExport(kitId: string, format: string, png: Buffer): Promise<FormatExport> {
  return saveFormat(kitId, format, png);
}

export async function sendFormatToGallery(kitId: string, format: string) {
  return formatToGallery(kitId, format);
}

/** Image finie d'un format (déposée par la route d'upload, ou prise dans la galerie), qui remplace son rendu composé. */
export async function setFormatImage(kitId: string, format: string, input: { file?: string; gallery?: string }): Promise<BrandKit> {
  return storeFormatImage(kitId, format, input ?? {});
}

/** Le format revient à son rendu composé. */
export async function clearFormatImage(kitId: string, format: string): Promise<BrandKit> {
  return dropFormatImage(kitId, format);
}

export async function exportKit(kitId: string): Promise<{ fileName: string; data: string }> {
  const { fileName, data } = zipKit(kitId);
  // En base64 : `call-function` ne sérialise un Buffer que lorsqu'il est la réponse entière.
  return { fileName, data: data.toString("base64") };
}

export async function importKit(archive: Buffer): Promise<BrandKit> {
  return unzipKit(archive);
}

// ─── Assistant ───────────────────────────────────────────────────

export async function startKitAssistant(input: KitAssistantRequest) {
  return launchAssistant(input);
}

export async function cancelKitAssistantJob(id: string) {
  cancelKitAssistant(id);
  return { success: true };
}

export async function getKitAssistantJob(id: string) {
  return readAssistantJob(id);
}

export async function listAssistantJobs() {
  return listKitAssistantJobs();
}

export async function regenerateAsset(kitId: string, assetId: string, note?: string) {
  return redo(kitId, assetId, note);
}

// ─── Poses de la mascotte (07 sexies, D2) ────────────────────────

/** Génère des poses (émotion, geste, cadrage, côté) d'après la fiche de modèle ; chacune attend d'être acceptée. */
export async function startPoseGeneration(kitId: string, requests: unknown) {
  return launchPoses(kitId, requests);
}

export async function listPoseJobs(kitId: string) {
  return readPoseJobs(kitId);
}

export async function cancelPoseJob(jobId: string) {
  cancelPoses(jobId);
  return { success: true };
}

export async function acceptPoseCandidate(kitId: string, jobId: string, candidateId: string, tags?: unknown): Promise<BrandKit> {
  return acceptPose(kitId, jobId, candidateId, tags);
}

export async function rejectPoseCandidate(kitId: string, jobId: string, candidateId: string) {
  return rejectPose(kitId, jobId, candidateId);
}

// ─── Comptes connectés (cœur) ────────────────────────────────────

export interface PublishAccount {
  id: string;
  connector: string;
  connectorLabel: string;
  logo: string;
  name: string;
  label?: string;
  avatarUrl?: string;
  status: "connected" | "needs-reconnect";
}

/** Comptes capables de publier une vidéo, sans jeton : le choix des comptes liés d'une marque. */
export async function listPublishAccounts(): Promise<PublishAccount[]> {
  return listAccounts({ capability: "publish.video" }).map((account) => ({
    id: account.id,
    connector: account.connector,
    connectorLabel: account.connectorLabel,
    logo: account.logo,
    name: account.name,
    label: account.label,
    avatarUrl: account.avatarUrl,
    status: account.status,
  }));
}

export interface PublishService {
  id: string;
  label: string;
  logo: string;
  fields: PublishField[];
  defaultHashtagRule: HashtagRule;
  comment?: { maxLength: number; count?: TextCount };
}

/**
 * Services prêts à publier une vidéo, avec leurs champs : les onglets « par
 * service » des textes de publication. Un service prévu mais pas encore
 * branché n'y figure pas.
 */
export async function listPublishServices(): Promise<PublishService[]> {
  return listConnectors()
    .filter((connector) => connector.status === "ready" && connector.capabilities.includes("publish.video"))
    .map((connector) => {
      const fields = connector.publishFields.filter((field) => !field.sourceKinds || field.sourceKinds.includes("video"));
      const comment = connector.followUps?.comment;
      return {
        id: connector.id,
        label: connector.label,
        logo: connector.logo,
        fields,
        defaultHashtagRule: defaultHashtagRule(fields),
        ...(comment ? { comment: { maxLength: comment.maxLength, ...(comment.count ? { count: comment.count } : {}) } } : {}),
      };
    });
}

/**
 * Envoie la bannière ou le filigrane exportés par l'éditeur
 * (`kits/<id>/exports/banner.png` ou `watermark.png`) à un compte qui a la
 * capacité voulue. Absente de `functions` : réservée aux administrateurs.
 */
export async function pushBrandToAccount(input: { kitId: string; accountId: string; what: "banner" | "watermark" }): Promise<{ success: boolean }> {
  const kit = requireKit(input?.kitId);
  const what = input?.what;
  if (what !== "banner" && what !== "watermark") throw new Error("Format inconnu");
  // Une image finie importée pour ce format part telle quelle ; sinon, l'export rendu depuis la marque.
  const supplied = formatImageAsset(kit, what);
  const file = supplied ? path.join(kitArea(kit.id, "assets"), supplied.file) : path.join(kitArea(kit.id, "exports"), `${what}.png`);
  if (!fs.existsSync(file)) {
    throw new Error(
      what === "banner"
        ? "Exportez d’abord la bannière depuis l’éditeur de la marque (« Exporter les formats en PNG »)."
        : "Exportez d’abord le filigrane depuis l’éditeur de la marque (« Exporter les formats en PNG »)."
    );
  }
  // Le filigrane de la chaîne apparaît au même moment que celui des vidéos de la marque.
  const timing: WatermarkTiming | undefined =
    what === "watermark" && kit.watermark ? { type: "offsetFromStart", offsetMs: Math.max(0, Math.round(kit.watermark.startSeconds * 1000)) } : undefined;
  await setProfileImage(String(input.accountId), what, fs.readFileSync(file), timing);
  return { success: true };
}

// ─── Pour les autres modules (serveur seulement) ─────────────────

/** Logo du filigrane d'une marque, pour le module `watermark`. Déclarée `public` : jamais appelable par le navigateur. */
export async function getWatermarkImage(kitId: string) {
  return watermark(kitId);
}

// ─── Cycle de vie ────────────────────────────────────────────────

const moduleHooks: ModuleHooks = {
  onInit: () => ensureDirs(),
};

export function initModule() {
  ensureDirs();
  return moduleHooks;
}

export default moduleHooks;
