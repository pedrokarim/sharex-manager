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
import type { ClipItem, ClipProject, ImageItem, MediaSource, ShapeItem, TextItem, TextRole, TextStyle, Track, Transform } from "@/modules/clip-studio/engine/types";
import { formatImageAsset, formatPose } from "./mascot";
import { assetSource, toBrandTheme } from "./theme";
import type { BrandAsset, BrandKit, BrandTheme, FormatId } from "./types";

export type { FormatId } from "./types";

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

function text(theme: BrandTheme, content: string, role: TextRole, size: number, transform: Transform, accent?: number, align: TextStyle["align"] = "center"): TextItem {
  return {
    ...still,
    id: uid("x-"),
    type: "text",
    text: content,
    style: themedTextStyle(theme, { role, ...(accent !== undefined ? { accent } : {}) }, { size, align }),
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
  /** Image finie importée : le format est cette image, telle quelle, et l'export la reprend sans la redessiner. */
  supplied?: BrandAsset;
  /** Pose de la mascotte mise en scène. */
  pose?: BrandAsset;
}

// ─── Mise en scène avec la mascotte ──────────────────────────────

/**
 * Les deux encres de la mise en scène : la première (l'accent) pour la
 * trame derrière la mascotte, la seconde pour les aplats et les croix.
 */
function inks(theme: BrandTheme) {
  return { first: theme.palette.accent, second: theme.palette.accentSecondary ?? theme.palette.ink };
}

/** Image vectorielle de décor, dessinée par le navigateur comme n'importe quelle image. */
function svgSource(svg: string, name: string, width: number, height: number): MediaSource {
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, ref: `decor:${name}`, name, kind: "image", width, height };
}

/**
 * Trame d'imprimerie : des points d'une encre sur une grille, en disque ou
 * en aplat, à la taille où elle est posée (en pixels du format). Les
 * couleurs viennent de la palette, déjà contrôlées (`#rrggbb`).
 */
export function halftone(color: string, widthPx: number, heightPx: number, dotPx: number, shape: "disc" | "rect"): MediaSource {
  const width = Math.round(widthPx);
  const height = Math.round(heightPx);
  const half = (dotPx / 2).toFixed(2);
  const radius = (dotPx * 0.283).toFixed(2);
  const clip = shape === "disc" ? `<clipPath id="c"><ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}"/></clipPath>` : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><pattern id="d" width="${dotPx}" height="${dotPx}" patternUnits="userSpaceOnUse"><circle cx="${half}" cy="${half}" r="${radius}" fill="${color}"/></pattern>${clip}</defs>` +
    `<rect width="${width}" height="${height}" fill="url(#d)"${shape === "disc" ? ' clip-path="url(#c)"' : ""}/></svg>`;
  return svgSource(svg, "Trame", width, height);
}

/** Croix de repérage d'imprimeur : un cercle et deux traits. */
export function registrationMark(color: string, sizePx: number): MediaSource {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 22 22">` +
    `<circle cx="11" cy="11" r="6" fill="none" stroke="${color}" stroke-width="1.4"/><path d="M11 0v22M0 11h22" stroke="${color}" stroke-width="1.4"/></svg>`;
  return svgSource(svg, "Croix de repérage", sizePx, sizePx);
}

/** Rectangle donné en pixels du format (bord gauche, haut, largeur, hauteur). */
const px = (spec: FormatSpec, left: number, top: number, width: number, height: number, opacity = 1): Transform =>
  box((left + width / 2) / spec.width, (top + height / 2) / spec.height, width / spec.width, height / spec.height, opacity);

const ratioOf = (asset: BrandAsset) => asset.height / Math.max(1, asset.width);

/**
 * Logo calé en haut à gauche d'un cadre en pixels, à sa proportion ; sans
 * logo, le nom au style des titres. Rend aussi le bas réellement occupé.
 */
function leftMark(kit: BrandKit, theme: BrandTheme, spec: FormatSpec, left: number, top: number, maxWidth: number, maxHeight: number, titlePx: number) {
  const asset = findAsset(kit, kit.logoAssetId) ?? findAsset(kit, kit.markAssetId);
  if (asset) {
    let width = maxWidth;
    let height = width * ratioOf(asset);
    if (height > maxHeight) {
      height = maxHeight;
      width = height / ratioOf(asset);
    }
    return { item: image(assetSource(kit, asset), px(spec, left, top, width, height)) as ClipItem, bottom: top + height };
  }
  return { item: text(theme, kit.name, "title", titlePx / spec.height, px(spec, left, top, maxWidth, maxHeight), undefined, "left") as ClipItem, bottom: top + maxHeight };
}

/** Croix de repérage, quand la marque les veut, aux positions données en pixels. */
const markTracks = (kit: BrandKit, theme: BrandTheme, spec: FormatSpec, sizePx: number, positions: [number, number][]): Track[] =>
  kit.registrationMarks
    ? positions.map(([left, top], index) => track(`Repère ${index + 1}`, image(registrationMark(inks(theme).second, sizePx), px(spec, left, top, sizePx, sizePx))))
    : [];

/**
 * Bannière mise en scène : le logo et l'accroche à gauche dans la zone sûre,
 * la mascotte accoudée au bandeau du bas, à droite, sur un disque tramé, un
 * second disque pâle en haut à gauche. Le visage tient dans la zone sûre ;
 * bandeau et disques n'apparaissent en entier que sur télé.
 */
function posedBanner(kit: BrandKit, theme: BrandTheme, spec: FormatSpec, pose: BrandAsset): Track[] {
  const { first, second } = inks(theme);
  const mark = leftMark(kit, theme, spec, 570, 600, 760, 200, 180);
  const ratio = ratioOf(pose);
  let width = 1000;
  let height = width * ratio;
  if (height > 688) {
    height = 688;
    width = height / ratio;
  }
  // Une pose large s'accoude au bandeau ; une pose haute descend pour garder le visage dans la zone sûre.
  const top = ratio <= 1 ? 1060 - height : 440;
  return [
    ...markTracks(kit, theme, spec, 44, [
      [530, 530],
      [1986, 530],
    ]),
    track("Logo", mark.item),
    ...(kit.tagline ? [track("Accroche", text(theme, kit.tagline, "subtitle", 40 / 1440, px(spec, 570, mark.bottom + 30, 820, 56), undefined, "left"))] : []),
    track("Mascotte", image(assetSource(kit, pose), px(spec, 1920 - width / 2, top, width, height))),
    track("Trame du bandeau", image(halftone(first, 2960, 430, 26, "rect"), px(spec, -200, 1010, 2960, 430, 0.55))),
    track("Bandeau", rect(second, px(spec, 0, 1010, 2560, 430))),
    track("Disque tramé", image(halftone(first, 1180, 1180, 30, "disc"), px(spec, 1260, 120, 1180, 1180))),
    track("Second disque", image(halftone(second, 900, 900, 34, "disc"), px(spec, 160, -380, 900, 900, 0.55))),
    ...backdrop(kit, theme),
  ];
}

/**
 * Avatar mis en scène : le portrait cadré sur la tête et les épaules, par
 * le haut, sur un disque tramé et le papier de la marque. Une pose en pied
 * est agrandie pour que le visage se lise encore à 40 px.
 */
function posedAvatar(kit: BrandKit, theme: BrandTheme, spec: FormatSpec, pose: BrandAsset): Track[] {
  const ratio = ratioOf(pose);
  const width = 820 * Math.max(1, Math.sqrt(ratio / 1.03));
  return [
    track("Mascotte", image(assetSource(kit, pose), px(spec, 400 - width / 2, 40, width, width * ratio))),
    track("Disque tramé", image(halftone(inks(theme).first, 700, 700, 26, "disc"), px(spec, 50, 50, 700, 700))),
    ...backdrop(kit, theme),
  ];
}

/**
 * En-tête X mis en scène : le logo et l'accroche en haut à gauche, la
 * mascotte en pied à droite sur un disque tramé. Le bas gauche, caché par
 * l'avatar, ne porte rien.
 */
function posedXHeader(kit: BrandKit, theme: BrandTheme, spec: FormatSpec, pose: BrandAsset): Track[] {
  const ratio = ratioOf(pose);
  let height = 980;
  let width = height / ratio;
  if (width > 640) {
    width = 640;
    height = width * ratio;
  }
  const mark = leftMark(kit, theme, spec, 250, 92, 540, 150, 140);
  return [
    track("Logo", mark.item),
    ...(kit.tagline ? [track("Accroche", text(theme, kit.tagline, "subtitle", 28 / 500, px(spec, 250, mark.bottom + 22, 560, 40), undefined, "left"))] : []),
    track("Mascotte", image(assetSource(kit, pose), px(spec, 1500 - 20 - width, -40, width, height))),
    track("Disque tramé", image(halftone(inks(theme).first, 900, 900, 20, "disc"), px(spec, 760, -120, 900, 900))),
    ...backdrop(kit, theme),
  ];
}

/** Couverture de short avec la mascotte : logo et titre en haut, la pose dans le bas du 3:4 central. */
function posedShortCover(kit: BrandKit, theme: BrandTheme, spec: FormatSpec, pose: BrandAsset, title: string): Track[] {
  const ratio = ratioOf(pose);
  let height = 760;
  let width = height / ratio;
  if (width > 900) {
    width = 900;
    height = width * ratio;
  }
  const bottom = 1680;
  return [
    track("Logo", brandMark(kit, theme, box(0.5, 0.16, 0.42, 0.09), 0.045, true)),
    track("Titre", text(theme, title, "title", 0.07, box(0.5, 0.33, 0.86, 0.22))),
    track("Mascotte", image(assetSource(kit, pose), px(spec, 540 - width / 2, bottom - height, width, height))),
    track("Disque tramé", image(halftone(inks(theme).first, 1000, 1000, 30, "disc"), px(spec, 40, bottom - height / 2 - 500, 1000, 1000))),
    ...backdrop(kit, theme, 0.45),
  ];
}

/**
 * Projet d'un format : l'image finie importée s'il y en a une, sinon le
 * rendu composé depuis la marque, avec la pose de la mascotte réglée pour ce
 * format. Sans pose, le rendu est celui du logo seul.
 */
export function buildFormat(kit: BrandKit, id: FormatId, options: { coverTitle?: string } = {}): BuiltFormat {
  const spec = FORMATS.find((entry) => entry.id === id)!;
  const theme = toBrandTheme(kit);

  const supplied = formatImageAsset(kit, id);
  if (supplied) {
    return { spec, project: project(spec, theme, [track("Image finie", image(assetSource(kit, supplied), box(0.5, 0.5, 1, 1), "cover"))]), frame: 0, supplied };
  }
  const pose = formatPose(kit, id);
  if (pose && id !== "endcard-vertical" && id !== "endcard-horizontal") {
    const tracks =
      id === "banner"
        ? posedBanner(kit, theme, spec, pose)
        : id === "avatar"
          ? posedAvatar(kit, theme, spec, pose)
          : id === "x-header"
            ? posedXHeader(kit, theme, spec, pose)
            : posedShortCover(kit, theme, spec, pose, options.coverTitle?.trim() || "Titre d’exemple");
    return { spec, project: project(spec, theme, tracks), frame: 0, pose };
  }

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
      // Le format montre la composition : une image finie de carton passe par `supplied`, plus haut.
      const composed = theme.endCard ?? { seconds: 2.5, name: kit.name, tagline: kit.tagline || undefined, callToAction: kit.endCard.callToAction };
      const card = { ...composed, images: undefined, pose: pose ? assetSource(kit, pose) : undefined };
      let tracks = endCardTracks(base, { ...theme, endCard: card }, 0);
      if (pose && id === "endcard-vertical") {
        // Comme sur la planche : un disque tramé sous la mascotte, le papier de la marque, et les croix de repérage aux quatre coins.
        const disc = track("Disque tramé", image(halftone(inks(theme).first, 1100, 1100, 34, "disc"), px(spec, -10, 760, 1100, 1100)));
        const plate = tracks.length - 1;
        tracks = [
          ...markTracks(kit, theme, spec, 48, [
            [30, 30],
            [1002, 30],
            [30, 1842],
            [1002, 1842],
          ]),
          ...tracks.slice(0, plate),
          disc,
          ...backdrop(kit, theme),
          ...tracks.slice(plate),
        ];
      }
      const duration = Math.round(card.seconds * base.fps);
      return { spec, project: { ...base, tracks }, frame: Math.min(duration - 1, 24), ...(pose ? { pose } : {}) };
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
