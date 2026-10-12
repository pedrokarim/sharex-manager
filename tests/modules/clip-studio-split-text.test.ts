import { describe, expect, it } from "vitest";
import { isRestState, naturalFrames, stateForUnit, unitTiming } from "@/modules/clip-studio/engine/motion/interpret";
import { getPreset, listPresets } from "@/modules/clip-studio/engine/motion/registry";
import { TEXT_PRESETS } from "@/modules/clip-studio/engine/motion/presets/text";
import {
  cachedLayoutCount,
  countUnits,
  graphemeCount,
  invalidateTextLayouts,
  layoutUnits,
  sliceGraphemes,
  splitGraphemes,
  textLayout,
  wordSpans,
  wrapText,
} from "@/modules/clip-studio/engine/motion/text-layout";
import type { MotionState } from "@/modules/clip-studio/engine/motion/types";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import { activePhaseAt, animStateAt, splitPhaseAt, suggestedAnimFrames } from "@/modules/clip-studio/engine/timeline";
import type { Anim, ClipProject, TextItem, TextStyle } from "@/modules/clip-studio/engine/types";

/**
 * Texte découpé (étape A3) : segmentation, mise en page, état de chaque
 * unité, dessin par unité. La mesure est injectée : aucun navigateur.
 */

const NBSP = "\u00a0";
const NNBSP = "\u202f";
/** « L’été, c’est « top » ! 🎉 », avec les espaces insécables de la typographie française. */
const SAMPLE = `L’été, c’est «${NNBSP}top${NNBSP}»${NBSP}! 🎉`;

const words = (line: string) => wordSpans(line).map(({ start, end }) => line.slice(start, end));

/** Une lettre coupée en deux laisse une moitié de paire de substitution. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

describe("segmentation", () => {
  it("garde entiers les émojis, les accents combinés et l’apostrophe typographique", () => {
    const graphemes = splitGraphemes(SAMPLE);
    expect(graphemes).toContain("🎉");
    expect(graphemes).toContain("’");
    expect(graphemes.join("")).toBe(SAMPLE);
    expect(splitGraphemes("e\u0301té")).toEqual(["e\u0301", "t", "é"]);
    expect(splitGraphemes("👨\u200d👩\u200d👧 🇫🇷 👍🏽")).toEqual(["👨\u200d👩\u200d👧", " ", "🇫🇷", " ", "👍🏽"]);
    expect(graphemeCount("🎉🎉")).toBe(2);
    expect(sliceGraphemes("a🎉b", 2)).toBe("a🎉");
  });

  it("découpe les mots comme un lecteur français, ponctuation attachée", () => {
    expect(words(SAMPLE)).toEqual(["L’été,", "c’est", `«${NNBSP}top${NNBSP}»${NBSP}!`, "🎉"]);
    // La coupe en lignes du bloc remplace les insécables par des espaces :
    // la ponctuation isolée se rattache quand même au bon mot.
    expect(words("L’été, c’est « top » ! 🎉")).toEqual(["L’été,", "c’est", "« top » !", "🎉"]);
    expect(words("Prix : 1 250 € ; vraiment ?")).toEqual(["Prix :", "1", "250 € ;", "vraiment ?"]);
    expect(words(`1${NNBSP}250 €`)).toEqual([`1${NNBSP}250 €`]);
    expect(words("c’est-à-dire ( entre parenthèses )")).toEqual(["c’est-à-dire", "( entre", "parenthèses )"]);
    expect(words("avant – après")).toEqual(["avant", "–", "après"]);
    expect(words("! seul")).toEqual(["! seul"]);
    expect(words("fin «")).toEqual(["fin «"]);
  });

  it("sépare deux mots qui se touchent sans espace, sans rien perdre", () => {
    const line = "東京タワーに行く";
    const spans = wordSpans(line);
    expect(spans.length).toBeGreaterThan(1);
    expect(spans.map(({ start, end }) => line.slice(start, end)).join("")).toBe(line);
  });

  it("compte les unités sans mesure, espaces exclus", () => {
    expect(countUnits(SAMPLE, "char")).toBe(splitGraphemes(SAMPLE).filter((g) => !/^\s+$/u.test(g)).length);
    expect(countUnits(SAMPLE, "word")).toBe(4);
    expect(countUnits("une\n\ndeux", "line")).toBe(2);
    expect(countUnits(SAMPLE, "whole")).toBe(1);
  });
});

/** Mesure additive : chaque point de code a sa largeur. */
const additive = (text: string) => Array.from(text).reduce((sum, char) => sum + (char === " " ? 4 : 7 + (char.codePointAt(0)! % 5)), 0);

describe("mise en page", () => {
  it("place chaque unité à la largeur de ce qui la précède, jusqu'au bout de la ligne", () => {
    const lines = ["L’été, c’est « top » ! 🎉", "e\u0301clair"];
    for (const split of ["char", "word", "line"] as const) {
      const layout = layoutUnits(lines, split, additive);
      expect(layout.lines.map((line) => line.width)).toEqual(lines.map(additive));
      for (const unit of layout.units) {
        const line = lines[unit.line];
        expect(line.slice(unit.start, unit.start + unit.text.length)).toBe(unit.text);
        expect(unit.x).toBe(additive(line.slice(0, unit.start)));
        expect(unit.width).toBe(additive(unit.text));
        expect(unit.text.trim()).not.toBe("");
      }
      // La dernière unité de chaque ligne finit avec la ligne mesurée d'un bloc.
      for (let index = 0; index < lines.length; index++) {
        const last = layout.units.filter((unit) => unit.line === index).at(-1)!;
        expect(last.x + last.width).toBe(layout.lines[index].width);
      }
    }
    const chars = layoutUnits(lines, "char", additive).units.map((unit) => unit.text);
    expect(chars).toContain("🎉");
    expect(chars).toContain("e\u0301");
    expect(chars.some((text) => LONE_SURROGATE.test(text))).toBe(false);
  });

  it("reprend la coupe en lignes du bloc", () => {
    const ctx = fakeContext();
    ctx.font = "800 40px Inter";
    const content = "Une phrase assez longue pour tenir sur plusieurs lignes";
    const layout = textLayout(ctx, content, 200, "char");
    expect(layout.lines.map((line) => line.text)).toEqual(wrapText(ctx, content, 200));
    expect(layout.lines.length).toBeGreaterThan(1);
  });

  it("ne coupe jamais une ligne sur une espace insécable", () => {
    const ctx = fakeContext();
    ctx.font = "800 40px Inter";
    // Assez étroit pour que « top » et « ! » ne tiennent pas avec le reste.
    const content = "Ce short est vraiment top !";
    for (const width of [120, 160, 200, 260]) {
      const lines = wrapText(ctx, content, width);
      expect(lines.some((line) => line.trim() === "!")).toBe(false);
      expect(lines.join(" ")).toContain("top !");
    }
  });

  it("garde la mise en page en cache, et la refait quand le texte, le style, la largeur ou la police changent", () => {
    invalidateTextLayouts();
    const ctx = fakeContext();
    ctx.font = "800 40px Inter";
    const first = textLayout(ctx, "Bonjour à tous", 300, "char");
    expect(textLayout(ctx, "Bonjour à tous", 300, "char")).toBe(first);
    expect(ctx.measured()).toBeGreaterThan(0);
    expect(textLayout(ctx, "Bonjour à toutes", 300, "char")).not.toBe(first);
    expect(textLayout(ctx, "Bonjour à tous", 120, "char")).not.toBe(first);
    expect(textLayout(ctx, "Bonjour à tous", 300, "word")).not.toBe(first);
    expect(textLayout(ctx, "Bonjour à tous", 300, "char", "4px")).not.toBe(first);
    ctx.font = "400 40px Inter";
    expect(textLayout(ctx, "Bonjour à tous", 300, "char")).not.toBe(first);
    ctx.font = "800 40px Inter";
    expect(textLayout(ctx, "Bonjour à tous", 300, "char")).toBe(first);
    // La police de la marque finit de charger : les largeurs changent.
    ctx.setScale(1.2);
    const loaded = textLayout(ctx, "Bonjour à tous", 300, "char");
    expect(loaded).not.toBe(first);
    expect(loaded.lines[0].width).toBeCloseTo(first.lines[0].width * 1.2, 9);
    invalidateTextLayouts();
    expect(cachedLayoutCount()).toBe(0);
    expect(textLayout(ctx, "Bonjour à tous", 300, "char")).not.toBe(loaded);
  });

  it("une mise en page en cache ne mesure qu'une fois le texte entier", () => {
    invalidateTextLayouts();
    const ctx = fakeContext();
    ctx.font = "800 40px Inter";
    textLayout(ctx, SAMPLE, 300, "char");
    const before = ctx.measured();
    textLayout(ctx, SAMPLE, 300, "char");
    expect(ctx.measured() - before).toBe(1);
  });
});

describe("état de chaque unité", () => {
  it("les préréglages de texte sont enregistrés, découpés et rangés", () => {
    for (const preset of TEXT_PRESETS) {
      expect(getPreset(preset.id, preset.phase)).toBe(preset);
      expect(preset.split).not.toBe("whole");
      expect(preset.target).toBe("text");
    }
    expect(listPresets({ phase: "in", category: "by-letter" }).map((preset) => preset.id)).toEqual(
      expect.arrayContaining(["rise-letters", "drop-bounce-letters", "grow-letters"])
    );
    expect(listPresets({ phase: "in", category: "by-word" }).map((preset) => preset.id)).toEqual(
      expect.arrayContaining(["rise-words", "fade-lines"])
    );
    expect(listPresets({ phase: "out" }).map((preset) => preset.id)).toContain("fly-up-letters");
    expect(listPresets({ phase: "in", target: "image" }).some((preset) => preset.split && preset.split !== "whole")).toBe(false);
  });

  it("aux bornes : une entrée finit au repos, une sortie finit effacée ; jamais de NaN", () => {
    const count = 24;
    // Les écarts sont collectés puis vérifiés d'un bloc : une assertion par
    // valeur (des dizaines de milliers) rendait le test lent sous la charge.
    const problems: string[] = [];
    for (const preset of TEXT_PRESETS) {
      for (const phase of ["in", "out"] as const) {
        const played = getPreset(preset.id, phase)!;
        const frames = naturalFrames(played, count, 30);
        for (let local = 0; local < frames; local++) {
          for (let index = 0; index < count; index++) {
            const state = stateForUnit(played, index, count, local, frames, "item");
            for (const [key, value] of Object.entries(state)) {
              if (typeof value === "number" && !Number.isFinite(value)) problems.push(`${preset.id} ${phase} ${key} image ${local}`);
            }
          }
        }
        for (let index = 0; index < count; index++) {
          const end = stateForUnit(played, index, count, frames - 1, frames, "item");
          const ok = phase === "in" ? isRestState(end) : end.opacity === 0 || end.reveal === 0;
          if (!ok) problems.push(`${preset.id} ${phase} unité ${index}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("à la première image, la première lettre est partie et la dernière attend", () => {
    const preset = getPreset("rise-letters", "in")!;
    const frames = naturalFrames(preset, 20, 30);
    const first = stateForUnit(preset, 0, 20, 0, frames, "item");
    const last = stateForUnit(preset, 19, 20, 0, frames, "item");
    expect(first.opacity).toBeGreaterThan(0);
    expect(first.y).toBeLessThan(0.6);
    expect(last.opacity).toBe(0);
    expect(last.y).toBe(0.6);
  });

  it("la frappe montre chaque graphème d'un coup, à son tour", () => {
    const preset = getPreset("type-letters", "in")!;
    const count = 10;
    const frames = naturalFrames(preset, count, 30);
    let previous = 0;
    for (let local = 0; local < frames; local++) {
      const shown = Array.from({ length: count }, (_, index) => stateForUnit(preset, index, count, local, frames, "item").reveal);
      for (const reveal of shown) expect(reveal === 0 || reveal === 1).toBe(true);
      const total = shown.reduce((sum, reveal) => sum + reveal, 0);
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
    expect(previous).toBe(count);
  });

  it("l'éclosion garde la base de la lettre en place", () => {
    const preset = getPreset("grow-letters", "in")!;
    for (let local = 0; local < 20; local++) {
      const state = stateForUnit(preset, 0, 1, local, 20, "item");
      // Bas de la lettre (½ em sous son centre), après échelle et décalage.
      expect(state.y + 0.5 * state.scale).toBeCloseTo(0.5, 9);
    }
  });
});

describe("durées", () => {
  it("propose une phase assez longue pour toutes les unités", () => {
    const item = textItem({ text: "Bonjour à tous" });
    const preset = getPreset("rise-letters", "in")!;
    expect(suggestedAnimFrames(item, "rise-letters", "in", 30)).toBe(naturalFrames(preset, 12, 30));
    expect(suggestedAnimFrames(item, "rise-words", "in", 30)).toBe(naturalFrames(getPreset("rise-words", "in")!, 3, 30));
    expect(suggestedAnimFrames(item, "fade-lines", "in", 30, 3)).toBe(naturalFrames(getPreset("fade-lines", "in")!, 3, 30));
    expect(suggestedAnimFrames(item, "fade", "in", 30)).toBe(10);
    expect(suggestedAnimFrames(item, "inconnue", "in", 30)).toBe(0);
  });

  it("dans un élément trop court, le décalage se resserre et tout finit à temps", () => {
    const preset = getPreset("rise-letters", "in")!;
    const text = "Une phrase de soixante caractères, animée lettre par lettre";
    const count = countUnits(text, "char");
    expect(naturalFrames(preset, count, 30)).toBeGreaterThan(40);
    // L'élément ne dure que 20 images : l'entrée est ramenée à 20 images.
    const item = textItem({ text, duration: 20, animIn: { kind: "rise-letters", frames: 60 } });
    const phase = activePhaseAt(item, 0)!;
    expect(phase.frames).toBe(20);
    for (let index = 0; index < count; index++) {
      const timing = unitTiming(preset, index, count, item.id);
      expect(timing.delay + timing.span).toBeLessThanOrEqual(1 + 1e-12);
      expect(isRestState(stateForUnit(preset, index, count, 19, 20, item.id))).toBe(true);
    }
    // Les départs restent dans l'ordre, et la dernière lettre part avant la fin.
    const starts = Array.from({ length: count }, (_, index) => unitTiming(preset, index, count, item.id).delay);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(starts[count - 1]).toBeLessThan(1);
  });
});

// ─── Dessin ──────────────────────────────────────────────────────

/** Contexte qui enregistre les appels ; la mesure vaut 10 px par unité de code. */
function recordingContext() {
  const log: string[] = [];
  const state: Record<string, unknown> = { filter: "none", globalAlpha: 1 };
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
    measureText: (text: string) => ({ width: text.length * 10 }),
  };
  const ctx = new Proxy(target as Record<string, unknown>, {
    get(object, key: string) {
      if (key in object) return object[key];
      if (key in state) return state[key];
      return (...args: unknown[]) =>
        log.push(`${key}(${args.map((arg) => (typeof arg === "number" ? arg.toFixed(4) : String(arg))).join(",")})`);
    },
    set(_object, key: string, value) {
      state[key] = value;
      log.push(`${key}=${typeof value === "number" ? value.toFixed(4) : value}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

/** Contexte minimal, sans journal : compte les mesures, et peut changer d'échelle (police chargée). */
function fakeContext() {
  let scale = 1;
  let measured = 0;
  const ctx = {
    font: "",
    measureText(text: string) {
      measured++;
      return { width: additive(text) * scale * (ctx.font.startsWith("800") ? 1.1 : 1) };
    },
    setScale(value: number) {
      scale = value;
    },
    measured: () => measured,
  };
  return ctx as unknown as CanvasRenderingContext2D & { setScale(value: number): void; measured(): number };
}

const STYLE: TextStyle = {
  font: "Inter",
  weight: 800,
  size: 0.05,
  color: "#ffffff",
  align: "center",
  lineHeight: 1.2,
  uppercase: false,
  letterSpacing: 0,
  stroke: { color: "#000000", width: 0.08 },
  shadow: { color: "rgba(0,0,0,0.5)", blur: 0.2, offsetY: 0.05 },
  background: { color: "#e11d48", padding: 0.3, radius: 0.2 },
};

function textItem(overrides: Partial<TextItem> = {}): TextItem {
  return {
    id: "title",
    type: "text",
    text: SAMPLE,
    style: STYLE,
    start: 0,
    duration: 90,
    transform: { x: 0.5, y: 0.4, width: 0.8, height: 0.2, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 30 },
    animOut: { kind: "none", frames: 30 },
    ...overrides,
  };
}

function projectWith(item: TextItem): ClipProject {
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

function render(item: TextItem, frame: number): string[] {
  const { ctx, log } = recordingContext();
  drawFrame(ctx, projectWith(item), frame, () => null);
  return log;
}

const filled = (log: string[]) => log.filter((line) => line.startsWith("fillText("));

describe("dessin par unité", () => {
  const animated = (kind: string, extra: Partial<TextItem> = {}) =>
    textItem({ animIn: { kind, frames: 30 }, animOut: { kind: "fly-up-letters", frames: 20 }, ...extra });
  const still = (extra: Partial<TextItem> = {}) => textItem(extra);

  it("au repos, un texte se dessine exactement comme sans animation", () => {
    for (const kind of TEXT_PRESETS.filter((preset) => preset.phase === "in").map((preset) => preset.id)) {
      for (const extra of [{}, { fit: "shrink" as const }, { style: { ...STYLE, uppercase: true, align: "left" as const } }]) {
        const reference = render(still(extra), 50);
        expect(render(animated(kind, extra), 50), kind).toEqual(reference);
        // Dernière image de l'entrée : toutes les unités sont posées, on revient au bloc.
        expect(render(animated(kind, extra), 29), kind).toEqual(render(still(extra), 29));
      }
    }
  });

  it("pendant l'entrée, chaque unité visible a son propre dessin, contour avant remplissage", () => {
    const item = animated("rise-letters");
    expect(animStateAt(item, 10).opacity).toBe(1);
    expect(splitPhaseAt(item, 10)?.split).toBe("char");
    const log = render(item, 10);
    const fills = filled(log);
    const strokes = log.filter((line) => line.startsWith("strokeText("));
    expect(fills.length).toBeGreaterThan(3);
    expect(strokes.length).toBe(fills.length);
    expect(log.indexOf(strokes[strokes.length - 1])).toBeLessThan(log.indexOf(fills[0]));
    // Ni émoji coupé ni espace dessinée.
    for (const line of fills) {
      expect(LONE_SURROGATE.test(line)).toBe(false);
      expect(line).not.toMatch(/^fillText\( ,/);
    }
    // Le fond suit la lettre la plus visible de sa ligne.
    expect(log.some((line) => /^globalAlpha=0\.\d+$/.test(line))).toBe(true);
  });

  it("à la première image, les lettres qui attendent ne sont pas dessinées", () => {
    const item = animated("rise-letters");
    const total = countUnits(SAMPLE, "char");
    const shown = filled(render(item, 0)).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total);
    expect(filled(render(item, 20)).length).toBe(total);
  });

  it("la frappe révèle des graphèmes entiers, émoji compris", () => {
    for (const kind of ["type-letters", "typewriter"]) {
      const item = textItem({ text: "Fête 🎉🎉 e\u0301té 👨\u200d👩\u200d👧", animIn: { kind, frames: 30 } });
      for (let frame = 0; frame < 30; frame++) {
        for (const line of filled(render(item, frame))) expect(LONE_SURROGATE.test(line), `${kind} ${frame}: ${line}`).toBe(false);
      }
    }
  });

  it("sortie lettre par lettre : la dernière image n'affiche plus rien", () => {
    const item = animated("rise-letters");
    expect(filled(render(item, 89))).toEqual([]);
    expect(filled(render(item, 75)).length).toBeGreaterThan(0);
  });

  it("donne le même journal à chaque rendu (aperçu et export)", () => {
    const item = animated("drop-bounce-letters", {
      animIn: { kind: "drop-bounce-letters", frames: 30, params: { intensity: 1.5 } },
    });
    const all = () => {
      const { ctx, log } = recordingContext();
      for (let frame = 0; frame < 90; frame++) drawFrame(ctx, projectWith(item), frame, () => null);
      return log.join("\n");
    };
    const first = all();
    invalidateTextLayouts();
    expect(all()).toBe(first);
  });

  it("s'applique aux mots d'un sous-titre animé, sans rien changer au repos", () => {
    const karaoke = {
      words: [
        { text: "Bonjour", startMs: 0, endMs: 400 },
        { text: "à", startMs: 400, endMs: 600 },
        { text: "tous", startMs: 600, endMs: 1200 },
      ],
      offset: 0,
      highlight: "#ffcc00",
      groupSize: 3,
    };
    const item = textItem({ karaoke, animIn: { kind: "rise-words", frames: 20 } });
    const plain = textItem({ karaoke });
    expect(render(item, 25)).toEqual(render(plain, 25));
    const moving = render(item, 3).join("\n");
    expect(moving).not.toBe(render(plain, 3).join("\n"));
    expect(moving).toMatch(/globalAlpha=0\.\d+/);
  });

  it("un préréglage découpé posé sur une forme anime le bloc entier", () => {
    const anim: Anim = { kind: "rise-letters", frames: 30 };
    const shape = {
      id: "shape",
      type: "shape" as const,
      shape: "rect" as const,
      fill: "#ffffff",
      radius: 0,
      start: 0,
      duration: 60,
      transform: { x: 0.5, y: 0.5, width: 0.4, height: 0.2, rotation: 0, opacity: 1 },
      animIn: anim,
      animOut: { kind: "none", frames: 0 },
    };
    expect(animStateAt(shape, 0).opacity).toBeLessThan(1);
    expect(splitPhaseAt(shape, 0)).toBeNull();
  });
});

describe("performance", () => {
  it("dessine un titre de 60 caractères lettre par lettre sans coût excessif", () => {
    const text = "Une phrase de soixante caractères, animée lettre par lettre";
    const item = textItem({ text, animIn: { kind: "rise-letters", frames: 60 }, duration: 120 });
    const block = textItem({ text, duration: 120 });
    const ctx = noopContext();
    const project = projectWith(item);
    const blockProject = projectWith(block);
    const time = (target: ClipProject, frames: number[]) => {
      for (let round = 0; round < 3; round++) for (const frame of frames) drawFrame(ctx, target, frame, () => null);
      const started = performance.now();
      const rounds = 20;
      for (let round = 0; round < rounds; round++) for (const frame of frames) drawFrame(ctx, target, frame, () => null);
      return (performance.now() - started) / (rounds * frames.length);
    };
    const entering = Array.from({ length: 59 }, (_, index) => index);
    const split = time(project, entering);
    const whole = time(blockProject, entering);
    console.info(
      `Titre de ${text.length} caractères (${countUnits(text, "char")} lettres) : ` +
        `${(split * 1000).toFixed(1)} µs par image lettre par lettre, ${(whole * 1000).toFixed(1)} µs en bloc`
    );
    // Large marge : le budget d'une image à 30 i/s est de 33 ms.
    expect(split).toBeLessThan(5);
  });

  it("réutilise les états des unités d'une image à l'autre", () => {
    const preset = getPreset("rise-letters", "in")!;
    const into = {} as MotionState;
    const state = stateForUnit(preset, 0, 10, 3, 30, "item", { into });
    expect(state).toBe(into);
    const clip = state.clip;
    stateForUnit(preset, 1, 10, 4, 30, "item", { into });
    expect(into.clip).toBe(clip);
  });
});

/** Contexte qui ne fait rien : mesure le coût du moteur seul, pas celui du dessin. */
function noopContext(): CanvasRenderingContext2D {
  const noop = () => {};
  return {
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    transform: noop,
    setTransform: noop,
    beginPath: noop,
    rect: noop,
    clip: noop,
    fill: noop,
    fillRect: noop,
    moveTo: noop,
    arcTo: noop,
    closePath: noop,
    fillText: noop,
    strokeText: noop,
    measureText: (text: string) => ({ width: text.length * 22 }),
    font: "",
    filter: "none",
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    miterLimit: 10,
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetY: 0,
    textAlign: "left",
    textBaseline: "alphabetic",
    letterSpacing: "0px",
  } as unknown as CanvasRenderingContext2D;
}
