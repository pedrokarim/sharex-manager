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
import { projectDuration } from "./timeline";
import type { ClipItem, ClipProject, ImageItem, MediaSource, ShapeItem, TextItem, TextRole, TextStyle, ThemeHint, Track } from "./types";

/** Rôles de couleur, et non une liste anonyme : le moteur sait où mettre chacune. */
export interface BrandPalette {
  /** Fond des plans sans image, voile posé sur les images, fond du projet. */
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
      return theme ? theme.palette.background : "#000000";
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
    return { ...item, style: themedTextStyle(theme, item.theme, item.style) };
  }
  if (item.type === "shape") {
    const fill = paintFill(theme, item.theme);
    return fill ? { ...item, fill } : item;
  }
  return item;
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
    style: themedTextStyle(theme, { role, ...hint }, { size, align: "center" }),
    // Nom, accroche et appel viennent de la marque : un texte long rétrécit au lieu de déborder.
    fit: "shrink",
    transform: { x: 0.5, y, width: 0.86, height: role === "title" ? 0.2 : 0.12, rotation: 0, opacity: 1 },
    animIn: { kind: "pop", frames: 10 },
    animOut: { kind: "none", frames: 6 },
  });

  const layers: { name: string; item: ClipItem }[] = [];
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
  const tracks = stripBrand(project.tracks).map((track) => ({ ...track, items: track.items.map((item) => restyle(item, theme)) }));
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
  return { ...base, tracks: mark ? [brandTrack("Filigrane", [mark]), ...ordered] : ordered };
}
