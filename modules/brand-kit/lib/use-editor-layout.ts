"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Disposition de panneaux : identifiant du panneau → part de la largeur. */
export type PanelLayout = Record<string, number>;

/** `localStorage` peut manquer ou refuser (navigation privée, données bloquées) : on s'en passe alors. */
function readLayout(key: string): PanelLayout | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const entries = Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0);
    return entries.length > 0 ? Object.fromEntries(entries) as PanelLayout : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Tailles des panneaux de l'éditeur, retenues par le navigateur : on
 * retrouve l'éditeur tel qu'on l'a laissé. Seules les tailles choisies à la
 * main sont gardées, pas celles qu'impose une fenêtre redimensionnée.
 */
export function useStoredLayout(key: string) {
  const [layout] = useState<PanelLayout | undefined>(() => (typeof window === "undefined" ? undefined : readLayout(key)));
  const save = useCallback(
    (next: PanelLayout, meta?: { isUserInteraction: boolean }) => {
      if (meta && !meta.isUserInteraction) return;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Sans stockage, les tailles valent pour cette visite seulement.
      }
    },
    [key]
  );
  return { defaultLayout: layout, onLayoutChanged: save };
}

/** Largeur d'un élément, suivie au fil des redimensionnements (0 avant la première mesure). */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Hauteur qui remplit l'écran depuis le haut de l'élément jusqu'en bas de la
 * fenêtre : un espace de travail dont chaque panneau défile pour lui-même,
 * sans que la page défile. Recalculée quand la fenêtre change ou que ce qui
 * précède l'élément change de hauteur (bandeau de conflit, en-tête replié).
 */
export function useFillHeight<T extends HTMLElement>(enabled: boolean, minimum = 520) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!enabled) {
      setHeight(undefined);
      return;
    }
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      // Le haut de l'élément dans sa zone défilante, défilement compris.
      const scroller = element.closest<HTMLElement>(".overflow-y-auto") ?? document.documentElement;
      const top = element.getBoundingClientRect().top + scroller.scrollTop;
      setHeight(Math.max(minimum, Math.floor(window.innerHeight - top)));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    // Le parent grandit quand un bandeau apparaît au-dessus ; les frères changent quand l'en-tête passe à la ligne.
    const parent = element.parentElement;
    if (parent) {
      observer.observe(parent);
      for (const child of Array.from(parent.children)) if (child !== element) observer.observe(child);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [enabled, minimum]);

  return [ref, height] as const;
}
