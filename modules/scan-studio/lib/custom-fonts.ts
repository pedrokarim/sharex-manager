/**
 * Catalogue des polices, sans rien de propre au navigateur : la liste des
 * polices fournies, la façon de nommer une police ajoutée, et de quoi savoir
 * lesquelles une page utilise. Le serveur, l'atelier et les tests s'en servent
 * tels quels ; le chargement dans le navigateur est dans `fonts.ts`.
 */

import {
  CUSTOM_FONT_PREFIX,
  DEFAULT_STYLES,
  REGION_KINDS,
  isId,
  type ChapterSettings,
  type CustomFont,
  type RegionKind,
  type ScanRegion,
  type TextStyle,
} from "./types";

export interface LetteringFont {
  family: string;
  weights: number[];
  /** La police a une vraie italique ; sinon le navigateur la penche. */
  italic: boolean;
  /** À quoi elle sert le plus souvent. */
  usage: string;
}

/** Polices embarquées avec l'application (`@fontsource`), toutes sous licence libre (OFL). */
export const BUNDLED_FONTS: LetteringFont[] = [
  { family: "Comic Neue", weights: [400, 700], italic: true, usage: "Dialogue" },
  { family: "Patrick Hand", weights: [400], italic: false, usage: "Pensée, récitatif" },
  { family: "Bangers", weights: [400], italic: false, usage: "Cri, onomatopée" },
  { family: "Anton", weights: [400], italic: false, usage: "Titre, onomatopée" },
  { family: "Montserrat", weights: [600, 800], italic: false, usage: "Texte du décor" },
];

export function isBundledFamily(family: string): boolean {
  return BUNDLED_FONTS.some((font) => font.family === family);
}

/** Famille CSS d'une police ajoutée. Stable : renommer la police ne la change pas. */
export function customFontFamily(id: string): string {
  return `${CUSTOM_FONT_PREFIX}${id}`;
}

/** Identifiant d'une police ajoutée d'après sa famille CSS ; `null` pour toute autre famille. */
export function customFontId(family: string): string | null {
  if (typeof family !== "string" || !family.startsWith(CUSTOM_FONT_PREFIX)) return null;
  const id = family.slice(CUSTOM_FONT_PREFIX.length);
  return isId(id) ? id : null;
}

/**
 * Nom à afficher pour une famille : celui de la police ajoutée, le nom de la
 * police fournie, ou, pour une police ajoutée qui n'existe plus, une mention
 * qui le dit au lieu d'un identifiant.
 */
export function fontLabel(family: string, custom: readonly Pick<CustomFont, "family" | "name">[]): string {
  const added = custom.find((font) => font.family === family);
  if (added) return added.name;
  return customFontId(family) ? "Police retirée" : family;
}

/** La famille désigne une police ajoutée qui n'est plus dans la liste. */
export function isMissingFont(family: string, custom: readonly Pick<CustomFont, "family">[]): boolean {
  return customFontId(family) !== null && !custom.some((font) => font.family === family);
}

/** Familles réellement dessinées sur une page : le style de chaque zone, surcharges comprises. */
export function usedFontFamilies(regions: readonly ScanRegion[], settings: ChapterSettings): Set<string> {
  const families = new Set<string>();
  for (const region of regions) {
    const family = region.text.style?.font ?? (settings.styles[region.kind] ?? DEFAULT_STYLES[region.kind]).font;
    if (family) families.add(family);
  }
  return families;
}

/** Familles citées par une table de styles. */
export function styleTableFamilies(styles: Partial<Record<RegionKind, TextStyle>>): Set<string> {
  const families = new Set<string>();
  for (const kind of REGION_KINDS) {
    const family = styles[kind]?.font;
    if (family) families.add(family);
  }
  return families;
}

// ─── Table des styles d'un dossier (§ 8 du dossier) ──────────────

/** Une ligne de la table : un registre de texte, et les types de zone qui le suivent. */
export interface StyleRow {
  id: "dialogue" | "shout" | "thought" | "sfx";
  label: string;
  hint: string;
  kinds: RegionKind[];
}

/** Une police par registre, tenue sur toute la série : dialogue, cri, pensée et récitatif, onomatopée. */
export const STYLE_ROWS: StyleRow[] = [
  { id: "dialogue", label: "Dialogue", hint: "Les bulles de parole, et le texte du décor.", kinds: ["dialogue", "background"] },
  { id: "shout", label: "Cri, emphase", hint: "Les bulles éclatées, les mots appuyés.", kinds: ["shout"] },
  { id: "thought", label: "Pensée, récitatif", hint: "Les bulles de pensée et les cartouches.", kinds: ["thought", "narration"] },
  { id: "sfx", label: "Onomatopée", hint: "Les bruits posés sur le dessin, avec leur contour.", kinds: ["sfx"] },
];

/** Police d'une ligne de la table, lue sur le premier type de zone qu'elle couvre. */
export function styleRowFont(styles: Partial<Record<RegionKind, TextStyle>>, row: StyleRow): string {
  return (styles[row.kinds[0]] ?? DEFAULT_STYLES[row.kinds[0]]).font;
}

/**
 * Table de styles où la police d'une ligne a changé. La graisse suit la
 * police : `resolveWeight` rend la graisse disponible la plus proche. Tous les
 * types de zone ont un style en sortie, même ceux que le dossier n'avait pas.
 */
export function withStyleRowFont(
  styles: Partial<Record<RegionKind, TextStyle>>,
  row: StyleRow,
  family: string,
  resolveWeight: (family: string, weight: number) => number = (_, weight) => weight,
): Record<RegionKind, TextStyle> {
  const next = {} as Record<RegionKind, TextStyle>;
  for (const kind of REGION_KINDS) {
    const style = styles[kind] ?? DEFAULT_STYLES[kind];
    next[kind] = row.kinds.includes(kind) ? { ...style, font: family, weight: resolveWeight(family, style.weight) } : style;
  }
  return next;
}

/** Remplace une famille par une autre dans toute une table de styles ; rend la même table si rien ne change. */
export function replaceFamilyInStyles(styles: Record<RegionKind, TextStyle>, from: string, to: string): Record<RegionKind, TextStyle> {
  let changed = false;
  const next = { ...styles };
  for (const kind of Object.keys(styles) as RegionKind[]) {
    if (styles[kind]?.font === from) {
      next[kind] = { ...styles[kind], font: to };
      changed = true;
    }
  }
  return changed ? next : styles;
}

/** Remplace une famille par une autre dans les zones d'une page ; rend la même liste si rien ne change. */
export function replaceFamilyInRegions(regions: ScanRegion[], from: string, to: string): ScanRegion[] {
  let changed = false;
  const next = regions.map((region) => {
    if (region.text.style?.font !== from) return region;
    changed = true;
    return { ...region, text: { ...region.text, style: { ...region.text.style, font: to } } };
  });
  return changed ? next : regions;
}
