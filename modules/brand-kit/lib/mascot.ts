/**
 * La mascotte dans les formats et les vidéos (dossier 07, § 4.3 et § 5.3).
 *
 * Chaque format peut mettre en scène une pose : celle que la marque a
 * choisie (`mascot.formatPoses`), sinon une proposition tirée des poses
 * elles-mêmes. Le filigrane n'en a jamais. Tout ici est pur : l'aperçu, les
 * exports et le serveur lisent la même réponse.
 */

import { MASCOT_FORMAT_IDS, type BrandAsset, type BrandKit, type FormatId, type MascotFormatId } from "./types";

const isMascotFormat = (id: FormatId): id is MascotFormatId => (MASCOT_FORMAT_IDS as readonly string[]).includes(id);

/** Poses de la mascotte, dans l'ordre de la marque. */
export function mascotPoses(kit: BrandKit): BrandAsset[] {
  const ids = kit.mascot?.poseAssetIds ?? [];
  return ids.map((id) => kit.assets.find((asset) => asset.id === id && asset.kind === "mascot-pose")).filter((asset): asset is BrandAsset => Boolean(asset));
}

/** Ce que dit une pose d'elle-même : son libellé et sa note, sans accents ni casse. */
const words = (asset: BrandAsset) =>
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

const ratio = (asset: BrandAsset) => asset.height / Math.max(1, asset.width);

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
