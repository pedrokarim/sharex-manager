/**
 * Petites fonctions pures de la bibliothèque (dossiers, chapitres, pages) :
 * adresses, libellés, tri naturel, avancement, file d'envoi bornée.
 *
 * Rien ici ne dépend de React ni du navigateur.
 */

import {
  MODULE_NAME,
  type AutomationLevel,
  type ChapterSettings,
  type ChapterVisibility,
  type LinkImportJob,
  type LinkPreview,
  type PageStatus,
  type ReadingFormat,
  type SourceErrorKind,
  type SourceLanguage,
} from "./types";

// ─── Adresses ────────────────────────────────────────────────────

export const LIBRARY_PATH = `/m/${MODULE_NAME}`;

export function folderHref(folderId: string): string {
  return `${LIBRARY_PATH}/folder?id=${folderId}`;
}

export function chapterHref(chapterId: string): string {
  return `${LIBRARY_PATH}/chapter?id=${chapterId}`;
}

export function editorHref(pageId: string): string {
  return `${LIBRARY_PATH}/edit?page=${pageId}`;
}

/** Page « Moteurs » : état et réglages des moteurs de traduction. */
export const ENGINES_PATH = `${LIBRARY_PATH}/engines`;

/** Page « Sources » : les sites dont un lien de chapitre peut être importé. */
export const SOURCES_PATH = `${LIBRARY_PATH}/sources`;

/** Page « Polices » : les polices de lettrage ajoutées. */
export { FONTS_PATH } from "./font-paths";

// ─── Sources ─────────────────────────────────────────────────────

/**
 * Première phrase du message de chaque erreur de source. Le serveur commence
 * toujours son message par elle (`SourceError`), puis donne le détail : une
 * fonction de module ne rend au navigateur que le texte de l'erreur, et c'est
 * à cette phrase que l'interface reconnaît le cas (`sourceErrorKindOf`).
 */
export const SOURCE_ERROR_LEADS: Record<SourceErrorKind, string> = {
  unsupported: "Site non géré.",
  "not-a-chapter": "Ce lien n’est pas celui d’un chapitre.",
  disabled: "Source désactivée.",
  "not-found": "Chapitre introuvable chez le site.",
  unavailable: "Chapitre non lisible ici.",
  "rate-limited": "Le site demande d’attendre.",
  "site-error": "Le site ne répond pas correctement.",
  "adapter-outdated": "Adaptateur à mettre à jour.",
};

/** Le cas d'erreur que désigne un message rendu par le serveur ; `null` pour toute autre erreur. */
export function sourceErrorKindOf(message: string): SourceErrorKind | null {
  for (const kind of Object.keys(SOURCE_ERROR_LEADS) as SourceErrorKind[]) {
    if (message.startsWith(SOURCE_ERROR_LEADS[kind])) return kind;
  }
  return null;
}

/** Ce qui suit la première phrase d'un message d'erreur de source. */
export function sourceErrorDetail(message: string): string {
  const kind = sourceErrorKindOf(message);
  return kind ? message.slice(SOURCE_ERROR_LEADS[kind].length).trim() : message;
}

/**
 * Un import par lien tel que le serveur le rend : le travail, et ce que le
 * site dit du chapitre une fois le lien lu. Rien de cela n'est écrit dans le
 * chapitre : l'interface propose de reprendre le titre ou le numéro.
 */
export interface LinkImportReport extends LinkImportJob {
  preview?: LinkPreview;
  /** Dossier du chapitre d'accueil, quand l'import a rangé le chapitre lui-même. */
  folderId?: string;
  /** Ce que l'import a créé pour ranger le chapitre : rien si tout existait déjà. */
  created?: { folder: boolean; chapter: boolean };
}

// ─── Nombres ─────────────────────────────────────────────────────

/** « 18 400 » : séparateur de milliers français. */
export function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR");
}

/** « 18 400 caractères », « 1 caractère ». */
export function charactersLabel(count: number): string {
  return `${formatNumber(count)} ${count < 2 ? "caractère" : "caractères"}`;
}

// ─── Fichiers ────────────────────────────────────────────────────

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
export const ARCHIVE_EXTENSIONS = ["zip", "cbz"];
/** Plafond de la route d'envoi du module (`uploads.maxMb`). */
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
/** Valeur de l'attribut `accept` du bouton d'import. */
export const IMPORT_ACCEPT = ".png,.jpg,.jpeg,.webp,.zip,.cbz";
/** Images rattachées à un chapitre en un appel : la borne du serveur (`MAX_IMPORT_FILES`). */
export const IMPORT_BATCH_SIZE = 300;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isImageName(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(name));
}

export function isArchiveName(name: string): boolean {
  return ARCHIVE_EXTENSIONS.includes(extensionOf(name));
}

export function imageMimeOf(name: string): string {
  const extension = extensionOf(name);
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

/** Ordre naturel des noms : `2.png` avant `10.png`. */
export function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

// ─── Listes ──────────────────────────────────────────────────────

/** Copie de la liste où l'élément `from` a été déplacé à la place `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/** Découpe une liste en paquets d'au plus `size` éléments, sans changer l'ordre. */
export function chunkList<T>(items: T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += step) chunks.push(items.slice(start, start + step));
  return chunks;
}

export function sameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Range des objets dans l'ordre d'une liste d'identifiants ; les inconnus vont à la fin. */
export function orderByIds<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort((left, right) => (rank.get(left.id) ?? ids.length) - (rank.get(right.id) ?? ids.length));
}

/**
 * Applique `worker` à chaque élément, avec au plus `limit` appels en cours.
 * Un appel qui échoue n'arrête pas les autres : au `worker` de noter l'échec.
 */
export async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const lane = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
}

// ─── Libellés ────────────────────────────────────────────────────

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** « 1 page », « 3 pages » : en français, zéro et un sont au singulier. */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count < 2 ? singular : plural}`;
}

/** « Chapitre 12 » pour un numéro, le texte tel quel pour « Extra ». */
export function chapterLabel(chapter: { number: string }): string {
  const number = chapter.number.trim();
  return /^\d/.test(number) ? `Chapitre ${number}` : number || "Chapitre";
}

/** Le numéro qui suit le plus grand numéro déjà pris. */
export function suggestNextNumber(numbers: string[]): string {
  let highest = 0;
  for (const number of numbers) {
    const value = Number.parseFloat(number.replace(",", "."));
    if (Number.isFinite(value)) highest = Math.max(highest, Math.floor(value));
  }
  return String(highest + 1);
}

// ─── Lecture publique ────────────────────────────────────────────

/** Les trois visibilités d'un chapitre, avec les mots des albums. */
export const VISIBILITY_OPTIONS: { value: ChapterVisibility; label: string; description: string }[] = [
  { value: "private", label: "Privé", description: "Vous seul le voyez, connecté. Aucune adresse publique n’existe." },
  {
    value: "link",
    label: "Public par son lien",
    description: "Lisible sans compte par qui a l’adresse. Absent du catalogue, et non proposé aux moteurs de recherche.",
  },
  { value: "catalog", label: "Listé au catalogue", description: "Lisible sans compte, et visible dans la rubrique « Scans » du catalogue public." },
];

export function visibilityLabel(visibility: ChapterVisibility | undefined): string {
  return VISIBILITY_OPTIONS.find((option) => option.value === (visibility ?? "private"))?.label ?? "Privé";
}

// ─── Archives .cbz ───────────────────────────────────────────────

/** Nom d'une page dans une archive : `007.png`, assez de zéros pour que tous les lecteurs gardent l'ordre. */
export function archivePageName(index: number, total: number, extension: string): string {
  const width = Math.max(3, String(Math.max(total, 1)).length);
  const clean = extension.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  return `${String(index + 1).padStart(width, "0")}.${clean === "jpeg" ? "jpg" : clean}`;
}

/** Morceau de nom de fichier sûr partout : ni séparateur, ni caractère réservé, ni point final. */
function fileNamePart(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
}

/** « Série - Chapitre 012.cbz » : le numéro est complété de zéros pour que les archives se rangent dans l'ordre. */
export function archiveFileName(folderName: string, chapter: { number: string; title?: string }): string {
  const number = chapter.number.trim();
  const padded = number.replace(/^\d+/, (digits) => digits.padStart(3, "0"));
  const label = /^\d/.test(number) ? `Chapitre ${padded}` : number || "Chapitre";
  const name = [fileNamePart(folderName), fileNamePart(label)].filter(Boolean).join(" - ");
  return `${name || "Chapitre"}.cbz`;
}

// ─── Avancement ──────────────────────────────────────────────────

export const PAGE_STATUS_ORDER: PageStatus[] = ["imported", "analyzed", "translated", "reviewed", "exported"];

export const PAGE_STATUS_LABELS: Record<PageStatus, string> = {
  imported: "Importée",
  analyzed: "Analysée",
  translated: "Traduite",
  reviewed: "Relue",
  exported: "Exportée",
};

const PROGRESS_WORDS: Record<Exclude<PageStatus, "imported">, [string, string]> = {
  analyzed: ["analysée", "analysées"],
  translated: ["traduite", "traduites"],
  reviewed: ["relue", "relues"],
  exported: ["exportée", "exportées"],
};

/** Part du chemin parcourue par un chapitre, de 0 à 1 : chaque état vaut un quart de plus. */
export function progressRatio(progress: Record<PageStatus, number>, pageCount: number): number {
  if (pageCount <= 0) return 0;
  const steps = PAGE_STATUS_ORDER.length - 1;
  const done = PAGE_STATUS_ORDER.reduce((sum, status, rank) => sum + (progress[status] ?? 0) * rank, 0);
  return Math.max(0, Math.min(1, done / (steps * pageCount)));
}

/** « 3 analysées, 2 traduites » : seuls les états atteints sont cités. */
export function progressSummary(progress: Record<PageStatus, number>, pageCount: number): string {
  if (pageCount <= 0) return "Aucune page";
  const parts: string[] = [];
  for (const status of PAGE_STATUS_ORDER) {
    if (status === "imported") continue;
    const count = progress[status] ?? 0;
    if (count > 0) parts.push(countLabel(count, ...PROGRESS_WORDS[status]));
  }
  return parts.length > 0 ? parts.join(", ") : "Rien de commencé";
}

// ─── Réglages ────────────────────────────────────────────────────

export const SOURCE_LANGUAGES: { value: SourceLanguage; label: string }[] = [
  { value: "en", label: "Anglais" },
  { value: "ja", label: "Japonais" },
  { value: "zh-Hans", label: "Chinois simplifié" },
  { value: "zh-Hant", label: "Chinois traditionnel" },
  { value: "ko", label: "Coréen" },
  { value: "auto", label: "Détection automatique" },
];

export const TARGET_LANGUAGES: { value: string; label: string }[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "es", label: "Espagnol" },
  { value: "de", label: "Allemand" },
  { value: "it", label: "Italien" },
  { value: "pt", label: "Portugais" },
  { value: "nl", label: "Néerlandais" },
  { value: "pl", label: "Polonais" },
  { value: "ru", label: "Russe" },
  { value: "ar", label: "Arabe" },
];

export const READING_FORMATS: { value: ReadingFormat; label: string; description: string }[] = [
  { value: "manga", label: "Manga", description: "Pages et bulles lues de droite à gauche, de haut en bas." },
  { value: "manhua", label: "Manhua", description: "Pages et bulles lues de gauche à droite, de haut en bas." },
  { value: "webtoon", label: "Webtoon", description: "Une bande verticale qui défile, lue de haut en bas." },
];

/** L'échelle de recours du dossier de conception (§ 3), une ligne par niveau. */
export const AUTOMATION_LEVELS: { value: AutomationLevel; label: string; description: string }[] = [
  {
    value: 0,
    label: "À la main",
    description: "Vous tracez les zones, tapez ou collez le texte et la traduction. Un simple atelier de lettrage.",
  },
  {
    value: 1,
    label: "Moteurs locaux",
    description: "De petits modèles repèrent les zones et lisent les caractères. Rien ne sort de la machine.",
  },
  {
    value: 2,
    label: "Traduction automatique",
    description: "Un service de traduction (DeepL, Google Traduction ou LibreTranslate) reçoit le texte et rend du texte.",
  },
  {
    value: 3,
    label: "IA générative",
    description: "Un modèle de langage ou d’image relit une zone, traduit avec le contexte ou retouche la page, toujours d’un bouton.",
  },
];

export function languageLabel(code: string): string {
  const known = SOURCE_LANGUAGES.find((entry) => entry.value === code) ?? TARGET_LANGUAGES.find((entry) => entry.value === code);
  return known ? known.label : code;
}

/** « anglais → français, manga » : les réglages en une ligne. */
export function settingsSummary(settings: ChapterSettings): string {
  const format = READING_FORMATS.find((entry) => entry.value === settings.format)?.label ?? settings.format;
  return `${languageLabel(settings.sourceLanguage).toLowerCase()} → ${languageLabel(settings.targetLanguage).toLowerCase()}, ${format.toLowerCase()}`;
}
