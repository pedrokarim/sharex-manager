/**
 * Lecture publique des comptes d'une niche (dossier 01 illustrations, S3) :
 * les vidéos courtes récentes d'une chaîne YouTube, lues par yt-dlp, sans
 * compte connecté ni quota d'API.
 *
 * Deux sortes d'appels, tous deux bornés :
 *
 * 1. **L'onglet « Shorts »** d'une chaîne, en liste plate
 *    (`-J --flat-playlist --playlist-end 30`) : un seul appel par chaîne,
 *    qui donne l'identifiant, le titre et les vues (arrondies par YouTube)
 *    des 30 dernières vidéos courtes, de la plus récente à la plus ancienne.
 *    Ni date ni durée : l'ordre suffit à la médiane.
 * 2. **Le détail d'une vidéo** qui sort du lot (`-j`), pour sa date, sa durée
 *    et ses vues exactes, et, si on le demande, ses sous-titres
 *    (`--write-auto-subs --skip-download`, français et anglais, la piste
 *    d'origine d'abord) dont on garde les premières paroles. Vingt-quatre
 *    vidéos au plus par étude (`DETAILS_TOTAL`).
 *
 * Par respect pour YouTube et pour l'adresse du serveur : un appel à la
 * fois, quatre secondes au moins entre deux appels, et la porte commune des
 * lectures d'adresse (`sharedProbeGate`, vingt lectures par minute pour tout
 * le serveur) ; quand elle est pleine, on attend au lieu d'insister. yt-dlp
 * est lancé sans shell, avec des arguments fixés ici : l'adresse passe après
 * `--`, le `@nom` est déjà validé (`cleanChannelHandle`).
 *
 * Les fonctions de lecture du texte rendu (`parseShortsTab`,
 * `parseVideoDetail`, `firstSpokenLine`, `pickSubtitle`) sont pures.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { YtDlpError, classifyYtDlpError, lastErrorLine, type RunOptions, type RunResult, type YtDlpErrorCode } from "@/lib/media/ytdlp";
import { SHORTS_PER_CHANNEL } from "./idea-scoring";
import { BANK_LIMITS, type NicheService } from "./idea-types";
import { holdWorkDir } from "./job-safety";
import { HOOK_MAX_SECONDS } from "./script-rules";

/** Bornes de la lecture publique. */
export const PUBLIC_READ = {
  /** Écart minimal entre deux appels de yt-dlp d'une étude. */
  pauseMs: 4000,
  /** Attente quand la porte commune est pleine, avant de réessayer. */
  busyWaitMs: 20_000,
  busyRetries: 3,
  listTimeoutMs: 90_000,
  detailTimeoutMs: 90_000,
  /** Premières paroles : ce qui est dit dans les premières secondes, l'accroche. */
  spokenSeconds: HOOK_MAX_SECONDS + 0.5,
  /** Langues de sous-titres demandées, dans l'ordre de préférence (la piste d'origine d'abord). */
  subtitleLanguages: ["fr-orig", "en-orig", "fr", "en"],
} as const;

// ─── Lecture du texte rendu par yt-dlp ───────────────────────────

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export interface PublicShort {
  id: string;
  title: string;
  url: string;
  /** Vues telles que l'onglet les donne (arrondies par YouTube). */
  views?: number;
}

export interface PublicAccount {
  title: string;
  handle?: string;
  followers?: number;
  /** De la plus récente à la plus ancienne. */
  shorts: PublicShort[];
}

/** L'onglet « Shorts » d'une chaîne, en liste plate (`-J --flat-playlist`). */
export function parseShortsTab(raw: string, max: number = SHORTS_PER_CHANNEL): PublicAccount {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new YtDlpError("unknown", "Réponse illisible de yt-dlp pour cette chaîne.");
  }
  const entries = Array.isArray(data.entries) ? (data.entries as Record<string, unknown>[]) : [];
  const shorts = entries.flatMap((entry): PublicShort[] => {
    const id = text(entry?.id, 20);
    if (!VIDEO_ID.test(id)) return [];
    const views = typeof entry.view_count === "number" && Number.isFinite(entry.view_count) && entry.view_count >= 0 ? Math.round(entry.view_count) : undefined;
    return [{ id, title: text(entry.title, 300) || "Vidéo", url: `https://www.youtube.com/shorts/${id}`, ...(views !== undefined ? { views } : {}) }];
  });
  const followers = typeof data.channel_follower_count === "number" && Number.isFinite(data.channel_follower_count) ? Math.round(data.channel_follower_count) : undefined;
  const handle = text(data.uploader_id, 40);
  // « Underscore_ - Shorts » : le nom de la chaîne vient d'abord de `channel`.
  const title = text(data.channel, 120) || text(data.uploader, 120) || text(data.title, 120).replace(/\s+-\s+Shorts$/i, "");
  return { title: title || "Chaîne", ...(handle.startsWith("@") ? { handle } : {}), ...(followers !== undefined ? { followers } : {}), shorts: shorts.slice(0, max) };
}

export interface PublicDetail {
  /** Date de publication (ISO). */
  publishedAt?: string;
  durationSeconds?: number;
  views?: number;
  /** Langue de la vidéo, quand YouTube la donne. */
  language?: string;
}

/** Le détail d'une vidéo (`-j`). */
export function parseVideoDetail(raw: string): PublicDetail {
  let data: Record<string, unknown>;
  try {
    // `-j` écrit un objet par ligne : une seule vidéo ici, la dernière ligne non vide.
    const line = raw.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
    data = JSON.parse(line) as Record<string, unknown>;
  } catch {
    throw new YtDlpError("unknown", "Réponse illisible de yt-dlp pour cette vidéo.");
  }
  const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);
  const timestamp = finite(data.timestamp);
  const day = typeof data.upload_date === "string" && /^\d{8}$/.test(data.upload_date) ? data.upload_date : null;
  const publishedAt = timestamp ? new Date(timestamp * 1000).toISOString() : day ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T12:00:00.000Z` : undefined;
  const duration = finite(data.duration);
  const views = finite(data.view_count);
  const language = typeof data.language === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(data.language) ? data.language : undefined;
  return {
    ...(publishedAt ? { publishedAt } : {}),
    ...(duration ? { durationSeconds: Math.round(duration) } : {}),
    ...(views !== undefined ? { views: Math.round(views) } : {}),
    ...(language ? { language } : {}),
  };
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

function cueSeconds(stamp: string): number {
  const parts = stamp.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return Number.POSITIVE_INFINITY;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Premières paroles d'un fichier WebVTT : ce qui commence dans les
 * premières secondes. Les sous-titres automatiques de YouTube répètent la
 * ligne précédente dans chaque repère (texte « roulant ») : une ligne déjà
 * vue n'est pas reprise. Balises de minutage et de style retirées.
 */
export function firstSpokenLine(vtt: string, maxSeconds: number = PUBLIC_READ.spokenSeconds, maxChars: number = BANK_LIMITS.spoken): string {
  const blocks = vtt.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const kept: { at: number; line: string }[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const lines = block.split("\n");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const at = cueSeconds(lines[timing].split("-->")[0].trim());
    for (const rawLine of lines.slice(timing + 1)) {
      const line = rawLine
        .replace(/<[^>]*>/g, "")
        .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!line || seen.has(line)) continue;
      seen.add(line);
      kept.push({ at, line });
    }
  }
  const early = kept.filter((entry) => entry.at < maxSeconds);
  const words = (early.length ? early : kept.slice(0, 1)).map((entry) => entry.line).join(" ");
  if (words.length <= maxChars) return words;
  const cut = words.slice(0, maxChars);
  const space = cut.lastIndexOf(" ");
  return `${(space > maxChars * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/** Fichier de sous-titres à lire pour une vidéo, la piste préférée d'abord ; `null` sans fichier. */
export function pickSubtitle(files: readonly string[], videoId: string, languages: readonly string[] = PUBLIC_READ.subtitleLanguages): { file: string; language: string } | null {
  const found = files
    .map((file) => {
      if (!file.startsWith(`${videoId}.`) || !file.endsWith(".vtt")) return null;
      const language = file.slice(videoId.length + 1, -".vtt".length);
      return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language) ? { file, language } : null;
    })
    .filter((entry): entry is { file: string; language: string } => entry !== null);
  const rank = (language: string) => {
    const index = languages.indexOf(language);
    return index < 0 ? languages.length : index;
  };
  const best = found.sort((a, b) => rank(a.language) - rank(b.language))[0];
  return best ? { file: best.file, language: best.language.replace(/-orig$/, "") } : null;
}

// ─── Appels de yt-dlp ────────────────────────────────────────────

/** Message d'un échec de lecture d'une chaîne ou d'une vidéo, en français. */
export function publicReadMessage(code: YtDlpErrorCode, hasCookies = false): string {
  switch (code) {
    case "missing":
      return "yt-dlp n’a pas pu être installé sur le serveur : la lecture publique est indisponible pour l’instant.";
    case "bot-check":
      return hasCookies
        ? "YouTube refuse le serveur malgré les cookies enregistrés : un administrateur doit les renouveler (réglages de Clip Studio, « Sources vidéo »)."
        : "YouTube demande une connexion : un administrateur peut ajouter des cookies YouTube (réglages de Clip Studio, « Sources vidéo »).";
    case "cookies-invalid":
      return "Les cookies YouTube enregistrés ne sont plus valables : un administrateur doit les renouveler.";
    case "unavailable":
    case "unsupported":
      return "Chaîne ou vidéo introuvable : vérifiez le @nom.";
    case "geo":
      return "Contenu indisponible depuis le pays du serveur.";
    case "network":
      return "YouTube ne répond pas pour l’instant : réessayez plus tard.";
    case "timeout":
      return "Lecture trop longue, arrêtée.";
    case "canceled":
      return "Lecture annulée.";
    default:
      return "Lecture impossible.";
  }
}

export interface PublicNicheReader {
  service: NicheService;
  /** Appels faits depuis la création du lecteur. */
  calls(): number;
  readShorts(handle: string, signal?: AbortSignal): Promise<PublicAccount>;
  readDetail(videoId: string, options: { spoken: boolean; signal?: AbortSignal }): Promise<PublicDetail & { spoken?: string; spokenLanguage?: string }>;
}

/** Porte commune des lectures d'adresse (voir `remote-import.ts`). */
export interface ReaderGate {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
}

export interface PublicReaderDeps {
  run(args: string[], options: RunOptions): Promise<RunResult>;
  gate: ReaderGate;
  /** Messages par lesquels la porte dit qu'elle est pleine : on attend, puis on réessaie. */
  busyMessages: readonly string[];
  /** Dossier de travail de l'appel (sous-titres, copie des cookies), effacé après. */
  workRoot: string;
  /** Copie des cookies YouTube dans le dossier, ou `null` sans cookies. */
  cookies(dir: string): string | null;
  onCookiesRejected(): void;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** Attente interrompue par `signal`. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new YtDlpError("canceled", publicReadMessage("canceled")));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new YtDlpError("canceled", publicReadMessage("canceled")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Adresse de l'onglet « Shorts » d'une chaîne, depuis son `@nom` déjà validé. */
export const shortsTabUrl = (handle: string) => `https://www.youtube.com/@${encodeURIComponent(handle.replace(/^@/, ""))}/shorts`;

/** Arguments de la lecture de l'onglet « Shorts » (après les options communes). */
export function shortsArgs(handle: string, max: number = SHORTS_PER_CHANNEL): string[] {
  return ["-J", "--flat-playlist", "--playlist-end", String(max), "--", shortsTabUrl(handle)];
}

/** Arguments de la lecture du détail d'une vidéo ; avec `subtitlesDir`, ses sous-titres y sont écrits, sans la vidéo. */
export function detailArgs(videoId: string, subtitlesDir?: string): string[] {
  const subtitles = subtitlesDir
    ? ["--no-simulate", "--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", PUBLIC_READ.subtitleLanguages.join(","), "--sub-format", "vtt", "-o", path.join(subtitlesDir, "%(id)s.%(ext)s")]
    : [];
  return ["-j", ...subtitles, "--", `https://www.youtube.com/watch?v=${videoId}`];
}

/**
 * Lecteur public de YouTube pour une étude : un appel à la fois, espacés,
 * passés par la porte commune. Les dépendances sont injectées : les tests
 * n'appellent jamais yt-dlp.
 */
export function createPublicReader(deps: PublicReaderDeps): PublicNicheReader {
  let last = 0;
  let calls = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const call = <T>(key: string, timeoutMs: number, args: (dir: string) => string[], read: (result: RunResult, dir: string) => T, signal?: AbortSignal): Promise<T> => {
    const task = async () => {
      const wait = last + PUBLIC_READ.pauseMs - deps.now();
      if (wait > 0) await deps.sleep(wait, signal);
      const dir = path.join(deps.workRoot, `niche-${deps.now().toString(36)}${randomBytes(3).toString("hex")}`);
      const release = holdWorkDir(dir);
      try {
        fs.mkdirSync(dir, { recursive: true });
        const cookiesFile = deps.cookies(dir);
        for (let attempt = 0; ; attempt++) {
          try {
            const result = await deps.gate.run(key, () => {
              last = deps.now();
              calls++;
              return deps.run(args(dir), { signal, timeoutMs, cookiesFile });
            });
            if (result.code !== 0) {
              const code = classifyYtDlpError(result.stderr);
              if (cookiesFile && (code === "bot-check" || code === "cookies-invalid")) deps.onCookiesRejected();
              throw new YtDlpError(code, publicReadMessage(code, Boolean(cookiesFile)), lastErrorLine(result.stderr));
            }
            return read(result, dir);
          } catch (error) {
            const busy = error instanceof Error && !(error instanceof YtDlpError) && deps.busyMessages.includes(error.message);
            if (!busy || attempt >= PUBLIC_READ.busyRetries) throw error;
            await deps.sleep(PUBLIC_READ.busyWaitMs, signal);
          }
        }
      } finally {
        release();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };
    // Les appels d'une même étude passent l'un après l'autre.
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    service: "youtube",
    calls: () => calls,
    readShorts: (handle, signal) => call(`niche-shorts:${handle.toLowerCase()}`, PUBLIC_READ.listTimeoutMs, () => shortsArgs(handle), (result) => parseShortsTab(result.stdout), signal),
    readDetail: (videoId, options) => {
      if (!VIDEO_ID.test(videoId)) return Promise.reject(new YtDlpError("unsupported", publicReadMessage("unsupported")));
      return call(
        `niche-detail:${videoId}`,
        PUBLIC_READ.detailTimeoutMs,
        (dir) => detailArgs(videoId, options.spoken ? dir : undefined),
        (result, dir) => {
          const detail = parseVideoDetail(result.stdout);
          if (!options.spoken) return detail;
          let files: string[] = [];
          try {
            files = fs.readdirSync(dir);
          } catch {
            files = [];
          }
          const subtitle = pickSubtitle(files, videoId);
          if (!subtitle) return detail;
          const spoken = firstSpokenLine(fs.readFileSync(path.join(dir, subtitle.file), "utf-8"));
          return spoken ? { ...detail, spoken, spokenLanguage: subtitle.language } : detail;
        },
        options.signal
      );
    },
  };
}
