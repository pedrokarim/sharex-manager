/**
 * Réglages d'une voix de narration, communs au navigateur et au serveur :
 * débit, intonation, voix d'une marque et durée visée par l'assistant.
 *
 * Aucun accès au disque ici : la fenêtre « Créer », l'éditeur de marque et
 * l'assistant s'en servent tous les trois.
 */

/** Paliers de débit proposés par l'interface (éditeur, fenêtre « Créer », marque). */
export const VOICE_SPEEDS = [
  { value: 0.85, label: "Posée" },
  { value: 1, label: "Normale" },
  { value: 1.15, label: "Rapide" },
] as const;

/** Bornes du débit acceptées par les moteurs de synthèse. */
export const SPEED_LIMITS = { min: 0.7, max: 1.6 } as const;

/** Débit borné ; une valeur illisible vaut le débit normal. */
export function cleanSpeed(value: unknown): number {
  return Math.min(SPEED_LIMITS.max, Math.max(SPEED_LIMITS.min, Number(value) || 1));
}

/** Intonations des voix locales (Piper), dans l'ordre de l'interface. */
export const TONE_IDS = ["steady", "balanced", "expressive"] as const;
export type ToneId = (typeof TONE_IDS)[number];

export function isToneId(value: unknown): value is ToneId {
  return typeof value === "string" && (TONE_IDS as readonly string[]).includes(value);
}

/** Source d'une voix, lue dans son identifiant (« azure:fr-FR-DeniseNeural ») ; « piper » pour une voix locale. */
export type VoiceSourceId = "piper" | "edge" | "azure" | "openai" | "google" | "elevenlabs";

export const VOICE_SOURCE_LABELS: Record<VoiceSourceId, string> = {
  piper: "Locales",
  edge: "Edge",
  azure: "Azure",
  openai: "OpenAI",
  google: "Google",
  elevenlabs: "ElevenLabs",
};

const CLOUD_VOICE = /^(edge|azure|openai|google|elevenlabs):[^\s<>"']{1,100}$/;
const LOCAL_VOICE = /^[a-z][a-z0-9-]{1,30}$/;

export function voiceSourceOf(voiceId: string): VoiceSourceId {
  const prefix = /^(edge|azure|openai|google|elevenlabs):/.exec(voiceId)?.[1];
  return (prefix as VoiceSourceId | undefined) ?? "piper";
}

/** Identifiant de voix bien formé (locale ou en ligne) ; sa disponibilité se vérifie côté serveur. */
export function isVoiceId(value: unknown): value is string {
  return typeof value === "string" && (CLOUD_VOICE.test(value) || LOCAL_VOICE.test(value));
}

/** Voix réglée : la voix, son débit et, pour une voix locale, son intonation. */
export interface VoiceSettings {
  voice: string;
  speed: number;
  tone?: ToneId;
}

/**
 * Voix d'une marque, lue avec tolérance : une fiche d'avant la voix, ou une
 * valeur abîmée, n'a simplement pas de voix. Le débit est borné, une
 * intonation inconnue est oubliée, et une voix en ligne n'en garde aucune.
 */
export function cleanVoiceSettings(input: unknown): VoiceSettings | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;
  if (!isVoiceId(raw.voice)) return undefined;
  const speed = Math.round(cleanSpeed(raw.speed) * 100) / 100;
  const local = voiceSourceOf(raw.voice) === "piper";
  return { voice: raw.voice, speed, ...(local && isToneId(raw.tone) ? { tone: raw.tone } : {}) };
}

/** Ce que la fenêtre « Créer » prérègle quand la marque choisie a une voix. */
export interface BrandVoicePrefill extends VoiceSettings {
  /** La voix de la marque n'est pas proposée ici (clé absente, source coupée) : repli sur la voix locale. */
  unavailable?: string;
}

/**
 * Préremplissage de la voix depuis la marque. `available` : identifiants des
 * voix proposées par le serveur, ou `null` tant que la liste n'est pas
 * arrivée (la voix de la marque est alors gardée telle quelle).
 */
export function brandVoicePrefill(brandVoice: VoiceSettings, available: readonly string[] | null, fallbackVoice = "siwis"): BrandVoicePrefill {
  if (!available || available.includes(brandVoice.voice)) return { ...brandVoice };
  const source = voiceSourceOf(brandVoice.voice);
  return {
    voice: fallbackVoice,
    speed: brandVoice.speed,
    // L'intonation d'une voix en ligne n'existe pas : la voix locale prend l'intonation par défaut.
    ...(source === "piper" && brandVoice.tone ? { tone: brandVoice.tone } : {}),
    unavailable:
      source === "piper"
        ? "La voix de la marque n’est plus proposée sur ce serveur : voix locale par défaut à la place."
        : `La voix de la marque (${VOICE_SOURCE_LABELS[source]}) n’est pas disponible ici : voix locale par défaut à la place.`,
  };
}

// ─── Durée visée ─────────────────────────────────────────────────

export type TargetAspect = "9:16" | "16:9" | "1:1" | "4:5";
export type TargetTemplate = "free" | "quiz" | "top" | "slideshow";

/** Durée parlée la plus courte qu'on puisse viser, en secondes. */
export const MIN_TARGET_SECONDS = 15;

/** Durée parlée la plus longue par format : un short vertical tient en 60 s. */
export const MAX_TARGET_SECONDS: Record<TargetAspect, number> = {
  "9:16": 60,
  "4:5": 90,
  "1:1": 90,
  "16:9": 180,
};

/** Durée visée par défaut, selon le modèle : un quiz lit ses choix et ses réponses. */
const DEFAULT_TARGET_SECONDS: Record<TargetTemplate, number> = {
  free: 45,
  quiz: 60,
  top: 45,
  slideshow: 40,
};

export function maxTargetSeconds(aspect: string): number {
  return MAX_TARGET_SECONDS[aspect as TargetAspect] ?? MAX_TARGET_SECONDS["9:16"];
}

export function defaultTargetSeconds(template: string, aspect: string): number {
  const preferred = DEFAULT_TARGET_SECONDS[template as TargetTemplate] ?? DEFAULT_TARGET_SECONDS.free;
  return Math.min(preferred, maxTargetSeconds(aspect));
}

/** Durée visée bornée au format ; absente ou illisible, la valeur par défaut du modèle. */
export function cleanTargetSeconds(value: unknown, template: string, aspect: string): number {
  const parsed = Number(value);
  const wanted = value === undefined || value === null || value === "" || !Number.isFinite(parsed) ? defaultTargetSeconds(template, aspect) : parsed;
  return Math.round(Math.min(maxTargetSeconds(aspect), Math.max(MIN_TARGET_SECONDS, wanted)));
}

/** Accélération la plus forte que le calage peut appliquer, débit choisi compris : ×1,10. */
export const MAX_SPEED_UP = 1.1;

/** Au-delà de ce dépassement (10 %), le calage raccourcit le script au lieu d'accélérer la voix. */
export const SPEED_UP_THRESHOLD = 1.1;
