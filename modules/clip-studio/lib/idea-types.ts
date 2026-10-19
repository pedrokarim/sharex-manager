/**
 * Idées de vidéos et banque de concepts : types et bornes, communs au
 * serveur et à l'écran « Idées ». Aucun disque, aucun réseau.
 */

import type { AspectPreset } from "../engine/types";

/** Modèles que l'assistant sait remplir. */
export type IdeaTemplate = "free" | "quiz" | "top" | "slideshow";
export const IDEA_TEMPLATES: readonly IdeaTemplate[] = ["free", "quiz", "top", "slideshow"];

export const IDEA_ASPECTS: readonly AspectPreset[] = ["9:16", "16:9", "1:1", "4:5"];

/** Nouvelle, gardée (à faire plus tard), faite (un projet en est sorti), écartée. */
export type IdeaStatus = "new" | "kept" | "done" | "dismissed";
export const IDEA_STATUSES: readonly IdeaStatus[] = ["new", "kept", "done", "dismissed"];

/**
 * D'où vient l'idée :
 * - `proven` : un concept de la banque (ou une forme qui a déjà sur-performé) ;
 * - `news` : une actualité de moins de 72 heures, source datée ;
 * - `remake` : un de ses propres succès récents, refait avec une autre accroche ;
 * - `fresh` : une forme nouvelle, sans preuve, à tenter.
 */
export type IdeaKind = "proven" | "news" | "remake" | "fresh";
export const IDEA_KINDS: readonly IdeaKind[] = ["proven", "news", "remake", "fresh"];

export interface IdeaSource {
  url: string;
  title: string;
  /** Date de publication de la source (AAAA-MM-JJ). */
  date: string;
}

/** Le filtre avant d'écrire, case par case. */
export interface IdeaChecks {
  /** La première phrase nomme l'objet ou la douleur avec un détail concret. */
  concreteOpening: boolean;
  /** Quelque chose à montrer dès la première seconde. */
  visualFirstSecond: boolean;
  /** Une seule promesse, tenue. */
  singlePromise: boolean;
  /** 45 secondes au plus, sauf classement ou duel. */
  shortEnough: boolean;
}

export const IDEA_CHECK_LABELS: Record<keyof IdeaChecks, string> = {
  concreteOpening: "Première phrase concrète (chiffre, nom, « gratuit »)",
  visualFirstSecond: "Quelque chose à montrer dès la première seconde",
  singlePromise: "Une seule promesse, tenue",
  shortEnough: "45 s au plus, sauf classement ou duel",
};

export interface Idea {
  id: string;
  /** Marque pour laquelle l'idée a été trouvée ; absente : sans marque. */
  kitId?: string;
  status: IdeaStatus;
  kind: IdeaKind;
  title: string;
  /** Première phrase dite, huit mots environ. */
  hook: string;
  /** Autres accroches proposées à la demande. */
  altHooks?: string[];
  angle: string;
  concept: {
    name: string;
    /** Concept de la banque dont l'idée découle. */
    conceptId?: string;
    /** Preuve en clair : « 4,2 × la médiane sur @chaine ». */
    proof?: string;
  };
  /** « Pourquoi maintenant », avec sa source pour une actualité. */
  why?: { text: string; source?: IdeaSource };
  template: IdeaTemplate;
  /** Nombre d'éléments (3 à 10) quand le sujet l'impose ; absent : le script le choisit selon la durée. */
  count?: number;
  targetSeconds: number;
  aspect: AspectPreset;
  /**
   * L'idée se monte par-dessus une vidéo existante (réaction, analyse d'une
   * bande-annonce, commentaire d'un extrait) : la vidéo à choisir, en une phrase.
   */
  sourceVideoHint?: string;
  language?: string;
  /** Prompt initial pour l'assistant, sans l'accroche (ajoutée à la création). */
  prompt: string;
  checks: IdeaChecks;
  /** Série de recherche dont l'idée vient. */
  batchId: string;
  /** Création lancée depuis l'idée (travail de l'assistant). */
  jobId?: string;
  /** Projet créé depuis l'idée. */
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}

/** Réglages d'une recherche d'idées. */
export interface IdeaSettings {
  /** Marque ; `null` : sans marque. */
  kitId: string | null;
  count: number;
  /** Part d'actualité, en pourcentage du nombre d'idées (0 à 60). */
  newsShare: number;
  templates: IdeaTemplate[];
  aspect: AspectPreset;
  /**
   * Sujet facultatif : des mots-clés (« jeux mobiles ») ou une phrase entière
   * (« les secrets de fabrication des sabres japonais et pourquoi ils coupent
   * si bien »), dont Codex dégage le sujet et l'angle.
   */
  topic: string;
  /** Recherche web permise (actualité, vérification des faits). */
  web: boolean;
}

export const DEFAULT_IDEA_SETTINGS: IdeaSettings = {
  kitId: null,
  count: 5,
  newsShare: 20,
  templates: [...IDEA_TEMPLATES],
  aspect: "9:16",
  topic: "",
  web: true,
};

export const NEWS_SHARES: readonly number[] = [0, 20, 40, 60];

/** Bornes de ce qui est rangé. */
export const IDEA_LIMITS = {
  /** Idées gardées en tout (les plus anciennes nouvelles partent d'abord). */
  ideas: 300,
  /** Écartées gardées comme exemples négatifs. */
  dismissed: 120,
  perSearch: { min: 3, max: 10 },
  title: 90,
  hook: 70,
  angle: 240,
  conceptName: 120,
  proof: 160,
  why: 280,
  sourceTitle: 160,
  url: 500,
  /** Prompt initial avec l'accroche : la limite de la demande de l'assistant. */
  brief: 600,
  topic: 300,
  /** Sujet compris par Codex, rendu avec la série. */
  subject: 160,
  sourceVideoHint: 160,
  altHooks: 3,
} as const;

// ─── Banque de concepts ──────────────────────────────────────────

/** Un succès mesuré : une vidéo, sa chaîne, son score. */
export interface ConceptProof {
  videoId: string;
  title: string;
  url: string;
  /** `@nom` ou titre de la chaîne. */
  channel: string;
  /** Vues ÷ médiane de la chaîne. */
  score: number;
  views: number;
  publishedAt?: string;
  /** Vidéo de la marque elle-même. */
  own?: boolean;
}

export interface ConceptFlop {
  title: string;
  channel: string;
  score: number;
}

/** Actualité (un sujet daté) ou intemporel. */
export type ConceptRhythm = "news" | "evergreen";

export interface Concept {
  id: string;
  /** Une forme de sujet, pas un titre : « N jeux à surveiller avant leur sortie ». */
  name: string;
  /** Le moule : squelette de l'accroche et temps forts. */
  mold: { hook: string; beats: string[] };
  rhythm: ConceptRhythm;
  proofs: ConceptProof[];
  flops: ConceptFlop[];
  createdAt: number;
  updatedAt: number;
}

/** Pari (un seul succès, ou une seule chaîne) ou recette (trois succès sur au moins deux chaînes). */
export type ConceptStatus = "bet" | "recipe";

export type ChannelRelation = "direct" | "neighbor" | "bigger";

export interface ReferenceChannel {
  handle: string;
  title?: string;
  /** Ajoutée à la main, ou proposée par Codex et validée. */
  origin: "user" | "suggested";
  /** `pending` : proposée, pas encore validée (jamais mesurée). */
  state: "active" | "pending";
  relation?: ChannelRelation;
  note?: string;
  addedAt: number;
}

/** Mesure d'une chaîne lors de la dernière étude. */
export interface ChannelStat {
  handle: string;
  title: string;
  /** Vidéos courtes lues (30 au plus). */
  shorts: number;
  /** Médiane des vues hors trois plus récentes ; `null` si trop peu de vidéos. */
  median: number | null;
  /** Moins de 15 vidéos courtes : médiane fragile. */
  small: boolean;
  /** Meilleurs scores de la chaîne. */
  top: { title: string; url: string; score: number; views: number; young: boolean }[];
  error?: string;
}

export interface NicheStudy {
  at: number;
  accountId?: string;
  channels: ChannelStat[];
  /** Sa propre chaîne, mesurée de la même façon, quand le compte est connecté. */
  own?: ChannelStat & {
    /** Ses succès (≥ 3 ×) des deux dernières semaines : à refaire avec une autre accroche. */
    recentHits: { title: string; url: string; score: number; publishedAt?: string }[];
  };
  hits: number;
  unitsUsed: number;
  notes: string[];
}

export interface ConceptBank {
  version: 1;
  kitId: string;
  channels: ReferenceChannel[];
  concepts: Concept[];
  study?: NicheStudy;
  updatedAt: number;
}

export const BANK_LIMITS = {
  channels: 24,
  /** Chaînes mesurées par étude. */
  studied: 12,
  concepts: 60,
  proofs: 12,
  flops: 6,
  beats: 6,
  name: 120,
  moldHook: 160,
  beat: 140,
  note: 200,
} as const;

/** Une étude par mois suffit : les signaux bougent lentement. */
export const STUDY_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** `@nom` d'une chaîne : 3 à 30 lettres, chiffres, points, tirets ou soulignés. */
const HANDLE = /^@[\p{L}\p{N}._-]{3,30}$/u;

/** `@nom` nettoyé (adresse de chaîne ou nom sans « @ » acceptés), ou `null`. */
export function cleanChannelHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let text = value.trim();
  const fromUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(@[^/?#\s]+)/i.exec(text);
  if (fromUrl) {
    try {
      text = decodeURIComponent(fromUrl[1]);
    } catch {
      return null;
    }
  }
  if (!text.startsWith("@")) text = `@${text}`;
  return HANDLE.test(text) ? text : null;
}

/** Identifiant de fichier de la banque : la marque, ou « none » sans marque. */
export const NO_KIT = "none";

// ─── Travaux longs (Codex, lecture des chaînes) ──────────────────

export type IdeaTaskKind = "ideas" | "hooks" | "channels" | "study";

export interface IdeaTask {
  id: string;
  kind: IdeaTaskKind;
  status: "running" | "done" | "error";
  /** Étape en cours, en clair. */
  step: string;
  kitId?: string;
  ideaId?: string;
  error?: string;
  /** Bilan à afficher (mélange obtenu, chaînes mesurées…). */
  notes?: string[];
  startedAt: number;
  finishedAt?: number;
}
