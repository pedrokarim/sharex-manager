/**
 * Poses de la mascotte : étiquettes et choix (dossier 07 sexies, D2).
 *
 * Les listes fermées vivent ici, dans le moteur : la marque (`brand-kit`)
 * les reprend, et le montage choisit une pose sans lire la fiche d'une
 * marque. Tout est pur.
 */

/** Émotion qu'exprime une pose ; libellés français dans `brand-kit/lib/mascot.ts`. */
export const POSE_EMOTIONS = ["joy", "excitement", "surprise", "shock", "thinking", "doubt", "disappointment", "sadness", "anger", "mischief", "pride", "neutral"] as const;
export type PoseEmotion = (typeof POSE_EMOTIONS)[number];

/** Geste de la pose. `idle` : aucun geste marqué. */
export const POSE_GESTURES = [
  "pointing",
  "leaning",
  "arms-raised",
  "hands-on-cheeks",
  "thumbs-up",
  "chin-in-hand",
  "waving",
  "showing-object",
  "presenting",
  "shrugging",
  "arms-crossed",
  "hands-on-hips",
  "facepalm",
  "finger-on-lips",
  "recoiling",
  "idle",
] as const;
export type PoseGesture = (typeof POSE_GESTURES)[number];

/** Cadrage : en pied, buste, visage. */
export const POSE_FRAMINGS = ["full", "bust", "face"] as const;
export type PoseFraming = (typeof POSE_FRAMINGS)[number];

/** Côté de l'image vers lequel la pose regarde ou pointe : on la place en regard du contenu. */
export const POSE_FACINGS = ["left", "front", "right"] as const;
export type PoseFacing = (typeof POSE_FACINGS)[number];

/** Étiquettes d'une pose de la mascotte, qui servent à la choisir. */
export interface PoseTags {
  emotion: PoseEmotion;
  gesture: PoseGesture;
  framing: PoseFraming;
  facing: PoseFacing;
}

/**
 * Émotions voisines, de la plus proche à la moins proche : quand aucune pose
 * n'a l'émotion demandée, une voisine dit à peu près la même chose. Jamais
 * une émotion de sens contraire (pas de pose triste pour un segment joyeux).
 */
export const POSE_EMOTION_NEIGHBORS: Record<PoseEmotion, readonly PoseEmotion[]> = {
  joy: ["excitement", "pride", "mischief"],
  excitement: ["joy", "surprise", "pride"],
  surprise: ["shock", "excitement", "thinking"],
  shock: ["surprise", "disappointment"],
  thinking: ["doubt", "neutral"],
  doubt: ["thinking", "disappointment"],
  disappointment: ["sadness", "doubt"],
  sadness: ["disappointment", "doubt"],
  anger: ["disappointment", "shock"],
  mischief: ["joy", "pride"],
  pride: ["joy", "excitement", "mischief"],
  neutral: ["thinking", "joy"],
};

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/** Émotion lue avec rigueur : hors de la liste fermée, la valeur neutre. */
export function readEmotion(value: unknown): PoseEmotion {
  return isOneOf(POSE_EMOTIONS, value) ? value : "neutral";
}

/** Geste lu avec rigueur : hors de la liste fermée, aucun. */
export function readGesture(value: unknown): PoseGesture | undefined {
  return isOneOf(POSE_GESTURES, value) ? value : undefined;
}

export interface PoseQuery {
  emotion: PoseEmotion;
  gesture?: PoseGesture;
  framing?: PoseFraming;
  /** Côté vers lequel la pose doit regarder (là où est le contenu). */
  side?: "left" | "right";
  /** Poses à éviter (celle qu'on vient de montrer), sauf si aucune autre ne convient. */
  exclude?: string | readonly string[];
}

/** Une pose classée : son rang d'émotion (0 exacte, puis voisines, puis neutre). */
export interface RankedPose<T> {
  pose: T;
  rank: number;
}

/**
 * Poses qui conviennent à une demande, de la meilleure à la moins bonne :
 * l'émotion exacte, sinon une émotion voisine (la plus proche d'abord),
 * sinon une pose neutre ; à égalité, le bon geste, le bon cadrage, puis le
 * bon côté (de face avant le côté opposé), puis l'ordre de la marque. Une
 * émotion éloignée n'y figure pas.
 */
export function rankPoses<T>(poses: readonly T[], tagsOf: (pose: T) => PoseTags, query: PoseQuery): RankedPose<T>[] {
  const neighbors = POSE_EMOTION_NEIGHBORS[query.emotion] ?? [];
  return poses
    .map((pose, order) => {
      const tags = tagsOf(pose);
      const neighbor = neighbors.indexOf(tags.emotion);
      // Rang d'émotion : 0 exacte, 1 à n voisines, n + 1 neutre ; -1 : ne convient pas.
      const rank = tags.emotion === query.emotion ? 0 : neighbor >= 0 ? 1 + neighbor : tags.emotion === "neutral" ? 1 + neighbors.length : -1;
      const side = !query.side ? 0 : tags.facing === query.side ? 0 : tags.facing === "front" ? 1 : 2;
      const score = [rank, query.gesture && tags.gesture !== query.gesture ? 1 : 0, query.framing && tags.framing !== query.framing ? 1 : 0, side, order];
      return { pose, rank, score };
    })
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => {
      for (let index = 0; index < a.score.length; index++) if (a.score[index] !== b.score[index]) return a.score[index] - b.score[index];
      return 0;
    })
    .map(({ pose, rank }) => ({ pose, rank }));
}

/**
 * La pose qui va le mieux : la première du classement qui n'est pas exclue,
 * sinon la meilleure (mieux vaut répéter une pose qu'en montrer une hors de
 * propos). `undefined` quand aucune ne convient.
 */
export function pickRankedPose<T>(poses: readonly T[], tagsOf: (pose: T) => PoseTags, idOf: (pose: T) => string, query: PoseQuery): T | undefined {
  const excluded = new Set<string>(typeof query.exclude === "string" ? [query.exclude] : (query.exclude ?? []));
  const ranked = rankPoses(poses, tagsOf, query);
  return (ranked.find((entry) => !excluded.has(idOf(entry.pose))) ?? ranked[0])?.pose;
}

/**
 * Faut-il retourner une pose en miroir pour qu'elle regarde vers `side` ?
 * Seulement quand elle regarde du côté opposé : une pose de face reste telle
 * quelle.
 */
export function needsMirror(facing: PoseFacing, side: "left" | "right"): boolean {
  return facing !== "front" && facing !== side;
}
