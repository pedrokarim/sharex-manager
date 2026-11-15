/**
 * Régler un blocage de publication (dossier 01 quater, § 6) : le dossier du
 * blocage en données (`buildIssueBrief`), le texte de contestation écrit à
 * partir de la preuve de licence, les solutions avec leur coût, le premier
 * message de l'assistant, et les copies de projet qui portent une solution.
 *
 * L'original ne bouge jamais : remplacer la musique, retirer un passage ou
 * remplacer un visuel se fait sur une copie du projet. Rien n'est rendu,
 * publié, supprimé ni passé en privé d'ici : le rendu se fait dans le
 * navigateur (écran Exporter de la copie), sur un clic.
 */

import { listJobs } from "@/lib/connections";
import type { ClipItem, ClipProject, MediaSource } from "../engine/types";
import { listMusic, type MusicEntry } from "./music";
import { getTrackRightsRecord } from "./music-rights";
import {
  getPublicationIssue,
  listIssueFixes,
  listPublicationIssues,
  noteFixExport,
  recordIssueFix,
  findTrackForIssue,
  type IssueFix,
  type IssueFixSolution,
} from "./publication-issues";
import { isAutoPickable, issueStateText, type PublicationIssue, type TrackRightsNote } from "./rights-types";
import { musicTrackIdOf, replaceMusic } from "./rights-warnings";
import { readExports, readProject, writeProject } from "./store";

const NBSP = " ";
const SERVICE_LABELS: Record<PublicationIssue["service"], string> = { youtube: "YouTube", instagram: "Instagram", threads: "Threads" };
/** Le média revendiqué couvre toute la vidéo à partir de cette part. */
const WHOLE_VIDEO_SHARE = 0.9;
const MAX_ELEMENTS = 30;
const MAX_REPLACEMENTS = 3;

// ─── Dossier du blocage ──────────────────────────────────────────

/** Morceau de la banque cité par le dossier : état des droits et preuve de licence. */
export interface BriefMusic {
  trackId: string;
  title: string;
  artist: string;
  mood: string;
  durationMs: number;
  license: string;
  licenseUrl?: string;
  pageUrl?: string;
  /** Mention calculée par la banque. */
  credit: string;
  rights?: TrackRightsNote;
  /** Fiche Openverse du morceau (l'identifiant de la banque est celui d'Openverse). */
  openverseUrl: string;
  evidence?: { capturedAt: string; license: string; licenseUrl?: string; archiveUrl?: string; attribution: string; audioSha256?: string };
}

/** Élément du projet qui recouvre la plage en cause. */
export interface BriefElement {
  itemId: string;
  laneId: string;
  laneName: string;
  type: ClipItem["type"];
  startMs: number;
  endMs: number;
  /** Durée commune avec la plage en cause. */
  overlapMs: number;
  name: string;
  credit?: string;
  /** L'élément que vise la revendication. */
  culprit: boolean;
  music?: BriefMusic;
}

export interface BriefHistoryEntry {
  issueId: string;
  exportId: string;
  detectedAt: string;
  stateText: string;
  title?: string;
  claimant?: string;
  /** Ce qui relie ce blocage à celui-ci. */
  link: "track" | "artist" | "claimant";
}

/** Morceau proposé à la place, déjà filtré par le serveur. */
export interface ReplacementCandidate {
  trackId: string;
  title: string;
  artist: string;
  mood: string;
  durationMs: number;
  license: string;
  licenseUrl?: string;
  credit: string;
  /** Adresse d'écoute (fichier de la banque). */
  url: string;
  sameMood: boolean;
}

export type IssueSolutionId = "dispute" | "replace-music" | "trim" | "replace-visual";

export interface IssueSolution {
  id: IssueSolutionId;
  title: string;
  detail: string;
  /** Délai, nouvelle mise en ligne, ce qu'on perd. */
  cost: string;
  available: boolean;
  unavailableReason?: string;
}

export interface IssueBrief {
  issue: Omit<PublicationIssue, "raw">;
  stateText: string;
  export: { id: string; title: string; projectId: string; projectName: string; durationMs: number; projectExists: boolean };
  /** Plage en cause : celle de la revendication, sinon la place de l'élément en cause. */
  range: { startMs: number; endMs: number } | null;
  coverage: { claimedMs: number; videoMs: number; wholeVideo: boolean };
  elements: BriefElement[];
  culprit?: BriefElement;
  /** Autres blocages sur ce morceau, cet artiste ou ce demandeur. */
  history: BriefHistoryEntry[];
  /** Ce que le service permet : contester à la main, modifier la vidéo publiée dans Studio seulement, republier. */
  service: { id: PublicationIssue["service"]; label: string; disputeByApi: false; editPublishedByApi: false; republish: true };
  replacements: ReplacementCandidate[];
  dispute: { available: boolean; text?: string; reason?: string; descriptionCredit: boolean };
  solutions: IssueSolution[];
  fixes: IssueFix[];
}

const msOf = (frames: number, fps: number) => Math.round((frames / fps) * 1000);

/** « 1:04 », « 1:02:03 ». */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** L'artiste (« Soundrider/Dope ») répond-il à l'un de ces noms (« Soundrider ») ? */
export function artistMatches(artist: string, names: Iterable<string>): boolean {
  const parts = [normalize(artist), ...artist.split(/[/,&+]| feat\.? | x /i).map(normalize)].filter((part) => part.length > 1);
  for (const name of names) {
    const wanted = normalize(name);
    if (wanted.length > 1 && parts.some((part) => part === wanted || part.includes(wanted) || wanted.includes(part))) return true;
  }
  return false;
}

function briefMusic(entry: MusicEntry): BriefMusic {
  const evidence = getTrackRightsRecord(entry.id)?.evidence;
  return {
    trackId: entry.id,
    title: entry.title,
    artist: entry.artist,
    mood: entry.mood,
    durationMs: entry.durationMs,
    license: entry.license,
    ...(entry.licenseUrl ? { licenseUrl: entry.licenseUrl } : {}),
    ...(entry.pageUrl ? { pageUrl: entry.pageUrl } : {}),
    credit: entry.credit,
    ...(entry.rights ? { rights: entry.rights } : {}),
    openverseUrl: `https://api.openverse.org/v1/audio/${encodeURIComponent(entry.id)}/`,
    ...(evidence
      ? {
          evidence: {
            capturedAt: evidence.capturedAt,
            license: evidence.license,
            ...(evidence.licenseUrl ? { licenseUrl: evidence.licenseUrl } : {}),
            ...(evidence.archiveUrl ? { archiveUrl: evidence.archiveUrl } : {}),
            attribution: evidence.attribution,
            ...(evidence.audioSha256 ? { audioSha256: evidence.audioSha256 } : {}),
          },
        }
      : {}),
  };
}

/** Types d'éléments qui portent le média revendiqué. */
function mediaTypes(media: "audio" | "video" | "image" | undefined): ClipItem["type"][] {
  if (media === "image") return ["image"];
  if (media === "video") return ["video", "image"];
  return ["audio", "video"];
}

/** Ligne de la description publiée qui crédite le morceau, telle quelle. */
function creditLine(description: unknown, music: BriefMusic): string | undefined {
  if (typeof description !== "string") return undefined;
  const title = normalize(music.title);
  return description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && normalize(line).includes(title))
    ?.slice(0, 300);
}

/**
 * Le dossier du blocage (§ 6.1) : le blocage, les éléments du projet qui
 * recouvrent la plage avec l'état de leurs droits et leur preuve,
 * l'historique, ce que le service permet, et deux ou trois morceaux sans
 * souci de droits connu, de même ambiance et assez longs, CC0 d'abord,
 * d'artistes jamais revendiqués.
 */
export function buildIssueBrief(issueId: string): IssueBrief {
  const found = getPublicationIssue(issueId);
  if (!found) throw new Error("Blocage introuvable.");
  const { raw: _raw, ...issue } = found;
  const entry = readExports().find((item) => item.id === issue.exportId);
  if (!entry) throw new Error("L’export de ce blocage n’existe plus.");
  const project = readProject(entry.projectId);
  const music = listMusic();
  const byTrack = new Map(music.map((track) => [track.id, track]));
  const videoMs = entry.durationMs || 0;
  const claim = issue.claim;
  const hasRange = claim?.startMs !== undefined && claim?.endMs !== undefined && claim.endMs > claim.startMs;

  // Élément en cause : la musique de la banque retrouvée, sinon le plus long média du bon type sur la plage.
  const types = mediaTypes(claim?.media);
  const elements: BriefElement[] = [];
  if (project) {
    const fps = project.fps > 0 ? project.fps : 30;
    const bankMatch = !claim || claim.media === "audio" ? findTrackForIssue(issue.exportId, claim) : null;
    for (const lane of project.tracks) {
      for (const item of lane.items) {
        if (!types.includes(item.type) || !("source" in item)) continue;
        const startMs = msOf(item.start, fps);
        const endMs = msOf(item.start + item.duration, fps);
        const overlapMs = hasRange ? Math.min(endMs, claim!.endMs!) - Math.max(startMs, claim!.startMs!) : endMs - startMs;
        if (overlapMs <= 0) continue;
        const trackId = item.type === "audio" ? musicTrackIdOf(item.source) : null;
        const bank = trackId ? byTrack.get(trackId) : undefined;
        elements.push({
          itemId: item.id,
          laneId: lane.id,
          laneName: lane.name,
          type: item.type,
          startMs,
          endMs,
          overlapMs,
          name: bank?.title ?? item.source.name,
          ...(item.source.credit ? { credit: item.source.credit } : {}),
          culprit: false,
          ...(bank ? { music: briefMusic(bank) } : {}),
        });
      }
    }
    const preferred = bankMatch ? elements.find((element) => element.itemId === bankMatch.itemId) : undefined;
    const wantedType = claim?.media === "image" ? "image" : claim?.media === "video" ? "video" : undefined;
    const culprit =
      preferred ??
      [...elements].filter((element) => !wantedType || element.type === wantedType).sort((a, b) => b.overlapMs - a.overlapMs)[0] ??
      [...elements].sort((a, b) => b.overlapMs - a.overlapMs)[0];
    if (culprit) culprit.culprit = true;
  }
  elements.sort((a, b) => Number(b.culprit) - Number(a.culprit) || b.overlapMs - a.overlapMs);
  const shown = elements.slice(0, MAX_ELEMENTS);
  const culprit = shown.find((element) => element.culprit);

  // Toute la suite d'éléments du même morceau compte : une musique bouclée est une seule musique.
  const culpritSpan = culprit
    ? (() => {
        const same = culprit.music ? shown.filter((element) => element.music?.trackId === culprit.music!.trackId) : [culprit];
        return { startMs: Math.min(...same.map((element) => element.startMs)), endMs: Math.max(...same.map((element) => element.endMs)) };
      })()
    : null;
  const range = hasRange ? { startMs: claim!.startMs!, endMs: claim!.endMs! } : culpritSpan;
  const claimedMs = range ? range.endMs - range.startMs : 0;
  const wholeVideo = videoMs > 0 && claimedMs >= videoMs * WHOLE_VIDEO_SHARE;

  // Historique et artistes déjà revendiqués.
  const others = listPublicationIssues().filter((other) => other.id !== issue.id);
  const culpritArtist = culprit?.music?.artist;
  const history: BriefHistoryEntry[] = [];
  for (const other of others) {
    const otherArtist = other.trackId ? byTrack.get(other.trackId)?.artist : undefined;
    const link: BriefHistoryEntry["link"] | null =
      culprit?.music && other.trackId === culprit.music.trackId
        ? "track"
        : culpritArtist && ((otherArtist && artistMatches(otherArtist, [culpritArtist])) || (other.claim?.onBehalfOf && artistMatches(culpritArtist, [other.claim.onBehalfOf])))
          ? "artist"
          : claim?.claimant && other.claim?.claimant && normalize(other.claim.claimant) === normalize(claim.claimant)
            ? "claimant"
            : null;
    if (!link) continue;
    history.push({
      issueId: other.id,
      exportId: other.exportId,
      detectedAt: other.detectedAt,
      stateText: issueStateText(other),
      ...(other.claim?.title ? { title: other.claim.title } : {}),
      ...(other.claim?.claimant ? { claimant: other.claim.claimant } : {}),
      link,
    });
  }
  const claimedArtists = new Set<string>();
  for (const track of music) if (track.rights && !isAutoPickable(track)) claimedArtists.add(track.artist);
  for (const entryIssue of [issue, ...others]) {
    const artist = entryIssue.trackId ? byTrack.get(entryIssue.trackId)?.artist : undefined;
    if (artist) claimedArtists.add(artist);
    if (entryIssue.claim?.onBehalfOf) claimedArtists.add(entryIssue.claim.onBehalfOf);
  }
  if (culpritArtist) claimedArtists.add(culpritArtist);

  const replacements = culprit?.music ? pickReplacements(music, culprit.music, culpritSpan ? culpritSpan.endMs - culpritSpan.startMs : claimedMs, claimedArtists) : [];

  // Contestation : la description réellement publiée, lue dans la file.
  const job = listJobs({ ids: [issue.jobId] })[0];
  const mention = culprit?.music ? creditLine(job?.options?.description, culprit.music) : undefined;
  const dispute = culprit?.music
    ? { available: true, text: buildDisputeText({ music: culprit.music, ...(mention ? { mention } : {}) }), descriptionCredit: Boolean(mention) }
    : {
        available: false,
        descriptionCredit: false,
        reason: culprit ? "Le média en cause ne vient pas de la banque de musique : aucune preuve de licence à citer." : "Le média en cause n’a pas été retrouvé dans le projet.",
      };

  const brief: IssueBrief = {
    issue,
    stateText: issueStateText(issue),
    export: { id: entry.id, title: entry.post?.base?.title?.trim() || entry.projectName, projectId: entry.projectId, projectName: entry.projectName, durationMs: videoMs, projectExists: Boolean(project) },
    range,
    coverage: { claimedMs, videoMs, wholeVideo },
    elements: shown,
    ...(culprit ? { culprit } : {}),
    history,
    service: { id: issue.service, label: SERVICE_LABELS[issue.service], disputeByApi: false, editPublishedByApi: false, republish: true },
    replacements,
    dispute,
    solutions: [],
    fixes: listIssueFixes({ issueId: issue.id }),
  };
  brief.solutions = issueSolutions(brief);
  return brief;
}

/**
 * Morceaux proposés à la place : sans souci de droits connu, téléchargés,
 * assez longs, d'artistes jamais revendiqués ; même ambiance d'abord, CC0
 * avant CC BY, puis la durée la plus proche.
 */
function pickReplacements(music: MusicEntry[], current: BriefMusic, neededMs: number, claimedArtists: Set<string>): ReplacementCandidate[] {
  const usable = music.filter(
    (track) => track.id !== current.trackId && Boolean(track.url) && isAutoPickable(track) && track.durationMs >= neededMs && !artistMatches(track.artist, claimedArtists)
  );
  const cc0 = (track: MusicEntry) => (/^cc0/i.test(track.license) ? 0 : 1);
  const order = (a: MusicEntry, b: MusicEntry) => cc0(a) - cc0(b) || a.durationMs - b.durationMs || a.title.localeCompare(b.title);
  const same = usable.filter((track) => track.mood === current.mood).sort(order);
  const other = usable.filter((track) => track.mood !== current.mood).sort(order);
  const chosen = same.length >= 2 ? same.slice(0, MAX_REPLACEMENTS) : [...same, ...other].slice(0, MAX_REPLACEMENTS);
  return chosen.map((track) => ({
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    mood: track.mood,
    durationMs: track.durationMs,
    license: track.license,
    ...(track.licenseUrl ? { licenseUrl: track.licenseUrl } : {}),
    credit: track.credit,
    url: track.url!,
    sameMood: track.mood === current.mood,
  }));
}

// ─── Contestation ────────────────────────────────────────────────

/**
 * Texte de contestation en anglais, motif « licence », écrit à partir de la
 * preuve seulement : licence, fiche Openverse, archive, date d'entrée dans la
 * banque, mention de la description publiée. Rien n'y est supposé.
 */
export function buildDisputeText(input: { music: BriefMusic; mention?: string }): string {
  const { music, mention } = input;
  const license = music.evidence?.license || music.license;
  const licenseUrl = music.evidence?.licenseUrl || music.licenseUrl;
  const cc0 = /^cc0/i.test(license);
  const lines: string[] = [
    "I have a license to use this music.",
    "",
    cc0
      ? `This video uses "${music.title}" by ${music.artist}, which the author dedicated to the public domain under ${license}${licenseUrl ? ` (${licenseUrl})` : ""}. Anyone may use it, including commercially, without permission.`
      : `This video uses "${music.title}" by ${music.artist}, which the author published under the Creative Commons license ${license}${licenseUrl ? ` (${licenseUrl})` : ""}. This license allows any use, including commercial use, as long as the author is credited.`,
    "",
    `Openverse record of the track: ${music.openverseUrl}`,
  ];
  if (music.evidence?.archiveUrl) lines.push(`Archived copy of that record: ${music.evidence.archiveUrl}`);
  if (music.pageUrl) lines.push(`Original page of the track: ${music.pageUrl}`);
  if (music.evidence?.capturedAt) lines.push(`The license was recorded when the track entered my music library, on ${music.evidence.capturedAt.slice(0, 10)}.`);
  if (mention) lines.push("", `The video description credits the work as the license requires: "${mention}"`);
  if (/^cc by 3\.0$/i.test(license.trim())) lines.push("", "Section 7(b) of the CC BY 3.0 license states that the license is perpetual for the work received under it.");
  return lines.join("\n");
}

// ─── Solutions ───────────────────────────────────────────────────

const REPUBLISH_COST = `Nouveau rendu (quelques minutes) et nouvelle mise en ligne${NBSP}: la nouvelle vidéo repart de zéro vue et sans commentaire, la vidéo bloquée garde les siens.`;

/** Les solutions du § 6.2, avec leur coût, celles qui ne valent pas ici marquées indisponibles. */
export function issueSolutions(brief: Pick<IssueBrief, "culprit" | "coverage" | "replacements" | "dispute" | "issue" | "export" | "service">): IssueSolution[] {
  const culprit = brief.culprit;
  const visual = brief.issue.claim?.media === "video" || brief.issue.claim?.media === "image";
  const noProject = brief.export.projectExists ? undefined : "Le projet de cet export n’existe plus.";
  return [
    {
      id: "dispute",
      title: "Contester",
      detail: `Texte de contestation en anglais, motif «${NBSP}licence${NBSP}», à déposer dans ${brief.service.label} Studio.`,
      cost: `Aucun nouvel envoi. La vidéo reste bloquée jusqu’à la réponse du demandeur, qui a 30${NBSP}jours${NBSP}; s’il rejette et qu’on fait appel, il peut demander un retrait, qui donne un avertissement.`,
      available: brief.dispute.available,
      ...(brief.dispute.available ? {} : { unavailableReason: brief.dispute.reason }),
    },
    {
      id: "replace-music",
      title: "Remplacer la musique",
      detail: "Une copie du projet reçoit l’un des morceaux proposés, au même volume et sur la même plage, puis s’ouvre dans l’écran Exporter.",
      cost: REPUBLISH_COST,
      available: Boolean(culprit?.music) && brief.replacements.length > 0 && !noProject,
      ...(noProject
        ? { unavailableReason: noProject }
        : !culprit?.music
          ? { unavailableReason: "La revendication ne porte pas sur une musique de la banque." }
          : brief.replacements.length === 0
            ? { unavailableReason: "Aucun morceau de la banque n’est assez long, sans souci de droits et d’un artiste jamais revendiqué." }
            : {}),
    },
    {
      id: "trim",
      title: "Retirer le passage",
      detail: "Une copie du projet s’ouvre dans l’éditeur sur l’élément en cause, pour le couper ou le retirer.",
      cost: `${REPUBLISH_COST} La vidéo perd le passage revendiqué.`,
      available: Boolean(culprit) && !brief.coverage.wholeVideo && !noProject,
      ...(noProject ? { unavailableReason: noProject } : brief.coverage.wholeVideo ? { unavailableReason: "Le média revendiqué couvre toute la vidéo." } : !culprit ? { unavailableReason: "Le média en cause n’a pas été retrouvé dans le projet." } : {}),
    },
    {
      id: "replace-visual",
      title: "Remplacer le visuel",
      detail: "Une copie du projet s’ouvre dans l’éditeur sur la vidéo ou l’image en cause, à remplacer par une autre (onglet « Trouver »).",
      cost: REPUBLISH_COST,
      available: visual && Boolean(culprit) && !noProject,
      ...(noProject ? { unavailableReason: noProject } : !visual ? { unavailableReason: "La revendication porte sur le son." } : !culprit ? { unavailableReason: "Le visuel en cause n’a pas été retrouvé dans le projet." } : {}),
    },
  ];
}

// ─── Premier message de l'assistant ──────────────────────────────

/**
 * Ce que l'assistant dit en premier, sans Codex : le média, la plage, le
 * demandeur, ce que le média couvre, l'effet, puis les solutions
 * numérotées (jamais un morceau revendiqué ou retiré : la liste vient du
 * serveur, déjà filtrée).
 */
export function issueOpening(brief: IssueBrief): { text: string; solutions: string[] } {
  const culprit = brief.culprit;
  const claim = brief.issue.claim;
  const noun = culprit?.music
    ? { label: `La musique «${NBSP}${culprit.music.title}${NBSP}»`, pronoun: "elle", feminine: true }
    : culprit?.type === "image"
      ? { label: `L’image «${NBSP}${culprit.name}${NBSP}»`, pronoun: "elle", feminine: true }
      : culprit?.type === "video"
        ? { label: `La vidéo «${NBSP}${culprit.name}${NBSP}»`, pronoun: "elle", feminine: true }
        : culprit
          ? { label: `Le son «${NBSP}${culprit.name}${NBSP}»`, pronoun: "il", feminine: false }
          : { label: claim?.title ? `Le contenu «${NBSP}${claim.title}${NBSP}»` : "Un contenu du clip", pronoun: "il", feminine: false };
  const range = brief.range ? ` de ${clockText(brief.range.startMs)} à ${clockText(brief.range.endMs)}` : "";
  const by = claim?.claimant ? ` par ${claim.claimant}${claim.onBehalfOf ? ` pour ${claim.onBehalfOf}` : ""}` : claim?.onBehalfOf ? ` pour ${claim.onBehalfOf}` : "";
  const covers = brief.range
    ? brief.coverage.wholeVideo
      ? `${NBSP}; ${noun.pronoun} couvre toute la vidéo`
      : `${NBSP}; ${noun.pronoun} couvre ${clockText(brief.coverage.claimedMs)} sur ${clockText(brief.coverage.videoMs)}`
    : "";
  const claimedWord = noun.feminine ? "revendiquée" : "revendiqué";
  // Content ID peut nommer le morceau autrement que la banque (« Memories » pour « Epic Hip-Hop »).
  const named = claim?.title && culprit && normalize(claim.title) !== normalize(culprit.name) ? ` Le titre revendiqué est «${NBSP}${claim.title}${NBSP}».` : "";
  const lines = [
    `${noun.label} est ${claimedWord}${range}${by}${covers}.${named}`,
    `Effet sur ${brief.service.label}${NBSP}: ${brief.stateText.toLowerCase()}.`,
  ];
  if (brief.history.length > 0) {
    const tracks = brief.history.filter((entry) => entry.link === "track").length;
    const artist = brief.history.filter((entry) => entry.link === "artist").length;
    const claimant = brief.history.filter((entry) => entry.link === "claimant").length;
    const parts = [tracks ? `${tracks} sur ce morceau` : "", artist ? `${artist} sur cet artiste` : "", claimant ? `${claimant} par ce demandeur` : ""].filter(Boolean);
    lines.push(`Autres blocages déjà relevés${NBSP}: ${parts.join(", ")}.`);
  }
  lines.push(`Je travaille sur une copie du projet${NBSP}: l’original et la vidéo publiée ne bougent pas, et rien n’est rendu ni publié sans votre clic. Dites le numéro de la solution, ou ce qu’il faut changer.`);

  const solutions: string[] = [];
  for (const solution of brief.solutions) {
    if (!solution.available) continue;
    if (solution.id === "dispute") solutions.push(`Contester (motif «${NBSP}licence${NBSP}»)${NBSP}: le texte est prêt sur la fiche de l’export, à déposer dans ${brief.service.label} Studio. ${solution.cost}`);
    else if (solution.id === "replace-music") {
      const names = brief.replacements.map((track) => `«${NBSP}${track.title}${NBSP}» (${track.artist}, ${track.license}, ${clockText(track.durationMs)})`).join(", ");
      solutions.push(`Remplacer la musique par ${names}${NBSP}: bouton «${NBSP}Remplacer${NBSP}» du panneau Musique, ou «${NBSP}Régler ce blocage${NBSP}» sur la fiche de l’export. ${solution.cost}`);
    } else if (solution.id === "trim") solutions.push(`Retirer le passage de ${range.replace(/^ de /, "")}${NBSP}: je peux couper ou retirer l’élément ici. ${solution.cost}`);
    else solutions.push(`Remplacer le visuel en cause par une autre vidéo ou image (onglet «${NBSP}Trouver${NBSP}» du panneau Médias). ${solution.cost}`);
  }
  return { text: lines.join("\n"), solutions };
}

/** Le dossier tel que Codex le relit : sans le texte de contestation ni les copies, borné. */
export function briefForAssistant(brief: IssueBrief) {
  return {
    issue: { service: brief.issue.service, kind: brief.issue.kind, scope: brief.issue.scope, claim: brief.issue.claim, detectedAt: brief.issue.detectedAt, source: brief.issue.source, resolution: brief.issue.resolution },
    stateText: brief.stateText,
    range: brief.range,
    coverage: brief.coverage,
    elements: brief.elements.map((element) => ({
      itemId: element.itemId,
      trackId: element.laneId,
      type: element.type,
      start: element.startMs / 1000,
      end: element.endMs / 1000,
      name: element.name,
      culprit: element.culprit,
      ...(element.music ? { music: { title: element.music.title, artist: element.music.artist, license: element.music.license, rights: element.music.rights?.state ?? "clear", evidence: Boolean(element.music.evidence) } } : {}),
    })),
    history: brief.history,
    service: brief.service,
    replacements: brief.replacements.map((track) => ({ title: track.title, artist: track.artist, license: track.license, mood: track.mood, seconds: Math.round(track.durationMs / 1000), rights: "clear" })),
    dispute: { available: brief.dispute.available, descriptionCredit: brief.dispute.descriptionCredit },
    solutions: brief.solutions.filter((solution) => solution.available).map((solution) => ({ id: solution.id, title: solution.title, cost: solution.cost })),
  };
}

// ─── Copies ──────────────────────────────────────────────────────

const COPY_SUFFIX: Record<IssueFixSolution, string> = {
  "replace-music": "musique remplacée",
  trim: "passage à retirer",
  "replace-visual": "visuel à remplacer",
  assistant: "blocage à régler",
};

const newProjectId = () => `clip-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface IssueFixResult {
  fix: IssueFix;
  /** Écran à ouvrir : Exporter pour une musique remplacée, l'éditeur sinon. */
  href: string;
}

/** Source d'un morceau de la banque, comme l'assistant de création la pose. */
function musicSource(track: ReplacementCandidate): MediaSource {
  return { url: track.url, ref: `module:clip-studio/resources/music/${track.trackId}.mp3`, name: `${track.title} – ${track.artist}`, kind: "audio", durationMs: track.durationMs, credit: track.credit };
}

/**
 * Remplace chaque élément du morceau `trackId` par `source` (`replaceMusic` :
 * même piste, même plage, même volume, même creux sous la voix). Rend le
 * projet changé et le nombre de suites remplacées.
 */
export function replaceTrackEverywhere(project: ClipProject, trackId: string, source: MediaSource): { project: ClipProject; replaced: number } {
  let current = project;
  let replaced = 0;
  for (let guard = 0; guard < 50; guard++) {
    const item = current.tracks.flatMap((lane) => lane.items).find((entry) => entry.type === "audio" && musicTrackIdOf(entry.source) === trackId);
    if (!item) break;
    const next = replaceMusic(current, item.id, source);
    if (!next.itemId) break;
    current = next.project;
    replaced++;
  }
  return { project: current, replaced };
}

/**
 * Crée la copie du projet qui porte une solution, et la relie au blocage.
 * L'original n'est jamais écrit. `trackId` : morceau choisi parmi ceux que
 * le dossier propose (contrôlé ici, jamais pris tel quel du navigateur).
 */
export function createIssueFix(input: { issueId: string; solution: IssueFixSolution; trackId?: string }): IssueFixResult {
  const solution = (["replace-music", "trim", "replace-visual", "assistant"] as const).find((entry) => entry === input?.solution);
  if (!solution) throw new Error("Solution inconnue.");
  const brief = buildIssueBrief(String(input?.issueId ?? ""));
  const original = readProject(brief.export.projectId);
  if (!original) throw new Error("Le projet de cet export n’existe plus.");
  const wanted = brief.solutions.find((entry) => entry.id === solution);
  if (wanted && !wanted.available) throw new Error(wanted.unavailableReason ?? "Cette solution ne vaut pas pour ce blocage.");

  // Une copie de l'assistant déjà faite et toujours là est rouverte.
  if (solution === "assistant") {
    const existing = brief.fixes.find((fix) => fix.solution === "assistant" && readProject(fix.projectId));
    if (existing) return { fix: existing, href: `/m/clip-studio/edit?id=${encodeURIComponent(existing.projectId)}&issue=${encodeURIComponent(brief.issue.id)}` };
  }

  const now = Date.now();
  let copy: ClipProject = {
    ...structuredClone(original),
    id: newProjectId(),
    name: `${original.name} (${COPY_SUFFIX[solution]})`.slice(0, 200),
    createdAt: now,
    updatedAt: now,
  };
  let replacementTrackId: string | undefined;
  if (solution === "replace-music") {
    const choice = brief.replacements.find((track) => track.trackId === input.trackId);
    if (!choice) throw new Error("Ce morceau n’est pas proposé pour ce blocage.");
    const culpritTrack = brief.culprit?.music?.trackId;
    if (!culpritTrack) throw new Error("La musique en cause n’a pas été retrouvée dans le projet.");
    const result = replaceTrackEverywhere(copy, culpritTrack, musicSource(choice));
    if (result.replaced === 0) throw new Error("La musique en cause n’est plus dans le projet.");
    copy = { ...result.project, updatedAt: now };
    replacementTrackId = choice.trackId;
  }
  writeProject(copy);
  const fix = recordIssueFix({ issueId: brief.issue.id, solution, projectId: copy.id, projectName: copy.name, ...(replacementTrackId ? { replacementTrackId } : {}) });
  const item = brief.culprit?.itemId;
  const href =
    solution === "replace-music"
      ? `/m/clip-studio/export?project=${encodeURIComponent(copy.id)}`
      : solution === "assistant"
        ? `/m/clip-studio/edit?id=${encodeURIComponent(copy.id)}&issue=${encodeURIComponent(brief.issue.id)}`
        : `/m/clip-studio/edit?id=${encodeURIComponent(copy.id)}${item ? `&item=${encodeURIComponent(item)}` : ""}`;
  return { fix, href };
}

/**
 * Un export vient d'être rendu : s'il vient d'une copie faite pour un
 * blocage, le blocage passe réglé avec le lien vers ce nouvel export. Pour
 * une copie de l'assistant, seul un changement décisif compte : le morceau
 * en cause n'y est plus (musique remplacée), ou il ne touche plus la plage
 * revendiquée (passage coupé).
 */
export function noteIssueFixExport(projectId: string, exportId: string): PublicationIssue[] {
  return noteFixExport(projectId, exportId, (fix, issue) => {
    if (fix.solution === "trim") return "trimmed";
    if (fix.solution !== "assistant") return "replaced";
    const copy = readProject(fix.projectId);
    if (!copy || !issue.trackId) return null;
    const fps = copy.fps > 0 ? copy.fps : 30;
    const items = copy.tracks.flatMap((lane) => lane.items).filter((item) => item.type === "audio" && musicTrackIdOf(item.source) === issue.trackId);
    if (items.length === 0) return "replaced";
    const claim = issue.claim;
    if (claim?.startMs === undefined || claim?.endMs === undefined) return null;
    const touches = items.some((item) => msOf(item.start, fps) < claim.endMs! && msOf(item.start + item.duration, fps) > claim.startMs!);
    return touches ? null : "trimmed";
  });
}
