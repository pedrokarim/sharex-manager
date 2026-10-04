"use client";

import { useAccountPreference } from "@/hooks/use-account-preference";

/** Portée de la préférence, dans les préférences du compte. */
export const GALLERY_DISPLAY_SCOPE = "gallery.display";

/**
 * Éléments visuels de la galerie que chacun allume ou éteint. Ils suivent le
 * compte d'un appareil à l'autre, à la différence des préférences d'affichage
 * historiques, gardées dans le navigateur.
 */
export interface GalleryDisplayPreference extends Record<string, unknown> {
  /** Séparations par jour, à l'intérieur de chaque mois. */
  daySeparators: boolean;
  /** Bandeau « À la une », au-dessus de la galerie. */
  highlights: boolean;
}

export const GALLERY_DISPLAY_DEFAULTS: GalleryDisplayPreference = {
  daySeparators: true,
  highlights: false,
};

export function useGalleryDisplay() {
  return useAccountPreference<GalleryDisplayPreference>(GALLERY_DISPLAY_SCOPE, GALLERY_DISPLAY_DEFAULTS);
}
