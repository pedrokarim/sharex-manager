/**
 * yt-dlp pour récupérer une vidéo par son adresse (YouTube, Twitch).
 *
 * Comme ffmpeg, le binaire n'est pas dans l'image Docker : l'exécutable
 * autonome d'une version épinglée est téléchargé une fois dans `data/tools/`
 * (volume persistant), vérifié par l'empreinte SHA-256 publiée avec la
 * version (`SHA2-256SUMS`), puis gardé.
 *
 * yt-dlp est lancé sans shell, avec une liste d'arguments fixée ici : aucune
 * option ne vient du navigateur, l'adresse passe après `--`. Il ne lit aucun
 * fichier de configuration ni cache, ne suit pas les listes de lecture, et
 * reçoit Bun comme moteur JavaScript (YouTube l'exige pour ses signatures).
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { childEnv } from "@/lib/child-env";
import { ensureFfmpeg } from "@/lib/media/ffmpeg";
import { killProcessTree, treeSpawnOptions } from "@/lib/media/process-tree";

export const YTDLP_VERSION = "2026.08.19";
const BASE = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`;

/** Empreintes lues dans le fichier `SHA2-256SUMS` de la version épinglée, vérifiées au téléchargement. */
const BUILDS: Record<string, { asset: string; sha256: string; binary: string; maxBytes: number }> = {
  linux: {
    asset: "yt-dlp_linux",
    sha256: "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a",
    binary: "yt-dlp",
    maxBytes: 80 * 1024 * 1024,
  },
  win32: {
    asset: "yt-dlp.exe",
    sha256: "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
    binary: "yt-dlp.exe",
    maxBytes: 60 * 1024 * 1024,
  },
};

const TOOLS_DIR = path.join(process.cwd(), "data", "tools", `yt-dlp-${YTDLP_VERSION}`);

const state = ((globalThis as any).__sxmYtDlp ??= {
  pending: null as Promise<string | null> | null,
  bun: undefined as string | null | undefined,
});

function build() {
  // Seuls les processeurs x64 ont un exécutable épinglé ici.
  if (process.arch !== "x64") return null;
  return BUILDS[process.platform] ?? null;
}

export function ytDlpPath(): string | null {
  const spec = build();
  if (!spec) return null;
  const file = path.join(TOOLS_DIR, spec.binary);
  return fs.existsSync(file) ? file : null;
}

async function download(): Promise<string | null> {
  const spec = build();
  if (!spec) return null;
  const response = await fetch(`${BASE}/${spec.asset}`, {
    redirect: "follow",
    headers: { "user-agent": "ShareX-Manager" },
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > spec.maxBytes) throw new Error("exécutable yt-dlp plus lourd que prévu");
    chunks.push(Buffer.from(value));
  }
  const binary = Buffer.concat(chunks);
  const digest = createHash("sha256").update(binary).digest("hex");
  if (digest !== spec.sha256) throw new Error("empreinte yt-dlp inattendue, fichier écarté");

  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const target = path.join(TOOLS_DIR, spec.binary);
  const temporary = `${target}.part-${process.pid}`;
  fs.writeFileSync(temporary, binary, { mode: 0o755 });
  fs.renameSync(temporary, target);
  return target;
}

/** yt-dlp disponible, téléchargé au besoin (un seul téléchargement à la fois). */
export async function ensureYtDlp(): Promise<string | null> {
  const existing = ytDlpPath();
  if (existing) return existing;
  if (!state.pending) {
    state.pending = download()
      .catch((error: unknown) => {
        console.error("[yt-dlp] téléchargement impossible :", error instanceof Error ? error.message : error);
        return null;
      })
      .finally(() => {
        state.pending = null;
      });
  }
  return state.pending;
}

/**
 * Bun, moteur JavaScript de yt-dlp : le processus lui-même quand le serveur
 * tourne sous Bun, sinon le premier `bun` trouvé dans le PATH.
 */
export function bunRuntimePath(): string | null {
  if (state.bun !== undefined) return state.bun;
  let found: string | null = null;
  if ((process.versions as Record<string, string | undefined>).bun && fs.existsSync(process.execPath)) {
    found = process.execPath;
  } else {
    const names = process.platform === "win32" ? ["bun.exe", "bun.cmd"] : ["bun"];
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
      if (!dir) continue;
      const hit = names.map((name) => path.join(dir, name)).find((file) => fs.existsSync(file));
      if (hit) {
        found = hit;
        break;
      }
    }
  }
  state.bun = found;
  return found;
}

// ─── Arguments ───────────────────────────────────────────────────

/** Plus grande hauteur récupérée : au-delà, le navigateur peine à monter la vidéo. */
export const MAX_HEIGHT = 1080;

/**
 * Formats demandés : H.264 et AAC (ce que décodent WebCodecs et la balise
 * vidéo), 1080p au plus. Twitch ne dit pas toujours ses codecs et sert
 * parfois du HEVC : le dernier recours prend le meilleur fichier jusqu'à
 * 1080p, que la conversion remet en H.264 au besoin.
 */
export function formatSelector(maxHeight = MAX_HEIGHT): string {
  const h = Math.max(144, Math.min(2160, Math.round(maxHeight)));
  return [
    `bv*[vcodec^=avc1][height<=${h}]+ba[acodec^=mp4a]`,
    `b[vcodec^=avc1][height<=${h}]`,
    `b[height<=${h}][format_id!^=portrait]`,
    `b[height<=${h}]`,
    "b",
  ].join("/");
}

/** Repères des lignes que yt-dlp écrit pour le serveur. */
const PROGRESS_TAG = "[sxm-progress]";
const FORMAT_TAG = "[sxm-format]";
const FILE_TAG = "[sxm-file]";

/** Secondes au format accepté par `--download-sections` (« 83.5 »). */
function seconds(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export interface Section {
  start: number;
  end: number;
}

/**
 * Options propres au téléchargement (les options communes s'ajoutent dans
 * `runYtDlp`). `limits` : hauteur et taille au plus, pour une longue vidéo à
 * découper (720p, quelques gigaoctets) ; par défaut 1080p et 1 500 Mo.
 */
export function buildDownloadArgs(
  url: string,
  outDir: string,
  section: Section | null,
  limits: { maxHeight?: number; maxFilesizeMb?: number; maxBytes?: number; exactCuts?: boolean } = {}
): string[] {
  const args = [
    "-f", formatSelector(limits.maxHeight),
    "--merge-output-format", "mp4",
    "--no-mtime",
    "--retries", "3",
    "--fragment-retries", "3",
    "--max-filesize", `${Math.max(1, Math.round(limits.maxFilesizeMb ?? 1500))}M`,
    "--newline",
    "--progress",
    "--progress-template", `download:${PROGRESS_TAG} %(progress.status)s %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s`,
    "--print", `before_dl:${FORMAT_TAG} %(format_id)s %(vcodec)s %(acodec)s %(tbr)s %(filesize_approx)s %(duration)s`,
    "--print", `after_move:${FILE_TAG} %(filepath)s`,
    "-o", path.join(outDir, "source.%(ext)s"),
  ];
  // Plafond dur dans ffmpeg, que yt-dlp lance pour un passage : `--max-filesize`
  // ne vaut que pour un téléchargement direct. ffmpeg s’arrête de lui-même à cette taille.
  if (limits.maxBytes && limits.maxBytes > 0) args.push("--downloader-args", `ffmpeg_o:-fs ${Math.floor(limits.maxBytes)}`);
  if (section) args.push("--download-sections", `*${seconds(section.start)}-${seconds(section.end)}`);
  // Coupe à l'image près (réencodage autour des bornes) : un extrait cité ne commence pas au milieu d'un mot.
  if (section && limits.exactCuts) args.push("--force-keyframes-at-cuts");
  args.push("--", url);
  return args;
}

export interface ProgressLine {
  status: string;
  downloaded?: number;
  total?: number;
}

const numberOrUndefined = (value: string | undefined) => {
  const parsed = Number(value);
  return value && value !== "NA" && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

/** Ligne de progression écrite par le modèle `--progress-template`, ou null. */
export function parseProgressLine(line: string): ProgressLine | null {
  const at = line.indexOf(PROGRESS_TAG);
  if (at < 0) return null;
  const [status, downloaded, total, estimate] = line.slice(at + PROGRESS_TAG.length).trim().split(/\s+/);
  if (!status) return null;
  return {
    status,
    downloaded: numberOrUndefined(downloaded),
    total: numberOrUndefined(total) ?? numberOrUndefined(estimate),
  };
}

export interface FormatLine {
  formatId: string;
  vcodec?: string;
  acodec?: string;
  /** Débit total, en kilobits par seconde. */
  tbr?: number;
  filesizeApprox?: number;
  duration?: number;
}

export function parseFormatLine(line: string): FormatLine | null {
  const at = line.indexOf(FORMAT_TAG);
  if (at < 0) return null;
  const [formatId, vcodec, acodec, tbr, size, duration] = line.slice(at + FORMAT_TAG.length).trim().split(/\s+/);
  if (!formatId) return null;
  const text = (value?: string) => (value && value !== "NA" ? value : undefined);
  return {
    formatId,
    vcodec: text(vcodec),
    acodec: text(acodec),
    tbr: numberOrUndefined(tbr),
    filesizeApprox: numberOrUndefined(size),
    duration: numberOrUndefined(duration),
  };
}

export function parseFileLine(line: string): string | null {
  const at = line.indexOf(FILE_TAG);
  return at < 0 ? null : line.slice(at + FILE_TAG.length).trim() || null;
}

// ─── Erreurs ─────────────────────────────────────────────────────

export type YtDlpErrorCode =
  | "missing"
  | "ffmpeg-crash"
  | "bot-check"
  | "cookies-invalid"
  | "age"
  | "members"
  | "private"
  | "unavailable"
  | "live"
  | "geo"
  | "unsupported"
  | "too-large"
  | "network"
  | "timeout"
  | "canceled"
  | "unknown";

export class YtDlpError extends Error {
  constructor(public code: YtDlpErrorCode, message: string, public detail?: string) {
    super(message);
    this.name = "YtDlpError";
  }
}

/** Nature d'un échec, lue dans les messages `ERROR:` de yt-dlp. */
export function classifyYtDlpError(stderr: string): YtDlpErrorCode {
  const text = stderr.toLowerCase();
  if (text.includes("cookies are no longer valid") || text.includes("cookies have been rotated")) return "cookies-invalid";
  if (text.includes("confirm your age") || text.includes("age-restricted") || text.includes("inappropriate for some users")) return "age";
  if (text.includes("confirm you") && text.includes("not a bot")) return "bot-check";
  if (text.includes("members-only") || text.includes("join this channel") || text.includes("subscriber-only")) return "members";
  if (text.includes("private video") || text.includes("this video is private")) return "private";
  if (text.includes("not available in your country") || text.includes("geo restrict") || text.includes("geo-restrict")) return "geo";
  if (text.includes("is live") || text.includes("live event will begin") || text.includes("premieres in")) return "live";
  if (text.includes("file is larger than max-filesize")) return "too-large";
  if (/ffmpeg exited with code (-11|139|-6|134)\b/.test(text) || text.includes("segmentation fault")) return "ffmpeg-crash";
  if (text.includes("unsupported url") || text.includes("is not a valid url")) return "unsupported";
  if (text.includes("video unavailable") || text.includes("video is unavailable") || text.includes("http error 404") || text.includes("does not exist") || text.includes("has been removed") || text.includes("clip not found")) return "unavailable";
  if (text.includes("timed out") || text.includes("unable to download webpage") || text.includes("connection") || text.includes("http error 5")) return "network";
  return "unknown";
}

/** Message à montrer pour un échec, en français. */
export function ytDlpErrorMessage(code: YtDlpErrorCode, options: { hasCookies?: boolean; site?: string } = {}): string {
  switch (code) {
    case "missing":
      return "L’outil de récupération (yt-dlp) n’a pas pu être installé sur le serveur. Réessayez plus tard, ou envoyez le fichier.";
    case "bot-check":
      return options.hasCookies
        ? "YouTube refuse le serveur malgré les cookies enregistrés : un administrateur doit les renouveler dans les réglages de Clip Studio. En attendant, envoyez le fichier."
        : "YouTube demande une connexion pour cette vidéo. Un administrateur doit ajouter les cookies YouTube dans les réglages de Clip Studio (« Voix en ligne », section « Sources vidéo »). En attendant, envoyez le fichier.";
    case "cookies-invalid":
      return "Les cookies YouTube enregistrés ne sont plus valables : un administrateur doit les renouveler dans les réglages de Clip Studio. En attendant, envoyez le fichier.";
    case "age":
      return "Cette vidéo est réservée aux adultes : il faut les cookies d’un compte YouTube majeur, ajoutés par un administrateur.";
    case "members":
      return "Cette vidéo est réservée aux membres de la chaîne : elle ne peut pas être récupérée.";
    case "private":
      return "Cette vidéo est privée : elle ne peut pas être récupérée.";
    case "unavailable":
      return "Cette vidéo est introuvable ou a été retirée. Vérifiez l’adresse.";
    case "live":
      return "Une diffusion en direct ou à venir ne peut pas être récupérée. Attendez la rediffusion.";
    case "geo":
      return "Cette vidéo n’est pas disponible depuis le pays du serveur.";
    case "unsupported":
      return "Cette adresse n’est pas reconnue comme une vidéo.";
    case "too-large":
      return "La vidéo dépasse 500 Mo. Choisissez un passage plus court.";
    case "network":
      return `${options.site ?? "Le site"} ne répond pas pour l’instant. Réessayez dans un moment.`;
    case "ffmpeg-crash":
      return "ffmpeg a planté sur le serveur en lisant la vidéo : la vidéo a bien été trouvée, c’est l’outil de découpe qui a lâché. Prévenez un administrateur.";
    case "timeout":
      return "La récupération a pris trop de temps et a été arrêtée. Choisissez un passage plus court, ou réessayez.";
    case "canceled":
      return "Récupération annulée.";
    default:
      return "La vidéo n’a pas pu être récupérée. Vérifiez l’adresse, ou envoyez le fichier.";
  }
}

// ─── Lancement ───────────────────────────────────────────────────

export interface RunOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Fichier de cookies au format Netscape, propre à cet appel (yt-dlp le réécrit). */
  cookiesFile?: string | null;
  /** Chaque ligne écrite par yt-dlp, sortie standard et erreurs confondues. */
  onLine?: (line: string) => void;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * ffmpeg pour yt-dlp, qui lui fait lire des adresses en ligne (un passage
 * d'une vidéo). Celui du système d'abord : la version statique épinglée plante
 * dès qu'elle résout un nom de domaine (erreur de segmentation). À défaut,
 * l'épinglée, qui suffit tant qu'aucun passage n'est demandé.
 */
export async function networkFfmpeg(): Promise<string | null> {
  for (const candidate of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
    if (process.platform !== "win32" && fs.existsSync(candidate)) return candidate;
  }
  return ensureFfmpeg();
}

/** Options communes à tous les appels, avant celles de l'appel. */
export async function commonArgs(cookiesFile?: string | null): Promise<string[]> {
  const args = ["--no-config", "--no-cache-dir", "--no-playlist", "--no-warnings", "--socket-timeout", "30", "--no-js-runtimes"];
  const bun = bunRuntimePath();
  if (bun) args.push("--js-runtimes", `bun:${bun}`);
  const ffmpeg = await networkFfmpeg();
  if (ffmpeg) args.push("--ffmpeg-location", ffmpeg);
  if (cookiesFile) args.push("--cookies", cookiesFile);
  return args;
}

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_STDOUT = 8 * 1024 * 1024;

/**
 * Lance yt-dlp avec les options communes puis `args`, sans shell. Le
 * processus est tué à l'échéance ou quand `signal` est levé.
 */
export async function runYtDlp(args: string[], options: RunOptions = {}): Promise<RunResult> {
  const binary = await ensureYtDlp();
  if (!binary) throw new YtDlpError("missing", ytDlpErrorMessage("missing"));
  if (options.signal?.aborted) throw new YtDlpError("canceled", ytDlpErrorMessage("canceled"));
  const fullArgs = [...(await commonArgs(options.cookiesFile)), ...args];

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(binary, fullArgs, {
      env: childEnv(),
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      // Groupe à part (Linux) : yt-dlp, son interpréteur et le ffmpeg qu'il lance s'arrêtent ensemble.
      ...treeSpawnOptions(),
    });
    let stdout = "";
    let stderr = "";
    let reason: "timeout" | "canceled" | null = null;
    let settled = false;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    const pending = { out: "", err: "" };

    const feed = (stream: "out" | "err", chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      if (stream === "out") {
        if (stdout.length < MAX_STDOUT) stdout += text;
      } else {
        stderr = (stderr + text).slice(-40_000);
      }
      if (!options.onLine) return;
      const lines = (pending[stream] + text).split(/\r?\n|\r/);
      pending[stream] = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) options.onLine(line);
    };
    child.stdout.on("data", (chunk: Buffer) => feed("out", chunk));
    child.stderr.on("data", (chunk: Buffer) => feed("err", chunk));

    const stop = (why: "timeout" | "canceled") => {
      reason ??= why;
      killProcessTree(child);
    };
    const timer = setTimeout(() => stop("timeout"), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const onAbort = () => stop("canceled");
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const settle = (code: number | null, flush: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (closeTimer) clearTimeout(closeTimer);
      options.signal?.removeEventListener("abort", onAbort);
      if (flush && options.onLine) for (const rest of [pending.out, pending.err]) if (rest.trim()) options.onLine(rest);
      if (reason) return reject(new YtDlpError(reason, ytDlpErrorMessage(reason)));
      resolve({ code: code ?? 1, stdout, stderr });
    };
    /** Un descendant encore vivant peut garder les tuyaux ouverts : on les ferme de notre côté. */
    const release = () => {
      child.stdout?.destroy();
      child.stderr?.destroy();
    };
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (closeTimer) clearTimeout(closeTimer);
      options.signal?.removeEventListener("abort", onAbort);
      release();
      reject(error);
    });
    // `exit` arrive dès la fin de yt-dlp ; `close` attend aussi la fermeture des
    // tuyaux, que ffmpeg (lancé par yt-dlp) peut garder. Arrêté par nous : le
    // travail est rendu tout de suite, l'arbre ayant été tué. Sinon `close` a
    // cinq secondes pour livrer les dernières lignes.
    child.on("exit", (code) => {
      if (reason) {
        // Au cas où un descendant aurait échappé au premier signal.
        killProcessTree(child);
        release();
        settle(code, false);
        return;
      }
      closeTimer = setTimeout(() => {
        release();
        settle(code, true);
      }, 5000);
    });
    child.on("close", (code) => settle(code, true));
  });
}

/** Dernière ligne `ERROR:` de yt-dlp, sans chemin du serveur ni cookie. */
export function lastErrorLine(stderr: string): string {
  const line = stderr
    .split(/\r?\n/)
    .filter((entry) => entry.startsWith("ERROR:"))
    .pop();
  return (line ?? "").replace(/[A-Za-z]:\\[^\s]+|\/[^\s]*\/[^\s]+/g, "…").slice(0, 300);
}

function failure(result: RunResult, options: { hasCookies?: boolean; site?: string }): YtDlpError {
  const code = classifyYtDlpError(result.stderr);
  return new YtDlpError(code, ytDlpErrorMessage(code, options), lastErrorLine(result.stderr));
}

// ─── Lecture des métadonnées ─────────────────────────────────────

export interface RemoteVideoInfo {
  id?: string;
  title: string;
  uploader?: string;
  /** Durée en secondes, quand le site la donne. */
  duration?: number;
  /** Adresse de la meilleure vignette de 640 px de large au plus. */
  thumbnail?: string;
  webpageUrl?: string;
  extractor: string;
  isLive: boolean;
}

interface RawThumbnail {
  url?: unknown;
  width?: unknown;
  height?: unknown;
}

/** Vignette la plus large sans dépasser 640 px ; la vignette principale à défaut. */
export function pickThumbnail(thumbnails: unknown, fallback: unknown): string | undefined {
  const list = (Array.isArray(thumbnails) ? (thumbnails as RawThumbnail[]) : []).filter(
    (entry) => typeof entry?.url === "string" && /^https:\/\//.test(entry.url as string)
  );
  const sized = list
    .filter((entry) => typeof entry.width === "number" && (entry.width as number) <= 640)
    .sort((a, b) => (b.width as number) - (a.width as number));
  const chosen = sized[0]?.url ?? (typeof fallback === "string" && /^https:\/\//.test(fallback) ? fallback : list[list.length - 1]?.url);
  return typeof chosen === "string" ? chosen : undefined;
}

/** Métadonnées (`-J`) d'une vidéo, sans rien télécharger. */
export function parseInfoJson(raw: string): RemoteVideoInfo {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new YtDlpError("unknown", ytDlpErrorMessage("unknown"));
  }
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : undefined);
  const duration = typeof data.duration === "number" && Number.isFinite(data.duration) && data.duration > 0 ? data.duration : undefined;
  return {
    id: text(data.id, 120),
    title: text(data.title, 300) || "Vidéo",
    uploader: text(data.uploader, 120) || text(data.channel, 120) || text(data.creator, 120),
    duration,
    thumbnail: pickThumbnail(data.thumbnails, data.thumbnail),
    webpageUrl: text(data.webpage_url, 500),
    extractor: text(data.extractor_key, 60) || text(data.extractor, 60) || "",
    isLive: data.is_live === true || data.live_status === "is_live" || data.live_status === "is_upcoming",
  };
}

export async function probeUrl(
  url: string,
  options: { signal?: AbortSignal; cookiesFile?: string | null; site?: string } = {}
): Promise<RemoteVideoInfo> {
  const result = await runYtDlp(["-J", "--", url], { signal: options.signal, cookiesFile: options.cookiesFile, timeoutMs: 90_000 });
  if (result.code !== 0) throw failure(result, { hasCookies: Boolean(options.cookiesFile), site: options.site });
  const info = parseInfoJson(result.stdout);
  if (info.isLive) throw new YtDlpError("live", ytDlpErrorMessage("live"));
  return info;
}

// ─── Recherche YouTube ───────────────────────────────────────────

/** Un résultat de recherche YouTube (`ytsearchN:`), lu sans rien télécharger. */
export interface SearchEntry {
  id: string;
  /** Adresse canonique de la vidéo. */
  url: string;
  title: string;
  channel?: string;
  /** La chaîne porte la coche de YouTube (souvent la chaîne officielle). */
  verified: boolean;
  duration?: number;
  views?: number;
  /** En direct, à venir, réservé aux membres… : à écarter. */
  unavailable: boolean;
}

/** Résultats d'une recherche (`-J --flat-playlist`), filtrés sur des identifiants YouTube valables. */
export function parseSearchJson(raw: string): SearchEntry[] {
  let data: { entries?: unknown };
  try {
    data = JSON.parse(raw) as { entries?: unknown };
  } catch {
    throw new YtDlpError("unknown", ytDlpErrorMessage("unknown"));
  }
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : undefined);
  const entries = Array.isArray(data.entries) ? (data.entries as Record<string, unknown>[]) : [];
  return entries.flatMap((entry): SearchEntry[] => {
    const id = text(entry?.id, 20);
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return [];
    const duration = typeof entry.duration === "number" && Number.isFinite(entry.duration) && entry.duration > 0 ? entry.duration : undefined;
    const views = typeof entry.view_count === "number" && Number.isFinite(entry.view_count) ? entry.view_count : undefined;
    const live = entry.live_status === "is_live" || entry.live_status === "is_upcoming" || entry.live_status === "post_live";
    const availability = typeof entry.availability === "string" ? entry.availability : "public";
    return [
      {
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: text(entry.title, 300) || "Vidéo",
        ...(text(entry.channel, 120) || text(entry.uploader, 120) ? { channel: text(entry.channel, 120) || text(entry.uploader, 120) } : {}),
        verified: entry.channel_is_verified === true,
        ...(duration ? { duration } : {}),
        ...(views !== undefined ? { views } : {}),
        unavailable: live || !["public", "unlisted"].includes(availability),
      },
    ];
  });
}

/**
 * Cherche sur YouTube (`ytsearchN:requête`), sans rien télécharger. La
 * requête passe après `--` comme une adresse : elle ne peut pas devenir une
 * option.
 */
export async function searchYoutube(
  query: string,
  options: { count?: number; signal?: AbortSignal; cookiesFile?: string | null } = {}
): Promise<SearchEntry[]> {
  const clean = query.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  if (!clean) return [];
  const count = Math.max(1, Math.min(10, Math.round(options.count ?? 5)));
  const result = await runYtDlp(["-J", "--flat-playlist", "--", `ytsearch${count}:${clean}`], { signal: options.signal, cookiesFile: options.cookiesFile, timeoutMs: 60_000 });
  if (result.code !== 0) throw failure(result, { hasCookies: Boolean(options.cookiesFile), site: "YouTube" });
  return parseSearchJson(result.stdout);
}

// ─── Téléchargement d'un passage ─────────────────────────────────

export interface DownloadProgress {
  /** De 0 à 1 ; absent quand la taille finale est inconnue. */
  ratio?: number;
  bytes: number;
}

export interface DownloadResult {
  file: string;
  format?: FormatLine;
}

/** Taille totale des fichiers d'un dossier (morceaux `.part` compris). */
function folderBytes(dir: string): number {
  try {
    return fs.readdirSync(dir).reduce((sum, name) => {
      try {
        return sum + fs.statSync(path.join(dir, name)).size;
      } catch {
        return sum;
      }
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * Télécharge `url` (le passage `section`, en secondes, ou la vidéo entière)
 * dans `outDir`. Un passage est découpé par ffmpeg, qui ne donne pas sa
 * progression : elle est alors estimée d'après le débit annoncé du format
 * et la taille déjà écrite. Le téléchargement s'arrête au-delà de `maxBytes`.
 */
export async function downloadSection(
  url: string,
  section: Section | null,
  outDir: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    cookiesFile?: string | null;
    maxBytes: number;
    /** Hauteur d'image au plus (1080 par défaut). */
    maxHeight?: number;
    /** Passage coupé à l'image près (`--force-keyframes-at-cuts`), plus lent. */
    exactCuts?: boolean;
    site?: string;
    onProgress?: (progress: DownloadProgress) => void;
  }
): Promise<DownloadResult> {
  fs.mkdirSync(outDir, { recursive: true });
  let format: FormatLine | undefined;
  let file: string | null = null;
  let reported = 0;
  const local = new AbortController();
  let tooLarge = false;
  const relay = () => local.abort();
  options.signal?.addEventListener("abort", relay, { once: true });

  const expected = () => {
    if (!format) return undefined;
    const length = section ? section.end - section.start : format.duration;
    if (format.tbr && length) return (format.tbr * 1000 * length) / 8;
    if (format.filesizeApprox && section && format.duration) return (format.filesizeApprox * (section.end - section.start)) / format.duration;
    return format.filesizeApprox;
  };
  const report = (bytes: number, total?: number) => {
    if (bytes > options.maxBytes) {
      tooLarge = true;
      local.abort();
      return;
    }
    const target = total ?? expected();
    const ratio = target ? Math.min(0.99, bytes / target) : undefined;
    // La progression ne recule jamais (un second flux, le son, repart de zéro).
    const next = ratio === undefined ? undefined : Math.max(reported, ratio);
    if (next !== undefined) reported = next;
    options.onProgress?.({ ratio: next, bytes });
  };

  const poll = setInterval(() => report(folderBytes(outDir)), 1000);
  try {
    const limits = {
      maxHeight: options.maxHeight,
      maxFilesizeMb: Math.max(1500, Math.ceil(options.maxBytes / (1024 * 1024))),
      maxBytes: options.maxBytes,
      ...(options.exactCuts ? { exactCuts: true } : {}),
    };
    const result = await runYtDlp(buildDownloadArgs(url, outDir, section, limits), {
      signal: local.signal,
      timeoutMs: options.timeoutMs,
      cookiesFile: options.cookiesFile,
      onLine: (line) => {
        format = parseFormatLine(line) ?? format;
        file = parseFileLine(line) ?? file;
        const progress = parseProgressLine(line);
        if (progress && progress.status === "downloading" && progress.downloaded !== undefined && !section) {
          report(progress.downloaded, progress.total);
        }
      },
    }).catch((error: unknown) => {
      if (tooLarge) throw new YtDlpError("too-large", ytDlpErrorMessage("too-large"));
      throw error;
    });
    if (tooLarge) throw new YtDlpError("too-large", ytDlpErrorMessage("too-large"));
    if (result.code !== 0) throw failure(result, { hasCookies: Boolean(options.cookiesFile), site: options.site });
    const resolved = file ? path.resolve(file) : null;
    // Le fichier annoncé doit être dans le dossier du travail.
    if (!resolved || path.dirname(resolved) !== path.resolve(outDir) || !fs.existsSync(resolved)) {
      throw new YtDlpError("unknown", ytDlpErrorMessage("unknown"));
    }
    // ffmpeg arrêté par `-fs` finit sans erreur, sur un fichier tronqué à la limite.
    if (fs.statSync(resolved).size >= options.maxBytes) throw new YtDlpError("too-large", ytDlpErrorMessage("too-large"));
    return { file: resolved, format };
  } finally {
    clearInterval(poll);
    options.signal?.removeEventListener("abort", relay);
  }
}
