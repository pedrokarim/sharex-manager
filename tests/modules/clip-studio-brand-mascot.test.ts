import { describe, expect, it, vi } from "vitest";

// L'assistant appelle d'autres modules par le gestionnaire : aucun appel ici, tout est pur.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

import {
  MASCOT_OPENING_ANIM,
  MASCOT_REACTION_ANIM,
  SHORT_SAFE_ZONE,
  applyBrandTheme,
  defaultRoleStyles,
  endCardTracks,
  splitBrandName,
  type BrandTheme,
} from "@/modules/clip-studio/engine/brand";
import { isKnownPreset } from "@/modules/clip-studio/engine/motion/registry";
import { SAMPLE_FREE, SAMPLE_QUIZ, SAMPLE_TOP, buildFromTemplate, buildQuiz } from "@/modules/clip-studio/engine/templates";
import type { ClipProject, ImageItem, MediaSource, TextItem, VisualItem } from "@/modules/clip-studio/engine/types";
import { scriptPrompt, toAssistantBrand, type AssistantRequest, type BrandKitRecord } from "@/modules/clip-studio/lib/assistant";

const pose = (name: string, width: number, height: number): MediaSource => ({
  url: `/api/modules/brand-kit/data/kits/kit-test01/assets/${name}.png`,
  ref: `module:brand-kit/kits/kit-test01/assets/${name}.png`,
  name,
  kind: "image",
  width,
  height,
});

const STANDING = pose("debout", 729, 1502);
const LEANING = pose("accoudee", 1459, 1004);
const PORTRAIT = pose("portrait", 1205, 1244);

const THEME: BrandTheme = {
  kitId: "kit-test01",
  name: "Kanto",
  palette: {
    background: "#f2ede4",
    ink: "#3d5588",
    surface: "#fbf8f2",
    onSurface: "#1c1b22",
    accent: "#ff48b0",
    accentSecondary: "#3d5588",
    onAccent: "#1c1b22",
    extras: ["#3d185e"],
  },
  textStyles: defaultRoleStyles(),
  fonts: [],
  endCard: { seconds: 3, name: "Kanto", tagline: "Le jeu, en couleurs.", callToAction: "Abonne-toi" },
};

const WITH_MASCOT: BrandTheme = { ...THEME, mascot: { opening: STANDING, reactions: [STANDING, LEANING, PORTRAIT] } };

const items = (project: ClipProject) => project.tracks.flatMap((track) => track.items);
const mascotItems = (project: ClipProject) =>
  items(project).filter((item): item is ImageItem => item.type === "image" && item.origin === "brand" && (item.label ?? "").startsWith("Mascotte"));

function stable(project: ClipProject) {
  return JSON.parse(JSON.stringify({ ...project, id: "", createdAt: 0, updatedAt: 0 }, (key, value) => (key === "id" && typeof value === "string" ? "" : value)));
}

const edges = (item: { transform: { x: number; y: number; width: number; height: number } }) => ({
  left: item.transform.x - item.transform.width / 2,
  right: item.transform.x + item.transform.width / 2,
  top: item.transform.y - item.transform.height / 2,
  bottom: item.transform.y + item.transform.height / 2,
});

describe("mascotte dans le montage", () => {
  it("ne pose rien sans réglage : le rendu reste celui d'une marque sans mascotte", () => {
    const plain = buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ, THEME);
    expect(mascotItems(plain)).toHaveLength(0);
    const empty = buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ, { ...THEME, mascot: { reactions: [] } });
    expect(stable(empty)).toEqual(stable(plain));
  });

  it("pose l'ouverture avec l'accroche, puis une réaction par segment, une autre pose à chaque fois", () => {
    const project = buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ, WITH_MASCOT);
    const placed = mascotItems(project);
    const opening = placed.filter((item) => item.label === "Mascotte – ouverture");
    const reactions = placed.filter((item) => item.label === "Mascotte – réaction").sort((a, b) => a.start - b.start);
    expect(opening).toHaveLength(1);
    expect(opening[0].start).toBeLessThan(project.fps);
    expect(opening[0].source.url).toBe(STANDING.url);
    expect(opening[0].animIn.kind).toBe(MASCOT_OPENING_ANIM);
    // Une réaction par question et une pour la conclusion.
    expect(reactions.length).toBe(SAMPLE_QUIZ.questions.length + 1);
    for (let index = 1; index < reactions.length; index++) {
      expect(reactions[index].source.url).not.toBe(reactions[index - 1].source.url);
      expect(reactions[index].start).toBeGreaterThanOrEqual(reactions[index - 1].start + reactions[index - 1].duration);
    }
    expect(reactions.every((item) => item.animIn.kind === MASCOT_REACTION_ANIM)).toBe(true);
    expect(isKnownPreset(MASCOT_OPENING_ANIM) && isKnownPreset(MASCOT_REACTION_ANIM)).toBe(true);
    // Tout tient avant le carton de fin.
    const card = items(project).find((item) => item.label === "Fond du carton de fin")!;
    expect(placed.every((item) => item.start + item.duration <= card.start)).toBe(true);
  });

  it("reste dans la zone de sécurité d'un short et ne masque aucun texte ni aucun cadre", () => {
    for (const project of [
      buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ, WITH_MASCOT),
      buildFromTemplate("top", "Top", "9:16", SAMPLE_TOP, WITH_MASCOT),
      buildFromTemplate("free", "Libre", "9:16", SAMPLE_FREE, WITH_MASCOT),
    ]) {
      const placed = mascotItems(project);
      expect(placed.length).toBeGreaterThan(0);
      for (const item of placed) {
        const box = edges(item);
        expect(box.top).toBeGreaterThanOrEqual(SHORT_SAFE_ZONE.top - 1e-9);
        expect(box.bottom).toBeLessThanOrEqual(SHORT_SAFE_ZONE.bottom + 1e-9);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(1);
        // Pas sous les boutons, à droite de la moitié basse.
        const underButtons = box.right > SHORT_SAFE_ZONE.buttonsLeft && box.bottom > SHORT_SAFE_ZONE.buttonsTop;
        expect(underButtons).toBe(false);
        // Aucun cadre (choix, compte à rebours) ni aucun texte court du segment sous la pose.
        const during = items(project).filter(
          (other): other is VisualItem =>
            other.type !== "audio" &&
            other.origin !== "brand" &&
            other.start < item.start + item.duration &&
            other.start + other.duration > item.start &&
            !(other.transform.width >= 0.95 && other.transform.height >= 0.95)
        );
        for (const other of during) {
          if (other.type === "text" && (other as TextItem).text.length > 24) continue;
          const o = edges(other);
          const overlap = box.left < o.right && box.right > o.left && box.top < o.bottom && box.bottom > o.top;
          if (other.type === "text") {
            // Un texte court est estimé à sa longueur : il ne doit pas déborder sur la pose.
            const text = other as TextItem;
            const width = (text.text.length * text.style.size * project.height * 0.68) / project.width;
            const left = text.transform.x - width / 2;
            const right = text.transform.x + width / 2;
            expect(box.left < right && box.right > left && box.top < o.bottom && box.bottom > o.top).toBe(false);
          } else {
            expect(overlap).toBe(false);
          }
        }
      }
    }
  });

  it("est retirée avec la marque, remplacée par une autre, et l'application reste idempotente", () => {
    const once = buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ, WITH_MASCOT);
    const twice = applyBrandTheme(once, WITH_MASCOT);
    expect(stable(twice)).toEqual(stable(once));

    const removed = applyBrandTheme(once, null);
    expect(items(removed).some((item) => item.origin === "brand")).toBe(false);
    expect(removed.tracks.some((track) => track.name.startsWith("Mascotte"))).toBe(false);
    expect(stable(removed)).toEqual(stable(applyBrandTheme(buildQuiz("Quiz", "9:16", SAMPLE_QUIZ), null)));

    const without = applyBrandTheme(once, THEME);
    expect(mascotItems(without)).toHaveLength(0);
    expect(stable(without)).toEqual(stable(buildFromTemplate("quiz", "Quiz", "9:16", SAMPLE_QUIZ, THEME)));
  });

  it("se place aussi dans une vidéo en paysage, dans les marges", () => {
    const project = buildFromTemplate("quiz", "Quiz", "16:9", SAMPLE_QUIZ, WITH_MASCOT);
    const placed = mascotItems(project);
    expect(placed.length).toBeGreaterThan(0);
    for (const item of placed) {
      const box = edges(item);
      expect(box.left).toBeGreaterThan(0);
      expect(box.right).toBeLessThan(1);
      expect(box.top).toBeGreaterThan(0);
      expect(box.bottom).toBeLessThan(1);
    }
  });
});

describe("carton de fin mis en scène", () => {
  it("coupe le nom en bloc sur deux lignes", () => {
    expect(splitBrandName("Kanto")).toBe("Kan\nto");
    expect(splitBrandName("Les jeux en couleurs")).toBe("Les jeux en\ncouleurs");
    expect(splitBrandName("Riso")).toBe("Riso");
  });

  it("pose le nom en haut à gauche et la mascotte en grand dessous, sur un short", () => {
    const base = buildQuiz("Quiz", "9:16", SAMPLE_QUIZ);
    const tracks = endCardTracks(base, { ...THEME, endCard: { ...THEME.endCard!, pose: STANDING } }, 0);
    const all = tracks.flatMap((track) => track.items);
    const name = all.find((item): item is TextItem => item.type === "text" && item.text === "Kan\nto")!;
    const mascot = all.find((item): item is ImageItem => item.type === "image" && item.source.url === STANDING.url)!;
    expect(name.style.align).toBe("left");
    expect(edges(name).bottom).toBeLessThan(edges(mascot).top);
    expect(edges(mascot).bottom).toBeLessThanOrEqual(1);
    expect(tracks[tracks.length - 1].items[0].label).toBe("Fond du carton de fin");
  });

  it("reprend l'image finie du carton à son orientation, telle quelle", () => {
    const image = pose("carton", 1080, 1920);
    const base = buildQuiz("Quiz", "9:16", SAMPLE_QUIZ);
    const tracks = endCardTracks(base, { ...THEME, endCard: { ...THEME.endCard!, images: { vertical: image } } }, 0);
    const all = tracks.flatMap((track) => track.items);
    expect(all.filter((item) => item.type === "image")).toHaveLength(1);
    expect(all.some((item) => item.type === "text")).toBe(false);
    // En paysage, sans image à cette orientation : la composition habituelle.
    const wide = endCardTracks(buildQuiz("Quiz", "16:9", SAMPLE_QUIZ), { ...THEME, endCard: { ...THEME.endCard!, images: { vertical: image } } }, 0);
    expect(wide.flatMap((track) => track.items).some((item) => item.type === "text")).toBe(true);
  });
});

describe("assistant et mascotte posée par la marque", () => {
  const KIT: BrandKitRecord = { name: "Kanto", mascot: { name: "La guide", identityPrompt: "Anime girl, short hair, round glasses" } };
  const REQUEST: AssistantRequest = { brief: "Les sorties de la semaine", template: "free", aspect: "9:16", count: 3, images: true };

  it("ne demande plus d'illustration de la mascotte quand ses réactions sont posées", () => {
    const placed = toAssistantBrand(KIT, WITH_MASCOT);
    expect(placed.mascotPlaced).toBe(true);
    expect(placed.mascot).toBeUndefined();
    const prompt = scriptPrompt(REQUEST, placed);
    expect(prompt).toContain("déjà posée au montage");
    expect(prompt).not.toContain('"mascot"');

    // Ouverture seule : les illustrations peuvent encore la mettre en scène.
    const openingOnly = toAssistantBrand(KIT, { ...THEME, mascot: { opening: STANDING, reactions: [] } });
    expect(openingOnly.mascotPlaced).toBeUndefined();
    expect(openingOnly.mascot?.identityPrompt).toContain("short hair");
  });
});
