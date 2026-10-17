/**
 * La mascotte dans les formats et les vidéos (dossier 07, § 4.3 et § 5.3).
 *
 * Chaque format peut mettre en scène une pose : celle que la marque a
 * choisie (`mascot.formatPoses`), sinon une proposition tirée des poses
 * elles-mêmes. Le filigrane n'en a jamais. Tout ici est pur : l'aperçu, les
 * exports et le serveur lisent la même réponse.
 */

import {
  MASCOT_FORMAT_IDS,
  POSE_EMOTIONS,
  POSE_FACINGS,
  POSE_FRAMINGS,
  POSE_GESTURES,
  type BrandAsset,
  type BrandKit,
  type FormatId,
  type MascotFormatId,
  type PoseEmotion,
  type PoseFacing,
  type PoseFraming,
  type PoseGesture,
  type PoseTags,
} from "./types";

const isMascotFormat = (id: FormatId): id is MascotFormatId => (MASCOT_FORMAT_IDS as readonly string[]).includes(id);

/** Poses de la mascotte, dans l'ordre de la marque. */
export function mascotPoses(kit: BrandKit): BrandAsset[] {
  const ids = kit.mascot?.poseAssetIds ?? [];
  return ids.map((id) => kit.assets.find((asset) => asset.id === id && asset.kind === "mascot-pose")).filter((asset): asset is BrandAsset => Boolean(asset));
}

/** Ce que dit une pose d'elle-même : son libellé et sa note, sans accents ni casse. */
const words = (asset: Pick<BrandAsset, "label" | "note">) =>
  `${asset.label} ${asset.note ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Mots qui désignent un format dans le libellé ou la note d'une pose (« Bannière YouTube. », « Avatar. »). */
const FORMAT_WORDS: Record<MascotFormatId, RegExp> = {
  banner: /\bbanniere\b|\bbanner\b/,
  avatar: /\bavatar\b|\bportrait\b|\bbuste\b/,
  "x-header": /\ben-tete\b|\bheader\b/,
  "short-cover": /\bcouverture\b|\bminiature\b/,
};

const ratio = (asset: Pick<BrandAsset, "width" | "height">) => asset.height / Math.max(1, asset.width);

/**
 * Pose proposée pour un format quand la marque n'a rien choisi : celle dont
 * la note ou le libellé nomme le format, sinon la plus large pour la
 * bannière, la plus carrée pour l'avatar, la plus haute pour l'en-tête X.
 * La couverture de short n'en a pas d'office.
 */
export function proposedFormatPose(kit: BrandKit, id: MascotFormatId): BrandAsset | undefined {
  const poses = mascotPoses(kit);
  if (poses.length === 0) return undefined;
  const named = poses.find((pose) => FORMAT_WORDS[id].test(words(pose)));
  if (named) return named;
  if (id === "short-cover") return undefined;
  const squareness = (pose: BrandAsset) => Math.abs(Math.log(ratio(pose)));
  // Bannière : la plus large ; avatar : la plus carrée ; en-tête X : la plus haute.
  const sorted = [...poses].sort((a, b) => (id === "banner" ? ratio(a) - ratio(b) : id === "avatar" ? squareness(a) - squareness(b) : ratio(b) - ratio(a)));
  return sorted[0];
}

/** Réglage de la marque pour un format : une pose, « sans mascotte » (`null`), ou rien (`undefined`). */
export function formatPoseSetting(kit: BrandKit, id: MascotFormatId): string | null | undefined {
  const value = kit.mascot?.formatPoses?.[id];
  if (value === null) return null;
  return typeof value === "string" && mascotPoses(kit).some((pose) => pose.id === value) ? value : undefined;
}

/** Pose mise en scène dans un format, ou rien. */
export function formatPose(kit: BrandKit, id: FormatId): BrandAsset | undefined {
  if (id === "endcard-vertical" || id === "endcard-horizontal") {
    return kit.endCard.poseAssetId ? kit.assets.find((asset) => asset.id === kit.endCard.poseAssetId) : undefined;
  }
  if (!isMascotFormat(id)) return undefined;
  const setting = formatPoseSetting(kit, id);
  if (setting === null) return undefined;
  if (setting) return mascotPoses(kit).find((pose) => pose.id === setting);
  return proposedFormatPose(kit, id);
}

/** Pose de l'ouverture des vidéos : celle choisie, sinon celle de l'en-tête X, sinon la première. */
export function openingPose(kit: BrandKit): BrandAsset | undefined {
  const poses = mascotPoses(kit);
  const chosen = kit.mascot?.presence?.openingPoseId;
  return poses.find((pose) => pose.id === chosen) ?? formatPose(kit, "x-header") ?? poses[0];
}

/** Image finie importée pour un format, qui remplace son rendu composé. */
export function formatImageAsset(kit: BrandKit, id: FormatId): BrandAsset | undefined {
  const assetId = kit.formatImages?.[id];
  return assetId ? kit.assets.find((asset) => asset.id === assetId && asset.kind === "format") : undefined;
}

// ─── Bibliothèque de poses (dossier 07 sexies, D2) ───────────────

export const POSE_EMOTION_LABELS: Record<PoseEmotion, string> = {
  joy: "Joie",
  excitement: "Enthousiasme",
  surprise: "Surprise",
  shock: "Choc",
  thinking: "Réflexion",
  doubt: "Doute",
  disappointment: "Déception",
  sadness: "Tristesse",
  anger: "Colère",
  mischief: "Malice",
  pride: "Fierté",
  neutral: "Neutre",
};

export const POSE_GESTURE_LABELS: Record<PoseGesture, string> = {
  pointing: "Pointe",
  leaning: "Accoudée",
  "arms-raised": "Bras levés",
  "hands-on-cheeks": "Mains sur les joues",
  "thumbs-up": "Pouce levé",
  "chin-in-hand": "Menton dans la main",
  waving: "Salut",
  "showing-object": "Montre un objet",
  presenting: "Présente, main ouverte",
  shrugging: "Haussement d’épaules",
  "arms-crossed": "Bras croisés",
  "hands-on-hips": "Poings sur les hanches",
  facepalm: "Main sur le visage",
  "finger-on-lips": "Doigt sur la bouche",
  recoiling: "Recule",
  idle: "Sans geste",
};

export const POSE_FRAMING_LABELS: Record<PoseFraming, string> = { full: "En pied", bust: "Buste", face: "Visage" };

export const POSE_FACING_LABELS: Record<PoseFacing, string> = { left: "Vers la gauche", front: "De face", right: "Vers la droite" };

/**
 * Émotions voisines, de la plus proche à la moins proche : quand aucune pose
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

/** Geste proposé d'office pour générer une pose d'une émotion donnée. */
export const SUGGESTED_GESTURE: Record<PoseEmotion, PoseGesture> = {
  joy: "thumbs-up",
  excitement: "arms-raised",
  surprise: "hands-on-cheeks",
  shock: "recoiling",
  thinking: "chin-in-hand",
  doubt: "shrugging",
  disappointment: "facepalm",
  sadness: "idle",
  anger: "arms-crossed",
  mischief: "finger-on-lips",
  pride: "hands-on-hips",
  neutral: "presenting",
};

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/** Mots qui trahissent une émotion dans un libellé ou une note (sans accents ni casse). */
const EMOTION_WORDS: [PoseEmotion, RegExp][] = [
  ["excitement", /enthousias|survolt|emball|excit|euphor/],
  ["joy", /\bjoie|joyeu|\bravie?\b|heureu|content|rieu|\brire\b/],
  ["shock", /\bchoc|choque|effray|\bpeur\b|horrifi|panique/],
  ["surprise", /surpri|etonn|stupef/],
  ["thinking", /reflexion|reflechi|pensi[fv]|songeu/],
  ["doubt", /\bdoute|sceptique|perplex|mefian/],
  ["disappointment", /\bdecu|decept|desabus|blase/],
  ["sadness", /trist|pleur|larme|chagrin/],
  ["anger", /colere|fache|enerv|furieu|boude/],
  ["mischief", /malic|espiegle|coquin|clin d.?oeil|taquin/],
  ["pride", /\bfier|fierte|triomph|victoire/],
  ["neutral", /neutre|calme|serein/],
];

/** Mots qui trahissent un geste. L'ordre compte : « montre du doigt » pointe, « montre » tient un objet. */
const GESTURE_WORDS: [PoseGesture, RegExp][] = [
  ["pointing", /\bpointe|pointant|montre du doigt|index tendu/],
  ["leaning", /accoud/],
  ["arms-raised", /bras (leves|en l.air)|bras au ciel/],
  ["hands-on-cheeks", /joues/],
  ["thumbs-up", /pouce/],
  ["chin-in-hand", /menton/],
  ["waving", /\bsalu|coucou|signe de (la )?main/],
  ["presenting", /\bpresente|main ouverte/],
  ["showing-object", /\bmontre|\btient|brandit/],
  ["shrugging", /hausse|epaules/],
  ["arms-crossed", /bras croises/],
  ["hands-on-hips", /hanches/],
  ["facepalm", /facepalm|main sur le (visage|front)/],
  ["finger-on-lips", /doigt sur (la bouche|les levres)|\bchut\b/],
  ["recoiling", /\brecul/],
];

/** Émotion qu'un geste laisse deviner quand le libellé n'en nomme aucune. */
const GESTURE_EMOTION: Partial<Record<PoseGesture, PoseEmotion>> = {
  pointing: "excitement",
  "arms-raised": "excitement",
  "hands-on-cheeks": "surprise",
  "thumbs-up": "joy",
  "chin-in-hand": "thinking",
  shrugging: "doubt",
  "arms-crossed": "anger",
  "hands-on-hips": "pride",
  facepalm: "disappointment",
  "finger-on-lips": "mischief",
  recoiling: "shock",
};

/**
 * Étiquettes proposées pour une pose qui n'en a pas (marque d'avant la
 * bibliothèque, image importée) : lues dans son libellé et sa note, sinon
 * déduites du geste et de la forme de l'image. Toujours modifiables.
 */
export function proposePoseTags(asset: Pick<BrandAsset, "label" | "note" | "width" | "height">): PoseTags {
  const text = words(asset);
  const gesture = GESTURE_WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "idle";
  const emotion = EMOTION_WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? GESTURE_EMOTION[gesture] ?? "neutral";
  // « tête » n'est pas un indice : « en-tête X » désigne un format, pas un cadrage.
  const framing: PoseFraming = /\bvisage\b|gros plan/.test(text)
    ? "face"
    : /\bbuste\b|portrait|mi-corps/.test(text)
      ? "bust"
      : /en pied|debout/.test(text) || ratio(asset) >= 1.5
        ? "full"
        : "bust";
  const facing: PoseFacing = /vers la gauche|\ba gauche\b/.test(text) ? "left" : /vers la droite|\ba droite\b/.test(text) ? "right" : "front";
  return { emotion, gesture, framing, facing };
}

/**
 * Étiquettes lues avec rigueur : chaque champ doit appartenir à sa liste
 * fermée, sinon il reprend celui de `fallback`. Rien d'inventé.
 */
export function sanitizePoseTags(input: unknown, fallback: PoseTags): PoseTags {
  const tags = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    emotion: isOneOf(POSE_EMOTIONS, tags.emotion) ? tags.emotion : fallback.emotion,
    gesture: isOneOf(POSE_GESTURES, tags.gesture) ? tags.gesture : fallback.gesture,
    framing: isOneOf(POSE_FRAMINGS, tags.framing) ? tags.framing : fallback.framing,
    facing: isOneOf(POSE_FACINGS, tags.facing) ? tags.facing : fallback.facing,
  };
}

/**
 * Migration douce, à la lecture : chaque pose reçoit des étiquettes valides
 * (les siennes, complétées, sinon celles proposées) ; les autres images
 * restent telles quelles. Une liste illisible est rendue sans changement.
 */
export function upgradePoseAssets(assets: BrandAsset[]): BrandAsset[] {
  if (!Array.isArray(assets)) return assets;
  return assets.map((asset) =>
    asset && asset.kind === "mascot-pose" ? { ...asset, pose: sanitizePoseTags(asset.pose, proposePoseTags(asset)) } : asset
  );
}

/** Étiquettes d'une pose : les siennes, sinon celles qu'on lui propose. */
export function poseTags(asset: BrandAsset): PoseTags {
  const proposed = proposePoseTags(asset);
  return asset.pose ? sanitizePoseTags(asset.pose, proposed) : proposed;
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

/**
 * La pose qui va le mieux à un segment : l'émotion exacte, sinon une émotion
 * voisine (la plus proche d'abord), sinon une pose neutre ; à égalité, le
 * bon geste, le bon cadrage, puis le bon côté (de face avant le côté
 * opposé). Jamais une pose exclue (la précédente) quand une autre convient.
 * Aucune pose ne convient (seulement des émotions éloignées) : `undefined`.
 */
export function pickPose(kit: BrandKit, query: PoseQuery): BrandAsset | undefined {
  const neighbors = POSE_EMOTION_NEIGHBORS[query.emotion] ?? [];
  const excluded = new Set<string>(typeof query.exclude === "string" ? [query.exclude] : (query.exclude ?? []));
  const ranked = mascotPoses(kit)
    .map((asset, order) => {
      const tags = poseTags(asset);
      const neighbor = neighbors.indexOf(tags.emotion);
      // Rang d'émotion : 0 exacte, 1 à n voisines, n + 1 neutre ; -1 : ne convient pas.
      const rank = tags.emotion === query.emotion ? 0 : neighbor >= 0 ? 1 + neighbor : tags.emotion === "neutral" ? 1 + neighbors.length : -1;
      const side = !query.side ? 0 : tags.facing === query.side ? 0 : tags.facing === "front" ? 1 : 2;
      const score = [rank, query.gesture && tags.gesture !== query.gesture ? 1 : 0, query.framing && tags.framing !== query.framing ? 1 : 0, side, order];
      return { asset, rank, score };
    })
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => {
      for (let index = 0; index < a.score.length; index++) if (a.score[index] !== b.score[index]) return a.score[index] - b.score[index];
      return 0;
    });
  return (ranked.find((entry) => !excluded.has(entry.asset.id)) ?? ranked[0])?.asset;
}

/** Nombre de poses par émotion : la couverture de la bibliothèque. */
export function poseCoverage(kit: BrandKit): Record<PoseEmotion, number> {
  const counts = Object.fromEntries(POSE_EMOTIONS.map((emotion) => [emotion, 0])) as Record<PoseEmotion, number>;
  for (const pose of mascotPoses(kit)) counts[poseTags(pose).emotion]++;
  return counts;
}
