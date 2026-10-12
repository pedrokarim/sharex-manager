import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  LEGACY_CAMERA_IDS,
  LEGACY_TRANSITION_IDS,
  listCameraMoves,
  listShotFx,
  listTransitions,
} from "@/modules/clip-studio/engine/motion/scenes";
import { drawFrame, shotFxAt } from "@/modules/clip-studio/engine/render";
import { transitionAt } from "@/modules/clip-studio/engine/timeline";
import type { ShotEffect, VisualItem } from "@/modules/clip-studio/engine/types";
import { FAVORITES_STORAGE_KEY, readFavorites, writeFavorites, type FavoritesStorage } from "@/modules/clip-studio/lib/motion-catalog";
import {
  OTHER_CATEGORY,
  SCENE_CATEGORIES,
  SHOT_FX_MAX_SECONDS,
  acceptsShotEffects,
  addShotEffect,
  advisedTransitionFrames,
  cameraLabel,
  cameraPatch,
  findSceneEntry,
  groupSceneEntries,
  isKnownScene,
  removeShotEffect,
  sceneDetail,
  sceneEntries,
  sceneFavoritesKey,
  sceneLabel,
  searchSceneEntries,
  shotEffectFrames,
  shotFxLabel,
  shotFxNaturalFrames,
  transitionLabel,
  transitionPatch,
  updateShotEffect,
  type SceneKind,
} from "@/modules/clip-studio/lib/scene-catalog";
import { buildScenePreview, scenePreviewFrameAt } from "@/modules/clip-studio/lib/scene-preview";

const KINDS: SceneKind[] = ["transition", "camera", "shotfx"];
const engineIds = (kind: SceneKind) =>
  (kind === "transition" ? listTransitions() : kind === "camera" ? listCameraMoves().filter((p) => p.id !== "none") : listShotFx()).map((p) => p.id);

describe("catalogue des plans", () => {
  it("propose chaque préréglage du moteur une seule fois, tous rangés", () => {
    for (const kind of KINDS) {
      const entries = sceneEntries(kind);
      const ids = entries.map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toEqual([...engineIds(kind)].sort());
      // Tout est dans une vraie catégorie : « Autres » ne sert qu'aux ajouts futurs du moteur.
      expect(entries.filter((entry) => entry.category === OTHER_CATEGORY.key)).toEqual([]);
    }
    expect(sceneEntries("transition")).toHaveLength(34);
    // « Fixe » (none) est l'entrée « rien » du sélecteur, pas un mouvement.
    expect(sceneEntries("camera")).toHaveLength(19);
    expect(sceneEntries("shotfx")).toHaveLength(8);
  });

  it("ne range que des identifiants que le moteur connaît", () => {
    for (const kind of KINDS) {
      const known = new Set(engineIds(kind));
      for (const category of SCENE_CATEGORIES[kind]) for (const id of category.ids) expect(known.has(id), `${kind} ${id}`).toBe(true);
    }
  });

  it("reprend les libellés français du moteur", () => {
    for (const preset of listTransitions()) expect(findSceneEntry("transition", preset.id)?.label).toBe(preset.label);
    for (const preset of listShotFx()) expect(findSceneEntry("shotfx", preset.id)?.label).toBe(preset.label);
  });

  it("range par catégorie dans l'ordre déclaré", () => {
    const groups = groupSceneEntries(sceneEntries("transition"));
    expect(groups.map((group) => group.label)).toEqual(SCENE_CATEGORIES.transition.map((category) => category.label));
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(["fade", "fade-black", "fade-white", "blur"]);
    expect(groups.reduce((sum, group) => sum + group.entries.length, 0)).toBe(34);
  });

  it("cherche sans accents, par nom, catégorie ou identifiant", () => {
    const transitions = sceneEntries("transition");
    expect(searchSceneEntries(transitions, "ecrasement").map((entry) => entry.id)).toEqual(["squeeze"]);
    expect(searchSceneEntries(transitions, "fondu noir").map((entry) => entry.id)).toEqual(["fade-black"]);
    // Le nom qui commence par la recherche passe devant.
    expect(searchSceneEntries(transitions, "balayage")[0].id).toBe("wipe");
    expect(searchSceneEntries(transitions, "  ")).toHaveLength(transitions.length);
    expect(searchSceneEntries(sceneEntries("camera"), "ken").map((entry) => entry.id)).toEqual(["ken-burns", "ken-burns-out"]);
    expect(searchSceneEntries(sceneEntries("shotfx"), "zzz")).toEqual([]);
  });

  it("décrit la durée et le moment d'un mouvement", () => {
    expect(sceneDetail(findSceneEntry("camera", "zoom-in")!, "camera")).toBe("Zooms · tout le plan");
    expect(sceneDetail(findSceneEntry("camera", "shake")!, "camera")).toBe("Impacts · 0,45 s au début du plan");
    expect(sceneDetail(findSceneEntry("camera", "handheld")!, "camera")).toBe("Mise au point et ambiance · 6 s en boucle");
    expect(sceneDetail(findSceneEntry("transition", "whip")!, "transition")).toBe("Mouvements vifs · 0,3 s");
  });
});

describe("libellés", () => {
  it("garde les libellés des cinq transitions et des sept mouvements d'origine", () => {
    expect(LEGACY_TRANSITION_IDS.map(transitionLabel)).toEqual(["Fondu enchaîné", "Fondu au noir", "Glissement", "Balayage", "Zoom"]);
    expect(LEGACY_CAMERA_IDS.map(cameraLabel)).toEqual([
      "Fixe",
      "Zoom avant",
      "Zoom arrière",
      "Panoramique vers la gauche",
      "Panoramique vers la droite",
      "Panoramique vers le haut",
      "Panoramique vers le bas",
    ]);
  });

  it("nomme l'absence et les identifiants inconnus sans planter", () => {
    expect(transitionLabel(undefined)).toBe("Coupe franche");
    expect(transitionLabel("none")).toBe("Coupe franche");
    expect(transitionLabel("warp-9")).toBe("Inconnue (warp-9)");
    expect(cameraLabel(undefined)).toBe("Fixe");
    expect(cameraLabel("dolly-zoom")).toBe("Inconnu (dolly-zoom)");
    expect(shotFxLabel("laser")).toBe("Inconnu (laser)");
    expect(shotFxLabel("")).toBe("Inconnu (?)");
    expect(sceneLabel("transition", "iris")).toBe("Iris");
    expect(isKnownScene("transition", "none")).toBe(true);
    expect(isKnownScene("transition", "warp-9")).toBe(false);
    expect(isKnownScene("shotfx", "none")).toBe(false);
    expect(isKnownScene("shotfx", "impact-hit")).toBe(true);
  });
});

const plan = (patch: Partial<VisualItem> = {}) => ({ duration: 90, transition: undefined, ...patch }) as Pick<VisualItem, "duration" | "transition">;

describe("choix d'une transition ou d'un mouvement", () => {
  it("pose la durée conseillée, et retire la transition avec « none »", () => {
    expect(transitionPatch(plan(), "whip", 30)).toEqual({ transition: { kind: "whip", frames: 9 } });
    expect(transitionPatch(plan({ transition: { kind: "fade", frames: 18 } }), "none", 30)).toEqual({ transition: undefined });
    expect(advisedTransitionFrames("fade", 30)).toBe(18);
    expect(advisedTransitionFrames("inconnue", 30)).toBe(18);
  });

  it("suit la durée conseillée tant qu'elle n'a pas été réglée, et garde une durée réglée à la main", () => {
    expect(transitionPatch(plan({ transition: { kind: "fade", frames: 18 } }), "ink", 30).transition?.frames).toBe(24);
    expect(transitionPatch(plan({ transition: { kind: "fade", frames: 25 } }), "ink", 30).transition?.frames).toBe(25);
    expect(transitionPatch(plan({ transition: { kind: "warp-9", frames: 7 } }), "fade", 30).transition?.frames).toBe(7);
  });

  it("borne la transition à la durée du plan", () => {
    expect(transitionPatch(plan({ duration: 5 }), "ink", 30).transition?.frames).toBe(5);
  });

  it("pose un mouvement de caméra, ou le retire selon le type", () => {
    expect(cameraPatch("image", "ken-burns")).toEqual({ motion: "ken-burns" });
    expect(cameraPatch("image", "none")).toEqual({ motion: "none" });
    expect(cameraPatch("video", "none")).toEqual({ motion: undefined });
  });
});

describe("effets de plan", () => {
  it("ajoute un effet à sa durée naturelle, rangé par instant", () => {
    const first = addShotEffect(undefined, "impact-hit", 60, 30);
    expect(first).toEqual({ effects: [{ kind: "impact-hit", at: 60, frames: 15 }], index: 0 });
    const second = addShotEffect(first.effects, "impact-flash", 12.4, 30);
    expect(second.index).toBe(0);
    expect(second.effects.map((effect) => effect.at)).toEqual([12, 60]);
    const third = addShotEffect(second.effects, "frame-shake", 90, 30);
    expect(third.index).toBe(2);
    expect(addShotEffect(undefined, "beat-zoom", -5, 30).effects[0].at).toBe(0);
  });

  it("règle un effet sans changer l'ordre, et borne sa durée", () => {
    const effects: ShotEffect[] = [
      { kind: "impact-flash", at: 10, frames: 8 },
      { kind: "impact-hit", at: 40, frames: 15 },
    ];
    const moved = updateShotEffect(effects, 0, { at: 70 }, 30);
    expect(moved.map((effect) => effect.at)).toEqual([70, 40]);
    expect(effects[0].at).toBe(10);
    expect(updateShotEffect(effects, 1, { frames: 10_000 }, 30)[1].frames).toBe(SHOT_FX_MAX_SECONDS * 30);
    expect(updateShotEffect(effects, 1, { frames: 0 }, 30)[1].frames).toBe(3);
    expect(updateShotEffect(effects, 5, { at: 1 }, 30)).toEqual(effects);
  });

  it("changer d'effet reprend la durée naturelle du nouveau, sauf durée réglée à la main", () => {
    const natural: ShotEffect[] = [{ kind: "impact-flash", at: 0, frames: shotFxNaturalFrames("impact-flash", 30) }];
    expect(updateShotEffect(natural, 0, { kind: "impact-hit" }, 30)[0]).toEqual({ kind: "impact-hit", at: 0, frames: 15 });
    const custom: ShotEffect[] = [{ kind: "impact-flash", at: 0, frames: 30 }];
    expect(updateShotEffect(custom, 0, { kind: "impact-hit" }, 30)[0].frames).toBe(30);
  });

  it("retire un effet ; une piste sans effet n'en garde pas de liste vide", () => {
    const effects: ShotEffect[] = [
      { kind: "impact-flash", at: 10, frames: 8 },
      { kind: "impact-hit", at: 40, frames: 15 },
    ];
    expect(removeShotEffect(effects, 0)).toEqual([effects[1]]);
    expect(removeShotEffect([effects[0]], 0)).toBeUndefined();
    expect(removeShotEffect(undefined, 0)).toBeUndefined();
  });

  it("compte la durée d'un effet comme le moteur", () => {
    const effect: ShotEffect = { kind: "impact-hit", at: 30, frames: 0 };
    const frames = shotEffectFrames(effect, 30);
    expect(frames).toBe(15);
    expect(shotFxAt([effect], 30 + frames - 1, 30)).not.toBeNull();
    expect(shotFxAt([effect], 30 + frames, 30)).toBeNull();
  });

  it("n'accepte d'effets que sur une piste visuelle non verrouillée", () => {
    expect(acceptsShotEffects({ kind: "visual" })).toBe(true);
    expect(acceptsShotEffects({ kind: "visual", locked: true })).toBe(false);
    expect(acceptsShotEffects({ kind: "audio" })).toBe(false);
  });
});

describe("vignettes", () => {
  const W = 96;
  const H = 60;
  const witness = createCanvas(64, 40);
  const wctx = witness.getContext("2d");
  wctx.fillStyle = "#4f46e5";
  wctx.fillRect(0, 0, 64, 40);

  it("dessine chaque transition, mouvement et effet sans erreur, et montre l'effet à l'arrêt", () => {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    for (const kind of KINDS) {
      for (const id of [...(kind === "shotfx" ? [] : ["none"]), ...engineIds(kind)]) {
        const preview = buildScenePreview(kind, id, W, H);
        expect(preview.loopFrames).toBeGreaterThan(0);
        expect(preview.stillFrame).toBeGreaterThanOrEqual(0);
        expect(preview.stillFrame).toBeLessThan(preview.loopFrames);
        for (const frame of [0, preview.stillFrame, preview.loopFrames - 1]) {
          drawFrame(ctx, preview.project, frame, () => witness as unknown as CanvasImageSource);
        }
        const track = preview.project.tracks[0];
        if (kind === "transition" && id !== "none") {
          const items = track.items as VisualItem[];
          expect(transitionAt(items, items[1], preview.stillFrame), id).not.toBeNull();
        }
        if (kind === "shotfx") expect(shotFxAt(track.effects!, preview.stillFrame, preview.project.fps), id).not.toBeNull();
      }
    }
  });

  it("boucle sur un tour", () => {
    const preview = buildScenePreview("transition", "fade", W, H);
    expect(scenePreviewFrameAt(preview, 0)).toBe(0);
    expect(scenePreviewFrameAt(preview, (preview.loopFrames / 30) * 1000)).toBe(0);
    expect(scenePreviewFrameAt(preview, -50)).toBe(0);
  });
});

describe("favoris", () => {
  const memory = (): FavoritesStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
  };

  it("sont rangés à part pour chaque famille, sans toucher à ceux des animations", () => {
    const keys = KINDS.map(sceneFavoritesKey);
    expect(new Set([...keys, FAVORITES_STORAGE_KEY]).size).toBe(4);
    const storage = memory();
    writeFavorites(storage, ["fade"], FAVORITES_STORAGE_KEY);
    writeFavorites(storage, ["zoom", "iris"], sceneFavoritesKey("transition"));
    expect(readFavorites(storage)).toEqual(["fade"]);
    expect(readFavorites(storage, sceneFavoritesKey("transition"))).toEqual(["zoom", "iris"]);
    expect(readFavorites(storage, sceneFavoritesKey("camera"))).toEqual([]);
  });
});
