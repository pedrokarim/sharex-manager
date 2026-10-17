/**
 * Image de marque appliquée à un projet (module `brand-kit`, dossier 07).
 *
 * Clip Studio ne lit pas la fiche d'une marque : il reçoit un thème déjà
 * résolu (`BrandTheme`), avec des adresses de médias de ce site. Tout ici est
 * pur, sans disque ni réseau : l'éditeur l'applique dans le navigateur (et une
 * annulation la défait), l'assistant sur le serveur.
 *
 * Le thème par défaut (`null`) reproduit exactement le rendu des modèles
 * d'avant les images de marque : retirer une marque rend ce rendu-là.
 */

import { CAPTION_STYLE, TEXT_PRESETS, uid } from "./edit";
import { backdropOf, legibleKaraoke, legibleStyle, opaqueHex, type Backdrop } from "./legibility";
import { getPreset } from "./motion/registry";
import { projectDuration } from "./timeline";
import type { ClipItem, ClipProject, ImageItem, MediaSource, ShapeItem, ShapePattern, TextItem, TextRole, TextStyle, ThemeHint, Track } from "./types";

/** Rôles de couleur, et non une liste anonyme : le moteur sait où mettre chacune. */
export interface BrandPalette {
  /** Fond des plans sans image, fond du projet ; jamais un voile sur une image. */
  background: string;
  /** Texte posé sur le fond (titres, légendes). */
  ink: string;
  /** Cartes et cadres (choix d'un quiz). */
  surface: string;
  /** Texte posé sur une carte. */
  onSurface: string;
  accent: string;
  /** Mise en avant (numéro 1 d'un classement, mot prononcé des sous-titres). */
  accentSecondary?: string;
  /** Texte posé sur l'accent (étiquettes). */
  onAccent: string;
  /** Teintes autorisées en plus, qui varient les segments. */
  extras: string[];
}

export type WatermarkAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Ce que Clip Studio reçoit d'une image de marque. */
export interface BrandTheme {
  kitId: string;
  name: string;
  palette: BrandPalette;
  textStyles: Record<TextRole, TextStyle>;
  /**
   * Trame Riso légère (points d'encre) sur les aplats unis : fond des plans
   * sans image et carton de fin. Jamais sur une image.
   */
  halftone?: boolean;
  /** Polices importées de la marque, à charger avant de dessiner. */
  fonts: { family: string; kitId: string; fontId: string }[];
  watermark?: {
    source: MediaSource;
    anchor: WatermarkAnchor;
    /** Largeur relative au petit côté du cadre. */
    size: number;
    opacity: number;
    /** Marge au bord, relative au petit côté du cadre. */
    margin: number;
    startSeconds: number;
  };
  endCard?: {
    seconds: number;
    logo?: MediaSource;
    name: string;
    tagline?: string;
    callToAction?: string;
    pose?: MediaSource;
    /**
     * Image finie du carton, importée dans la marque pour une orientation :
     * elle remplace la composition, posée telle quelle sur tout le cadre.
     */
    images?: { vertical?: MediaSource; horizontal?: MediaSource };
  };
  /**
   * Mascotte dans le montage, hors carton de fin. Absente : rien n'est posé,
   * le rendu est celui d'une marque sans mascotte.
   */
  mascot?: {
    /** Pose qui accompagne l'accroche du début. */
    opening?: MediaSource;
    /** Poses des réactions, une par segment, à tour de rôle ; vide : aucune réaction. */
    reactions: MediaSource[];
  };
}

export const TEXT_ROLES: readonly TextRole[] = ["title", "subtitle", "caption", "label", "body"];

/** Couleurs d'accent du thème par défaut, une par segment : chaque question a sa teinte. */
export const DEFAULT_ACCENTS = ["#8b5cf6", "#0ea5e9", "#f97316", "#10b981", "#ec4899", "#eab308"];

const DEFAULT_HIGHLIGHT = "#facc15";
/** Vert de l'explication d'un quiz : il dit « juste », pas « marque ». */
const SUCCESS_TEXT = "#bbf7d0";

function preset(id: string): TextStyle {
  const found = TEXT_PRESETS.find((entry) => entry.id === id) ?? TEXT_PRESETS[0];
  return structuredClone(found.style);
}

/** Styles par rôle du thème par défaut : ceux que posaient les modèles avant les marques. */
export function defaultRoleStyles(): Record<TextRole, TextStyle> {
  return {
    title: preset("impact"),
    subtitle: preset("caption"),
    caption: preset("caption"),
    label: { ...preset("boxed"), color: "#ffffff", background: { color: DEFAULT_ACCENTS[0], padding: 0.4, radius: 0.35 } },
    body: { ...preset("clean"), font: "Poppins", weight: 700, color: "#111111" },
  };
}

const DEFAULT_ROLE_STYLES = defaultRoleStyles();

// ─── Couleurs ────────────────────────────────────────────────────

/** Assombrit (valeur négative) ou éclaircit une couleur hexadécimale. */
export function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    const target = amount < 0 ? 0 : 255;
    return Math.round(c + (target - c) * Math.abs(amount));
  };
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** Teintes tournantes : celles de la marque, sinon celles du thème par défaut. */
export function accentList(theme: BrandTheme | null): string[] {
  if (!theme) return DEFAULT_ACCENTS;
  const { accent, accentSecondary, extras } = theme.palette;
  return [accent, ...(accentSecondary ? [accentSecondary] : []), ...extras];
}

export function accentOf(theme: BrandTheme | null, index = 0): string {
  const list = accentList(theme);
  return list[((index % list.length) + list.length) % list.length];
}

export function highlightOf(theme: BrandTheme | null): string {
  return theme ? theme.palette.accentSecondary ?? theme.palette.accent : DEFAULT_HIGHLIGHT;
}

/** Couleur d'une forme selon sa peinture, ou `null` quand la forme garde la sienne. */
export function paintFill(theme: BrandTheme | null, hint: ThemeHint): string | null {
  switch (hint.paint) {
    case "accent":
      return accentOf(theme, hint.accent ?? 0);
    case "plate":
      return theme ? theme.palette.background : shade(accentOf(null, hint.accent ?? 0), -0.55);
    case "veil":
      // Une marque ne voile plus les images : elles restent éclatantes, et
      // chaque texte porte sa propre étiquette ou son contour (`legibility.ts`).
      return theme ? TRANSPARENT : "#000000";
    case "shadow":
      return "#000000";
    case "surface":
      return theme ? theme.palette.surface : "#ffffff";
    case "highlight":
      return highlightOf(theme);
    default:
      return null;
  }
}

/**
 * Style complet d'un texte selon son rôle. La taille et l'alignement tiennent
 * à la place du texte dans le modèle : ils restent ceux de l'élément.
 */
export function themedTextStyle(theme: BrandTheme | null, hint: ThemeHint, keep: Pick<TextStyle, "size" | "align">): TextStyle {
  const role = hint.role ?? "caption";
  const style: TextStyle = structuredClone((theme ? theme.textStyles : DEFAULT_ROLE_STYLES)[role] ?? DEFAULT_ROLE_STYLES[role]);
  style.size = keep.size;
  style.align = keep.align;

  if (role === "label") {
    const padding = style.background?.padding ?? 0.4;
    const radius = style.background?.radius ?? 0.35;
    if (hint.accent !== undefined) {
      style.color = theme ? theme.palette.onAccent : "#ffffff";
      style.background = { color: accentOf(theme, hint.accent), padding, radius };
    } else {
      // Étiquette neutre (« Avant ») : sur le fond, pas sur une teinte.
      style.color = theme ? theme.palette.ink : "#ffffff";
      style.background = { color: theme ? theme.palette.background : "#27272a", padding, radius };
    }
  } else if (role === "body") {
    style.color = theme ? theme.palette.onSurface : "#111111";
  }
  if (hint.paint === "highlight") style.color = highlightOf(theme);
  if (hint.paint === "success") style.color = SUCCESS_TEXT;
  return style;
}

/** Couleur d'un voile retiré : la forme reste dans la timeline, sans rien couvrir. */
const TRANSPARENT = "rgba(0,0,0,0)";

/** Trame d'une marque qui en veut une, sur un aplat uni ; `null` sinon. */
export function halftoneOf(theme: BrandTheme | null): ShapePattern | null {
  if (!theme?.halftone) return null;
  return { kind: "dots", color: theme.palette.ink, opacity: 0.07, spacing: 0.024 };
}

// ─── Application ─────────────────────────────────────────────────

function restyle(item: ClipItem, theme: BrandTheme | null): ClipItem {
  if (item.type === "text" && item.karaoke) {
    const caption = theme ? theme.textStyles.caption : CAPTION_STYLE;
    return {
      ...item,
      style: { ...item.style, font: caption.font, weight: caption.weight, color: caption.color, stroke: caption.stroke ? { ...caption.stroke } : null },
      karaoke: { ...item.karaoke, highlight: highlightOf(theme) },
    };
  }
  if (!item.theme) return item;
  if (item.type === "text" && item.theme.role) {
    // `fit` vient de la lisibilité d'une marque (`applyLegibility`) : sans marque, le texte reprend sa mise en page d'origine.
    const { fit: _fit, ...rest } = item;
    return { ...rest, style: themedTextStyle(theme, item.theme, item.style) };
  }
  if (item.type === "shape") {
    const fill = paintFill(theme, item.theme);
    const pattern = item.theme.paint === "plate" ? halftoneOf(theme) : null;
    if (!fill && !pattern && !item.pattern) return item;
    const next: ShapeItem = { ...item, ...(fill ? { fill } : {}) };
    if (pattern) next.pattern = pattern;
    else delete next.pattern;
    return next;
  }
  return item;
}

/** Arrondi des étiquettes de la marque, repris par celles que pose le moteur. */
function labelRadius(theme: BrandTheme): number | undefined {
  return theme.textStyles.label?.background?.radius;
}

/**
 * Lisibilité garantie de chaque texte habillé par la marque (rôle d'un
 * modèle ou sous-titres karaoké) : étiquette, contour ou couleur, selon ce
 * qu'il y a dessous (`legibility.ts`). Les textes posés à la main et ceux de
 * la marque (carton de fin, déjà traités) ne bougent pas.
 */
export function applyLegibility(project: ClipProject, theme: BrandTheme): ClipProject {
  const tracks = project.tracks.map((track, trackIndex) => {
    if (track.kind !== "visual") return track;
    let changed = false;
    const items = track.items.map((item) => {
      if (item.type !== "text" || item.origin === "brand") return item;
      if (item.karaoke) {
        const fixed = legibleKaraoke(item.style, item.karaoke.highlight, theme.palette);
        changed = true;
        return { ...item, style: fixed.style, karaoke: { ...item.karaoke, highlight: fixed.highlight } };
      }
      if (!item.theme?.role) return item;
      changed = true;
      const backdrop: Backdrop = backdropOf(project, trackIndex, item);
      const keepColor = item.theme.paint === "success" || item.theme.paint === "highlight";
      const style = legibleStyle(item.style, backdrop, theme.palette, { role: item.theme.role, labelRadius: labelRadius(theme), keepColor });
      // Un titre dans une police de marque plus large, avec la marge de son étiquette, ne déborde jamais de
      // sa place (il chevaucherait le texte suivant). Les autres textes gardent leur taille : un texte courant
      // rétréci se lirait moins bien qu'un texte qui prend une ligne de plus.
      return item.theme.role === "title" ? { ...item, style, fit: "shrink" as const } : { ...item, style };
    });
    return changed ? { ...track, items } : track;
  });
  return { ...project, tracks };
}

/** Retire ce qu'une marque a ajouté : éléments, puis pistes devenues vides. */
function stripBrand(tracks: Track[]): Track[] {
  return tracks
    .map((track) => ({ ...track, items: track.items.filter((item) => item.origin !== "brand") }))
    .filter((track) => track.origin !== "brand" || track.items.length > 0)
    .map((track) => (track.origin === "brand" ? { ...track, origin: undefined } : track));
}

function brandTrack(name: string, items: ClipItem[]): Track {
  return { id: uid("t-"), kind: "visual", name, origin: "brand", items };
}

/** Taille d'un média en pixels, carrée quand elle est inconnue. */
function aspectOf(source: MediaSource): number {
  return source.width && source.height ? source.height / source.width : 1;
}

/** Filigrane : un logo dans un coin, du début choisi jusqu'au carton de fin. */
export function watermarkItem(project: ClipProject, theme: BrandTheme, start: number, end: number): ImageItem | null {
  const mark = theme.watermark;
  if (!mark || end - start < 1) return null;
  const { width: W, height: H } = project;
  const short = Math.min(W, H);
  const widthPx = Math.max(8, mark.size * short);
  const heightPx = widthPx * aspectOf(mark.source);
  const margin = mark.margin * short;
  const left = mark.anchor.endsWith("left");
  const top = mark.anchor.startsWith("top");
  return {
    id: uid("i-"),
    type: "image",
    origin: "brand",
    label: "Filigrane",
    start,
    duration: end - start,
    source: mark.source,
    fit: "contain",
    motion: "none",
    radius: 0,
    transform: {
      x: left ? (margin + widthPx / 2) / W : 1 - (margin + widthPx / 2) / W,
      y: top ? (margin + heightPx / 2) / H : 1 - (margin + heightPx / 2) / H,
      width: widthPx / W,
      height: heightPx / H,
      rotation: 0,
      opacity: Math.min(1, Math.max(0.05, mark.opacity)),
    },
    animIn: { kind: "fade", frames: 8 },
    animOut: { kind: "none", frames: 6 },
  };
}

/**
 * Carton de fin : aplat du fond, logo (ou nom de la marque en titre),
 * accroche, appel à l'action en étiquette, pose de la mascotte. Chaque couche
 * a sa piste : une piste ne porte qu'un élément à la fois. Les formats du
 * module `brand-kit` utilisent la même fonction.
 */
export function endCardTracks(project: ClipProject, theme: BrandTheme, start: number): Track[] {
  const card = theme.endCard;
  if (!card) return [];
  const duration = Math.max(1, Math.round(card.seconds * project.fps));
  const vertical = project.height >= project.width;
  const base = { start, duration, origin: "brand" as const };
  const fade = (frames: number) => ({ kind: "fade" as const, frames });

  const plate: ShapeItem = {
    ...base,
    id: uid("s-"),
    type: "shape",
    shape: "rect",
    fill: theme.palette.background,
    radius: 0,
    ...(halftoneOf(theme) ? { pattern: halftoneOf(theme)! } : {}),
    label: "Fond du carton de fin",
    transform: { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 },
    animIn: fade(8),
    animOut: { kind: "none", frames: 6 },
  };

  const text = (content: string, role: TextRole, y: number, size: number, hint: ThemeHint = {}): TextItem => ({
    ...base,
    id: uid("x-"),
    type: "text",
    text: content,
    style: cardTextStyle(theme, role, hint, { size, align: "center" }),
    // Nom, accroche et appel viennent de la marque : un texte long rétrécit au lieu de déborder.
    fit: "shrink",
    transform: { x: 0.5, y, width: 0.86, height: role === "title" ? 0.2 : 0.12, rotation: 0, opacity: 1 },
    animIn: { kind: "pop", frames: 10 },
    animOut: { kind: "none", frames: 6 },
  });

  const layers: { name: string; item: ClipItem }[] = [];
  const image = vertical ? card.images?.vertical : card.images?.horizontal;
  if (image) {
    // Carton fini importé : posé tel quel, sur tout le cadre.
    layers.push({
      name: "Fin – image",
      item: {
        ...base,
        id: uid("i-"),
        type: "image",
        source: image,
        fit: "cover",
        motion: "none",
        radius: 0,
        transform: { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 },
        animIn: fade(8),
        animOut: { kind: "none", frames: 6 },
      },
    });
    layers.push({ name: "Fin – fond", item: plate });
    return layers.map((layer) => brandTrack(layer.name, [layer.item]));
  }
  if (vertical && card.pose) {
    // Mise en scène du carton vertical avec la mascotte : le nom en bloc sur deux lignes en haut à gauche,
    // l'accroche et l'appel dessous, la mascotte en grand dans le bas du cadre.
    for (const layer of posedEndCardLayers(project, theme, card, card.pose, base)) layers.push(layer);
    layers.push({ name: "Fin – fond", item: plate });
    return layers.map((layer) => brandTrack(layer.name, [layer.item]));
  }
  const hasPose = Boolean(card.pose);
  if (card.callToAction) {
    layers.push({ name: "Fin – appel", item: text(card.callToAction, "label", vertical ? (hasPose ? 0.6 : 0.68) : 0.74, vertical ? 0.032 : 0.045, { accent: 0 }) });
  }
  if (card.tagline) {
    layers.push({ name: "Fin – accroche", item: text(card.tagline, "subtitle", vertical ? (hasPose ? 0.48 : 0.54) : 0.58, vertical ? 0.034 : 0.05) });
  }
  if (card.logo) {
    const width = vertical ? 0.56 : 0.3;
    const height = Math.min(vertical ? 0.24 : 0.36, (width * project.width * aspectOf(card.logo)) / project.height);
    layers.push({
      name: "Fin – logo",
      item: {
        ...base,
        id: uid("i-"),
        type: "image",
        source: card.logo,
        fit: "contain",
        motion: "none",
        radius: 0,
        transform: { x: 0.5, y: vertical ? (hasPose ? 0.28 : 0.34) : 0.34, width, height, rotation: 0, opacity: 1 },
        animIn: { kind: "pop", frames: 12 },
        animOut: { kind: "none", frames: 6 },
      },
    });
  } else {
    layers.push({ name: "Fin – logo", item: text(card.name, "title", vertical ? (hasPose ? 0.3 : 0.36) : 0.36, vertical ? 0.07 : 0.1) });
  }
  if (card.pose) {
    layers.push({
      name: "Fin – mascotte",
      item: {
        ...base,
        id: uid("i-"),
        type: "image",
        source: card.pose,
        fit: "contain",
        motion: "none",
        radius: 0,
        transform: vertical
          ? { x: 0.5, y: 0.84, width: 0.7, height: 0.3, rotation: 0, opacity: 1 }
          : { x: 0.86, y: 0.62, width: 0.26, height: 0.7, rotation: 0, opacity: 1 },
        animIn: { kind: "slide-up", frames: 12 },
        animOut: { kind: "none", frames: 6 },
      },
    });
  }
  layers.push({ name: "Fin – fond", item: plate });
  return layers.map((layer) => brandTrack(layer.name, [layer.item]));
}

/** Texte du carton de fin : posé sur l'aplat du fond, lisible sur lui. */
function cardTextStyle(theme: BrandTheme, role: TextRole, hint: ThemeHint, keep: Pick<TextStyle, "size" | "align">): TextStyle {
  const style = themedTextStyle(theme, { role, ...hint }, keep);
  const plate: Backdrop = { kind: "flat", colors: [opaqueHex(theme.palette.background) ?? "#000000"] };
  return legibleStyle(style, plate, theme.palette, { role, labelRadius: labelRadius(theme) });
}

/**
 * Nom coupé sur deux lignes, pour le bloc du carton de fin : à l'espace la
 * plus proche du milieu, sinon au milieu du mot. Un nom court reste entier.
 */
export function splitBrandName(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length < 5) return clean;
  const middle = clean.length / 2;
  const spaces = [...clean].map((char, index) => (char === " " ? index : -1)).filter((index) => index > 0);
  if (spaces.length > 0) {
    const cut = spaces.reduce((best, index) => (Math.abs(index - middle) < Math.abs(best - middle) ? index : best), spaces[0]);
    return `${clean.slice(0, cut)}\n${clean.slice(cut + 1)}`;
  }
  const cut = Math.ceil(clean.length / 2);
  return `${clean.slice(0, cut)}\n${clean.slice(cut)}`;
}

type CardBase = { start: number; duration: number; origin: "brand" };

/** Couches du carton vertical mis en scène avec la mascotte, de la plus haute à la plus basse. */
function posedEndCardLayers(project: ClipProject, theme: BrandTheme, card: NonNullable<BrandTheme["endCard"]>, pose: MediaSource, base: CardBase) {
  const left = 80 / 1080;
  const width = 1 - left * 2;
  const leftText = (content: string, role: TextRole, y: number, height: number, size: number, hint: ThemeHint = {}): TextItem => ({
    ...base,
    id: uid("x-"),
    type: "text",
    text: content,
    style: cardTextStyle(theme, role, hint, { size, align: "left" }),
    fit: "shrink",
    transform: { x: left + width / 2, y, width, height, rotation: 0, opacity: 1 },
    animIn: { kind: "pop", frames: 10 },
    animOut: { kind: "none", frames: 6 },
  });
  const layers: { name: string; item: ClipItem }[] = [];
  if (card.callToAction) {
    const cta = leftText(card.callToAction, "label", 0.375, 0.04, 0.024, { accent: 0 });
    // L'étiquette se mesure à son texte : elle part du bord gauche du bloc.
    cta.transform = { ...cta.transform, width: 0.62, x: left + 0.31 };
    layers.push({ name: "Fin – appel", item: cta });
  }
  if (card.tagline) layers.push({ name: "Fin – accroche", item: leftText(card.tagline, "subtitle", 0.322, 0.04, 44 / 1920) });
  layers.push({ name: "Fin – logo", item: leftText(splitBrandName(card.name), "title", 0.19, 0.22, 190 / 1920) });

  // La mascotte en pied, centrée, du dessous de l'appel au bas du cadre.
  const top = card.callToAction ? 0.405 : 0.307;
  let height = Math.min(0.665, 0.985 - top);
  let poseWidth = (height * project.height) / aspectOf(pose) / project.width;
  if (poseWidth > 0.8) {
    poseWidth = 0.8;
    height = (poseWidth * project.width * aspectOf(pose)) / project.height;
  }
  layers.push({
    name: "Fin – mascotte",
    item: {
      ...base,
      id: uid("i-"),
      type: "image",
      source: pose,
      fit: "contain",
      motion: "none",
      radius: 0,
      transform: { x: 0.5, y: top + height / 2, width: poseWidth, height, rotation: 0, opacity: 1 },
      animIn: { kind: "slide-up", frames: 12 },
      animOut: { kind: "none", frames: 6 },
    },
  });
  return layers;
}

// ─── Mascotte dans le montage ────────────────────────────────────

/**
 * Zone visible d'un short 9:16, en fractions du cadre 1080 × 1920 : les
 * mêmes valeurs que la zone de sécurité de l'aperçu (`preview-stage.tsx`).
 * En haut le nom du compte, en bas la légende, à droite sous la moitié les
 * boutons.
 */
export const SHORT_SAFE_ZONE = { top: 230 / 1920, bottom: 1440 / 1920, buttonsTop: 900 / 1920, buttonsLeft: 850 / 1080 };

/** Rectangle en fractions du cadre. */
export interface FrameBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const isShort = (project: ClipProject) => Math.abs(project.height / project.width - 16 / 9) < 0.02;

/** Où une pose de la mascotte peut aller : la zone visible, moins ce que cache l'interface. */
export function mascotArea(project: ClipProject): { area: FrameBox; blocked: FrameBox[] } {
  if (isShort(project)) {
    const { top, bottom, buttonsTop, buttonsLeft } = SHORT_SAFE_ZONE;
    return { area: { left: 0.03, right: 0.97, top, bottom }, blocked: [{ left: buttonsLeft, right: 1, top: buttonsTop, bottom: 1 }] };
  }
  const short = Math.min(project.width, project.height);
  const mx = (0.04 * short) / project.width;
  const my = (0.04 * short) / project.height;
  return { area: { left: mx, right: 1 - mx, top: my, bottom: 1 - my }, blocked: [] };
}

/**
 * Place qu'occupe un texte, estimée sans le dessiner (la fonction reste pure) :
 * la longueur de ses lignes à la taille de sa police, bornée par son cadre.
 */
function textExtent(item: TextItem, project: ClipProject): FrameBox {
  const { transform: t, style } = item;
  const W = project.width;
  const H = project.height;
  const boxWidth = t.width * W;
  const fontPx = style.size * H;
  const charPx = fontPx * (style.uppercase ? 0.68 : 0.58) + style.letterSpacing * fontPx;
  const padding = style.background ? style.background.padding * fontPx * 2 : 0;
  const paragraphs = item.karaoke ? [item.text.split(/\s+/).slice(0, item.karaoke.groupSize).join(" ")] : item.text.split("\n");
  let lines = 0;
  let widest = 0;
  for (const paragraph of paragraphs) {
    const width = paragraph.length * charPx;
    lines += Math.max(1, Math.ceil(width / Math.max(1, boxWidth - padding)));
    widest = Math.max(widest, Math.min(boxWidth, width + padding));
  }
  const height = item.fit === "shrink" ? t.height * H : Math.max(t.height * H, lines * fontPx * style.lineHeight + padding);
  const width = widest / W;
  const left = style.align === "left" ? t.x - t.width / 2 : style.align === "right" ? t.x + t.width / 2 - width : t.x - width / 2;
  return { left, right: left + width, top: t.y - height / H / 2, bottom: t.y + height / H / 2 };
}

/** Ce que le montage montre entre deux instants : textes, cadres, images, sauf les fonds plein cadre. */
function contentBoxes(project: ClipProject, start: number, end: number): FrameBox[] {
  const boxes: FrameBox[] = [];
  for (const track of project.tracks) {
    if (track.kind !== "visual" || track.hidden) continue;
    for (const item of track.items) {
      if (item.type === "audio" || item.origin === "brand") continue;
      if (item.start >= end || item.start + item.duration <= start) continue;
      const t = item.transform;
      if (t.opacity <= 0.02 || (t.width >= 0.95 && t.height >= 0.95)) continue;
      boxes.push(
        item.type === "text"
          ? textExtent(item, project)
          : { left: t.x - t.width / 2, right: t.x + t.width / 2, top: t.y - t.height / 2, bottom: t.y + t.height / 2 }
      );
    }
  }
  return boxes;
}

const GAP = 0.008;
const overlaps = (a: FrameBox, b: FrameBox) => a.left < b.right + GAP && a.right > b.left - GAP && a.top < b.bottom + GAP && a.bottom > b.top - GAP;

/**
 * Premier emplacement libre pour une pose : la plus grande des hauteurs
 * proposées, du côté préféré, en partant du bas. `null` quand rien ne tient
 * sans masquer le contenu : la pose n'est alors pas posée.
 */
export function findMascotSpot(
  project: ClipProject,
  source: MediaSource,
  start: number,
  end: number,
  options: { heights: number[]; sides: ("left" | "right" | "center")[] }
): FrameBox | null {
  const { area, blocked } = mascotArea(project);
  const obstacles = [...blocked, ...contentBoxes(project, start, end)];
  const ratio = aspectOf(source);
  for (const height of options.heights) {
    const width = (height * project.height) / ratio / project.width;
    if (width > area.right - area.left || height > area.bottom - area.top) continue;
    for (const side of options.sides) {
      const left = side === "left" ? area.left : side === "right" ? area.right - width : 0.5 - width / 2;
      // Hauteurs candidates : le bas de la zone, puis juste sous ou juste au-dessus de chaque obstacle.
      const tops = [area.bottom - height, ...obstacles.flatMap((obstacle) => [obstacle.bottom + GAP + 1e-6, obstacle.top - GAP - 1e-6 - height])]
        .filter((top) => top >= area.top - 1e-9 && top + height <= area.bottom + 1e-9)
        .sort((a, b) => b - a);
      for (const top of tops) {
        const box = { left, right: left + width, top, bottom: top + height };
        if (!obstacles.some((obstacle) => overlaps(box, obstacle))) return box;
      }
    }
  }
  return null;
}

/**
 * Segments du montage : les plans de la piste principale (un fond par
 * segment dans les modèles). Sans piste principale, aucun segment.
 */
function contentSegments(project: ClipProject, end: number): { start: number; end: number }[] {
  const starts = new Map<number, number>();
  for (const track of project.tracks) {
    if (track.kind !== "visual" || track.origin === "brand" || !/^Principale( \d+)?$/.test(track.name)) continue;
    for (const item of track.items) {
      if (item.origin === "brand" || item.start >= end) continue;
      starts.set(item.start, Math.max(starts.get(item.start) ?? 0, Math.min(end, item.start + item.duration)));
    }
  }
  return [...starts.entries()].sort((a, b) => a[0] - b[0]).map(([start, stop]) => ({ start, end: stop }));
}

function presetFrames(id: string, fps: number, fallback: number): number {
  const preset = getPreset(id, "in");
  return preset ? Math.max(1, Math.round((preset.durationMs / 1000) * fps)) : fallback;
}

/** Préréglages du registre : la pose d'ouverture monte en grandissant, une réaction surgit du bas avec un rebond. */
export const MASCOT_OPENING_ANIM = "rise-grow";
export const MASCOT_REACTION_ANIM = "surge-up";

function mascotItem(project: ClipProject, source: MediaSource, box: FrameBox, start: number, end: number, label: string, anim: string): ImageItem {
  return {
    id: uid("i-"),
    type: "image",
    origin: "brand",
    label,
    start,
    duration: end - start,
    source,
    fit: "contain",
    motion: "none",
    radius: 0,
    transform: { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, width: box.right - box.left, height: box.bottom - box.top, rotation: 0, opacity: 1 },
    animIn: { kind: anim, frames: presetFrames(anim, project.fps, 14) },
    animOut: { kind: "fade", frames: 6 },
  };
}

/**
 * Mascotte posée par la marque dans le montage : une pose qui accompagne
 * l'accroche du premier segment, puis une petite pose dans un coin à chaque
 * segment suivant, une autre à chaque fois. Chaque pose va là où elle ne
 * masque aucun texte ni aucun cadre, dans la zone visible d'un short ; si
 * rien ne tient, elle n'est pas posée. Rien sans `theme.mascot`.
 */
export function mascotTracks(project: ClipProject, theme: BrandTheme, contentEnd: number): Track[] {
  const mascot = theme.mascot;
  if (!mascot || contentEnd < project.fps) return [];
  const segments = contentSegments(project, contentEnd);
  const tracks: Track[] = [];
  const vertical = project.height > project.width;

  if (mascot.opening) {
    const first = segments[0] ?? { start: 0, end: Math.min(contentEnd, Math.round(3 * project.fps)) };
    const start = first.start + 4;
    if (first.end - start >= project.fps) {
      const box = findMascotSpot(project, mascot.opening, start, first.end, {
        heights: vertical ? [0.3, 0.26, 0.22, 0.18, 0.15] : [0.5, 0.42, 0.36, 0.3],
        sides: ["center", "right", "left"],
      });
      if (box) tracks.push(brandTrack("Mascotte – ouverture", [mascotItem(project, mascot.opening, box, start, first.end, "Mascotte – ouverture", MASCOT_OPENING_ANIM)]));
    }
  }

  if (mascot.reactions.length > 0) {
    const items: ImageItem[] = [];
    // L'ouverture a son segment ; les réactions prennent les suivants.
    segments.slice(1).forEach((segment, index) => {
      const source = mascot.reactions[index % mascot.reactions.length];
      const start = segment.start + 6;
      if (segment.end - start < project.fps) return;
      const box = findMascotSpot(project, source, start, segment.end, {
        heights: vertical ? [0.16, 0.13, 0.11, 0.09, 0.075] : [0.3, 0.25, 0.2, 0.16, 0.13],
        sides: ["right", "left"],
      });
      if (box) items.push(mascotItem(project, source, box, start, segment.end, "Mascotte – réaction", MASCOT_REACTION_ANIM));
    });
    if (items.length > 0) tracks.push(brandTrack("Mascotte – réactions", items));
  }
  return tracks;
}

/**
 * Applique une image de marque, la remplace, ou la retire (`null`).
 *
 * Appliquer deux fois la même marque donne le même projet (aux identifiants
 * près des éléments ajoutés) : tout ce que la marque a posé est d'abord
 * retiré. Les éléments posés à la main ne sont jamais restylés : seuls ceux
 * qui portent une indication de modèle (`theme`) et les sous-titres karaoké
 * suivent la marque.
 */
export function applyBrandTheme(project: ClipProject, theme: BrandTheme | null): ClipProject {
  const restyled = stripBrand(project.tracks).map((track) => ({ ...track, items: track.items.map((item) => restyle(item, theme)) }));
  // Avec une marque, chaque texte reçoit une lisibilité garantie ; sans, il garde exactement son rendu.
  const tracks = theme ? applyLegibility({ ...project, tracks: restyled, background: theme.palette.background }, theme).tracks : restyled;
  const base: ClipProject = {
    ...project,
    tracks,
    background: theme ? theme.palette.background : "#000000",
    updatedAt: Date.now(),
  };
  if (theme) base.brandKitId = theme.kitId;
  else delete base.brandKitId;
  if (!theme) return base;

  const contentEnd = projectDuration(base);
  const mark = theme.watermark
    ? watermarkItem(base, theme, Math.min(contentEnd - 1, Math.round(theme.watermark.startSeconds * base.fps)), contentEnd)
    : null;
  // Le filigrane passe au-dessus de tout. Le carton de fin ne chevauche
  // rien : ses pistes vont sous les pistes visuelles du montage, pour ne pas
  // repousser celles-ci au bas de la timeline.
  const card = endCardTracks(base, theme, contentEnd);
  const lastVisual = tracks.reduce((found, track, index) => (track.kind === "visual" ? index : found), -1);
  const ordered = [...tracks.slice(0, lastVisual + 1), ...card, ...tracks.slice(lastVisual + 1)];
  // La mascotte passe au-dessus du montage, à des places où elle ne masque rien.
  const mascot = mascotTracks(base, theme, contentEnd);
  return { ...base, tracks: [...(mark ? [brandTrack("Filigrane", [mark])] : []), ...mascot, ...ordered] };
}
