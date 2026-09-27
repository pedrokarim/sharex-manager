import { describe, expect, it } from "vitest";
import { buildSequence } from "@/modules/clip-studio/engine/templates";
import { transitionAt } from "@/modules/clip-studio/engine/timeline";
import { splitItem } from "@/modules/clip-studio/engine/edit";
import type { ImageItem, MediaSource, VisualItem } from "@/modules/clip-studio/engine/types";

const image = (name: string): MediaSource => ({ url: `/api/files/${name}`, ref: `upload:${name}`, name, kind: "image" });
const video = (name: string, durationMs: number): MediaSource => ({
  url: `/api/files/${name}`,
  ref: `upload:${name}`,
  name,
  kind: "video",
  durationMs,
});

const mainItems = (project: ReturnType<typeof buildSequence>) =>
  project.tracks.find((track) => track.name === "Principale")!.items as VisualItem[];

describe("transitions entre plans", () => {
  const project = buildSequence("Test", "9:16", [image("a.png"), image("b.png"), image("c.png")], "slideshow");
  const [first, second] = mainItems(project);

  it("ne s'applique qu'aux premières images du plan qui arrive", () => {
    const frames = second.transition!.frames;
    expect(transitionAt(mainItems(project), second, second.start - 1)).toBeNull();
    expect(transitionAt(mainItems(project), second, second.start + frames)).toBeNull();

    const middle = transitionAt(mainItems(project), second, second.start + Math.floor(frames / 2));
    expect(middle?.kind).toBe("fade");
    expect(middle?.from?.id).toBe(first.id);
    expect(middle!.progress).toBeGreaterThan(0.3);
    expect(middle!.progress).toBeLessThan(0.7);
  });

  it("finit exactement à 1 sur la dernière image de la transition", () => {
    const frames = second.transition!.frames;
    expect(transitionAt(mainItems(project), second, second.start + frames - 1)?.progress).toBeCloseTo(1, 5);
  });

  it("transite depuis le fond quand aucun plan ne précède", () => {
    const lonely = { ...second, start: second.start + 100 } as VisualItem;
    expect(transitionAt([first, lonely], lonely, lonely.start)?.from).toBeNull();
  });

  it("ne rallonge pas le clip", () => {
    const total = mainItems(project).reduce((sum, item) => sum + item.duration, 0);
    expect(total).toBe(3 * 3 * project.fps);
  });

  it("disparaît de la seconde moitié d'un plan scindé", () => {
    const cut = second.start + Math.round(second.duration / 2);
    const after = mainItems(splitItem(project, second.id, cut));
    const halves = after.filter((item) => item.type === "image" && (item as ImageItem).source.name === "b.png");
    expect(halves).toHaveLength(2);
    expect(halves[0].transition?.kind).toBe("fade");
    expect(halves[1].transition).toBeUndefined();
  });
});

describe("recettes de la galerie", () => {
  it("diaporama : 3 s par image, fondus enchaînés sauf pour le premier plan", () => {
    const items = mainItems(buildSequence("D", "16:9", [image("a.png"), image("b.png")], "slideshow"));
    expect(items.map((item) => item.duration)).toEqual([90, 90]);
    expect(items[0].transition).toBeUndefined();
    expect(items[1].transition).toEqual({ kind: "fade", frames: 18 });
  });

  it("rythmé : 1,2 s par image, coupes franches, zooms alternés", () => {
    const items = mainItems(buildSequence("R", "9:16", [image("a.png"), image("b.png"), image("c.png")], "rhythm")) as ImageItem[];
    expect(items.map((item) => item.duration)).toEqual([36, 36, 36]);
    expect(items.every((item) => !item.transition)).toBe(true);
    expect(items.map((item) => item.motion)).toEqual(["zoom-in", "zoom-out", "zoom-in"]);
  });

  it("accepte les vidéos, raccourcies à 2,4 s en rythmé", () => {
    const slideshow = mainItems(buildSequence("V", "9:16", [video("clip.mp4", 8000), image("a.png")], "slideshow"));
    expect(slideshow[0].type).toBe("video");
    expect(slideshow[0].duration).toBe(240);
    expect(slideshow[1].start).toBe(240);

    const rhythm = mainItems(buildSequence("V", "9:16", [video("clip.mp4", 8000)], "rhythm"));
    expect(rhythm[0].duration).toBe(72);
  });
});
