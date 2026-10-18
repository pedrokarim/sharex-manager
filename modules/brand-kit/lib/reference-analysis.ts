/**
 * Analyse d'une vidéo de référence (dossier 07 sexies, D4) : les calculs.
 *
 * Le serveur décode la vidéo avec ffmpeg (`server/reference-video.ts`) en
 * images grises réduites et en son mono ; tout le reste se fait ici, par des
 * méthodes classiques de traitement du signal, sans modèle appris :
 *
 * - **coupes** : corrélation entre deux images successives ; une coupe est une
 *   chute nette et isolée de cette corrélation ;
 * - **mouvements** : pour chaque plan, recalage de sa dernière image sur sa
 *   première (zoom autour du centre et décalage), par recherche exhaustive
 *   grossière puis fine ;
 * - **sous-titres** : lignes de l'image très chargées en contours forts (texte
 *   contrasté, contour épais), regroupées en bandes, puis la bande qui revient
 *   le plus souvent à la même hauteur ;
 * - **bruitages** : séparation harmonique / percussive du spectrogramme par
 *   filtres médians (la voix est surtout harmonique, un bruitage surtout
 *   percussif), puis attaques franches de la partie percussive.
 *
 * Tout est pur et testable sur des images ou des sons fabriqués.
 */

import type { MeasuredBeats, MeasuredCaptions, MeasuredMotion, MeasuredPart, MeasuredShots, MeasuredStyle } from "@/modules/clip-studio/engine/measured-style";

/** Image en niveaux de gris, une ligne après l'autre. */
export interface GrayFrame {
  width: number;
  height: number;
  data: Uint8Array;
}

// ─── Outils ──────────────────────────────────────────────────────

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export const median = (values: readonly number[]) => quantile(values, 0.5);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Réduit une image d'un facteur entier, par moyenne des blocs. */
export function downscale(frame: GrayFrame, factor: number): GrayFrame {
  const width = Math.floor(frame.width / factor);
  const height = Math.floor(frame.height / factor);
  const data = new Uint8Array(width * height);
  const area = factor * factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * frame.width + x * factor;
        for (let dx = 0; dx < factor; dx++) sum += frame.data[row + dx];
      }
      data[y * width + x] = Math.round(sum / area);
    }
  }
  return { width, height, data };
}

/** Lignes à ignorer (la bande des sous-titres), en fractions de la hauteur. */
export interface RowMask {
  top: number;
  bottom: number;
}

const rowIgnored = (y: number, height: number, mask: RowMask | null | undefined) => Boolean(mask) && y >= mask!.top * height && y <= mask!.bottom * height;

// ─── Coupes ──────────────────────────────────────────────────────

/**
 * Écart entre deux images : 1 − corrélation (centrée, normalisée). 0 pour
 * deux images identiques ou qui ne diffèrent que par la luminosité ; près de
 * 1 pour deux images sans rapport. Un mouvement de caméra lent donne quelques
 * centièmes d'une image à la suivante.
 */
export function frameDistance(a: GrayFrame, b: GrayFrame, mask?: RowMask | null): number {
  let n = 0;
  let sa = 0;
  let sb = 0;
  for (let y = 0; y < a.height; y++) {
    if (rowIgnored(y, a.height, mask)) continue;
    for (let x = 0; x < a.width; x++) {
      const i = y * a.width + x;
      sa += a.data[i];
      sb += b.data[i];
      n++;
    }
  }
  if (n === 0) return 0;
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let y = 0; y < a.height; y++) {
    if (rowIgnored(y, a.height, mask)) continue;
    for (let x = 0; x < a.width; x++) {
      const i = y * a.width + x;
      const da = a.data[i] - ma;
      const db = b.data[i] - mb;
      cov += da * db;
      va += da * da;
      vb += db * db;
    }
  }
  // Deux aplats unis : identiques s'ils ont la même teinte, sinon une coupe franche.
  if (va < n * 4 || vb < n * 4) return Math.min(1, Math.abs(ma - mb) / 40);
  return clamp(1 - cov / Math.sqrt(va * vb), 0, 1);
}

/** Réglages de la détection des coupes. */
export const CUT_DETECTION = {
  /**
   * Écart minimal d'une coupe : faible, car recadrer une image douce (brume,
   * ciel) change peu sa corrélation ; c'est l'écart isolé qui fait la coupe.
   */
  minScore: 0.05,
  /** Écart d'une coupe rapporté à l'écart habituel autour d'elle (plus 0,03). */
  minRatio: 4,
  /** Deux coupes ne sont jamais plus proches (en secondes) : un fondu ne compte qu'une fois. */
  minGapSeconds: 0.25,
  /** Images de part et d'autre pour l'écart habituel. */
  window: 6,
};

/**
 * Coupes d'après les écarts entre images successives (`scores[i]` : entre
 * l'image i − 1 et l'image i). Rend les rangs i des images qui ouvrent un
 * nouveau plan.
 */
export function detectCuts(scores: readonly number[], fps: number): number[] {
  const { minScore, minRatio, minGapSeconds, window } = CUT_DETECTION;
  const candidates: { index: number; score: number }[] = [];
  for (let i = 1; i < scores.length; i++) {
    const score = scores[i];
    if (score < minScore) continue;
    const around: number[] = [];
    for (let j = Math.max(1, i - window); j <= Math.min(scores.length - 1, i + window); j++) if (Math.abs(j - i) > 1) around.push(scores[j]);
    const usual = around.length ? median(around) : 0;
    if (score < minRatio * usual + 0.03) continue;
    let peak = true;
    for (let j = Math.max(1, i - 2); j <= Math.min(scores.length - 1, i + 2); j++) if (j !== i && scores[j] > score) peak = false;
    if (peak) candidates.push({ index: i, score });
  }
  const gap = Math.max(1, Math.round(minGapSeconds * fps));
  const kept: { index: number; score: number }[] = [];
  for (const candidate of candidates) {
    const last = kept[kept.length - 1];
    if (last && candidate.index - last.index < gap) {
      if (candidate.score > last.score) kept[kept.length - 1] = candidate;
    } else kept.push(candidate);
  }
  return kept.map((entry) => entry.index);
}

/** Écart type des niveaux de gris d'une image : presque nul pour un aplat (noir d'un fondu). */
function spread(frame: GrayFrame): number {
  let sum = 0;
  let squares = 0;
  for (const value of frame.data) {
    sum += value;
    squares += value * value;
  }
  const mean = sum / frame.data.length;
  return Math.sqrt(Math.max(0, squares / frame.data.length - mean * mean));
}

/**
 * Un passage au noir (ou à un aplat) de moins d'une demi-seconde entre deux
 * plans est une transition, pas un plan : il rejoint le plan d'avant, et une
 * seule coupe reste.
 */
export function mergeFlatShots(cuts: readonly number[], frames: readonly GrayFrame[], fps = ANALYSIS_FPS): number[] {
  const kept: number[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const start = cuts[i];
    const end = i + 1 < cuts.length ? cuts[i + 1] : frames.length;
    let flat = false;
    for (let k = start; k < Math.min(end, frames.length); k++) if (spread(frames[k]) < 10) flat = true;
    if (end - start < 0.5 * fps && flat) continue;
    kept.push(start);
  }
  return kept;
}

/** Bornes des plans, en secondes, d'après les coupes (rangs d'images à `fps`). */
export function shotBounds(cuts: readonly number[], fps: number, durationSeconds: number): { start: number; end: number }[] {
  const times = [0, ...cuts.map((index) => index / fps).filter((time) => time > 0 && time < durationSeconds), durationSeconds];
  const shots: { start: number; end: number }[] = [];
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > 1e-6) shots.push({ start: times[i - 1], end: times[i] });
  return shots;
}

/** Durées des plans : médiane, quartiles, plus long, histogramme par 0,5 s. */
export function summarizeShots(durations: readonly number[]): MeasuredShots | undefined {
  if (durations.length < 2) return undefined;
  const histogram = new Array(9).fill(0);
  for (const duration of durations) histogram[Math.min(8, Math.floor(duration / 0.5))]++;
  // Assez de plans pour qu'une médiane ait un sens ; une seule coupe ne fait pas un rythme.
  const confidence = clamp((durations.length - 1) / 7, 0, 1) * 0.95;
  return {
    count: durations.length,
    median: round(median(durations), 2),
    q1: round(quantile(durations, 0.25), 2),
    q3: round(quantile(durations, 0.75), 2),
    longest: round(Math.max(...durations), 2),
    histogram,
    confidence: round(confidence, 2),
  };
}

// ─── Mouvements ──────────────────────────────────────────────────

function sample(frame: GrayFrame, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * frame.width + x0;
  const d = frame.data;
  const top = d[i] + (d[i + 1] - d[i]) * fx;
  const bottom = d[i + frame.width] + (d[i + frame.width + 1] - d[i + frame.width]) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Écart moyen (niveaux de gris) entre `b` et `a` agrandie de `zoom` autour du
 * centre puis décalée de (`shiftX`, `shiftY`) en fractions du cadre : ce que
 * montre `b` si la caméra a zoomé et glissé depuis `a`. `Infinity` si trop
 * peu de pixels se recouvrent.
 */
export function warpError(a: GrayFrame, b: GrayFrame, zoom: number, shiftX: number, shiftY: number, mask?: RowMask | null, step = 1): number {
  const cx = (a.width - 1) / 2;
  const cy = (a.height - 1) / 2;
  const ox = shiftX * a.width;
  const oy = shiftY * a.height;
  let sum = 0;
  let n = 0;
  let total = 0;
  for (let y = 0; y < b.height; y += step) {
    if (rowIgnored(y, b.height, mask)) continue;
    const ya = cy + (y - cy) / zoom - oy;
    for (let x = 0; x < b.width; x += step) {
      total++;
      const xa = cx + (x - cx) / zoom - ox;
      if (xa < 0 || ya < 0 || xa >= a.width - 1 || ya >= a.height - 1) continue;
      sum += Math.abs(b.data[y * b.width + x] - sample(a, xa, ya));
      n++;
    }
  }
  return n >= total * 0.5 && n > 0 ? sum / n : Number.POSITIVE_INFINITY;
}

export interface ShotMotion {
  zoom: number;
  shiftX: number;
  shiftY: number;
  /** Écart sans mouvement, puis avec le meilleur mouvement trouvé. */
  still: number;
  error: number;
  /** Le recalage explique ce qui change dans le plan (ou rien ne change) : la mesure est fiable. */
  conclusive: boolean;
}

/** Réglages de l'estimation des mouvements. */
export const MOTION_DETECTION = {
  /** Écart (niveaux de gris) sous lequel un plan ne change pas du tout. */
  stillError: 3,
  /** Le meilleur recalage doit réduire l'écart au moins à cette part de l'écart sans mouvement. */
  maxResidual: 0.6,
  /** Zoom à partir duquel un plan zoome (3 %). */
  minZoom: 1.03,
  /** Décalage à partir duquel un plan glisse (2 % du cadre). */
  minShift: 0.02,
};

function geometric(from: number, to: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => from * (to / from) ** (index / (count - 1)));
}

function linear(from: number, to: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => from + ((to - from) * index) / (count - 1));
}

/**
 * Mouvement d'un plan : la dernière image `b` recalée sur la première `a`
 * (zoom de ×0,77 à ×1,3, décalage jusqu'à 12 % du cadre). Recherche
 * grossière sur les images réduites de moitié, puis fine autour du meilleur.
 */
export function estimateShotMotion(a: GrayFrame, b: GrayFrame, mask?: RowMask | null): ShotMotion {
  const still = warpError(a, b, 1, 0, 0, mask);
  if (still <= MOTION_DETECTION.stillError) return { zoom: 1, shiftX: 0, shiftY: 0, still, error: still, conclusive: true };
  const smallA = downscale(a, 2);
  const smallB = downscale(b, 2);
  let best = { zoom: 1, shiftX: 0, shiftY: 0, error: warpError(smallA, smallB, 1, 0, 0, mask) };
  for (const zoom of geometric(0.77, 1.3, 37)) {
    for (const shiftX of linear(-0.12, 0.12, 9)) {
      for (const shiftY of linear(-0.12, 0.12, 9)) {
        const error = warpError(smallA, smallB, zoom, shiftX, shiftY, mask);
        if (error < best.error) best = { zoom, shiftX, shiftY, error };
      }
    }
  }
  let fine = { ...best, error: warpError(a, b, best.zoom, best.shiftX, best.shiftY, mask) };
  const center = { ...best };
  for (const zoom of geometric(center.zoom / 1.02, center.zoom * 1.02, 9)) {
    for (const shiftX of linear(center.shiftX - 0.03, center.shiftX + 0.03, 9)) {
      for (const shiftY of linear(center.shiftY - 0.03, center.shiftY + 0.03, 9)) {
        const error = warpError(a, b, zoom, shiftX, shiftY, mask);
        if (error < fine.error) fine = { zoom, shiftX, shiftY, error };
      }
    }
  }
  const conclusive = fine.error <= still * MOTION_DETECTION.maxResidual;
  return { zoom: fine.zoom, shiftX: fine.shiftX, shiftY: fine.shiftY, still, error: fine.error, conclusive };
}

/** Part des plans animés, zooms et panoramiques, d'après les plans dont le mouvement est fiable. */
export function summarizeMotion(motions: readonly ShotMotion[]): MeasuredMotion | undefined {
  const reliable = motions.filter((motion) => motion.conclusive);
  if (reliable.length < 3) return undefined;
  const zoomOf = (motion: ShotMotion) => Math.exp(Math.abs(Math.log(motion.zoom)));
  const zooms = reliable.filter((motion) => zoomOf(motion) >= MOTION_DETECTION.minZoom);
  const pans = reliable.filter((motion) => zoomOf(motion) < MOTION_DETECTION.minZoom && Math.hypot(motion.shiftX, motion.shiftY) >= MOTION_DETECTION.minShift);
  const share = (count: number) => round(count / reliable.length, 2);
  const confidence = (reliable.length / motions.length) * clamp(reliable.length / 6, 0, 1);
  return {
    measuredShots: reliable.length,
    animatedShare: share(zooms.length + pans.length),
    zoomShare: share(zooms.length),
    panShare: share(pans.length),
    ...(zooms.length ? { typicalZoom: round(median(zooms.map(zoomOf)), 3) } : {}),
    confidence: round(confidence, 2),
  };
}

// ─── Sous-titres ─────────────────────────────────────────────────

/** Une bande de texte trouvée sur une image, en fractions du cadre. */
export interface TextBand {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Groupes de lettres séparés par une espace : les mots. */
  words: number;
}

/** Réglages de la détection du texte incrusté. */
export const TEXT_DETECTION = {
  /** Contraste (niveaux de gris) d'un contour fort entre deux pixels voisins. */
  edge: 90,
  /** Part de la largeur couverte de contours forts pour qu'une ligne compte comme texte. */
  coreDensity: 0.1,
  /** Hauteur d'une bande de texte : de 1,5 % à 14 % de la hauteur. */
  minHeight: 0.015,
  maxHeight: 0.14,
  /** Largeur minimale du texte d'une bande. */
  minWidth: 0.12,
  /** Espace entre deux mots, rapportée à la hauteur de la bande (le contour épais mange une partie de l'espace). */
  wordGap: 0.07,
};

/** Contours forts : écart avec le voisin de droite ou du dessous. */
function edgeMap(frame: GrayFrame): Uint8Array {
  const { width, height, data } = frame;
  const edges = new Uint8Array(width * height);
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      const value = data[i];
      if (Math.abs(value - data[i + 1]) >= TEXT_DETECTION.edge || Math.abs(value - data[i + width]) >= TEXT_DETECTION.edge) edges[i] = 1;
    }
  }
  return edges;
}

/**
 * Bandes de texte d'une image : lignes très chargées en contours forts, assez
 * larges, de hauteur plausible. Les seuils valent pour une image de 216 px de
 * large ; `detail`, la même image deux fois plus grande, sert à séparer les
 * mots (l'espace entre deux mots y fait quelques pixels).
 */
export function textBands(frame: GrayFrame, detail?: GrayFrame): TextBand[] {
  const { width, height } = frame;
  const edges = edgeMap(frame);
  const fine = detail ? edgeMap(detail) : edges;
  const scale = detail ? detail.width / width : 1;
  const fineWidth = detail ? detail.width : width;
  const x0 = Math.round(width * 0.03);
  const x1 = Math.round(width * 0.97);
  const span = x1 - x0;
  const density = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = x0; x < x1; x++) count += edges[y * width + x];
    density[y] = count / span;
  }
  const bands: TextBand[] = [];
  let y = 0;
  while (y < height) {
    if (density[y] < TEXT_DETECTION.coreDensity) {
      y++;
      continue;
    }
    // Cœur de la bande : lignes denses, un trou d'une ligne toléré.
    let end = y;
    while (end + 1 < height && (density[end + 1] >= TEXT_DETECTION.coreDensity || (end + 2 < height && density[end + 2] >= TEXT_DETECTION.coreDensity))) end++;
    let core = 0;
    for (let k = y; k <= end; k++) core += density[k];
    core /= end - y + 1;
    // Bords : les lignes encore nettement chargées (haut et bas des lettres, contour).
    const edgeLevel = Math.max(0.04, core * 0.35);
    let top = y;
    let bottom = end;
    while (top > 0 && density[top - 1] >= edgeLevel) top--;
    while (bottom + 1 < height && density[bottom + 1] >= edgeLevel) bottom++;
    y = bottom + 1;
    const bandHeight = bottom - top + 1;
    if (bandHeight < TEXT_DETECTION.minHeight * height || bandHeight > TEXT_DETECTION.maxHeight * height) continue;
    // Colonnes occupées (image détaillée) : un contour au moins dans la bande. Une lettre l'est sur toute
    // sa largeur (bords de ses traits), l'espace entre deux mots ne l'est pas : on n'y voit que le fond.
    const fineTop = Math.floor(top * scale);
    const fineBottom = Math.min(Math.round(height * scale) - 1, Math.ceil((bottom + 1) * scale) - 1);
    const fineHeight = fineBottom - fineTop + 1;
    const fx0 = Math.round(x0 * scale);
    const fx1 = Math.round(x1 * scale);
    const occupied = new Uint8Array(fineWidth);
    const strength = new Uint16Array(fineWidth);
    for (let x = fx0; x < fx1; x++) {
      let count = 0;
      for (let k = fineTop; k <= fineBottom; k++) count += fine[k * fineWidth + x];
      strength[x] = count;
      if (count >= 1) occupied[x] = 1;
    }
    const gap = Math.max(2, Math.round(fineHeight * TEXT_DETECTION.wordGap));
    const groups: [number, number][] = [];
    let runStart = -1;
    let lastOccupied = -Infinity;
    for (let x = fx0; x < fx1; x++) {
      if (!occupied[x]) continue;
      if (runStart < 0) runStart = x;
      else if (x - lastOccupied > gap) {
        groups.push([runStart, lastOccupied]);
        runStart = x;
      }
      lastOccupied = x;
    }
    if (runStart >= 0) groups.push([runStart, lastOccupied]);
    // Un mot a au moins la largeur d'une demi-lettre.
    const words = groups.filter(([from, to]) => to - from + 1 >= fineHeight * 0.4);
    // Aux bords, un groupe bien moins chargé en contours que le texte est le fond (feuillage, reflets) : écarté.
    const groupDensity = ([from, to]: [number, number]) => {
      let sum = 0;
      for (let x = from; x <= to; x++) sum += strength[x];
      return sum / (to - from + 1);
    };
    const strongest = Math.max(0, ...words.map(groupDensity));
    while (words.length > 1 && groupDensity(words[0]) < strongest * 0.45) words.shift();
    while (words.length > 1 && groupDensity(words[words.length - 1]) < strongest * 0.45) words.pop();
    if (words.length === 0) continue;
    const left = words[0][0];
    const right = words[words.length - 1][1];
    if (right - left + 1 < TEXT_DETECTION.minWidth * fineWidth) continue;
    // Le texte occupe vraiment sa bande : pas une texture clairsemée.
    let filled = 0;
    for (let x = left; x <= right; x++) filled += occupied[x];
    if (filled / (right - left + 1) < 0.45) continue;
    bands.push({ top: top / height, bottom: (bottom + 1) / height, left: left / fineWidth, right: (right + 1) / fineWidth, words: words.length });
  }
  return bands;
}

type PlacedBand = TextBand & { frame: number; center: number; height: number };

/** Bandes d'une même hauteur, une par image (la plus proche du centre). */
function clusterAt(all: readonly PlacedBand[], center: number): PlacedBand[] {
  const near = all.filter((band) => Math.abs(band.center - center) <= 0.04);
  const typicalHeight = median(near.map((band) => band.height));
  const members = all.filter((band) => Math.abs(band.center - center) <= Math.max(0.04, typicalHeight * 0.6));
  const byFrame = new Map<number, PlacedBand>();
  for (const band of members) {
    const known = byFrame.get(band.frame);
    if (!known || Math.abs(band.center - center) < Math.abs(known.center - center)) byFrame.set(band.frame, band);
  }
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

/**
 * Part des images où le texte d'une bande change par rapport à l'image
 * analysée précédente (autre largeur, autre nombre de mots) : des
 * sous-titres changent sans cesse, un titre ou une interface reste fixe.
 */
export function changeRate(cluster: readonly PlacedBand[]): number {
  let pairs = 0;
  let changes = 0;
  for (let i = 1; i < cluster.length; i++) {
    if (cluster[i].frame - cluster[i - 1].frame !== 1) continue;
    pairs++;
    const a = cluster[i - 1];
    const b = cluster[i];
    if (a.words !== b.words || Math.abs(a.right - a.left - (b.right - b.left)) > 0.03) changes++;
  }
  return pairs ? changes / pairs : 0;
}

/**
 * Sous-titres d'après les bandes de texte de chaque image analysée : parmi
 * les hauteurs où une bande revient souvent, celle dont le texte change le
 * plus (un titre fixe ou le texte d'une interface ne sont pas des
 * sous-titres). Rien si moins d'une image sur six en montre.
 */
export function summarizeCaptions(frames: readonly TextBand[][]): MeasuredCaptions | undefined {
  if (frames.length === 0) return undefined;
  const all: PlacedBand[] = frames.flatMap((bands, frame) => bands.map((band) => ({ ...band, frame, center: (band.top + band.bottom) / 2, height: band.bottom - band.top })));
  if (all.length === 0) return undefined;
  // Hauteurs fréquentes : fenêtre glissante de ±4 % sur les centres, comptée en images distinctes ;
  // jusqu'à trois, chacune loin des précédentes.
  const candidates: { center: number; cluster: PlacedBand[]; score: number }[] = [];
  for (let round = 0; round < 3; round++) {
    let bestCenter = -1;
    let bestFrames = 0;
    for (let center = 0.02; center <= 0.98; center += 0.01) {
      if (candidates.some((entry) => Math.abs(entry.center - center) < 0.08)) continue;
      const hits = new Set(all.filter((band) => Math.abs(band.center - center) <= 0.04).map((band) => band.frame));
      if (hits.size > bestFrames) {
        bestFrames = hits.size;
        bestCenter = center;
      }
    }
    if (bestCenter < 0 || bestFrames < 4) break;
    const cluster = clusterAt(all, bestCenter);
    candidates.push({ center: bestCenter, cluster, score: (cluster.length / frames.length) * (0.15 + changeRate(cluster)) });
  }
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best) return undefined;
  const chosen = best.cluster;
  const presence = chosen.length / frames.length;
  if (presence < 1 / 6 || chosen.length < 4) return undefined;
  // Une ligne : les bandes les plus basses (deux lignes empilées font une bande deux fois plus haute).
  const heights = chosen.map((band) => band.height);
  const low = quantile(heights, 0.25);
  const single = chosen.filter((band) => band.height <= low * 1.6);
  const lineHeights = single.map((band) => band.height);
  const lineHeight = median(lineHeights);
  const spread = (quantile(lineHeights, 0.75) - quantile(lineHeights, 0.25)) / lineHeight;
  const confidence = clamp(presence / 0.4, 0, 1) * clamp(chosen.length / 8, 0, 1) * clamp(1 - spread, 0.3, 1);
  const center = median(chosen.map((band) => band.center));
  // Mots à l'écran : le compte le plus fréquent, s'il revient sur assez d'images (un fond chargé
  // se mêle parfois au texte et fausse le compte d'une image).
  const tally = new Map<number, number>();
  for (const band of single) tally.set(band.words, (tally.get(band.words) ?? 0) + 1);
  const [typicalWords, votes] = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [Number.NaN, 0];
  const words = votes / Math.max(1, single.length) >= 0.25 ? typicalWords : Number.NaN;
  return {
    presence: round(presence, 2),
    center: round(center),
    top: round(Math.min(center, quantile(chosen.map((band) => band.top), 0.25))),
    bottom: round(Math.max(center, quantile(chosen.map((band) => band.bottom), 0.75))),
    lineHeight: round(lineHeight, 4),
    lineHeightRange: [round(quantile(lineHeights, 0.25), 4), round(quantile(lineHeights, 0.75), 4)],
    ...(Number.isFinite(words) ? { words: round(words, 1) } : {}),
    confidence: round(confidence, 2),
  };
}

// ─── Bruitages ───────────────────────────────────────────────────

/** FFT complexe en place, taille puissance de 2. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

/** Médiane d'une petite fenêtre, sans allocation. */
function windowMedian(buffer: Float64Array, count: number): number {
  for (let i = 1; i < count; i++) {
    const value = buffer[i];
    let j = i - 1;
    while (j >= 0 && buffer[j] > value) {
      buffer[j + 1] = buffer[j];
      j--;
    }
    buffer[j + 1] = value;
  }
  return buffer[count >> 1];
}

/** Réglages de la détection des bruitages. */
export const BEAT_DETECTION = {
  frame: 512,
  /** Pas d'analyse, en secondes. */
  hop: 0.01,
  /** Fenêtres des filtres médians (impaires) : en temps pour l'harmonique, en fréquence pour le percussif. */
  harmonicSpan: 17,
  percussiveSpan: 17,
  /** Montée minimale de l'énergie percussive, en dB, sur les 250 ms précédentes. */
  minRise: 12,
  /**
   * Un coup dépasse de tant de dB la partie percussive habituelle de la voix
   * (neuvième décile), et de 1 dB ses consonnes les plus fortes (99ᵉ centile).
   */
  aboveVoicePercussive: 6,
  /** Un son tenu (cloche, note) qui surgit dépasse de tant de dB la voix, et monte d'autant. */
  aboveVoiceHarmonic: 4,
  tonalRise: 6,
  /** Sans voix : au-dessus du niveau percussif habituel. */
  minAboveFloor: 15,
  /** Deux attaques ne sont jamais plus proches (en secondes). */
  refractory: 0.3,
};

export interface BeatAnalysis {
  /** Instants des attaques retenues, en secondes. */
  times: number[];
  /** Part du temps où une voix (son harmonique soutenu) se fait entendre, de 0 à 1. */
  voiceShare: number;
}

/** Niveaux (dB) des parties percussive et harmonique du son, une valeur par pas d'analyse. */
export interface SoundProfile {
  percussive: Float64Array;
  harmonic: Float64Array;
}

/**
 * Sépare le son en partie harmonique et partie percussive par filtres
 * médians sur le spectrogramme (Fitzgerald, 2010) : une raie tenue dans le
 * temps est harmonique, un coup étalé sur toutes les fréquences percussif.
 */
export function soundProfile(samples: Float32Array, rate: number): SoundProfile {
  const { frame, harmonicSpan, percussiveSpan } = BEAT_DETECTION;
  const hop = Math.max(1, Math.round(BEAT_DETECTION.hop * rate));
  const frames = samples.length >= frame ? Math.floor((samples.length - frame) / hop) + 1 : 0;
  if (frames === 0) return { percussive: new Float64Array(0), harmonic: new Float64Array(0) };
  const bins = frame / 4; // jusqu'à la moitié de Nyquist, par paires de raies : assez pour la voix et les bruitages
  const magnitude = new Float32Array(frames * bins);
  const window = new Float64Array(frame).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1)));
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  for (let t = 0; t < frames; t++) {
    const offset = t * hop;
    for (let i = 0; i < frame; i++) {
      re[i] = samples[offset + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) {
      const a = Math.hypot(re[2 * k], im[2 * k]);
      const b = Math.hypot(re[2 * k + 1], im[2 * k + 1]);
      magnitude[t * bins + k] = a + b;
    }
  }
  // Séparation harmonique / percussive par filtres médians (Fitzgerald, 2010).
  const buffer = new Float64Array(Math.max(harmonicSpan, percussiveSpan));
  const halfH = harmonicSpan >> 1;
  const halfP = percussiveSpan >> 1;
  const percussive = new Float64Array(frames);
  const harmonic = new Float64Array(frames);
  for (let t = 0; t < frames; t++) {
    let ep = 0;
    let eh = 0;
    for (let k = 1; k < bins; k++) {
      let count = 0;
      for (let u = Math.max(0, t - halfH); u <= Math.min(frames - 1, t + halfH); u++) buffer[count++] = magnitude[u * bins + k];
      const h = windowMedian(buffer, count);
      count = 0;
      for (let v = Math.max(1, k - halfP); v <= Math.min(bins - 1, k + halfP); v++) buffer[count++] = magnitude[t * bins + v];
      const p = windowMedian(buffer, count);
      const x = magnitude[t * bins + k];
      const mask = (p * p) / (p * p + h * h + 1e-12);
      ep += (mask * x) ** 2;
      eh += ((1 - mask) * x) ** 2;
    }
    percussive[t] = 10 * Math.log10(ep + 1e-9);
    harmonic[t] = 10 * Math.log10(eh + 1e-9);
  }
  return { percussive, harmonic };
}

/**
 * Attaques sonores franches de la partie percussive du son (mono, `rate`
 * échantillons par seconde) : bruitages, coups, claquements. La voix et la
 * musique tenue, surtout harmoniques, passent dans l'autre partie.
 */
export function detectBeats(samples: Float32Array, rate: number): BeatAnalysis {
  const { frame, harmonicSpan, minRise, aboveVoicePercussive, aboveVoiceHarmonic, tonalRise, minAboveFloor, refractory } = BEAT_DETECTION;
  const { percussive, harmonic } = soundProfile(samples, rate);
  const frames = percussive.length;
  if (frames < harmonicSpan * 2) return { times: [], voiceShare: 0 };
  // Voix : un son harmonique soutenu, nettement au-dessus du silence, plus fort que sa partie percussive.
  const harmonicLoudest = Math.max(...harmonic);
  const voicedPercussive: number[] = [];
  const voicedHarmonic: number[] = [];
  for (let t = 0; t < frames; t++) {
    if (harmonic[t] >= harmonicLoudest - 30 && harmonic[t] > percussive[t] + 3) {
      voicedPercussive.push(percussive[t]);
      voicedHarmonic.push(harmonic[t]);
    }
  }
  const voiceShare = voicedPercussive.length / frames;
  const hasVoice = voicedPercussive.length >= 50;
  const floor = median(Array.from(percussive));
  // Seuils rapportés à la voix : un bruitage se détache d'elle, une consonne non.
  const percussiveLevel = Math.max(
    floor + minAboveFloor,
    hasVoice ? Math.max(quantile(voicedPercussive, 0.9) + aboveVoicePercussive, quantile(voicedPercussive, 0.99) + 1) : -Infinity
  );
  const harmonicLevel = hasVoice ? quantile(voicedHarmonic, 0.9) + aboveVoiceHarmonic : floor + minAboveFloor;
  const total = new Float64Array(frames);
  for (let t = 0; t < frames; t++) total[t] = 10 * Math.log10(10 ** (percussive[t] / 10) + 10 ** (harmonic[t] / 10));
  const lookBack = Math.round(0.25 / BEAT_DETECTION.hop);
  const peakSpan = Math.round(0.08 / BEAT_DETECTION.hop);
  const isPeak = (series: Float64Array, t: number) => {
    for (let u = Math.max(0, t - peakSpan); u <= Math.min(frames - 1, t + peakSpan); u++) if (series[u] > series[t]) return false;
    return true;
  };
  const candidates: { t: number; level: number }[] = [];
  for (let t = 0; t < frames; t++) {
    // Avant le début du son : le silence.
    let lowBefore = t < 3 ? -Infinity : Infinity;
    let highBefore = -Infinity;
    for (let u = Math.max(0, t - lookBack); u <= t - 3; u++) {
      lowBefore = Math.min(lowBefore, percussive[u]);
      highBefore = Math.max(highBefore, total[u]);
    }
    // Un coup : la partie percussive surgit, bien au-dessus des consonnes de la voix.
    const hit = percussive[t] >= percussiveLevel && percussive[t] - lowBefore >= minRise && isPeak(percussive, t);
    // Un son tenu qui surgit (cloche, note) : le son monte d'un coup au-dessus de la voix.
    const tone = harmonic[t] >= harmonicLevel && total[t] - highBefore >= tonalRise && isPeak(total, t);
    if (hit || tone) candidates.push({ t, level: total[t] });
  }
  const gap = Math.round(refractory / BEAT_DETECTION.hop);
  const kept: { t: number; level: number }[] = [];
  for (const candidate of candidates) {
    const last = kept[kept.length - 1];
    if (last && candidate.t - last.t < gap) continue;
    kept.push(candidate);
  }
  // L'attaque est datée au début de la montée : la fenêtre d'analyse est centrée un demi-cadre plus loin.
  const shift = frame / 2 / rate;
  return { times: kept.map((entry) => round(entry.t * BEAT_DETECTION.hop + shift - 0.02, 3)), voiceShare: round(voiceShare, 2) };
}

/** Au-delà de tant d'attaques par minute, ce sont surtout des notes de musique ou des consonnes, pas des bruitages. */
export const DENSE_BEATS_PER_MINUTE = 30;

/**
 * Bruitages par minute. La confiance baisse quand une voix couvre presque
 * tout le son, et tombe sous le seuil d'application quand les attaques sont
 * si serrées qu'il s'agit sans doute d'une musique rythmée.
 */
export function summarizeBeats(analysis: BeatAnalysis, durationSeconds: number): MeasuredBeats | undefined {
  if (durationSeconds < 5) return undefined;
  const perMinute = (analysis.times.length * 60) / durationSeconds;
  const confidence = perMinute > DENSE_BEATS_PER_MINUTE ? 0.35 : analysis.voiceShare > 0.6 ? 0.6 : 0.8;
  return { count: analysis.times.length, perMinute: round(perMinute, 1), confidence };
}

// ─── Relevé complet ──────────────────────────────────────────────

/** Ce que l'analyse a pu relever, avant d'en faire un style mesuré. */
export interface ReferenceMeasures {
  name: string;
  durationSeconds: number;
  width: number;
  height: number;
  analyzedAt: number;
  shots?: MeasuredShots;
  motion?: MeasuredMotion;
  captions?: MeasuredCaptions;
  beats?: MeasuredBeats;
  /** Le son manque (vidéo muette ou piste illisible). */
  silent?: boolean;
}

/** Style mesuré, avec la raison de chaque mesure manquante, dite franchement. */
export function assembleStyle(measures: ReferenceMeasures): MeasuredStyle {
  const missing: Partial<Record<MeasuredPart, string>> = {};
  if (!measures.shots) missing.shots = "Moins de deux coupes franches : la vidéo ressemble à un plan unique, ou ses changements de plan sont des fondus.";
  if (!measures.motion)
    missing.motion = measures.shots
      ? "Trop peu de plans assez longs dont le mouvement s’explique par un zoom ou un panoramique (sujet qui bouge, vidéo filmée)."
      : "Sans coupes, les mouvements de caméra ne se séparent pas des changements de plan.";
  if (!measures.captions) missing.captions = "Aucun texte incrusté ne revient assez souvent à la même hauteur.";
  if (!measures.beats) missing.beats = measures.silent ? "La vidéo n’a pas de son lisible." : "La vidéo est trop courte pour compter les bruitages.";
  missing.music = "Musique et voix ne se séparent pas sans un modèle appris : le niveau de la musique sous la voix n’est pas mesuré.";
  return {
    version: 1,
    reference: { name: measures.name, durationSeconds: round(measures.durationSeconds, 2), width: measures.width, height: measures.height, analyzedAt: measures.analyzedAt },
    ...(measures.shots ? { shots: measures.shots } : {}),
    ...(measures.motion ? { motion: measures.motion } : {}),
    ...(measures.captions ? { captions: measures.captions } : {}),
    ...(measures.beats ? { beats: measures.beats } : {}),
    missing,
  };
}

// ─── Analyse image par image ─────────────────────────────────────

/** Images analysées par seconde (coupes et mouvements) et, parmi elles, une sur combien pour le texte. */
export const ANALYSIS_FPS = 10;
export const TEXT_EVERY = 3;
/** Largeur des images décodées ; les vignettes des coupes sont 4 fois plus petites. */
export const ANALYSIS_WIDTH = 432;
export const THUMB_FACTOR = 8;

/** Hauteur décodée pour une vidéo `width` × `height` : même rapport, multiple de `THUMB_FACTOR`. */
export function analysisHeight(width: number, height: number): number {
  return Math.max(THUMB_FACTOR * 8, Math.round((ANALYSIS_WIDTH * height) / width / THUMB_FACTOR) * THUMB_FACTOR);
}

/**
 * Analyse au fil des images décodées (`ANALYSIS_FPS` par seconde, en gris,
 * `ANALYSIS_WIDTH` de large) : garde seulement des vignettes et les bandes de
 * texte, jamais les images entières.
 */
export class ReferenceAnalyzer {
  private thumbs: GrayFrame[] = [];
  private bands: TextBand[][] = [];

  constructor(
    readonly width: number,
    readonly height: number
  ) {}

  get frames(): number {
    return this.thumbs.length;
  }

  push(data: Uint8Array) {
    const frame: GrayFrame = { width: this.width, height: this.height, data };
    if (this.thumbs.length % TEXT_EVERY === 0) this.bands.push(textBands(downscale(frame, 2), frame));
    this.thumbs.push(downscale(frame, THUMB_FACTOR));
  }

  /** Coupes, mouvements et sous-titres de ce qui a été vu. */
  finish(): { shots?: MeasuredShots; motion?: MeasuredMotion; captions?: MeasuredCaptions; cuts: number[] } {
    const captions = summarizeCaptions(this.bands);
    // Les sous-titres changent sans que le plan change : leur bande est ignorée pour les coupes et les mouvements.
    const mask: RowMask | null = captions ? { top: Math.max(0, captions.top - 0.02), bottom: Math.min(1, captions.bottom + 0.02) } : null;
    const scores = this.thumbs.map((thumb, index) => (index === 0 ? 0 : frameDistance(this.thumbs[index - 1], thumb, mask)));
    const cuts = mergeFlatShots(detectCuts(scores, ANALYSIS_FPS), this.thumbs);
    const duration = this.thumbs.length / ANALYSIS_FPS;
    const bounds = shotBounds(cuts, ANALYSIS_FPS, duration);
    const shots = summarizeShots(bounds.map((shot) => shot.end - shot.start));
    // Mouvement de chaque plan d'au moins 0,6 s, entre deux images prises à 0,15 s de ses bords.
    const motions: ShotMotion[] = [];
    if (shots) {
      for (const shot of bounds) {
        if (shot.end - shot.start < 0.6) continue;
        const first = Math.round((shot.start + 0.15) * ANALYSIS_FPS);
        const last = Math.round((shot.end - 0.15) * ANALYSIS_FPS) - 1;
        if (last - first < 3 || last >= this.thumbs.length) continue;
        // Mesuré entre deux images intérieures au plan : ramené à toute sa durée.
        const covered = Math.max(0.4, (last - first) / ((shot.end - shot.start) * ANALYSIS_FPS));
        const motion = estimateShotMotion(this.thumbs[first], this.thumbs[last], mask);
        motions.push({ ...motion, zoom: motion.zoom ** (1 / covered), shiftX: motion.shiftX / covered, shiftY: motion.shiftY / covered });
      }
    }
    const motion = summarizeMotion(motions);
    return { ...(shots ? { shots } : {}), ...(motion ? { motion } : {}), ...(captions ? { captions } : {}), cuts };
  }
}
