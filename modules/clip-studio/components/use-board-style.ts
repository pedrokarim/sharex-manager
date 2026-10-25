"use client";

import { useEffect, useState } from "react";
import { boardPaletteOf, DEFAULT_BOARD_PALETTE, type BoardPalette } from "../engine/board-palette";
import { TEXT_ROLES } from "../engine/brand";
import type { RoleFonts } from "../engine/illustrate";
import { fetchBrandTheme } from "../lib/client";

export interface BoardStyle {
  palette: BoardPalette;
  fonts: RoleFonts;
}

const DEFAULT_STYLE: BoardStyle = { palette: DEFAULT_BOARD_PALETTE, fonts: {} };
const cache = new Map<string, BoardStyle>();

/**
 * Palette de planche et polices de la marque du projet, pour que ce que l'on
 * illustre à la main parle la même langue que la planche : sans marque, la
 * palette de la planche ; marque introuvable, la même (rien n'est bloqué).
 */
export function useBoardStyle(kitId: string | undefined): BoardStyle {
  const [style, setStyle] = useState<BoardStyle>(() => (kitId && cache.get(kitId)) || DEFAULT_STYLE);
  useEffect(() => {
    if (!kitId) {
      setStyle(DEFAULT_STYLE);
      return;
    }
    const known = cache.get(kitId);
    if (known) {
      setStyle(known);
      return;
    }
    let alive = true;
    fetchBrandTheme(kitId)
      .then((theme) => {
        const fonts: RoleFonts = {};
        for (const role of TEXT_ROLES) {
          const textStyle = theme.textStyles[role];
          if (textStyle) fonts[role] = { font: textStyle.font, weight: textStyle.weight };
        }
        const next = { palette: boardPaletteOf(theme.palette), fonts };
        cache.set(kitId, next);
        if (alive) setStyle(next);
      })
      .catch(() => alive && setStyle(DEFAULT_STYLE));
    return () => {
      alive = false;
    };
  }, [kitId]);
  return style;
}
