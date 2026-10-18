/**
 * Ce que Clip Studio reçoit d'une marque (§ 5.3) : un thème résolu, avec des
 * adresses de médias de ce site, sans le reste de la fiche.
 */

import type { MediaSource } from "@/modules/clip-studio/engine/types";
import { readPace } from "@/modules/clip-studio/engine/rhythm";
import { formatImageAsset, mascotPoses, openingPose, poseTags } from "./mascot";
import { repairTypography } from "./typography";
import { MODULE_NAME, kitAssetUrl, type BrandAsset, type BrandKit, type BrandTheme } from "./types";

export function assetSource(kit: BrandKit, asset: BrandAsset): MediaSource {
  return {
    url: kitAssetUrl(kit.id, asset.file),
    ref: `module:${MODULE_NAME}/kits/${kit.id}/assets/${asset.file}`,
    name: asset.label,
    kind: "image",
    width: asset.width,
    height: asset.height,
  };
}

const findAsset = (kit: BrandKit, id: string | undefined) => (id ? kit.assets.find((asset) => asset.id === id) : undefined);

/** Logo du filigrane : celui choisi, sinon la marque réduite, sinon le logo principal. */
export function watermarkAsset(kit: BrandKit): BrandAsset | undefined {
  return findAsset(kit, kit.watermark?.assetId) ?? findAsset(kit, kit.markAssetId) ?? findAsset(kit, kit.logoAssetId);
}

export function toBrandTheme(kit: BrandKit): BrandTheme {
  const logo = findAsset(kit, kit.logoAssetId);
  const mark = kit.watermark ? findAsset(kit, kit.watermark.assetId) : undefined;
  const pose = findAsset(kit, kit.endCard.poseAssetId);
  const cardImages = endCardImages(kit);
  const mascot = mascotTheme(kit);
  return {
    kitId: kit.id,
    name: kit.name,
    palette: structuredClone(kit.palette),
    // Jamais de monospace dans un rôle de texte, même choisie dans l'éditeur sans être enregistrée.
    textStyles: structuredClone(repairTypography(kit).textStyles),
    ...(kit.halftone ? { halftone: true } : {}),
    // Rythme du montage des clips créés avec la marque (D3) : « normal » tant qu'il n'est pas réglé.
    pace: readPace(kit.pace) ?? "normal",
    // Style relevé sur une vidéo de référence (D4) : suivi seulement au rythme « measured ».
    ...(kit.measuredStyle ? { measuredStyle: structuredClone(kit.measuredStyle) } : {}),
    fonts: kit.fonts.map((font) => ({ family: font.family, kitId: kit.id, fontId: font.id })),
    watermark:
      kit.watermark && mark
        ? {
            source: assetSource(kit, mark),
            anchor: kit.watermark.anchor,
            size: kit.watermark.size,
            opacity: kit.watermark.opacity,
            margin: kit.watermark.margin,
            startSeconds: kit.watermark.startSeconds,
          }
        : undefined,
    endCard: kit.endCard.enabled
      ? {
          seconds: kit.endCard.seconds,
          logo: logo ? assetSource(kit, logo) : undefined,
          name: kit.name,
          tagline: kit.tagline || undefined,
          callToAction: kit.endCard.callToAction,
          pose: pose ? assetSource(kit, pose) : undefined,
          ...(cardImages ? { images: cardImages } : {}),
        }
      : undefined,
    ...(mascot ? { mascot } : {}),
  };
}

/** Images finies des cartons de fin, à leur orientation ; absentes : la composition. */
function endCardImages(kit: BrandKit): NonNullable<BrandTheme["endCard"]>["images"] | undefined {
  const vertical = formatImageAsset(kit, "endcard-vertical");
  const horizontal = formatImageAsset(kit, "endcard-horizontal");
  if (!vertical && !horizontal) return undefined;
  return { ...(vertical ? { vertical: assetSource(kit, vertical) } : {}), ...(horizontal ? { horizontal: assetSource(kit, horizontal) } : {}) };
}

/**
 * Présence de la mascotte dans le montage ; rien quand elle est éteinte ou
 * sans pose. Avec les réactions, la bibliothèque étiquetée part avec le
 * thème : le moteur choisit la pose de chaque segment d'après son émotion.
 */
function mascotTheme(kit: BrandKit): BrandTheme["mascot"] {
  const presence = kit.mascot?.presence;
  const poses = mascotPoses(kit);
  if (!presence || poses.length === 0 || (!presence.opening && !presence.reactions)) return undefined;
  const opening = presence.opening ? openingPose(kit) : undefined;
  return {
    ...(opening ? { opening: assetSource(kit, opening) } : {}),
    reactions: presence.reactions ? poses.map((pose) => assetSource(kit, pose)) : [],
    ...(presence.reactions ? { library: poses.map((pose) => ({ id: pose.id, source: assetSource(kit, pose), tags: poseTags(pose) })) } : {}),
  };
}
