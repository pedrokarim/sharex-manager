/**
 * Quotas de l'API YouTube Data v3, en une seule table pour suivre un
 * changement de Google en une ligne.
 *
 * D'après la documentation de l'API (pages « Quota calculator » et
 * `videos.insert`, mises à jour le 08/10/2026, vérifiées le 11/10/2026) :
 * - `videos.insert` est compté dans son propre compartiment « Video
 *   Uploads » : 1 unité par envoi, 100 envois par jour par défaut ;
 * - le reste partage le compartiment général, 10 000 unités par jour :
 *   50 unités pour une écriture, 1 pour une lecture.
 * La remise à zéro a lieu à minuit, heure du Pacifique.
 */

import type { QuotaBucket } from "../../types";
import { zonedDay, zonedMidnightAfter } from "../../quota";

export const YOUTUBE_TIME_ZONE = "America/Los_Angeles";

export const YOUTUBE_BUCKETS: QuotaBucket[] = [
  { id: "uploads", label: "Envois de vidéos", limit: 100 },
  { id: "general", label: "Unités de l’API", limit: 10_000 },
];

const COSTS: Record<string, { bucket: string; units: number }> = {
  "videos.insert": { bucket: "uploads", units: 1 },
  "videos.list": { bucket: "general", units: 1 },
  "channels.list": { bucket: "general", units: 1 },
  "playlistItems.list": { bucket: "general", units: 1 },
  "videos.update": { bucket: "general", units: 50 },
  "videos.delete": { bucket: "general", units: 50 },
  "channels.update": { bucket: "general", units: 50 },
  "channelBanners.insert": { bucket: "general", units: 50 },
  "watermarks.set": { bucket: "general", units: 50 },
  "thumbnails.set": { bucket: "general", units: 50 },
};

export function youtubeCost(method: string): { bucket: string; units: number } {
  // Une méthode oubliée dans la table est comptée comme une écriture : mieux
  // vaut surestimer que se faire couper par Google en plein travail.
  return COSTS[method] ?? { bucket: "general", units: 50 };
}

export const youtubeQuota = {
  buckets: YOUTUBE_BUCKETS,
  cost: youtubeCost,
  day: (now: number) => zonedDay(now, YOUTUBE_TIME_ZONE),
  nextReset: (now: number) => zonedMidnightAfter(now, YOUTUBE_TIME_ZONE),
};
