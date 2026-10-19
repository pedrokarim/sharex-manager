/**
 * Banques de vidéos libres réunies (dossier 01 vidéo, V4.4) : Pixabay et
 * Pexels avec leur clé, Wikimedia Commons sans clé, toujours disponible.
 *
 * - Onglet « Trouver » : la banque choisie dans le panneau Médias (sélecteur
 *   à logos quand plusieurs sont utilisables).
 * - Assistant : Pixabay (avec une clé), puis Pexels (avec une clé), puis
 *   Wikimedia Commons ; la banque suivante n’est essayée que si la
 *   précédente n’a rien donné ou a échoué. Rien du tout : l’assistant se
 *   replie sur une image, comme avant.
 */

import type { AspectPreset } from "../engine/types";
import { pexelsApiKey, pixabayApiKey } from "./video-sources";
import {
  VideoSearchError,
  findSegmentVideo as findPexelsSegmentVideo,
  importFoundVideoById as importPexelsById,
  searchFoundVideos as searchPexelsFound,
  type FoundVideo,
  type FoundVideoForSegment,
  type ImportedVideo,
  type VideoOrientation,
  type VideoProviderId,
  type VideoSearchDeps,
} from "./video-search";
import { findPixabaySegmentVideo, importPixabayById, searchPixabayFound } from "./video-pixabay";
import { findWikimediaSegmentVideo, importWikimediaById, searchWikimediaFound } from "./video-wikimedia";

/** Ordre des banques : celui de l’assistant, et celui du sélecteur du panneau. */
export const VIDEO_PROVIDERS: VideoProviderId[] = ["pixabay", "pexels", "wikimedia"];

export const VIDEO_PROVIDER_LABELS: Record<VideoProviderId, string> = {
  pixabay: "Pixabay",
  pexels: "Pexels",
  wikimedia: "Wikimedia Commons",
};

export function isVideoProvider(value: unknown): value is VideoProviderId {
  return typeof value === "string" && (VIDEO_PROVIDERS as string[]).includes(value);
}

/** Clés lues pour savoir quelles banques sont utilisables ; remplaçables par les tests. */
export interface ProviderKeys {
  pexels: () => string;
  pixabay: () => string;
}

const KEYS: ProviderKeys = { pexels: pexelsApiKey, pixabay: pixabayApiKey };

/** Banques utilisables, dans l’ordre : Wikimedia Commons l’est toujours. */
export function usableVideoProviders(keys: ProviderKeys = KEYS): VideoProviderId[] {
  return VIDEO_PROVIDERS.filter((provider) => provider === "wikimedia" || Boolean(keys[provider]()));
}

/** Banque d’une vidéo d’après son identifiant (`pixabay:12`…). */
export function videoProviderOf(id: string): VideoProviderId | null {
  const prefix = String(id ?? "").split(":")[0];
  return isVideoProvider(prefix) ? prefix : null;
}

export interface ProviderDeps {
  pexels?: VideoSearchDeps;
  pixabay?: VideoSearchDeps;
  wikimedia?: VideoSearchDeps;
  keys?: ProviderKeys;
}

/** Recherche de l’onglet « Trouver » dans une banque ; sans banque précisée, la première utilisable. */
export async function searchStockVideos(
  input: { provider?: string; query: string; orientation?: string; page?: number },
  deps: ProviderDeps = {}
): Promise<FoundVideo[]> {
  const usable = usableVideoProviders(deps.keys);
  const provider = isVideoProvider(input?.provider) ? input.provider : usable[0];
  if (!usable.includes(provider)) {
    throw new VideoSearchError(`Ajoutez une clé ${VIDEO_PROVIDER_LABELS[provider]} dans « Voix en ligne », section « Sources vidéo », pour chercher sur ${VIDEO_PROVIDER_LABELS[provider]}.`, "auth");
  }
  const orientation = (["portrait", "landscape", "square"] as const).find((entry) => entry === input?.orientation) as VideoOrientation | undefined;
  const query = String(input?.query ?? "");
  if (provider === "pixabay") return searchPixabayFound({ query, orientation, page: input?.page }, deps.pixabay);
  if (provider === "wikimedia") return searchWikimediaFound({ query, orientation, page: input?.page }, deps.wikimedia);
  return searchPexelsFound({ query, orientation, page: input?.page }, deps.pexels);
}

/** Importe une vidéo désignée par son identifiant, dans la banque que l’identifiant nomme. */
export async function importStockVideoById(id: string, options: { aspect?: AspectPreset } = {}, deps: ProviderDeps = {}): Promise<ImportedVideo> {
  const provider = videoProviderOf(id);
  if (provider === "pixabay") return importPixabayById(id, options, deps.pixabay);
  if (provider === "wikimedia") return importWikimediaById(id, options, deps.wikimedia);
  if (provider === "pexels") return importPexelsById(id, options, deps.pexels);
  throw new VideoSearchError("Vidéo inconnue.", "input");
}

export type SegmentVideo = FoundVideoForSegment & { provider: VideoProviderId };

/** Recherche d’une banque pour un segment, remplaçable par les tests. */
export type SegmentFinder = (
  input: { query: string; aspect: AspectPreset; minSeconds?: number; signal?: AbortSignal }
) => Promise<FoundVideoForSegment | null>;

/**
 * Une vidéo pour un segment de l’assistant, banque après banque dans l’ordre
 * (Pixabay, Pexels, Wikimedia Commons, celles qui sont utilisables). Une
 * banque qui échoue laisse passer la suivante ; si toutes ont échoué, la
 * première erreur remonte (l’assistant la dit, puis se replie sur une image).
 * `null` quand aucune banque n’a de plan pour ce sujet.
 */
export async function findStockSegmentVideo(
  input: { query: string; aspect: AspectPreset; minSeconds?: number; signal?: AbortSignal },
  deps: ProviderDeps & { finders?: Partial<Record<VideoProviderId, SegmentFinder>> } = {}
): Promise<SegmentVideo | null> {
  const finders: Record<VideoProviderId, SegmentFinder> = {
    pixabay: (entry) => findPixabaySegmentVideo(entry, deps.pixabay),
    pexels: (entry) => findPexelsSegmentVideo(entry, deps.pexels),
    wikimedia: (entry) => findWikimediaSegmentVideo(entry, deps.wikimedia),
    ...deps.finders,
  };
  let firstError: unknown;
  for (const provider of usableVideoProviders(deps.keys)) {
    input.signal?.throwIfAborted();
    try {
      const found = await finders[provider](input);
      if (found) return { ...found, provider };
    } catch (error) {
      if (input.signal?.aborted) throw error;
      firstError ??= error;
    }
  }
  if (firstError) throw firstError;
  return null;
}
