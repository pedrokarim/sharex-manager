/**
 * Formats d'une chaîne (§ 4.3) : bannière, avatar, filigrane, en-tête X,
 * carton de fin, couverture de short.
 *
 * Un format est un projet Clip Studio d'une seule image, construit par une
 * fonction pure à partir de la marque, puis dessiné par `drawFrame` : l'aperçu
 * et le PNG exporté sont la même image, avec les mêmes polices que les vidéos.
 */

import { endCardTracks, themedTextStyle } from "@/modules/clip-studio/engine/brand";
import { uid } from "@/modules/clip-studio/engine/edit";
import type { ClipItem, ClipProject, ImageItem, ShapeItem, TextItem, TextRole, Track, Transform } from "@/modules/clip-studio/engine/types";
import { assetSource, toBrandTheme } from "./theme";
import type { BrandKit, BrandTheme } from "./types";

export type FormatId = "banner" | "avatar" | "watermark" | "x-header" | "endcard-vertical" | "endcard-horizontal" | "short-cover";

export interface FormatSpec {
  id: FormatId;
  label: string;
  width: number;
  height: number;
  note: string;
  /** Zone sûre à dessiner en pointillés dans l'aperçu (jamais dans le PNG), en fractions du cadre. */
  safeArea?: { x: number; y: number; width: number; height: number };
  /** Fond transparent : le PNG garde sa couche alpha. */
  transparent?: boolean;
}

export const FORMATS: FormatSpec[] = [
  {
    id: "banner",
    label: "Bannière YouTube",
    width: 2560,
    height: 1440,
    note: "Zone sûre centrale 1546 × 423 : seule visible sur tous les écrans.",
    safeArea: { x: (2560 - 1546) / 2 / 2560, y: (1440 - 423) / 2 / 1440, width: 1546 / 2560, height: 423 / 1440 },
  },
  { id: "avatar", label: "Avatar", width: 800, height: 800, note: "Recadré en cercle par les plateformes." },
  { id: "watermark", label: "Filigrane YouTube", width: 150, height: 150, note: "PNG transparent, posé par YouTube en haut à droite.", transparent: true },
  {
    id: "x-header",
    label: "En-tête X",
    width: 1500,
    height: 500,
    note: "Le coin bas gauche est caché par l'avatar.",
    safeArea: { x: 0.25, y: 0, width: 0.75, height: 1 },
  },
  { id: "endcard-vertical", label: "Carton de fin 9:16", width: 1080, height: 1920, note: "Le même que celui ajouté aux shorts." },
  { id: "endcard-horizontal", label: "Carton de fin 16:9", width: 1920, height: 1080, note: "Le même que celui ajouté aux vidéos." },
  { id: "short-cover", label: "Couverture de short", width: 1080, height: 1920, note: "Le visuel compte dans le 3:4 central." },
];

/** Zone qu'un rendu doit laisser libre : celle où l'on vérifie que logo et accroche tiennent. */
export const BANNER_SAFE_AREA = FORMATS[0].safeArea!;

function project(spec: FormatSpec, theme: BrandTheme, tracks: Track[]): ClipProject {
  return {
    version: 1,
    id: `format-${spec.id}`,
    name: spec.label,
    aspect: spec.width >= spec.height ? "16:9" : "9:16",
    width: spec.width,
    height: spec.height,
    fps: 30,
    background: spec.transparent ? "rgba(0,0,0,0)" : theme.palette.background,
    tracks,
    createdAt: 0,
    updatedAt: 0,
  };
}

const still = { start: 0, duration: 30, animIn: { kind: "none" as const, frames: 1 }, animOut: { kind: "none" as const, frames: 1 } };
const box = (x: number, y: number, width: number, height: number, opacity = 1): Transform => ({ x, y, width, height, rotation: 0, opacity });
const track = (name: string, item: ClipItem): Track => ({ id: uid("t-"), kind: "visual", name, items: [item] });

function image(source: ImageItem["source"], transform: Transform, fit: ImageItem["fit"] = "contain"): ImageItem {
  return { ...still, id: uid("i-"), type: "image", source, fit, motion: "none", radius: 0, transform };
}

function rect(fill: string, transform: Transform): ShapeItem {
  return { ...still, id: uid("s-"), type: "shape", shape: "rect", fill, radius: 0, transform };
}

function text(theme: BrandTheme, content: string, role: TextRole, size: number, transform: Transform, accent?: number): TextItem {
  return {
    ...still,
    id: uid("x-"),
    type: "text",
    text: content,
    style: themedTextStyle(theme, { role, ...(accent !== undefined ? { accent } : {}) }, { size, align: "center" }),
    // Le nom et l'accroche ont la longueur que la marque leur donne : le texte rétrécit pour rester dans son cadre.
    fit: "shrink",
    transform,
  };
}

const findAsset = (kit: BrandKit, id: string | undefined) => (id ? kit.assets.find((asset) => asset.id === id) : undefined);

/** Logo et nom : le logo s'il existe, sinon le nom de la marque dans la police des titres. */
function brandMark(kit: BrandKit, theme: BrandTheme, transform: Transform, titleSize: number, preferMark = false): ClipItem {
  const asset = (preferMark ? findAsset(kit, kit.markAssetId) : undefined) ?? findAsset(kit, kit.logoAssetId) ?? findAsset(kit, kit.markAssetId);
  return asset ? image(assetSource(kit, asset), transform) : text(theme, kit.name, "title", titleSize, transform);
}

/** Fond d'image de la marque, s'il y en a un, sous un voile du fond pour garder le texte lisible. */
function backdrop(kit: BrandKit, theme: BrandTheme, veil = 0.35): Track[] {
  const background = kit.assets.find((asset) => asset.kind === "background");
  if (!background) return [];
  return [track("Voile", rect(theme.palette.background, box(0.5, 0.5, 1, 1, veil))), track("Fond", image(assetSource(kit, background), box(0.5, 0.5, 1, 1), "cover"))];
}

export interface BuiltFormat {
  spec: FormatSpec;
  project: ClipProject;
  /** Image à dessiner : après les animations d'apparition du carton de fin. */
  frame: number;
}

export function buildFormat(kit: BrandKit, id: FormatId, options: { coverTitle?: string } = {}): BuiltFormat {
  const spec = FORMATS.find((entry) => entry.id === id)!;
  const theme = toBrandTheme(kit);

  switch (id) {
    case "banner": {
      const safe = spec.safeArea!;
      // Logo et accroche dans la zone sûre, centrés.
      const logoHeight = safe.height * (kit.tagline ? 0.58 : 0.8);
      const logoY = safe.y + safe.height * (kit.tagline ? 0.34 : 0.5);
      const tracks: Track[] = [
        track("Logo", brandMark(kit, theme, box(0.5, logoY, safe.width * 0.8, logoHeight), 0.1)),
        ...(kit.tagline ? [track("Accroche", text(theme, kit.tagline, "subtitle", 0.034, box(0.5, safe.y + safe.height * 0.82, safe.width * 0.95, safe.height * 0.24)))] : []),
        ...backdrop(kit, theme),
      ];
      return { spec, project: project(spec, theme, tracks), frame: 0 };
    }
    case "avatar": {
      const tracks = [
        track("Marque", brandMark(kit, theme, box(0.5, 0.5, 0.66, 0.66), 0.16, true)),
        track("Fond", rect(theme.palette.accent, box(0.5, 0.5, 1, 1))),
      ];
      // Sans logo, l'initiale du nom sur l'accent, à l'encre posée sur l'accent.
      const first = tracks[0].items[0];
      if (first.type === "text") {
        first.text = kit.name.trim().charAt(0).toUpperCase() || "?";
        first.style = { ...first.style, size: 0.5, color: theme.palette.onAccent };
        first.transform = box(0.5, 0.5, 0.9, 0.7);
      }
      return { spec, project: project(spec, theme, tracks), frame: 0 };
    }
    case "watermark": {
      return { spec, project: project(spec, theme, [track("Filigrane", brandMark(kit, theme, box(0.5, 0.5, 0.92, 0.92), 0.2, true))]), frame: 0 };
    }
    case "x-header": {
      const tracks: Track[] = [
        track("Logo", brandMark(kit, theme, box(0.62, kit.tagline ? 0.4 : 0.5, 0.5, kit.tagline ? 0.42 : 0.55), 0.16)),
        ...(kit.tagline ? [track("Accroche", text(theme, kit.tagline, "subtitle", 0.07, box(0.62, 0.75, 0.6, 0.18)))] : []),
        ...backdrop(kit, theme),
      ];
      return { spec, project: project(spec, theme, tracks), frame: 0 };
    }
    case "endcard-vertical":
    case "endcard-horizontal": {
      const base = project(spec, theme, []);
      const card = theme.endCard ?? { seconds: 2.5, name: kit.name, tagline: kit.tagline || undefined, callToAction: kit.endCard.callToAction };
      const tracks = endCardTracks(base, { ...theme, endCard: card }, 0);
      const duration = Math.round(card.seconds * base.fps);
      return { spec, project: { ...base, tracks }, frame: Math.min(duration - 1, 24) };
    }
    case "short-cover": {
      const title = options.coverTitle?.trim() || "Titre d’exemple";
      const tracks: Track[] = [
        track("Logo", brandMark(kit, theme, box(0.5, 0.2, 0.42, 0.1), 0.045, true)),
        track("Titre", text(theme, title, "title", 0.075, box(0.5, 0.5, 0.86, 0.3))),
        ...backdrop(kit, theme, 0.45),
      ];
      return { spec, project: project(spec, theme, tracks), frame: 0 };
    }
  }
}
