/**
 * Avertissements de droits d'un projet (dossier 01 quater, § 4.4) : quels
 * éléments audio du projet viennent d'un morceau de la banque qui n'est pas
 * libre de souci, et ce que l'éditeur, l'écran Exporter et l'écran Publier
 * en disent.
 *
 * Rien ici ne touche au navigateur ni à Node : les écrans s'en servent, le
 * serveur aussi (`publishRightsProblem`), les tests encore.
 */

import { createMusicItems } from "../engine/edit";
import type { AudioItem, ClipProject, MediaSource, Track } from "../engine/types";
import { TRACK_RIGHTS_LABELS, blocksPublication, needsRightsWarning, type TrackRightsNote, type TrackRightsState } from "./rights-types";

/** Ce qu'il faut d'un morceau de la banque (`MusicEntry` de `getMusic`). */
export interface RightsTrack {
  id: string;
  title: string;
  artist?: string;
  rights?: TrackRightsNote;
}

/** Un élément audio du projet dont le morceau est à signaler. */
export interface ProjectRightsWarning {
  item: AudioItem;
  track: Track;
  music: RightsTrack;
  state: TrackRightsState;
  /** Raison donnée par la banque, sinon le sens de l'état. */
  reason: string;
  since?: string;
  /** Revendiqué ou retiré : la publication demande une confirmation. */
  blocksPublication: boolean;
}

/** Un morceau en cause, avec tous les éléments du projet qui le lisent. */
export interface MusicRightsGroup {
  music: RightsTrack;
  state: TrackRightsState;
  reason: string;
  since?: string;
  blocksPublication: boolean;
  items: { item: AudioItem; track: Track }[];
}

const REF_PATTERN = /^module:clip-studio\/resources\/music\/([^/]+)\.mp3$/;
const URL_PATTERN = /\/api\/modules\/clip-studio\/data\/resources\/music\/([^/?#]+)\.mp3(?:[?#]|$)/;

/** Identifiant du morceau de la banque lu par une source, sinon `null`. */
export function musicTrackIdOf(source: Pick<MediaSource, "ref" | "url"> | undefined): string | null {
  if (!source) return null;
  const fromRef = REF_PATTERN.exec(source.ref ?? "")?.[1];
  if (fromRef) return fromRef;
  return URL_PATTERN.exec(source.url ?? "")?.[1] ?? null;
}

/** Ce que veut dire un état, quand la banque ne donne pas de raison. */
const STATE_MEANING: Record<TrackRightsState, string> = {
  clear: "Aucun blocage connu.",
  "at-risk": "Inscrit dans Content ID, ou artiste déjà revendiqué ailleurs.",
  claimed: "Revendiqué sur une de nos publications.",
  withdrawn: "Retiré d’Openverse et de Jamendo, ou licence changée.",
  unknown: "Contrôle impossible pour l’instant.",
};

/**
 * Chaque élément audio du projet dont le morceau `needsRightsWarning`, dans
 * l'ordre des pistes puis du temps. Un morceau absent de la banque, ou sans
 * note de droits, ne dit rien ; un projet absent non plus.
 */
export function projectRightsWarnings(project: Pick<ClipProject, "tracks"> | null | undefined, tracks: readonly RightsTrack[]): ProjectRightsWarning[] {
  if (!project) return [];
  const byId = new Map(tracks.map((music) => [music.id, music]));
  const warnings: ProjectRightsWarning[] = [];
  for (const track of project.tracks) {
    const items = [...track.items].sort((a, b) => a.start - b.start);
    for (const item of items) {
      if (item.type !== "audio") continue;
      const trackId = musicTrackIdOf(item.source);
      const music = trackId ? byId.get(trackId) : undefined;
      if (!music || !needsRightsWarning(music)) continue;
      const state = music.rights?.state ?? "clear";
      warnings.push({
        item,
        track,
        music,
        state,
        reason: music.rights?.reason?.trim() || STATE_MEANING[state],
        ...(music.rights?.since ? { since: music.rights.since } : {}),
        blocksPublication: blocksPublication(music),
      });
    }
  }
  return warnings;
}

/** Les avertissements regroupés par morceau, les bloquants d'abord. */
export function groupRightsWarnings(warnings: readonly ProjectRightsWarning[]): MusicRightsGroup[] {
  const groups = new Map<string, MusicRightsGroup>();
  for (const warning of warnings) {
    const group = groups.get(warning.music.id);
    if (group) {
      group.items.push({ item: warning.item, track: warning.track });
      continue;
    }
    groups.set(warning.music.id, {
      music: warning.music,
      state: warning.state,
      reason: warning.reason,
      ...(warning.since ? { since: warning.since } : {}),
      blocksPublication: warning.blocksPublication,
      items: [{ item: warning.item, track: warning.track }],
    });
  }
  return [...groups.values()].sort((a, b) => Number(b.blocksPublication) - Number(a.blocksPublication));
}

// ─── Textes ──────────────────────────────────────────────────────

const STATE_TITLE: Partial<Record<TrackRightsState, string>> = {
  "at-risk": "Musique à risque",
  claimed: "Musique revendiquée",
  withdrawn: "Musique retirée",
};

/** « Musique revendiquée : « Epic Hip-Hop » ». */
export function rightsTitle(group: Pick<MusicRightsGroup, "state" | "music">): string {
  return `${STATE_TITLE[group.state] ?? "Musique à vérifier"} : « ${group.music.title} »`;
}

/** « Revendiqué · Soundrider/Dope : la raison », pour une infobulle. */
export function rightsTooltip(warning: Pick<ProjectRightsWarning, "state" | "reason" | "music">): string {
  const artist = warning.music.artist ? ` · ${warning.music.artist}` : "";
  return `${TRACK_RIGHTS_LABELS[warning.state]}${artist} : ${warning.reason}`;
}

/** Ce qu'il faut faire, en une phrase. */
export function rightsFix(group: Pick<MusicRightsGroup, "state">): string {
  if (group.state === "claimed") return "Une vidéo qui le garde risque d’être bloquée ou privée de son : remplacez-le depuis le panneau Musique de l’éditeur.";
  if (group.state === "withdrawn") return "Sa licence ne vaut peut-être plus : remplacez-le depuis le panneau Musique de l’éditeur.";
  return "Il peut être revendiqué après la publication : remplacez-le si la vidéo doit rester visible partout.";
}

/** « Publier quand même avec ce morceau revendiqué ». */
export function rightsConfirmLabel(group: Pick<MusicRightsGroup, "state">): string {
  return group.state === "withdrawn" ? "Publier quand même avec ce morceau retiré" : "Publier quand même avec ce morceau revendiqué";
}

/** « Utilisé 3 fois dans le projet. », quand le morceau revient plusieurs fois. */
export function rightsUsage(group: Pick<MusicRightsGroup, "items">): string | null {
  return group.items.length > 1 ? `Utilisé ${group.items.length} fois dans le projet.` : null;
}

// ─── Publication ─────────────────────────────────────────────────

/** Les morceaux bloquants qui n'ont pas reçu de confirmation. */
export function unconfirmedBlockers(groups: readonly MusicRightsGroup[], confirmed: Iterable<string>): MusicRightsGroup[] {
  const ok = new Set(confirmed);
  return groups.filter((group) => group.blocksPublication && !ok.has(group.music.id));
}

/**
 * Vérification du serveur avant de mettre une publication en file : le même
 * garde-fou que l'écran Publier, qui ne doit pas être le seul. Renvoie le
 * message d'erreur, ou `null` quand rien ne bloque.
 */
export function publishRightsProblem(project: Pick<ClipProject, "tracks"> | null | undefined, tracks: readonly RightsTrack[], confirmed: unknown): string | null {
  const ids = Array.isArray(confirmed) ? confirmed.filter((value): value is string => typeof value === "string") : [];
  const missing = unconfirmedBlockers(groupRightsWarnings(projectRightsWarnings(project, tracks)), ids);
  if (missing.length === 0) return null;
  const names = missing.map((group) => `« ${group.music.title} » (${TRACK_RIGHTS_LABELS[group.state].toLowerCase()})`).join(", ");
  return `Le projet utilise ${missing.length > 1 ? "des morceaux" : "un morceau"} dont la publication demande une confirmation : ${names}. Cochez « Publier quand même » sur l’écran Publier, ou remplacez la musique.`;
}

// ─── Remplacement ────────────────────────────────────────────────

/**
 * Remplace la musique d'un élément audio par un autre morceau, sur la même
 * piste et la même plage : les éléments voisins du même morceau (la boucle
 * posée par `createMusicItems`) partent avec lui, le nouveau morceau est
 * bouclé s'il est plus court, au même volume et avec le même creux sous la
 * voix. Renvoie le projet et l'identifiant du premier nouvel élément.
 */
export function replaceMusic(project: ClipProject, itemId: string, source: MediaSource): { project: ClipProject; itemId: string | null } {
  const track = project.tracks.find((entry) => entry.items.some((item) => item.id === itemId));
  const target = track?.items.find((item) => item.id === itemId);
  if (!track || !target || target.type !== "audio") return { project, itemId: null };
  const ref = target.source.ref;
  // La suite continue d'éléments du même morceau qui contient l'élément choisi.
  const same = track.items.filter((item): item is AudioItem => item.type === "audio" && item.source.ref === ref).sort((a, b) => a.start - b.start);
  let first = same.indexOf(target);
  let last = first;
  while (first > 0 && same[first - 1].start + same[first - 1].duration >= same[first].start) first--;
  while (last < same.length - 1 && same[last].start + same[last].duration >= same[last + 1].start) last++;
  const run = same.slice(first, last + 1);
  const start = run[0].start;
  const end = run[run.length - 1].start + run[run.length - 1].duration;
  const created = createMusicItems(source, start, end, project.fps, target.volume).map((item) => (target.duck !== undefined ? { ...item, duck: target.duck } : item));
  const gone = new Set(run.map((item) => item.id));
  const tracks = project.tracks.map((entry) =>
    entry.id === track.id ? { ...entry, items: [...entry.items.filter((item) => !gone.has(item.id)), ...created].sort((a, b) => a.start - b.start) } : entry
  );
  return { project: { ...project, tracks, updatedAt: Date.now() }, itemId: created[0]?.id ?? null };
}
