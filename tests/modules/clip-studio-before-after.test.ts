import { describe, expect, it } from "vitest";
import {
  SAMPLE_BEFORE_AFTER,
  buildBeforeAfter,
  buildFromTemplate,
} from "@/modules/clip-studio/engine/templates";
import type { ClipItem, ImageItem, MediaSource } from "@/modules/clip-studio/engine/types";

const image = (name: string): MediaSource => ({
  url: `/api/files/${name}`,
  ref: `upload:${name}`,
  name,
  kind: "image",
  width: 1080,
  height: 1920,
});

const itemsOf = (project: ReturnType<typeof buildBeforeAfter>) =>
  project.tracks.flatMap((track) => track.items.map((item) => ({ track: track.name, item })));

describe("modèle Avant / Après", () => {
  const project = buildBeforeAfter("Test", "9:16", {
    pairs: [
      { before: image("a.png"), after: image("b.png") },
      { before: image("c.png"), after: image("d.png"), caption: "Salon" },
    ],
  });
  const images = itemsOf(project).filter(({ item }) => item.type === "image") as {
    track: string;
    item: ImageItem;
  }[];

  it("pose chaque « après » au-dessus de son « avant », en balayage", () => {
    const [before, after] = ["a.png", "b.png"].map(
      (name) => images.find(({ item }) => item.source.name === name)!
    );
    const order = project.tracks.map((track) => track.name);
    expect(order.indexOf(after.track)).toBeLessThan(order.indexOf(before.track));
    expect(after.item.animIn.kind).toBe("wipe");
    expect(after.item.start).toBeGreaterThan(before.item.start);
    // Les deux se terminent ensemble : l'« après » reste jusqu'à la fin de la paire.
    expect(after.item.start + after.item.duration).toBe(before.item.start + before.item.duration);
  });

  it("garde les deux images immobiles et plein cadre", () => {
    for (const { item } of images) {
      expect(item.motion).toBe("none");
      expect(item.transform).toMatchObject({ x: 0.5, y: 0.5, width: 1, height: 1 });
    }
  });

  it("enchaîne les paires sans chevauchement sur une même piste", () => {
    for (const track of project.tracks) {
      const sorted = [...track.items].sort((a, b) => a.start - b.start);
      sorted.slice(1).forEach((item: ClipItem, index) => {
        const previous = sorted[index];
        expect(item.start).toBeGreaterThanOrEqual(previous.start + previous.duration);
      });
    }
  });

  it("affiche les étiquettes et la légende", () => {
    const texts = itemsOf(project)
      .filter(({ item }) => item.type === "text")
      .map(({ item }) => (item as { text: string }).text);
    expect(texts.filter((text) => text === "Avant")).toHaveLength(2);
    expect(texts.filter((text) => text === "Après")).toHaveLength(2);
    expect(texts).toContain("Salon");
  });

  it("se construit aussi depuis l'exemple, sans image", () => {
    const sample = buildFromTemplate("before-after", "Exemple", "16:9", SAMPLE_BEFORE_AFTER);
    const plates = itemsOf(sample).filter(({ track, item }) => track.startsWith("Après") && item.type === "shape");
    expect(plates).toHaveLength(SAMPLE_BEFORE_AFTER.pairs.length);
    expect(plates.every(({ item }) => "animIn" in item && item.animIn.kind === "wipe")).toBe(true);
  });
});
