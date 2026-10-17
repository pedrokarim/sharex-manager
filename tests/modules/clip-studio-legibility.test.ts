import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { applyBrandTheme, defaultRoleStyles, type BrandTheme } from "@/modules/clip-studio/engine/brand";
import { addItem, createCaptionItem } from "@/modules/clip-studio/engine/edit";
import {
  backdropOf,
  blackOrWhite,
  contrastRatio,
  legibleKaraoke,
  legibleStyle,
  minContrast,
  OUTLINE_WIDTH,
  paletteCandidates,
  pickPair,
  readableOn,
  treatmentOf,
} from "@/modules/clip-studio/engine/legibility";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import {
  SAMPLE_FREE,
  SAMPLE_QUIZ,
  SAMPLE_SLIDESHOW,
  SAMPLE_TOP,
  buildFree,
  buildFromTemplate,
  buildQuiz,
  buildSlideshow,
  buildTop,
} from "@/modules/clip-studio/engine/templates";
import type { ClipProject, MediaSource, ShapeItem, TextItem, TextStyle, Track } from "@/modules/clip-studio/engine/types";

/**
 * Lisibilité des textes d'un clip habillé par une marque (dossier 07 sexies,
 * étape D1) : chaque texte a une étiquette, un contour ou un aplat qui le
 * porte, au contraste garanti ; plus de voile sur les images.
 */

// Marque d'essai aux couleurs difficiles : encre sombre, papier clair, accent vif sans contraste avec le blanc.
const PALETTE = {
  background: "#f2ede4",
  ink: "#3d5588",
  surface: "#fbf8f2",
  onSurface: "#1c1b22",
  accent: "#ff48b0",
  accentSecondary: "#ff48b0",
  onAccent: "#ffffff",
  extras: ["#3d185e"],
};

const caption = defaultRoleStyles().caption;
const plain = (patch: Partial<TextStyle>): TextStyle => ({ ...caption, stroke: null, shadow: null, background: null, ...patch });

const THEME: BrandTheme = {
  kitId: "kit-legible1",
  name: "Encres",
  palette: PALETTE,
  textStyles: {
    title: plain({ font: "Anton", weight: 400, color: "#3d5588", uppercase: true, shadow: { color: "#ff48b0", blur: 0, offsetY: 0.07 } }),
    subtitle: plain({ font: "Poppins", weight: 700, color: "#3d5588" }),
    caption: plain({ font: "Poppins", weight: 700, color: "#3d5588" }),
    label: plain({ font: "Poppins", weight: 700, color: "#1c1b22", background: { color: "#ff48b0", padding: 0.45, radius: 0.08 } }),
    body: plain({ font: "Poppins", weight: 700, color: "#1c1b22" }),
  },
  fonts: [],
};

const photo = (index: number): MediaSource => ({ url: `/test/photo-${index}.png`, ref: `upload:photo-${index}.png`, name: `photo-${index}`, kind: "image", width: 1080, height: 1920 });

const items = (project: ClipProject) => project.tracks.flatMap((track) => track.items);
const texts = (project: ClipProject) => items(project).filter((item): item is TextItem => item.type === "text");
const shapes = (project: ClipProject) => items(project).filter((item): item is ShapeItem => item.type === "shape");

/** Projet sans identifiants ni dates, pour comparer deux montages. */
function stable(project: ClipProject) {
  return JSON.parse(JSON.stringify({ ...project, id: "", createdAt: 0, updatedAt: 0 }, (key, value) => (key === "id" && typeof value === "string" ? "" : value)));
}

/** Les quatre modèles, une image sur chaque segment. */
function withImages(): Record<string, ClipProject> {
  return {
    libre: buildFree("Libre", "9:16", { ...SAMPLE_FREE, scenes: SAMPLE_FREE.scenes.map((scene, index) => ({ ...scene, image: photo(index) })) }),
    quiz: buildQuiz("Quiz", "9:16", { ...SAMPLE_QUIZ, questions: SAMPLE_QUIZ.questions.map((question, index) => ({ ...question, image: photo(index) })) }),
    classement: buildTop("Top", "9:16", { ...SAMPLE_TOP, entries: SAMPLE_TOP.entries.map((entry, index) => ({ ...entry, image: photo(index) })) }),
    diaporama: buildSlideshow("Diaporama", "9:16", { ...SAMPLE_SLIDESHOW, slides: SAMPLE_SLIDESHOW.slides.map((slide, index) => ({ ...slide, image: photo(index) })) }),
  };
}

/**
 * Contraste réel d'un texte habillé : contre son étiquette, son contour, ou
 * tous les aplats sous lui ; 0 quand il est posé nu sur une image.
 */
function guaranteedContrast(project: ClipProject, trackIndex: number, item: TextItem): number {
  const { style } = item;
  const treatment = treatmentOf(style);
  if (treatment === "label") return contrastRatio(style.color, style.background!.color);
  if (treatment === "outline") return contrastRatio(style.color, style.stroke!.color);
  const backdrop = backdropOf(project, trackIndex, item);
  if (backdrop.kind === "busy") return 0;
  return Math.min(...backdrop.colors.map((ground) => contrastRatio(style.color, ground)));
}

describe("contraste et choix des couleurs", () => {
  it("calcule le rapport WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#3d5588", "#f2ede4")).toBeGreaterThan(6);
    expect(contrastRatio("#3d5588", "#ff48b0")).toBeLessThan(3);
    // Couleur illisible : aucun contraste supposé.
    expect(contrastRatio("pas une couleur", "#ffffff")).toBe(1);
  });

  it("exige 4,5:1, et 3:1 pour un titre de plus de 7 % de la hauteur", () => {
    expect(minContrast("caption", 0.2)).toBe(4.5);
    expect(minContrast("title", 0.065)).toBe(4.5);
    expect(minContrast("title", 0.12)).toBe(3);
  });

  it("prend les couleurs de la palette dans l'ordre de leurs rôles, sans doublon, puis noir et blanc", () => {
    expect(paletteCandidates(PALETTE)).toEqual(["#f2ede4", "#fbf8f2", "#3d5588", "#1c1b22", "#ff48b0", "#ffffff", "#3d185e", "#000000"]);
  });

  it("garde le texte et cherche le fond, ou garde le fond et cherche le texte", () => {
    const candidates = paletteCandidates(PALETTE);
    // Encre sur rose : 2,7:1. Une étiquette posée par le moteur garde l'encre et prend le papier.
    expect(pickPair("#3d5588", "#ff48b0", candidates, 4.5, "text")).toEqual({ text: "#3d5588", ground: "#f2ede4" });
    // La teinte d'une étiquette de segment reste : son texte change.
    const kept = pickPair("#3d5588", "#ff48b0", candidates, 4.5, "ground");
    expect(kept.ground).toBe("#ff48b0");
    expect(contrastRatio(kept.text, kept.ground)).toBeGreaterThanOrEqual(4.5);
    // Paire déjà lisible : rien ne change.
    expect(pickPair("#1c1b22", "#ff48b0", candidates, 4.5, "ground")).toEqual({ text: "#1c1b22", ground: "#ff48b0" });
  });

  it("finit sur le noir ou le blanc, qui atteignent toujours 4,5:1", () => {
    for (const ground of ["#777777", "#ff0000", "#00ff00", "#0000ff", "#808000", "#767676"]) {
      expect(contrastRatio(blackOrWhite(ground), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(readableOn([ground], ground, [], 4.5), ground)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("traitement d'un texte selon son fond", () => {
  it("sur une image : une étiquette au fond de la palette, contraste garanti", () => {
    const style = legibleStyle(THEME.textStyles.caption, { kind: "busy" }, PALETTE, { role: "caption", labelRadius: 0.08 });
    expect(style.background).toMatchObject({ color: "#f2ede4", radius: 0.08 });
    expect(style.color).toBe("#3d5588");
    expect(contrastRatio(style.color, style.background!.color)).toBeGreaterThanOrEqual(4.5);
    // Les jambages tiennent dans l'étiquette.
    expect(style.lineHeight).toBeGreaterThanOrEqual(1.3);
  });

  it("garde l'ombre colorée décalée du titre, et lui donne aussi un fond lisible", () => {
    const title = { ...THEME.textStyles.title, size: 0.065 };
    const style = legibleStyle(title, { kind: "busy" }, PALETTE, { role: "title" });
    expect(style.shadow).toEqual({ color: "#ff48b0", blur: 0, offsetY: 0.07 });
    expect(style.background).not.toBeNull();
    expect(contrastRatio(style.color, style.background!.color)).toBeGreaterThanOrEqual(4.5);
  });

  it("sur un aplat uni assez contrasté : rien à poser", () => {
    const style = legibleStyle(THEME.textStyles.caption, { kind: "flat", colors: ["#f2ede4"] }, PALETTE, { role: "caption" });
    expect(style.background).toBeNull();
    expect(style.stroke).toBeNull();
    expect(style.color).toBe("#3d5588");
  });

  it("sur un aplat où l'encre ne se lit pas : une autre couleur de la palette", () => {
    const style = legibleStyle(THEME.textStyles.caption, { kind: "flat", colors: ["#3d185e"] }, PALETTE, { role: "caption" });
    expect(style.background).toBeNull();
    expect(contrastRatio(style.color, "#3d185e")).toBeGreaterThanOrEqual(4.5);
  });

  it("une couleur qui porte un sens (bonne réponse) reçoit une étiquette au lieu d'être remplacée", () => {
    const success = { ...THEME.textStyles.caption, color: "#bbf7d0" };
    const style = legibleStyle(success, { kind: "flat", colors: ["#f2ede4"] }, PALETTE, { role: "caption", keepColor: true });
    expect(style.color).toBe("#bbf7d0");
    expect(contrastRatio(style.color, style.background!.color)).toBeGreaterThanOrEqual(4.5);
  });

  it("un contour épais voulu par la marque sert de traitement, aux couleurs vérifiées", () => {
    const outlined = { ...THEME.textStyles.caption, color: "#ffffff", stroke: { color: "#ff48b0", width: 0.12 } };
    const style = legibleStyle(outlined, { kind: "busy" }, PALETTE, { role: "caption" });
    expect(style.background).toBeNull();
    expect(style.stroke!.width).toBeGreaterThanOrEqual(OUTLINE_WIDTH);
    expect(contrastRatio(style.color, style.stroke!.color)).toBeGreaterThanOrEqual(4.5);
  });

  it("une étiquette de la marque garde sa teinte, son texte s'y ajuste", () => {
    const label = { ...THEME.textStyles.label, color: "#ffffff" };
    const style = legibleStyle(label, { kind: "busy" }, PALETTE, { role: "label" });
    expect(style.background!.color).toBe("#ff48b0");
    expect(contrastRatio(style.color, "#ff48b0")).toBeGreaterThanOrEqual(4.5);
  });

  it("sous-titres mot à mot : contour épais, texte et mot prononcé lisibles et distincts", () => {
    const fixed = legibleKaraoke({ ...THEME.textStyles.caption, stroke: null }, "#ff48b0", PALETTE);
    const stroke = fixed.style.stroke!;
    expect(stroke.width).toBeGreaterThanOrEqual(OUTLINE_WIDTH);
    expect(contrastRatio(fixed.style.color, stroke.color)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fixed.highlight, stroke.color)).toBeGreaterThanOrEqual(4.5);
    expect(fixed.highlight).toBe("#ff48b0");
    expect(fixed.style.color).not.toBe(fixed.highlight);
  });
});

describe("ce qu'il y a sous un texte", () => {
  const still = { start: 0, duration: 30, animIn: { kind: "none", frames: 1 }, animOut: { kind: "none", frames: 1 } };
  const frame = { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 };
  const text: TextItem = { ...still, id: "x-1", type: "text", text: "Bonjour", style: THEME.textStyles.caption, transform: { ...frame, width: 0.6, height: 0.1 } };
  const project = (lower: Track["items"]): ClipProject => ({
    version: 1,
    id: "p",
    name: "p",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    background: "#f2ede4",
    tracks: [{ id: "t-text", kind: "visual", name: "Textes", items: [text] }, ...lower.map((item, index) => ({ id: `t-${index}`, kind: "visual" as const, name: `n${index}`, items: [item] }))],
    createdAt: 0,
    updatedAt: 0,
  });
  const image = { ...still, id: "i-1", type: "image" as const, source: photo(0), fit: "cover" as const, motion: "none", radius: 0, transform: frame };
  const rect = (fill: string, patch: Partial<ShapeItem["transform"]> = {}): ShapeItem => ({ ...still, id: `s-${fill}`, type: "shape", shape: "rect", fill, radius: 0, transform: { ...frame, ...patch } });

  it("une image : un fond chargé", () => {
    expect(backdropOf(project([image]), 0, text)).toEqual({ kind: "busy" });
  });

  it("rien dessous : le fond du projet", () => {
    expect(backdropOf(project([]), 0, text)).toEqual({ kind: "flat", colors: ["#f2ede4"] });
  });

  it("une carte pleine qui couvre le texte : un aplat", () => {
    expect(backdropOf(project([rect("#fbf8f2"), image]), 0, text)).toEqual({ kind: "flat", colors: ["#fbf8f2"] });
  });

  it("un voile retiré ne compte pas, un aplat partiel ou translucide ne garantit rien", () => {
    expect(backdropOf(project([rect("rgba(0,0,0,0)"), image]), 0, text)).toEqual({ kind: "busy" });
    expect(backdropOf(project([rect("#fbf8f2", { width: 0.3 }), image]), 0, text)).toEqual({ kind: "busy" });
    expect(backdropOf(project([rect("#fbf8f2", { opacity: 0.5 }), image]), 0, text)).toEqual({ kind: "busy" });
  });
});

describe("applyBrandTheme : lisibilité garantie", () => {
  it("aucun texte nu sur une image, dans chaque modèle : contraste garanti partout", () => {
    for (const [name, base] of Object.entries(withImages())) {
      const project = applyBrandTheme(base, THEME);
      project.tracks.forEach((track, trackIndex) => {
        for (const item of track.items) {
          if (item.type !== "text" || !item.theme?.role) continue;
          const min = minContrast(item.theme.role, item.style.size);
          const ratio = guaranteedContrast(project, trackIndex, item);
          if (ratio < min) throw new Error(`${name} : « ${item.text} » à ${ratio.toFixed(2)}:1 (seuil ${min})`);
        }
      });
    }
  });

  it("plus de voile sur les images : elles restent éclatantes", () => {
    const project = applyBrandTheme(withImages().quiz, THEME);
    const veils = shapes(project).filter((shape) => shape.theme?.paint === "veil");
    expect(veils.length).toBeGreaterThan(0);
    expect(veils.every((veil) => veil.fill === "rgba(0,0,0,0)")).toBe(true);
    // Sans marque, le voile sombre d'avant reste.
    expect(shapes(withImages().quiz).filter((shape) => shape.theme?.paint === "veil").every((veil) => veil.fill === "#000000" && veil.transform.opacity === 0.42)).toBe(true);
  });

  it("le titre garde son ombre colorée décalée", () => {
    const project = applyBrandTheme(withImages().libre, THEME);
    const title = texts(project).find((item) => item.text === SAMPLE_FREE.title)!;
    expect(title.style.shadow).toEqual({ color: "#ff48b0", blur: 0, offsetY: 0.07 });
    expect(title.style.background).not.toBeNull();
    expect(title.fit).toBe("shrink");
  });

  it("habille aussi les sous-titres karaoké d'un contour lisible", () => {
    let project = withImages().libre;
    project = addItem(project, createCaptionItem([{ text: "Bonjour", startMs: 0, endMs: 500 }], 0, project.fps, true), undefined, "Sous-titres");
    const karaoke = texts(applyBrandTheme(project, THEME)).find((item) => item.karaoke)!;
    expect(contrastRatio(karaoke.style.color, karaoke.style.stroke!.color)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(karaoke.karaoke!.highlight, karaoke.style.stroke!.color)).toBeGreaterThanOrEqual(4.5);
  });

  it("trame légère sur les aplats unis seulement, et seulement si la marque la demande", () => {
    const plain = applyBrandTheme(buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ), THEME);
    expect(shapes(plain).some((shape) => shape.pattern)).toBe(false);
    const screened = applyBrandTheme(withImages().quiz, { ...THEME, halftone: true, endCard: { seconds: 2, name: "Encres" } });
    const patterned = shapes(screened).filter((shape) => shape.pattern);
    expect(patterned.length).toBeGreaterThan(0);
    expect(patterned.every((shape) => shape.theme?.paint === "plate" || shape.label === "Fond du carton de fin")).toBe(true);
    expect(patterned.every((shape) => shape.pattern!.opacity <= 0.15)).toBe(true);
  });

  it("retirer la marque rend exactement le montage d'origine (styles, voiles, trame, cadres des textes)", () => {
    for (const base of Object.values(withImages())) {
      const branded = applyBrandTheme(base, { ...THEME, halftone: true });
      expect(stable(applyBrandTheme(branded, null))).toEqual(stable(base));
    }
  });

  it("appliquer deux fois la même marque donne le même projet", () => {
    const once = applyBrandTheme(withImages().quiz, THEME);
    expect(stable(applyBrandTheme(once, THEME))).toEqual(stable(once));
  });
});

describe("rendu réel", () => {
  it("l'étiquette est vraiment dessinée derrière un texte posé sur une image chargée", () => {
    const W = 270;
    const H = 480;
    const base = buildSlideshow("Diaporama", "9:16", { slides: [{ caption: "Vue du lac", image: photo(0) }] });
    const project = { ...applyBrandTheme(base, THEME), width: W, height: H };
    // Image très chargée : des bandes de couleurs vives.
    const stripes = createCanvas(W, H);
    const sctx = stripes.getContext("2d");
    ["#ff0040", "#00e5ff", "#111111", "#ffe600", "#7a00ff"].forEach((color, index, list) => {
      for (let y = index * 6; y < H; y += list.length * 6) {
        sctx.fillStyle = color;
        sctx.fillRect(0, y, W, 6);
      }
    });
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    const item = texts(project).find((entry) => entry.text === "Vue du lac")!;
    const frame = item.start + 30;
    drawFrame(ctx as unknown as CanvasRenderingContext2D, project, frame, () => stripes as unknown as CanvasImageSource);
    // Au-dessus des lettres, dans l'étiquette : la couleur de l'étiquette, pas les bandes.
    const fontPx = item.style.size * H;
    const x = Math.round(item.transform.x * W);
    const y = Math.round(item.transform.y * H - fontPx * 0.52);
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    expect(hex).toBe(item.style.background!.color);
    expect(contrastRatio(item.style.color, hex)).toBeGreaterThanOrEqual(4.5);
  });
});
