/**
 * Style mesuré sur une vidéo de référence (dossier 07 sexies, D4).
 *
 * Une marque peut adopter le montage d'un short qu'elle aime : la durée de
 * ses plans, la part de plans animés et l'ampleur de leurs zooms, la place et
 * la taille de ses sous-titres, la densité de ses bruitages. Ces valeurs sont
 * relevées par des outils classiques (`brand-kit/lib/reference-analysis.ts`,
 * avec ffmpeg) ; chacune porte sa confiance, et ce qui n'a pas pu être mesuré
 * reste absent.
 *
 * Ce module est pur : il lit un style enregistré avec rigueur, puis le
 * traduit en plan de montage (`measuredPlan`), **dans les bornes des règles
 * de 07 sexies**. Une valeur absente ou trop incertaine laisse la valeur du
 * rythme « normal » de D3 ; la lisibilité (D1) reste prioritaire : un
 * sous-titre ne sort jamais de la zone visible d'un short, ne descend jamais
 * sous une taille lisible, et son contraste est garanti ensuite par
 * `legibleKaraoke`, quelle que soit la référence.
 */

/** La vidéo d'où vient le style : jamais la vidéo elle-même, seulement ce qui la désigne. */
export interface MeasuredReference {
  /** Nom du fichier d'origine, tel que l'utilisateur l'a envoyé. */
  name: string;
  durationSeconds: number;
  width: number;
  height: number;
  /** Date de l'analyse (ms depuis 1970). */
  analyzedAt: number;
}

/** Durée des plans, entre deux coupes franches. */
export interface MeasuredShots {
  count: number;
  /** En secondes. */
  median: number;
  q1: number;
  q3: number;
  longest: number;
  /** Nombre de plans par tranche de 0,5 s : [0 ; 0,5[, [0,5 ; 1[… le dernier compte 4 s et plus. */
  histogram: number[];
  /** De 0 à 1. */
  confidence: number;
}

/** Mouvements de caméra à l'intérieur des plans (zoom, panoramique). */
export interface MeasuredMotion {
  /** Plans dont le mouvement a pu être estimé. */
  measuredShots: number;
  /** Part des plans estimés qui bougent (zoom ou panoramique), de 0 à 1. */
  animatedShare: number;
  /** Part des plans estimés qui zooment. */
  zoomShare: number;
  /** Part des plans estimés qui glissent (panoramique) sans zoomer. */
  panShare: number;
  /** Rapport de zoom typique d'un plan qui zoome (1,15 = 15 % d'agrandissement), s'il y en a. */
  typicalZoom?: number;
  confidence: number;
}

/** Sous-titres incrustés : place verticale et taille, en fractions de la hauteur. */
export interface MeasuredCaptions {
  /** Part des images analysées qui montrent un sous-titre à cette place. */
  presence: number;
  /** Centre de la bande des sous-titres (0 en haut, 1 en bas). */
  center: number;
  /** Haut et bas habituels de la bande (premier et troisième quartiles). */
  top: number;
  bottom: number;
  /** Hauteur d'une ligne de texte (des lettres, contour compris), médiane. */
  lineHeight: number;
  /** Premier et troisième quartiles de cette hauteur. */
  lineHeightRange: [number, number];
  /** Mots à l'écran en même temps, médiane, s'ils ont pu être comptés. */
  words?: number;
  confidence: number;
}

/** Bruitages et temps forts sonores : attaques franches, hors voix autant que possible. */
export interface MeasuredBeats {
  count: number;
  perMinute: number;
  confidence: number;
}

export const MEASURED_PARTS = ["shots", "motion", "captions", "beats", "music"] as const;
export type MeasuredPart = (typeof MEASURED_PARTS)[number];

export interface MeasuredStyle {
  version: 1;
  reference: MeasuredReference;
  shots?: MeasuredShots;
  motion?: MeasuredMotion;
  captions?: MeasuredCaptions;
  beats?: MeasuredBeats;
  /** Ce qui n'a pas pu être mesuré, et pourquoi (texte affiché). */
  missing?: Partial<Record<MeasuredPart, string>>;
}

/** En dessous, une valeur est montrée dans le relevé mais pas appliquée : le moteur garde celle de D3. */
export const MIN_APPLIED_CONFIDENCE = 0.5;

// ─── Bornes (règles de 07 sexies) ────────────────────────────────

/**
 * Durée visée d'un plan : jamais sous 0,8 s (une coupe qu'on ne voit pas),
 * jamais au-dessus de 2,2 s ; un plan ne dépasse jamais 2,4 s, sous la limite
 * de 2,5 s sans changement de D3.
 */
export const MEASURED_SHOT_BOUNDS = { min: 0.8, max: 2.2, upper: 2.4 } as const;

/**
 * Taille des sous-titres, en fraction de la hauteur : au moins 3,5 % (lisible
 * sur un téléphone), au plus 8,5 % (trois mots tiennent encore sur une ligne).
 */
export const MEASURED_CAPTION_SIZE = { min: 0.035, max: 0.085 } as const;

/**
 * Hauteur mesurée d'une ligne de sous-titres du moteur, rapportée à la taille
 * de sa police : lettres capitales grasses et contour épais. Étalonné en
 * mesurant, avec la même analyse, des sous-titres rendus par `drawFrame`.
 */
export const CAPTION_HEIGHT_RATIO = 0.86;

/** Mots à l'écran : de 1 à 4 sur un short (3 par défaut en D3). */
export const MEASURED_CAPTION_WORDS = { min: 1, max: 4 } as const;

/** Bruitages au plus par minute (un toutes les 2,5 s), et écart minimal entre deux. */
export const MEASURED_BEATS_MAX_PER_MINUTE = 24;
export const MEASURED_BEAT_GAP_SECONDS = 1;

/**
 * Mouvements de caméra du moteur, rangés par ampleur du zoom
 * (`motion/scenes.ts`). Les préréglages ont une ampleur fixe : ×1,15 ou
 * ×1,3 ; un zoom plus faible dans la référence prend le premier jeu.
 */
export const MEASURED_MOVES = {
  /** Le jeu de D3 : zoom de ×1,15, panoramiques. */
  medium: ["zoom-in", "pan-right", "zoom-out", "pan-left"],
  /** Grand recul (×1,3) et zoom avant. */
  large: ["pull-out", "pan-right", "zoom-in", "pan-left"],
  /** Seulement des panoramiques. */
  pans: ["pan-right", "pan-left"],
} as const;

// ─── Lecture rigoureuse ──────────────────────────────────────────

const finite = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : undefined;

const confidenceOf = (value: unknown) => finite(value, 0, 1);

/** Texte affiché : une ligne, sans caractère de contrôle, borné. */
function note(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = Array.from(value)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("")
    .trim()
    .slice(0, 300);
  return clean || undefined;
}

function readShots(value: any): MeasuredShots | undefined {
  if (!value || typeof value !== "object") return undefined;
  const count = finite(value.count, 1, 10_000);
  const median = finite(value.median, 0.05, 600);
  const q1 = finite(value.q1, 0.05, 600);
  const q3 = finite(value.q3, 0.05, 600);
  const longest = finite(value.longest, 0.05, 600);
  const confidence = confidenceOf(value.confidence);
  if (count === undefined || median === undefined || q1 === undefined || q3 === undefined || longest === undefined || confidence === undefined) return undefined;
  if (!(q1 <= median && median <= q3 && q3 <= longest)) return undefined;
  const histogram = Array.isArray(value.histogram) ? value.histogram.slice(0, 9).map((entry: unknown) => Math.round(finite(entry, 0, 10_000) ?? 0)) : [];
  return { count: Math.round(count), median, q1, q3, longest, histogram, confidence };
}

function readMotion(value: any): MeasuredMotion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const measuredShots = finite(value.measuredShots, 1, 10_000);
  const animatedShare = finite(value.animatedShare, 0, 1);
  const zoomShare = finite(value.zoomShare, 0, 1);
  const panShare = finite(value.panShare, 0, 1);
  const confidence = confidenceOf(value.confidence);
  if (measuredShots === undefined || animatedShare === undefined || zoomShare === undefined || panShare === undefined || confidence === undefined) return undefined;
  const typicalZoom = finite(value.typicalZoom, 1, 2);
  return { measuredShots: Math.round(measuredShots), animatedShare, zoomShare, panShare, ...(typicalZoom !== undefined ? { typicalZoom } : {}), confidence };
}

function readCaptions(value: any): MeasuredCaptions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const presence = finite(value.presence, 0, 1);
  const center = finite(value.center, 0, 1);
  const top = finite(value.top, 0, 1);
  const bottom = finite(value.bottom, 0, 1);
  const lineHeight = finite(value.lineHeight, 0.002, 0.5);
  const confidence = confidenceOf(value.confidence);
  const range = Array.isArray(value.lineHeightRange) ? value.lineHeightRange.map((entry: unknown) => finite(entry, 0.002, 0.5)) : [];
  if (presence === undefined || center === undefined || top === undefined || bottom === undefined || lineHeight === undefined || confidence === undefined) return undefined;
  if (!(top <= center && center <= bottom)) return undefined;
  const lineHeightRange: [number, number] = range[0] !== undefined && range[1] !== undefined && range[0] <= range[1] ? [range[0], range[1]] : [lineHeight, lineHeight];
  const words = finite(value.words, 1, 30);
  return { presence, center, top, bottom, lineHeight, lineHeightRange, ...(words !== undefined ? { words } : {}), confidence };
}

function readBeats(value: any): MeasuredBeats | undefined {
  if (!value || typeof value !== "object") return undefined;
  const count = finite(value.count, 0, 10_000);
  const perMinute = finite(value.perMinute, 0, 600);
  const confidence = confidenceOf(value.confidence);
  if (count === undefined || perMinute === undefined || confidence === undefined) return undefined;
  return { count: Math.round(count), perMinute, confidence };
}

/** Style mesuré lu avec rigueur ; une partie illisible est écartée, une référence illisible écarte tout. */
export function readMeasuredStyle(value: unknown): MeasuredStyle | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, any>;
  const ref = input.reference;
  if (input.version !== 1 || !ref || typeof ref !== "object") return undefined;
  const name = note(ref.name);
  const durationSeconds = finite(ref.durationSeconds, 0.1, 3600);
  const width = finite(ref.width, 1, 16_384);
  const height = finite(ref.height, 1, 16_384);
  const analyzedAt = finite(ref.analyzedAt, 0, 8.64e15);
  if (!name || durationSeconds === undefined || width === undefined || height === undefined || analyzedAt === undefined) return undefined;
  const shots = readShots(input.shots);
  const motion = readMotion(input.motion);
  const captions = readCaptions(input.captions);
  const beats = readBeats(input.beats);
  const missing: Partial<Record<MeasuredPart, string>> = {};
  if (input.missing && typeof input.missing === "object") {
    for (const part of MEASURED_PARTS) {
      const reason = note(input.missing[part]);
      if (reason) missing[part] = reason;
    }
  }
  return {
    version: 1,
    reference: { name, durationSeconds, width: Math.round(width), height: Math.round(height), analyzedAt: Math.round(analyzedAt) },
    ...(shots ? { shots } : {}),
    ...(motion ? { motion } : {}),
    ...(captions ? { captions } : {}),
    ...(beats ? { beats } : {}),
    ...(Object.keys(missing).length ? { missing } : {}),
  };
}

// ─── Plan de montage ─────────────────────────────────────────────

/** Ce que le montage reprend d'un style mesuré, déjà borné. Une partie absente : la valeur de D3. */
export interface MeasuredPlan {
  /** Durée visée d'un plan et durée au plus, en secondes. */
  shots?: { target: number; upper: number };
  /** Part des plans animés, et mouvements de caméra à tour de rôle. */
  motion?: { animatedShare: number; moves: readonly string[] };
  /** Sous-titres mot à mot d'un short : centre (fraction de la hauteur), taille de police, mots à l'écran. */
  caption?: { y: number; size: number; groupSize: number };
  /** Bruitages par minute, sur les temps forts seulement. */
  beats?: { perMinute: number };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const applied = (part: { confidence: number } | undefined) => Boolean(part && part.confidence >= MIN_APPLIED_CONFIDENCE);

/** Le cadre est-il un short 9:16 ? La place des sous-titres d'une référence ne vaut que là. */
const isShortFrame = (frame: { width: number; height: number }) => Math.abs(frame.height / frame.width - 16 / 9) < 0.02;

/** Zone visible d'un short, en fractions de la hauteur (`SHORT_SAFE_ZONE` de `brand.ts`, passée par l'appelant). */
export interface VisibleBand {
  top: number;
  bottom: number;
}

/**
 * Centre des sous-titres dans la zone visible d'un short : ni sous le nom du
 * compte en haut, ni sur la légende en bas, avec la place d'un bloc de
 * `lines` lignes à cette taille.
 */
export function captionCenterBounds(size: number, zone: VisibleBand, lines = 1, lineHeight = 1.15): { min: number; max: number } {
  const half = (size * lineHeight * Math.max(1, lines)) / 2;
  return { min: zone.top + half, max: zone.bottom - half };
}

/**
 * Lignes qu'occupera le plus long groupe de mots de sous-titres en capitales
 * grasses, estimé sans dessiner (largeur moyenne d'une capitale : 0,68 fois
 * la taille de la police), dans une boîte de `boxWidth` du cadre.
 */
export function captionLineCount(groups: readonly string[], size: number, frame: { width: number; height: number }, boxWidth = 0.86): number {
  const charPx = size * frame.height * 0.68;
  return Math.max(1, ...groups.map((group) => Math.ceil((group.length * charPx) / (boxWidth * frame.width))));
}

/** Jeu de mouvements de caméra qui ressemble le plus à ceux de la référence. */
export function movesFor(motion: Pick<MeasuredMotion, "animatedShare" | "zoomShare" | "typicalZoom">): readonly string[] {
  if (motion.animatedShare > 0 && motion.zoomShare < motion.animatedShare * 0.25) return MEASURED_MOVES.pans;
  return (motion.typicalZoom ?? 1.15) >= 1.22 ? MEASURED_MOVES.large : MEASURED_MOVES.medium;
}

/**
 * Traduit un style mesuré en plan de montage, dans les bornes des règles.
 * `null` sans style ou sans aucune valeur assez sûre : le montage est alors
 * celui du rythme « normal ».
 */
export function measuredPlan(style: MeasuredStyle | undefined | null, frame: { width: number; height: number }, zone: VisibleBand): MeasuredPlan | null {
  if (!style) return null;
  const plan: MeasuredPlan = {};
  if (applied(style.shots)) {
    const shots = style.shots!;
    const target = clamp(shots.median, MEASURED_SHOT_BOUNDS.min, MEASURED_SHOT_BOUNDS.max);
    const upper = clamp(Math.max(shots.q3, target), target, MEASURED_SHOT_BOUNDS.upper);
    plan.shots = { target, upper };
  }
  if (applied(style.motion)) {
    const motion = style.motion!;
    plan.motion = { animatedShare: clamp(motion.animatedShare, 0, 1), moves: movesFor(motion) };
  }
  if (applied(style.captions) && isShortFrame(frame)) {
    const captions = style.captions!;
    const size = clamp(captions.lineHeight / CAPTION_HEIGHT_RATIO, MEASURED_CAPTION_SIZE.min, MEASURED_CAPTION_SIZE.max);
    const bounds = captionCenterBounds(size, zone);
    const groupSize = Math.round(clamp(captions.words ?? 3, MEASURED_CAPTION_WORDS.min, MEASURED_CAPTION_WORDS.max));
    plan.caption = { y: clamp(captions.center, bounds.min, bounds.max), size, groupSize };
  }
  if (applied(style.beats)) plan.beats = { perMinute: clamp(style.beats!.perMinute, 0, MEASURED_BEATS_MAX_PER_MINUTE) };
  return Object.keys(plan).length ? plan : null;
}

/**
 * Bruitages d'un clip de `seconds` secondes au rythme mesuré : arrondi, au
 * plus un par tranche de 2,5 s.
 */
export function measuredBeatCount(perMinute: number, seconds: number): number {
  const wanted = Math.round((clamp(perMinute, 0, MEASURED_BEATS_MAX_PER_MINUTE) * seconds) / 60);
  return clamp(wanted, 0, Math.floor(seconds / (60 / MEASURED_BEATS_MAX_PER_MINUTE)));
}

/**
 * Sens d'un panoramique d'un style mesuré : celui où l'image n'a que la
 * marge du zoom. Une photo paysage dans un short, couverte en hauteur, a une
 * énorme marge en largeur : un panoramique horizontal la balaierait d'un bord
 * à l'autre en une seconde, bien plus vite que les glissements d'une
 * référence. Il devient vertical (et inversement pour une image en hauteur
 * dans un cadre large).
 */
export function fittedPan(move: string, source: { width?: number; height?: number }, frame: { width: number; height: number }): string {
  if (!source.width || !source.height) return move;
  const wider = source.width / source.height > frame.width / frame.height;
  if (wider && move === "pan-right") return "pan-down";
  if (wider && move === "pan-left") return "pan-up";
  if (!wider && move === "pan-down") return "pan-right";
  if (!wider && move === "pan-up") return "pan-left";
  return move;
}

/** Plans d'un fond de `duration` images : assez pour ne jamais dépasser la durée au plus, au plus près de la durée visée. */
export function measuredShotCount(duration: number, fps: number, shots: { target: number; upper: number }): number {
  const target = shots.target * fps;
  const upper = shots.upper * fps;
  return Math.max(1, Math.ceil(duration / upper), Math.round(duration / target));
}
