/**
 * Polices d'une marque (dossier 07 sexies, étape D1) : une police de titre,
 * et une police de texte lisible pour le reste (sous-titre, légende,
 * étiquette, texte sur carte).
 *
 * Une police monospace (Courier, « Mono », « Code »…) ne peut pas être la
 * police de texte : elle ne sert qu'à un texte de code. Une marque qui en
 * avait une pour ses textes reçoit à la lecture une police de texte lisible,
 * avec un avertissement que l'éditeur affiche jusqu'au prochain
 * enregistrement.
 */

import { DEFAULT_TEXT_FONT, FONTS, isCatalogTextFont, nearestCatalogWeight } from "@/modules/clip-studio/lib/font-catalog";
import type { BrandKit, TextRole, TextStyle } from "./types";

/** Rôles qui prennent la police de texte ; le titre garde la sienne. */
export const TEXT_FONT_ROLES: readonly TextRole[] = ["subtitle", "caption", "label", "body"];

export const TEXT_ROLE_LABELS: Record<TextRole, string> = {
  title: "Titre",
  subtitle: "Sous-titre",
  caption: "Légende",
  label: "Étiquette",
  body: "Texte sur carte",
};

/**
 * Noms de polices à chasse fixe : Courier, « Mono » (Roboto Mono, Space
 * Mono…, mais pas Monoton), « Code » (Fira Code, Source Code Pro…),
 * Consolas, Menlo, Monaco, machine à écrire, terminal, Inconsolata, OCR.
 */
const MONOSPACE_NAME = /(courier|\bmono(?!ton)|mono\b|monospace|\bcode\b|consolas|menlo|monaco|typewriter|terminal|inconsolata|\bocr[- ]?[ab]\b)/i;

/** Nom (ou fichier) d'une police à chasse fixe. */
export function isMonospaceName(name: string): boolean {
  return MONOSPACE_NAME.test(name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2"));
}

/** Famille à chasse fixe : une police importée dont le nom ou le fichier le dit. Le catalogue n'en a aucune. */
export function isMonospaceFamily(kit: Pick<BrandKit, "fonts">, family: string): boolean {
  const font = kit.fonts.find((entry) => entry.family === family);
  if (font) return isMonospaceName(font.name) || isMonospaceName(font.file);
  return !FONTS.some((entry) => entry.family === family) && isMonospaceName(family);
}

/** Nom affiché d'une famille : catalogue, police importée, ou la famille telle quelle. */
export function fontDisplayName(kit: Pick<BrandKit, "fonts">, family: string): string {
  return FONTS.find((font) => font.family === family)?.label ?? kit.fonts.find((font) => font.family === family)?.name ?? family;
}

/**
 * Police de texte de la marque : celle d'un rôle de texte qui n'est ni une
 * monospace ni la police du titre (sauf police de texte du catalogue),
 * sinon Poppins, présente sans réseau.
 */
export function textFontOf(kit: Pick<BrandKit, "fonts" | "textStyles">): string {
  const title = kit.textStyles.title?.font;
  for (const role of TEXT_FONT_ROLES) {
    const font = kit.textStyles[role]?.font;
    if (!font || isMonospaceFamily(kit, font)) continue;
    if (isCatalogTextFont(font)) return font;
    if (font !== title && kit.fonts.some((entry) => entry.family === font)) return font;
  }
  return DEFAULT_TEXT_FONT;
}

export interface TypographyRepair {
  textStyles: Record<TextRole, TextStyle>;
  /** Rôles dont la police monospace a été remplacée, et cette police. */
  replaced: { role: TextRole; from: string }[];
  /** Police de texte posée à leur place. */
  textFont: string;
}

/** Remplace la police monospace des rôles de texte par la police de texte de la marque. */
export function repairTypography(kit: Pick<BrandKit, "fonts" | "textStyles">): TypographyRepair {
  const textFont = textFontOf(kit);
  const textStyles = { ...kit.textStyles };
  const replaced: TypographyRepair["replaced"] = [];
  for (const role of TEXT_FONT_ROLES) {
    const style = textStyles[role];
    if (!style || !isMonospaceFamily(kit, style.font)) continue;
    replaced.push({ role, from: style.font });
    textStyles[role] = { ...style, font: textFont, weight: nearestCatalogWeight(textFont, style.weight), letterSpacing: Math.min(style.letterSpacing, 0.02) };
  }
  return { textStyles, replaced, textFont };
}

/** Avertissement d'une réparation, en français, ou `undefined` s'il n'y a rien eu à réparer. */
export function repairNotice(kit: Pick<BrandKit, "fonts">, repair: TypographyRepair): string | undefined {
  if (repair.replaced.length === 0) return undefined;
  const fonts = [...new Set(repair.replaced.map((entry) => fontDisplayName(kit, entry.from)))].map((name) => `« ${name} »`);
  const roles = repair.replaced.map((entry) => TEXT_ROLE_LABELS[entry.role].toLocaleLowerCase("fr"));
  const what = fonts.length > 1 ? `${fonts.join(", ")} sont des polices monospace : elles ne servent qu’au code.` : `${fonts[0]} est une police monospace : elle ne sert qu’au code.`;
  const verb = roles.length > 1 ? "prennent" : "prend";
  return `${what} ${capitalize(roles.join(", "))} ${verb} désormais ${fontDisplayName(kit, repair.textFont)}, une police de texte lisible.`;
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);

/** Avertissements de typographie d'une fiche, pour l'éditeur. */
export function typographyWarnings(kit: Pick<BrandKit, "fonts" | "textStyles">, measuredMonospace: ReadonlySet<string> = new Set()): string[] {
  const warnings: string[] = [];
  for (const role of TEXT_FONT_ROLES) {
    const family = kit.textStyles[role]?.font;
    if (!family) continue;
    const name = `« ${fontDisplayName(kit, family)} »`;
    if (isMonospaceFamily(kit, family)) {
      warnings.push(`${TEXT_ROLE_LABELS[role]} : ${name} est une police monospace, réservée au code. Les vidéos utilisent ${fontDisplayName(kit, textFontOf(kit))} à la place.`);
    } else if (measuredMonospace.has(family)) {
      warnings.push(`${TEXT_ROLE_LABELS[role]} : ${name} a toutes ses lettres de la même largeur, comme une police de code. Choisissez une police de texte (Poppins, Inter, Montserrat ou une police importée lisible).`);
    }
  }
  return warnings;
}
