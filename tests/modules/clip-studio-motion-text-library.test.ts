import { describe, expect, it } from "vitest";
import { isRestState, restState, sampleTracks, stateForUnit, unitTiming } from "@/modules/clip-studio/engine/motion/interpret";
import { getPreset } from "@/modules/clip-studio/engine/motion/registry";
import { LEGACY_PRESETS } from "@/modules/clip-studio/engine/motion/presets/legacy";
import { TEXT_PRESETS } from "@/modules/clip-studio/engine/motion/presets/text";
import { TEXT_LIBRARY_PRESETS } from "@/modules/clip-studio/engine/motion/presets/text-library";
import type { MotionCategory, MotionPreset, MotionProperty, MotionSplit, MotionState } from "@/modules/clip-studio/engine/motion/types";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import type { ClipProject, TextItem } from "@/modules/clip-studio/engine/types";

// La bibliothèque est enregistrée par le registre lui-même, comme les autres préréglages.
const PRESETS = TEXT_LIBRARY_PRESETS;
const keyOf = (preset: MotionPreset) => `${preset.phase}:${preset.id}`;
const name = (preset: MotionPreset) => `${preset.id} (${preset.phase})`;

const NUMERIC: Array<Exclude<MotionProperty, "clip" | "color">> = [
  "opacity", "x", "y", "dx", "dy", "scale", "scaleX", "scaleY", "rotate", "skewX", "blur", "brightness", "reveal", "wipe", "tracking",
];

function finite(state: MotionState): boolean {
  return NUMERIC.every((key) => Number.isFinite(state[key])) && state.clip.every(Number.isFinite);
}

/** Écart entre deux états : la plus grande différence sur une propriété. */
function distance(a: MotionState, b: MotionState): number {
  let worst = 0;
  for (const key of NUMERIC) worst = Math.max(worst, Math.abs(a[key] - b[key]));
  for (let side = 0; side < 4; side++) worst = Math.max(worst, Math.abs(a.clip[side] - b.clip[side]));
  if (a.color !== b.color) worst = Math.max(worst, 1);
  return worst;
}

/** Plus rien n'est visible : effacé, réduit à un point, entièrement découpé ou balayé. */
function vanished(state: MotionState): boolean {
  const [top, right, bottom, left] = state.clip;
  return (
    state.opacity <= 0.001 ||
    Math.abs(state.scale * state.scaleX) < 0.001 ||
    Math.abs(state.scale * state.scaleY) < 0.001 ||
    top + bottom >= 0.999 ||
    left + right >= 0.999 ||
    state.wipe <= 0.001 ||
    state.reveal <= 0.001
  );
}

const SPLITS_BY_CATEGORY: Partial<Record<MotionCategory, MotionSplit[]>> = {
  "by-letter": ["char"],
  "by-word": ["word", "line"],
  typing: ["char", "word", "whole"],
};

const PROGRESS = Array.from({ length: 41 }, (_, i) => i / 40);

describe("bibliothèque de texte : identifiants", () => {
  it("chaque identifiant est unique pour sa phase", () => {
    const keys = PRESETS.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ne reprend aucun identifiant des animations d'origine ni des premiers préréglages de texte", () => {
    const taken = new Set([...LEGACY_PRESETS, ...TEXT_PRESETS].map((preset) => preset.id));
    const clashes = PRESETS.filter((preset) => taken.has(preset.id)).map(name);
    expect(clashes).toEqual([]);
  });

  it("s'enregistre sans doublon et se retrouve par identifiant et phase", () => {
    for (const preset of PRESETS) expect(getPreset(preset.id, preset.phase)).toBe(preset);
  });

  it("identifiants en kebab-case anglais, noms affichés en français", () => {
    for (const preset of PRESETS) {
      expect(preset.id, name(preset)).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(preset.label.trim().length, name(preset)).toBeGreaterThan(2);
      expect(preset.label, name(preset)).not.toMatch(/—/);
    }
  });

  it("un même identifiant garde le même nom et la même catégorie d'une phase à l'autre", () => {
    const byId = new Map<string, MotionPreset>();
    for (const preset of PRESETS) {
      const first = byId.get(preset.id);
      if (!first) byId.set(preset.id, preset);
      else {
        expect(preset.label, name(preset)).toBe(first.label);
        expect(preset.category, name(preset)).toBe(first.category);
      }
    }
  });
});

describe("bibliothèque de texte : découpe et unités", () => {
  it("chaque préréglage vise le texte et déclare une découpe cohérente avec sa catégorie", () => {
    for (const preset of PRESETS) {
      expect(preset.target === "text" || preset.target === "any", name(preset)).toBe(true);
      expect(preset.split, name(preset)).toBeDefined();
      const allowed = SPLITS_BY_CATEGORY[preset.category];
      if (allowed) expect(allowed, name(preset)).toContain(preset.split);
    }
  });

  it("un titre animé en bloc mesure ses déplacements et son flou en taille de texte", () => {
    for (const preset of PRESETS) {
      if (preset.split !== "whole") continue;
      const lengths = (["x", "y", "blur"] as const).some((property) => preset.tracks[property]);
      if (lengths) expect(preset.units, name(preset)).toBe("em");
    }
  });

  it("un décalage n'existe que sur un texte découpé, et reste positif", () => {
    for (const preset of PRESETS) {
      if (!preset.stagger) continue;
      expect(preset.split, name(preset)).not.toBe("whole");
      expect(preset.stagger.eachMs, name(preset)).toBeGreaterThan(0);
    }
  });
});

describe("bibliothèque de texte : pistes et réglages", () => {
  it("images clés rangées dans le temps, entre 0 et 1, valeurs finies", () => {
    for (const preset of PRESETS) {
      expect(preset.durationMs, name(preset)).toBeGreaterThan(0);
      for (const [property, frames] of Object.entries(preset.tracks)) {
        expect(frames!.length, `${name(preset)} ${property}`).toBeGreaterThan(0);
        let last = -Infinity;
        for (const frame of frames!) {
          expect(frame.at, `${name(preset)} ${property}`).toBeGreaterThanOrEqual(0);
          expect(frame.at, `${name(preset)} ${property}`).toBeLessThanOrEqual(1);
          expect(frame.at, `${name(preset)} ${property}`).toBeGreaterThanOrEqual(last);
          last = frame.at;
          if (typeof frame.value === "number") expect(Number.isFinite(frame.value), `${name(preset)} ${property}`).toBe(true);
        }
      }
    }
  });

  it("les réglages portent sur des pistes existantes, avec un défaut dans leurs bornes", () => {
    for (const preset of PRESETS) {
      for (const param of preset.params ?? []) {
        if (param.kind === "amount") {
          expect(param.default, name(preset)).toBeGreaterThanOrEqual(param.min);
          expect(param.default, name(preset)).toBeLessThanOrEqual(param.max);
          for (const property of param.affects) expect(preset.tracks[property], `${name(preset)} ${property}`).toBeDefined();
        } else {
          const moves = (["x", "y", "dx", "dy"] as const).some((property) => preset.tracks[property]);
          expect(moves, name(preset)).toBe(true);
        }
      }
    }
  });

  it("aucune valeur NaN, ni avec les réglages poussés à leurs bornes", () => {
    for (const preset of PRESETS) {
      const settings = [
        undefined,
        Object.fromEntries((preset.params ?? []).map((param) => [param.id, param.kind === "amount" ? param.max : "left"])),
        Object.fromEntries((preset.params ?? []).map((param) => [param.id, param.kind === "amount" ? param.min : "down"])),
      ];
      for (const params of settings) {
        for (const progress of PROGRESS) {
          const state = sampleTracks(preset, progress, params, { baseColor: "#ffffff" });
          expect(finite(state), `${name(preset)} à ${progress}`).toBe(true);
        }
      }
    }
  });
});

describe("bibliothèque de texte : repos", () => {
  it("une entrée finit au repos", () => {
    for (const preset of PRESETS.filter((p) => p.phase === "in")) {
      expect(isRestState(sampleTracks(preset, 1)), name(preset)).toBe(true);
    }
  });

  it("une sortie part du repos et finit hors de vue", () => {
    for (const preset of PRESETS.filter((p) => p.phase === "out")) {
      expect(isRestState(sampleTracks(preset, 0)), name(preset)).toBe(true);
      expect(vanished(sampleTracks(preset, 1)), name(preset)).toBe(true);
    }
  });

  it("une mise en avant part du repos et y revient", () => {
    for (const preset of PRESETS.filter((p) => p.phase === "emphasis")) {
      expect(isRestState(sampleTracks(preset, 0)), name(preset)).toBe(true);
      expect(isRestState(sampleTracks(preset, 1)), name(preset)).toBe(true);
    }
  });

  it("une boucle se referme : son dernier état est son premier", () => {
    for (const preset of PRESETS.filter((p) => p.phase === "loop")) {
      const context = { baseColor: "#ffffff" };
      expect(distance(sampleTracks(preset, 0, undefined, context), sampleTracks(preset, 1, undefined, context)), name(preset)).toBeLessThan(1e-6);
    }
  });

  it("toutes les unités tiennent dans la phase, et la dernière finit au repos", () => {
    for (const preset of PRESETS.filter((p) => p.split && p.split !== "whole")) {
      for (const count of [1, 4, 20, 60]) {
        for (let index = 0; index < count; index++) {
          const { delay, span } = unitTiming(preset, index, count, "titre");
          expect(delay, name(preset)).toBeGreaterThanOrEqual(0);
          expect(delay + span, name(preset)).toBeLessThanOrEqual(1 + 1e-9);
        }
        if (preset.phase === "in" || preset.phase === "emphasis") {
          for (const index of [0, count - 1]) {
            // L'arrondi du décalage peut laisser l'unité à un cheveu de la fin,
            // et la courbe exponentielle ne rejoint 1 qu'à 1 exactement (0,1 %
            // d'écart juste avant) : on tolère cet écart, invisible.
            const state = stateForUnit(preset, index, count, 29, 30, "titre");
            expect(distance(state, restState(state.unit)), `${name(preset)} unité ${index}/${count}`).toBeLessThan(2e-3);
          }
        }
      }
    }
  });
});

describe("bibliothèque de texte : rendu", () => {
  const text: TextItem = {
    id: "titre",
    type: "text",
    text: "Été : « déjà » 🎉 là",
    style: { font: "Inter", weight: 800, size: 0.06, color: "#ffffff", align: "center", lineHeight: 1.2, uppercase: false, letterSpacing: 0, stroke: null, shadow: null, background: null },
    start: 0,
    duration: 60,
    transform: { x: 0.5, y: 0.5, width: 0.8, height: 0.3, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 0 },
    animOut: { kind: "none", frames: 0 },
  };

  /** Contexte factice : mesure à largeur fixe, consigne les appels qui comptent. */
  function recorder() {
    const values: number[] = [];
    const target: Record<string, unknown> = {
      measureText: (value: string) => ({ width: [...value].length * 10 }),
      letterSpacing: "0px",
    };
    const ctx = new Proxy(target, {
      get(object, key: string) {
        if (key in object) return object[key];
        return (...args: unknown[]) => {
          for (const arg of args) if (typeof arg === "number") values.push(arg);
        };
      },
      set(object, key: string, value) {
        object[key] = value;
        if (typeof value === "number") values.push(value);
        return true;
      },
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, values };
  }

  it("chaque préréglage se dessine à toutes les images de sa phase sans valeur NaN", () => {
    for (const preset of PRESETS) {
      const anim = { kind: preset.id, frames: 12 };
      const item: TextItem = {
        ...text,
        animIn: preset.phase === "in" ? anim : text.animIn,
        animOut: preset.phase === "out" ? anim : text.animOut,
        animEmphasis: preset.phase === "emphasis" || preset.phase === "loop" ? { ...anim, at: 12, repeat: 1 } : undefined,
      };
      const project = {
        version: 1, id: "p", name: "p", aspect: "9:16", width: 1080, height: 1920, fps: 30, background: "#000000",
        tracks: [{ id: "v", kind: "visual", name: "v", items: [item] }], createdAt: 0, updatedAt: 0,
      } as unknown as ClipProject;
      const { ctx, values } = recorder();
      for (let frame = 0; frame < 60; frame += 3) drawFrame(ctx, project, frame, () => null);
      expect(values.every(Number.isFinite), name(preset)).toBe(true);
    }
  });
});
