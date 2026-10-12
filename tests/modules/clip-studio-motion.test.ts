import { describe, expect, it } from "vitest";
import {
  CSS_BEZIERS,
  EASE_ALIASES,
  EASE_NAMES,
  EASINGS,
  cubicBezier,
  parseEase,
  resolveEase,
  springEase,
  stepsEase,
} from "@/modules/clip-studio/engine/motion/easing";
import { mixColors, parseColor } from "@/modules/clip-studio/engine/motion/color";
import {
  createRandom,
  effectsAt,
  isRestState,
  naturalFrames,
  sampleTracks,
  stateForUnit,
  unitRandom,
  unitTiming,
} from "@/modules/clip-studio/engine/motion/interpret";
import { getPreset, isKnownPreset, listPresets, registerPresets } from "@/modules/clip-studio/engine/motion/registry";
import { LEGACY_PRESET_IDS } from "@/modules/clip-studio/engine/motion/presets/legacy";
import type { MotionPreset } from "@/modules/clip-studio/engine/motion/types";
import { animStateAt, emphasisProgress } from "@/modules/clip-studio/engine/timeline";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import type { ClipProject, ShapeItem } from "@/modules/clip-studio/engine/types";

const grid = (steps = 200) => Array.from({ length: steps + 1 }, (_, index) => index / steps);

/** Courbes qui ne dépassent pas : elles doivent croître sans jamais redescendre. */
const MONOTONIC = EASE_NAMES.filter((name) => !/Back|Elastic|Bounce/.test(name));

describe("courbes", () => {
  it("valent 0 au départ et 1 à l'arrivée, sans NaN", () => {
    for (const name of EASE_NAMES) {
      const fn = EASINGS[name];
      expect(fn(0), name).toBeCloseTo(0, 9);
      expect(fn(1), name).toBeCloseTo(1, 9);
      for (const t of grid()) expect(Number.isFinite(fn(t)), `${name}(${t})`).toBe(true);
    }
  });

  it("croissent quand elles ne sont pas censées dépasser", () => {
    for (const name of MONOTONIC) {
      const fn = EASINGS[name];
      let previous = -Infinity;
      for (const t of grid(400)) {
        const value = fn(t);
        expect(value, `${name}(${t})`).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = value;
      }
    }
  });

  it("couvrent les dix familles, chacune en entrée, sortie et entrée-sortie", () => {
    expect(EASE_NAMES).toHaveLength(31);
    expect(EASE_NAMES).toContain("inOutElastic");
    expect(EASE_NAMES).toContain("outBounce");
  });

  it("dépassent quand c'est leur rôle", () => {
    const back = grid().map(EASINGS.outBack);
    expect(Math.max(...back)).toBeGreaterThan(1.05);
    const elastic = grid().map(EASINGS.outElastic);
    expect(Math.max(...elastic)).toBeGreaterThan(1.1);
    expect(Math.min(...grid().map(EASINGS.inBack))).toBeLessThan(-0.05);
  });

  it("reprennent les formules connues", () => {
    expect(EASINGS.inOutQuad(0.25)).toBeCloseTo(0.125, 12);
    expect(EASINGS.outQuart(0.5)).toBeCloseTo(0.9375, 12);
    expect(EASINGS.outBounce(0.5)).toBeCloseTo(0.765625, 12);
    expect(EASINGS.inOutSine(0.5)).toBeCloseTo(0.5, 12);
    // Élastique : l'entrée-sortie se raccorde au milieu.
    expect(EASINGS.inOutElastic(0.5)).toBeCloseTo(0.5, 9);
  });

  it("Bézier : retrouve les valeurs de référence des courbes CSS", () => {
    const ease = cubicBezier(...CSS_BEZIERS.ease);
    expect(ease(0.5)).toBeCloseTo(0.8024033877, 6);
    expect(ease(0.25)).toBeCloseTo(0.4085105914, 6);
    expect(ease(0.9)).toBeCloseTo(0.9943164775, 6);
    const easeOut = cubicBezier(...CSS_BEZIERS["ease-out"]);
    expect(easeOut(0.5)).toBeCloseTo(0.6846431874, 6);
    expect(easeOut(0.1)).toBeCloseTo(0.1605721542, 6);
  });

  it("Bézier : reste robuste pour des points de contrôle extrêmes", () => {
    const steep = cubicBezier(1, 0, 0, 1);
    const overshoot = cubicBezier(0.34, 1.56, 0.64, 1);
    for (const t of grid()) {
      expect(Number.isFinite(steep(t))).toBe(true);
      expect(Number.isFinite(overshoot(t))).toBe(true);
    }
    expect(steep(0.5)).toBeCloseTo(0.5, 5);
    expect(Math.max(...grid().map(overshoot))).toBeGreaterThan(1);
    expect(cubicBezier(0.2, 0.2, 0.8, 0.8)(0.37)).toBe(0.37);
  });

  it("ressort : finit exactement à 1, oscille s'il est peu amorti, et ne varie pas d'un appel à l'autre", () => {
    const bouncy = springEase({ mass: 1, stiffness: 180, damping: 8 });
    const stiff = springEase({ mass: 1, stiffness: 200, damping: 40 });
    expect(bouncy(0)).toBe(0);
    expect(bouncy(1)).toBe(1);
    expect(stiff(1)).toBe(1);
    expect(Math.max(...grid().map(bouncy))).toBeGreaterThan(1.1);
    expect(Math.max(...grid().map(stiff))).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.abs(bouncy(0.98) - 1)).toBeLessThan(0.01);
    const again = springEase({ mass: 1, stiffness: 180, damping: 8 });
    for (const t of grid()) expect(again(t)).toBe(bouncy(t));
  });

  it("marches : paliers réguliers, 1 à la fin", () => {
    const steps = stepsEase(4);
    expect(steps(0)).toBe(0);
    expect(steps(0.3)).toBe(0.25);
    expect(steps(0.99)).toBe(0.75);
    expect(steps(1)).toBe(1);
    expect(stepsEase(4, "start")(0.3)).toBe(0.5);
  });

  it("une courbe inconnue devient linéaire au lieu de planter", () => {
    expect(resolveEase("outWobble" as never)(0.3)).toBe(0.3);
    expect(resolveEase(undefined)(0.3)).toBe(0.3);
  });

  it("traduit les notations des autres outils", () => {
    expect(EASE_ALIASES["power3.out"]).toBe("outQuart");
    expect(EASE_ALIASES["power1.inOut"]).toBe("inOutQuad");
    expect(EASE_ALIASES["easeOutCubic"]).toBe("outCubic");
    expect(EASE_ALIASES["expo.out"]).toBe("outExpo");
    expect(EASE_ALIASES["Power2.easeIn"]).toBe("inCubic");
    expect(EASE_ALIASES["ease-out"]).toEqual({ bezier: [0, 0, 0.58, 1] });
    expect(parseEase("back.out(1.7)")).toEqual({ back: 1.7, mode: "out" });
    expect(parseEase("inOut(3)")).toEqual({ power: 3, mode: "inOut" });
    expect(parseEase("cubic-bezier(0.2, 0.8, 0.2, 1)")).toEqual({ bezier: [0.2, 0.8, 0.2, 1] });
    expect(parseEase("elastic.out(1, 0.3)")).toEqual({ elastic: { amplitude: 1, period: 0.3 }, mode: "out" });
    expect(parseEase("steps(5)")).toEqual({ steps: 5, jump: "end" });
    expect(parseEase("easeInOutBack(2)")).toEqual({ back: 2, mode: "inOut" });
    expect(parseEase("on dirait une courbe")).toBeNull();
    // `inOut(3)` est la cubique d'entrée-sortie.
    const inOut3 = resolveEase(parseEase("inOut(3)")!);
    for (const t of grid(20)) expect(inOut3(t)).toBeCloseTo(EASINGS.inOutCubic(t), 12);
    // « back.out(1.70158) » est la courbe nommée.
    const back = resolveEase(parseEase("back.out(1.70158)")!);
    for (const t of grid(20)) expect(back(t)).toBeCloseTo(EASINGS.outBack(t), 12);
  });
});

describe("couleurs", () => {
  it("lit les notations courantes", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#ff000080")?.a).toBeCloseTo(0.502, 3);
    expect(parseColor("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor("rgb(10 20 30 / 50%)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor("pas une couleur")).toBeNull();
  });

  it("mélange en OKLab : bornes exactes, milieu plus clair qu'en RVB", () => {
    expect(mixColors("#ff0000", "#00ff00", 0)).toBe("rgba(255, 0, 0, 1)");
    expect(mixColors("#ff0000", "#00ff00", 1)).toBe("rgba(0, 255, 0, 1)");
    const middle = parseColor(mixColors("#ff0000", "#00ff00", 0.5))!;
    // En RVB, le milieu serait (128, 128, 0), un brun terne.
    expect(middle.r).toBeGreaterThan(160);
    expect(middle.g).toBeGreaterThan(140);
    // Depuis « transparent », on ne passe pas par le noir.
    const fading = parseColor(mixColors("transparent", "#ffffff", 0.5))!;
    expect(fading.r).toBe(255);
    expect(fading.a).toBeCloseTo(0.5, 3);
  });

  it("une piste de couleur part de la couleur de l'élément", () => {
    const preset: MotionPreset = {
      id: "test-flash",
      label: "Éclair",
      category: "attention",
      phase: "emphasis",
      target: "text",
      durationMs: 400,
      tracks: { color: [{ at: 0.5, value: "#ffcc00" }] },
    };
    expect(sampleTracks(preset, 0, undefined, { baseColor: "#ffffff" }).color).toBe("#ffffff");
    expect(sampleTracks(preset, 0.5, undefined, { baseColor: "#ffffff" }).color).toBe("#ffcc00");
    expect(sampleTracks(preset, 1, undefined, { baseColor: "#ffffff" }).color).toBe("#ffffff");
    expect(sampleTracks(preset, 0.25, undefined, { baseColor: "#ffffff" }).color).toMatch(/^rgba\(255, 2\d\d, \d+, 1\)$/);
    // Sans couleur d'élément connue, l'élément garde la sienne.
    expect(sampleTracks(preset, 0.25).color).toBeUndefined();
  });
});

const RISE: MotionPreset = {
  id: "test-rise",
  label: "Montée",
  category: "by-letter",
  phase: "in",
  target: "text",
  durationMs: 600,
  ease: "outCubic",
  split: "char",
  stagger: { eachMs: 50, from: "start" },
  tracks: {
    opacity: [{ at: 0, value: 0 }, { at: 1, value: 1 }],
    y: [{ at: 0, value: 0.6 }, { at: 1, value: 0 }],
    rotate: [{ at: 0, value: -20 }, { at: 1, value: 0, ease: "outBack" }],
  },
  params: [
    { id: "intensity", kind: "amount", label: "Intensité", min: 0, max: 2, default: 1, affects: ["y", "rotate"] },
    { id: "direction", kind: "direction", label: "Direction", default: "up" },
  ],
};

describe("interpréteur", () => {
  it("interpole chaque piste avec sa courbe, et finit au repos", () => {
    const start = sampleTracks(RISE, 0);
    expect(start.opacity).toBe(0);
    expect(start.y).toBe(0.6);
    expect(start.unit).toBe("em");
    const half = sampleTracks(RISE, 0.5);
    expect(half.opacity).toBeCloseTo(EASINGS.outCubic(0.5), 12);
    expect(half.rotate).toBeCloseTo(-20 + 20 * EASINGS.outBack(0.5), 12);
    expect(isRestState(sampleTracks(RISE, 1))).toBe(true);
  });

  it("complète les bornes par le repos, comme les images clés implicites", () => {
    const preset: MotionPreset = {
      id: "test-pulse",
      label: "Pulsation",
      category: "attention",
      phase: "emphasis",
      target: "any",
      durationMs: 500,
      tracks: { scale: [{ at: 0.5, value: 1.2, ease: "outSine" }] },
    };
    expect(sampleTracks(preset, 0).scale).toBe(1);
    expect(sampleTracks(preset, 0.5).scale).toBe(1.2);
    expect(sampleTracks(preset, 1).scale).toBe(1);
  });

  it("applique l'intensité et la direction", () => {
    const strong = sampleTracks(RISE, 0, { intensity: 2 });
    expect(strong.y).toBeCloseTo(1.2, 12);
    expect(strong.rotate).toBeCloseTo(-40, 12);
    expect(strong.opacity).toBe(0);
    const fromLeft = sampleTracks(RISE, 0, { direction: "right" });
    // Écrite pour monter (venir du bas), elle vient de la gauche pour aller à droite.
    expect(fromLeft.x).toBeCloseTo(-0.6, 12);
    expect(fromLeft.y).toBe(0);
    const fromTop = sampleTracks(RISE, 0, { direction: "down" });
    expect(fromTop.y).toBeCloseTo(-0.6, 12);
  });

  it("décale les unités et les fait toutes finir avec la phase", () => {
    const count = 10;
    const frames = 30;
    const first = stateForUnit(RISE, 0, count, 5, frames, "item-1");
    const last = stateForUnit(RISE, count - 1, count, 5, frames, "item-1");
    expect(first.opacity).toBeGreaterThan(last.opacity);
    expect(last.opacity).toBe(0);
    for (let index = 0; index < count; index++) {
      expect(isRestState(stateForUnit(RISE, index, count, frames - 1, frames, "item-1"))).toBe(true);
      const timing = unitTiming(RISE, index, count, "item-1");
      expect(timing.delay + timing.span).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it("ordonne du centre, de la fin ou au hasard, de façon reproductible", () => {
    const ordered = (from: "start" | "end" | "center" | "random", seed = "item-1") =>
      Array.from({ length: 7 }, (_, index) =>
        unitTiming({ ...RISE, stagger: { eachMs: 50, from } }, index, 7, seed).delay
      );
    const center = ordered("center");
    expect(center[3]).toBe(0);
    expect(center[0]).toBeCloseTo(center[6], 12);
    const end = ordered("end");
    expect(end[6]).toBe(0);
    const random = ordered("random");
    expect(ordered("random")).toEqual(random);
    expect(new Set(random).size).toBe(7);
    expect(ordered("random", "item-2")).not.toEqual(random);
  });

  it("tire les mêmes nombres pour la même graine", () => {
    const a = createRandom("élément");
    const b = createRandom("élément");
    const first = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(unitRandom("élément", 3)).toBe(unitRandom("élément", 3));
    expect(unitRandom("élément", 3)).not.toBe(unitRandom("élément", 4));
  });

  it("propose une durée qui laisse jouer chaque unité", () => {
    expect(naturalFrames(RISE, 1, 30)).toBe(18);
    expect(naturalFrames(RISE, 11, 30)).toBe(33);
  });

  it("signale les effets actifs avec leur propre avancement", () => {
    const preset: MotionPreset = {
      ...RISE,
      effects: [{ type: "scramble", from: 0, to: 0.5 }],
    };
    expect(effectsAt(preset, 0.25)).toEqual([{ effect: preset.effects![0], progress: 0.5 }]);
    expect(effectsAt(preset, 0.75)).toEqual([]);
  });
});

describe("registre", () => {
  it("connaît les neuf animations d'origine dans les deux phases", () => {
    expect(LEGACY_PRESET_IDS).toHaveLength(9);
    for (const id of LEGACY_PRESET_IDS) {
      expect(getPreset(id, "in")?.phase).toBe("in");
      expect(getPreset(id, "out")?.phase).toBe("out");
      expect(getPreset(id, "out")?.reversed).toBeUndefined();
    }
    const entries = listPresets({ phase: "in" }).map((preset) => preset.id);
    expect(entries).toEqual(expect.arrayContaining(LEGACY_PRESET_IDS));
    expect(listPresets({ phase: "out" }).map((preset) => preset.id)).toEqual(expect.arrayContaining(LEGACY_PRESET_IDS));
    expect(listPresets({ phase: "in", target: "image" }).map((preset) => preset.id)).not.toContain("typewriter");
    // Les glissements d'origine ouvrent leur catégorie, devant ceux de la bibliothèque.
    expect(listPresets({ phase: "in", category: "slide" }).map((preset) => preset.id).slice(0, 4)).toEqual([
      "slide-up",
      "slide-down",
      "slide-left",
      "slide-right",
    ]);
  });

  it("rejoue une entrée à rebours quand elle sert de sortie", () => {
    registerPresets([{ ...RISE, id: "test-rise-only-in" }]);
    const exit = getPreset("test-rise-only-in", "out")!;
    expect(exit.phase).toBe("out");
    expect(exit.reversed).toBe(true);
    expect(isRestState(sampleTracks(exit, 0))).toBe(true);
    expect(sampleTracks(exit, 1).opacity).toBe(0);
    expect(getPreset("test-rise-only-in", "emphasis")).toBeUndefined();
    expect(() => registerPresets([{ ...RISE, id: "test-rise-only-in" }])).toThrow();
  });

  it("traite un identifiant inconnu comme « aucune animation »", () => {
    expect(getPreset("animation-du-futur", "in")).toBeUndefined();
    expect(isKnownPreset("animation-du-futur")).toBe(false);
    const item = shape({ animIn: { kind: "animation-du-futur", frames: 10 }, animOut: { kind: "inconnue", frames: 10 } });
    for (let frame = 0; frame < item.duration; frame++) expect(isRestState(animStateAt(item, frame))).toBe(true);
  });
});

function shape(overrides: Partial<ShapeItem> = {}): ShapeItem {
  return {
    id: "shape-1",
    type: "shape",
    shape: "rect",
    fill: "#ffffff",
    radius: 0,
    start: 0,
    duration: 60,
    transform: { x: 0.5, y: 0.5, width: 0.4, height: 0.2, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 6 },
    animOut: { kind: "none", frames: 6 },
    ...overrides,
  };
}

const PULSE: MotionPreset = {
  id: "test-emphasis-pulse",
  label: "Pulsation",
  category: "attention",
  phase: "emphasis",
  target: "any",
  durationMs: 330,
  tracks: { scale: [{ at: 0.5, value: 1.2, ease: "inOutSine" }, { at: 1, value: 1, ease: "inOutSine" }] },
};
registerPresets([PULSE]);

describe("mise en avant", () => {
  it("se joue entre l'entrée et la sortie, le nombre de fois demandé", () => {
    const item = shape({
      animIn: { kind: "fade", frames: 10 },
      animOut: { kind: "fade", frames: 10 },
      animEmphasis: { kind: PULSE.id, frames: 10, at: 4, repeat: 2 },
    });
    // Elle attend la fin de l'entrée (image 10), même si `at` est plus tôt.
    expect(emphasisProgress(item.animEmphasis!, 9, 10, 50)).toBeNull();
    expect(animStateAt(item, 14).scale).toBeCloseTo(1.2, 12);
    expect(animStateAt(item, 24).scale).toBeCloseTo(1.2, 12);
    // Deux passages, puis le repos.
    expect(isRestState(animStateAt(item, 34))).toBe(true);
    // L'entrée reste celle d'avant.
    expect(animStateAt(item, 0).opacity).toBeCloseTo(EASINGS.outCubic(0.1), 12);
  });

  it("en boucle, s'arrête avec la sortie de l'élément", () => {
    const item = shape({
      animOut: { kind: "fade", frames: 10 },
      animEmphasis: { kind: PULSE.id, frames: 10, at: 0, repeat: 0 },
    });
    expect(animStateAt(item, 44).scale).toBeCloseTo(1.2, 12);
    for (let frame = 50; frame < 60; frame++) expect(animStateAt(item, frame).scale).toBe(1);
    expect(animStateAt(item, 59).opacity).toBe(0);
  });

  it("une mise en avant inconnue ne change rien", () => {
    const item = shape({ animEmphasis: { kind: "disparue", frames: 10, at: 0, repeat: 0 } });
    expect(isRestState(animStateAt(item, 20))).toBe(true);
  });
});

// ─── Dessin ──────────────────────────────────────────────────────

/** Contexte qui enregistre les appels : deux rendus identiques donnent le même journal. */
function recordingContext() {
  const log: string[] = [];
  const state: Record<string, unknown> = { filter: "none" };
  const stack: Record<string, unknown>[] = [];
  const target = {
    save: () => {
      stack.push({ ...state });
      log.push("save");
    },
    restore: () => {
      Object.assign(state, stack.pop());
      log.push(`restore filter=${state.filter}`);
    },
    measureText: (text: string) => ({ width: text.length * 10 }),
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

function projectWith(item: ShapeItem): ClipProject {
  return {
    version: 1,
    id: "project",
    name: "Test",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    background: "#000000",
    tracks: [{ id: "track", kind: "visual", name: "Principale", items: [item] }],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("dessin d'un élément animé", () => {
  const SPIN: MotionPreset = {
    id: "test-spin-blur",
    label: "Tourbillon",
    category: "rotate",
    phase: "in",
    target: "any",
    durationMs: 500,
    tracks: {
      rotate: [{ at: 0, value: 90 }, { at: 1, value: 0 }],
      scaleX: [{ at: 0, value: 0.5 }, { at: 1, value: 1 }],
      blur: [{ at: 0, value: 0.02 }, { at: 1, value: 0 }],
      brightness: [{ at: 0, value: 2 }, { at: 1, value: 1 }],
      clip: [{ at: 0, value: [0, 0.5, 0, 0] }, { at: 1, value: [0, 0, 0, 0] }],
      color: [{ at: 0, value: "#ff0000" }, { at: 1, value: "currentColor" }],
    },
  };
  registerPresets([SPIN]);

  it("applique rotation, échelle par axe, filtres et découpe, puis restaure le contexte", () => {
    const item = shape({ animIn: { kind: SPIN.id, frames: 10 } });
    const { ctx, log } = recordingContext();
    drawFrame(ctx, projectWith(item), 4, () => null);
    const text = log.join("\n");
    expect(text).toMatch(/rotate\(0\.\d+\)/);
    expect(text).toMatch(/scale\(0\.\d+,1\.0000\)/);
    expect(text).toMatch(/filter=blur\([\d.]+px\) brightness\(1\.\d+\)/);
    expect(text).toMatch(/fillStyle=rgba\(255, \d+, \d+, 1\)/);
    // Le filtre ne survit pas au dessin de l'élément.
    expect(log[log.length - 1]).toBe("restore filter=none");
  });

  it("dessine un élément au repos sans aucune retouche", () => {
    const { ctx, log } = recordingContext();
    drawFrame(ctx, projectWith(shape()), 20, () => null);
    const text = log.join("\n");
    expect(text).not.toMatch(/^(filter=|rotate\(|scale\(|transform\(|clip\()/m);
  });

  it("donne le même journal de dessin à chaque rendu (aperçu et export)", () => {
    const item = shape({ animIn: { kind: SPIN.id, frames: 10 }, animEmphasis: { kind: PULSE.id, frames: 8, at: 0, repeat: 0 } });
    const render = () => {
      const { ctx, log } = recordingContext();
      for (let frame = 0; frame < 40; frame++) drawFrame(ctx, projectWith(item), frame, () => null);
      return log.join("\n");
    };
    expect(render()).toBe(render());
  });
});
