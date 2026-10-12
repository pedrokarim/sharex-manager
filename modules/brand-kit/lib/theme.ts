/**
 * Ce que Clip Studio reçoit d'une marque (§ 5.3) : un thème résolu, avec des
 * adresses de médias de ce site, sans le reste de la fiche.
 */

import type { MediaSource } from "@/modules/clip-studio/engine/types";
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
  return {
    kitId: kit.id,
    name: kit.name,
    palette: structuredClone(kit.palette),
    textStyles: structuredClone(kit.textStyles),
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
        }
      : undefined,
  };
}
