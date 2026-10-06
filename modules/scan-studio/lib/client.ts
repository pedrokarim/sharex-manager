"use client";

/**
 * Accès aux fonctions serveur du module, côté navigateur.
 *
 * `api` est le contrat entre l'interface et `index.process.ts` : chaque entrée
 * correspond à une fonction exportée par le serveur, avec la même signature.
 */

import type {
  ChapterSettings,
  ChapterView,
  EngineCatalogue,
  EngineSettingsPatch,
  LinkImportJob,
  LinkPreview,
  SourceStatus,
  TranslationBatch,
  TranslationEngineId,
  TranslationEstimate,
  TranslationItem,
  FolderSummary,
  FolderView,
  GlossaryEntry,
  PageStatus,
  PageSummary,
  PageView,
  ScanChapter,
  ScanFolder,
  ScanRegion,
  UploadedFile,
  DetectorChoice,
  DetectorStatus,
  DetectorVariantId,
} from "./types";
import type { ChapterSharing, ChapterVisibility } from "./types";
import type { AiCatalogue, AiPageVersion, AiReadingProposal, AiSettingsPatch, AiTranslationProposal, CustomFont, FontUsage } from "./types";
import { MODULE_NAME } from "./types";

export { MODULE_NAME };
export const MODULE_PATH = `/m/${MODULE_NAME}`;

/** Les fonctions du module répondent `{ success, data, error }` : on lève sur échec. */
export async function callModule<T = unknown>(functionName: string, ...args: unknown[]): Promise<T> {
  const response = await fetch("/api/modules/call-function", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleName: MODULE_NAME, functionName, args }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Échec de ${functionName} (HTTP ${response.status})`);
  }
  return payload?.data as T;
}

export const api = {
  // Dossiers
  listFolders: () => callModule<FolderSummary[]>("listFolders"),
  getFolder: (folderId: string) => callModule<FolderView>("getFolder", folderId),
  createFolder: (input: { name: string }) => callModule<ScanFolder>("createFolder", input),
  updateFolder: (
    folderId: string,
    patch: { name?: string; defaults?: ChapterSettings; glossary?: GlossaryEntry[]; defaultVisibility?: ChapterVisibility }
  ) => callModule<ScanFolder>("updateFolder", folderId, patch),
  deleteFolder: (folderId: string) => callModule<{ deleted: boolean }>("deleteFolder", folderId),

  // Chapitres
  getChapter: (chapterId: string) => callModule<ChapterView>("getChapter", chapterId),
  createChapter: (folderId: string, input: { number: string; title?: string }) =>
    callModule<ScanChapter>("createChapter", folderId, input),
  updateChapter: (chapterId: string, patch: { number?: string; title?: string; settings?: ChapterSettings }) =>
    callModule<ScanChapter>("updateChapter", chapterId, patch),
  deleteChapter: (chapterId: string) => callModule<{ deleted: boolean }>("deleteChapter", chapterId),
  reorderChapters: (folderId: string, chapterIds: string[]) => callModule<ScanFolder>("reorderChapters", folderId, chapterIds),

  // Pages
  /** Rattache des images déjà déposées (voir `uploadImage`) ; elles se rangent dans l'ordre naturel de leurs noms. */
  importPages: (chapterId: string, files: UploadedFile[]) => callModule<PageSummary[]>("importPages", chapterId, files),
  discardUploads: (files: UploadedFile[]) => callModule<{ discarded: number }>("discardUploads", files),
  /** Copie des fichiers de la galerie dans le chapitre. */
  importGalleryFiles: (chapterId: string, fileNames: string[]) => callModule<PageSummary[]>("importGalleryFiles", chapterId, fileNames),
  reorderPages: (chapterId: string, pageIds: string[]) => callModule<ScanChapter>("reorderPages", chapterId, pageIds),
  deletePage: (pageId: string) => callModule<{ deleted: boolean }>("deletePage", pageId),
  /** Marque une page « à laisser telle quelle » (couverture, bannière), ou lève cette marque. */
  setPageSkipped: (pageId: string, skipped: boolean) => callModule<PageSummary>("setPageSkipped", pageId, skipped),
  getPage: (pageId: string) => callModule<PageView>("getPage", pageId),
  /**
   * Enregistre les zones d'une page. `revision` est celle qu'on a lue : si la
   * page a changé entre-temps, le serveur refuse au lieu d'écraser.
   */
  savePage: (pageId: string, input: { regions: ScanRegion[]; status?: PageStatus; revision: number }) =>
    callModule<{ revision: number; updatedAt: number }>("savePage", pageId, input),

  // Export
  /** Déclare le rendu d'une page, déjà déposé par `uploadImage`. */
  registerExport: (pageId: string, file: string) => callModule<PageSummary>("registerExport", pageId, file),
  /** Copie les pages d'un chapitre dans la galerie, dans l'ordre de lecture, réunies dans un album privé. */
  sendChapterToGallery: (chapterId: string) => callModule<{ saved: number; albumId?: number }>("sendChapterToGallery", chapterId),

  // Lecture publique (§ 11.2 du dossier)
  /** Change la visibilité d'un chapitre : privé, public par son lien, listé au catalogue. */
  setChapterVisibility: (chapterId: string, visibility: ChapterVisibility) =>
    callModule<ChapterSharing>("setChapterVisibility", chapterId, visibility),

  // Traduction (§ 7.5 du dossier). Le serveur ne touche pas aux pages : il rend
  // des textes, que l'interface pose dans les zones avant d'enregistrer la page.
  /**
   * Traduit les phrases d'une page en un seul appel : glossaire, mémoire et
   * cache d'abord, puis le moteur principal, puis le secours. `force` ignore le
   * cache pour redemander une traduction ; `engine` impose un moteur.
   */
  translateTexts: (chapterId: string, items: TranslationItem[], options?: { engine?: TranslationEngineId; force?: boolean }) =>
    callModule<TranslationBatch>("translateTexts", chapterId, items, options),
  /** Ce qu'un lot coûterait, sans rien envoyer. */
  estimateTranslation: (chapterId: string, texts: string[]) => callModule<TranslationEstimate>("estimateTranslation", chapterId, texts),
  /** État des moteurs : configuration, consommation, mise à l'écart. */
  getEngines: () => callModule<EngineCatalogue>("getEngines"),
  /** Réservé aux administrateurs. */
  saveEngineSettings: (patch: EngineSettingsPatch) => callModule<EngineCatalogue>("saveEngineSettings", patch),
  /** Réservé aux administrateurs : une courte traduction d'essai. */
  testEngine: (engine: TranslationEngineId) => callModule<{ ok: boolean; message: string }>("testEngine", engine),
  getDetector: () => callModule<DetectorStatus>("getDetector"),
  /** Réservé aux administrateurs : la variante en service, ou « off ». */
  setDetectorChoice: (choice: DetectorChoice) => callModule<DetectorStatus>("setDetectorChoice", choice),
  /** Réservé aux administrateurs : télécharge le modèle d'une variante sur le serveur. */
  downloadDetector: (variant: DetectorVariantId) => callModule<DetectorStatus>("downloadDetector", variant),
  /** Réservé aux administrateurs : efface le modèle d'une variante. */
  removeDetector: (variant: DetectorVariantId) => callModule<DetectorStatus>("removeDetector", variant),
  /** Réservé aux administrateurs : la consommation du compte, lue chez le service en une requête. */
  readEngineUsage: (engine: TranslationEngineId) => callModule<{ ok: boolean; message: string; used?: number; limit?: number }>("readEngineUsage", engine),

  // Sources : import d'un chapitre par son lien. Le site est reconnu d'après le
  // lien ; chaque site a son adaptateur.
  /** Les adaptateurs connus, activés ou non. */
  listSources: () => callModule<SourceStatus[]>("listSources"),
  /** Réservé aux administrateurs : active ou désactive un adaptateur. */
  setSourceEnabled: (sourceId: string, enabled: boolean) => callModule<SourceStatus>("setSourceEnabled", sourceId, enabled),
  /** Réservé aux administrateurs : récupère de nouveau l'icône du site. */
  refreshSourceIcon: (sourceId: string) => callModule<SourceStatus>("refreshSourceIcon", sourceId),
  /** Reconnaît le site d'un lien et lit ce qu'il désigne, sans rien télécharger. */
  previewLink: (url: string) => callModule<LinkPreview>("previewLink", url),
  /** Lance la récupération des pages d'un lien dans un chapitre existant. Rend tout de suite : l'import se suit avec `getLinkImport`. */
  importFromLink: (chapterId: string, url: string) => callModule<LinkImportJob>("importFromLink", chapterId, url),
  /**
   * Un lien suffit : le chapitre est rangé dans le dossier de sa série, créés
   * l'un et l'autre s'ils n'existent pas, puis ses pages sont récupérées.
   */
  importLinkToLibrary: (url: string) =>
    callModule<LinkImportJob & { folderId?: string; created?: { folder: boolean; chapter: boolean } }>("importLinkToLibrary", url),
  getLinkImport: (jobId: string) => callModule<LinkImportJob>("getLinkImport", jobId),
  cancelLinkImport: (jobId: string) => callModule<LinkImportJob>("cancelLinkImport", jobId),

  // Polices ajoutées (§ 8 du dossier)
  listFonts: () => callModule<CustomFont[]>("listFonts"),
  /** Contenu d'une police, en base64 : elle n'a pas d'adresse, elle ne sort que par cette fonction. */
  getFontFile: (fontId: string) => callModule<string>("getFontFile", fontId),
  getFontUsage: (fontId: string) => callModule<FontUsage>("getFontUsage", fontId),
  /** Réservé aux administrateurs. `data` est le contenu du fichier, en base64. */
  addFont: (data: string, name?: string) => callModule<CustomFont>("addFont", { type: "buffer", data }, name),
  /** Réservé aux administrateurs. */
  renameFont: (fontId: string, name: string) => callModule<CustomFont>("renameFont", fontId, name),
  /** Réservé aux administrateurs. `replaceWith` : la police que prendront les pages qui portaient celle-ci. */
  removeFont: (fontId: string, options?: { replaceWith?: string }) =>
    callModule<{ removed: boolean; replaced: FontUsage }>("removeFont", fontId, options),

  // IA en dernier recours (niveau 3). Un appel par clic : le serveur ne retente rien et tient le plafond mensuel.
  getAiCatalogue: (chapterId: string) => callModule<AiCatalogue>("getAiCatalogue", chapterId),
  getAiUsage: () => callModule<{ month: number; monthlyLimit: number }>("getAiUsage"),
  /** Réservé aux administrateurs. */
  saveAiSettings: (patch: AiSettingsPatch) => callModule<{ month: number; monthlyLimit: number }>("saveAiSettings", patch),
  askAiReading: (pageId: string, regionId: string, options?: { model?: string }) =>
    callModule<AiReadingProposal>("askAiReading", pageId, regionId, options),
  askAiTranslation: (pageId: string, regionIds: string[], options?: { model?: string }) =>
    callModule<AiTranslationProposal>("askAiTranslation", pageId, regionIds, options),
  askAiPage: (pageId: string, options?: { model?: string }) => callModule<AiPageVersion>("askAiPage", pageId, options),
  listAiPageVersions: (pageId: string) => callModule<AiPageVersion[]>("listAiPageVersions", pageId),
  deleteAiPageVersion: (pageId: string, versionId: string) => callModule<{ deleted: boolean }>("deleteAiPageVersion", pageId, versionId),
};

/** Dépose une image dans les données du module et rend son nom de fichier. */
export async function uploadImage(blob: Blob, name: string): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", blob, name);
  const response = await fetch(`/api/modules/${MODULE_NAME}/upload`, { method: "POST", body: form });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.file) {
    throw new Error(payload?.error || `Envoi de « ${name} » impossible (HTTP ${response.status})`);
  }
  return { file: payload.file as string, name };
}

/** Identifiant de 12 caractères, compatible avec `isId`. */
export function newId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}
