"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Diamond, MoveUpRight, ScanLine, Slash, Spline } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  bendPoint,
  companionsOf,
  hitTestAt,
  illustrationZone,
  isEditableStroke,
  moveStrokePoint,
  strokeHandles,
  type DrawTool,
} from "../engine/illustrate";
import type { Placement } from "../engine/key-edit";
import { keyedFrame } from "../engine/keys";
import { strokePolyline } from "../engine/render";
import { isActive } from "../engine/timeline";
import type { ClipItem, ClipProject, ShapeItem, Transform, VisualItem } from "../engine/types";

interface PreviewStageProps {
  project: ClipProject;
  frame: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * Pose l'élément tenu à `next`, vu à la tête de lecture (les pièces de son
   * acteur suivent). Les appels d'un même geste forment une étape d'annulation.
   */
  onPlace: (id: string, next: Placement) => void;
  /** Modifie un élément pendant un geste (poignée d'un tracé). */
  onPatchItem: (id: string, patch: Partial<ClipItem>) => void;
  /** Échap pendant un geste : les éléments reprennent leur état d'avant. */
  onRestore: (items: VisualItem[]) => void;
  /** Un trait vient d'être tracé à la souris, de `from` à `to` (parts du canevas). */
  onDraw: (tool: DrawTool, from: [number, number], to: [number, number]) => void;
  /** Outil de tracé actif, ou `null` (sélection). */
  tool: DrawTool | null;
  onToolChange: (tool: DrawTool | null) => void;
  /** « Animer » : un déplacement à un autre instant que le début pose une image clé. */
  animate: boolean;
  onAnimateChange: (animate: boolean) => void;
  /** Reçoit le canevas une fois monté, pour que le lecteur y dessine. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/** Distance, en fraction du canevas, sous laquelle on s'aimante au centre. */
const SNAP = 0.012;
/** Distance, en pixels à l'écran, sous laquelle un clic prend un tracé. */
const STROKE_REACH_PX = 8;

/**
 * Zone de sécurité d'un short 9:16, en fractions du cadre 1080 × 1920 : en
 * haut, le nom du compte ; en bas, la légende et la barre de lecture ; à
 * droite sous la moitié, les boutons (j'aime, commentaires, partage) : y de
 * 230 à 1440, x sous 850 dès y = 900.
 */
const SHORT_SAFE = { top: 230 / 1920, bottom: 1440 / 1920, buttonsTop: 900 / 1920, buttonsLeft: 850 / 1080 };
const SAFE_ZONE_KEY = "clip-studio:safe-zone";

function readSafeZonePreference(): boolean {
  try {
    return window.localStorage.getItem(SAFE_ZONE_KEY) === "1";
  } catch {
    return false;
  }
}

const percent = (fraction: number) => `${fraction * 100}%`;

/** Zones masquées par l'interface des plateformes, grisées par-dessus l'aperçu. */
function SafeZoneOverlay() {
  const shade = "absolute bg-black/45";
  const { top, bottom, buttonsTop, buttonsLeft } = SHORT_SAFE;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className={shade} style={{ left: 0, right: 0, top: 0, height: percent(top) }} />
      <div className={shade} style={{ left: 0, right: 0, top: percent(bottom), bottom: 0 }} />
      <div className={shade} style={{ left: percent(buttonsLeft), right: 0, top: percent(buttonsTop), height: percent(bottom - buttonsTop) }} />
      <div
        className="absolute border border-dashed border-white/80"
        style={{ left: 0, right: 0, top: percent(top), height: percent(bottom - top) }}
      />
    </div>
  );
}

type Point = [number, number];

type Gesture =
  | { kind: "move"; id: string; start: Transform; pointer: Point; originals: VisualItem[] }
  | { kind: "resize"; id: string; start: Transform; scale: number; keepRatio: boolean; originals: VisualItem[] }
  | { kind: "point"; id: string; index: 0 | 1 | 2; originals: VisualItem[] }
  | { kind: "draw"; tool: DrawTool; from: Point; to: Point };

const DRAW_TOOLS: { id: DrawTool; label: string; Icon: typeof Slash }[] = [
  { id: "arrow", label: "Flèche", Icon: MoveUpRight },
  { id: "line", label: "Trait", Icon: Slash },
  { id: "link", label: "Liaison", Icon: Spline },
];

/** Cadre d'un élément tel qu'il est dessiné à l'image `frame` : images clés et agrandissement compris. */
function shownBox(item: VisualItem, frame: number): Transform {
  const { transform, scale } = keyedFrame(item, frame);
  return { ...transform, width: transform.width * scale, height: transform.height * scale };
}

const boxStyle = (t: Transform): React.CSSProperties => ({
  left: percent(t.x - t.width / 2),
  top: percent(t.y - t.height / 2),
  width: percent(t.width),
  height: percent(t.height),
  transform: t.rotation ? `rotate(${t.rotation}deg)` : undefined,
});

/**
 * Aperçu du clip et manipulation directe des éléments visuels.
 *
 * Le canevas est dessiné par le lecteur ; ce composant ajoute par-dessus une
 * couche de sélection en DOM (cadre, poignées, repères), posée sur l'élément
 * tel qu'il est à la tête de lecture (images clés comprises). On clique pour
 * sélectionner l'élément le plus haut sous le pointeur, on le déplace, on le
 * redimensionne par les coins (Maj pour garder les proportions). Un tracé
 * se prend près de son trait ; ses bouts et son milieu ont leurs poignées.
 * Avec un outil de tracé, appuyer puis relâcher trace un trait.
 */
export function PreviewStage({
  project,
  frame,
  selectedId,
  onSelect,
  onPlace,
  onPatchItem,
  onRestore,
  onDraw,
  tool,
  onToolChange,
  animate,
  onAnimateChange,
  canvasRef,
}: PreviewStageProps) {
  const area = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [safeZone, setSafeZone] = useState(false);
  const vertical = project.aspect === "9:16";
  const size = { width: project.width, height: project.height };

  useEffect(() => {
    setSafeZone(readSafeZonePreference());
  }, []);

  const toggleSafeZone = () => {
    setSafeZone((value) => {
      try {
        window.localStorage.setItem(SAFE_ZONE_KEY, value ? "0" : "1");
      } catch {
        // Stockage indisponible : le choix vaut pour cette page seulement.
      }
      return !value;
    });
  };

  // Le canevas garde les proportions du projet et occupe toute la place disponible.
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    const fit = () => {
      const scaleFor = (marginX: number, marginY: number) =>
        Math.min((node.clientWidth - marginX * 2) / project.width, (node.clientHeight - marginY * 2) / project.height);
      let scale = scaleFor(16, 16);
      // Les outils forment une colonne étroite à gauche : si le canevas passerait dessous, il se retire
      // sur les côtés (des deux, pour rester centré), jamais en hauteur.
      const bar = toolbar.current;
      if (bar && (node.clientWidth - project.width * scale) / 2 < bar.offsetLeft + bar.offsetWidth + 8) {
        scale = Math.min(scale, scaleFor(bar.offsetLeft + bar.offsetWidth + 8, 16));
      }
      setBox({
        width: Math.max(0, Math.floor(project.width * scale)),
        height: Math.max(0, Math.floor(project.height * scale)),
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [project.width, project.height, vertical]);

  const visibleItems: VisualItem[] = [];
  for (const track of project.tracks) {
    if (track.kind !== "visual" || track.hidden) continue;
    for (const item of track.items as VisualItem[]) {
      if (isActive(item, frame)) visibleItems.push(item);
    }
  }
  const selected = visibleItems.find((item) => item.id === selectedId) ?? null;
  const selectedBox = selected ? shownBox(selected, frame) : null;
  const companions = selected ? companionsOf(project, selected.id).filter((item) => isActive(item, frame)) : [];
  const handles = selected ? strokeHandles(selected, frame) : null;

  const toRelative = (event: { clientX: number; clientY: number }): Point => {
    const rect = area.current!.querySelector("canvas")!.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  };

  /** L'élément tenu et les pièces de son acteur, tels qu'ils sont avant le geste (Échap les y remet). */
  const originalsOf = (item: VisualItem) => [item, ...companionsOf(project, item.id)];

  // Repères d'aimantation : le centre du cadre, et celui de la zone d'écriture (là où se posent les illustrations).
  const zone = illustrationZone(project.aspect);
  const snapX = [0.5, zone.left + zone.width / 2];
  const snapY = [0.5, zone.top + zone.height / 2];
  const snapTo = (value: number, targets: number[]) => targets.find((target) => Math.abs(value - target) < SNAP) ?? null;

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const point = toRelative(event);
    if (tool) {
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      setGesture({ kind: "draw", tool, from: point, to: point });
      return;
    }
    const tolerance = (STROKE_REACH_PX * project.width) / Math.max(1, box.width);
    const hit = hitTestAt(visibleItems, point, frame, size, tolerance);
    onSelect(hit?.id ?? null);
    if (!hit) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setGesture({ kind: "move", id: hit.id, start: keyedFrame(hit, frame).transform, pointer: point, originals: originalsOf(hit) });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!gesture) return;
    const point = toRelative(event);
    if (gesture.kind === "draw") {
      setGesture({ ...gesture, to: point });
      return;
    }
    if (gesture.kind === "point") {
      const item = visibleItems.find((entry) => entry.id === gesture.id);
      if (!item || !isEditableStroke(item)) return;
      const patch = moveStrokePoint(item as ShapeItem, frame, gesture.index, point, size);
      if (patch) onPatchItem(gesture.id, patch as Partial<ClipItem>);
      return;
    }
    if (gesture.kind === "move") {
      let x = gesture.start.x + (point[0] - gesture.pointer[0]);
      let y = gesture.start.y + (point[1] - gesture.pointer[1]);
      const guideX = snapTo(x, snapX);
      const guideY = snapTo(y, snapY);
      if (guideX !== null) x = guideX;
      if (guideY !== null) y = guideY;
      setGuides({ x: guideX, y: guideY });
      onPlace(gesture.id, { x, y });
      return;
    }
    // Le cadre dessiné est agrandi de `scale` : la taille de l'élément l'est d'autant moins.
    const start = gesture.start;
    let width = Math.max(0.02, Math.abs(point[0] - start.x) * 2) / gesture.scale;
    let height = Math.max(0.02, Math.abs(point[1] - start.y) * 2) / gesture.scale;
    if (gesture.keepRatio || event.shiftKey) {
      const ratio = start.width / start.height;
      if (width / height > ratio) height = width / ratio;
      else width = height * ratio;
    }
    onPlace(gesture.id, { width, height });
  };

  const endGesture = (event?: React.PointerEvent) => {
    // L'arrivée est lue sur le relâcher lui-même : le dernier déplacement n'est peut-être pas encore rendu.
    if (gesture?.kind === "draw") onDraw(gesture.tool, gesture.from, event && event.type === "pointerup" ? toRelative(event) : gesture.to);
    setGesture(null);
    setGuides({ x: null, y: null });
  };

  const startResize = (event: React.PointerEvent) => {
    if (!selected) return;
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    const keyed = keyedFrame(selected, frame);
    setGesture({
      kind: "resize",
      id: selected.id,
      start: keyed.transform,
      scale: keyed.scale > 1e-6 ? keyed.scale : 1,
      keepRatio: selected.type === "image" || selected.type === "video",
      originals: originalsOf(selected),
    });
  };

  const startPoint = (index: 0 | 1 | 2) => (event: React.PointerEvent) => {
    if (!selected || event.button !== 0) return;
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setGesture({ kind: "point", id: selected.id, index, originals: originalsOf(selected) });
  };

  useEffect(() => {
    if (!gesture && !tool) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (gesture && gesture.kind !== "draw") onRestore(gesture.originals);
      // Échap sans geste en cours : on repasse en sélection.
      if (!gesture) onToolChange(null);
      setGesture(null);
      setGuides({ x: null, y: null });
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [gesture, tool, onRestore, onToolChange]);

  /** Trait en cours de tracé, en parts du canevas, tel qu'il sera créé. */
  const drawPreview = (() => {
    if (gesture?.kind !== "draw") return null;
    const mid = bendPoint(gesture.from, gesture.to, gesture.tool === "link" ? 0.12 : 0, size);
    const points = strokePolyline({ points: [gesture.from, mid, gesture.to].map(([x, y]): Point => [x + 0.5, y + 0.5]), smooth: true }, 1, 1);
    return points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
  })();

  return (
    <div
      ref={area}
      className="@container relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[repeating-conic-gradient(color-mix(in_oklch,var(--foreground)_4%,transparent)_0_25%,transparent_0_50%)] bg-[length:24px_24px]"
      onPointerDown={(event) => {
        if (event.target === area.current) onSelect(null);
      }}
    >
      {/* Colonne d'icônes : elle ne prend que 38 px de large et ne retire jamais de hauteur à l'aperçu. */}
      <div ref={toolbar} className="absolute top-3 left-3 z-10 flex flex-col items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur">
        <ToggleGroup
          type="single"
          size="sm"
          value={tool ?? ""}
          onValueChange={(value) => onToolChange((value || null) as DrawTool | null)}
          aria-label="Tracer sur l’aperçu"
          orientation="vertical"
          className="flex-col gap-0.5"
        >
          {DRAW_TOOLS.map(({ id, label, Icon }) => (
            <ToggleGroupItem key={id} value={id} aria-label={label} title={`${label} : appuyez au départ, relâchez à l’arrivée (Échap pour revenir à la sélection)`} className="size-7 min-w-7 rounded-md p-0 data-[state=on]:bg-primary/15 data-[state=on]:text-foreground">
              <Icon className="h-4 w-4" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span aria-hidden className="my-0.5 h-px w-5 bg-border" />
        <Toggle
          size="sm"
          pressed={animate}
          onPressedChange={onAnimateChange}
          aria-label="Animer"
          title="Animer : déplacer ou redimensionner un élément ailleurs qu’à son début pose une image clé à la tête de lecture"
          className="size-7 min-w-7 rounded-md p-0 data-[state=on]:bg-primary/15 data-[state=on]:text-foreground"
        >
          <Diamond className={cn("h-4 w-4", animate && "fill-current")} />
        </Toggle>
        {/* La zone de sécurité rejoint la colonne : en haut à droite, elle retirait une bande en haut et en bas à l'aperçu. */}
        {vertical && (
          <>
            <span aria-hidden className="my-0.5 h-px w-5 bg-border" />
            <Toggle
              size="sm"
              pressed={safeZone}
              onPressedChange={toggleSafeZone}
              aria-label="Zone de sécurité"
              title="Zone de sécurité : griser ce que cachent les boutons et la légende des plateformes"
              className="size-7 min-w-7 rounded-md p-0 data-[state=on]:bg-primary/15 data-[state=on]:text-foreground"
            >
              <ScanLine className="h-4 w-4" />
            </Toggle>
          </>
        )}
      </div>
      <div className="relative shadow-2xl shadow-black/30" style={{ width: box.width, height: box.height }}>
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-[2px]"
          width={project.width}
          height={project.height}
        />

        {/* Couche d'interaction, au-dessus du canevas. */}
        <div
          data-preview-layer
          className={cn("absolute inset-0 touch-none", tool ? "cursor-crosshair" : gesture?.kind === "move" ? "cursor-grabbing" : "cursor-default")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
          {vertical && safeZone && <SafeZoneOverlay />}
          {guides.x !== null && <div className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-fuchsia-500" style={{ left: percent(guides.x) }} />}
          {guides.y !== null && <div className="pointer-events-none absolute inset-x-0 h-px -translate-y-1/2 bg-fuchsia-500" style={{ top: percent(guides.y) }} />}

          {companions.map((item) => (
            <div key={item.id} data-companion-box className="pointer-events-none absolute border border-dashed border-primary/60" style={boxStyle(shownBox(item, frame))} />
          ))}

          {selected && selectedBox && (
            <div
              data-selection-box
              className={cn("pointer-events-none absolute border-primary", handles ? "border border-dashed" : "border-2")}
              style={boxStyle(selectedBox)}
            >
              {!handles &&
                (["nw", "ne", "sw", "se"] as const).map((corner) => (
                  <span
                    key={corner}
                    data-resize-handle={corner}
                    onPointerDown={startResize}
                    onPointerMove={onPointerMove}
                    onPointerUp={endGesture}
                    className={cn(
                      "pointer-events-auto absolute h-3 w-3 rounded-full border-2 border-primary bg-background",
                      corner === "nw" && "-top-1.5 -left-1.5 cursor-nwse-resize",
                      corner === "ne" && "-top-1.5 -right-1.5 cursor-nesw-resize",
                      corner === "sw" && "-bottom-1.5 -left-1.5 cursor-nesw-resize",
                      corner === "se" && "-right-1.5 -bottom-1.5 cursor-nwse-resize"
                    )}
                  />
                ))}
            </div>
          )}

          {handles &&
            handles.map((point, index) => (
              <span
                key={index}
                data-stroke-handle={index === 1 ? "bend" : index === 0 ? "start" : "end"}
                title={index === 1 ? "Tirer pour courber le trait" : index === 0 ? "Départ du trait" : "Arrivée du trait"}
                onPointerDown={startPoint(index as 0 | 1 | 2)}
                onPointerMove={onPointerMove}
                onPointerUp={endGesture}
                className={cn(
                  "absolute size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-primary bg-background",
                  index === 1 ? "rotate-45 cursor-move rounded-[2px]" : "cursor-grab rounded-full"
                )}
                style={{ left: percent(point[0]), top: percent(point[1]) }}
              />
            ))}

          {drawPreview && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <polyline points={drawPreview} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
