/**
 * Concepts qui marchent (dossier 01 illustrations, étape S3) : la mesure des
 * comptes d'une niche, réduite à ce qui sort du lot.
 *
 * Chaque vidéo courte est comparée à la médiane de son **propre** compte : un
 * short à 5 fois la médiane d'un petit compte dit plus qu'un short à 1 fois
 * celle d'un gros. La médiane se prend sur les 12 vidéos qui suivent les 3
 * plus récentes (leurs vues grimpent encore), comme dans `idea-scoring.ts`.
 *
 * Une vidéo « sort du lot » à 2 fois la médiane ou plus, et seulement si la
 * médiane repose sur 8 vidéos au moins : en dessous, un compte n'a pas assez
 * d'historique pour qu'un écart veuille dire quelque chose.
 *
 * Tout est pur : aucun disque, aucun réseau.
 */

import { BASELINE_SIZE, SHORTS_PER_CHANNEL, SMALL_CHANNEL, YOUNG_SHORTS, median } from "./idea-scoring";
import { BANK_LIMITS, type NicheOutlier, type NicheService } from "./idea-types";

/** Multiple de la médiane à partir duquel une vidéo sort du lot. */
export const OUTLIER_SCORE = 2;
/** Vidéos qui doivent former la médiane pour qu'un écart compte. */
export const MIN_BASELINE = 8;
/** Vidéos au-dessus de leur médiane dont on lit le détail (date, durée, premières paroles), par compte… */
export const DETAILS_PER_ACCOUNT = 3;
/** …et pour toute l'étude : la lecture reste bornée, quelle que soit la niche. */
export const DETAILS_TOTAL = 24;

/** Une vidéo courte d'un compte, telle qu'elle a été lue. */
export interface AccountShort {
  id: string;
  title: string;
  url: string;
  views: number;
  publishedAt?: string;
  durationSeconds?: number;
}

export interface AccountMeasure {
  shorts: (AccountShort & { score: number | null; young: boolean })[];
  median: number | null;
  /** Vidéos qui ont formé la médiane. */
  baseline: number;
  /** Moins de 15 vidéos courtes : médiane fragile. */
  small: boolean;
}

/**
 * Mesure une liste déjà rangée de la plus récente à la plus ancienne, comme
 * l'onglet « Shorts » d'une chaîne lu en public : ni date ni durée, l'ordre
 * suffit à écarter les trois plus récentes de la médiane.
 */
export function measureOrdered(videos: readonly { id: string; title: string; url: string; views?: number }[]): AccountMeasure {
  const shorts = videos
    .filter((video): video is AccountShort => typeof video.views === "number" && Number.isFinite(video.views) && video.views >= 0)
    .slice(0, SHORTS_PER_CHANNEL);
  const baselineVideos = shorts.slice(YOUNG_SHORTS, YOUNG_SHORTS + BASELINE_SIZE);
  const value = median(baselineVideos.map((video) => video.views));
  const usable = value !== null && value > 0 ? value : null;
  return {
    shorts: shorts.map((video, index) => ({
      ...video,
      score: usable ? Math.round((video.views / usable) * 100) / 100 : null,
      young: index < YOUNG_SHORTS,
    })),
    median: usable,
    baseline: baselineVideos.length,
    small: shorts.length < SMALL_CHANNEL,
  };
}

/** La médiane d'un compte repose-t-elle sur assez de vidéos pour qu'un écart compte ? */
export const trustedMeasure = (measure: Pick<AccountMeasure, "median" | "baseline">) => measure.median !== null && measure.baseline >= MIN_BASELINE;

/** Vidéos d'un compte à 2 fois sa médiane ou plus, les plus fortes d'abord ; aucune si la médiane est trop maigre. */
export function outliersOf(measure: AccountMeasure, account: { channel: string; service: NicheService; own?: boolean }): NicheOutlier[] {
  if (!trustedMeasure(measure)) return [];
  return measure.shorts
    .filter((video) => typeof video.score === "number" && video.score >= OUTLIER_SCORE)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .map((video) => ({
      videoId: video.id,
      service: account.service,
      channel: account.channel,
      title: video.title,
      url: video.url,
      views: video.views,
      score: video.score as number,
      median: measure.median as number,
      ...(video.publishedAt ? { publishedAt: video.publishedAt } : {}),
      ...(video.durationSeconds ? { durationSeconds: video.durationSeconds } : {}),
      young: video.young,
      ...(account.own ? { own: true } : {}),
    }));
}

/**
 * Vidéos dont on lit le détail : les plus fortes de chaque compte (trois au
 * plus), puis les plus fortes de toute l'étude (vingt-quatre au plus). Un
 * gros compte ne prend pas toute la place.
 */
export function pickForDetails(outliers: readonly NicheOutlier[], perAccount = DETAILS_PER_ACCOUNT, total = DETAILS_TOTAL): NicheOutlier[] {
  const taken = new Map<string, number>();
  return [...outliers]
    .sort((a, b) => b.score - a.score)
    .filter((outlier) => {
      const key = outlier.channel.toLowerCase();
      const count = taken.get(key) ?? 0;
      if (count >= perAccount) return false;
      taken.set(key, count + 1);
      return true;
    })
    .slice(0, total);
}

/** Toutes les vidéos au-dessus de leur médiane d'une étude, sans doublon, les plus fortes d'abord, bornées. */
export function rankOutliers(outliers: readonly NicheOutlier[]): NicheOutlier[] {
  const seen = new Set<string>();
  return [...outliers]
    .sort((a, b) => b.score - a.score || b.views - a.views)
    .filter((outlier) => {
      const key = `${outlier.channel.toLowerCase()}/${outlier.videoId}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .slice(0, BANK_LIMITS.outliers);
}
