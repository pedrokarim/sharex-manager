import { describe, expect, it } from "vitest";
import { SAMPLE_FREE, buildFree, buildFromTemplate } from "@/modules/clip-studio/engine/templates";
import type { TextItem } from "@/modules/clip-studio/engine/types";

const texts = (project: ReturnType<typeof buildFree>) =>
  project.tracks.flatMap((track) => track.items).filter((item): item is TextItem => item.type === "text");

describe("modèle libre", () => {
  it("monte le titre, chaque séquence et la conclusion", () => {
    const project = buildFromTemplate("free", "Exemple", "9:16", SAMPLE_FREE);
    const content = texts(project).map((item) => item.text);
    expect(content).toContain(SAMPLE_FREE.title);
    expect(content).toContain(SAMPLE_FREE.outro);
    for (const scene of SAMPLE_FREE.scenes) {
      expect(content).toContain(scene.heading);
      expect(content).toContain(scene.text);
    }
  });

  it("accepte une séquence faite d'un titre seul ou d'un texte seul", () => {
    const project = buildFree("Test", "16:9", {
      scenes: [{ heading: "Seulement un titre" }, { text: "Seulement un texte" }],
    });
    const items = texts(project);
    expect(items.map((item) => item.text)).toEqual(["Seulement un titre", "Seulement un texte"]);
    // Seul à l'écran, il se centre.
    expect(items.every((item) => item.transform.y === 0.5 || item.transform.y === 0.46)).toBe(true);
  });

  it("allonge une séquence pour laisser finir sa narration", () => {
    const voice = {
      durationMs: 9000,
      source: { url: "/voice.wav", ref: "module:clip-studio/assets/voice.wav", name: "voice.wav", kind: "audio" as const },
    };
    const project = buildFree("Test", "9:16", { scenes: [{ text: "Long texte lu", voice }] });
    const [item] = texts(project);
    expect(item.start + item.duration).toBeGreaterThanOrEqual(Math.round(9 * project.fps));
  });
});
