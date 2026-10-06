import { Brush, Hand, MousePointer2, Pentagon, Pipette, Square, type LucideIcon } from "lucide-react";
import type { MaskShape, RegionKind } from "../../lib/types";

export type Tool = "select" | "rect" | "polygon" | "brush" | "eyedropper" | "hand";

/** `side` : l'original à gauche, la traduction à droite. */
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
    id: "brush",
    label: "Pinceau de masque",
    shortcut: "B",
    icon: Brush,
    hint: "Peignez pour étendre le masque de la zone sélectionnée, dans sa couleur.",
  },
  {
    id: "eyedropper",
    label: "Pipette",
    shortcut: "I",
    icon: Pipette,
    hint: "Cliquez sur la page pour donner cette couleur au masque de la zone sélectionnée.",
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
  translated: "Traduit",
  side: "Côte à côte",
};

export const KIND_LABELS: Record<RegionKind, string> = {
  dialogue: "Dialogue",
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

/** L'événement vient-il d'un champ de saisie ? Les raccourcis à une touche s'y taisent. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== "string") return false;
  return element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);
}
