import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { sampleLayer, sampleTracks } from "@/modules/clip-studio/engine/motion/interpret";
import { ATTENTION_PRESETS } from "@/modules/clip-studio/engine/motion/presets/attention";
import { getPreset, listPresets } from "@/modules/clip-studio/engine/motion/registry";
import { MOTION_CATEGORY_LABELS, type MotionPreset, type MotionState } from "@/modules/clip-studio/engine/motion/types";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import { activePhaseAt, motionAt } from "@/modules/clip-studio/engine/timeline";
import type { Anim, ClipProject, ShapeItem, TextItem, VisualItem } from "@/modules/clip-studio/engine/types";

/**
 * Mises en avant, boucles et grilles (étape A6).
 */

const label = (preset: MotionPreset) => `${preset.id} (${preset.phase})`;

const NUMERIC = [
  "opacity", "x", "y", "dx", "dy", "scale", "scaleX", "scaleY", "rotate", "skewX", "blur", "brightness", "reveal", "wipe", "tracking", "mask",
] as const;

function distance(a: MotionState, b: MotionState): number {
  let worst = 0;
  for (const key of NUMERIC) worst = Math.max(worst, Math.abs(a[key] - b[key]));
  if (a.color !== b.color) worst = Math.max(worst, 1);
  return worst;
}

describe("mises en avant et boucles", () => {
  it("sont enregistrées, nommées en français, rangées dans nos catégories", () => {
    for (const preset of ATTENTION_PRESETS) {
      expect(getPreset(preset.id, preset.phase), label(preset)).toBe(preset);
      expect(MOTION_CATEGORY_LABELS[preset.category], label(preset)).toBeDefined();
      expect(preset.label.length, label(preset)).toBeGreaterThan(2);
    }
    expect(ATTENTION_PRESETS.length).toBeGreaterThanOrEqual(20);
  });

  it("chaque boucle finit là où elle commence, calques compris", () => {
    for (const preset of listPresets({ phase: "loop" })) {
      expect(distance(sampleTracks(preset, 0), sampleTracks(preset, 1)), label(preset)).toBeLessThan(1e-6);
      for (const layer of preset.layers ?? []) {
        // Un calque éteint aux deux bouts peut repartir d'ailleurs : on ne le voit pas.
        if (sampleLayer(preset, layer, 0).opacity <= 0.001 && sampleLayer(preset, layer, 1).opacity <= 0.001) continue;
        expect(distance(sampleLayer(preset, layer, 0), sampleLayer(preset, layer, 1)), `${label(preset)} ${layer.kind}`).toBeLessThan(1e-6);
      }
    }
  });

  it("partent du repos et y reviennent, au pixel près", () => {
    const frames = 16;
    for (const preset of ATTENTION_PRESETS) {
      if (preset.phase === "in") continue;
      const base = preset.target === "text" || preset.split ? text() : shape();
      const item = { ...base, animEmphasis: { kind: preset.id, frames, at: 6, repeat: 1 } } as VisualItem;
      expect(pixels(item, 6 + frames - 1).equals(pixels(base, 6 + frames - 1)), label(preset)).toBe(true);
      expect(pixels(item, 5).equals(pixels(base, 5)), label(preset)).toBe(true);
    }
  }, 30_000);

  it("une pulsation en boucle s'arrête avec la sortie de l'élément", () => {
    for (const kind of ["pulse-loop", "beat", "pulse-ring", "glow-breathe"]) {
      const looping = shape({ animEmphasis: { kind, frames: 9, at: 0, repeat: 0 }, animOut: { kind: "fade", frames: 10 } });
      const plain = shape({ animOut: { kind: "fade", frames: 10 } });
      // Elle tourne jusqu'à l'image qui précède la sortie…
      expect(activePhaseAt(looping, 49)?.phase, kind).toBe("emphasis");
      expect(pixels(looping, 40).equals(pixels(plain, 40)), kind).toBe(false);
      // … puis la sortie se joue seule, sans pulsation ni calque, jusqu'à la disparition.
      for (let frame = 50; frame <= 61; frame++) {
        if (frame < 60) expect(activePhaseAt(looping, frame)?.phase, `${kind} image ${frame}`).toBe("out");
        expect(motionAt(looping, frame).layers, `${kind} image ${frame}`).toEqual([]);
        expect(pixels(looping, frame).equals(pixels(plain, frame)), `${kind} image ${frame}`).toBe(true);
      }
    }
  });
});

describe("grilles", () => {
  it("reconstituent l'élément au pixel près à la fin de l'entrée, en carreaux décalés avant", () => {
    for (const preset of ATTENTION_PRESETS.filter((entry) => entry.grid)) {
      for (const base of [shape(), text()] as VisualItem[]) {
        const item = { ...base, animIn: { kind: preset.id, frames: 20 } } as VisualItem;
        expect(pixels(item, 19).equals(pixels(base, 19)), label(preset)).toBe(true);
        expect(pixels(item, 6).equals(pixels(base, 6)), label(preset)).toBe(false);
      }
    }
  }, 30_000);

  it("donnent le même dessin quel que soit l'ordre des images (aperçu et export)", () => {
    const item = shape({ animIn: { kind: "pixel-assemble-in", frames: 20 } });
    const forward = Array.from({ length: 20 }, (_, frame) => pixels(item, frame));
    for (let frame = 19; frame >= 0; frame--) expect(pixels(item, frame).equals(forward[frame]), `image ${frame}`).toBe(true);
  });
});

// ─── Outils ──────────────────────────────────────────────────────

const W = 216;
const H = 384;
const NONE: Anim = { kind: "none", frames: 0 };

function shape(overrides: Partial<ShapeItem> = {}): ShapeItem {
  return {
    id: "forme",
    type: "shape",
    shape: "rect",
    fill: "#38bdf8",
    radius: 0.1,
    start: 0,
    duration: 60,
    transform: { x: 0.5, y: 0.5, width: 0.5, height: 0.25, rotation: 0, opacity: 1 },
    animIn: NONE,
    animOut: NONE,
    ...overrides,
  };
}

function text(overrides: Partial<TextItem> = {}): TextItem {
  return {
    id: "texte",
    type: "text",
    text: "Bouge encore",
    style: {
      font: "Arial",
      weight: 800,
      size: 0.06,
      color: "#ffffff",
      align: "center",
      lineHeight: 1.2,
      uppercase: false,
      letterSpacing: 0,
      stroke: null,
      shadow: null,
      background: null,
    },
    start: 0,
    duration: 60,
    transform: { x: 0.5, y: 0.5, width: 0.9, height: 0.3, rotation: 0, opacity: 1 },
    animIn: NONE,
    animOut: NONE,
    ...overrides,
  };
}

function projectWith(item: VisualItem): ClipProject {
  return {
    version: 1,
    id: "projet",
    name: "Boucles",
    aspect: "9:16",
    width: W,
    height: H,
    fps: 30,
    background: "#101010",
    tracks: [{ id: "piste", kind: "visual", name: "Principale", items: [item] }],
    createdAt: 0,
    updatedAt: 0,
  };
}

function pixels(item: VisualItem, frame: number): Buffer {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  drawFrame(ctx as unknown as CanvasRenderingContext2D, projectWith(item), frame, () => null);
  return Buffer.from(ctx.getImageData(0, 0, W, H).data);
}
