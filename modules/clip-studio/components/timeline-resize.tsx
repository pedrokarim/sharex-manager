"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "clip-studio:timeline-height";
const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 150;
/** Hauteur gardée à l'aperçu (en-tête de l'éditeur compris) quand la chronologie grandit. */
const STAGE_RESERVE = 260;

function clampHeight(height: number): number {
  const max = typeof window === "undefined" ? 640 : Math.max(MIN_HEIGHT, window.innerHeight - STAGE_RESERVE);
  return Math.round(Math.min(Math.max(height, MIN_HEIGHT), max));
}

/** Hauteur de la chronologie, réglée à la poignée et retenue d'une visite à l'autre sur ce navigateur. */
export function useTimelineHeight() {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(saved) && saved > 0) setHeight(clampHeight(saved));
    } catch {
      // Stockage indisponible : la hauteur par défaut vaut pour cette page.
    }
    // Une fenêtre rapetissée ne laisse jamais la chronologie manger l'aperçu.
    const onResize = () => setHeight((value) => clampHeight(value));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const commit = useCallback((next: number) => {
    const value = clampHeight(next);
    setHeight(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Stockage indisponible : le réglage vaut pour cette page.
    }
  }, []);

  return [height, commit] as const;
}

/**
 * Poignée posée sur le bord haut de la chronologie : on la tire pour agrandir l'aperçu ou la
 * chronologie ; flèches haut et bas au clavier, double-clic pour revenir à la hauteur par défaut.
 */
export function TimelineResizeHandle({ height, onResize }: { height: number; onResize: (height: number) => void }) {
  const drag = useRef<{ y: number; height: number } | null>(null);
  const [active, setActive] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Hauteur de la chronologie"
      aria-valuenow={height}
      aria-valuemin={MIN_HEIGHT}
      tabIndex={0}
      title="Tirer pour changer la taille de l’aperçu et de la chronologie (double-clic : taille par défaut)"
      className="group absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-row-resize touch-none items-center justify-center outline-none"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { y: event.clientY, height };
        setActive(true);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        onResize(drag.current.height + drag.current.y - event.clientY);
      }}
      onPointerUp={() => {
        drag.current = null;
        setActive(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setActive(false);
      }}
      onDoubleClick={() => onResize(DEFAULT_HEIGHT)}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") onResize(height + 24);
        else if (event.key === "ArrowDown") onResize(height - 24);
        else return;
        event.preventDefault();
      }}
    >
      <span
        aria-hidden
        className={cn(
          "h-1 w-12 rounded-full bg-foreground/20 transition-colors group-hover:bg-foreground/50 group-focus-visible:bg-primary",
          active && "bg-primary"
        )}
      />
    </div>
  );
}
