/**
 * Nombre de segments d'un script de l'assistant (questions, éléments,
 * séquences, diapositives) : choisi par l'utilisateur (2 à 10), ou « Auto » :
 * le script découpe lui-même selon le sujet et la durée visée.
 *
 * Pur : partagé par le serveur (consigne du script) et la page de création
 * (estimation affichée sous « Auto »).
 */

import { SPEAKING_RATE_WPM } from "./script-rules";

export type SegmentTemplate = "free" | "quiz" | "top" | "slideshow";

/** Segments que le script peut choisir lui-même, selon le modèle : un quiz lit trois choix et une réponse par question. */
export const AUTO_SEGMENTS: Record<SegmentTemplate, { min: number; max: number }> = {
  quiz: { min: 3, max: 8 },
  free: { min: 3, max: 10 },
  top: { min: 3, max: 10 },
  slideshow: { min: 3, max: 10 },
};

/**
 * Mots lus par segment, environ, d'après les limites de longueur de chaque
 * modèle et ce que la voix lit : « Question 2 », la question, trois choix,
 * la réponse et son explication pour un quiz ; « Numéro 3 », le titre et le
 * détail pour un classement ; le titre et le texte d'une séquence libre ; la
 * légende d'une diapositive.
 */
export const SEGMENT_WORDS: Record<SegmentTemplate, number> = { quiz: 40, free: 22, top: 15, slideshow: 12 };

/** Titre, sous-titre et conclusion, lus en plus des segments. */
export const FRAME_WORDS = 14;

/** Bornes d'un nombre choisi à la main. */
export const CHOSEN_SEGMENTS = { min: 2, max: 10 } as const;

/** Nombre choisi (2 à 10), ou `undefined` : le script décide. */
export function cleanCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "" || value === "auto") return undefined;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(CHOSEN_SEGMENTS.max, Math.max(CHOSEN_SEGMENTS.min, parsed));
}

const templateOf = (template: string): SegmentTemplate => (template in AUTO_SEGMENTS ? (template as SegmentTemplate) : "free");

/** Nombre de segments qui remplit la durée visée sans délayer, dans les bornes du modèle. */
export function suggestedSegments(template: string, seconds: number): number {
  const key = templateOf(template);
  const words = (seconds * SPEAKING_RATE_WPM) / 60;
  const bounds = AUTO_SEGMENTS[key];
  return Math.min(bounds.max, Math.max(bounds.min, Math.round((words - FRAME_WORDS) / SEGMENT_WORDS[key])));
}

/**
 * Part du clip monté qui n'est pas de la voix, en secondes, estimée avant
 * l'écriture du script : marges laissées après chaque ligne (0,5 s après
 * l'accroche, 0,6 s après un segment, 0,8 s après la conclusion ; pour un
 * quiz, 3 s de réflexion et 0,5 s après la réponse), décalage de 4 images
 * au début de chaque ligne et carton de fin de la marque. Mesurée en
 * production le 26/10/2026 : 6,2 s pour 3 séquences et un carton de 2,5 s.
 */
export function fixedSeconds(template: string, segments: number, endCardSeconds = 0): number {
  const key = templateOf(template);
  const lines = key === "quiz" ? 2 + segments * 2 : 2 + segments;
  const margins = 0.5 + 0.8 + segments * (key === "quiz" ? 3.5 : 0.6);
  return margins + lines * (4 / 30) + Math.max(0, endCardSeconds);
}

/**
 * Secondes de voix que le script peut écrire pour que le clip monté tienne
 * dans la durée visée : la cible moins la part fixe, jamais moins de la
 * moitié de la cible (la même borne que le calage après l'enregistrement).
 */
export function voiceBudgetSeconds(template: string, targetSeconds: number, segments: number, endCardSeconds = 0): number {
  return Math.round(Math.max(targetSeconds / 2, targetSeconds - fixedSeconds(template, segments, endCardSeconds)));
}

/**
 * Segments qu'un script « Auto » devrait prendre : ceux que remplit la voix
 * seule, une fois les pauses et le carton de fin retirés de la durée visée.
 * La page « Créer » l'affiche, la consigne du script le donne.
 */
export function plannedSegments(template: string, targetSeconds: number, endCardSeconds = 0): number {
  return suggestedSegments(template, voiceBudgetSeconds(template, targetSeconds, suggestedSegments(template, targetSeconds), endCardSeconds));
}

/** Segments gardés au plus : le nombre demandé, sinon le plafond du choix libre. */
export function segmentCap(request: { template: string; count?: number }): number {
  return request.count ?? AUTO_SEGMENTS[templateOf(request.template)].max;
}
