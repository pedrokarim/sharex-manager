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

export type RegionKind = "dialogue" | "shout" | "thought" | "narration" | "sfx" | "background";

export const REGION_KINDS: RegionKind[] = ["dialogue", "shout", "thought", "narration", "sfx", "background"];

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
  /** Espace ajouté entre les lettres, en fraction de la taille (0,05 : 5 % de la taille). Absent : aucun. */
  letterSpacing?: number;
  /** Étirement horizontal des lettres : 1 les laisse telles quelles, 1,5 les élargit de moitié. Absent : 1. */
  stretch?: number;
}

export interface ChapterSettings {
  sourceLanguage: SourceLanguage;
  /** Code de langue cible : « fr », « en », « es »… */
  targetLanguage: string;
  format: ReadingFormat;
  maxLevel: AutomationLevel;
  /** Style par type de zone ; une zone peut le surcharger. */
  styles: Record<RegionKind, TextStyle>;
  /**
   * Modèle d'IA proposé pour chaque action du niveau 3, sous la forme
   * « fournisseur/modèle ». Ne déclenche rien : chaque action reste un clic.
   */
  aiModels?: Partial<Record<AiAction, string>>;
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
  /** Visibilité donnée à chaque nouveau chapitre du dossier ; absente : privé. */
  defaultVisibility?: ChapterVisibility;
  /** Identifiant d'adresse publique de la série, imprévisible ; créé à la première publication. */
  publicSlug?: string;
  createdAt: number;
  updatedAt: number;
}

/** Visibilité d'un chapitre, avec les mots des albums : privé, public par son lien, listé au catalogue. */
export type ChapterVisibility = "private" | "link" | "catalog";

export const CHAPTER_VISIBILITIES: ChapterVisibility[] = ["private", "link", "catalog"];

/** D'où vient un chapitre importé par lien : noté à l'import, montré avec sa lecture publique. */
export interface ChapterOrigin {
  /** Nom du site : « MangaDex ». */
  source: string;
  /** Adresse du chapitre chez le site. */
  url?: string;
  /** Équipe ou éditeur que le site crédite pour la traduction d'origine. */
  credit?: string;
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
  /** Absente : privé. Seules les pages exportées d'un chapitre public sont servies sans compte. */
  visibility?: ChapterVisibility;
  /** Identifiant d'adresse publique, imprévisible ; n'existe que tant que le chapitre est public. */
  publicSlug?: string;
  origin?: ChapterOrigin;
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
  /** Versions de la page traduites d'un bloc par une IA (§ 6.8) : gardées à côté du travail de l'atelier, jamais à sa place. */
  aiVersions?: AiPageVersion[];
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
  // `inpaint` : le fond est reconstruit dans le navigateur d'après les pixels voisins (`lib/inpaint.ts`), sans IA.
  kind: "fill" | "none" | "inpaint";
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
    /**
     * Taille que l'ajustement automatique ne dépasse pas : celle du lettrage
     * d'origine, relevée à l'analyse. Sans elle, le texte grossirait jusqu'à
     * remplir sa bulle, et chaque bulle aurait sa taille. Absente : pas de plafond.
     */
    maxSize?: number;
  };
  /** Appels à une IA faits pour cette zone (niveau 3), du plus ancien au plus récent : on voit où l'IA est passée. */
  ai?: AiTrace[];
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
  /** Absente : privé. */
  visibility?: ChapterVisibility;
  /** Pages qui peuvent être lues en public : exportées, et pas « laissées telles quelles ». */
  publishablePages?: number;
  /** Adresse de lecture publique, quand le chapitre est public. */
  publicPath?: string;
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
  /** Pages qui peuvent être lues en public : exportées, et pas « laissées telles quelles ». */
  publishablePages?: number;
  /** Adresse de lecture publique, quand le chapitre est public. */
  publicPath?: string;
}

/** Ce que rend un changement de visibilité : l'état retenu et, s'il est public, l'adresse à partager. */
export interface ChapterSharing {
  visibility: ChapterVisibility;
  publicPath?: string;
  publishablePages: number;
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

export type TranslationEngineId = "deepl" | "libretranslate" | "mymemory";

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
  /** Quota du jour annoncé par le service, en caractères ; absent : pas de quota journalier. */
  dailyLimit?: number;
  /** Adresse de contact donnée au service (MyMemory) ; chaîne vide : aucune. */
  contactEmail?: string;
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
  /** Adresse de contact donnée à MyMemory ; chaîne vide : on la retire. */
  myMemoryEmail?: string;
  monthlyLimits?: Partial<Record<TranslationEngineId, number>>;
}

// ─── Détecteur de bulles et de texte ─────────────────────────────

export type DetectorVariantId = "precise" | "fast";
/** La variante en service, ou « off » : le repérage par les pixels seulement. */
export type DetectorChoice = DetectorVariantId | "off";

export interface DetectorVariantStatus {
  id: DetectorVariantId;
  label: string;
  description: string;
  /** Poids du fichier du modèle, en octets. */
  size: number;
  installed: boolean;
  downloading: boolean;
}

export interface DetectorStatus {
  active: DetectorChoice;
  variants: DetectorVariantStatus[];
  /** Dépôt d'où vient le modèle, et sa licence. */
  source: string;
  license: string;
  /** Adresse du modèle à charger ; absente tant que la variante choisie n'est pas installée. */
  modelUrl?: string;
  variant?: DetectorVariantId;
}

// ─── Polices ajoutées (§ 8 du dossier) ───────────────────────────

/** Préfixe de la famille CSS d'une police ajoutée : `TextStyle.font` vaut « sxf-<identifiant> ». */
export const CUSTOM_FONT_PREFIX = "sxf-";

export type FontFormat = "ttf" | "otf" | "woff2";

export interface CustomFont {
  id: string;
  /** Famille CSS, stable : c'est elle que portent les styles. Elle ne change pas quand on renomme la police. */
  family: string;
  /** Nom affiché, modifiable. */
  name: string;
  /** Nom de famille lu dans le fichier (table `name`). */
  originalName: string;
  format: FontFormat;
  /** Poids du fichier, en octets. */
  size: number;
  addedAt: number;
}

/** Où une police est utilisée : ce qui changerait si elle disparaissait. */
export interface FontUsage {
  /** Pages dont au moins une zone porte cette police. */
  pages: number;
  /** Chapitres dont un style par type de texte la porte. */
  chapters: number;
  /** Dossiers dont un style par défaut la porte. */
  folders: number;
}

// ─── IA en dernier recours (niveau 3, § 3 et § 6.8 du dossier) ───

/** `reading` : relire une zone ; `translation` : traduire avec le contexte ; `page` : traduire la page entière. */
export type AiAction = "reading" | "translation" | "page";

/** Ce qui est parti chez le fournisseur : l'image d'une zone, du texte, ou la page entière. */
export type AiSentKind = "crop" | "text" | "page";

/** Trace d'un appel, gardée sur la zone ou sur la version de page qu'il a produite. */
export interface AiTrace {
  action: AiAction;
  /** Identifiant du fournisseur dans la palette d'IA : « openai », « google », « codex »… */
  provider: string;
  model: string;
  at: number;
  sent: AiSentKind;
  /** Réponse reprise du cache : rien n'est reparti chez le fournisseur. */
  cached?: boolean;
}

export interface AiModelOption {
  /** « fournisseur/modèle » : la valeur gardée dans `ChapterSettings.aiModels`. */
  key: string;
  provider: string;
  providerLabel: string;
  model: string;
  label: string;
  available: boolean;
  /** Pourquoi le modèle ne peut pas être appelé : clé absente, agent non installé… */
  reason?: string;
}

export interface AiCatalogue {
  /** Le niveau du chapitre autorise l'IA (niveau 3). */
  allowed: boolean;
  /** Pourquoi rien n'est proposé : niveau du chapitre, AI Image Gen coupé… */
  reason?: string;
  models: Record<AiAction, AiModelOption[]>;
  /** Modèle proposé par défaut pour chaque action, d'après le chapitre. */
  defaults: Partial<Record<AiAction, string>>;
  usage: { month: number; monthlyLimit: number };
}

export interface AiReadingProposal {
  regionId: string;
  /** Texte lu par le modèle, nettoyé comme une lecture locale. */
  text: string;
  trace: AiTrace;
}

export interface AiTranslationProposal {
  results: { regionId: string; text: string }[];
  /** Zones restées sans proposition, avec la raison. */
  failed: { regionId: string; error: string }[];
  trace: AiTrace;
}

export interface AiPageVersion {
  id: string;
  /** Image rendue par le moteur, dans `data/assets/`. */
  file: string;
  /** Adresse servie avec la session ; calculée à la lecture, jamais enregistrée. */
  url?: string;
  width: number;
  height: number;
  /** Version de la consigne, fixe, envoyée avec la page. */
  promptVersion: number;
  trace: AiTrace;
}

/** Réglages de l'IA, réservés aux administrateurs. */
export interface AiSettingsPatch {
  /** Plafond mensuel, en nombre d'appels ; 0 : aucun appel permis. */
  monthlyLimit?: number;
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
  shout: { ...BASE_STYLE, font: "Bangers", weight: 400, size: 36 },
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
