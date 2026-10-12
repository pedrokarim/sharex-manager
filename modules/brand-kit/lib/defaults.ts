/**
 * Maquette d'une image de marque neuve (§ 3.1) : tout l'aperçu fonctionne dès
 * la première seconde, et l'on remplace ensuite chaque pièce.
 */

import { defaultRoleStyles } from "@/modules/clip-studio/engine/brand";
import type { BrandKit, BrandPalette, TextRole, TextStyle } from "./types";

export const DEFAULT_PALETTE: BrandPalette = {
  background: "#14141c",
  ink: "#f5f5f4",
  surface: "#ffffff",
  onSurface: "#14141c",
  accent: "#8b5cf6",
  accentSecondary: "#facc15",
  onAccent: "#ffffff",
  extras: ["#0ea5e9", "#f97316", "#10b981", "#ec4899"],
};

/** Styles de la maquette : ceux des modèles de Clip Studio, à l'encre de la palette. */
export function defaultTextStyles(palette: BrandPalette = DEFAULT_PALETTE): Record<TextRole, TextStyle> {
  const styles = defaultRoleStyles();
  for (const role of ["title", "subtitle", "caption"] as const) styles[role].color = palette.ink;
  styles.label.color = palette.onAccent;
  styles.body.color = palette.onSurface;
  return styles;
}

export function newKitId(): string {
  return `kit-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function newItemId(prefix: "ast" | "fnt" | "job"): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultKit(name: string, now = Date.now()): BrandKit {
  return {
    version: 1,
    id: newKitId(),
    name,
    tagline: "",
    language: "fr",
    tone: "",
    rules: { always: [], never: [] },
    palette: structuredClone(DEFAULT_PALETTE),
    fonts: [],
    textStyles: defaultTextStyles(),
    assets: [],
    endCard: { enabled: true, seconds: 2.5, callToAction: "Abonne-toi" },
    ai: { styleNotes: "", scriptTone: "" },
    publishing: {
      accountIds: [],
      titleTemplate: "{title}",
      descriptionTemplate: "{hook}\n\n{tags}",
      tags: [],
      categoryId: "24",
      // Rien ne part en public sans un choix explicite.
      defaultPrivacy: "private",
      containsSyntheticMedia: true,
      madeForKids: false,
    },
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
}
