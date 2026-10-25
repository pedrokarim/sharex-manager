// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IllustratePanel } from "@/modules/clip-studio/components/illustrate-panel";
import { KeysField, MarksField, StrokeFields, nextWordRange } from "@/modules/clip-studio/components/illustrate-fields";
import { PreviewStage } from "@/modules/clip-studio/components/preview-stage";
import { DEFAULT_BOARD_PALETTE } from "@/modules/clip-studio/engine/board-palette";
import { createProject, createTextItem } from "@/modules/clip-studio/engine/edit";
import { createDrawnStroke, createStroke } from "@/modules/clip-studio/engine/illustrate";
import type { ClipProject, ShapeItem, TextItem, VisualItem } from "@/modules/clip-studio/engine/types";

// Radix mesure ses éléments ; jsdom ne connaît ni ResizeObserver ni la capture du pointeur.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;

const CONTEXT = { aspect: "9:16" as const, width: 1080, height: 1920, fps: 30, start: 0 };

function projectWith(items: VisualItem[]): ClipProject {
  return { ...createProject("Essai", "9:16"), tracks: [{ id: "t-1", kind: "visual", name: "Illustrations", items }] };
}

function stage(project: ClipProject, props: Partial<React.ComponentProps<typeof PreviewStage>> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onPlace: vi.fn(),
    onPatchItem: vi.fn(),
    onRestore: vi.fn(),
    onDraw: vi.fn(),
    onToolChange: vi.fn(),
    onAnimateChange: vi.fn(),
  };
  const canvasRef = React.createRef<HTMLCanvasElement>();
  const view = render(<PreviewStage project={project} frame={0} selectedId={null} tool={null} animate={false} canvasRef={canvasRef} {...handlers} {...props} />);
  // Le canevas à l'écran : 100 × 200 px depuis le coin de la page, pour lire les gestes en parts du cadre.
  const canvas = view.container.querySelector("canvas")!;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 200, right: 100, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  const layer = view.container.querySelector("[data-preview-layer]") as HTMLElement;
  return { ...view, handlers, layer };
}

describe("panneau « Illustrer »", () => {
  it("pose un trait ou un acteur, et choisit un outil de tracé", async () => {
    const onAddStroke = vi.fn();
    const onAddActor = vi.fn();
    const onToolChange = vi.fn();
    render(<IllustratePanel palette={DEFAULT_BOARD_PALETTE} tool={null} onToolChange={onToolChange} onAddStroke={onAddStroke} onAddActor={onAddActor} />);
    await userEvent.click(screen.getByTitle("Ajouter une croix à la tête de lecture"));
    expect(onAddStroke).toHaveBeenCalledWith("cross");
    await userEvent.click(screen.getByTitle("Ajouter une carte numérotée à la tête de lecture"));
    expect(onAddActor).toHaveBeenCalledWith("card-index");
    const tools = screen.getByRole("group", { name: "Outils de tracé" });
    await userEvent.click(within(tools).getByRole("button", { name: /Flèche/ }));
    expect(onToolChange).toHaveBeenCalledWith("arrow");
  });
});

describe("aperçu", () => {
  it("trace un trait de l'appui au relâcher, en parts du cadre", () => {
    const { layer, handlers } = stage(projectWith([]), { tool: "arrow" });
    fireEvent.pointerDown(layer, { button: 0, clientX: 20, clientY: 60 });
    fireEvent.pointerMove(layer, { clientX: 70, clientY: 90 });
    fireEvent.pointerUp(layer, { clientX: 70, clientY: 90 });
    expect(handlers.onDraw).toHaveBeenCalledWith("arrow", [0.2, 0.3], [0.7, 0.45]);
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("le cadre de sélection suit l'élément à sa place animée", () => {
    const item: VisualItem = { ...createStroke("cross", CONTEXT), keys: [{ at: 0, frames: 10, x: 0.25, y: 0.7 }] };
    const { container } = stage(projectWith([item]), { selectedId: item.id, frame: 20 });
    const selection = container.querySelector("[data-selection-box]") as HTMLElement;
    const width = item.transform.width;
    expect(parseFloat(selection.style.left)).toBeCloseTo((0.25 - width / 2) * 100, 6);
    expect(parseFloat(selection.style.top)).toBeCloseTo((0.7 - item.transform.height / 2) * 100, 6);
  });

  it("un tracé sélectionné a ses poignées de bout et de courbe, qui le modifient", () => {
    const line = createDrawnStroke("line", [0.2, 0.3], [0.6, 0.3], CONTEXT)!;
    const { container, handlers, layer } = stage(projectWith([line]), { selectedId: line.id, frame: 10 });
    const end = container.querySelector('[data-stroke-handle="end"]') as HTMLElement;
    expect(parseFloat(end.style.left)).toBeCloseTo(60, 6);
    expect(parseFloat(end.style.top)).toBeCloseTo(30, 6);
    expect(container.querySelector('[data-stroke-handle="bend"]')).not.toBeNull();
    // Pas de coins de redimensionnement sur un trait : ses bouts suffisent.
    expect(container.querySelector("[data-resize-handle]")).toBeNull();
    fireEvent.pointerDown(end, { button: 0, clientX: 60, clientY: 60 });
    fireEvent.pointerMove(end, { clientX: 80, clientY: 100 });
    const [id, patch] = handlers.onPatchItem.mock.calls[0];
    expect(id).toBe(line.id);
    expect((patch as Partial<ShapeItem>).stroke?.paths[0].points).toHaveLength(3);
    fireEvent.pointerUp(layer);
  });

  it("déplacer un élément passe par la pose à la tête de lecture", () => {
    const card: VisualItem = { ...createTextItem("title", 0, 30), id: "x-1", transform: { x: 0.5, y: 0.5, width: 0.4, height: 0.1, rotation: 0, opacity: 1 } };
    const { layer, handlers } = stage(projectWith([card]), { frame: 15, animate: true });
    fireEvent.pointerDown(layer, { button: 0, clientX: 50, clientY: 100 });
    expect(handlers.onSelect).toHaveBeenCalledWith("x-1");
    fireEvent.pointerMove(layer, { clientX: 60, clientY: 120 });
    expect(handlers.onPlace).toHaveBeenLastCalledWith("x-1", { x: 0.6, y: 0.6 });
  });

  it("« Animer » se bascule depuis la barre de l'aperçu", async () => {
    const { handlers } = stage(projectWith([]));
    await userEvent.click(screen.getByRole("button", { name: "Animer" }));
    expect(handlers.onAnimateChange).toHaveBeenCalledWith(true);
  });
});

describe("inspecteur : marques, tracé, images clés", () => {
  it("choisit des mots dans la bande, puis pose une barre au mot", async () => {
    const text: TextItem = { ...createTextItem("title", 30, 90, "Les étapes ne suffisent pas"), id: "x-1" };
    const onPatch = vi.fn();
    render(<MarksField item={text} fps={30} frame={60} palette={DEFAULT_BOARD_PALETTE} onPatch={onPatch} />);
    const words = screen.getByRole("group", { name: "Mots du texte" });
    await userEvent.click(within(words).getByRole("button", { name: "ne" }));
    await userEvent.click(within(words).getByRole("button", { name: "suffisent" }));
    await userEvent.click(screen.getByRole("radio", { name: "Barré" }));
    await userEvent.click(screen.getByRole("radio", { name: "Au mot" }));
    await userEvent.click(screen.getByRole("button", { name: /^Barré sur «.ne suffisent.»$/ }));
    expect(onPatch).toHaveBeenCalledWith({ marks: [{ kind: "strike", from: 2, to: 4, color: DEFAULT_BOARD_PALETTE.ink, at: 30, frames: 14 }] }, "mark-add-0");
  });

  it("une sélection de mots s'étend, se resserre et se vide", () => {
    expect(nextWordRange(null, 2)).toEqual({ from: 2, to: 3 });
    expect(nextWordRange({ from: 2, to: 3 }, 4)).toEqual({ from: 2, to: 5 });
    expect(nextWordRange({ from: 2, to: 5 }, 3)).toEqual({ from: 3, to: 4 });
    expect(nextWordRange({ from: 3, to: 4 }, 3)).toBeNull();
  });

  it("un tracé se règle : dessin progressif coupé", async () => {
    const arrow = createStroke("arrow", CONTEXT);
    const onPatch = vi.fn();
    render(<StrokeFields item={arrow} fps={30} frame={0} size={{ width: 1080, height: 1920 }} onPatch={onPatch} />);
    await userEvent.click(screen.getByRole("switch", { name: "Se dessine à son début" }));
    const [patch, key] = onPatch.mock.calls[0];
    expect(key).toBe("stroke-draw");
    expect((patch as Partial<ShapeItem>).stroke!.paths.every((path) => path.draw === undefined)).toBe(true);
  });

  it("liste les images clés : aller à l'une, en retirer une", async () => {
    const item = { ...createStroke("cross", { ...CONTEXT, start: 30 }), keys: [{ at: 22, frames: 18, x: 0.6 }] } as VisualItem;
    const onPatch = vi.fn();
    const onSeek = vi.fn();
    render(<KeysField item={item} fps={30} animate onPatch={onPatch} onSeek={onSeek} />);
    await userEvent.click(screen.getByTitle("Placer la tête de lecture sur cette image clé"));
    expect(onSeek).toHaveBeenCalledWith(30 + 40);
    await userEvent.click(screen.getByRole("button", { name: /Retirer l’image clé/ }));
    expect(onPatch).toHaveBeenCalledWith({ keys: undefined }, "key-remove-0");
  });
});
