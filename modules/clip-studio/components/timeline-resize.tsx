"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "clip-studio:timeline-height";
const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 150;
/**
 * Place gardée au-dessus de la chronologie quand elle grandit : l'en-tête de
 * l'éditeur (120 px environ) et 240 px d'aperçu au moins, sur ordinateur
 * comme sur téléphone.
 */
const STAGE_RESERVE = 360;

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
  const drag = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  /** Fin du dernier appui resté sur place : un second dans les 400 ms est un double-clic. */
  const lastTap = useRef(0);
  const [active, setActive] = useState(false);

  const release = () => {
    const ended = drag.current;
    drag.current = null;
    setActive(false);
    if (!ended || ended.moved) return;
    // Le double-clic se lit ici : la capture du pointeur ne laisse pas toujours passer `dblclick`.
    const now = Date.now();
    if (now - lastTap.current < 400) {
      lastTap.current = 0;
      onResize(DEFAULT_HEIGHT);
    } else lastTap.current = now;
  };

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
        drag.current = { y: event.clientY, height, moved: false };
        setActive(true);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        if (Math.abs(event.clientY - drag.current.y) < 3 && !drag.current.moved) return;
        drag.current.moved = true;
        onResize(drag.current.height + drag.current.y - event.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
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
