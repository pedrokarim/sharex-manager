/**
 * Changer la voix d'une piste : chaque extrait est relu avec une autre voix
 * (côté serveur), puis remplacé ici en une seule modification du projet.
 *
 * Chaque extrait garde sa place et son instant de départ ; sa durée suit la
 * nouvelle lecture. Les sous-titres animés liés à l'extrait reprennent les
 * nouveaux mots horodatés.
 */

import { msToFrames } from "./timeline";
import type { AudioItem, ClipItem, ClipProject, MediaSource, Track } from "./types";

/** Extrait d'une voix de synthèse (texte gardé, mots horodatés ou nom « Voix … »). */
export function isVoiceItem(item: ClipItem): item is AudioItem {
  return item.type === "audio" && Boolean(item.source.speech || item.source.words?.length || /^Voix\s/.test(item.source.name));
}

/** Piste qui porte au moins une voix de synthèse. */
export function isVoiceTrack(track: Track): boolean {
  return track.kind === "audio" && track.items.some(isVoiceItem);
}

/** Extraits de voix d'une piste, dans l'ordre de la timeline. */
export function voiceItemsOf(project: ClipProject, trackId: string): AudioItem[] {
  const track = project.tracks.find((entry) => entry.id === trackId);
  if (!track) return [];
  return track.items.filter(isVoiceItem).sort((a, b) => a.start - b.start);
}

export interface VoiceReplacement {
  itemId: string;
  source: MediaSource;
}

/**
 * Remplace le son des extraits indiqués. Les sous-titres liés à un extrait
 * (`karaoke.voiceId`) sont recalés : un seul morceau est gardé, le plus tôt,
 * sur toute la nouvelle durée ; les autres morceaux d'un sous-titre scindé
 * disparaissent, car leurs coupes ne correspondent plus à rien.
 */
export function applyVoiceReplacements(
  project: ClipProject,
  trackId: string,
  replacements: VoiceReplacement[]
): { project: ClipProject; overlaps: number } {
  const sources = new Map(replacements.map((entry) => [entry.itemId, entry.source]));
  const changed = new Map<string, AudioItem>();
  const fps = project.fps;

  let tracks = project.tracks.map((track) => {
    if (track.id !== trackId) return track;
    return {
      ...track,
      items: track.items.map((item) => {
        const source = sources.get(item.id);
        if (!source || item.type !== "audio") return item;
        const next: AudioItem = {
          ...item,
          source,
          trimStart: 0,
          duration: Math.max(1, msToFrames(source.durationMs ?? 0, fps)),
        };
        changed.set(item.id, next);
        return next;
      }),
    };
  });
  if (changed.size === 0) return { project, overlaps: 0 };

  // Morceau de sous-titre gardé pour chaque voix : le plus tôt.
  const kept = new Map<string, { id: string; start: number }>();
  for (const item of tracks.flatMap((track) => track.items)) {
    const voiceId = item.type === "text" ? item.karaoke?.voiceId : undefined;
    if (!voiceId || !changed.has(voiceId)) continue;
    const current = kept.get(voiceId);
    if (!current || item.start < current.start) kept.set(voiceId, { id: item.id, start: item.start });
  }

  tracks = tracks.map((track) => ({
    ...track,
    items: track.items.flatMap((item): ClipItem[] => {
      if (item.type !== "text" || !item.karaoke?.voiceId) return [item];
      const voice = changed.get(item.karaoke.voiceId);
      if (!voice) return [item];
      const words = voice.source.words ?? [];
      // Sans mots (alignement impossible) ou morceau en trop : le sous-titre part.
      if (kept.get(voice.id)?.id !== item.id || words.length === 0) return [];
      return [
        {
          ...item,
          start: voice.start,
          duration: voice.duration,
          text: words.map((word) => word.text).join(" "),
          karaoke: { ...item.karaoke, words, offset: 0 },
        },
      ];
    }),
  }));

  // Extraits devenus plus longs que l'écart avant le suivant.
  const voices = (tracks.find((track) => track.id === trackId)?.items ?? []).slice().sort((a, b) => a.start - b.start);
  let overlaps = 0;
  for (let index = 0; index + 1 < voices.length; index++) {
    if (changed.has(voices[index].id) && voices[index].start + voices[index].duration > voices[index + 1].start) overlaps++;
  }

  return { project: { ...project, tracks }, overlaps };
}
