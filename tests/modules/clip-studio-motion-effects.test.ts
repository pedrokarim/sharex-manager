import { describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  caretVisible,
  counterText,
  findNumber,
  formatLike,
  lockRanks,
  scrambleGlyph,
  scrambleLines,
  scrambleTick,
  THIN_NBSP,
} from "@/modules/clip-studio/engine/motion/effects";
import { echoProgress, gridRanks, isRestState, sampleLayer, sampleTracks, tileTiming } from "@/modules/clip-studio/engine/motion/interpret";
import { EFFECT_PRESETS } from "@/modules/clip-studio/engine/motion/presets/effects";
import { ELEMENT_PRESETS } from "@/modules/clip-studio/engine/motion/presets/elements";
import { getPreset } from "@/modules/clip-studio/engine/motion/registry";
import { MOTION_CATEGORY_LABELS, type MotionPreset, type MotionState } from "@/modules/clip-studio/engine/motion/types";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import { motionAt } from "@/modules/clip-studio/engine/timeline";
import type { Anim, ClipProject, ShapeItem, TextItem, VisualItem } from "@/modules/clip-studio/engine/types";

/**
 * Effets (étape A4) : compteur, brouillage, curseur, calques secondaires,
 * masques de forme, ancrage, espacement par lettre et grilles.
 */

const label = (preset: MotionPreset) => `${preset.id} (${preset.phase})`;

const NUMERIC = [
  "opacity", "x", "y", "dx", "dy", "scale", "scaleX", "scaleY", "rotate", "skewX", "blur", "brightness", "reveal", "wipe", "tracking", "mask",
] as const;
const finite = (state: MotionState) => NUMERIC.every((key) => Number.isFinite(state[key])) && state.clip.every(Number.isFinite);

// ─── Compteur ────────────────────────────────────────────────────

describe("compteur", () => {
  it("compte « 0 → 1 250 » au format français, espace fine insécable comprise", () => {
    const text = `1${THIN_NBSP}250`;
    expect(counterText(text, 0)).toBe("0");
    expect(counterText(text, 1)).toBe(text);
    const values: number[] = [];
    for (let i = 0; i <= 100; i++) {
      const shown = counterText(text, i / 100, { ease: "linear" });
      expect(shown, shown).toMatch(/^\d{1,3}( \d{3})*$/);
      values.push(Number(shown.replace(/ /g, "")));
    }
    expect(values[50]).toBe(625);
    expect(counterText(text, 0.9, { ease: "linear" })).toBe(`1${THIN_NBSP}125`);
    // Monotone : un compteur ne recule jamais.
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  });

  it("reprend l'écriture du nombre : décimales, virgule, signe, texte autour", () => {
    expect(findNumber("Prix : 12,50 €")).toMatchObject({ value: 12.5, decimals: 2, decimal: "," });
    expect(counterText("Prix : 12,50 €", 0.5, { ease: "linear" })).toBe("Prix : 6,25 €");
    expect(counterText("-40 °C", 0.5, { ease: "linear" })).toBe("-20 °C");
    expect(counterText("1250 vues", 0.5, { ease: "linear" })).toBe("625 vues");
    expect(counterText(`2${THIN_NBSP}000${THIN_NBSP}000`, 0.5, { ease: "linear" })).toBe(`1${THIN_NBSP}000${THIN_NBSP}000`);
    expect(counterText("Bonjour", 0.5)).toBe("Bonjour");
    expect(formatLike(1234567.891, { decimals: 1, group: THIN_NBSP, decimal: "," })).toBe(`1${THIN_NBSP}234${THIN_NBSP}567,9`);
  });

  it("s'affiche dans le rendu, du premier chiffre jusqu'au texte exact", () => {
    const item = text({ text: `1${THIN_NBSP}250 €`, animIn: { kind: "count-up", frames: 30 } });
    const shown: string[] = [];
    for (let frame = 0; frame < 32; frame++) {
      const { ctx, log } = recordingContext();
      drawFrame(ctx, projectWith(item), frame, () => null);
      shown.push(log.filter((line) => line.startsWith("fillText(")).map((line) => line.split(",")[0].slice(9)).join(" "));
    }
    expect(shown[29]).toBe(`1${THIN_NBSP}250 €`);
    expect(shown[31]).toBe(`1${THIN_NBSP}250 €`);
    expect(shown[5]).toMatch(/^\d{1,3}( \d{3})? €$/);
    expect(shown[5]).not.toBe(shown[29]);
  });
});

// ─── Brouillage et curseur ───────────────────────────────────────

describe("brouillage", () => {
  it("tire les mêmes caractères pour la même graine, le même rang et le même instant", () => {
    expect(scrambleGlyph("A", "titre", 3, 7)).toBe(scrambleGlyph("A", "titre", 3, 7));
    const tick = scrambleTick(12, 30, 25);
    expect(tick).toBe(10);
    // Le caractère change d'un instant à l'autre (au moins une fois sur dix).
    const glyphs = new Set(Array.from({ length: 10 }, (_, t) => scrambleGlyph("A", "titre", 3, t)));
    expect(glyphs.size).toBeGreaterThan(1);
    expect(scrambleGlyph(" ", "titre", 0, 1)).toBe(" ");
    expect(scrambleGlyph("!", "titre", 0, 1)).toBe("!");
    expect(scrambleGlyph("7", "titre", 0, 1)).toMatch(/^\d$/);
    expect(scrambleGlyph("é", "titre", 0, 1)).toMatch(/^[a-z]$/);
  });

  it("garde le nombre de graphèmes de chaque ligne et fixe tout à la fin", () => {
    const lines = ["L’été 🎉", "c’est top"];
    const mixed = scrambleLines(lines, 0.3, { order: "center" }, "seed", 4);
    expect(mixed.map((line) => [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(line)].length)).toEqual(
      lines.map((line) => [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(line)].length)
    );
    expect(scrambleLines(lines, 1, {}, "seed", 4)).toEqual(lines);
    const ranks = lockRanks(9, "random", "seed");
    expect([...ranks].sort()).toEqual(Array.from({ length: 9 }, (_, i) => i / 8));
  });

  it("dessine un décodage identique à l'aperçu et à l'export, dans n'importe quel ordre d'images", async () => {
    const item = text({ text: "DÉCODAGE 2026", animIn: { kind: "decode-letters", frames: 40 } });
    const frameLog = (draw: typeof drawFrame, frame: number) => {
      const { ctx, log } = recordingContext();
      draw(ctx, projectWith(item), frame, () => null);
      return log.join("\n");
    };
    // Aperçu : lecture dans l'ordre ; export : lecture à rebours, dans un moteur fraîchement chargé.
    const preview = Array.from({ length: 42 }, (_, frame) => frameLog(drawFrame, frame));
    vi.resetModules();
    const fresh = await import("@/modules/clip-studio/engine/render");
    for (let frame = 41; frame >= 0; frame--) expect(frameLog(fresh.drawFrame, frame), `image ${frame}`).toBe(preview[frame]);
    // Les premières images sont brouillées, la dernière montre le texte exact.
    expect(preview[2]).not.toMatch(/fillText\(D,/);
    const last = preview[39].split("\n").filter((line) => line.startsWith("fillText(")).map((line) => line.slice(9, line.indexOf(",")));
    expect(last.join("")).toBe("DÉCODAGE 2026");
  });

  it("clignote une fois la frappe finie, plein pendant la frappe", () => {
    expect(caretVisible(true, 1234, 1000)).toBe(true);
    expect(caretVisible(false, 100, 1000)).toBe(true);
    expect(caretVisible(false, 600, 1000)).toBe(false);
    expect(caretVisible(false, 1100, 1000)).toBe(true);
    const item = text({ text: "Bonjour", animIn: { kind: "type-caret", frames: 60 } });
    const { ctx, log } = recordingContext();
    drawFrame(ctx, projectWith(item), 20, () => null);
    // Une barre est posée après le texte en cours de frappe.
    expect(log.some((line) => line.startsWith("fillRect("))).toBe(true);
    expect(log.some((line) => line.startsWith("fillText(Bon"))).toBe(true);
  });
});

// ─── Préréglages d'effets ────────────────────────────────────────

describe("préréglages d'effets", () => {
  it("sont enregistrés, nommés en français, rangés dans nos catégories", () => {
    for (const preset of EFFECT_PRESETS) {
      expect(getPreset(preset.id, preset.phase), label(preset)).toBe(preset);
      expect(preset.label.length, label(preset)).toBeGreaterThan(2);
      expect(MOTION_CATEGORY_LABELS[preset.category], label(preset)).toBeDefined();
      expect(preset.durationMs, label(preset)).toBeGreaterThan(0);
    }
    expect(EFFECT_PRESETS.length).toBeGreaterThanOrEqual(45);
  });

  it("ne rendent aucune valeur non finie, ni pour l'élément ni pour ses calques", () => {
    for (const preset of EFFECT_PRESETS) {
      for (let i = 0; i <= 40; i++) {
        const p = i / 40;
        expect(finite(sampleTracks(preset, p)), `${label(preset)} à ${p}`).toBe(true);
        for (const layer of preset.layers ?? []) expect(finite(sampleLayer(preset, layer, p)), `${label(preset)} ${layer.kind} à ${p}`).toBe(true);
      }
    }
  });

  it("rendent l'élément au repos à la fin de chaque phase ; un calque qui reste ne saute pas", () => {
    const frames = 18;
    for (const preset of EFFECT_PRESETS) {
      const kinds: ("text" | "shape")[] = preset.target === "text" || preset.split ? ["text"] : ["text", "shape"];
      for (const kind of kinds) {
        const base = kind === "text" ? text({}) : shape({});
        const anim: Anim = { kind: preset.id, frames };
        const persistent = preset.layers?.some((layer) => layer.persist) ?? false;
        let item: VisualItem;
        let end: number;
        if (preset.phase === "in") {
          item = { ...base, animIn: anim } as VisualItem;
          end = frames - 1;
        } else if (preset.phase === "out") {
          item = { ...base, animOut: anim } as VisualItem;
          end = base.duration - frames - 1;
        } else {
          item = { ...base, animEmphasis: { ...anim, at: 4, repeat: 1 } } as VisualItem;
          end = 4 + frames - 1;
        }
        const name = `${label(preset)} sur ${kind}`;
        if (persistent) {
          // Le calque reste : l'image qui suit l'entrée est celle de sa fin.
          expect(pixels(item, end).equals(pixels(item, end + 1)), name).toBe(true);
        } else {
          expect(pixels(item, end).equals(pixels(base, end)), name).toBe(true);
        }
      }
    }
  }, 60_000);

  it("un fond de texte repris par un calque se dessine comme le fond du bloc", () => {
    const background = { color: "#e11d48", padding: 0.3, radius: 0.2 };
    const still = text({ style: { ...TEXT_STYLE, background } });
    const item = { ...still, animIn: { kind: "plate-wipe-in", frames: 20 } } as TextItem;
    expect(pixels(item, 30).equals(pixels(still, 30))).toBe(true);
    expect(pixels(item, 5).equals(pixels(still, 5))).toBe(false);
  });

  it("dessinent chaque image d'une phase sans erreur", () => {
    for (const preset of EFFECT_PRESETS) {
      const anim: Anim = { kind: preset.id, frames: 9 };
      const base = preset.target === "text" || preset.split ? text({}) : shape({});
      const item =
        preset.phase === "in"
          ? { ...base, animIn: anim }
          : preset.phase === "out"
            ? { ...base, animOut: anim }
            : { ...base, animEmphasis: { ...anim, at: 0, repeat: 0 } };
      for (let frame = 0; frame < 12; frame += 2) expect(() => pixels(item as VisualItem, frame), label(preset)).not.toThrow();
    }
  }, 60_000);

  it("les calques d'un élément sont éteints au repos", () => {
    for (const preset of [...EFFECT_PRESETS, ...ELEMENT_PRESETS]) {
      if (!preset.layers?.length) continue;
      const end = preset.phase === "out" ? 0 : 1;
      for (const layer of preset.layers) {
        if (layer.persist) continue;
        const state = sampleLayer(preset, layer, end);
        const visible = layer.kind === "echo" || layer.kind === "shine" ? state.opacity : state.opacity * (layer.kind === "plate" ? state.scaleX * state.wipe : 1);
        if (layer.kind === "highlight" || layer.kind === "underline" || layer.kind === "strike") continue;
        if (layer.kind === "shine") {
          expect(Math.abs(state.x) >= 0.8 || state.opacity === 0, label(preset)).toBe(true);
          continue;
        }
        expect(visible <= 0.001 || (layer.kind === "plate" && state.clip[3] >= 1), `${label(preset)} ${layer.kind}`).toBe(true);
      }
    }
  });
});

// ─── Calques, masques, grilles ───────────────────────────────────

describe("calques, masques et grilles", () => {
  it("une traîne rejoint l'élément à la fin de la phase", () => {
    expect(echoProgress(1, 3, 0.08)).toBe(1);
    expect(echoProgress(0.5, 1, 0.1)).toBeCloseTo(0.4 / 0.9);
    expect(echoProgress(0.05, 1, 0.1)).toBe(0);
  });

  it("un masque fermé ne dessine rien, ouvert il dessine l'élément tel quel", () => {
    const item = shape({ animIn: { kind: "iris-in", frames: 20 } });
    expect(motionAt(item, 0).state.maskShape?.shape).toBe("circle");
    expect(pixels(item, 19).equals(pixels(shape({}), 19))).toBe(true);
    for (const kind of ["iris-in", "diamond-in", "bias-wipe-in", "ink-in", "blinds-in", "bars-in", "clock-in", "tiles-in"]) {
      const opening = shape({ animIn: { kind, frames: 20 } });
      const half = pixels(opening, 9);
      expect(half.equals(pixels(shape({}), 9)), kind).toBe(false);
      expect(half.equals(pixels(shape({ transform: { ...shape({}).transform, opacity: 0 } }), 9)), kind).toBe(false);
    }
  });

  it("une grille fait partir chaque carreau à son rang, le dernier finit avec la phase", () => {
    for (const order of ["rows", "columns", "diagonal", "center", "spiral", "random"] as const) {
      const grid = { columns: 4, rows: 3, order };
      const ranks = gridRanks(grid, "seed");
      expect(ranks).toHaveLength(12);
      expect(Math.min(...ranks)).toBe(0);
      expect(Math.max(...ranks)).toBe(1);
      const preset = { ...EFFECT_PRESETS[0], grid, durationMs: 400, stagger: { eachMs: 50, from: "start" as const } };
      const ends = ranks.map((_, index) => {
        const { delay, span } = tileTiming(preset, grid, index, "seed");
        expect(delay).toBeGreaterThanOrEqual(0);
        return delay + span;
      });
      expect(Math.max(...ends)).toBeCloseTo(1, 9);
    }
    // La spirale passe une fois par chaque carreau.
    expect([...gridRanks({ columns: 3, rows: 3, order: "spiral" }, "")].sort()).toEqual(Array.from({ length: 9 }, (_, i) => i / 8));
  });

  it("un élément sans calque ni effet rend l'état de toujours, avec des listes vides", () => {
    const item = shape({ animIn: { kind: "pop", frames: 10 } });
    const motion = motionAt(item, 3);
    expect(motion.layers).toEqual([]);
    expect(motion.effects).toEqual([]);
    expect(isRestState(motionAt(item, 30).state)).toBe(true);
  });
});

// ─── Outils ──────────────────────────────────────────────────────

const W = 270;
const H = 480;

const TEXT_STYLE: TextItem["style"] = {
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
};

const NONE: Anim = { kind: "none", frames: 0 };

function text(overrides: Partial<TextItem> = {}): TextItem {
  return {
    id: "texte",
    type: "text",
    text: "Effet 1 250",
    style: TEXT_STYLE,
    start: 0,
    duration: 60,
    transform: { x: 0.5, y: 0.5, width: 0.9, height: 0.3, rotation: 0, opacity: 1 },
    animIn: NONE,
    animOut: NONE,
    ...overrides,
  };
}

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

function projectWith(item: VisualItem): ClipProject {
  return {
    version: 1,
    id: "projet",
    name: "Effets",
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

/** Contexte qui enregistre les appels : deux rendus identiques donnent le même journal. */
function recordingContext() {
  const log: string[] = [];
  const state: Record<string, unknown> = { filter: "none", font: "10px Arial", letterSpacing: "0px", globalAlpha: 1 };
  const stack: Record<string, unknown>[] = [];
  const target = {
    save: () => {
      stack.push({ ...state });
      log.push("save");
    },
    restore: () => {
      Object.assign(state, stack.pop());
      log.push("restore");
    },
    measureText: (value: string) => ({ width: [...value].length * 10 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  const ctx = new Proxy(target as Record<string, unknown>, {
    get(object, key: string) {
      if (key in object) return object[key];
      if (key in state) return state[key];
      return (...args: unknown[]) => log.push(`${key}(${args.map((arg) => (typeof arg === "number" ? arg.toFixed(4) : String(arg))).join(",")})`);
    },
    set(_object, key: string, value) {
      state[key] = value;
      log.push(`${key}=${value}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}
