import { cache } from "react";
import { themeDb } from "@/lib/theme/theme-db";
import {
  ICON_CONCEPTS,
  ICON_SETS,
  LUCIDE_ICON_SET,
  type IconGlyph,
  type IconSetData,
  type IconSetId,
} from "./registry";

type SetFile = { default: { id: string; icons: Record<string, IconGlyph & { name?: string }> } };

/** Un import statique par jeu : le build les embarque, aucun accès disque à la volée. */
const LOADERS: Record<string, () => Promise<SetFile>> = {
  "fluent-color": () => import("./sets/fluent-color.json"),
  phosphor: () => import("./sets/phosphor.json"),
  "phosphor-duotone": () => import("./sets/phosphor-duotone.json"),
  "solar-linear": () => import("./sets/solar-linear.json"),
  "solar-duotone": () => import("./sets/solar-duotone.json"),
  hugeicons: () => import("./sets/hugeicons.json"),
  fluent: () => import("./sets/fluent.json"),
  "remix-fill": () => import("./sets/remix-fill.json"),
  mingcute: () => import("./sets/mingcute.json"),
  "material-rounded": () => import("./sets/material-rounded.json"),
};

/** Le jeu demandé, réduit à ce que le navigateur dessine (sans les noms Iconify). */
export async function loadIconSet(id: IconSetId): Promise<IconSetData> {
  const loader = LOADERS[id];
  if (id === LUCIDE_ICON_SET || !loader) return { id: LUCIDE_ICON_SET, icons: {} };
  const file = (await loader()).default;
  const icons: IconSetData["icons"] = {};
  for (const concept of ICON_CONCEPTS) {
    const glyph = file.icons[concept];
    if (glyph) icons[concept] = { viewBox: glyph.viewBox, body: glyph.body };
  }
  return { id, icons };
}

/** Le jeu publié, lu une fois par requête. */
export const getActiveIconSet = cache(async (): Promise<IconSetData> => loadIconSet(themeDb.getIconSet()));

/** Tous les jeux, pour l'aperçu de la page du thème. */
export async function loadAllIconSets(): Promise<IconSetData[]> {
  return Promise.all(ICON_SETS.map((set) => loadIconSet(set.id)));
}
