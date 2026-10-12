import { describe, expect, it } from "vitest";
import { applyBrandTheme, defaultRoleStyles, shade, type BrandTheme } from "@/modules/clip-studio/engine/brand";
import { createCaptionItem, addItem } from "@/modules/clip-studio/engine/edit";
import { SAMPLE_QUIZ, SAMPLE_TOP, buildFromTemplate, buildQuiz, buildTop } from "@/modules/clip-studio/engine/templates";
import { projectDuration } from "@/modules/clip-studio/engine/timeline";
import type { ClipItem, ClipProject, ImageItem, ShapeItem, TextItem, TextStyle } from "@/modules/clip-studio/engine/types";

const items = (project: ClipProject) => project.tracks.flatMap((track) => track.items);
const texts = (project: ClipProject) => items(project).filter((item): item is TextItem => item.type === "text");
const shapes = (project: ClipProject) => items(project).filter((item): item is ShapeItem => item.type === "shape");
const byText = (project: ClipProject, content: string) => texts(project).find((item) => item.text === content)!;

function style(patch: Partial<TextStyle>): TextStyle {
  return { ...defaultRoleStyles().caption, ...patch };
}

const THEME: BrandTheme = {
  kitId: "kit-test01",
  name: "Riso",
  palette: {
    background: "#fdf2e9",
    ink: "#1d1d6b",
    surface: "#ffffff",
    onSurface: "#1d1d6b",
    accent: "#ff4f9a",
    accentSecondary: "#2f6bff",
    onAccent: "#ffffff",
    extras: ["#ffb000"],
  },
  textStyles: {
    title: style({ font: "bk-kit-test01-f-title", weight: 400, color: "#1d1d6b", stroke: null }),
    subtitle: style({ font: "Poppins", weight: 500, color: "#1d1d6b", stroke: null }),
    caption: style({ font: "Poppins", weight: 700, color: "#1d1d6b", stroke: null }),
    label: style({ font: "Poppins", weight: 700, background: { color: "#000000", padding: 0.5, radius: 0.2 } }),
    body: style({ font: "Inter", weight: 600, stroke: null }),
  },
  fonts: [{ family: "bk-kit-test01-f-title", kitId: "kit-test01", fontId: "f-title" }],
  watermark: {
    source: { url: "/api/modules/brand-kit/data/kits/kit-test01/assets/logo.png", ref: "module:brand-kit/kits/kit-test01/assets/logo.png", name: "logo.png", kind: "image", width: 400, height: 200 },
    anchor: "bottom-right",
    size: 0.2,
    opacity: 0.8,
    margin: 0.04,
    startSeconds: 1,
  },
  endCard: { seconds: 3, name: "Riso", tagline: "Les jeux, en couleurs", callToAction: "Abonne-toi" },
};

/** Projet sans ce qui varie d'un appel à l'autre : identifiants et dates. */
function stable(project: ClipProject) {
  return JSON.parse(
    JSON.stringify({ ...project, id: "", createdAt: 0, updatedAt: 0 }, (key, value) => (key === "id" && typeof value === "string" ? "" : value))
  );
}

describe("thème par défaut des modèles", () => {
  it("garde les couleurs et les styles d'avant les images de marque", () => {
    const quiz = buildQuiz("Quiz", "9:16", SAMPLE_QUIZ);
    const label = byText(quiz, "Question 1/3");
    expect(label.style.color).toBe("#ffffff");
    expect(label.style.background).toEqual({ color: "#8b5cf6", padding: 0.4, radius: 0.35 });
    const second = byText(quiz, "Question 2/3");
    expect(second.style.background?.color).toBe("#0ea5e9");

    const choice = byText(quiz, "A. Le cheval");
    expect(choice.style).toMatchObject({ font: "Poppins", weight: 700, color: "#111111", align: "left", shadow: null });
    const explanation = byText(quiz, SAMPLE_QUIZ.questions[0].explanation!);
    expect(explanation.style.color).toBe("#bbf7d0");

    // Sans image : un aplat de la teinte assombrie.
    const plates = shapes(quiz).filter((shape) => shape.theme?.paint === "plate");
    expect(plates[0].fill).toBe(shade("#8b5cf6", -0.55));
    expect(shapes(quiz).filter((shape) => shape.theme?.paint === "surface").every((shape) => shape.fill === "#ffffff")).toBe(true);
    expect(quiz.background).toBe("#000000");
  });

  it("met le numéro 1 d'un classement en jaune, comme avant", () => {
    const top = buildTop("Top", "9:16", SAMPLE_TOP);
    expect(byText(top, "#1").style.color).toBe("#facc15");
    expect(byText(top, "#2").style.color).toBe("#ffffff");
  });
});

describe("applyBrandTheme", () => {
  it("habille un quiz aux couleurs et aux polices de la marque", () => {
    const project = buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ, THEME);
    expect(project.background).toBe("#fdf2e9");
    expect(project.brandKitId).toBe("kit-test01");

    const title = byText(project, SAMPLE_QUIZ.title);
    expect(title.style.font).toBe("bk-kit-test01-f-title");
    expect(title.style.color).toBe("#1d1d6b");

    const label = byText(project, "Question 1/3");
    expect(label.style.font).toBe("Poppins");
    expect(label.style.color).toBe("#ffffff");
    expect(label.style.background).toEqual({ color: "#ff4f9a", padding: 0.5, radius: 0.2 });
    expect(byText(project, "Question 2/3").style.background?.color).toBe("#2f6bff");
    expect(byText(project, "Question 3/3").style.background?.color).toBe("#ffb000");

    const choice = byText(project, "A. Le cheval");
    expect(choice.style.font).toBe("Inter");
    expect(choice.style.color).toBe("#1d1d6b");
    // La taille et l'alignement tiennent à la place du texte, pas à la marque.
    expect(choice.style.align).toBe("left");
    expect(choice.style.size).toBe(0.03);

    // Le vert de la bonne réponse ne suit pas la marque.
    expect(byText(project, SAMPLE_QUIZ.questions[0].explanation!).style.color).toBe("#bbf7d0");
    expect(shapes(project).some((shape) => shape.fill === "#22c55e")).toBe(true);
  });

  it("pose le filigrane dans le coin, jusqu'au carton de fin", () => {
    const project = buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ, THEME);
    const mark = items(project).find((item): item is ImageItem => item.type === "image" && item.label === "Filigrane")!;
    expect(mark.origin).toBe("brand");
    expect(mark.start).toBe(project.fps);
    // 20 % du petit côté (1080 px) = 216 px de large, logo deux fois plus large que haut.
    expect(mark.transform.width * project.width).toBeCloseTo(216);
    expect(mark.transform.height * project.height).toBeCloseTo(108);
    expect(mark.transform.x).toBeGreaterThan(0.5);
    expect(mark.transform.y).toBeGreaterThan(0.5);
    expect(mark.transform.opacity).toBe(0.8);

    const card = byText(project, "Abonne-toi");
    expect(mark.start + mark.duration).toBe(card.start);
    expect(card.duration).toBe(3 * project.fps);
    expect(card.start + card.duration).toBe(projectDuration(project));
    // Sans logo, le carton écrit le nom de la marque.
    expect(byText(project, "Riso").style.font).toBe("bk-kit-test01-f-title");
    // Filigrane tout en haut de la pile.
    expect(project.tracks[0].name).toBe("Filigrane");
  });

  it("est idempotente, et une autre marque remplace la première", () => {
    const once = buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ, THEME);
    const twice = applyBrandTheme(once, THEME);
    expect(stable(twice)).toEqual(stable(once));

    const other: BrandTheme = { ...THEME, kitId: "kit-other1", palette: { ...THEME.palette, background: "#101010" }, endCard: undefined, watermark: undefined };
    const swapped = applyBrandTheme(once, other);
    expect(swapped.background).toBe("#101010");
    expect(items(swapped).some((item) => item.origin === "brand")).toBe(false);
    expect(swapped.tracks.some((track) => track.origin === "brand")).toBe(false);
  });

  it("retirer la marque rend le rendu par défaut", () => {
    const plain = buildQuiz("Quiz", "9:16", SAMPLE_QUIZ);
    const branded = applyBrandTheme(plain, THEME);
    const removed = applyBrandTheme(branded, null);
    expect(removed.brandKitId).toBeUndefined();
    expect(stable(removed)).toEqual(stable(plain));
  });

  it("ne touche pas un élément posé à la main, mais habille les sous-titres karaoké", () => {
    let project = buildQuiz("Quiz", "9:16", SAMPLE_QUIZ);
    const manual: ClipItem = { ...byText(project, "Question 1/3"), id: "x-manual", text: "À la main", theme: undefined, style: style({ color: "#123456" }) };
    project = addItem(project, manual, undefined, "Mes textes");
    const caption = createCaptionItem([{ text: "Bonjour", startMs: 0, endMs: 500 }], 0, project.fps, true);
    project = addItem(project, caption, undefined, "Sous-titres");

    const branded = applyBrandTheme(project, THEME);
    expect(byText(branded, "À la main").style.color).toBe("#123456");
    const karaoke = texts(branded).find((item) => item.karaoke)!;
    expect(karaoke.style.font).toBe("Poppins");
    expect(karaoke.karaoke!.highlight).toBe("#2f6bff");
    // La taille des sous-titres reste la leur.
    expect(karaoke.style.size).toBe(caption.style.size);
  });
});
