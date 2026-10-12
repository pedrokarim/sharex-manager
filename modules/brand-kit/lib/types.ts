/**
 * Modèle de données d'une image de marque (dossier 07, § 5.1).
 *
 * Les couleurs et les styles de texte reprennent les types du moteur de Clip
 * Studio : une marque ne peut pas décrire un style que le moteur ne sait pas
 * dessiner.
 */

import type { BrandPalette, WatermarkAnchor } from "@/modules/clip-studio/engine/brand";
import type { TextRole, TextStyle } from "@/modules/clip-studio/engine/types";

export type { BrandPalette, BrandTheme, WatermarkAnchor } from "@/modules/clip-studio/engine/brand";
export type { TextRole, TextStyle } from "@/modules/clip-studio/engine/types";
import type { HashtagRule } from "@/modules/clip-studio/lib/post-types";
export type { HashtagRule } from "@/modules/clip-studio/lib/post-types";
import type { VoiceSettings } from "@/modules/clip-studio/lib/voice-settings";

/**
 * Voix de la marque : la voix (sa source se lit dans son identifiant,
 * « azure:fr-FR-DeniseNeural » ou « siwis » pour une voix locale), son débit
 * et, pour une voix locale, son intonation. Préremplie dans la fenêtre
 * « Créer » de Clip Studio, prise d'office par l'assistant quand la demande
 * n'en précise aucune.
 */
export type BrandVoice = VoiceSettings;

export type FontFormat = "ttf" | "otf" | "woff2";

export interface BrandFont {
  id: string;
  /** Nom affiché. */
  name: string;
  /** Famille déclarée au navigateur : `bk-<kitId>-<fontId>`, jamais le nom lu dans le fichier. */
  family: string;
  file: string;
  format: FontFormat;
  size: number;
}

/**
 * `format` : image finie importée pour un format (bannière, avatar…), qui
 * remplace son rendu composé. Elle n'entre que par `setFormatImage`, jamais
 * par l'ajout d'une image ordinaire : elle n'est pas dans `ASSET_KINDS`.
 */
export type AssetKind = "logo" | "logo-mark" | "mascot-sheet" | "mascot-pose" | "background" | "texture" | "reference" | "format";

/** Types qu'une image ajoutée à la main peut prendre. */
export const ASSET_KINDS: readonly AssetKind[] = ["logo", "logo-mark", "mascot-sheet", "mascot-pose", "background", "texture", "reference"];

/** Formats d'une chaîne (§ 4.3) ; leurs tailles et leurs rendus sont dans `formats.ts`. */
export const FORMAT_IDS = ["banner", "avatar", "watermark", "x-header", "endcard-vertical", "endcard-horizontal", "short-cover"] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

/**
 * Formats qui peuvent mettre en scène une pose de la mascotte, réglée dans
 * `mascot.formatPoses`. Le carton de fin a la sienne (`endCard.poseAssetId`),
 * partagée avec les vidéos ; le filigrane n'en a jamais.
 */
export const MASCOT_FORMAT_IDS = ["banner", "avatar", "x-header", "short-cover"] as const;
export type MascotFormatId = (typeof MASCOT_FORMAT_IDS)[number];

export interface BrandAsset {
  id: string;
  /** Nom de fichier dans data/kits/<kitId>/assets/. */
  file: string;
  kind: AssetKind;
  label: string;
  note?: string;
  width: number;
  height: number;
  /** Image générée : consigne, collection et travail d'AI Image Gen, pour la refaire. */
  generated?: {
    prompt: string;
    collectionId?: string;
    jobId?: string;
    /** Rôle du visuel dans la marque : logo, feuille de la mascotte, pose, fond de bannière. */
    slot: string;
    /** Contrôle de cohérence d'un personnage (§ 6.5) : réussi, refusé deux fois, ou non vérifié (sans Codex). */
    check?: "ok" | "failed" | "unchecked";
  };
  createdAt: number;
}

export interface BrandWatermark {
  assetId: string;
  anchor: WatermarkAnchor;
  /** Largeur relative au petit côté de l'image ou de la vidéo. */
  size: number;
  opacity: number;
  /** Marge au bord, relative au petit côté. */
  margin: number;
  /** Apparition dans une vidéo, en secondes depuis le début. */
  startSeconds: number;
}

export interface BrandEndCard {
  enabled: boolean;
  seconds: number;
  callToAction?: string;
  poseAssetId?: string;
}

export type Privacy = "private" | "unlisted" | "public";

/** Un lien de la marque, écrit une fois et repris par `{links}`. */
export interface BrandLink {
  label: string;
  /** Adresse http(s) seulement. */
  url: string;
}

/**
 * Modèles propres à un service : seulement ce qui diffère des modèles
 * communs. Un modèle absent reprend le modèle commun.
 */
export interface BrandServiceTemplates {
  titleTemplate?: string;
  descriptionTemplate?: string;
  captionTemplate?: string;
  firstCommentTemplate?: string;
  /** Où vont les hashtags pour ce service ; absent : la règle du service. */
  hashtagRule?: HashtagRule;
}

export interface BrandPublishing {
  /** Comptes connectés où publier par défaut (cœur), de n'importe quel service. */
  accountIds: string[];
  /**
   * Modèles avec variables : {title}, {hook}, {summary}, {cta}, {tags},
   * {hashtags}, {links}, {credits}, {date}, {brand}
   * (`src/lib/connections/templates.ts`).
   */
  titleTemplate: string;
  descriptionTemplate: string;
  /** Texte court affiché avec le média dans un fil (légende Instagram, texte Threads). */
  captionTemplate: string;
  /** Premier commentaire posé après la publication ; vide : aucun. */
  firstCommentTemplate: string;
  /** Par identifiant de connecteur (`youtube`, `instagram`…). */
  serviceTemplates: Record<string, BrandServiceTemplates>;
  /** Mots-dièse visibles, sans « # ». */
  hashtags: string[];
  /** Mots-clés cachés (YouTube). */
  tags: string[];
  links: BrandLink[];
  categoryId: string;
  defaultPrivacy: Privacy;
  containsSyntheticMedia: boolean;
  /** Public enfant : faux par défaut, vrai seulement sur choix explicite. */
  madeForKids: boolean;
  /**
   * Profil des comptes connectés (onglet « Chaîne / Profil ») : description
   * de la chaîne, modèle avec les variables {brand}, {hook}, {links},
   * {hashtags}, {tags}, {date}. Les mots-clés reprennent `tags`, la langue
   * celle de la marque.
   */
  channelDescriptionTemplate: string;
  /** Bio courte du profil (Instagram, Threads, Facebook). */
  bio: string;
  /** Pays de la marque, ISO 3166-1 alpha-2 (« FR ») ; vide : aucun. */
  country: string;
}

/** Présence de la mascotte dans les vidéos de Clip Studio (le carton de fin a son propre réglage). */
export interface BrandMascotPresence {
  /** Une pose accompagne l'accroche du début. */
  opening: boolean;
  /** Pose de l'ouverture ; absente : celle de l'en-tête X, sinon la première. */
  openingPoseId?: string;
  /** Une petite pose dans un coin pendant les segments, une autre à chaque segment. */
  reactions: boolean;
}

export interface BrandMascot {
  name?: string;
  identityPrompt: string;
  sheetAssetIds: string[];
  poseAssetIds: string[];
  /**
   * Pose de chaque format : un identifiant de pose, ou `null` pour « sans
   * mascotte ». Un format absent prend la proposition de `formatPose()`.
   */
  formatPoses?: Partial<Record<MascotFormatId, string | null>>;
  presence?: BrandMascotPresence;
}

export interface BrandKit {
  version: 1;
  id: string;
  name: string;
  tagline?: string;
  /** Langue des textes de la marque (BCP 47). */
  language: string;
  tone: string;
  rules: { always: string[]; never: string[] };
  palette: BrandPalette;
  fonts: BrandFont[];
  textStyles: Record<TextRole, TextStyle>;
  assets: BrandAsset[];
  logoAssetId?: string;
  markAssetId?: string;
  mascot?: BrandMascot;
  watermark?: BrandWatermark;
  endCard: BrandEndCard;
  /** Image finie de chaque format (asset `format`), qui remplace le rendu composé. */
  formatImages?: Partial<Record<FormatId, string>>;
  /** Croix de repérage d'imprimeur aux coins de la bannière et du carton de fin mis en scène. */
  registrationMarks?: boolean;
  ai: { styleNotes: string; collectionId?: string; scriptTone: string };
  /** Voix off de la marque ; absente : chaque clip choisit la sienne. */
  voice?: BrandVoice;
  publishing: BrandPublishing;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Ce que montre une carte de la liste. */
export interface KitSummary {
  id: string;
  name: string;
  tagline?: string;
  palette: BrandPalette;
  logoUrl?: string;
  bannerUrl?: string;
  accountIds: string[];
  /** Voix de la marque, que la fenêtre « Créer » de Clip Studio préremplit. */
  voice?: BrandVoice;
  isDefault: boolean;
  updatedAt: number;
}

export const KIT_LIMITS = {
  name: 80,
  tagline: 140,
  tone: 1000,
  rule: 200,
  rules: 20,
  styleNotes: 2000,
  scriptTone: 600,
  identityPrompt: 1500,
  assets: 120,
  fonts: 12,
  extras: 8,
  tags: 30,
  tag: 60,
  titleTemplate: 200,
  descriptionTemplate: 4000,
  captionTemplate: 2200,
  firstCommentTemplate: 2200,
  channelDescriptionTemplate: 2000,
  bio: 150,
  serviceTemplates: 12,
  hashtags: 30,
  links: 10,
  linkLabel: 60,
  linkUrl: 500,
  callToAction: 60,
  label: 120,
  note: 500,
};

export const isKitId = (value: unknown): value is string => typeof value === "string" && /^kit-[a-z0-9]{6,32}$/.test(value);
export const isItemId = (value: unknown): value is string => typeof value === "string" && /^[a-z]{1,4}-[a-z0-9]{4,32}$/.test(value);

/** Famille déclarée au navigateur pour une police importée. */
export function brandFontFamily(kitId: string, fontId: string): string {
  return `bk-${kitId}-${fontId}`;
}

/** Retrouve la marque et la police d'une famille `bk-…`, ou `null` pour une police du catalogue. */
export function parseBrandFontFamily(family: string): { kitId: string; fontId: string } | null {
  const match = /^bk-(kit-[a-z0-9]{6,32})-([a-z]{1,4}-[a-z0-9]{4,32})$/.exec(family);
  return match ? { kitId: match[1], fontId: match[2] } : null;
}

export const MODULE_NAME = "brand-kit";
export const MODULE_PATH = `/m/${MODULE_NAME}`;

export function kitAssetUrl(kitId: string, file: string): string {
  return `/api/modules/${MODULE_NAME}/data/kits/${kitId}/assets/${file}`;
}

export function kitExportUrl(kitId: string, file: string): string {
  return `/api/modules/${MODULE_NAME}/data/kits/${kitId}/exports/${file}`;
}
