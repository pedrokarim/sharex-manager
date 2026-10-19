/**
 * Où est le visage dans une prise ? (serveur seulement)
 *
 * Méthode légère, sans modèle appris : quelques images de la prise, réduites
 * à 160 pixels de large par ffmpeg, puis les pixels de couleur de peau (règle
 * classique dans l'espace YCbCr) et la plus grande tache qu'ils forment. Le
 * visage est le haut de cette tache (le cou et les épaules sont dessous) ;
 * la médiane sur les images écarte un raté. Assez juste pour cadrer une
 * personne face caméra ; une prise sans peau visible, ou trop chargée en
 * couleurs chaudes, reste cadrée au centre (et se recadre à la main dans
 * l'éditeur : `transform` du plan).
 */

import { spawn } from "child_process";
import { childEnv } from "@/lib/child-env";

export interface FaceFocus {
  /** Centre du visage, en parts de l'image (0 à 1). */
  x: number;
  y: number;
}

/** Pixel de peau : règle YCbCr (Cb 77 à 127, Cr 133 à 173), ni trop sombre, rouge au-dessus du bleu. */
export function isSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 45 && y < 245 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > b && r >= g;
}

/** Masque de peau d'une image RVB (3 octets par pixel). */
export function skinMask(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) mask[i] = isSkin(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) ? 1 : 0;
  return mask;
}

export interface Blob {
  left: number;
  top: number;
  right: number;
  bottom: number;
  count: number;
  /** Pixels de la tache, pour situer son haut. */
  pixels: number[];
}

/** Plus grande tache de pixels voisins (quatre voisins), ou `null`. */
export function largestBlob(mask: Uint8Array, width: number, height: number): Blob | null {
  const seen = new Uint8Array(mask.length);
  let best: Blob | null = null;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const blob: Blob = { left: width, top: height, right: 0, bottom: 0, count: 0, pixels: [] };
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;
      blob.count++;
      blob.pixels.push(index);
      blob.left = Math.min(blob.left, x);
      blob.right = Math.max(blob.right, x);
      blob.top = Math.min(blob.top, y);
      blob.bottom = Math.max(blob.bottom, y);
      for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (next >= 0 && mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    if (!best || blob.count > best.count) best = blob;
  }
  return best;
}

/**
 * Visage d'une image : le haut de la plus grande tache de peau (au moins
 * 0,4 % de l'image). Centre horizontal : celui des pixels de peau de la
 * hauteur d'un visage en haut de la tache ; centre vertical : la moitié de
 * cette hauteur.
 */
export function faceInFrame(rgb: Uint8Array, width: number, height: number): FaceFocus | null {
  const blob = largestBlob(skinMask(rgb, width, height), width, height);
  if (!blob || blob.count < width * height * 0.004) return null;
  const blobWidth = blob.right - blob.left + 1;
  const faceHeight = Math.min(blob.bottom - blob.top + 1, Math.round(blobWidth * 1.3));
  let sum = 0;
  let count = 0;
  for (const index of blob.pixels) {
    const y = Math.floor(index / width);
    if (y >= blob.top + faceHeight) continue;
    sum += index % width;
    count++;
  }
  if (count === 0) return null;
  return { x: (sum / count + 0.5) / width, y: (blob.top + faceHeight / 2) / height };
}

/** Médiane des visages trouvés ; il en faut deux au moins. */
export function medianFocus(points: (FaceFocus | null)[]): FaceFocus | null {
  const found = points.filter((point): point is FaceFocus => point !== null);
  if (found.length < 2) return null;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  return { x: Math.round(median(found.map((point) => point.x)) * 1000) / 1000, y: Math.round(median(found.map((point) => point.y)) * 1000) / 1000 };
}

/** Une image de la vidéo à `seconds`, en RVB brut de `width` × `height`, lue sans shell. */
function grabFrame(ffmpeg: string, input: string, seconds: number, width: number, height: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const child = spawn(
      ffmpeg,
      ["-nostdin", "-hide_banner", "-loglevel", "error", "-ss", seconds.toFixed(2), "-i", input, "-frames:v", "1", "-vf", `scale=${width}:${height}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
      { env: childEnv(), windowsHide: true, shell: false, stdio: ["ignore", "pipe", "ignore"] }
    );
    const chunks: Buffer[] = [];
    let size = 0;
    const expected = width * height * 3;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= expected * 2) chunks.push(chunk);
    });
    const kill = () => child.kill("SIGKILL");
    const timer = setTimeout(kill, 30_000);
    signal?.addEventListener("abort", kill, { once: true });
    const finish = (value: Uint8Array | null) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", kill);
      resolve(value);
    };
    child.on("error", () => finish(null));
    child.on("close", () => {
      const buffer = Buffer.concat(chunks);
      finish(buffer.length >= expected ? new Uint8Array(buffer.subarray(0, expected)) : null);
    });
  });
}

/**
 * Visage d'une prise : cinq images réparties entre 10 % et 90 % de sa durée.
 * `null` si le visage n'est pas trouvé avec assez de constance.
 */
export async function detectFace(ffmpeg: string, input: string, source: { width?: number; height?: number; durationMs?: number }, signal?: AbortSignal): Promise<FaceFocus | null> {
  if (!source.width || !source.height || !source.durationMs) return null;
  const width = 160;
  const height = Math.max(2, Math.round((width * source.height) / source.width / 2) * 2);
  const seconds = source.durationMs / 1000;
  const points: (FaceFocus | null)[] = [];
  for (const ratio of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    if (signal?.aborted) return null;
    const rgb = await grabFrame(ffmpeg, input, seconds * ratio, width, height, signal);
    points.push(rgb ? faceInFrame(rgb, width, height) : null);
  }
  return medianFocus(points);
}
