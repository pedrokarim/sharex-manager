"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isActive } from "../engine/timeline";
import type { ClipProject, Transform, VisualItem } from "../engine/types";

interface PreviewStageProps {
  project: ClipProject;
  frame: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onTransform: (id: string, transform: Transform) => void;
  /** Reçoit le canevas une fois monté, pour que le lecteur y dessine. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/** Distance, en fraction du canevas, sous laquelle on s'aimante au centre. */
const SNAP = 0.012;

type Gesture =
  | { kind: "move"; id: string; start: Transform; pointer: { x: number; y: number } }
  | { kind: "resize"; id: string; start: Transform; keepRatio: boolean };

/**
 * Aperçu du clip et manipulation directe des éléments visuels.
 *
 * Le canevas est dessiné par le lecteur ; ce composant ajoute par-dessus une
 * couche de sélection en DOM (cadre, poignées, repères). On clique pour
 * sélectionner l'élément le plus haut sous le pointeur, on le déplace, on le
 * redimensionne par les coins (Maj pour garder les proportions).
 */
export function PreviewStage({
  project,
  frame,
  selectedId,
  onSelect,
  onTransform,
  canvasRef,
}: PreviewStageProps) {
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  // Le canevas garde les proportions du projet et occupe toute la place disponible.
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    const fit = () => {
      const available = { width: node.clientWidth - 32, height: node.clientHeight - 32 };
      const scale = Math.min(available.width / project.width, available.height / project.height);
      setBox({
        width: Math.max(0, Math.floor(project.width * scale)),
        height: Math.max(0, Math.floor(project.height * scale)),
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [project.width, project.height]);

  const visibleItems: VisualItem[] = [];
  for (const track of project.tracks) {
    if (track.kind !== "visual" || track.hidden) continue;
    for (const item of track.items as VisualItem[]) {
      if (isActive(item, frame)) visibleItems.push(item);
    }
  }
  const selected = visibleItems.find((item) => item.id === selectedId) ?? null;

  const toRelative = (event: { clientX: number; clientY: number }) => {
    const rect = area.current!.querySelector("canvas")!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  /** Élément le plus haut sous le pointeur : la première piste est au-dessus. */
  const hitTest = (point: { x: number; y: number }) =>
    visibleItems.find((item) => {
      const t = item.transform;
      return (
        Math.abs(point.x - t.x) <= t.width / 2 && Math.abs(point.y - t.y) <= t.height / 2
      );
    }) ?? null;

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const point = toRelative(event);
    const hit = hitTest(point);
    onSelect(hit?.id ?? null);
    if (!hit) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setGesture({ kind: "move", id: hit.id, start: hit.transform, pointer: point });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!gesture) return;
    const point = toRelative(event);
    if (gesture.kind === "move") {
      let x = gesture.start.x + (point.x - gesture.pointer.x);
      let y = gesture.start.y + (point.y - gesture.pointer.y);
      const snapX = Math.abs(x - 0.5) < SNAP;
      const snapY = Math.abs(y - 0.5) < SNAP;
      if (snapX) x = 0.5;
      if (snapY) y = 0.5;
      setGuides({ x: snapX, y: snapY });
      onTransform(gesture.id, { ...gesture.start, x, y });
    } else {
      const start = gesture.start;
      let width = Math.max(0.02, Math.abs(point.x - start.x) * 2);
      let height = Math.max(0.02, Math.abs(point.y - start.y) * 2);
      if (gesture.keepRatio || event.shiftKey) {
        const ratio = start.width / start.height;
        if (width / height > ratio) height = width / ratio;
        else width = height * ratio;
      }
      onTransform(gesture.id, { ...start, width, height });
    }
  };

  const endGesture = () => {
    setGesture(null);
    setGuides({ x: false, y: false });
  };

  const startResize = (event: React.PointerEvent) => {
    if (!selected) return;
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setGesture({
      kind: "resize",
      id: selected.id,
      start: selected.transform,
      keepRatio: selected.type === "image" || selected.type === "video",
    });
  };

  useEffect(() => {
    if (!gesture) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onTransform(gesture.id, gesture.start);
        endGesture();
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [gesture, onTransform]);

  return (
    <div
      ref={area}
      className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[repeating-conic-gradient(color-mix(in_oklch,var(--foreground)_4%,transparent)_0_25%,transparent_0_50%)] bg-[length:24px_24px]"
      onPointerDown={(event) => {
        if (event.target === area.current) onSelect(null);
      }}
    >
      <div className="relative shadow-2xl shadow-black/30" style={{ width: box.width, height: box.height }}>
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-[2px]"
          width={project.width}
          height={project.height}
        />

        {/* Couche d'interaction, au-dessus du canevas. */}
        <div
          className={cn("absolute inset-0", gesture?.kind === "move" ? "cursor-grabbing" : "cursor-default")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
          {guides.x && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-fuchsia-500" />}
          {guides.y && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-fuchsia-500" />}

          {selected && (
            <div
              className="pointer-events-none absolute border-2 border-primary"
              style={{
                left: `${(selected.transform.x - selected.transform.width / 2) * 100}%`,
                top: `${(selected.transform.y - selected.transform.height / 2) * 100}%`,
                width: `${selected.transform.width * 100}%`,
                height: `${selected.transform.height * 100}%`,
                transform: selected.transform.rotation ? `rotate(${selected.transform.rotation}deg)` : undefined,
              }}
            >
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <span
                  key={corner}
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
        </div>
      </div>
    </div>
  );
}
