/**
 * Modèle de données de Scan Studio, partagé par le serveur et le navigateur.
 *
 * Ce fichier ne dépend de rien : ni de Node, ni de React. Le dossier de
 * conception (`docs/modules/06-scan-studio.md`) en explique les choix.
 *
 * Une bibliothèque a trois étages : dossier (une série), chapitre, page. Une
 * page porte ses zones de texte ; chaque zone est faite de trois objets
 * distincts : le contour du texte d'origine, le masque qui le recouvre et le
 * bloc de texte traduit, librement déplaçable.
 */

export const MODULE_NAME = "scan-studio";

// ─── Réglages ────────────────────────────────────────────────────

export type SourceLanguage = "en" | "ja" | "zh-Hans" | "zh-Hant" | "ko" | "auto";
export type ReadingFormat = "manga" | "manhua" | "webtoon";
/** 0 à la main, 1 moteurs locaux, 2 traduction automatique, 3 IA générative. */
export type AutomationLevel = 0 | 1 | 2 | 3;

export type RegionKind = "dialogue" | "thought" | "narration" | "sfx" | "background";

export const REGION_KINDS: RegionKind[] = ["dialogue", "thought", "narration", "sfx", "background"];

export interface TextStyle {
  /** Famille de police, telle que déclarée dans `lib/fonts.ts`. */
  font: string;
  /** Taille en pixels de la page, à l'échelle 1. */
  size: number;
  weight: number;
  italic: boolean;
  uppercase: boolean;
  color: string;
  /** Contour du texte, pour le poser sur un décor. */
  stroke?: { color: string; width: number };
  /** Interligne, en multiple de la taille. */
  lineHeight: number;
  align: "left" | "center" | "right";
}

export interface ChapterSettings {
  sourceLanguage: SourceLanguage;
  /** Code de langue cible : « fr », « en », « es »… */
  targetLanguage: string;
  format: ReadingFormat;
  maxLevel: AutomationLevel;
  /** Style par type de zone ; une zone peut le surcharger. */
  styles: Record<RegionKind, TextStyle>;
}

export interface GlossaryEntry {
  source: string;
  target: string;
  /** Nom propre : jamais traduit, seulement transcrit. */
  keep?: boolean;
  note?: string;
}

// ─── Bibliothèque ────────────────────────────────────────────────

export interface ScanFolder {
  id: string;
  name: string;
  /**
   * Couverture de la série, dans `data/assets/` : celle que le site d'origine
   * donne à la série lors d'un import par lien. Absente, la bibliothèque
   * illustre le dossier par la première page de son dernier chapitre.
   */
  cover?: { file: string };
  /** Réglages proposés à chaque nouveau chapitre du dossier. */
  defaults: ChapterSettings;
  glossary: GlossaryEntry[];
  /** Identifiants des chapitres, dans l'ordre d'affichage. */
  chapterIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ScanChapter {
  id: string;
  folderId: string;
  /** Numéro libre : « 12 », « 12.5 », « Extra ». */
  number: string;
  title?: string;
  settings: ChapterSettings;
  /** Identifiants des pages, dans l'ordre de lecture. */
  pageIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type PageStatus = "imported" | "analyzed" | "translated" | "reviewed" | "exported";

export interface ScanPage {
  id: string;
  chapterId: string;
  /** Nom du fichier d'origine, tel que déposé. */
  name: string;
  /** Fichier d'origine, dans `data/assets/`. Jamais modifié. */
  source: { file: string; width: number; height: number };
  regions: ScanRegion[];
  /**
   * Page à laisser telle quelle : couverture, bannière, page de crédits.
   * L'analyse et la traduction l'ignorent, et elle sort à l'export sans
   * retouche, à sa place dans le chapitre.
   */
  skipped?: boolean;
  /** Dernier export de la page, dans `data/assets/`. */
  exported?: { file: string; at: number };
  status: PageStatus;
  /** Incrémenté à chaque enregistrement : détecte deux éditions concurrentes. */
  revision: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Zones ───────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

/** Trait de pinceau du masque, en pixels de la page. */
export interface BrushStroke {
  points: Point[];
  width: number;
  color: string;
}

export type MaskShape = "rect" | "rounded" | "ellipse" | "outline";

export interface RegionMask {
  /** `fill` : aplat ; `none` : rien n'est caché. */
  kind: "fill" | "none";
  shape: MaskShape;
  color: string;
  /** Marge ajoutée autour du contour, en pixels. Peut être négative. */
  grow: number;
  strokes: BrushStroke[];
}

export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation autour du centre, en degrés. */
  rotation: number;
}

export interface RegionReading {
  /** Texte tel que lu sur la page. */
  raw: string;
  /** Texte nettoyé, prêt à traduire. */
  clean: string;
  /** Confiance de la lecture, de 0 à 1 ; 1 pour une saisie à la main. */
  confidence: number;
  /** « manual » ou l'identifiant du moteur de lecture. */
  engine: string;
  /** Corrigé à la main : une relance ne l'écrase pas. */
  edited: boolean;
}

export type TranslationStatus = "todo" | "proposed" | "edited" | "approved";

export interface RegionTranslation {
  text: string;
  status: TranslationStatus;
  /** « manual » ou l'identifiant du moteur qui a traduit. */
  engine?: string;
  history: { text: string; engine: string; at: number }[];
}

export interface ScanRegion {
  id: string;
  kind: RegionKind;
  /** Contour du texte d'origine, en pixels de la page. Au moins trois points. */
  outline: Point[];
  direction: "horizontal" | "vertical";
  reading: RegionReading;
  translation: RegionTranslation;
  mask: RegionMask;
  text: {
    /** Boîte du texte traduit : libre, distincte du contour d'origine. */
    box: TextBox;
    /** `null` : le style du type de zone s'applique tel quel. */
    style: Partial<TextStyle> | null;
    /** La taille du texte s'ajuste à la boîte. */
    autoFit: boolean;
  };
}

// ─── Vues renvoyées par le serveur ───────────────────────────────

export interface FolderSummary {
  id: string;
  name: string;
  chapterCount: number;
  pageCount: number;
  /** Vignette de la première page du dernier chapitre. */
  cover?: string;
  updatedAt: number;
}

export interface ChapterSummary {
  id: string;
  folderId: string;
  number: string;
  title?: string;
  pageCount: number;
  /** Nombre de pages par état, pour l'avancement. */
  progress: Record<PageStatus, number>;
  cover?: string;
  updatedAt: number;
}

export interface PageSummary {
  id: string;
  chapterId: string;
  name: string;
  width: number;
  height: number;
  status: PageStatus;
  /** Page à laisser telle quelle (voir `ScanPage.skipped`). */
  skipped: boolean;
  regionCount: number;
  /** Adresses servies avec la session : l'image d'origine, sa vignette, le dernier export. */
  imageUrl: string;
  thumbUrl: string;
  exportUrl?: string;
  updatedAt: number;
}

export interface FolderView {
  folder: ScanFolder;
  chapters: ChapterSummary[];
}

export interface ChapterView {
  chapter: ScanChapter;
  folder: { id: string; name: string };
  pages: PageSummary[];
}

export interface PageView {
  page: ScanPage;
  imageUrl: string;
  exportUrl?: string;
  chapter: { id: string; number: string; title?: string; settings: ChapterSettings; pageIds: string[] };
  folder: { id: string; name: string };
}

/** Fichier déjà déposé dans les données du module (route d'envoi), à rattacher à un chapitre. */
export interface UploadedFile {
  /** Nom rendu par la route d'envoi, dans `data/assets/`. */
  file: string;
  /** Nom d'origine, qui décide de l'ordre des pages. */
  name: string;
}

// ─── Sources : import d'un chapitre par son lien ─────────────────

/**
 * Pourquoi un lien n'a pas pu être traité. L'interface a un message pour
 * chaque cas : on ne dit jamais seulement « erreur ».
 */
export type SourceErrorKind =
  /** Aucun adaptateur ne reconnaît ce site. */
  | "unsupported"
  /** Le site est reconnu, mais ce lien n'est pas celui d'un chapitre. */
  | "not-a-chapter"
  /** L'adaptateur existe mais il est désactivé. */
  | "disabled"
  /** Le chapitre n'existe pas ou plus. */
  | "not-found"
  /** Le chapitre existe mais ses pages ne sont pas lisibles ici (hébergé ailleurs, réservé, retiré). */
  | "unavailable"
  /** Le site demande d'attendre. */
  | "rate-limited"
  /** Le site ne répond pas, ou répond de travers. */
  | "site-error"
  /** La réponse du site a changé : l'adaptateur est à mettre à jour. */
  | "adapter-outdated";

export interface SourceStatus {
  /** Identifiant de l'adaptateur : « mangadex ». */
  id: string;
  /** Nom du site, tel qu'il s'écrit. */
  name: string;
  /** Adresse d'accueil du site. */
  homepage: string;
  /** Domaines dont cet adaptateur reconnaît les liens. */
  hosts: string[];
  /** Un exemple de lien de chapitre, pour le champ de saisie et l'essai. */
  example: string;
  enabled: boolean;
  /** Icône du site, récupérée chez lui et servie par le module ; absente tant qu'elle n'a pas été récupérée. */
  iconUrl?: string;
  /** Ce qu'il faut savoir avant de s'en servir : limites, conditions du site. */
  notes?: string;
  /** Dernier import réussi par cet adaptateur. */
  lastUsedAt?: number;
  /** Dernier échec, pour savoir si l'adaptateur est encore en état. */
  lastError?: { kind: SourceErrorKind; message: string; at: number };
}

/** Ce qu'un lien désigne, lu chez le site sans rien télécharger. */
export interface LinkPreview {
  source: Pick<SourceStatus, "id" | "name" | "iconUrl">;
  /** Titre de la série, quand le site le donne. */
  series?: string;
  /** Numéro du chapitre, tel que le site l'écrit : « 11 », « 12.5 ». */
  chapterNumber?: string;
  chapterTitle?: string;
  /** Langue du chapitre chez le site, en code court : « en », « ja ». */
  language?: string;
  /** Équipe ou éditeur crédité par le site. */
  credit?: string;
  pageCount: number;
}

export type LinkImportState = "queued" | "resolving" | "downloading" | "importing" | "done" | "failed" | "cancelled";

export interface LinkImportJob {
  id: string;
  url: string;
  chapterId: string;
  sourceId?: string;
  state: LinkImportState;
  /** Pages téléchargées sur le total. */
  done: number;
  total: number;
  /** Présent quand l'import a échoué. */
  error?: { kind: SourceErrorKind; message: string };
  /** Pages ajoutées au chapitre, une fois l'import terminé. */
  imported?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Traduction ──────────────────────────────────────────────────

export type TranslationEngineId = "deepl" | "libretranslate";

/** D'où vient une traduction rendue par le routeur (§ 7.5 du dossier). */
export type TranslationSource = "glossary" | "memory" | "cache" | "engine";

export interface TranslationItem {
  /** Identifiant de la zone, rendu tel quel avec sa traduction. */
  id: string;
  /** Texte nettoyé, dans la langue source. */
  text: string;
}

export interface TranslationResult {
  id: string;
  text: string;
  source: TranslationSource;
  /** Moteur qui a réellement traduit ; absent si la phrase vient du glossaire ou de la mémoire. */
  engine?: TranslationEngineId;
}

export interface TranslationBatch {
  results: TranslationResult[];
  /** Phrases restées sans traduction : aucun moteur n'a pu répondre. */
  failed: { id: string; error: string }[];
  /** Le moteur principal n'a pas répondu et le secours a pris le relais. */
  fallback?: { from: TranslationEngineId; to: TranslationEngineId; reason: string };
  /** Caractères réellement envoyés à un moteur par cet appel. */
  sentCharacters: number;
}

export interface TranslationEstimate {
  /** Caractères de toutes les phrases demandées. */
  characters: number;
  /** Caractères déjà couverts par le glossaire, la mémoire ou le cache. */
  known: number;
  /** Caractères qui partiraient chez un moteur. */
  toSend: number;
  /** Moteur qui les recevrait, s'il y en a un de disponible. */
  engine?: TranslationEngineId;
}

export interface EngineStatus {
  id: TranslationEngineId;
  label: string;
  /** Une clé ou une adresse est enregistrée. */
  configured: boolean;
  /** Le moteur peut être appelé maintenant. */
  available: boolean;
  /** Pourquoi il ne l'est pas : non configuré, plafond atteint, mis de côté après des échecs… */
  reason?: string;
  usage: { day: number; month: number };
  /** Plafond mensuel de caractères ; 0 : aucun. */
  monthlyLimit: number;
  /** Fin de la mise à l'écart, quand le disjoncteur est ouvert. */
  pausedUntil?: number;
  /** Quatre derniers caractères de la clé, jamais la clé. */
  keyHint?: string;
  /** Adresse du service, pour un moteur auto-hébergé. */
  url?: string;
}

export interface EngineCatalogue {
  engines: EngineStatus[];
  /** Ordre d'appel : le premier est le moteur principal, le second le secours. */
  order: TranslationEngineId[];
}

/** Réglages des moteurs, réservés aux administrateurs. Une clé absente n'est pas modifiée ; une chaîne vide l'efface. */
export interface EngineSettingsPatch {
  order?: TranslationEngineId[];
  deeplKey?: string;
  libreTranslateUrl?: string;
  libreTranslateKey?: string;
  monthlyLimits?: Partial<Record<TranslationEngineId, number>>;
}

// ─── Valeurs par défaut ──────────────────────────────────────────

const BASE_STYLE: TextStyle = {
  font: "Comic Neue",
  size: 28,
  weight: 700,
  italic: false,
  uppercase: true,
  color: "#111111",
  lineHeight: 1.12,
  align: "center",
};

export const DEFAULT_STYLES: Record<RegionKind, TextStyle> = {
  dialogue: BASE_STYLE,
  thought: { ...BASE_STYLE, font: "Patrick Hand", weight: 400, italic: true, uppercase: false },
  narration: { ...BASE_STYLE, font: "Patrick Hand", weight: 400, uppercase: false, align: "left" },
  sfx: { ...BASE_STYLE, font: "Bangers", weight: 400, size: 48, color: "#ffffff", stroke: { color: "#111111", width: 4 } },
  background: { ...BASE_STYLE, weight: 400, uppercase: false },
};

export const DEFAULT_CHAPTER_SETTINGS: ChapterSettings = {
  sourceLanguage: "en",
  targetLanguage: "fr",
  format: "manga",
  maxLevel: 2,
  styles: DEFAULT_STYLES,
};

export const DEFAULT_MASK: RegionMask = { kind: "fill", shape: "rounded", color: "#ffffff", grow: 4, strokes: [] };

/** Style effectif d'une zone : celui de son type, surchargé par le sien. */
export function resolveStyle(region: ScanRegion, settings: ChapterSettings): TextStyle {
  return { ...(settings.styles[region.kind] ?? DEFAULT_STYLES[region.kind]), ...(region.text.style ?? {}) };
}

/** Rectangle englobant d'un contour. */
export function boundsOf(points: Point[]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Identifiants du module : minuscules et chiffres, de longueur fixe. */
export const ID_PATTERN = /^[a-z0-9]{12}$/;

export function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}
