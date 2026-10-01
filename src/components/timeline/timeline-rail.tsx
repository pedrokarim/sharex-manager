"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  buildRail,
  formatMonthKey,
  indexAtY,
  yAtIndex,
  yearLabels,
  type TimelineMonth,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";

/** Largeur du rail déployé. */
const RAIL_WIDTH = 56;
/**
 * Largeur de la zone sensible au repos : une lisière au bord de la galerie,
 * assez étroite pour ne pas voler les clics des vignettes voisines.
 */
const EDGE_WIDTH = 18;
/** Marge en haut et en bas du rail, dans la zone qui défile. */
const RAIL_PADDING = 12;
/** Le rail s'efface ce délai après le dernier défilement. */
const HIDE_DELAY_MS = 1400;
/** Pendant un glisser, la galerie ne suit qu'après cette courte pause. */
const DRAG_JUMP_DELAY_MS = 140;

/** La capture échoue si le pointeur n'est plus actif : le glisser marche quand même. */
function capturePointer(element: Element, pointerId: number, capture: boolean) {
  try {
    if (capture) element.setPointerCapture(pointerId);
    else element.releasePointerCapture(pointerId);
  } catch {
    // Sans capture, le glisser s'arrête simplement en sortant du rail.
  }
}

interface TimelineRailProps {
  /** Mois de la galerie, dans l'ordre d'affichage, avec leur nombre de fichiers. */
  months: TimelineMonth[];
  /**
   * Rang, dans la liste complète, du fichier en haut de l'écran (peut être
   * fractionnaire). `null` tant qu'il n'est pas connu.
   */
  position: number | null;
  /** Aller au fichier de ce rang ; `monthKey` est son mois (« 2026-09 »). */
  onJump: (index: number, monthKey: string) => void;
  /** Élément qui défile ; absent, c'est la fenêtre. */
  getScrollElement?: () => HTMLElement | null;
  /** Hauteur masquée en haut de la zone visible (barre collante, en-tête). */
  topOffset?: number;
  /** Langue des noms de mois. */
  locale?: string;
}

interface Box {
  top: number;
  right: number;
  height: number;
}

/**
 * Rail de défilement chronologique, à la manière de Google Photos.
 *
 * Invisible au repos. Il apparaît quand on fait défiler la galerie ou qu'on
 * approche le pointeur du bord droit : années étagées selon la quantité de
 * contenu, un point par mois, et une bulle qui nomme le mois visé. Un clic ou
 * un glisser y amène la galerie.
 */
export function TimelineRail({ months, position, onJump, getScrollElement, topOffset = 0, locale = "fr" }: TimelineRailProps) {
  const [box, setBox] = useState<Box | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Hauteur visée par le pointeur sur le rail, en pixels. */
  const [pointerY, setPointerY] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Le rail est fixé à l'écran, calé sur la boîte de la zone qui défile.
  useEffect(() => {
    const element = getScrollElement?.() ?? null;
    const measure = () => {
      // Le rail se pose à gauche de la barre de défilement native, qui reste utilisable.
      if (element) {
        const rect = element.getBoundingClientRect();
        const scrollbar = element.offsetWidth - element.clientWidth;
        setBox({
          top: rect.top + topOffset,
          right: window.innerWidth - rect.right + scrollbar,
          height: rect.height - topOffset,
        });
      } else {
        setBox({
          top: topOffset,
          right: window.innerWidth - document.documentElement.clientWidth,
          height: window.innerHeight - topOffset,
        });
      }
    };
    measure();
    const observer = element ? new ResizeObserver(measure) : null;
    if (element) observer!.observe(element);
    window.addEventListener("resize", measure);

    const target: HTMLElement | Window = element ?? window;
    const onScroll = () => {
      setScrolling(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setScrolling(false), HIDE_DELAY_MS);
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      target.removeEventListener("scroll", onScroll);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [getScrollElement, topOffset]);

  const height = Math.max(0, (box?.height ?? 0) - RAIL_PADDING * 2);
  const layout = useMemo(() => buildRail(months, height), [months, height]);
  const years = useMemo(() => yearLabels(layout), [layout]);
  // Un point par mois, tant qu'ils ne se touchent pas.
  const dots = useMemo(() => {
    const kept: number[] = [];
    let last = -Infinity;
    for (const segment of layout.segments) {
      if (segment.top - last >= 9) {
        kept.push(segment.top);
        last = segment.top;
      }
    }
    return kept;
  }, [layout]);

  const yFromEvent = useCallback((clientY: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(Math.max(clientY - rect.top, 0), rect.height);
  }, []);

  const jumpTo = useCallback(
    (y: number) => {
      const target = indexAtY(layout, y);
      if (target) onJump(target.index, target.month.key);
    },
    [layout, onJump]
  );

  useEffect(
    () => () => {
      if (jumpTimer.current) clearTimeout(jumpTimer.current);
    },
    []
  );

  if (!box || layout.segments.length < 2 || height < 120) return null;

  const engaged = hovering || dragging;
  const visible = scrolling || engaged;
  const currentY = position === null ? null : yAtIndex(layout, position);
  // La bulle suit le pointeur quand il vise le rail, sinon la position courante.
  const bubbleY = engaged && pointerY !== null ? pointerY : currentY;
  const bubbleMonth = bubbleY === null ? null : indexAtY(layout, bubbleY)?.month ?? null;

  const stepMonth = (key: string) => {
    if (position === null) return;
    const current = indexAtY(layout, yAtIndex(layout, position))?.month;
    const at = layout.segments.findIndex((segment) => segment.key === current?.key);
    const next =
      key === "ArrowDown" || key === "PageDown"
        ? layout.segments[at + 1]
        : key === "ArrowUp" || key === "PageUp"
          ? layout.segments[at - 1]
          : key === "Home"
            ? layout.segments[0]
            : key === "End"
              ? layout.segments[layout.segments.length - 1]
              : null;
    if (next) onJump(next.startIndex, next.key);
    return Boolean(next);
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Frise chronologique"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, layout.total - 1)}
      aria-valuenow={Math.round(position ?? 0)}
      aria-valuetext={bubbleMonth ? formatMonthKey(bubbleMonth.key, "long", locale) : undefined}
      className={cn(
        "fixed z-30 cursor-pointer touch-none select-none outline-none",
        dragging && "cursor-grabbing"
      )}
      style={{ top: box.top, right: box.right, height: box.height, width: engaged ? RAIL_WIDTH : EDGE_WIDTH }}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => {
        setHovering(false);
        if (!dragging) setPointerY(null);
      }}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      onPointerMove={(event) => {
        const y = yFromEvent(event.clientY);
        setPointerY(y);
        if (!dragging) return;
        if (jumpTimer.current) clearTimeout(jumpTimer.current);
        jumpTimer.current = setTimeout(() => jumpTo(y), DRAG_JUMP_DELAY_MS);
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        capturePointer(event.currentTarget, event.pointerId, true);
        setDragging(true);
        const y = yFromEvent(event.clientY);
        setPointerY(y);
        jumpTo(y);
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        capturePointer(event.currentTarget, event.pointerId, false);
        setDragging(false);
        if (jumpTimer.current) clearTimeout(jumpTimer.current);
        jumpTo(yFromEvent(event.clientY));
      }}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(event) => {
        if (stepMonth(event.key)) event.preventDefault();
      }}
    >
      {/* Le dessin déborde de la lisière sans capter les clics. */}
      <motion.div
        ref={railRef}
        aria-hidden
        initial={false}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: visible ? 0.12 : 0.35 }}
        className="pointer-events-none absolute right-0"
        style={{ top: RAIL_PADDING, height, width: RAIL_WIDTH }}
      >
        {/* Voile derrière le rail, pour rester lisible sur les images. */}
        <div className="absolute -inset-y-3 right-0 w-full bg-gradient-to-l from-background/95 via-background/70 to-transparent" />

        {dots.map((top) => (
          <span
            key={top}
            className="absolute right-3 size-1 -translate-y-1/2 rounded-full bg-foreground/55 ring-1 ring-background/80"
            style={{ top }}
          />
        ))}

        {years.map((label) => (
          <span
            key={label.year}
            className="absolute right-6 -translate-y-1/2 rounded bg-background/90 px-1 text-[11px] font-medium leading-4 tabular-nums text-foreground/80 shadow-sm"
            style={{ top: label.labelY }}
          >
            {label.year}
          </span>
        ))}

        {/* Position courante de la galerie. */}
        {currentY !== null && (
          <span className="absolute right-0 h-0.5 w-5 -translate-y-1/2 rounded-full bg-primary" style={{ top: currentY }} />
        )}
      </motion.div>

      <AnimatePresence>
        {visible && bubbleMonth && bubbleY !== null && (
          <motion.div
            key="bubble"
            aria-hidden
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md"
            style={{ top: RAIL_PADDING + bubbleY, right: RAIL_WIDTH + 6 }}
          >
            {formatMonthKey(bubbleMonth.key, "short", locale)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
