import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { boardPaletteOf, DEFAULT_BOARD_PALETTE } from "@/modules/clip-studio/engine/board-palette";
import { applyBrandTheme, defaultRoleStyles, type BrandTheme } from "@/modules/clip-studio/engine/brand";
import { createProject } from "@/modules/clip-studio/engine/edit";
import {
  bendStroke,
  companionsOf,
  createActor,
  createDrawnStroke,
  createStroke,
  fitStroke,
  groupOf,
  hitTestAt,
  illustrationZone,
  insertIllustration,
  isEditableStroke,
  moveStrokePoint,
  strokeBend,
  strokeDrawFrames,
  strokeHandles,
  withDrawFrames,
  type ActorKind,
  type IllustrateContext,
  type StrokeKind,
} from "@/modules/clip-studio/engine/illustrate";
import { followBox, keyArrival, keysByArrival, keySummary, moveKeyTo, placeAt, removeKey, setKeyFrames, upsertKey } from "@/modules/clip-studio/engine/key-edit";
import { keyedFrame } from "@/modules/clip-studio/engine/keys";
import { drawFrame, strokePolyline } from "@/modules/clip-studio/engine/render";
import type { ClipProject, ShapeItem, TextItem, VisualItem } from "@/modules/clip-studio/engine/types";

/**
 * Illustrer à la main (dossier 01, illustrations, étape I6) : acteurs et
 * traits du panneau, tracés à la souris, poignées de tracé, images clés
 * posées par les gestes de l'éditeur, sélection sur le cadre animé.
 */

const SHORT: IllustrateContext = { aspect: "9:16", width: 1080, height: 1920, fps: 30, start: 45 };
const SIZE = { width: 1080, height: 1920 };

function rect(patch: Partial<ShapeItem> = {}): ShapeItem {
  return {
    id: "s-1",
    type: "shape",
    shape: "rect",
    start: 30,
    duration: 90,
    fill: "#000000",
    radius: 0,
    transform: { x: 0.3, y: 0.4, width: 0.2, height: 0.1, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 1 },
    animOut: { kind: "none", frames: 1 },
    ...patch,
  };
}

/** Boîte (pixels) de ce qu'un élément dessine réellement sur un fond blanc. */
function inkBox(items: VisualItem[], frame: number) {
  const project: ClipProject = { ...createProject("Essai", "9:16"), background: "#ffffff", tracks: [{ id: "t", kind: "visual", name: "Piste", items }] };
  const canvas = createCanvas(project.width, project.height);
  const ctx = canvas.getContext("2d");
  drawFrame(ctx as unknown as CanvasRenderingContext2D, project, frame, () => null);
  const data = ctx.getImageData(0, 0, project.width, project.height).data;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (let y = 0; y < project.height; y++) {
    for (let x = 0; x < project.width; x++) {
      const at = (y * project.width + x) * 4;
      if (data[at] < 250 || data[at + 1] < 250 || data[at + 2] < 250) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return { left, right, top, bottom };
}

describe("traits du panneau", () => {
  const zone = illustrationZone("9:16");
  const center = { x: (zone.left + zone.width / 2) * 1080, y: (zone.top + zone.height / 2) * 1920 };

  it.each<StrokeKind>(["arrow", "cross", "strike", "underline", "circle", "link"])("« %s » : un tracé de la planche, centré sur la zone d'écriture, qui se dessine", (kind) => {
    const item = createStroke(kind, SHORT);
    expect(item.shape).toBe("stroke");
    expect(item.start).toBe(45);
    expect(item.duration).toBe(90);
    expect(item.theme).toMatchObject({ board: true });
    expect(item.fill).toBe(DEFAULT_BOARD_PALETTE[item.theme!.boardColor!]);
    expect(item.stroke!.paths.every((path) => path.draw && path.draw.frames > 0)).toBe(true);
    expect(groupOf(item.id)).not.toBeNull();
    // Boîte entière dans le cadre et centrée au millième sur la zone.
    const t = item.transform;
    expect(t.x * 1080).toBeCloseTo(center.x, 3);
    expect(t.y * 1920).toBeCloseTo(center.y, 3);
    expect(t.x - t.width / 2).toBeGreaterThanOrEqual(0);
    expect(t.x + t.width / 2).toBeLessThanOrEqual(1);
    // Le centre de la courbe dessinée (échantillonnée) est celui de la boîte ; une flèche se centre pointe comprise (rendu, plus bas).
    if (kind === "arrow") return;
    const samples = item.stroke!.paths.flatMap((path) => strokePolyline(path, t.width * 1080, t.height * 1920));
    const xs = samples.map(([x]) => x);
    const ys = samples.map(([, y]) => y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(0, 6);
  });

  it.each<StrokeKind>(["strike", "arrow", "circle", "cross"])("« %s » rendu : son encre est centrée sur la zone, à un pixel près", (kind) => {
    const item = createStroke(kind, SHORT);
    const ink = inkBox([item], 45 + 30);
    // Milieu de l'encre (bords de pixels compris) sur le centre de la zone : écart gauche = droite, haut = bas.
    expect(Math.abs((ink.left + ink.right + 1) / 2 - center.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((ink.top + ink.bottom + 1) / 2 - center.y)).toBeLessThanOrEqual(1);
  });

  it("une croix se dessine en deux temps, une branche puis l'autre", () => {
    const cross = createStroke("cross", SHORT);
    const [first, second] = cross.stroke!.paths;
    expect(first.draw!.at).toBe(0);
    expect(second.draw!.at).toBe(first.draw!.frames);
    expect(strokeDrawFrames(cross)).toBe(first.draw!.frames * 2);
  });

  it("prend la palette d'une marque, et une marque appliquée ensuite le recolore", () => {
    const palette = boardPaletteOf({ background: "#101010", ink: "#fafafa", surface: "#222222", onSurface: "#eeeeee", accent: "#ff3366", onAccent: "#000000" });
    const circle = createStroke("circle", { ...SHORT, palette });
    expect(circle.fill).toBe("#ff3366");
    const theme = { kitId: "k", name: "Marque", palette: { background: "#ffffff", ink: "#111111", surface: "#ffffff", onSurface: "#111111", accent: "#00aa55", onAccent: "#ffffff", extras: [] }, textStyles: defaultRoleStyles(), fonts: [] } as BrandTheme;
    const project = applyBrandTheme(insertIllustration(createProject("Essai", "9:16"), [circle]), theme);
    const recolored = project.tracks.flatMap((track) => track.items).find((item) => item.id === circle.id) as ShapeItem;
    expect(recolored.fill).toBe("#00aa55");
  });
});

describe("tracés à la souris", () => {
  it("un glissement donne un trait de son départ à son arrivée, dans une boîte ajustée", () => {
    const arrow = createDrawnStroke("arrow", [0.2, 0.3], [0.7, 0.45], SHORT)!;
    expect(arrow.stroke!.paths[0].head).toBe("end");
    expect(isEditableStroke(arrow)).toBe(true);
    const handles = strokeHandles(arrow, 45)!;
    expect(handles[0][0]).toBeCloseTo(0.2, 9);
    expect(handles[0][1]).toBeCloseTo(0.3, 9);
    expect(handles[2][0]).toBeCloseTo(0.7, 9);
    expect(handles[2][1]).toBeCloseTo(0.45, 9);
    // Droit : le milieu est au milieu ; la boîte garde 64 px de marge de chaque côté (la pointe déborde à peine du bout).
    expect(strokeBend(handles, SIZE)).toBeCloseTo(0, 9);
    expect(arrow.transform.width * 1080 - (0.5 * 1080 + 128)).toBeGreaterThanOrEqual(-1e-6);
    expect(arrow.transform.width * 1080 - (0.5 * 1080 + 128)).toBeLessThan(2);
    expect(arrow.transform.height * 1920 - (0.15 * 1920 + 128)).toBeGreaterThanOrEqual(-1e-6);
    expect(arrow.transform.height * 1920 - (0.15 * 1920 + 128)).toBeLessThan(2);
  });

  it("un simple clic ne crée rien ; une liaison est courbée comme sur la planche", () => {
    expect(createDrawnStroke("line", [0.5, 0.5], [0.505, 0.502], SHORT)).toBeNull();
    const link = createDrawnStroke("link", [0.2, 0.5], [0.8, 0.5], SHORT)!;
    expect(strokeBend(strokeHandles(link, 45)!, SIZE)).toBeCloseTo(0.12, 9);
    expect(link.fill).toBe(DEFAULT_BOARD_PALETTE.muted);
  });

  it("les poignées déplacent un bout ou courbent le trait, la boîte suit", () => {
    const line = createDrawnStroke("line", [0.2, 0.5], [0.6, 0.5], SHORT)!;
    const moved = { ...line, ...moveStrokePoint(line, 50, 2, [0.8, 0.6], SIZE)! } as ShapeItem;
    const handles = strokeHandles(moved, 50)!;
    expect(handles[0][0]).toBeCloseTo(0.2, 9);
    expect(handles[2][0]).toBeCloseTo(0.8, 9);
    expect(handles[2][1]).toBeCloseTo(0.6, 9);
    const bent = { ...moved, ...bendStroke(moved, 50, -0.2, SIZE)! } as ShapeItem;
    const after = strokeHandles(bent, 50)!;
    expect(strokeBend(after, SIZE)).toBeCloseTo(-0.2, 9);
    expect(after[0][0]).toBeCloseTo(0.2, 9);
    expect(after[2][1]).toBeCloseTo(0.6, 9);
    // La boîte contient la courbe, marge comprise.
    const fitted = fitStroke([{ points: after, smooth: true }], SIZE, 64, 6);
    expect(bent.transform.width).toBeCloseTo(fitted.box.width, 9);
  });

  it("les poignées suivent un tracé animé, et le modifier garde son mouvement", () => {
    const line = createDrawnStroke("line", [0.2, 0.5], [0.6, 0.5], SHORT)!;
    const animated: ShapeItem = { ...line, keys: [{ at: 0, frames: 30, x: line.transform.x + 0.1 }] };
    const handles = strokeHandles(animated, 45 + 30)!;
    expect(handles[0][0]).toBeCloseTo(0.3, 9);
    const edited = { ...animated, ...moveStrokePoint(animated, 45 + 30, 0, [0.25, 0.5], SIZE)! } as ShapeItem;
    expect(strokeHandles(edited, 45 + 30)![0][0]).toBeCloseTo(0.25, 9);
    // Au début, le tracé est toujours 0,1 plus à gauche : le mouvement est le même.
    expect(strokeHandles(edited, 45)![0][0]).toBeCloseTo(0.15, 9);
  });

  it("le dessin se règle : durée partagée entre les traits, ou entier d'emblée", () => {
    const cross = createStroke("cross", SHORT);
    const paths = withDrawFrames(cross.stroke!.paths, 20);
    expect(paths.map((path) => path.draw)).toEqual([{ at: 0, frames: 10 }, { at: 10, frames: 10 }]);
    expect(withDrawFrames(paths, null).every((path) => path.draw === undefined)).toBe(true);
  });
});

describe("acteurs du panneau", () => {
  const zone = illustrationZone("9:16");

  it.each<ActorKind>(["card", "card-index", "chip", "note", "counter", "title"])("« %s » : compilé par la planche, sans image clé, au centre de la zone", (kind) => {
    const items = createActor(kind, SHORT);
    expect(items.length).toBeGreaterThan(0);
    const stem = groupOf(items[0].id);
    expect(stem).not.toBeNull();
    for (const item of items) {
      expect(groupOf(item.id)).toBe(stem);
      expect(item.keys).toBeUndefined();
      expect(item.start).toBe(45);
      expect(item.theme?.board).toBe(true);
      expect(item.animIn.kind).toBe("fade");
    }
    // La pièce du fond (ou le texte seul) est au centre exact de la zone.
    const base = items[items.length - 1];
    expect(base.transform.x).toBeCloseTo(zone.left + zone.width / 2, 9);
    expect(base.transform.y).toBeCloseTo(zone.top + zone.height / 2, 9);
  });

  it("une carte numérotée : son repère et son texte au-dessus de son fond, sur des pistes à eux", () => {
    const items = createActor("card-index", SHORT);
    expect(items.map((item) => item.type)).toEqual(["text", "text", "shape"]);
    expect((items[1] as TextItem).text).toBe("01");
    const project = insertIllustration(createProject("Essai", "9:16"), items);
    expect(project.tracks.slice(0, 3).map((track) => track.items[0].id)).toEqual(items.map((item) => item.id));
    expect(companionsOf(project, items[0].id).map((item) => item.id)).toEqual([items[1].id, items[2].id]);
  });

  it("le texte d'une note passe au-dessus de son fond", () => {
    const items = createActor("note", SHORT);
    expect(items.map((item) => item.type)).toEqual(["text", "shape"]);
    expect(items[0].transform.rotation).toBe(items[1].transform.rotation);
  });

  it("le compteur compte dès son entrée, son unité dans un autre corps ; le titre a un mot sur un pavé", () => {
    const [counter] = createActor("counter", SHORT) as TextItem[];
    expect(counter.count).toMatchObject({ from: 0, at: 0 });
    expect(counter.tail?.text).toBe("vues");
    const [title] = createActor("title", SHORT) as TextItem[];
    expect(title.marks).toEqual([expect.objectContaining({ kind: "pill", from: 2, to: 3, color: DEFAULT_BOARD_PALETTE.accent, textColor: DEFAULT_BOARD_PALETTE.onAccent })]);
  });

  it("les textes reçoivent la police de la marque du projet", () => {
    const [title] = createActor("title", { ...SHORT, fonts: { title: { font: "bk-marque", weight: 800 } } }) as TextItem[];
    expect(title.style.font).toBe("bk-marque");
    expect(title.style.weight).toBe(800);
  });

  it("un trait seul réutilise une piste « Illustrations » libre", () => {
    const first = createStroke("arrow", SHORT);
    const later = createStroke("cross", { ...SHORT, start: 200 });
    const project = insertIllustration(insertIllustration(createProject("Essai", "9:16"), [first]), [later]);
    const tracks = project.tracks.filter((track) => track.name === "Illustrations");
    expect(tracks).toHaveLength(1);
    expect(tracks[0].items.map((item) => item.id)).toEqual([first.id, later.id]);
  });
});

describe("images clés posées par les gestes", () => {
  it("« Animer » ailleurs qu'au début : une clé qui arrive à la tête de lecture", () => {
    const item = rect();
    const patch = placeAt(item, 30 + 40, { x: 0.6, y: 0.5 }, { animate: true, fps: 30 });
    expect(patch.transform).toEqual(item.transform);
    expect(patch.keys).toEqual([{ at: 22, frames: 18, x: 0.6, y: 0.5, ease: "spring" }]);
    const moved = { ...item, ...patch };
    // À la tête de lecture, l'élément est exactement là où on l'a posé ; avant le départ du mouvement, à sa place.
    expect(keyedFrame(moved, 70).transform.x).toBeCloseTo(0.6, 12);
    expect(keyedFrame(moved, 52).transform.x).toBeCloseTo(0.3, 12);
    // Un second déplacement au même instant met la clé à jour au lieu d'en ajouter une.
    const again = placeAt(moved, 70, { x: 0.65 }, { animate: true, fps: 30 });
    expect(again.keys).toHaveLength(1);
    expect(again.keys![0]).toMatchObject({ x: 0.65, y: 0.5, at: 22 });
  });

  it("près du début, le mouvement part de la première image", () => {
    const patch = placeAt(rect(), 30 + 6, { opacity: 0.2 }, { animate: true, fps: 30 });
    expect(patch.keys).toEqual([{ at: 0, frames: 6, opacity: 0.2, ease: "spring" }]);
  });

  it("« Animer » à la première image : le départ change, les clés gardent leur cible", () => {
    const item = rect({ keys: [{ at: 20, frames: 10, x: 0.7 }] });
    const patch = placeAt(item, 30, { x: 0.1 }, { animate: true, fps: 30 });
    expect(patch.transform.x).toBe(0.1);
    expect(patch.keys).toEqual(item.keys);
  });

  it("sans « Animer » : rien ne change pour un élément fixe, tout le mouvement suit pour un élément animé", () => {
    const fixed = rect();
    expect(placeAt(fixed, 70, { x: 0.5 }, { animate: false, fps: 30 })).toEqual({ transform: { ...fixed.transform, x: 0.5 }, keys: undefined });
    const item = rect({ keys: [{ at: 0, frames: 30, x: 0.5, width: 0.4 }] });
    const patch = placeAt(item, 30 + 30, { x: 0.6, width: 0.2 }, { animate: false, fps: 30 });
    expect(patch.transform.x).toBeCloseTo(0.4, 12);
    expect(patch.transform.width).toBeCloseTo(0.1, 12);
    expect(patch.keys![0].x).toBeCloseTo(0.6, 12);
    expect(patch.keys![0].width).toBeCloseTo(0.2, 12);
    const moved = { ...item, ...patch };
    expect(keyedFrame(moved, 60).transform.x).toBeCloseTo(0.6, 12);
    expect(keyedFrame(moved, 45).transform.x - keyedFrame(item, 45).transform.x).toBeCloseTo(0.1, 12);
  });

  it("une clé se déplace dans le temps, change de durée et se retire", () => {
    const keys = upsertKey(undefined, 40, { x: 0.6 }, 18);
    expect(keyArrival(keys[0])).toBe(40);
    const later = moveKeyTo(keys, 0, 70, 90);
    expect(later[0]).toMatchObject({ at: 52, frames: 18 });
    const early = moveKeyTo(keys, 0, 5, 90);
    expect(early[0]).toMatchObject({ at: 0, frames: 5 });
    expect(moveKeyTo(keys, 0, 500, 90)[0].at + 18).toBe(90);
    const longer = setKeyFrames(keys, 0, 30);
    expect(longer[0]).toMatchObject({ at: 10, frames: 30 });
    expect(keyArrival(longer[0])).toBe(40);
    expect(removeKey(keys, 0)).toBeUndefined();
    expect(keySummary({ at: 0, frames: 1, x: 0.1, opacity: 0 })).toBe("Position, opacité");
    const item = rect({ keys: [{ at: 50, frames: 10, x: 0.1 }, { at: 0, frames: 10, y: 0.2 }] });
    expect(keysByArrival(item).map((entry) => entry.index)).toEqual([1, 0]);
  });

  it("les pièces d'un acteur suivent la pièce tenue, et grandissent avec elle autour de son centre", () => {
    const before = { x: 0.5, y: 0.5, width: 0.4, height: 0.2, rotation: 0, opacity: 1 };
    const text = { x: 0.55, y: 0.5, width: 0.2, height: 0.1, rotation: 0, opacity: 1 };
    expect(followBox(before, { x: 0.6, y: 0.4 }, text)).toEqual({ x: 0.65, y: 0.4 });
    const grown = followBox(before, { width: 0.8, height: 0.4 }, text);
    expect(grown.x).toBeCloseTo(0.6, 12);
    expect(grown.width).toBeCloseTo(0.4, 12);
    expect(grown.height).toBeCloseTo(0.2, 12);
  });
});

describe("sélection sur l'aperçu", () => {
  it("prend l'élément à sa place animée, pas à sa place de départ", () => {
    const item = rect({ keys: [{ at: 0, frames: 30, x: 0.7 }] });
    expect(hitTestAt([item], [0.3, 0.4], 30, SIZE, 8)?.id).toBe("s-1");
    expect(hitTestAt([item], [0.3, 0.4], 60, SIZE, 8)).toBeNull();
    expect(hitTestAt([item], [0.7, 0.4], 60, SIZE, 8)?.id).toBe("s-1");
  });

  it("un tracé ne se prend que près de son trait, et laisse passer ce qui est dessous", () => {
    const line = createDrawnStroke("line", [0.2, 0.5], [0.8, 0.5], SHORT)!;
    const below = rect({ start: 0, duration: 200, transform: { x: 0.5, y: 0.52, width: 0.5, height: 0.1, rotation: 0, opacity: 1 } });
    expect(hitTestAt([line, below], [0.5, 0.5], 60, SIZE, 8)?.id).toBe(line.id);
    expect(hitTestAt([line, below], [0.5, 0.53], 60, SIZE, 8)?.id).toBe("s-1");
  });

  it("tient compte de la rotation et de l'agrandissement", () => {
    const tall = rect({ transform: { x: 0.5, y: 0.5, width: 0.1, height: 0.3, rotation: 90, opacity: 1 } });
    // Tourné d'un quart de tour, le rectangle haut de 576 px s'étend en largeur.
    expect(hitTestAt([tall], [0.5 + 250 / 1080, 0.5], 40, SIZE, 0)?.id).toBe("s-1");
    expect(hitTestAt([tall], [0.5, 0.5 + 250 / 1920], 40, SIZE, 0)).toBeNull();
    const grown = rect({ keys: [{ at: 0, frames: 1, scale: 2 }] });
    expect(hitTestAt([grown], [0.3 + 0.15, 0.4], 60, SIZE, 0)?.id).toBe("s-1");
  });
});
