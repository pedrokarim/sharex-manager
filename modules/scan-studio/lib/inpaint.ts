/**
 * Reconstruction du fond sous un masque, sans IA et sans rien envoyer nulle
 * part : un calcul sur les pixels de la page, dans le navigateur.
 *
 * Quand le texte d'origine est posé sur le dessin, une trame ou un dégradé, un
 * aplat de couleur laisse une tache. Ici, la zone masquée est remplie en deux
 * temps :
 *
 *   1. diffusion : chaque pixel masqué prend la moyenne de ses voisins, jusqu'à
 *      ce que les couleurs du pourtour se rejoignent en douceur (résolue du
 *      plus grossier au plus fin, pour converger en peu de passes) ;
 *   2. grain : la texture fine du pourtour (trame, bruit du papier) est
 *      reportée à l'intérieur par symétrie autour du bord, pour que la zone ne
 *      paraisse pas lissée au milieu d'une trame.
 *
 * Ce que la méthode ne sait pas faire, et que l'interface dit : prolonger un
 * trait ou un motif du dessin à travers la zone. Un trait qui la traversait
 * s'arrête à son bord et s'y fond.
 *
 * Le calcul est borné : au-delà d'une certaine surface il n'est pas tenté, il
 * s'arrête de lui-même s'il dépasse son temps, et il s'annule. Dans tous ces
 * cas il rend un refus motivé, et l'atelier garde l'aplat de couleur.
 *
 * Le résultat ne dépend que des pixels reçus : le même masque sur la même page
 * rend toujours la même image. Ce fichier ne dépend ni du DOM ni de React.
 */

import type { Rect } from "./geometry";
import type { PixelData } from "./mask-color";

export const INPAINT_LIMITS = {
  /** Pixels à reconstruire : au-delà, le résultat serait un flou sans rapport avec le dessin. */
  maskedPixels: 400_000,
  /** Fenêtre de travail (la zone et son pourtour). */
  windowPixels: 1_600_000,
  /** Durée d'un calcul, en millisecondes. */
  timeBudgetMs: 4000,
  /** Pourtour lu autour du masque, en pixels : c'est lui qui donne les couleurs et le grain. */
  margin: 24,
} as const;

export type InpaintFailure = "empty" | "too-large" | "no-context" | "timeout" | "cancelled";

export type InpaintResult =
  | {
      ok: true;
      /** Pixels RVBA de la fenêtre : ceux du pourtour sont intacts, ceux du masque reconstruits. */
      data: Uint8ClampedArray;
      /** Le grain du pourtour a été reporté dans la zone. */
      grain: boolean;
      maskedPixels: number;
    }
  | { ok: false; reason: InpaintFailure; message: string };

export interface InpaintOptions {
  signal?: AbortSignal;
  timeBudgetMs?: number;
  /** Horloge et pause, remplaçables dans les tests. */
  now?: () => number;
  pause?: () => Promise<void>;
}

/** Fenêtre de travail autour d'un rectangle : le rectangle, son pourtour, le tout dans la page. */
export function inpaintWindow(bounds: Rect, page: { width: number; height: number }, margin: number = INPAINT_LIMITS.margin): Rect {
  const x = Math.max(0, Math.floor(bounds.x - margin));
  const y = Math.max(0, Math.floor(bounds.y - margin));
  const right = Math.min(page.width, Math.ceil(bounds.x + bounds.width + margin));
  const bottom = Math.min(page.height, Math.ceil(bounds.y + bounds.height + margin));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

const FAILURE_MESSAGES: Record<InpaintFailure, string> = {
  empty: "Le masque ne couvre aucun pixel de la page.",
  "too-large": "Zone trop grande pour reconstruire le fond : l’aplat de couleur est gardé.",
  "no-context": "Rien autour de la zone pour reconstruire le fond : l’aplat de couleur est gardé.",
  timeout: "La reconstruction du fond a pris trop de temps : l’aplat de couleur est gardé.",
  cancelled: "Reconstruction du fond annulée.",
};

const failure = (reason: InpaintFailure): InpaintResult => ({ ok: false, reason, message: FAILURE_MESSAGES[reason] });

/** Passes de lissage par niveau : alternées dans les deux sens, pour ne pas tirer les couleurs d'un côté. */
const SWEEPS = 20;
/** Sous cette amplitude moyenne, le pourtour est uni : reporter son grain n'apporterait que du bruit. */
const GRAIN_THRESHOLD = 1.5;
/** Un grain plus fort que cela est un trait du dessin, pas une texture : il est écrêté. */
const GRAIN_CLAMP = 64;

class Interrupted extends Error {
  constructor(readonly reason: "timeout" | "cancelled") {
    super(reason);
  }
}

interface Level {
  width: number;
  height: number;
  /** Trois plans : rouge, vert, bleu. */
  planes: [Float32Array, Float32Array, Float32Array];
  /** 1 : pixel à reconstruire. */
  hole: Uint8Array;
}

/** Niveau deux fois plus petit : un pixel y est connu dès qu'un de ses quatre enfants l'est. */
function downsample(level: Level): Level {
  const width = Math.ceil(level.width / 2);
  const height = Math.ceil(level.height / 2);
  const planes: Level["planes"] = [new Float32Array(width * height), new Float32Array(width * height), new Float32Array(width * height)];
  const hole = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let count = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let dy = 0; dy < 2; dy++) {
        const sy = y * 2 + dy;
        if (sy >= level.height) continue;
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          if (sx >= level.width) continue;
          const source = sy * level.width + sx;
          if (level.hole[source]) continue;
          count++;
          red += level.planes[0][source];
          green += level.planes[1][source];
          blue += level.planes[2][source];
        }
      }
      const target = y * width + x;
      if (count === 0) {
        hole[target] = 1;
      } else {
        planes[0][target] = red / count;
        planes[1][target] = green / count;
        planes[2][target] = blue / count;
      }
    }
  }
  return { width, height, planes, hole };
}

/** Lisse les pixels à reconstruire d'un niveau : chacun prend la moyenne de ses voisins. */
function relax(level: Level, holes: Int32Array, sweeps: number) {
  const { width, height } = level;
  for (const plane of level.planes) {
    for (let sweep = 0; sweep < sweeps; sweep++) {
      const forward = sweep % 2 === 0;
      for (let step = 0; step < holes.length; step++) {
        const index = holes[forward ? step : holes.length - 1 - step];
        const x = index % width;
        const y = (index - x) / width;
        let sum = 0;
        let count = 0;
        if (x > 0) {
          sum += plane[index - 1];
          count++;
        }
        if (x < width - 1) {
          sum += plane[index + 1];
          count++;
        }
        if (y > 0) {
          sum += plane[index - width];
          count++;
        }
        if (y < height - 1) {
          sum += plane[index + width];
          count++;
        }
        if (count > 0) plane[index] = sum / count;
      }
    }
  }
}

function holesOf(level: Level): Int32Array {
  let count = 0;
  for (let index = 0; index < level.hole.length; index++) count += level.hole[index];
  const holes = new Int32Array(count);
  let cursor = 0;
  for (let index = 0; index < level.hole.length; index++) if (level.hole[index]) holes[cursor++] = index;
  return holes;
}

/**
 * Remplit les pixels à reconstruire d'un niveau. Le niveau deux fois plus petit
 * est résolu d'abord et donne le point de départ ; quelques passes de lissage
 * suffisent ensuite, à chaque taille.
 */
async function solve(level: Level, checkpoint: () => Promise<void>): Promise<void> {
  const holes = holesOf(level);
  if (holes.length === 0) return;

  if (holes.length === level.hole.length) {
    // Plus rien de connu à cette taille : gris neutre, que les niveaux plus fins corrigeront.
    for (const plane of level.planes) plane.fill(128);
    return;
  }
  if (level.width > 2 && level.height > 2) {
    const coarse = downsample(level);
    await solve(coarse, checkpoint);
    for (let step = 0; step < holes.length; step++) {
      const index = holes[step];
      const x = index % level.width;
      const y = (index - x) / level.width;
      const source = (y >> 1) * coarse.width + (x >> 1);
      level.planes[0][index] = coarse.planes[0][source];
      level.planes[1][index] = coarse.planes[1][source];
      level.planes[2][index] = coarse.planes[2][source];
    }
  } else {
    // Niveau le plus grossier : la moyenne de ce qui est connu.
    for (const plane of level.planes) {
      let sum = 0;
      let count = 0;
      for (let index = 0; index < plane.length; index++) {
        if (!level.hole[index]) {
          sum += plane[index];
          count++;
        }
      }
      const mean = count > 0 ? sum / count : 128;
      for (let step = 0; step < holes.length; step++) plane[holes[step]] = mean;
    }
  }

  // Le lissage se fait par tranches, pour laisser la main au navigateur et pouvoir s'arrêter.
  const slice = holes.length > 60_000 ? 4 : SWEEPS;
  for (let done = 0; done < SWEEPS; done += slice) {
    await checkpoint();
    relax(level, holes, Math.min(slice, SWEEPS - done));
  }
}

/**
 * Pour chaque pixel à reconstruire, l'indice du pixel connu le plus proche
 * (parcours en largeur depuis le bord du masque) ; -1 ailleurs.
 */
function nearestKnown(hole: Uint8Array, width: number, height: number): Int32Array {
  const nearest = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < hole.length; index++) {
    if (!hole[index]) {
      nearest[index] = index;
      queue[tail++] = index;
    }
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index - x) / width;
    const origin = nearest[index];
    if (x > 0 && nearest[index - 1] < 0) {
      nearest[index - 1] = origin;
      queue[tail++] = index - 1;
    }
    if (x < width - 1 && nearest[index + 1] < 0) {
      nearest[index + 1] = origin;
      queue[tail++] = index + 1;
    }
    if (y > 0 && nearest[index - width] < 0) {
      nearest[index - width] = origin;
      queue[tail++] = index - width;
    }
    if (y < height - 1 && nearest[index + width] < 0) {
      nearest[index + width] = origin;
      queue[tail++] = index + width;
    }
  }
  return nearest;
}

/**
 * Grain du pourtour reporté dans la zone : pour chaque pixel reconstruit, on
 * lit, de l'autre côté du bord le plus proche, l'écart entre un pixel et la
 * moyenne de son voisinage. Rend `null` quand le pourtour est uni.
 */
function mirroredGrain(source: PixelData, hole: Uint8Array, holes: Int32Array): Float32Array | null {
  const { width, height, data } = source;
  const nearest = nearestKnown(hole, width, height);
  const grain = new Float32Array(holes.length * 3);
  let energy = 0;
  let sampled = 0;

  for (let step = 0; step < holes.length; step++) {
    const index = holes[step];
    const edge = nearest[index];
    if (edge < 0) continue;
    const x = index % width;
    const y = (index - x) / width;
    const edgeX = edge % width;
    const edgeY = (edge - edgeX) / width;
    const mirrorX = 2 * edgeX - x;
    const mirrorY = 2 * edgeY - y;
    if (mirrorX < 0 || mirrorY < 0 || mirrorX >= width || mirrorY >= height) continue;
    const mirror = mirrorY * width + mirrorX;
    if (hole[mirror]) continue;

    // Moyenne des pixels connus autour du pixel symétrique : l'écart à cette moyenne est le grain.
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let dy = -2; dy <= 2; dy++) {
      const sy = mirrorY + dy;
      if (sy < 0 || sy >= height) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const sx = mirrorX + dx;
        if (sx < 0 || sx >= width) continue;
        const neighbour = sy * width + sx;
        if (hole[neighbour]) continue;
        red += data[neighbour * 4];
        green += data[neighbour * 4 + 1];
        blue += data[neighbour * 4 + 2];
        count++;
      }
    }
    if (count === 0) continue;
    const clamp = (value: number) => Math.max(-GRAIN_CLAMP, Math.min(GRAIN_CLAMP, value));
    const dr = clamp(data[mirror * 4] - red / count);
    const dg = clamp(data[mirror * 4 + 1] - green / count);
    const db = clamp(data[mirror * 4 + 2] - blue / count);
    grain[step * 3] = dr;
    grain[step * 3 + 1] = dg;
    grain[step * 3 + 2] = db;
    energy += (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
    sampled++;
  }
  return sampled > 0 && energy / sampled >= GRAIN_THRESHOLD ? grain : null;
}

/**
 * Reconstruit les pixels masqués d'une fenêtre de la page.
 *
 * `pixels` est la fenêtre lue sur l'image d'origine ; `mask`, de la même
 * taille, vaut 1 pour chaque pixel à reconstruire. Un pixel transparent de
 * l'image est traité comme à reconstruire, lui aussi.
 */
export async function inpaint(pixels: PixelData, mask: Uint8Array, options: InpaintOptions = {}): Promise<InpaintResult> {
  const { width, height, data } = pixels;
  const size = width * height;
  if (size === 0 || mask.length !== size || data.length !== size * 4) return failure("empty");
  if (size > INPAINT_LIMITS.windowPixels) return failure("too-large");

  const now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const pause = options.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const budget = options.timeBudgetMs ?? INPAINT_LIMITS.timeBudgetMs;
  const startedAt = now();

  const hole = new Uint8Array(size);
  const planes: Level["planes"] = [new Float32Array(size), new Float32Array(size), new Float32Array(size)];
  let masked = 0;
  let unknown = 0;
  for (let index = 0; index < size; index++) {
    if (mask[index]) masked++;
    if (mask[index] || data[index * 4 + 3] < 8) {
      hole[index] = 1;
      unknown++;
    } else {
      planes[0][index] = data[index * 4];
      planes[1][index] = data[index * 4 + 1];
      planes[2][index] = data[index * 4 + 2];
    }
  }
  if (masked === 0) return failure("empty");
  if (masked > INPAINT_LIMITS.maskedPixels) return failure("too-large");
  if (unknown === size) return failure("no-context");

  const checkpoint = async () => {
    await pause();
    if (options.signal?.aborted) throw new Interrupted("cancelled");
    if (now() - startedAt > budget) throw new Interrupted("timeout");
  };

  const level: Level = { width, height, planes, hole };
  try {
    await checkpoint();
    await solve(level, checkpoint);
    await checkpoint();
  } catch (error) {
    if (error instanceof Interrupted) return failure(error.reason);
    throw error;
  }

  const holes = holesOf(level);
  const grain = mirroredGrain(pixels, hole, holes);
  const output = new Uint8ClampedArray(data);
  for (let step = 0; step < holes.length; step++) {
    const index = holes[step];
    output[index * 4] = planes[0][index] + (grain ? grain[step * 3] : 0);
    output[index * 4 + 1] = planes[1][index] + (grain ? grain[step * 3 + 1] : 0);
    output[index * 4 + 2] = planes[2][index] + (grain ? grain[step * 3 + 2] : 0);
    output[index * 4 + 3] = 255;
  }
  return { ok: true, data: output, grain: grain !== null, maskedPixels: masked };
}

/** Empreinte courte d'un texte (FNV-1a) : sert à savoir si un masque a changé depuis le dernier calcul. */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
