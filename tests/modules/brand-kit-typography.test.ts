import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/modules/clip-studio/engine/legibility";
import { FONTS, isCatalogTextFont } from "@/modules/clip-studio/lib/font-catalog";
import { createDefaultKit, defaultTextStyles, DEFAULT_PALETTE, upgradeKit } from "@/modules/brand-kit/lib/defaults";
import { toBrandTheme } from "@/modules/brand-kit/lib/theme";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import { isMonospaceFamily, isMonospaceName, repairTypography, TEXT_FONT_ROLES, textFontOf, typographyWarnings } from "@/modules/brand-kit/lib/typography";
import { sanitizeKit } from "@/modules/brand-kit/lib/validate";

/**
 * Polices d'une marque (dossier 07 sexies, D1) : une police de titre, une
 * police de texte lisible ; jamais de monospace hors code.
 */

const TITLE = "bk-kit-typo0001-fnt-title01";
const MONO = "bk-kit-typo0001-fnt-mono001";

/** Marque d'essai : titre importé, textes dans une monospace importée (le cas relevé sur de vrais exports). */
function monoKit(): BrandKit {
  const kit = createDefaultKit("Marque d'essai", 1000);
  kit.id = "kit-typo0001";
  kit.fonts = [
    { id: "fnt-title01", name: "Display Black", family: TITLE, file: "fnt-title01.woff2", format: "woff2", size: 1000 },
    { id: "fnt-mono001", name: "Courier Prime Bold", family: MONO, file: "fnt-mono001.woff2", format: "woff2", size: 1000 },
  ];
  kit.textStyles.title = { ...kit.textStyles.title, font: TITLE, weight: 400 };
  for (const role of ["subtitle", "label", "body"] as const) kit.textStyles[role] = { ...kit.textStyles[role], font: MONO, weight: 700, letterSpacing: 0.2 };
  kit.textStyles.caption = { ...kit.textStyles.caption, font: TITLE, weight: 400 };
  return kit;
}

describe("polices monospace", () => {
  it("se reconnaissent à leur nom", () => {
    for (const name of ["Courier Prime Bold", "Courier New", "Roboto Mono", "SpaceMono-Bold", "JetBrainsMono-Regular", "Fira Code", "Source Code Pro", "Consolas", "IBM Plex Mono", "Inconsolata"]) {
      expect(isMonospaceName(name), name).toBe(true);
    }
    for (const name of ["Archivo Black", "Poppins", "Monoton", "Montserrat", "Codec Pro", "Inter", "Bebas Neue"]) {
      expect(isMonospaceName(name), name).toBe(false);
    }
  });

  it("aucune police du catalogue n'en est une", () => {
    const kit = monoKit();
    expect(FONTS.some((font) => isMonospaceFamily(kit, font.family))).toBe(false);
    expect(isMonospaceFamily(kit, MONO)).toBe(true);
    expect(isMonospaceFamily(kit, TITLE)).toBe(false);
  });
});

describe("police de texte", () => {
  it("une monospace ne peut pas être la police de texte, ni la police du titre la remplacer", () => {
    expect(textFontOf(monoKit())).toBe("Poppins");
    const kit = monoKit();
    kit.textStyles.caption = { ...kit.textStyles.caption, font: "Inter", weight: 600 };
    expect(textFontOf(kit)).toBe("Inter");
  });

  it("la réparation pose la police de texte sur les rôles en monospace, titre intact", () => {
    const kit = monoKit();
    const repair = repairTypography(kit);
    expect(repair.replaced.map((entry) => entry.role).sort()).toEqual(["body", "label", "subtitle"]);
    for (const role of ["subtitle", "label", "body"] as const) {
      expect(repair.textStyles[role].font).toBe("Poppins");
      expect(FONTS.find((font) => font.family === "Poppins")!.weights).toContain(repair.textStyles[role].weight);
      expect(repair.textStyles[role].letterSpacing).toBeLessThanOrEqual(0.02);
    }
    expect(repair.textStyles.title).toEqual(kit.textStyles.title);
    // La légende n'était pas en monospace : la réparation ne la touche pas.
    expect(repair.textStyles.caption.font).toBe(TITLE);
  });

  it("migration douce : à la lecture, police lisible et avertissement, jamais enregistré", () => {
    const upgraded = upgradeKit(monoKit());
    for (const role of ["subtitle", "label", "body"] as const) expect(upgraded.textStyles[role].font).toBe("Poppins");
    expect(upgraded.typographyNotice).toContain("Courier Prime Bold");
    expect(upgraded.typographyNotice).toContain("Poppins");
    // Relire une fiche déjà réparée ne réavertit pas.
    const again = upgradeKit(upgraded);
    expect(again.typographyNotice).toBeUndefined();
    // L'enregistrement garde la réparation et oublie l'avertissement.
    const saved = sanitizeKit(upgraded, upgraded);
    expect(saved.typographyNotice).toBeUndefined();
    expect(saved.textStyles.body.font).toBe("Poppins");
  });

  it("les vidéos n'ont jamais de monospace en texte, même choisie sans être enregistrée", () => {
    const theme = toBrandTheme(monoKit());
    for (const role of TEXT_FONT_ROLES) expect(theme.textStyles[role].font).not.toBe(MONO);
    expect(theme.textStyles.title.font).toBe(TITLE);
  });

  it("l'éditeur avertit, y compris pour une police mesurée à chasse fixe", () => {
    const kit = monoKit();
    expect(typographyWarnings(kit)).toHaveLength(3);
    const fixed = upgradeKit(kit);
    expect(typographyWarnings(fixed)).toHaveLength(0);
    // Sous-titre, étiquette et texte sur carte sont en Poppins ; la légende garde la police du titre.
    expect(typographyWarnings(fixed, new Set(["Poppins"]))).toHaveLength(3);
  });
});

describe("marque neuve", () => {
  it("rôles de texte dans une police de texte du catalogue, couleurs lisibles sur leur fond", () => {
    for (const palette of [DEFAULT_PALETTE, { ...DEFAULT_PALETTE, background: "#f2ede4", ink: "#f5f5f4", accent: "#ff48b0", onAccent: "#ffffff", surface: "#3d5588", onSurface: "#3d185e" }]) {
      const styles = defaultTextStyles(palette);
      for (const role of TEXT_FONT_ROLES) expect(isCatalogTextFont(styles[role].font), role).toBe(true);
      expect(contrastRatio(styles.subtitle.color, palette.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(styles.caption.color, palette.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(styles.label.color, palette.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(styles.body.color, palette.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("la trame Riso s'enregistre, éteinte par défaut", () => {
    const kit = createDefaultKit("Neuve", 1000);
    expect(kit.halftone).toBeUndefined();
    expect(toBrandTheme(kit).halftone).toBeUndefined();
    const saved = sanitizeKit({ ...kit, halftone: true }, kit);
    expect(saved.halftone).toBe(true);
    expect(toBrandTheme(saved).halftone).toBe(true);
    expect(sanitizeKit({ ...saved, halftone: "oui" }, saved).halftone).toBe(true);
  });
});
