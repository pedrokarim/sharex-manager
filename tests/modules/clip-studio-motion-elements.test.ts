import { beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { resolveEase } from "@/modules/clip-studio/engine/motion/easing";
import { isRestState, sampleTracks } from "@/modules/clip-studio/engine/motion/interpret";
import { ELEMENT_PRESETS } from "@/modules/clip-studio/engine/motion/presets/elements";
import { LEGACY_PRESETS } from "@/modules/clip-studio/engine/motion/presets/legacy";
import { TEXT_PRESETS } from "@/modules/clip-studio/engine/motion/presets/text";
import { getPreset, listPresets, registerPresets } from "@/modules/clip-studio/engine/motion/registry";
import {
  MOTION_CATEGORY_LABELS,
  type MotionParamValues,
  type MotionPreset,
  type MotionState,
} from "@/modules/clip-studio/engine/motion/types";
import { animStateAt } from "@/modules/clip-studio/engine/timeline";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import type { ClipProject, ShapeItem } from "@/modules/clip-studio/engine/types";

/**
 * Préréglages d'éléments (images, vidéos, formes, textes en bloc) : forme
 * des données, repos atteint ou quitté, boucles refermées, aucune valeur
 * invalide quels que soient les réglages, et dessin identique au repos.
 */

const grid = (steps: number) => Array.from({ length: steps + 1 }, (_, index) => index / steps);

const NUMERIC_KEYS = [
  "opacity",
  "dx",
  "dy",
  "x",
  "y",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "skewX",
  "blur",
  "brightness",
  "reveal",
  "wipe",
  "tracking",
] as const satisfies readonly (keyof MotionState)[];

function expectFinite(state: MotionState, where: string) {
  for (const key of NUMERIC_KEYS) expect(Number.isFinite(state[key]), `${where} ${key}`).toBe(true);
  for (const side of state.clip) expect(Number.isFinite(side), `${where} clip`).toBe(true);
}

/** Toutes les combinaisons de réglages qui méritent d'être essayées. */
function paramVariants(preset: MotionPreset): (MotionParamValues | undefined)[] {
  const variants: (MotionParamValues | undefined)[] = [undefined];
  for (const param of preset.params ?? []) {
    if (param.kind === "amount") {
      for (const value of [param.min, param.default, param.max]) variants.push({ [param.id]: value });
    } else {
      for (const value of param.options ?? ["up", "down", "left", "right"]) variants.push({ [param.id]: value });
    }
  }
  return variants;
}

const label = (preset: MotionPreset) => `${preset.id} (${preset.phase})`;

/** Ajoute au registre partagé ceux qui n'y sont pas encore (branchement fait ou non). */
function ensureRegistered(lookup: typeof getPreset, register: typeof registerPresets) {
  const missing = ELEMENT_PRESETS.filter((preset) => lookup(preset.id, preset.phase)?.phase !== preset.phase);
  register(missing);
  return missing;
}

describe("préréglages d'éléments : données", () => {
  it("sont nombreux et bien formés", () => {
    expect(ELEMENT_PRESETS.length).toBeGreaterThanOrEqual(70);
    for (const preset of ELEMENT_PRESETS) {
      expect(preset.id, label(preset)).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(preset.label.trim().length, label(preset)).toBeGreaterThan(2);
      expect(Object.keys(MOTION_CATEGORY_LABELS), label(preset)).toContain(preset.category);
      expect(["in", "out", "emphasis", "loop"], label(preset)).toContain(preset.phase);
      expect(preset.target, label(preset)).toBe("any");
      expect(preset.units, label(preset)).toBe("frame");
      expect(preset.split, label(preset)).toBeUndefined();
      expect(Number.isFinite(preset.durationMs) && preset.durationMs > 0, label(preset)).toBe(true);
      expect(Object.keys(preset.tracks).length, label(preset)).toBeGreaterThan(0);
    }
  });

  it("ont des images clés ordonnées entre 0 et 1, aux valeurs et courbes valides", () => {
    for (const preset of ELEMENT_PRESETS) {
      if (preset.ease) expect(Number.isFinite(resolveEase(preset.ease)(0.5)), label(preset)).toBe(true);
      for (const [property, frames] of Object.entries(preset.tracks)) {
        const where = `${label(preset)} ${property}`;
        expect(frames!.length, where).toBeGreaterThan(0);
        let previous = -Infinity;
        for (const frame of frames!) {
          expect(frame.at, where).toBeGreaterThanOrEqual(0);
          expect(frame.at, where).toBeLessThanOrEqual(1);
          expect(frame.at, where).toBeGreaterThanOrEqual(previous);
          previous = frame.at;
          if (property === "clip") {
            expect(Array.isArray(frame.value) && frame.value.length === 4 && frame.value.every(Number.isFinite), where).toBe(true);
          } else {
            expect(typeof frame.value === "number" && Number.isFinite(frame.value), where).toBe(true);
          }
          if (frame.ease !== undefined) expect(Number.isFinite(resolveEase(frame.ease)(0.5)), where).toBe(true);
        }
      }
    }
  });

  it("ont un identifiant unique par phase, distinct des animations d'origine et des préréglages de texte", async () => {
    const keys = ELEMENT_PRESETS.map((preset) => `${preset.phase}:${preset.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    // La bibliothèque de texte s'écrit à part : on la compte si elle est là.
    const library: MotionPreset[] = await import("@/modules/clip-studio/engine/motion/presets/text-library")
      .then((module: Record<string, unknown>) => (Array.isArray(module.TEXT_LIBRARY_PRESETS) ? module.TEXT_LIBRARY_PRESETS : []))
      .catch(() => []);
    // Un identifiant partagé, même dans une autre phase, ferait jouer l'un à la place de l'autre à rebours.
    const taken = new Set([...LEGACY_PRESETS, ...TEXT_PRESETS, ...library].map((preset) => preset.id));
    for (const preset of ELEMENT_PRESETS) expect(taken.has(preset.id), label(preset)).toBe(false);
    const ids = ELEMENT_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("couvrent les quatre phases", () => {
    for (const phase of ["in", "out", "emphasis", "loop"] as const) {
      expect(ELEMENT_PRESETS.some((preset) => preset.phase === phase), phase).toBe(true);
    }
  });
});

describe("préréglages d'éléments : repos", () => {
  it("une entrée finit au repos et part d'ailleurs", () => {
    for (const preset of ELEMENT_PRESETS.filter((p) => p.phase === "in")) {
      expect(isRestState(sampleTracks(preset, 1)), label(preset)).toBe(true);
      expect(isRestState(sampleTracks(preset, 0)), label(preset)).toBe(false);
    }
  });

  it("une sortie part du repos et le quitte", () => {
    for (const preset of ELEMENT_PRESETS.filter((p) => p.phase === "out")) {
      expect(isRestState(sampleTracks(preset, 0)), label(preset)).toBe(true);
      expect(isRestState(sampleTracks(preset, 1)), label(preset)).toBe(false);
    }
  });

  it("une mise en avant part du repos, s'en écarte et y revient", () => {
    for (const preset of ELEMENT_PRESETS.filter((p) => p.phase === "emphasis")) {
      expect(isRestState(sampleTracks(preset, 0)), label(preset)).toBe(true);
      expect(isRestState(sampleTracks(preset, 1)), label(preset)).toBe(true);
      expect(grid(20).some((p) => !isRestState(sampleTracks(preset, p))), label(preset)).toBe(true);
    }
  });

  it("une boucle part du repos et se referme", () => {
    for (const preset of ELEMENT_PRESETS.filter((p) => p.phase === "loop")) {
      const start = sampleTracks(preset, 0);
      const end = sampleTracks(preset, 1);
      expect(isRestState(start), label(preset)).toBe(true);
      expect(end, label(preset)).toEqual(start);
      expect(grid(20).some((p) => !isRestState(sampleTracks(preset, p))), label(preset)).toBe(true);
    }
  });

  it("garde ces règles et reste fini quels que soient les réglages", () => {
    for (const preset of ELEMENT_PRESETS) {
      for (const params of paramVariants(preset)) {
        const where = `${label(preset)} ${JSON.stringify(params ?? {})}`;
        for (const p of grid(40)) expectFinite(sampleTracks(preset, p, params), `${where} p=${p}`);
        const end = preset.phase === "out" ? 0 : 1;
        expect(isRestState(sampleTracks(preset, end, params)), where).toBe(true);
        if (preset.phase !== "in") expect(isRestState(sampleTracks(preset, 0, params)), where).toBe(true);
      }
    }
  }, 30_000);

  it("une intensité nulle fige les propriétés qu'elle règle", () => {
    for (const preset of ELEMENT_PRESETS) {
      for (const param of preset.params ?? []) {
        if (param.kind !== "amount" || param.min !== 0) continue;
        for (const p of grid(10)) {
          const state = sampleTracks(preset, p, { [param.id]: 0 });
          for (const property of param.affects) {
            const rest = ["opacity", "scale", "scaleX", "scaleY", "brightness", "reveal", "wipe"].includes(property) ? 1 : 0;
            expect(state[property as keyof MotionState], `${label(preset)} ${property} p=${p}`).toBeCloseTo(rest, 9);
          }
        }
      }
    }
  });

  it("donne les mêmes valeurs à chaque appel", () => {
    for (const preset of ELEMENT_PRESETS) {
      for (const p of [0.1, 0.37, 0.5, 0.83]) expect(sampleTracks(preset, p), label(preset)).toEqual(sampleTracks(preset, p));
    }
  });
});

describe("préréglages d'éléments : sur la timeline et au dessin", () => {
  beforeAll(() => {
    ensureRegistered(getPreset, registerPresets);
  });

  const W = 90;
  const H = 160;

  function shape(overrides: Partial<ShapeItem> = {}): ShapeItem {
    return {
      id: "element",
      type: "shape",
      shape: "rect",
      fill: "#e0e0e0",
      radius: 0.1,
      start: 0,
      duration: 90,
      transform: { x: 0.5, y: 0.5, width: 0.4, height: 0.16, rotation: 0, opacity: 1 },
      animIn: { kind: "none", frames: 1 },
      animOut: { kind: "none", frames: 1 },
      ...overrides,
    };
  }

  function project(item: ShapeItem): ClipProject {
    return {
      version: 1,
      id: "projet",
      name: "Préréglages",
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

  function pixels(item: ShapeItem, frame: number): Buffer {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    drawFrame(ctx as unknown as CanvasRenderingContext2D, project(item), frame, () => null);
    return Buffer.from(ctx.getImageData(0, 0, W, H).data);
  }

  const still = pixels(shape(), 45);

  it("sont trouvés par le registre sous leur phase", () => {
    for (const preset of ELEMENT_PRESETS) {
      expect(getPreset(preset.id, preset.phase)?.id, label(preset)).toBe(preset.id);
      expect(listPresets({ phase: preset.phase, target: "image" }).some((p) => p.id === preset.id), label(preset)).toBe(true);
    }
  });

  it("rendent l'élément au repos, au pixel près, à la fin de chaque phase", () => {
    const frames = 20;
    for (const preset of ELEMENT_PRESETS) {
      const anim = { kind: preset.id, frames };
      let item: ShapeItem;
      let frame: number;
      if (preset.phase === "in") {
        item = shape({ animIn: anim });
        frame = frames - 1;
      } else if (preset.phase === "out") {
        item = shape({ animOut: anim });
        frame = item.duration - frames - 1;
      } else {
        item = shape({ animEmphasis: { ...anim, at: 10, repeat: 1 } });
        frame = 10 + frames - 1;
      }
      expect(isRestState(animStateAt(item, frame)), label(preset)).toBe(true);
      expect(pixels(item, frame).equals(still), label(preset)).toBe(true);
    }
  }, 30_000);

  it("dessinent chaque image d'une phase sans erreur", () => {
    for (const preset of ELEMENT_PRESETS) {
      const anim = { kind: preset.id, frames: 12 };
      const item =
        preset.phase === "in"
          ? shape({ animIn: anim })
          : preset.phase === "out"
            ? shape({ animOut: anim })
            : shape({ animEmphasis: { ...anim, at: 0, repeat: 0 } });
      for (let frame = 0; frame < item.duration; frame += 3) expect(() => pixels(item, frame), label(preset)).not.toThrow();
    }
  }, 30_000);
});

describe("préréglages d'éléments : enregistrement", () => {
  it("s'enregistrent dans un registre neuf, et un doublon est refusé", async () => {
    vi.resetModules();
    const fresh = await import("@/modules/clip-studio/engine/motion/registry");
    const missing = ensureRegistered(fresh.getPreset, fresh.registerPresets);
    // Soit le registre les connaît déjà (branchés), soit ils viennent tous d'y entrer.
    expect([0, ELEMENT_PRESETS.length]).toContain(missing.length);
    for (const preset of ELEMENT_PRESETS) {
      const found = fresh.getPreset(preset.id, preset.phase);
      expect(found?.phase, label(preset)).toBe(preset.phase);
      expect(found?.tracks, label(preset)).toEqual(preset.tracks);
    }
    expect(() => fresh.registerPresets([ELEMENT_PRESETS[0]])).toThrow(/double/);
  });
});
