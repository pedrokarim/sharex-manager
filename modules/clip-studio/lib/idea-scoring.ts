/**
 * Score d'une vidéo courte : ses vues divisées par la médiane des vues de sa
 * chaîne. Seuils éditoriaux, pas une preuve :
 * - 3 × ou plus : un vrai signal ;
 * - de 1,5 à 3 × : peut-être ;
 * - en dessous : rien à en tirer.
 *
 * La médiane se calcule sur les 12 vidéos courtes qui suivent les 3 plus
 * récentes : celles-ci sont trop jeunes, leurs vues grimpent encore. Une
 * chaîne de moins de 15 vidéos courtes donne une médiane fragile, et l'écran
 * le dit.
 *
 * Tout est pur : aucun disque, aucun réseau.
 */

import type { ChannelStat, Concept, ConceptStatus } from "./idea-types";

/** Une vidéo courte : 3 minutes au plus. */
export const SHORT_MAX_SECONDS = 180;
/** Vidéos courtes lues par chaîne. */
export const SHORTS_PER_CHANNEL = 30;
/** Les plus récentes, écartées de la médiane. */
export const YOUNG_SHORTS = 3;
/** Vidéos qui forment la médiane, après les plus récentes. */
export const BASELINE_SIZE = 12;
/** Sous ce nombre de vidéos courtes, la médiane est fragile. */
export const SMALL_CHANNEL = 15;
export const SIGNAL_SCORE = 3;
export const MAYBE_SCORE = 1.5;
/** Un succès à soi se refait sous deux semaines. */
export const REMAKE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface MeasuredVideo {
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
  durationSeconds: number;
  views?: number;
}

export interface ScoredShort extends MeasuredVideo {
  views: number;
  /** Vues ÷ médiane ; `null` sans médiane. */
  score: number | null;
  /** Une des trois plus récentes : ses vues grimpent encore. */
  young: boolean;
}

export interface ChannelMeasure {
  shorts: ScoredShort[];
  median: number | null;
  /** Vidéos qui ont formé la médiane. */
  baseline: number;
  small: boolean;
}

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export const isShort = (video: Pick<MeasuredVideo, "durationSeconds">) => video.durationSeconds > 0 && video.durationSeconds <= SHORT_MAX_SECONDS;

const time = (video: Pick<MeasuredVideo, "publishedAt">) => {
  const value = Date.parse(video.publishedAt ?? "");
  return Number.isFinite(value) ? value : 0;
};

/**
 * Mesure une chaîne : ses 30 dernières vidéos courtes (vues connues), la
 * médiane hors trois plus récentes, et le score de chacune.
 */
export function measureChannel(videos: MeasuredVideo[]): ChannelMeasure {
  const shorts = videos
    .filter((video) => isShort(video) && typeof video.views === "number" && Number.isFinite(video.views))
    .sort((a, b) => time(b) - time(a))
    .slice(0, SHORTS_PER_CHANNEL);
  const baselineVideos = shorts.slice(YOUNG_SHORTS, YOUNG_SHORTS + BASELINE_SIZE);
  const value = median(baselineVideos.map((video) => video.views as number));
  const usable = value !== null && value > 0 ? value : null;
  return {
    shorts: shorts.map((video, index) => ({
      ...video,
      views: video.views as number,
      score: usable ? Math.round(((video.views as number) / usable) * 100) / 100 : null,
      young: index < YOUNG_SHORTS,
    })),
    median: usable,
    baseline: baselineVideos.length,
    small: shorts.length < SMALL_CHANNEL,
  };
}

export type SignalLevel = "signal" | "maybe" | "none";

export function signalOf(score: number | null | undefined): SignalLevel {
  if (typeof score !== "number") return "none";
  if (score >= SIGNAL_SCORE) return "signal";
  if (score >= MAYBE_SCORE) return "maybe";
  return "none";
}

/** Ce qu'un résumé de chaîne lit d'une mesure, qu'elle vienne de l'API ou de la lecture publique. */
export type MeasureSummary = Pick<ChannelMeasure, "median" | "small"> & {
  shorts: Pick<ScoredShort, "title" | "url" | "score" | "views" | "young">[];
};

/** Résumé rangé dans l'étude : les cinq meilleurs scores. */
export function channelStat(handle: string, title: string, measure: MeasureSummary): ChannelStat {
  const top = measure.shorts
    .filter((video) => video.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, 5)
    .map((video) => ({ title: video.title, url: video.url, score: video.score as number, views: video.views, young: video.young }));
  return { handle, title, shorts: measure.shorts.length, median: measure.median, small: measure.small, top };
}

/** Ses propres succès récents (≥ 3 × sa médiane, moins de deux semaines) : à refaire. */
export function recentHits(measure: ChannelMeasure, now = Date.now()) {
  return measure.shorts
    .filter((video) => signalOf(video.score) === "signal" && now - time(video) <= REMAKE_WINDOW_MS)
    .map((video) => ({ title: video.title, url: video.url, score: video.score as number, ...(video.publishedAt ? { publishedAt: video.publishedAt } : {}) }));
}

/** Un seul succès, ou une seule chaîne : un pari. Trois succès sur au moins deux chaînes : une recette. */
export function conceptStatus(concept: Pick<Concept, "proofs">): ConceptStatus {
  const strong = concept.proofs.filter((proof) => proof.score >= SIGNAL_SCORE);
  const channels = new Set(strong.map((proof) => proof.channel.toLowerCase()));
  return strong.length >= 3 && channels.size >= 2 ? "recipe" : "bet";
}

/** « 4,2 × » à la française. */
export function formatScore(score: number): string {
  return `${score.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ×`;
}
