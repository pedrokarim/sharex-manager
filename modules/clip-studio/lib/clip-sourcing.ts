/**
 * Extraits de vraies vidéos pour l'assistant (dossier 01 vidéo, V5).
 *
 * Quand le script demande, pour un segment, un extrait d'une vidéo réelle
 * (`kind: "clip"` : la bande-annonce d'un jeu, l'interview d'une personne, un
 * clip Twitch), ce module le trouve et le coupe, sans intervention :
 *
 * 1. **Recherche** : YouTube par yt-dlp (`ytsearch6:`), sinon (site Twitch,
 *    YouTube qui refuse le serveur, rien de bon) Codex cherche sur le web des
 *    adresses YouTube ou Twitch, contrôlées par les règles de
 *    `remote-import.ts`. Les candidates sont classées sans IA : mots du titre,
 *    chaîne officielle, durée, vues ; réactions, critiques et compilations
 *    passent après.
 * 2. **Analyse** d'une fenêtre de la vidéo en basse définition (480p au plus,
 *    la vidéo entière jusqu'à 6 minutes, ses 10 premières minutes sinon) :
 *    - une **citation** (`keepAudio` et `quote`) : la fenêtre est transcrite
 *      (mots gardés par adresse), la phrase est retrouvée mot à mot, avec
 *      tolérance (`locateQuote`) ;
 *    - un **extrait muet** (ou un son qui compte sans parole) : les images
 *      sont échantillonnées, l'écart entre deux images successives mesure le
 *      mouvement et les coupes (`brand-kit/lib/reference-analysis.ts`), et la
 *      fenêtre la plus vivante est retenue, hors des 5 premiers pour cent
 *      (logos, introductions) et des 10 derniers (cartons de fin).
 * 3. **Coupe** : seul le passage retenu est récupéré, à l'image près, en
 *    H.264 et AAC, 1080p au plus, puis rangé comme média du module avec sa
 *    provenance, sa mention et `rights: "unverified"`.
 *
 * Mêmes garde-fous que la récupération par adresse : aucun shell, adresses
 * contrôlées, lectures d'adresse dans la porte commune (deux à la fois, vingt
 * par minute), deux téléchargements d'extraits à la fois, tailles bornées
 * dans ffmpeg, place libre et budget des médias venus d'ailleurs contrôlés,
 * dossiers de travail cachés vidés après usage. Les cookies YouTube ne sont
 * jamais écrits dans un journal.
 *
 * Un extrait qui ne se trouve pas ne fait jamais échouer le clip : la raison
 * est rendue, et l'assistant se replie (vidéo libre, image, génération).
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import { childEnv } from "@/lib/child-env";
import { ensureFfmpeg } from "@/lib/media/ffmpeg";
import { downloadSection, searchYoutube, YtDlpError, type SearchEntry } from "@/lib/media/ytdlp";
import { detectCuts, frameDistance, type GrayFrame } from "@/modules/brand-kit/lib/reference-analysis";
import type { ClipAsset, MediaOrigin, MediaSource, TimedWord, TranscriptInfo } from "../engine/types";
import { askCodex, extractJson } from "./codex";
import { assertDiskSpace, holdWorkDir, publicErrorMessage } from "./job-safety";
import {
  PROBE_BUSY_MESSAGE,
  PROBE_RATE_MESSAGE,
  enforceRemoteBudget,
  finalizeArgs,
  inspect,
  parseRemoteUrl,
  probeRemote,
  remoteCredit,
  runFfmpeg,
  sharedProbeGate,
  siteLabel,
  type RemoteProbe,
} from "./remote-import";
import { ASSETS_DIR, DATA_DIR, ensureDirs, readAssets, writeAssets } from "./store";
import { transcribeMediaFile, wordKey } from "./transcribe";
import { copyYoutubeCookies, hasYoutubeCookies, markCookiesRejected, youtubeCookiesRejectedAt } from "./video-sources";

// ─── Bornes ──────────────────────────────────────────────────────

export const CLIP_LIMITS = {
  /** Extraits de vraies vidéos au plus dans un clip. */
  maxClips: 6,
  /** Part de la durée visée que le son gardé des extraits peut occuper. */
  quotedShare: 0.35,
  /** Durée d'un extrait, en secondes. */
  minSeconds: 1.5,
  maxSeconds: 12,
  /** Résultats de recherche lus, candidates essayées. */
  searchResults: 6,
  candidatesTried: 2,
  /** Une vidéo plus courte n'a rien à montrer ; plus longue, ce n'est plus une vidéo à citer. */
  minVideoSeconds: 8,
  maxVideoSeconds: 3 * 60 * 60,
  /** Vidéo analysée en entier jusqu'à cette durée, sinon ses premières minutes. */
  analysisWholeSeconds: 6 * 60,
  analysisWindowSeconds: 10 * 60,
  analysisHeight: 480,
  analysisMaxBytes: 300 * 1024 * 1024,
  /** Extrait coupé : 1080p au plus, fichier borné. */
  clipHeight: 1080,
  clipMaxBytes: 150 * 1024 * 1024,
  /** Marge autour d'une citation, en secondes. */
  quoteMargin: 0.3,
  /** Suite muette gardée après une citation, sous la voix off du segment. */
  maxTailSeconds: 8,
  /** Début et fin de vidéo écartés pour un extrait muet (logos, cartons de fin). */
  introShare: 0.05,
  outroShare: 0.1,
  /** Téléchargements d'extraits simultanés, pour tout le serveur. */
  downloads: 2,
  /** Images par seconde de l'analyse du mouvement, et leur côté (carré, gris). */
  analysisFps: 4,
  analysisSide: 64,
} as const;

/** Sites où chercher un extrait. */
export type ClipSite = "youtube" | "twitch" | "any";
export const CLIP_SITES: readonly ClipSite[] = ["youtube", "twitch", "any"];

/** Extrait demandé par le script pour un segment. */
export interface ClipRequest {
  /** Requête de recherche (« Elden Ring Nightreign official trailer »). */
  search: string;
  site: ClipSite;
  /** Ce qu'on doit voir ou entendre. */
  moment: string;
  /** Mots exacts à entendre, quand le son est gardé pour une parole. */
  quote?: string;
  /** Le son d'origine compte : on l'entend, la voix off attend. */
  keepAudio: boolean;
  /** Durée voulue, en secondes (1,5 à 12). */
  seconds: number;
}

/** Ce que le suivi de l'assistant montre pour un segment qui demandait un extrait. */
export interface ClipOutcome {
  segment: number;
  search: string;
  site: ClipSite;
  moment: string;
  quote?: string;
  /** Le script voulait entendre le son d'origine. */
  wantedAudio: boolean;
  status: "found" | "fallback";
  /** Le son d'origine est gardé dans le montage. */
  keepAudio?: boolean;
  /** Vidéo d'où vient l'extrait, et le passage pris, en secondes de la vidéo. */
  video?: { site: "youtube" | "twitch"; url: string; title: string; author?: string; start: number; end: number };
  /** Adresse du média coupé (aperçu dans le suivi). */
  mediaUrl?: string;
  /** Durée de l'extrait, et de la citation quand le son est gardé, en secondes. */
  seconds?: number;
  quoteSeconds?: number;
  /** Ce qui s'est passé : citation introuvable, vidéo refusée, rien trouvé… */
  note?: string;
  /** Repli retenu à la place (« vidéo libre Pixabay », « image trouvée »…), écrit après les illustrations. */
  fallback?: string;
}

// ─── Lecture du script ───────────────────────────────────────────

const cleanText = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/**
 * Extrait demandé par le script, lu avec rigueur : `kind: "clip"` à plat
 * dans l'objet `image`, ou dans un objet `clip`. Sans requête, rien à
 * chercher. La durée est bornée de 1,5 à 12 s ; une citation vide n'en est
 * pas une.
 */
export function readClipRequest(image: unknown): ClipRequest | undefined {
  if (!image || typeof image !== "object") return undefined;
  const raw = image as Record<string, unknown>;
  if (raw.kind !== "clip") return undefined;
  const nested = raw.clip && typeof raw.clip === "object" ? (raw.clip as Record<string, unknown>) : {};
  const field = (name: string) => (nested[name] !== undefined ? nested[name] : raw[name]);
  const search = cleanText(field("search"), 120).replace(/["«»]/g, "").trim();
  if (search.length < 2) return undefined;
  const site = CLIP_SITES.includes(field("site") as ClipSite) ? (field("site") as ClipSite) : "any";
  const quote = cleanText(field("quote"), 300).replace(/^["«“\s]+|["»”\s]+$/g, "");
  const keepAudio = field("keepAudio") === true;
  const asked = Number(field("seconds"));
  const seconds = Number.isFinite(asked) ? Math.min(CLIP_LIMITS.maxSeconds, Math.max(CLIP_LIMITS.minSeconds, Math.round(asked * 10) / 10)) : 5;
  return {
    search,
    site,
    moment: cleanText(field("moment"), 200),
    ...(keepAudio && quote.length >= 2 ? { quote } : {}),
    keepAudio,
    seconds,
  };
}

/**
 * Budget des extraits d'un script : six au plus (les premiers gardés, les
 * suivants rendus à l'image), et un son gardé qui ne dépasse pas 35 % de la
 * durée visée (au-delà, les suivants deviennent muets). Au quiz, le minutage
 * est fixe : aucun son n'est gardé.
 */
export function applyClipBudget(clips: (ClipRequest | undefined)[], targetSeconds: number, options: { quiz?: boolean; allowAudio?: boolean } = {}): (ClipRequest | undefined)[] {
  let count = 0;
  let audio = 0;
  const budget = quoteBudgetSeconds(targetSeconds);
  return clips.map((clip) => {
    if (!clip) return undefined;
    if (count >= CLIP_LIMITS.maxClips) return undefined;
    count++;
    if (!clip.keepAudio) return clip;
    const mute = { ...clip, keepAudio: false } as ClipRequest;
    delete mute.quote;
    if (options.quiz || options.allowAudio === false) return mute;
    if (audio + clip.seconds > budget + 1e-9) return mute;
    audio += clip.seconds;
    return clip;
  });
}

/** Secondes de son d'origine permises dans un clip de `targetSeconds`. */
export function quoteBudgetSeconds(targetSeconds: number): number {
  return Math.round(Math.max(0, targetSeconds) * CLIP_LIMITS.quotedShare * 10) / 10;
}

// ─── Candidates ──────────────────────────────────────────────────

/** Une vidéo candidate, trouvée par la recherche YouTube ou par Codex. */
export interface ClipCandidate {
  url: string;
  site: "youtube" | "twitch";
  title: string;
  channel?: string;
  verified?: boolean;
  duration?: number;
  views?: number;
  unavailable?: boolean;
  from: "search" | "web";
}

const STOP = new Set(["the", "and", "for", "with", "les", "des", "une", "aux", "pour", "avec", "dans", "sur", "from", "official", "officiel", "officielle", "video", "vidéo"]);

/** Mots significatifs d'un texte : sans accents ni casse, trois lettres au moins (ou des chiffres). */
export function keyTokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => (token.length >= 3 || /^\d+$/.test(token)) && !STOP.has(token));
}

/** Titres qui parlent d'une vidéo plutôt que de la montrer : passent après, sauf si la recherche les demande. */
const SECONDHAND = /\b(reaction|reacts?|react|review|critique|test|explained|explication|tier ?list|ranking|top ?\d+|compilation|meme|parody|parodie|fan ?made|concept|leak|leaked|analysis|analyse|breakdown|podcast|livestream|stream highlights|vs\.?)\b/i;
const OFFICIAL = /\b(official|officiel|officielle|trailer|bande[- ]annonce|teaser)\b/i;
/** Mots qui disent le genre de vidéo ou l'année, pas son sujet. */
const GENERIC = /^(trailer|teaser|gameplay|official|launch|release|reveal|date|first|new|game|games|interview|clip|clips|stream|4k|hd|full|bande|annonce|extrait|\d{4})$/;


/**
 * Note d'une candidate pour un extrait : mots de la recherche retrouvés dans
 * le titre (le plus important), chaîne certifiée ou officielle, durée
 * raisonnable, popularité. `null` : à écarter (direct, réservée, trop courte
 * ou trop longue).
 */
export function scoreCandidate(candidate: ClipCandidate, request: Pick<ClipRequest, "search" | "keepAudio" | "quote">): number | null {
  if (candidate.unavailable) return null;
  if (candidate.duration !== undefined && (candidate.duration < CLIP_LIMITS.minVideoSeconds || candidate.duration > CLIP_LIMITS.maxVideoSeconds)) return null;
  const wanted = [...new Set(keyTokens(request.search))];
  const title = new Set(keyTokens(`${candidate.title} ${candidate.channel ?? ""}`));
  // Le sujet (« fable », « metro 2039 ») compte plus que le genre de vidéo (« trailer », « 2027 ») :
  // une chaîne d'agrégation qui empile les mots-clés ne passe pas devant la bande-annonce officielle.
  const subject = wanted.filter((token) => !GENERIC.test(token));
  const generic = wanted.filter((token) => GENERIC.test(token));
  const share = (tokens: string[]) => (tokens.length ? tokens.filter((token) => title.has(token)).length / tokens.length : 0);
  const overlap = share(subject.length ? subject : wanted);
  let score = overlap * 3 + share(generic) * 0.5;
  if (candidate.verified) score += 1;
  const channelTokens = keyTokens(candidate.channel ?? "");
  if (/\b(official|officiel)\b/i.test(candidate.channel ?? "") || channelTokens.some((token) => wanted.includes(token))) score += 0.5;
  if (OFFICIAL.test(candidate.title) && OFFICIAL.test(request.search)) score += 0.4;
  if (SECONDHAND.test(candidate.title) && !SECONDHAND.test(request.search)) score -= 1.5;
  if (candidate.views !== undefined) score += Math.min(0.8, Math.log10(candidate.views + 1) * 0.1);
  if (candidate.duration !== undefined) {
    // Une citation se retrouve dans la fenêtre analysée : les vidéos courtes d'abord.
    if (request.quote) score += candidate.duration <= CLIP_LIMITS.analysisWholeSeconds ? 0.5 : candidate.duration <= CLIP_LIMITS.analysisWindowSeconds ? 0.2 : -0.5;
    else if (candidate.duration <= 15 * 60) score += 0.3;
  }
  // Rien en commun avec la recherche : ce n'est pas le bon sujet.
  if ((subject.length ? subject : wanted).length >= 1 && overlap < 0.34) score -= 2;
  return Math.round(score * 1000) / 1000;
}

/** Candidates notées, la meilleure d'abord ; les écartées et les doublons disparaissent. */
export function rankCandidates(candidates: ClipCandidate[], request: Pick<ClipRequest, "search" | "keepAudio" | "quote">): ClipCandidate[] {
  const seen = new Set<string>();
  return candidates
    .flatMap((candidate, index) => {
      if (seen.has(candidate.url)) return [];
      seen.add(candidate.url);
      const score = scoreCandidate(candidate, request);
      // Une note trop basse veut dire « autre sujet » : mieux vaut une vidéo libre qu'un hors-sujet.
      return score === null || score < 0.8 ? [] : [{ candidate, score, index }];
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.candidate);
}

/** Résultat de la recherche YouTube, en candidate. */
export function searchEntryToCandidate(entry: SearchEntry): ClipCandidate {
  return {
    url: entry.url,
    site: "youtube",
    title: entry.title,
    ...(entry.channel ? { channel: entry.channel } : {}),
    verified: entry.verified,
    ...(entry.duration ? { duration: entry.duration } : {}),
    ...(entry.views !== undefined ? { views: entry.views } : {}),
    unavailable: entry.unavailable,
    from: "search",
  };
}

/**
 * Adresses rendues par Codex, contrôlées comme une adresse collée
 * (`parseRemoteUrl` : http(s), hôtes reconnus, forme canonique) ; seules
 * YouTube et Twitch sont gardées, et YouTube écarté quand il refuse le
 * serveur.
 */
export function webCandidates(answer: unknown, options: { site: ClipSite; youtube: boolean }): ClipCandidate[] {
  const list = answer && typeof answer === "object" && Array.isArray((answer as { videos?: unknown }).videos) ? ((answer as { videos: unknown[] }).videos) : [];
  const found: ClipCandidate[] = [];
  for (const entry of list.slice(0, 8)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    let parsed;
    try {
      parsed = parseRemoteUrl(raw.url);
    } catch {
      continue;
    }
    if (parsed.site !== "youtube" && parsed.site !== "twitch") continue;
    if (parsed.site === "youtube" && !options.youtube) continue;
    if (options.site === "twitch" && parsed.site !== "twitch") continue;
    if (options.site === "youtube" && parsed.site !== "youtube") continue;
    found.push({
      url: parsed.url,
      site: parsed.site,
      title: cleanText(raw.title, 200) || "Vidéo",
      ...(cleanText(raw.channel, 120) ? { channel: cleanText(raw.channel, 120) } : {}),
      from: "web",
    });
  }
  return found;
}

/** Consigne de Codex pour trouver des vidéos sur le web : les adresses rendues sont des données, contrôlées ensuite. */
export function webSearchPrompt(request: Pick<ClipRequest, "search" | "site" | "moment">): string {
  const where =
    request.site === "twitch"
      ? "des clips Twitch (adresses clips.twitch.tv/… ou twitch.tv/<chaîne>/clip/…)"
      : request.site === "youtube"
        ? "des vidéos YouTube (adresses youtube.com/watch?v=… ou youtu.be/…)"
        : "des vidéos YouTube (youtube.com/watch?v=…) ou des clips Twitch (clips.twitch.tv/…)";
  return [
    `Cherche sur le web ${where} qui correspondent à cette recherche : ${JSON.stringify(request.search)}.`,
    request.moment ? `On veut y voir ou y entendre : ${JSON.stringify(request.moment)}.` : "",
    "Préfère les chaînes officielles (éditeur, studio, média, la personne elle-même) et les vidéos qui montrent le sujet, pas celles qui en parlent (réactions, critiques, compilations).",
    "N'utilise que la recherche web : n'exécute aucune commande et n'écris aucun fichier. N'invente jamais une adresse : ne rends que des adresses vues dans les résultats.",
    'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour : {"videos": [{"url": string, "title": string, "channel": string}]}, cinq vidéos au plus, la meilleure d\'abord ; {"videos": []} si rien ne convient.',
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Citation : retrouver les mots ───────────────────────────────

/** Distance d'édition entre deux mots courts. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** Ressemblance de deux mots : 1 identiques, 0,7 proches (une faute de transcription), 0 sinon. */
function wordSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest <= 3) return 0;
  return 1 - editDistance(a, b) / longest >= 0.75 ? 0.7 : 0;
}

export interface QuoteMatch {
  /** Premier et dernier mot retrouvés, dans les mots transcrits. */
  first: number;
  last: number;
  startMs: number;
  endMs: number;
  /** Part de la citation retrouvée, de 0 à 1. */
  score: number;
}

/**
 * Retrouve une citation dans des mots transcrits, avec tolérance : mots
 * manquants ou en trop, fautes de transcription, ponctuation et casse
 * ignorées. Alignement local (programmation dynamique) de la citation sur
 * chaque fenêtre de mots ; le meilleur passage qui couvre au moins 60 % de
 * la citation (toute la citation sous trois mots) est rendu, le premier en
 * cas d'égalité. `null` sinon.
 */
export function locateQuote(words: TimedWord[], quote: string): QuoteMatch | null {
  const wanted = quote
    .split(/\s+/)
    .map((token) => wordKey(token))
    .filter(Boolean);
  if (wanted.length === 0) return null;
  const keys = words.map((word) => wordKey(word.text));
  const span = Math.ceil(wanted.length * 1.5) + 2;
  let best: QuoteMatch | null = null;
  for (let start = 0; start < keys.length; start++) {
    if (!keys[start] || (wordSimilarity(keys[start], wanted[0]) === 0 && (wanted.length < 2 || wordSimilarity(keys[start], wanted[1]) === 0))) continue;
    const end = Math.min(keys.length, start + span);
    const window = keys.slice(start, end);
    // score[i][j] : meilleure ressemblance des i premiers mots voulus dans les j premiers mots de la fenêtre.
    const rows = wanted.length + 1;
    const cols = window.length + 1;
    const score: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    const lastHit: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(-1));
    const firstHit: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(-1));
    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        const similarity = wordSimilarity(wanted[i - 1], window[j - 1]);
        let value = score[i - 1][j];
        let last = lastHit[i - 1][j];
        let first = firstHit[i - 1][j];
        if (score[i][j - 1] > value) {
          value = score[i][j - 1];
          last = lastHit[i][j - 1];
          first = firstHit[i][j - 1];
        }
        if (similarity > 0 && score[i - 1][j - 1] + similarity > value) {
          value = score[i - 1][j - 1] + similarity;
          last = j - 1;
          first = firstHit[i - 1][j - 1] >= 0 ? firstHit[i - 1][j - 1] : j - 1;
        }
        score[i][j] = value;
        lastHit[i][j] = last;
        firstHit[i][j] = first;
      }
    }
    const total = score[rows - 1][cols - 1] / wanted.length;
    const first = firstHit[rows - 1][cols - 1];
    const last = lastHit[rows - 1][cols - 1];
    if (first < 0 || last < 0) continue;
    // Des mots retrouvés trop épars ne forment pas la citation.
    if (last - first + 1 > wanted.length * 2 + 2) continue;
    if (!best || total > best.score + 1e-9) {
      best = { first: start + first, last: start + last, startMs: words[start + first].startMs, endMs: words[start + last].endMs, score: Math.round(total * 1000) / 1000 };
    }
  }
  if (!best) return null;
  const needed = wanted.length < 3 ? 0.99 : 0.6;
  return best.score >= needed ? best : null;
}

/** Mots d'un passage, ramenés à son début (millisecondes de l'extrait). */
export function rebaseWords(words: TimedWord[], fromMs: number, toMs: number): TimedWord[] {
  return words
    .filter((word) => word.startMs >= fromMs - 50 && word.endMs <= toMs + 50)
    .map((word) => ({ ...word, startMs: Math.max(0, Math.round(word.startMs - fromMs)), endMs: Math.max(0, Math.round(word.endMs - fromMs)) }));
}

// ─── Moment vivant : sans IA ─────────────────────────────────────

/** Mesures d'une vidéo échantillonnée : écart entre images successives et images unies (noir, aplat). */
export interface MotionStats {
  fps: number;
  /** `motion[i]` : écart entre l'image i − 1 et l'image i (0 identiques, 1 sans rapport). */
  motion: number[];
  /** Image presque unie (fondu au noir, carton vide). */
  flat: boolean[];
}

/**
 * Fenêtre de `seconds` la plus vivante d'une vidéo : mouvement moyen hors
 * coupes (plafonné, pour qu'un flash ne gagne pas), un bonus pour quelques
 * coupes (une bande-annonce vit par ses plans), une pénalité pour les images
 * unies et pour une coupe collée au bord (un plan d'une fraction de seconde).
 * Les 5 premiers pour cent (logos, introduction) et les 10 derniers (carton
 * de fin) sont écartés quand la vidéo est assez longue. Rend le début, en
 * secondes.
 */
export function pickDynamicWindow(stats: MotionStats, durationSec: number, seconds: number, options: { introShare?: number; outroShare?: number } = {}): { start: number; score: number } {
  const { fps } = stats;
  const frames = stats.motion.length;
  const width = Math.max(1, Math.round(seconds * fps));
  if (frames <= width) return { start: 0, score: 0 };
  const cuts = new Set(detectCuts(stats.motion, fps));
  const total = Math.min(frames, Math.round(durationSec * fps)) || frames;
  let low = Math.ceil((options.introShare ?? CLIP_LIMITS.introShare) * total);
  let high = Math.floor((1 - (options.outroShare ?? CLIP_LIMITS.outroShare)) * total) - width;
  if (high < low) {
    low = 0;
    high = Math.max(0, Math.min(frames, total) - width);
  }
  const edge = Math.max(1, Math.round(0.5 * fps));
  let best = { start: low, score: -Infinity };
  for (let start = low; start <= high; start++) {
    let moving = 0;
    let counted = 0;
    let cutCount = 0;
    let flat = 0;
    let edgeCut = false;
    for (let index = start; index < start + width; index++) {
      if (stats.flat[index]) flat++;
      if (index === start) continue;
      if (cuts.has(index)) {
        cutCount++;
        if (index - start < edge || start + width - index <= edge) edgeCut = true;
        continue;
      }
      moving += Math.min(0.35, stats.motion[index] ?? 0);
      counted++;
    }
    const score = (counted ? moving / counted : 0) + 0.04 * Math.min(3, cutCount) - (flat / width) * 1 - (edgeCut ? 0.1 : 0);
    if (score > best.score + 1e-9) best = { start, score };
  }
  return { start: Math.round((best.start / fps) * 100) / 100, score: Math.round(best.score * 1000) / 1000 };
}

/** Écart type des niveaux de gris : presque nul pour une image unie. */
function grayspread(frame: GrayFrame): number {
  let sum = 0;
  let squares = 0;
  for (const value of frame.data) {
    sum += value;
    squares += value * value;
  }
  const mean = sum / frame.data.length;
  return Math.sqrt(Math.max(0, squares / frame.data.length - mean * mean));
}

/** Mesures d'une suite d'images grises (`motionStats` les calcule au fil du décodage). */
export function statsFromFrames(frames: GrayFrame[], fps: number): MotionStats {
  return {
    fps,
    motion: frames.map((frame, index) => (index === 0 ? 0 : Math.round(frameDistance(frames[index - 1], frame) * 1000) / 1000)),
    flat: frames.map((frame) => grayspread(frame) < 10),
  };
}

// ─── Outils système ──────────────────────────────────────────────

/**
 * Échantillonne une vidéo en images grises de 64 × 64, quatre par seconde,
 * lues au fil de l'eau par ffmpeg (aucun shell, délai borné, annulable).
 */
async function motionStats(file: string, signal: AbortSignal): Promise<MotionStats> {
  const binary = await ensureFfmpeg();
  if (!binary) throw new Error("ffmpeg n’est pas disponible sur le serveur.");
  const side = CLIP_LIMITS.analysisSide;
  const fps = CLIP_LIMITS.analysisFps;
  const frameBytes = side * side;
  const maxFrames = (CLIP_LIMITS.analysisWindowSeconds + 30) * fps;
  const stats: MotionStats = { fps, motion: [], flat: [] };
  let previous: GrayFrame | null = null;
  let pending: Buffer = Buffer.alloc(0);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      ["-nostdin", "-hide_banner", "-threads", "2", "-i", file, "-an", "-sn", "-dn", "-vf", `fps=${fps},scale=${side}:${side}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"],
      { env: childEnv(), windowsHide: true, shell: false, stdio: ["ignore", "pipe", "ignore"] }
    );
    const stop = () => child.kill("SIGKILL");
    const timer = setTimeout(stop, 5 * 60 * 1000);
    signal.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= frameBytes) {
        const frame: GrayFrame = { width: side, height: side, data: new Uint8Array(pending.subarray(0, frameBytes)) };
        pending = pending.subarray(frameBytes);
        if (stats.motion.length >= maxFrames) {
          stop();
          return;
        }
        stats.motion.push(previous ? Math.round(frameDistance(previous, frame) * 1000) / 1000 : 0);
        stats.flat.push(grayspread(frame) < 10);
        previous = frame;
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(abortError());
      else resolve();
    });
  });
  if (stats.motion.length < fps) throw new Error("Les images de la vidéo n’ont pas pu être lues.");
  return stats;
}

function abortError(): Error {
  const error = new Error("Création annulée.");
  error.name = "AbortError";
  return error;
}

/** Au plus `max` tâches à la fois, pour tout le serveur. */
function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}

const downloads = ((globalThis as any).__sxmClipDownloads ??= createLimiter(CLIP_LIMITS.downloads)) as ReturnType<typeof createLimiter>;

/** Lecture passée par la porte commune (`gate`), ou déjà gardée par elle ; trop de lectures à la minute : on patiente un peu, deux fois au plus. */
async function gated<T>(key: string | null, task: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await (key ? sharedProbeGate().run(key, task) : task());
    } catch (error) {
      const message = (error as Error)?.message;
      if (attempt >= 2 || (message !== PROBE_RATE_MESSAGE && message !== PROBE_BUSY_MESSAGE)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      signal.throwIfAborted();
    }
  }
}

/** Copie des cookies YouTube pour un appel, dans un dossier de travail effacé ensuite. */
async function withYoutubeCookies<T>(site: "youtube" | "twitch", run: (cookiesFile: string | null) => Promise<T>): Promise<T> {
  if (site !== "youtube" || !hasYoutubeCookies()) return run(null);
  const dir = path.join(WORK_ROOT, `cookies-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`);
  const release = holdWorkDir(dir);
  try {
    return await run(copyYoutubeCookies(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    release();
  }
}

/** YouTube refuse le serveur (« confirmez que vous n'êtes pas un robot »). */
export function isYoutubeRefusal(error: unknown): boolean {
  return error instanceof YtDlpError && (error.code === "bot-check" || error.code === "cookies-invalid" || error.code === "age");
}

// ─── Mémoire par adresse ─────────────────────────────────────────

const WORK_ROOT = path.join(DATA_DIR, ".clip-tmp");
const CACHE_FILE = path.join(DATA_DIR, "clip-analysis.json");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Ce qu'on sait d'une vidéo déjà analysée : ses mots (fenêtre transcrite) et son mouvement. */
interface AnalysisEntry {
  at: number;
  /** Secondes analysées depuis le début de la vidéo. */
  seconds: number;
  words?: TimedWord[];
  transcript?: TranscriptInfo;
  motion?: MotionStats;
}

function readCache(): Record<string, AnalysisEntry> {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    return data && typeof data === "object" ? (data as Record<string, AnalysisEntry>) : {};
  } catch {
    return {};
  }
}

function writeCache(url: string, entry: AnalysisEntry) {
  ensureDirs();
  const now = Date.now();
  const entries = Object.entries({ ...readCache(), [url]: entry })
    .filter(([, value]) => now - (value?.at ?? 0) < CACHE_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 80);
  const temporary = `${CACHE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(Object.fromEntries(entries)));
  fs.renameSync(temporary, CACHE_FILE);
}

/** État de YouTube vu par la recherche d'extraits : refusé récemment sans cookies ? */
const youtubeState = ((globalThis as any).__sxmClipYoutube ??= { refusedAt: 0 }) as { refusedAt: number };

/** YouTube a refusé le serveur sans cookies dans les dernières 24 heures. */
export function youtubeRecentlyRefused(now = Date.now()): boolean {
  return now - youtubeState.refusedAt < 24 * 60 * 60 * 1000;
}

// ─── Dépendances (remplaçables dans les tests) ───────────────────

export interface ClipDeps {
  searchYoutube(query: string, signal: AbortSignal): Promise<ClipCandidate[]>;
  searchWeb(request: ClipRequest, options: { youtube: boolean }, signal: AbortSignal): Promise<ClipCandidate[]>;
  probe(url: string, signal: AbortSignal): Promise<Pick<RemoteProbe, "url" | "site" | "title" | "author" | "duration">>;
  /** Récupère un passage (`null` : toute la vidéo) dans `dir` ; rend le fichier. */
  download(url: string, site: "youtube" | "twitch", section: { start: number; end: number } | null, dir: string, options: { height: number; maxBytes: number; exact: boolean }, signal: AbortSignal): Promise<string>;
  transcribe(file: string, signal: AbortSignal): Promise<{ words: TimedWord[]; transcript: TranscriptInfo }>;
  motion(file: string, signal: AbortSignal): Promise<MotionStats>;
  /** Met le passage au format du navigateur (H.264, AAC) et le range ; rend le média. */
  store(file: string, info: StoreInfo, signal: AbortSignal): Promise<ClipAsset>;
  /** Extrait déjà coupé pour cette adresse et ce passage. */
  cached(url: string, start: number, end: number): ClipAsset | null;
  readAnalysis(url: string): AnalysisEntry | null;
  writeAnalysis(url: string, entry: AnalysisEntry): void;
}

interface StoreInfo {
  probe: Pick<RemoteProbe, "url" | "site" | "title" | "author">;
  start: number;
  end: number;
  words?: TimedWord[];
  transcript?: TranscriptInfo;
}

export const clipDeps: ClipDeps = {
  async searchYoutube(query, signal) {
    const entries = await gated(`ytsearch:${query.toLowerCase()}`, () => withYoutubeCookies("youtube", (cookiesFile) => searchYoutube(query, { count: CLIP_LIMITS.searchResults, signal, cookiesFile })), signal);
    return entries.map(searchEntryToCandidate);
  },
  async searchWeb(request, options, signal) {
    const answer = await askCodex(webSearchPrompt(request), { signal, search: true, timeoutMs: 3 * 60 * 1000, origin: { module: "clip-studio", feature: "Recherche d’extraits" } });
    return webCandidates(extractJson<unknown>(answer), { site: request.site, youtube: options.youtube });
  },
  probe: (url, signal) => probeRemote(url, signal),
  async download(url, site, section, dir, options, signal) {
    return downloads(() =>
      withYoutubeCookies(site, async (cookiesFile) => {
        const result = await downloadSection(url, section, dir, {
          signal,
          cookiesFile,
          maxBytes: options.maxBytes,
          maxHeight: options.height,
          exactCuts: options.exact,
          site: site === "youtube" ? "YouTube" : "Twitch",
          timeoutMs: 10 * 60 * 1000,
        });
        return result.file;
      })
    );
  },
  async transcribe(file, signal) {
    const result = await transcribeMediaFile(file, { signal, feature: "Citation d’un extrait" });
    // Le moteur est dit par la transcription quand elle le sait (Whisper d’OpenAI, ou un moteur local).
    const provider = (result as { provider?: TranscriptInfo["provider"] }).provider ?? "openai";
    return { words: result.words, transcript: { provider, ...(result.language ? { language: result.language } : {}), at: Date.now() } };
  },
  motion: motionStats,
  async store(file, info, signal) {
    const ffmpeg = await ensureFfmpeg();
    if (!ffmpeg) throw new Error("ffmpeg n’est pas disponible sur le serveur.");
    const streams = await inspect(ffmpeg, file);
    if (!streams.video) throw new Error("L’extrait récupéré ne contient pas d’image.");
    const output = path.join(path.dirname(file), "final.mp4");
    const converted = await runFfmpeg(ffmpeg, finalizeArgs(file, output, streams, undefined, { maxShortSide: CLIP_LIMITS.clipHeight, maxBytes: CLIP_LIMITS.clipMaxBytes }), {
      signal,
      timeoutMs: 5 * 60 * 1000,
    });
    if (converted.code !== 0 || !fs.existsSync(output)) throw new Error("L’extrait n’a pas pu être converti.");
    const final = await inspect(ffmpeg, output);
    if (!final.video || final.video.codec !== "h264") throw new Error("L’extrait converti est illisible.");
    const size = fs.statSync(output).size;
    if (size >= CLIP_LIMITS.clipMaxBytes) throw new Error("L’extrait dépasse la taille permise.");
    const name = `webclip-${Date.now().toString(36)}${randomBytes(4).toString("hex")}.mp4`;
    fs.renameSync(output, path.join(ASSETS_DIR, name));
    const label = siteLabel(info.probe.site, info.probe.url);
    const title = info.probe.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || "Extrait";
    const round = (value: number) => Math.round(value * 1000) / 1000;
    const origin: MediaOrigin = {
      site: info.probe.site,
      url: info.probe.url,
      title: info.probe.title,
      ...(info.probe.author ? { author: info.probe.author } : {}),
      section: { start: round(info.start), end: round(info.end) },
    };
    const now = Date.now();
    const asset: ClipAsset = {
      file: name,
      kind: "video",
      originalName: `${title}.mp4`,
      size,
      width: final.width,
      height: final.height,
      durationMs: final.durationSec ? Math.round(final.durationSec * 1000) : Math.round((info.end - info.start) * 1000),
      credit: remoteCredit(info.probe.title, info.probe.author, label),
      rights: "unverified",
      origin,
      hasAudio: Boolean(final.audio),
      ...(info.words?.length ? { words: info.words } : {}),
      ...(info.words?.length && info.transcript ? { transcript: info.transcript } : {}),
      lastUsedAt: now,
      createdAt: now,
    };
    writeAssets([asset, ...readAssets().filter((entry) => entry.file !== name)]);
    return asset;
  },
  cached(url, start, end) {
    const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 0.05;
    return (
      readAssets().find(
        (asset) => asset.kind === "video" && asset.origin?.url === url && near(asset.origin.section?.start, start) && near(asset.origin.section?.end, end) && fs.existsSync(path.join(ASSETS_DIR, asset.file))
      ) ?? null
    );
  },
  readAnalysis(url) {
    const entry = readCache()[url];
    return entry && Date.now() - entry.at < CACHE_TTL_MS ? entry : null;
  },
  writeAnalysis: writeCache,
};

// ─── Un extrait pour un segment ──────────────────────────────────

/** État partagé par les extraits d'un même travail. */
export interface ClipJobState {
  /** YouTube a refusé le serveur pendant ce travail : on ne le redemande plus. */
  youtubeRefused?: string;
  /** Les citations sont impossibles (transcription refusée, crédit épuisé) : pourquoi. */
  quotesUnavailable?: string;
  /** Secondes de son d'origine encore permises. */
  audioLeft: number;
}

export interface SourcedClip {
  media: MediaSource;
  /** Son gardé : l'extrait est cité, la voix off du segment parle après lui. */
  keepAudio: boolean;
  /** Durée de la partie citée (son gardé), en secondes ; la suite du média est muette. */
  quoteSeconds?: number;
  outcome: ClipOutcome;
}

export interface ClipContext {
  segment: number;
  /** Durée parlée estimée du segment : un extrait muet la couvre, une citation la garde pour sa suite. */
  segmentSeconds: number;
  state: ClipJobState;
  signal: AbortSignal;
  onProgress?: (detail: string) => void;
  deps?: Partial<ClipDeps>;
}

/** Média du projet tiré d'un extrait rangé. */
export function clipAssetToSource(asset: ClipAsset): MediaSource {
  return {
    url: `/api/modules/clip-studio/data/assets/${asset.file}`,
    ref: `module:clip-studio/assets/${asset.file}`,
    name: asset.originalName,
    kind: "video",
    ...(asset.width ? { width: asset.width } : {}),
    ...(asset.height ? { height: asset.height } : {}),
    ...(asset.durationMs ? { durationMs: asset.durationMs } : {}),
    ...(asset.credit ? { credit: asset.credit } : {}),
    rights: "unverified",
    hasAudio: asset.hasAudio === true,
    ...(asset.origin ? { origin: asset.origin } : {}),
    ...(asset.words?.length ? { words: asset.words } : {}),
    ...(asset.transcript ? { transcript: asset.transcript } : {}),
  };
}

/** Bilan d'un refus de YouTube, dit une fois dans l'étape « Vidéos », avec ce qu'il faut faire. */
const REFUSED_WITH_COOKIES = "YouTube refuse les cookies enregistrés : renouvelez-les dans les réglages de Clip Studio, section « Sources vidéo »";
const REFUSED_WITHOUT_COOKIES = "YouTube refuse le serveur sans cookies : ajoutez-en dans les réglages de Clip Studio, section « Sources vidéo »";

/** Candidates d'un extrait : YouTube d'abord (sauf site Twitch ou refus), puis Codex sur le web. */
async function findCandidates(request: ClipRequest, ctx: ClipContext, deps: ClipDeps, notes: string[]): Promise<ClipCandidate[]> {
  const youtube = !ctx.state.youtubeRefused;
  if (request.site !== "twitch" && youtube) {
    try {
      ctx.onProgress?.(`Recherche sur YouTube : « ${request.search} »`);
      const ranked = rankCandidates(await deps.searchYoutube(request.search, ctx.signal), request);
      if (ranked.length) return ranked;
      notes.push("rien de convaincant sur YouTube");
    } catch (error) {
      if (ctx.signal.aborted) throw error;
      if (isYoutubeRefusal(error)) {
        const cookies = hasYoutubeCookies();
        if (cookies) markCookiesRejected();
        else youtubeState.refusedAt = Date.now();
        ctx.state.youtubeRefused = cookies ? REFUSED_WITH_COOKIES : REFUSED_WITHOUT_COOKIES;
        notes.push(ctx.state.youtubeRefused);
      } else notes.push(`recherche YouTube impossible (${shortReason(error)})`);
    }
  }
  if (request.site === "youtube" && !youtube) return [];
  try {
    ctx.onProgress?.(`Recherche sur le web : « ${request.search} »`);
    const ranked = rankCandidates(await deps.searchWeb(request, { youtube: !ctx.state.youtubeRefused }, ctx.signal), request);
    if (!ranked.length) notes.push(request.site === "twitch" ? "aucun clip Twitch trouvé" : "rien de convaincant sur le web");
    return ranked;
  } catch (error) {
    if (ctx.signal.aborted) throw error;
    notes.push(`recherche web impossible (${shortReason(error)})`);
    return [];
  }
}

const shortReason = (error: unknown) => cleanText(publicErrorMessage(error, "erreur inconnue", "[clip-studio] extrait"), 140).replace(/[.\s]+$/, "");

/** Fenêtre analysée d'une vidéo : toute la vidéo jusqu'à 6 minutes, ses 10 premières minutes sinon. */
export function analysisWindow(durationSec: number | undefined): { start: number; end: number } | null {
  if (!durationSec || durationSec <= CLIP_LIMITS.analysisWholeSeconds) return null;
  return { start: 0, end: Math.min(durationSec, CLIP_LIMITS.analysisWindowSeconds) };
}

/**
 * Trouve, analyse et coupe l'extrait d'un segment. Ne rejette que sur
 * annulation : sans extrait, le résultat dit pourquoi (`status: "fallback"`).
 */
export async function sourceClip(request: ClipRequest, ctx: ClipContext): Promise<SourcedClip | { outcome: ClipOutcome }> {
  const deps: ClipDeps = { ...clipDeps, ...ctx.deps };
  const notes: string[] = [];
  const base: ClipOutcome = {
    segment: ctx.segment,
    search: request.search,
    site: request.site,
    moment: request.moment,
    ...(request.quote ? { quote: request.quote } : {}),
    wantedAudio: request.keepAudio,
    status: "fallback",
  };
  const candidates = await findCandidates(request, ctx, deps, notes);
  for (const candidate of candidates.slice(0, CLIP_LIMITS.candidatesTried)) {
    ctx.signal.throwIfAborted();
    try {
      return await takeExcerpt(candidate, request, ctx, deps, base, notes);
    } catch (error) {
      if (ctx.signal.aborted) throw error;
      if (isYoutubeRefusal(error) && candidate.site === "youtube") {
        const cookies = hasYoutubeCookies();
        if (cookies) markCookiesRejected();
        else youtubeState.refusedAt = Date.now();
        ctx.state.youtubeRefused = cookies ? REFUSED_WITH_COOKIES : REFUSED_WITHOUT_COOKIES;
      }
      // Un refus de YouTube se dit une fois dans le bilan de l'étape : ici, la raison courte.
      const reason = isYoutubeRefusal(error) && candidate.site === "youtube" ? (hasYoutubeCookies() ? "cookies YouTube refusés" : "YouTube refuse le serveur") : shortReason(error);
      notes.push(`« ${cleanText(candidate.title, 60)} » écartée (${reason})`);
    }
  }
  return { outcome: { ...base, note: notes.length ? capitalize(notes.join(" ; ")) : "Aucune vidéo trouvée" } };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

async function takeExcerpt(candidate: ClipCandidate, request: ClipRequest, ctx: ClipContext, deps: ClipDeps, base: ClipOutcome, notes: string[]): Promise<SourcedClip> {
  ctx.onProgress?.(`Lecture de « ${cleanText(candidate.title, 80)} »`);
  // `probeRemote` passe déjà par la porte commune : pas de seconde place prise ici.
  const probe = await gated(null, () => deps.probe(candidate.url, ctx.signal), ctx.signal);
  if (probe.site !== "youtube" && probe.site !== "twitch") throw new Error("site non pris en charge");
  const duration = probe.duration ?? candidate.duration;
  if (duration !== undefined && (duration < CLIP_LIMITS.minVideoSeconds || duration > CLIP_LIMITS.maxVideoSeconds)) throw new Error("durée hors des bornes");

  // Ce que l'extrait doit faire : citer une parole, garder un son, ou illustrer en silence.
  const audioAllowed = request.keepAudio && ctx.state.audioLeft >= CLIP_LIMITS.minSeconds;
  let mode: "quote" | "sound" | "muted" = !audioAllowed ? "muted" : request.quote ? "quote" : "sound";
  if (request.keepAudio && !audioAllowed) notes.push("son d’origine coupé : la part de son gardé est atteinte");
  if (mode === "quote" && ctx.state.quotesUnavailable) {
    mode = "muted";
    notes.push(`citation impossible (${ctx.state.quotesUnavailable}) : extrait muet`);
  }

  ensureDirs();
  const workDir = path.join(WORK_ROOT, `clip-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`);
  const release = holdWorkDir(workDir);
  try {
    fs.mkdirSync(workDir, { recursive: true });
    const cachedAnalysis = deps.readAnalysis(probe.url);
    let analysis: AnalysisEntry = cachedAnalysis ?? { at: Date.now(), seconds: 0 };
    let analysisFile: string | null = null;
    const window = analysisWindow(duration);
    const analyzed = window ? window.end : duration ?? 0;
    const fetchAnalysis = async () => {
      if (analysisFile) return analysisFile;
      ctx.onProgress?.(`Analyse de « ${cleanText(probe.title, 80)} »`);
      assertDiskSpace(DATA_DIR, CLIP_LIMITS.analysisMaxBytes + CLIP_LIMITS.clipMaxBytes);
      analysisFile = await deps.download(probe.url, probe.site as "youtube" | "twitch", window, path.join(workDir, "analysis"), { height: CLIP_LIMITS.analysisHeight, maxBytes: CLIP_LIMITS.analysisMaxBytes, exact: false }, ctx.signal);
      return analysisFile;
    };

    let start = 0;
    let end = 0;
    let quoteSeconds: number | undefined;
    let words: TimedWord[] | undefined;
    let transcript: TranscriptInfo | undefined;

    if (mode === "quote") {
      if (!analysis.words) {
        try {
          const file = await fetchAnalysis();
          ctx.onProgress?.(`Transcription de « ${cleanText(probe.title, 80)} »`);
          const result = await deps.transcribe(file, ctx.signal);
          analysis = { ...analysis, at: Date.now(), seconds: analyzed || analysis.seconds, words: result.words, transcript: result.transcript };
          deps.writeAnalysis(probe.url, analysis);
        } catch (error) {
          if (ctx.signal.aborted) throw error;
          if (error instanceof YtDlpError) throw error;
          ctx.state.quotesUnavailable = shortReason(error);
          notes.push(`citation impossible (${ctx.state.quotesUnavailable}) : extrait muet`);
          mode = "muted";
        }
      }
      if (mode === "quote") {
        const match = locateQuote(analysis.words ?? [], request.quote ?? "");
        if (!match) {
          notes.push("citation introuvable dans la vidéo : extrait muet");
          mode = "muted";
        } else {
          start = Math.max(0, match.startMs / 1000 - CLIP_LIMITS.quoteMargin);
          const quoteEnd = Math.min(duration ?? Infinity, match.endMs / 1000 + CLIP_LIMITS.quoteMargin);
          quoteSeconds = Math.min(CLIP_LIMITS.maxSeconds, quoteEnd - start);
          if (quoteSeconds > ctx.state.audioLeft + 0.5) {
            notes.push("citation plus longue que la part de son permise : extrait muet");
            mode = "muted";
            quoteSeconds = undefined;
            end = Math.min(duration ?? Infinity, start + Math.max(request.seconds, ctx.segmentSeconds));
          } else {
            // La voix off du segment parle ensuite sur la suite de la vidéo, muette.
            const tail = Math.min(CLIP_LIMITS.maxTailSeconds, Math.max(1.5, ctx.segmentSeconds));
            end = Math.min(duration ?? Infinity, start + quoteSeconds + tail);
            words = rebaseWords(analysis.words ?? [], start * 1000, (start + quoteSeconds) * 1000);
            transcript = analysis.transcript;
          }
        }
      }
    }

    if (mode !== "quote" && end <= start) {
      // Un extrait muet couvre le segment : sa durée voulue, ou celle de la voix si elle est plus longue.
      // Un son gardé sans parole : sa durée, puis la suite muette sous la voix off.
      const tail = Math.min(CLIP_LIMITS.maxTailSeconds, Math.max(1.5, ctx.segmentSeconds));
      const soundSeconds = mode === "sound" ? Math.min(request.seconds, ctx.state.audioLeft) : 0;
      // Un extrait muet est coupé en plans par le rythme : quelques secondes de plus que la voix laissent les plans changer de moment.
      const seconds = mode === "sound" ? soundSeconds + tail : Math.min(CLIP_LIMITS.maxSeconds, Math.max(request.seconds, ctx.segmentSeconds + 3));
      if (!analysis.motion) {
        const file = await fetchAnalysis();
        analysis = { ...analysis, at: Date.now(), seconds: analyzed || analysis.seconds, motion: await deps.motion(file, ctx.signal) };
        deps.writeAnalysis(probe.url, analysis);
      }
      const motion = analysis.motion!;
      const picked = pickDynamicWindow(motion, duration ?? motion.motion.length / motion.fps, seconds);
      start = picked.start;
      end = Math.min(duration ?? Infinity, start + seconds);
      if (mode === "sound") quoteSeconds = Math.min(end - start, soundSeconds);
      if (end - start < CLIP_LIMITS.minSeconds) throw new Error("vidéo trop courte");
    }

    const keepAudio = mode !== "muted";
    if (keepAudio) ctx.state.audioLeft = Math.max(0, ctx.state.audioLeft - (quoteSeconds ?? 0));

    // Passage coupé à l'image près, en bonne définition : déjà coupé pour cette adresse, il resert.
    let asset = deps.cached(probe.url, start, end);
    if (asset && keepAudio && words?.length && !asset.words?.length) asset = null;
    if (!asset) {
      ctx.onProgress?.(`Coupe de « ${cleanText(probe.title, 80)} » (${clock(start)} – ${clock(end)})`);
      assertDiskSpace(DATA_DIR, CLIP_LIMITS.clipMaxBytes * 2);
      enforceRemoteBudget(CLIP_LIMITS.clipMaxBytes);
      const cut = await deps.download(probe.url, probe.site as "youtube" | "twitch", { start, end }, path.join(workDir, "cut"), { height: CLIP_LIMITS.clipHeight, maxBytes: CLIP_LIMITS.clipMaxBytes * 2, exact: true }, ctx.signal);
      asset = await deps.store(cut, { probe, start, end, ...(keepAudio && words?.length ? { words, transcript } : {}) }, ctx.signal);
    }
    const media = clipAssetToSource(asset);
    const hasSound = keepAudio && asset.hasAudio !== false;
    if (keepAudio && !hasSound) notes.push("la vidéo n’a pas de son : extrait muet");
    const finalSeconds = (asset.durationMs ?? (end - start) * 1000) / 1000;
    return {
      media,
      keepAudio: hasSound,
      ...(hasSound && quoteSeconds ? { quoteSeconds: Math.min(finalSeconds, quoteSeconds) } : {}),
      outcome: {
        ...base,
        status: "found",
        keepAudio: hasSound,
        video: { site: probe.site as "youtube" | "twitch", url: probe.url, title: probe.title, ...(probe.author ? { author: probe.author } : {}), start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10 },
        mediaUrl: media.url,
        seconds: Math.round(finalSeconds * 10) / 10,
        ...(hasSound && quoteSeconds ? { quoteSeconds: Math.round(Math.min(finalSeconds, quoteSeconds) * 10) / 10 } : {}),
        ...(notes.length ? { note: capitalize(notes.join(" ; ")) } : {}),
      },
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    release();
  }
}

/** « 1:05 » */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Sources d'extraits utilisables, pour l'écran de création : jamais un secret.
 * « rejected » : les cookies enregistrés ont été refusés par YouTube depuis
 * leur enregistrement (vu le 27/10/2026 : refusés le 23/10, la page disait
 * encore « YouTube » pendant quatre jours).
 */
export function clipSourcesStatus(): { youtube: "ok" | "rejected" | "no-cookies" | "refused"; rejectedAt?: number; twitch: boolean } {
  if (hasYoutubeCookies()) {
    const rejectedAt = youtubeCookiesRejectedAt();
    return rejectedAt ? { youtube: "rejected", rejectedAt, twitch: true } : { youtube: "ok", twitch: true };
  }
  return { youtube: youtubeRecentlyRefused() ? "refused" : "no-cookies", twitch: true };
}
