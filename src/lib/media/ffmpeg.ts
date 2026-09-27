/**
 * ffmpeg pour les vidéos de la galerie : image de couverture et métadonnées.
 *
 * Le binaire n'est pas dans l'image Docker. Il est téléchargé une fois dans
 * `data/tools/` (volume persistant) depuis une version épinglée de
 * ffmpeg-static, vérifié par son empreinte SHA-256, puis décompressé. Tant
 * qu'il manque, les vidéos restent lisibles : seule la couverture attend.
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { gunzipSync } from "zlib";
import { childEnv } from "@/lib/child-env";

const RELEASE = "b6.1.1";
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}`;

/** Empreintes publiées par GitHub pour les archives .gz de la version épinglée. */
const BUILDS: Record<string, { asset: string; sha256: string; binary: string }> = {
  linux: {
    asset: "ffmpeg-linux-x64.gz",
    sha256: "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa",
    binary: "ffmpeg",
  },
  win32: {
    asset: "ffmpeg-win32-x64.gz",
    sha256: "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77",
    binary: "ffmpeg.exe",
  },
};

const TOOLS_DIR = path.join(process.cwd(), "data", "tools", `ffmpeg-${RELEASE}`);
const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;

const state = ((globalThis as any).__sxmFfmpeg ??= { pending: null as Promise<string | null> | null });

function build() {
  return BUILDS[process.platform] ?? null;
}

export function ffmpegPath(): string | null {
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
    if (total > MAX_ARCHIVE_BYTES) throw new Error("archive ffmpeg plus lourde que prévu");
    chunks.push(Buffer.from(value));
  }
  const archive = Buffer.concat(chunks);
  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== spec.sha256) throw new Error("empreinte ffmpeg inattendue, fichier écarté");

  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const target = path.join(TOOLS_DIR, spec.binary);
  const temporary = `${target}.part-${process.pid}`;
  fs.writeFileSync(temporary, gunzipSync(archive), { mode: 0o755 });
  fs.renameSync(temporary, target);
  return target;
}

/** ffmpeg disponible, téléchargé au besoin (un seul téléchargement à la fois). */
export async function ensureFfmpeg(): Promise<string | null> {
  const existing = ffmpegPath();
  if (existing) return existing;
  if (!state.pending) {
    state.pending = download()
      .catch((error: unknown) => {
        console.error("[ffmpeg] téléchargement impossible :", error);
        return null;
      })
      .finally(() => {
        state.pending = null;
      });
  }
  return state.pending;
}

/** Téléchargement au démarrage, jamais pendant `next build`. */
export function prefetchFfmpeg() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  void ensureFfmpeg();
}

function run(binary: string, args: string[], timeoutMs = 60_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["-nostdin", "-hide_banner", ...args], {
      env: childEnv(),
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-20_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
  });
}

export interface VideoInfo {
  durationMs?: number;
  width?: number;
  height?: number;
}

/** Durée et dimensions, lues dans la sortie de `ffmpeg -i` (pas besoin de ffprobe). */
export function parseVideoInfo(stderr: string): VideoInfo {
  const info: VideoInfo = {};
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (duration) {
    info.durationMs = Math.round(
      (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000
    );
  }
  const size = /Video:[^\n]*?,\s*(\d{2,5})x(\d{2,5})[\s,\[]/.exec(stderr);
  if (size) {
    info.width = Number(size[1]);
    info.height = Number(size[2]);
  }
  return info;
}

/**
 * Convertit un son quelconque (MP3, WAV…) en WAV PCM 16 bits mono : le format
 * que lisent la mesure de durée et l'alignement des sous-titres.
 */
export async function toPcmWav(input: string, output: string, sampleRate = 24_000): Promise<void> {
  const binary = await ensureFfmpeg();
  if (!binary) throw new Error("ffmpeg n'est pas disponible pour convertir le son.");
  const result = await run(binary, [
    "-threads", "2",
    "-i", input,
    "-ac", "1",
    "-ar", String(sampleRate),
    "-c:a", "pcm_s16le",
    "-y", output,
  ]);
  if (result.code !== 0 || !fs.existsSync(output)) {
    throw new Error(`Conversion du son impossible. ${result.stderr.split("\n").filter(Boolean).slice(-1).join("")}`.trim());
  }
}

/**
 * Image de couverture (JPEG, 640 px de large au plus) et métadonnées d'une
 * vidéo. Prend l'image à 1 s, ou la première si la vidéo est plus courte.
 */
export async function videoCover(input: string, output: string): Promise<VideoInfo | null> {
  const binary = await ensureFfmpeg();
  if (!binary) return null;
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const grab = (seek: string) =>
    run(binary, [
      "-threads", "2",
      "-ss", seek,
      "-i", input,
      "-frames:v", "1",
      "-vf", "scale='min(640,iw)':-2",
      "-q:v", "4",
      "-y", output,
    ]);

  let result = await grab("1");
  if (result.code !== 0 || !fs.existsSync(output) || fs.statSync(output).size === 0) {
    result = await grab("0");
  }
  if (result.code !== 0 || !fs.existsSync(output)) return null;
  return parseVideoInfo(result.stderr);
}
