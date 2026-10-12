import { describe, expect, it } from "vitest";
import { animStateAt } from "@/modules/clip-studio/engine/timeline";
import type { Anim, ShapeItem, VisualItem } from "@/modules/clip-studio/engine/types";

/**
 * Rétrocompatibilité des neuf animations historiques.
 *
 * L'oracle ci-dessous est la copie conforme du moteur d'avant les pistes
 * d'images clés (`applyAnim` et `animStateAt` codés à la main). Les
 * préréglages qui les remplacent doivent donner les mêmes valeurs à chaque
 * image, à 1e-6 près : c'est la garantie qu'un projet existant rend les mêmes
 * pixels.
 */

interface LegacyState {
  opacity: number;
  dx: number;
  dy: number;
  scale: number;
  reveal: number;
  wipe: number;
}

const legacyEase = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const LEGACY_IDLE: LegacyState = { opacity: 1, dx: 0, dy: 0, scale: 1, reveal: 1, wipe: 1 };

function legacyApply(anim: Anim, t: number, entering: boolean): Partial<LegacyState> {
  const k = entering ? legacyEase.outCubic(t) : legacyEase.inCubic(t);
  const offset = 1 - k;
  switch (anim.kind) {
    case "fade":
      return { opacity: k };
    case "slide-up":
      return { opacity: k, dy: 0.08 * offset };
    case "slide-down":
      return { opacity: k, dy: -0.08 * offset };
    case "slide-left":
      return { opacity: k, dx: 0.12 * offset };
    case "slide-right":
      return { opacity: k, dx: -0.12 * offset };
    case "pop":
      return { opacity: clamp01(t * 2), scale: entering ? 0.4 + 0.6 * legacyEase.outBack(t) : 0.6 + 0.4 * k };
    case "zoom":
      return { opacity: k, scale: 1.25 - 0.25 * k };
    case "typewriter":
      return { reveal: t };
    case "wipe":
      return { wipe: t };
    default:
      return {};
  }
}

function legacyStateAt(item: VisualItem, frame: number): LegacyState {
  const local = frame - item.start;
  const state = { ...LEGACY_IDLE };
  const inFrames = item.animIn.kind === "none" ? 0 : Math.min(item.animIn.frames, item.duration);
  const outFrames = item.animOut.kind === "none" ? 0 : Math.min(item.animOut.frames, item.duration - inFrames);
  if (inFrames > 0 && local < inFrames) {
    Object.assign(state, legacyApply(item.animIn, clamp01((local + 1) / inFrames), true));
  } else if (outFrames > 0 && local >= item.duration - outFrames) {
    const remaining = item.duration - local - 1;
    Object.assign(state, legacyApply(item.animOut, clamp01(remaining / outFrames), false));
  }
  return state;
}

const KINDS = ["fade", "slide-up", "slide-down", "slide-left", "slide-right", "pop", "zoom", "typewriter", "wipe"] as const;

function shape(start: number, duration: number, animIn: Anim, animOut: Anim): ShapeItem {
  return {
    id: "legacy",
    type: "shape",
    shape: "rect",
    fill: "#ffffff",
    radius: 0,
    start,
    duration,
    transform: { x: 0.5, y: 0.5, width: 0.5, height: 0.2, rotation: 0, opacity: 1 },
    animIn,
    animOut,
  };
}

/** Toutes les combinaisons utiles : entrée seule, sortie seule, les deux, phases qui se chevauchent. */
function cases(): VisualItem[] {
  const items: VisualItem[] = [];
  const none: Anim = { kind: "none", frames: 6 };
  for (const [index, kind] of KINDS.entries()) {
    const other = KINDS[(index + 3) % KINDS.length];
    for (const frames of [1, 2, 6, 10, 23]) {
      for (const duration of [1, 5, 12, 40]) {
        items.push(shape(7, duration, { kind, frames }, none));
        items.push(shape(7, duration, none, { kind, frames }));
        items.push(shape(7, duration, { kind, frames }, { kind, frames }));
        items.push(shape(7, duration, { kind, frames }, { kind: other, frames: frames + 3 }));
      }
    }
  }
  return items;
}

const FIELDS = ["opacity", "dx", "dy", "scale", "reveal", "wipe"] as const;

describe("animations historiques", () => {
  it("rendent les mêmes valeurs qu'avant, image par image", () => {
    let checked = 0;
    for (const item of cases()) {
      for (let frame = item.start - 2; frame <= item.start + item.duration + 1; frame++) {
        const expected = legacyStateAt(item, frame);
        const actual = animStateAt(item, frame);
        for (const field of FIELDS) {
          const delta = Math.abs(actual[field] - expected[field]);
          if (!(delta <= 1e-6)) {
            throw new Error(
              `${item.animIn.kind}/${item.animOut.kind} (${item.animIn.frames}, ${item.duration}) image ${frame} : ${field} ${actual[field]} ≠ ${expected[field]}`
            );
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });

  it("laissent l'élément au repos hors de l'entrée et de la sortie", () => {
    const item = shape(0, 40, { kind: "pop", frames: 10 }, { kind: "slide-up", frames: 10 });
    expect(animStateAt(item, 20)).toMatchObject(LEGACY_IDLE);
  });
});
