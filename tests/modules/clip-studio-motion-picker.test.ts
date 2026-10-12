import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { listPresets } from "@/modules/clip-studio/engine/motion/registry";
import { LEGACY_PRESET_IDS } from "@/modules/clip-studio/engine/motion/presets/legacy";
import { MOTION_CATEGORY_LABELS, type MotionPreset } from "@/modules/clip-studio/engine/motion/types";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import { suggestedAnimFrames } from "@/modules/clip-studio/engine/timeline";
import type { ShapeItem, TextItem } from "@/modules/clip-studio/engine/types";
import {
  CATEGORY_ORDER,
  FAVORITES_STORAGE_KEY,
  MAX_FAVORITES,
  compactParams,
  favoritePresets,
  fitsItemType,
  groupByCategory,
  isSplitPreset,
  normalizeSearch,
  paramValue,
  parseFavorites,
  pickPatch,
  presetLabel,
  presetsFor,
  readFavorites,
  resolvePreset,
  searchPresets,
  toggleFavorite,
  writeFavorites,
  type FavoritesStorage,
  type PickerPhase,
} from "@/modules/clip-studio/lib/motion-catalog";
import { buildPreviewScene, previewFrameAt, previewShowsText } from "@/modules/clip-studio/lib/motion-preview";

const PHASES: PickerPhase[] = ["in", "out", "emphasis"];
const ITEM_TYPES = ["text", "image", "video", "shape"] as const;

function shape(overrides: Partial<ShapeItem> = {}): ShapeItem {
  return {
    id: "shape-1",
    type: "shape",
    shape: "rect",
    fill: "#ff0000",
    radius: 0,
    start: 0,
    duration: 90,
    transform: { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0, opacity: 1 },
    animIn: { kind: "fade", frames: 8 },
    animOut: { kind: "none", frames: 8 },
    ...overrides,
  };
}

function text(overrides: Partial<TextItem> = {}): TextItem {
  return {
    id: "text-1",
    type: "text",
    text: "Une phrase de démonstration",
    start: 0,
    duration: 120,
    transform: { x: 0.5, y: 0.5, width: 0.8, height: 0.2, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 10 },
    animOut: { kind: "none", frames: 10 },
    style: {
      font: "Inter",
      weight: 700,
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
    ...overrides,
  };
}

/** Stockage en mémoire, comme `localStorage`. */
function memoryStorage(): FavoritesStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

/** Stockage bloqué (navigation privée stricte, données de site refusées). */
const blockedStorage: FavoritesStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("filtrage par phase et par type d'élément", () => {
  it("ne propose que des préréglages qui déclarent la phase", () => {
    for (const type of ITEM_TYPES) {
      for (const preset of presetsFor("in", type)) expect(preset.phase, preset.id).toBe("in");
      for (const preset of presetsFor("out", type)) expect(preset.phase, preset.id).toBe("out");
      for (const preset of presetsFor("emphasis", type)) expect(["emphasis", "loop"], preset.id).toContain(preset.phase);
    }
  });

  it("ne montre chaque identifiant qu'une fois par phase", () => {
    for (const phase of PHASES) {
      for (const type of ITEM_TYPES) {
        const ids = presetsFor(phase, type).map((preset) => preset.id);
        expect(new Set(ids).size, `${phase}/${type}`).toBe(ids.length);
      }
    }
  });

  it("réserve les préréglages de texte découpé et ceux pensés pour le texte aux textes", () => {
    const textOnly = listPresets().filter((preset) => preset.target === "text" || isSplitPreset(preset));
    expect(textOnly.length).toBeGreaterThan(0);
    for (const phase of PHASES) {
      for (const type of ["image", "video", "shape"] as const) {
        for (const preset of presetsFor(phase, type)) {
          expect(isSplitPreset(preset), `${preset.id} sur ${type}`).toBe(false);
          expect(preset.target, `${preset.id} sur ${type}`).not.toBe("text");
        }
      }
    }
    const textIds = new Set(presetsFor("in", "text").map((preset) => preset.id));
    for (const preset of textOnly.filter((entry) => entry.phase === "in")) expect(textIds.has(preset.id), preset.id).toBe(true);
  });

  it("range une vidéo avec les images", () => {
    for (const phase of PHASES) {
      expect(presetsFor(phase, "video").map((preset) => preset.id)).toEqual(presetsFor(phase, "image").map((preset) => preset.id));
    }
  });

  it("respecte la cible déclarée", () => {
    const fake = (target: MotionPreset["target"], split?: MotionPreset["split"]) =>
      ({ id: "x", label: "X", category: "fade", phase: "in", target, durationMs: 300, split, tracks: {} }) as MotionPreset;
    expect(fitsItemType(fake("any"), "shape")).toBe(true);
    expect(fitsItemType(fake("image"), "video")).toBe(true);
    expect(fitsItemType(fake("image"), "shape")).toBe(false);
    expect(fitsItemType(fake("shape"), "shape")).toBe(true);
    expect(fitsItemType(fake("text"), "image")).toBe(false);
    expect(fitsItemType(fake("any", "char"), "shape")).toBe(false);
    expect(fitsItemType(fake("any", "char"), "text")).toBe(true);
    expect(fitsItemType(fake("any", "whole"), "shape")).toBe(true);
  });

  it("une entrée sans variante de sortie n'est pas proposée en sortie", () => {
    const inOnly = listPresets({ phase: "in" }).find((preset) => !listPresets({ phase: "out" }).some((out) => out.id === preset.id));
    expect(inOnly).toBeDefined();
    expect(presetsFor("out", "text").some((preset) => preset.id === inOnly!.id)).toBe(false);
  });

  it("propose les neuf animations d'origine en entrée comme en sortie, sous leur nom", () => {
    const ids = LEGACY_PRESET_IDS.filter((id) => id !== "none");
    expect(ids).toHaveLength(9);
    for (const id of ids) {
      for (const phase of ["in", "out"] as const) {
        expect(presetsFor(phase, "text").some((preset) => preset.id === id), `${phase}:${id}`).toBe(true);
        expect(presetLabel(id, phase)).toBe(resolvePreset(id, phase)!.label);
      }
    }
  });

  it("nomme « Aucune » et un identifiant inconnu sans planter", () => {
    expect(presetLabel("none", "in")).toBe("Aucune");
    expect(presetLabel(undefined, "emphasis")).toBe("Aucune");
    expect(presetLabel("disparue-depuis", "out")).toBe("Inconnue (disparue-depuis)");
    expect(resolvePreset("disparue-depuis", "in")).toBeUndefined();
  });
});

describe("recherche", () => {
  const all = presetsFor("in", "text");

  it("ignore la casse et les accents", () => {
    expect(normalizeSearch("  Échelles   ET Rebonds ")).toBe("echelles et rebonds");
    const withAccent = searchPresets(all, "échelle");
    const withoutAccent = searchPresets(all, "ECHELLE");
    expect(withAccent.length).toBeGreaterThan(0);
    expect(withoutAccent.map((preset) => preset.id)).toEqual(withAccent.map((preset) => preset.id));
  });

  it("rend tout, dans l'ordre, pour une recherche vide", () => {
    expect(searchPresets(all, "   ").map((preset) => preset.id)).toEqual(all.map((preset) => preset.id));
  });

  it("trouve par catégorie et par découpage", () => {
    const letters = searchPresets(all, "lettre par lettre");
    expect(letters.length).toBeGreaterThan(0);
    for (const preset of letters.filter((entry) => !normalizeSearch(entry.label).includes("lettre"))) {
      expect(preset.split === "char" || preset.category === "by-letter", preset.id).toBe(true);
    }
    const fades = searchPresets(all, "fondus");
    expect(fades.some((preset) => preset.category === "fade")).toBe(true);
  });

  it("exige chaque mot de la recherche", () => {
    for (const preset of searchPresets(all, "montée mot")) {
      const haystack = normalizeSearch(`${preset.label} ${MOTION_CATEGORY_LABELS[preset.category]} ${preset.id} ${preset.split ?? ""}`);
      expect(haystack, preset.id).toContain("montee");
      expect(haystack, preset.id).toContain("mot");
    }
    expect(searchPresets(all, "zzzz introuvable")).toEqual([]);
  });

  it("classe d'abord les noms qui commencent par la recherche", () => {
    const results = searchPresets(all, "fondu");
    expect(results.length).toBeGreaterThan(1);
    expect(normalizeSearch(results[0].label).startsWith("fondu")).toBe(true);
    const firstOther = results.findIndex((preset) => !normalizeSearch(preset.label).startsWith("fondu"));
    if (firstOther !== -1) {
      for (const preset of results.slice(firstOther)) expect(normalizeSearch(preset.label).startsWith("fondu"), preset.id).toBe(false);
    }
  });
});

describe("catégories", () => {
  it("suivent l'ordre du registre et couvrent tous les préréglages", () => {
    for (const phase of PHASES) {
      const presets = presetsFor(phase, "text");
      const groups = groupByCategory(presets);
      const positions = groups.map((group) => CATEGORY_ORDER.indexOf(group.category));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(groups.reduce((sum, group) => sum + group.presets.length, 0)).toBe(presets.length);
      for (const group of groups) {
        expect(group.label).toBe(MOTION_CATEGORY_LABELS[group.category]);
        expect(group.presets.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("favoris", () => {
  it("lisent une valeur abîmée sans erreur", () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites("")).toEqual([]);
    expect(parseFavorites("{pas du json")).toEqual([]);
    expect(parseFavorites('{"fade":true}')).toEqual([]);
    expect(parseFavorites('["fade", 3, null, "", " pop ", "fade", "none"]')).toEqual(["fade", "pop"]);
  });

  it("s'ajoutent en tête et se retirent", () => {
    let list = toggleFavorite([], "fade");
    list = toggleFavorite(list, "pop");
    expect(list).toEqual(["pop", "fade"]);
    expect(toggleFavorite(list, "fade")).toEqual(["pop"]);
    expect(toggleFavorite(list, "none")).toEqual(list);
  });

  it("restent en nombre borné", () => {
    let list: string[] = [];
    for (let index = 0; index < MAX_FAVORITES + 10; index++) list = toggleFavorite(list, `p-${index}`);
    expect(list).toHaveLength(MAX_FAVORITES);
    expect(list[0]).toBe(`p-${MAX_FAVORITES + 9}`);
  });

  it("font l'aller-retour par le stockage", () => {
    const storage = memoryStorage();
    expect(readFavorites(storage)).toEqual([]);
    expect(writeFavorites(storage, ["pop", "fade"])).toBe(true);
    expect(storage.data.get(FAVORITES_STORAGE_KEY)).toBe('["pop","fade"]');
    expect(readFavorites(storage)).toEqual(["pop", "fade"]);
  });

  it("survivent à un stockage bloqué ou absent", () => {
    expect(readFavorites(blockedStorage)).toEqual([]);
    expect(writeFavorites(blockedStorage, ["fade"])).toBe(false);
    expect(readFavorites(null)).toEqual([]);
    expect(writeFavorites(undefined, ["fade"])).toBe(false);
  });

  it("ne gardent que les préréglages proposés, dans l'ordre des favoris", () => {
    const shapes = presetsFor("in", "shape");
    const textOnly = presetsFor("in", "text").find((preset) => isSplitPreset(preset))!;
    const favorites = ["pop", textOnly.id, "inconnu", "fade"];
    expect(favoritePresets(shapes, favorites).map((preset) => preset.id)).toEqual(["pop", "fade"]);
  });
});

describe("choix d'une animation", () => {
  const fps = 30;

  it("pose la durée naturelle du préréglage et oublie les anciens réglages", () => {
    const split = presetsFor("in", "text").find((preset) => preset.split === "char" && preset.stagger)!;
    const item = text({ animIn: { kind: "fade", frames: 6, params: { intensity: 2 } } });
    const patch = pickPatch(item, "in", split.id, fps);
    expect(patch.animIn).toEqual({ kind: split.id, frames: suggestedAnimFrames(item, split.id, "in", fps) });
    expect(patch.animIn!.frames).toBeGreaterThan(6);
  });

  it("borne la durée à celle de l'élément", () => {
    const split = presetsFor("in", "text").find((preset) => preset.split === "char" && preset.stagger)!;
    const item = text({ duration: 5 });
    expect(pickPatch(item, "in", split.id, fps).animIn!.frames).toBeLessThanOrEqual(5);
  });

  it("« Aucune » garde la durée, pour la retrouver en revenant à une animation", () => {
    const item = shape({ animOut: { kind: "fade", frames: 14 } });
    expect(pickPatch(item, "out", "none", fps)).toEqual({ animOut: { kind: "none", frames: 14 } });
  });

  it("une mise en avant commence après l'entrée, une boucle tourne jusqu'à la sortie", () => {
    const item = shape({ animIn: { kind: "fade", frames: 12 } });
    const emphasis = presetsFor("emphasis", "shape").find((preset) => preset.phase === "emphasis")!;
    const loop = presetsFor("emphasis", "shape").find((preset) => preset.phase === "loop")!;
    const once = pickPatch(item, "emphasis", emphasis.id, fps).animEmphasis!;
    expect(once.at).toBe(12);
    expect(once.repeat).toBe(1);
    expect(once.frames).toBeGreaterThan(0);
    expect(pickPatch(item, "emphasis", loop.id, fps).animEmphasis!.repeat).toBe(0);
    expect(pickPatch(item, "emphasis", "none", fps)).toEqual({ animEmphasis: undefined });
  });

  it("garde le début et le nombre de passages d'une mise en avant existante", () => {
    const emphasis = presetsFor("emphasis", "shape").find((preset) => preset.phase === "emphasis")!;
    const item = shape({ animEmphasis: { kind: emphasis.id, frames: 10, at: 30, repeat: 3 } });
    const patch = pickPatch(item, "emphasis", emphasis.id, fps).animEmphasis!;
    expect(patch.at).toBe(30);
    expect(patch.repeat).toBe(3);
  });
});

describe("réglages", () => {
  const amount = { id: "intensity", kind: "amount", label: "Intensité", min: 0, max: 2, default: 1 };
  const direction = { id: "direction", kind: "direction", label: "Direction", default: "up" };
  const order = { id: "order", kind: "order", label: "Ordre", default: "start", options: ["start", "end", "center", "random"] };

  it("lisent le défaut, bornent les nombres et refusent une option inconnue", () => {
    expect(paramValue(amount, undefined)).toBe(1);
    expect(paramValue(amount, { intensity: 5 })).toBe(2);
    expect(paramValue(amount, { intensity: "beaucoup" })).toBe(1);
    expect(paramValue(direction, { direction: "left" })).toBe("left");
    expect(paramValue(direction, { direction: "diagonale" })).toBe("up");
    expect(paramValue(order, { order: "random" })).toBe("random");
    expect(paramValue(order, { order: "nulle-part" })).toBe("start");
  });

  it("ne gardent dans le projet que ce qui diffère du défaut", () => {
    expect(compactParams([amount, direction], { intensity: 1, direction: "up" })).toBeUndefined();
    expect(compactParams([amount, direction], { intensity: 1.5, direction: "up", ancien: 3 })).toEqual({ intensity: 1.5 });
  });
});

describe("vignettes", () => {
  const W = 96;
  const H = 60;

  function painted(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>): boolean {
    const data = ctx.getImageData(0, 0, W, H).data;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
    return false;
  }

  it("bouclent sur une durée positive et montrent le milieu à l'arrêt", () => {
    for (const phase of PHASES) {
      for (const preset of presetsFor(phase, "text")) {
        const scene = buildPreviewScene(preset, phase, { width: W, height: H, color: "rgb(20, 20, 20)", itemType: "text" });
        expect(scene.loopFrames, preset.id).toBeGreaterThan(0);
        expect(scene.stillFrame, preset.id).toBeGreaterThanOrEqual(0);
        expect(scene.stillFrame, preset.id).toBeLessThan(scene.loopFrames);
        expect(previewFrameAt(scene, 0)).toBe(0);
        expect(previewFrameAt(scene, 1e7)).toBeLessThan(scene.loopFrames);
      }
    }
  });

  it("montrent un mot pour le texte et un rectangle pour le reste", () => {
    const split = presetsFor("in", "text").find((preset) => isSplitPreset(preset))!;
    expect(previewShowsText(split, "shape")).toBe(true);
    const fade = resolvePreset("fade", "in")!;
    expect(previewShowsText(fade, "shape")).toBe(false);
    expect(previewShowsText(fade, "text")).toBe(true);
    const scene = buildPreviewScene(fade, "in", { width: W, height: H, color: "#000000", itemType: "image" });
    expect(scene.project.tracks[0].items[0].type).toBe("shape");
  });

  it("se dessinent par le moteur, et une entrée finit visible", () => {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    for (const phase of PHASES) {
      for (const preset of presetsFor(phase, "text")) {
        const itemType = preset.target === "text" || isSplitPreset(preset) ? "text" : "shape";
        const scene = buildPreviewScene(preset, phase, { width: W, height: H, color: "rgb(20, 20, 20)", itemType });
        let seen = false;
        for (let frame = 0; frame < scene.loopFrames; frame += 2) {
          ctx.clearRect(0, 0, W, H);
          drawFrame(ctx as unknown as CanvasRenderingContext2D, scene.project, frame, () => null);
          seen ||= painted(ctx);
        }
        expect(seen, `${phase}:${preset.id}`).toBe(true);
        if (phase === "in") {
          ctx.clearRect(0, 0, W, H);
          drawFrame(ctx as unknown as CanvasRenderingContext2D, scene.project, scene.loopFrames - 1, () => null);
          expect(painted(ctx), `repos de ${preset.id}`).toBe(true);
        }
      }
    }
  });
});
