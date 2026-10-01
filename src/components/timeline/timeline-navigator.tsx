"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { TimelineRail } from "./timeline-rail";
import { TimelinePicker, type TimelinePickerLabels } from "./timeline-picker";
import type { TimelineMonth } from "@/lib/timeline";

/**
 * Attributs à poser sur chaque groupe de mois affiché : c'est par eux que le
 * navigateur de frise sait où en est la galerie et où faire défiler.
 * `start` est le rang, dans la liste complète, du premier fichier du groupe.
 */
export function timelineGroupProps(monthKey: string, start: number, count: number) {
  return {
    "data-timeline-month": monthKey,
    "data-timeline-start": start,
    "data-timeline-count": count,
  };
}

/** Un saut garde sa cible jusqu'à ce que la galerie n'ait plus bougé pendant ce délai… */
const SETTLE_QUIET_MS = 1500;
/** … sans jamais la retenir plus longtemps que ceci. */
const SETTLE_MAX_MS = 8000;

/** L'ancêtre qui défile : dans l'application, ce n'est pas la fenêtre. */
export function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let current = node?.parentElement ?? null; current; current = current.parentElement) {
    const overflow = getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") return current;
  }
  return null;
}

interface TimelineNavigatorProps {
  /** Mois de la galerie entière, dans l'ordre d'affichage. Vide : pas de frise. */
  months: TimelineMonth[];
  /** Conteneur des groupes marqués par `timelineGroupProps`. */
  containerRef: RefObject<HTMLElement | null>;
  /** Élément qui défile ; absent, c'est la fenêtre. */
  getScrollElement?: () => HTMLElement | null;
  /** Hauteur masquée en haut de la zone visible (barre collante, en-tête). */
  topOffset?: number;
  /**
   * Charger la portion de galerie qui contient ce rang, quand elle n'est pas
   * à l'écran. La promesse se résout une fois les données demandées.
   */
  loadAt: (index: number) => Promise<void>;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  /** Mois du séparateur qui a ouvert la fenêtre, s'il y en a un. */
  pickerKey?: string | null;
  locale?: string;
  pickerLabels?: TimelinePickerLabels;
}

interface Group {
  element: HTMLElement;
  start: number;
  count: number;
}

/**
 * Navigation chronologique d'une galerie : le rail de défilement et la
 * fenêtre « Aller à une date ». Suit la position de lecture à partir des
 * groupes de mois présents dans la page, et y fait défiler, en demandant
 * d'abord le chargement quand la date visée n'est pas encore affichée.
 */
export function TimelineNavigator({
  months,
  containerRef,
  getScrollElement,
  topOffset = 0,
  loadAt,
  pickerOpen,
  onPickerOpenChange,
  pickerKey,
  locale,
  pickerLabels,
}: TimelineNavigatorProps) {
  const [position, setPosition] = useState<number | null>(null);
  const jumpGeneration = useRef(0);

  const readGroups = useCallback((): Group[] => {
    const container = containerRef.current;
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>("[data-timeline-start]")).map((element) => ({
      element,
      start: Number(element.dataset.timelineStart),
      count: Number(element.dataset.timelineCount),
    }));
  }, [containerRef]);

  /** Ordonnée, à l'écran, du haut de la zone réellement visible. */
  const viewportTop = useCallback(() => {
    const element = getScrollElement?.() ?? null;
    return (element ? element.getBoundingClientRect().top : 0) + topOffset;
  }, [getScrollElement, topOffset]);

  const measure = useCallback(() => {
    const groups = readGroups();
    if (groups.length === 0) return setPosition(null);
    const top = viewportTop();
    let current = groups[0];
    let rect = current.element.getBoundingClientRect();
    for (const group of groups) {
      const candidate = group.element.getBoundingClientRect();
      if (candidate.top > top + 1) break;
      current = group;
      rect = candidate;
    }
    const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (top - rect.top) / rect.height)) : 0;
    setPosition(current.start + ratio * current.count);
  }, [readGroups, viewportTop]);

  // La position suit le défilement, et tout changement du contenu affiché.
  useEffect(() => {
    const element = getScrollElement?.() ?? null;
    const target: HTMLElement | Window = element ?? window;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    schedule();
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const container = containerRef.current;
    const observer = container ? new MutationObserver(schedule) : null;
    if (container) observer!.observe(container, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [getScrollElement, containerRef, measure]);

  const scrollToIndex = useCallback(
    (index: number): boolean => {
      const group = readGroups().find((entry) => index >= entry.start && index < entry.start + entry.count);
      if (!group) return false;
      const rect = group.element.getBoundingClientRect();
      const ratio = group.count > 0 ? (index - group.start) / group.count : 0;
      // Au début d'un mois, on laisse respirer son titre sous le bord.
      const delta = rect.top + ratio * rect.height - viewportTop() - (ratio === 0 ? 8 : 0);
      const element = getScrollElement?.() ?? null;
      if (element) element.scrollTop += delta;
      else window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
      return true;
    },
    [readGroups, viewportTop, getScrollElement]
  );

  /**
   * Tient la cible après le saut, tant que la galerie bouge encore : la suite
   * se charge, et tant qu'elle n'est pas là la page peut être trop courte pour
   * amener la date visée en haut. Le premier geste de l'utilisateur y met fin.
   */
  const settle = useCallback(
    async (index: number, generation: number) => {
      let interrupted = false;
      const interrupt = () => {
        interrupted = true;
      };
      const gestures = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
      for (const gesture of gestures) window.addEventListener(gesture, interrupt, { passive: true, once: true });

      const started = performance.now();
      let lastChange = started;
      const container = containerRef.current;
      const observer = container
        ? new MutationObserver(() => {
            lastChange = performance.now();
          })
        : null;
      if (container) observer!.observe(container, { childList: true, subtree: true });

      while (!interrupted && jumpGeneration.current === generation) {
        const now = performance.now();
        if (now - lastChange > SETTLE_QUIET_MS || now - started > SETTLE_MAX_MS) break;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (!interrupted && jumpGeneration.current === generation) scrollToIndex(index);
      }

      observer?.disconnect();
      for (const gesture of gestures) window.removeEventListener(gesture, interrupt);
    },
    [scrollToIndex, containerRef]
  );

  const jump = useCallback(
    async (index: number) => {
      const generation = ++jumpGeneration.current;
      if (!scrollToIndex(index)) {
        await loadAt(index);
        // Le temps que la nouvelle portion soit rendue ; un saut plus récent a priorité.
        let found = false;
        for (let attempt = 0; attempt < 30 && !found; attempt++) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (jumpGeneration.current !== generation) return;
          found = scrollToIndex(index);
        }
      }
      void settle(index, generation);
    },
    [scrollToIndex, loadAt, settle]
  );

  const startIndexOf = useMemo(() => {
    const starts = new Map<string, number>();
    let index = 0;
    for (const month of months) {
      starts.set(month.key, index);
      index += month.count;
    }
    return starts;
  }, [months]);

  const currentKey = useMemo(() => {
    if (pickerKey) return pickerKey;
    if (position === null) return null;
    let index = 0;
    for (const month of months) {
      index += month.count;
      if (position < index) return month.key;
    }
    return months[months.length - 1]?.key ?? null;
  }, [pickerKey, position, months]);

  if (months.length === 0) return null;

  return (
    <>
      <TimelineRail
        months={months}
        position={position}
        onJump={jump}
        getScrollElement={getScrollElement}
        topOffset={topOffset}
        locale={locale}
      />
      <TimelinePicker
        open={pickerOpen}
        onOpenChange={onPickerOpenChange}
        months={months}
        currentKey={currentKey}
        onPick={(key) => {
          const index = startIndexOf.get(key);
          if (index !== undefined) void jump(index);
        }}
        locale={locale}
        labels={pickerLabels}
      />
    </>
  );
}
