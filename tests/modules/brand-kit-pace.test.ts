import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKit, getBrandTheme, requireKit, saveKit } from "@/modules/brand-kit/lib/server/kits";
import { setDataRoot } from "@/modules/brand-kit/lib/server/store";
import { sanitizeKit } from "@/modules/brand-kit/lib/validate";
import { beatSounds, longestStill } from "@/modules/clip-studio/engine/rhythm";
import { buildFromTemplate, type FreeData, type VoiceClip } from "@/modules/clip-studio/engine/templates";
import type { ClipProject, MediaSource } from "@/modules/clip-studio/engine/types";
import { assistantPace } from "@/modules/clip-studio/lib/assistant";

// « Rythme du montage » (dossier 07 sexies, D3) : le réglage de l'éditeur de
// la marque est enregistré par le serveur, passe dans le thème que Clip
// Studio et l'assistant lisent, et change réellement le clip monté ensuite.

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-kit-pace-"));
  setDataRoot(root);
});
afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

// ─── Données neutres ─────────────────────────────────────────────

const image = (name: string): MediaSource => ({ url: `/test/${name}.png`, ref: `test:${name}`, name, kind: "image", width: 1600, height: 1067 });

/** Voix de synthèse factice : un mot toutes les 330 ms. */
function voice(text: string): VoiceClip {
  const words = text.split(/\s+/).map((word, index) => ({ text: word, startMs: 100 + index * 330, endMs: 100 + index * 330 + 300 }));
  const durationMs = 100 + words.length * 330 + 200;
  return { durationMs, source: { url: "/test/voix.wav", ref: "test:voix", name: "voix", kind: "audio", durationMs, words, speech: { text, voice: "test" } } };
}

const FREE: FreeData = {
  title: "Trois gestes pour un jardin en ville",
  subtitle: "Sur un balcon",
  outro: "Lequel vas-tu tenter ?",
  voice: { intro: voice("Trois gestes pour un jardin en ville. Sur un balcon."), outro: voice("Lequel vas-tu tenter ?") },
  scenes: [
    { heading: "Un bac profond", text: "Trente centimètres de terre suffisent aux tomates cerises et au basilic." },
    { heading: "L’arrosage du soir", text: "Arroser après le coucher du soleil limite l’évaporation de moitié." },
    { heading: "Des fleurs mellifères", text: "La lavande et la bourrache attirent les pollinisateurs jusqu’au cinquième étage." },
  ].map((scene, index) => ({ ...scene, image: image(`jardin-${index}`), voice: voice(`${scene.heading}. ${scene.text}`) })) as FreeData["scenes"],
};

const montage = (kitId: string): ClipProject => buildFromTemplate("free", "Jardin", "9:16", FREE, getBrandTheme(kitId));
const shotLabels = (project: ClipProject) => project.tracks.flatMap((track) => track.items).filter((item) => (item.label ?? "").startsWith("Plan "));

describe("rythme du montage d'une marque", () => {
  it("garde le choix de l'éditeur, refuse une valeur inconnue et garde alors celle enregistrée", () => {
    const kit = createKit({ name: "Atelier Lumen" });
    expect(kit.pace).toBeUndefined();
    expect(sanitizeKit({ ...kit, pace: "lively" }, kit).pace).toBe("lively");
    const stored = { ...kit, pace: "calm" as const };
    expect(sanitizeKit({ ...kit, pace: "rapide" }, stored).pace).toBe("calm");
    expect(sanitizeKit({ ...kit, pace: undefined }, stored).pace).toBe("calm");
    expect(sanitizeKit({ ...kit, pace: 3 }, kit).pace).toBeUndefined();
  });

  it("s'enregistre, passe dans le thème de Clip Studio et de l'assistant", () => {
    const kit = createKit({ name: "Atelier Lumen" });
    // Jamais réglé : le rythme normal.
    expect(getBrandTheme(kit.id).pace).toBe("normal");
    const saved = saveKit({ ...kit, pace: "lively" }, kit.updatedAt);
    expect(saved.pace).toBe("lively");
    expect(requireKit(kit.id).pace).toBe("lively");
    const theme = getBrandTheme(kit.id);
    expect(theme.pace).toBe("lively");
    expect(assistantPace({ theme })).toBe("lively");
    // Une autre modification de la fiche le garde.
    const renamed = saveKit({ ...saved, name: "Atelier Lumen Nord" }, saved.updatedAt);
    expect(renamed.pace).toBe("lively");
  });

  it("change réellement le clip monté ensuite avec la marque", () => {
    const kit = createKit({ name: "Atelier Lumen" });
    const fps = montage(kit.id).fps;

    const normal = montage(kit.id);
    expect(longestStill(normal).frames).toBeLessThanOrEqual(2.5 * fps);

    const lively = saveKit({ ...kit, pace: "lively" }, kit.updatedAt);
    const livelyClip = montage(kit.id);
    expect(longestStill(livelyClip).frames).toBeLessThanOrEqual(1.5 * fps);
    expect(shotLabels(livelyClip).length).toBeGreaterThan(shotLabels(normal).length);

    saveKit({ ...lively, pace: "calm" }, lively.updatedAt);
    const calmClip = montage(kit.id);
    // Le montage d'avant : ni plans découpés, ni bruitages, des plans longs.
    expect(shotLabels(calmClip)).toHaveLength(0);
    expect(beatSounds(calmClip)).toHaveLength(0);
    expect(longestStill(calmClip).frames).toBeGreaterThan(2.5 * fps);
  });
});
