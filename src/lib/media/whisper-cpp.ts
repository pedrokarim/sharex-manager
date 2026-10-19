/**
 * whisper.cpp : transcription de la parole sur le serveur, gratuite et hors
 * ligne (serveur seulement).
 *
 * Comme ffmpeg et yt-dlp, rien n'est dans l'image Docker. Au premier besoin :
 *
 * - l'archive d'une version épinglée de whisper.cpp (ggml-org) est
 *   téléchargée, vérifiée par l'empreinte SHA-256 que publie GitHub, puis
 *   seuls `whisper-cli` et ses bibliothèques en sont extraits dans
 *   `data/tools/whisper-cpp-<version>/` ;
 * - un modèle multilingue épinglé (`ggml-small-q5_1`, 190 Mo) est téléchargé
 *   depuis un commit fixé du dépôt Hugging Face de whisper.cpp, vérifié de la
 *   même façon, dans `data/tools/whisper-models/`.
 *
 * Choix du modèle (mesuré sur une prise française de 52 s, 4 fils) : `small`
 * quantifié en 5 bits transcrit 3,6 fois plus vite que le temps réel, avec
 * des débuts de mots à ±75 ms une fois corrigés ; `base` est 2,5 fois plus
 * rapide mais confond des mots et cale mal les reprises. Sous Linux, les
 * bibliothèques demandent `libstdc++6` et `libgomp1` (posées par le
 * Dockerfile).
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { gunzipSync, unzipSync } from "fflate";

/** Version de whisper.cpp : la construction `b5454` est celle de la v1.9.5 (6 octobre 2026). */
export const WHISPER_CPP_RELEASE = "b5454";
const RELEASE_BASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_CPP_RELEASE}`;

/** Empreintes publiées par GitHub pour les archives de la version épinglée. */
const BUILDS: Record<string, { asset: string; sha256: string; bytes: number; maxBytes: number; binary: string; format: "zip" | "tgz" }> = {
  "linux-x64": {
    asset: "whisper-bin-ubuntu-x64.tar.gz",
    sha256: "a72becf15d7917f990f6313867a52638b82b7f9ef237fb0c980dac56a135781c",
    bytes: 10_364_195,
    maxBytes: 24 * 1024 * 1024,
    binary: "whisper-cli",
    format: "tgz",
  },
  "win32-x64": {
    asset: "whisper-bin-x64.zip",
    sha256: "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
    bytes: 8_928_640,
    maxBytes: 24 * 1024 * 1024,
    binary: "whisper-cli.exe",
    format: "zip",
  },
};

/** Commit du dépôt Hugging Face `ggerganov/whisper.cpp` d'où vient le modèle : le fichier ne peut pas changer sous nos pieds. */
const MODEL_COMMIT = "5359861c739e955e79d9a303bcbc70fb988958b1";

export interface WhisperModelSpec {
  file: string;
  sha256: string;
  bytes: number;
  /** Préréglage d'alignement des instants (`-dtw`), propre à la taille du modèle. */
  dtw: string;
  label: string;
}

/** Modèle multilingue épinglé : `small`, quantifié en 5 bits. */
export const WHISPER_MODEL: WhisperModelSpec = {
  file: "ggml-small-q5_1.bin",
  sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
  bytes: 190_085_487,
  dtw: "small",
  label: "Whisper small (quantifié 5 bits)",
};

const TOOLS_ROOT = path.join(process.cwd(), "data", "tools");
const BINARY_DIR = path.join(TOOLS_ROOT, `whisper-cpp-${WHISPER_CPP_RELEASE}`);
const MODEL_DIR = path.join(TOOLS_ROOT, "whisper-models");
/** Délai d'un téléchargement : le modèle pèse 190 Mo. */
const DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000;

interface WhisperState {
  pending: Promise<WhisperCppPaths | null> | null;
  /** Dernière erreur de téléchargement, lisible, sans chemin du serveur. */
  lastError: string | null;
  /** Octets reçus du téléchargement en cours (modèle compris). */
  received: number;
}

const state = ((globalThis as any).__sxmWhisperCpp ??= { pending: null, lastError: null, received: 0 }) as WhisperState;

export interface WhisperCppPaths {
  binary: string;
  model: string;
}

function build() {
  return BUILDS[`${process.platform}-${process.arch}`] ?? null;
}

/** Le moteur local existe-t-il pour cette machine (Linux ou Windows, x64) ? */
export function whisperCppSupported(): boolean {
  return build() !== null;
}

function binaryPath(): string | null {
  const spec = build();
  if (!spec) return null;
  const file = path.join(BINARY_DIR, spec.binary);
  return fs.existsSync(file) ? file : null;
}

function modelPath(): string | null {
  const file = path.join(MODEL_DIR, WHISPER_MODEL.file);
  try {
    return fs.statSync(file).size === WHISPER_MODEL.bytes ? file : null;
  } catch {
    return null;
  }
}

/** Moteur et modèle déjà présents, sans rien télécharger ; `null` sinon. */
export function whisperCppPaths(): WhisperCppPaths | null {
  const binary = binaryPath();
  const model = modelPath();
  return binary && model ? { binary, model } : null;
}

export interface WhisperCppStatus {
  supported: boolean;
  /** Moteur et modèle présents : la transcription locale démarre sans attendre. */
  ready: boolean;
  downloading: boolean;
  /** Octets reçus du téléchargement en cours. */
  received: number;
  /** Octets à télécharger au premier usage (archive et modèle). */
  downloadBytes: number;
  release: string;
  model: string;
  lastError: string | null;
}

export function whisperCppStatus(): WhisperCppStatus {
  const spec = build();
  return {
    supported: spec !== null,
    ready: whisperCppPaths() !== null,
    downloading: state.pending !== null,
    received: state.received,
    downloadBytes: (binaryPath() ? 0 : (spec?.bytes ?? 0)) + (modelPath() ? 0 : WHISPER_MODEL.bytes),
    release: WHISPER_CPP_RELEASE,
    model: WHISPER_MODEL.label,
    lastError: state.lastError,
  };
}

// ─── Téléchargement ──────────────────────────────────────────────

/** Télécharge `url` en mémoire, borné à `maxBytes`, et vérifie son empreinte. */
async function fetchVerified(url: string, sha256: string, maxBytes: number): Promise<Buffer> {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "ShareX-Manager" }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    state.received += value.byteLength;
    if (total > maxBytes) throw new Error("archive whisper.cpp plus lourde que prévu");
    hash.update(value);
    chunks.push(Buffer.from(value));
  }
  if (hash.digest("hex") !== sha256) throw new Error("empreinte whisper.cpp inattendue, fichier écarté");
  return Buffer.concat(chunks);
}

/** Télécharge le modèle directement sur le disque (190 Mo : jamais tout en mémoire), puis le vérifie. */
async function downloadModel(): Promise<string> {
  const target = path.join(MODEL_DIR, WHISPER_MODEL.file);
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const temporary = `${target}.part-${process.pid}`;
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/${MODEL_COMMIT}/${WHISPER_MODEL.file}`;
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "ShareX-Manager" }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`modèle : HTTP ${response.status}`);
  const hash = createHash("sha256");
  const out = fs.openSync(temporary, "w");
  let total = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      state.received += value.byteLength;
      if (total > WHISPER_MODEL.bytes) throw new Error("modèle plus lourd que prévu");
      hash.update(value);
      fs.writeSync(out, value);
    }
  } catch (error) {
    fs.closeSync(out);
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  fs.closeSync(out);
  if (total !== WHISPER_MODEL.bytes || hash.digest("hex") !== WHISPER_MODEL.sha256) {
    fs.rmSync(temporary, { force: true });
    throw new Error("empreinte du modèle inattendue, fichier écarté");
  }
  fs.renameSync(temporary, target);
  return target;
}

/** Fichiers gardés d'une archive : le programme et ses bibliothèques, rien d'autre (ni tests, ni exemples). */
export function keptArchiveEntry(name: string, binary: string): boolean {
  const base = path.posix.basename(name.replace(/\\/g, "/"));
  if (base === binary) return true;
  if (/^(whisper|ggml[\w.-]*)\.dll$/i.test(base)) return true;
  return /^lib(whisper|ggml[\w-]*)\.so(\.\d+)*$/.test(base);
}

interface TarEntry {
  name: string;
  type: "file" | "link" | "other";
  data: Uint8Array;
  link: string;
}

/** Entrées d'une archive tar (ustar), lues sans outil externe. */
export function readTar(buffer: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  const text = (start: number, length: number) => {
    const bytes = buffer.subarray(start, start + length);
    const end = bytes.indexOf(0);
    return Buffer.from(end >= 0 ? bytes.subarray(0, end) : bytes).toString("utf8");
  };
  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= buffer.length) {
    if (buffer.subarray(offset, offset + 512).every((byte) => byte === 0)) break;
    const size = parseInt(text(offset + 124, 12).trim() || "0", 8);
    const flag = String.fromCharCode(buffer[offset + 156] || 48);
    const prefix = text(offset + 345, 155);
    const baseName = text(offset, 100);
    const name = longName ?? (prefix ? `${prefix}/${baseName}` : baseName);
    longName = null;
    const dataStart = offset + 512;
    const data = buffer.subarray(dataStart, dataStart + size);
    if (flag === "L") longName = Buffer.from(data).toString("utf8").replace(/\0+$/, "");
    else entries.push({ name, type: flag === "0" ? "file" : flag === "2" ? "link" : "other", data, link: text(offset + 157, 100) });
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

/**
 * Fichiers à écrire d'une archive de la version : nom de base → contenu. Un
 * lien symbolique (`libwhisper.so.1 → libwhisper.so.1.9.5`) devient une
 * copie du fichier visé : rien ne pointe hors du dossier.
 */
export function archiveFiles(archive: Uint8Array, format: "zip" | "tgz", binary: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  if (format === "zip") {
    const entries = unzipSync(archive, { filter: (file) => keptArchiveEntry(file.name, binary) && file.originalSize < 64 * 1024 * 1024 });
    for (const [name, data] of Object.entries(entries)) files.set(path.posix.basename(name), data);
    return files;
  }
  const entries = readTar(gunzipSync(archive));
  const byBase = new Map(entries.filter((entry) => entry.type === "file").map((entry) => [path.posix.basename(entry.name), entry.data]));
  for (const entry of entries) {
    const base = path.posix.basename(entry.name);
    if (!keptArchiveEntry(base, binary)) continue;
    if (entry.type === "file") files.set(base, entry.data);
    else if (entry.type === "link") {
      // Liens en chaîne (libggml.so → libggml.so.0 → libggml.so.0.26.0) : suivis dans l'archive seulement.
      let target = path.posix.basename(entry.link);
      for (let hop = 0; hop < 4 && !byBase.has(target); hop++) {
        const next = entries.find((candidate) => path.posix.basename(candidate.name) === target && candidate.type === "link");
        if (!next) break;
        target = path.posix.basename(next.link);
      }
      const data = byBase.get(target);
      if (data) files.set(base, data);
    }
  }
  return files;
}

async function downloadBinary(): Promise<string> {
  const spec = build();
  if (!spec) throw new Error("plateforme sans exécutable whisper.cpp épinglé");
  const archive = await fetchVerified(`${RELEASE_BASE}/${spec.asset}`, spec.sha256, spec.maxBytes);
  const files = archiveFiles(new Uint8Array(archive), spec.format, spec.binary);
  if (!files.has(spec.binary)) throw new Error("archive whisper.cpp sans whisper-cli");
  // Dossier neuf, rempli à côté puis renommé : jamais un moteur à moitié écrit.
  const staging = `${BINARY_DIR}.part-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  for (const [name, data] of files) fs.writeFileSync(path.join(staging, name), data, { mode: 0o755 });
  fs.rmSync(BINARY_DIR, { recursive: true, force: true });
  fs.renameSync(staging, BINARY_DIR);
  return path.join(BINARY_DIR, spec.binary);
}

/**
 * Moteur et modèle disponibles, téléchargés au besoin (un seul téléchargement
 * à la fois). `null` sur une plateforme sans exécutable, ou si le
 * téléchargement échoue (`whisperCppStatus().lastError` dit pourquoi).
 */
export async function ensureWhisperCpp(): Promise<WhisperCppPaths | null> {
  const ready = whisperCppPaths();
  if (ready) return ready;
  if (!build()) return null;
  if (!state.pending) {
    state.received = 0;
    state.pending = (async () => {
      const binary = binaryPath() ?? (await downloadBinary());
      const model = modelPath() ?? (await downloadModel());
      state.lastError = null;
      return { binary, model };
    })()
      .catch((error: unknown) => {
        state.lastError = error instanceof Error ? error.message.slice(0, 200) : "téléchargement impossible";
        console.error("[whisper.cpp] téléchargement impossible :", state.lastError);
        return null;
      })
      .finally(() => {
        state.pending = null;
      });
  }
  return state.pending;
}
