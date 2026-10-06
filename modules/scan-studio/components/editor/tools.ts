import { AudioLines, Brush, Hand, MousePointer2, Pentagon, Pipette, Square, type LucideIcon } from "lucide-react";
import type { MaskShape, RegionKind, RegionMask } from "../../lib/types";

export type Tool = "select" | "rect" | "polygon" | "sfx" | "brush" | "eyedropper" | "hand";

/** `side` : l'original à gauche, la traduction à droite. */
export type ViewMode = "original" | "translated" | "side";

export interface ToolDefinition {
  id: Tool;
  label: string;
  /** Touche qui active l'outil. */
  shortcut: string;
  icon: LucideIcon;
  /** Mode d'emploi, affiché sous la scène tant que l'outil est actif. */
  hint: string;
}

export const TOOLS: ToolDefinition[] = [
  {
    id: "select",
    label: "Sélection",
    shortcut: "V",
    icon: MousePointer2,
    hint: "Cliquez une zone pour la sélectionner, glissez son texte pour le déplacer. Alt + glisser agit sur le contour d’origine.",
  },
  {
    id: "rect",
    label: "Zone rectangulaire",
    shortcut: "R",
    icon: Square,
    hint: "Glissez autour du texte d’origine pour créer une zone.",
  },
  {
    id: "polygon",
    label: "Zone libre",
    shortcut: "P",
    icon: Pentagon,
    hint: "Cliquez pour poser les points du contour. Entrée ou double-clic pour fermer, Échap pour annuler.",
  },
  {
    id: "sfx",
    label: "Onomatopée",
    shortcut: "S",
    icon: AudioLines,
    hint: "Glissez sur le dessin, là où poser le bruit. Rien n’est masqué : le texte se pose sur l’image, avec son contour.",
  },
  {
    id: "brush",
    label: "Pinceau de masque",
    shortcut: "B",
    icon: Brush,
    hint: "Peignez pour étendre le masque de la zone sélectionnée.",
  },
  {
    id: "eyedropper",
    label: "Pipette",
    shortcut: "I",
    icon: Pipette,
    hint: "Cliquez sur la page pour donner cette couleur au masque de la zone sélectionnée. Échap pour renoncer.",
  },
  {
    id: "hand",
    label: "Main",
    shortcut: "H",
    icon: Hand,
    hint: "Glissez pour déplacer la page. La barre d’espace fait de même avec n’importe quel outil.",
  },
];

export const VIEW_LABELS: Record<ViewMode, string> = {
  original: "Original",
  translated: "Version traduite",
  side: "Côte à côte",
};

export const KIND_LABELS: Record<RegionKind, string> = {
  dialogue: "Dialogue",
  shout: "Cri, emphase",
  thought: "Pensée",
  narration: "Récitatif",
  sfx: "Onomatopée",
  background: "Texte du décor",
};

export const MASK_SHAPE_LABELS: Record<MaskShape, string> = {
  rect: "Rectangle",
  rounded: "Rectangle arrondi",
  ellipse: "Ellipse",
  outline: "Contour du texte",
};

/** Ce que le masque fait de l'original : rien, un aplat, ou le fond reconstruit. */
export const MASK_KIND_LABELS: Record<RegionMask["kind"], string> = {
  fill: "Aplat de couleur",
  inpaint: "Fond reconstruit",
  none: "Aucun masque",
};

export const MASK_KIND_ORDER: RegionMask["kind"][] = ["fill", "inpaint", "none"];

/** L'événement vient-il d'un champ de saisie ? Les raccourcis à une touche s'y taisent. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== "string") return false;
  return element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);
}
