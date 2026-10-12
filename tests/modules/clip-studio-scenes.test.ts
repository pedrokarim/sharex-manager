import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  CAMERA_REST,
  cameraValues,
  getTransition,
  LEGACY_CAMERA_IDS,
  LEGACY_TRANSITION_IDS,
  listCameraMoves,
  listShotFx,
  listTransitions,
  SHOT_REST,
  shotBlendAt,
  type ShotProperty,
} from "@/modules/clip-studio/engine/motion/scenes";
import { sampleKeyframes } from "@/modules/clip-studio/engine/motion/interpret";
import { drawFrame, shotFxAt } from "@/modules/clip-studio/engine/render";
import { cameraAt, transitionAt } from "@/modules/clip-studio/engine/timeline";
import type { ClipProject, ImageItem, ShotEffect, VisualItem } from "@/modules/clip-studio/engine/types";

/**
 * Transitions, caméra et effets de plan à pistes (étape A5). Les oracles
 * ci-dessous sont la copie conforme du moteur d'avant les pistes : les cinq
 * transitions et les sept mouvements d'origine doivent rendre les mêmes
 * valeurs, à 1e-9 près.
 */

const inOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

interface LegacyBlend {
  from: { opacity: number; dx: number; scale: number } | null;
  to: { opacity: number; dx: number; scale: number; wipe: number } | null;
  veil: number | null;
}

/** Ce que dessinait l'ancien `drawTransition` à l'avancement adouci `t` (plan non dessiné : `null`). */
function legacyTransition(kind: string, t: number): LegacyBlend {
  const plain = { opacity: 1, dx: 0, scale: 1 };
  switch (kind) {
    case "fade-black":
      return t < 0.5 ? { from: plain, to: null, veil: t * 2 } : { from: null, to: { ...plain, wipe: 1 }, veil: (1 - t) * 2 };
    case "slide":
      return { from: { ...plain, dx: -t }, to: { ...plain, dx: 1 - t, wipe: 1 }, veil: null };
    case "wipe":
      return { from: plain, to: { ...plain, wipe: t }, veil: null };
    case "zoom":
      return { from: { opacity: 1 - t, dx: 0, scale: 1 + 0.12 * t }, to: { opacity: t, dx: 0, scale: 1.15 - 0.15 * t, wipe: 1 }, veil: null };
    default:
      return { from: plain, to: { ...plain, opacity: t, wipe: 1 }, veil: null };
  }
}

function legacyCamera(motion: string, progress: number) {
  const p = inOutSine(Math.min(1, Math.max(0, progress)));
  switch (motion) {
    case "zoom-in":
      return { zoom: 1 + 0.15 * p, panX: 0, panY: 0 };
    case "zoom-out":
      return { zoom: 1.15 - 0.15 * p, panX: 0, panY: 0 };
    case "pan-left":
      return { zoom: 1.12, panX: 1 - 2 * p, panY: 0 };
    case "pan-right":
      return { zoom: 1.12, panX: -1 + 2 * p, panY: 0 };
    case "pan-up":
      return { zoom: 1.12, panX: 0, panY: 1 - 2 * p };
    case "pan-down":
      return { zoom: 1.12, panX: 0, panY: -1 + 2 * p };
    default:
      return { zoom: 1, panX: 0, panY: 0 };
  }
}

const value = (blend: Partial<Record<ShotProperty, number>>, key: ShotProperty) => blend[key] ?? SHOT_REST[key];

describe("transitions d'origine", () => {
  it("rendent les mêmes valeurs qu'avant les pistes", () => {
    let checked = 0;
    const close = (actual: number, expected: number, what: string) => {
      if (!(Math.abs(actual - expected) <= 1e-9)) throw new Error(`${what} : ${actual} ≠ ${expected}`);
      checked++;
    };
    for (const kind of LEGACY_TRANSITION_IDS) {
      const preset = getTransition(kind);
      for (let i = 0; i <= 1000; i++) {
        const t = inOutSine(i / 1000);
        const expected = legacyTransition(kind, t);
        const from = shotBlendAt(preset.from, t);
        const to = shotBlendAt(preset.to, t);
        // Un plan que l'ancien moteur ne dessinait pas est ici transparent (rien n'est dessiné).
        close(value(from, "opacity"), expected.from?.opacity ?? 0, `${kind} ${t} départ opacité`);
        close(value(to, "opacity"), expected.to?.opacity ?? 0, `${kind} ${t} arrivée opacité`);
        if (expected.from) {
          close(value(from, "dx"), expected.from.dx, `${kind} ${t} départ dx`);
          close(value(from, "scale"), expected.from.scale, `${kind} ${t} départ échelle`);
        }
        if (expected.to) {
          close(value(to, "dx"), expected.to.dx, `${kind} ${t} arrivée dx`);
          close(value(to, "scale"), expected.to.scale, `${kind} ${t} arrivée échelle`);
          close(value(to, "wipe"), expected.to.wipe, `${kind} ${t} arrivée balayage`);
        }
        close(preset.veil ? Math.min(1, Math.max(0, sampleKeyframes(preset.veil.opacity, t, 0))) : -1, expected.veil ?? -1, `${kind} ${t} voile`);
        expect(preset.fromOnTop ?? false).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it("gardent l'avancement adouci en sinus", () => {
    const a = image("a", 0, 30);
    for (const kind of LEGACY_TRANSITION_IDS) {
      const b = { ...image("b", 30, 30), transition: { kind, frames: 12 } };
      for (let frame = 30; frame < 42; frame++) {
        expect(transitionAt([a, b], b, frame)!.progress).toBe(inOutSine((frame - 30 + 1) / 12));
      }
    }
  });
});

describe("mouvements de caméra d'origine", () => {
  it("rendent les mêmes valeurs qu'avant les pistes", () => {
    let checked = 0;
    for (const motion of LEGACY_CAMERA_IDS) {
      for (let i = -10; i <= 2010; i++) {
        const progress = i / 2000;
        const actual = cameraAt(motion, progress);
        const expected = legacyCamera(motion, progress);
        expect(Object.keys(actual).sort()).toEqual(["panX", "panY", "zoom"]);
        for (const key of ["zoom", "panX", "panY"] as const) {
          if (!(Math.abs(actual[key] - expected[key]) <= 1e-9)) throw new Error(`${motion} ${progress} ${key} : ${actual[key]} ≠ ${expected[key]}`);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(40_000);
    // Un mouvement inconnu (projet plus récent) reste fixe.
    expect(cameraAt("inconnu", 0.5)).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});

describe("nouvelles transitions, caméras et effets de plan", () => {
  it("en ajoutent une trentaine, nommées en français", () => {
    const added =
      listTransitions().length - LEGACY_TRANSITION_IDS.length + (listCameraMoves().length - LEGACY_CAMERA_IDS.length) + listShotFx().length;
    expect(added).toBeGreaterThanOrEqual(30);
    for (const preset of [...listTransitions(), ...listCameraMoves(), ...listShotFx()]) expect(preset.label.length, preset.id).toBeGreaterThan(2);
  });

  it("une transition part du plan précédent au repos et laisse le suivant au repos", () => {
    for (const preset of listTransitions()) {
      const start = shotBlendAt(preset.from, 0);
      const end = shotBlendAt(preset.to, 1);
      for (const key of Object.keys(SHOT_REST) as ShotProperty[]) {
        expect(value(start, key), `${preset.id} départ ${key}`).toBeCloseTo(SHOT_REST[key], 9);
        expect(value(end, key), `${preset.id} arrivée ${key}`).toBeCloseTo(SHOT_REST[key], 9);
      }
      if (preset.veil) {
        expect(sampleKeyframes(preset.veil.opacity, 0, 0), preset.id).toBe(0);
        expect(sampleKeyframes(preset.veil.opacity, 1, 0), preset.id).toBe(0);
      }
    }
  });

  it("la dernière image d'une transition est celle du plan seul, au pixel près", () => {
    for (const preset of listTransitions()) {
      const a = image("a", 0, 30);
      const plain = image("b", 30, 30);
      const b = { ...plain, transition: { kind: preset.id, frames: 12 } };
      expect(pixels([a, b], 41).equals(pixels([a, plain], 41)), preset.id).toBe(true);
      expect(pixels([a, b], 35).equals(pixels([a, plain], 35)), preset.id).toBe(false);
    }
  });

  it("un mouvement joué au début du plan tient sa dernière valeur ; une boucle se referme", () => {
    for (const preset of listCameraMoves()) {
      if (preset.timing === "start") {
        expect(cameraValues(preset, 0.5, preset.durationMs), preset.id).toEqual(cameraValues(preset, 0.9, preset.durationMs * 10));
      }
      if (preset.timing === "loop") {
        const a = cameraValues(preset, 0, 0);
        const b = cameraValues(preset, 0, preset.durationMs);
        const c = cameraValues(preset, 0, preset.durationMs - 1e-6);
        for (const key of Object.keys(CAMERA_REST) as (keyof typeof CAMERA_REST)[]) {
          expect(b[key], `${preset.id} ${key}`).toBeCloseTo(a[key], 9);
          expect(c[key], `${preset.id} ${key}`).toBeCloseTo(a[key], 4);
        }
      }
    }
  });

  it("un effet de plan ne dure que sa fenêtre et rend la piste intacte ensuite", () => {
    const effects: ShotEffect[] = [{ kind: "impact-hit", at: 10, frames: 15 }, { kind: "chroma-hit", at: 12, frames: 8 }];
    expect(shotFxAt(effects, 9, 30)).toBeNull();
    expect(shotFxAt(effects, 10, 30)?.flash).toBeGreaterThan(0.5);
    expect(shotFxAt(effects, 25, 30)).toBeNull();
    expect(shotFxAt([{ kind: "inconnu", at: 0, frames: 10 }], 3, 30)).toBeNull();
    const items = [image("a", 0, 60)];
    expect(pixels(items, 25, effects).equals(pixels(items, 25))).toBe(true);
    expect(pixels(items, 12, effects).equals(pixels(items, 12))).toBe(false);
    for (const preset of listShotFx()) {
      const single: ShotEffect[] = [{ kind: preset.id, at: 5, frames: 10 }];
      expect(pixels(items, 15, single).equals(pixels(items, 15)), preset.id).toBe(true);
    }
  });

  it("une secousse donne la même image à l'aperçu et à l'export, dans n'importe quel ordre", () => {
    const items: VisualItem[] = [{ ...image("a", 0, 40), motion: "impact-shake" }];
    const effects: ShotEffect[] = [{ kind: "frame-shake", at: 3, frames: 14 }];
    const forward = Array.from({ length: 20 }, (_, frame) => pixels(items, frame, effects));
    for (let frame = 19; frame >= 0; frame--) expect(pixels(items, frame, effects).equals(forward[frame]), `image ${frame}`).toBe(true);
  });
});

// ─── Outils ──────────────────────────────────────────────────────

const W = 90;
const H = 160;

function picture(color: string, mark: string) {
  const canvas = createCanvas(200, 200);
  const g = canvas.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, 200, 200);
  g.fillStyle = mark;
  g.fillRect(20, 40, 60, 120);
  g.fillRect(120, 10, 50, 50);
  return canvas;
}

const SOURCES: Record<string, ReturnType<typeof picture>> = { a: picture("#ef4444", "#fde047"), b: picture("#2563eb", "#22c55e") };

function image(id: string, start: number, duration: number): ImageItem {
  return {
    id,
    type: "image",
    source: { url: id, ref: `upload:${id}`, name: id, kind: "image" },
    fit: "cover",
    motion: "none",
    radius: 0,
    start,
    duration,
    transform: { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 0 },
    animOut: { kind: "none", frames: 0 },
  };
}

function projectWith(items: VisualItem[], effects?: ShotEffect[]): ClipProject {
  return {
    version: 1,
    id: "projet",
    name: "Plans",
    aspect: "9:16",
    width: W,
    height: H,
    fps: 30,
    background: "#000000",
    tracks: [{ id: "piste", kind: "visual", name: "Principale", items, effects }],
    createdAt: 0,
    updatedAt: 0,
  };
}

function pixels(items: VisualItem[], frame: number, effects?: ShotEffect[]): Buffer {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  drawFrame(ctx as unknown as CanvasRenderingContext2D, projectWith(items, effects), frame, (item) => SOURCES[item.id] as unknown as CanvasImageSource);
  return Buffer.from(ctx.getImageData(0, 0, W, H).data);
}
