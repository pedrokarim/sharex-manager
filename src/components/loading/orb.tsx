"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { useReducedMotion } from "framer-motion";
import {
  MODE_FRAMES,
  resolvePreset,
  type OrbFrame,
  type OrbState,
} from "thinking-orbs/engine";
import { cn } from "@/lib/utils";

export type { OrbState };

/**
 * Orbe de points animée, pour une attente qui « travaille » : génération,
 * analyse, recherche, ouverture d'un module.
 *
 * La géométrie vient du moteur de `thinking-orbs` (MIT, Jakub Antalik) ; le
 * dessin est fait ici pour que l'encre suive `currentColor` – une classe
 * `text-primary` ou `text-muted-foreground` suffit à l'accorder au thème, y
 * compris aux couleurs réglées dans l'administration.
 *
 * Choisir l'état selon ce qui se passe, pour que chaque attente se reconnaisse :
 * - `working` : traitement générique ;
 * - `searching` : chargement d'une page ou de données, recherche ;
 * - `breathing` : attente calme, dans une ligne ;
 * - `shaping` : ouverture d'un module, mise en forme ;
 * - `composing` : génération d'image, de texte, de vidéo ;
 * - `weaving` : traduction, assemblage ;
 * - `solving` : analyse, lecture (OCR), calcul ;
 * - `listening` : voix, audio ;
 * - `connecting` : comptes connectés, publication, synchronisation.
 */

export type OrbSize = "xs" | "sm" | "md" | "lg";

const ORB_PIXELS: Record<OrbSize, number> = { xs: 16, sm: 20, md: 40, lg: 64 };

/** Les deux dessins réglés par l'auteur : 20 px (ligne de texte), 64 px (avatar). */
function presetFor(pixels: number): 20 | 64 {
  return pixels <= 32 ? 20 : 64;
}

/*
 * Une seule boucle d'animation pour toutes les orbes visibles : elles
 * partagent l'horloge et restent en phase. `requestAnimationFrame` s'arrête
 * de lui-même quand l'onglet est caché.
 */
const painters = new Set<(seconds: number) => void>();
let frameRequest = 0;

function tick() {
  const seconds = performance.now() / 1000;
  for (const paint of painters) paint(seconds);
  frameRequest = painters.size > 0 ? requestAnimationFrame(tick) : 0;
}

function startPainting(paint: (seconds: number) => void) {
  painters.add(paint);
  if (!frameRequest) frameRequest = requestAnimationFrame(tick);
  return () => {
    painters.delete(paint);
  };
}

/*
 * La couleur de l'encre change avec le thème : classe `.dark` sur <html>,
 * feuille de thème réinjectée, préférence du système. Un seul observateur
 * prévient toutes les orbes.
 */
const inkListeners = new Set<() => void>();
let stopWatchingInk: (() => void) | null = null;

function watchInk(listener: () => void) {
  inkListeners.add(listener);
  if (!stopWatchingInk) {
    const notify = () => inkListeners.forEach((fn) => fn());
    const observer = new MutationObserver(notify);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    // Absent de certains environnements (jsdom, vieux navigateurs).
    const scheme =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    scheme?.addEventListener("change", notify);
    stopWatchingInk = () => {
      observer.disconnect();
      scheme?.removeEventListener("change", notify);
    };
  }
  return () => {
    inkListeners.delete(listener);
    if (inkListeners.size === 0) {
      stopWatchingInk?.();
      stopWatchingInk = null;
    }
  };
}

/**
 * Le moteur décrit chaque point par une valeur d'encre (`white`, 0 = le plus
 * proche) : on la traduit en opacité d'une seule couleur, ce qui garde la
 * profondeur en clair comme en sombre.
 */
function drawFrame(ctx: CanvasRenderingContext2D, frame: OrbFrame, ink: string) {
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  for (const line of frame.lines) {
    ctx.globalAlpha = (line.a ?? 1) * (1 - Math.min(1, Math.max(0, line.white)));
    ctx.lineWidth = line.w;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  for (const dot of frame.dots) {
    ctx.globalAlpha = (dot.a ?? 1) * (1 - Math.min(1, Math.max(0, dot.white)));
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export interface OrbProps extends Omit<ComponentProps<"canvas">, "children"> {
  state?: OrbState;
  /** `xs` 16 px, `sm` 20 px, `md` 40 px, `lg` 64 px. */
  size?: OrbSize;
  /** Multiplie la vitesse du dessin. */
  speed?: number;
  /**
   * Nom lu par les lecteurs d'écran. Sans lui l'orbe est décorative : le texte
   * d'attente posé à côté porte l'information.
   */
  label?: string;
}

export function Orb({
  state = "working",
  size = "md",
  speed = 1,
  label,
  className,
  style,
  ...props
}: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const pixels = ORB_PIXELS[size];

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const preset = presetFor(pixels);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(pixels * ratio);
    canvas.height = Math.round(pixels * ratio);
    const scale = (pixels / preset) * ratio;

    const { mode, speed: presetSpeed, opts } = resolvePreset(state, preset);
    const frameAt = MODE_FRAMES[mode];
    let ink = getComputedStyle(canvas).color;

    const paint = (seconds: number) => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, preset, preset);
      drawFrame(ctx, frameAt(preset, seconds * presetSpeed * speed, opts), ink);
    };

    // Mouvement réduit : une image fixe, représentative de l'état.
    const still = () => paint(0.6);
    const now = () => paint(performance.now() / 1000);

    const stopInk = watchInk(() => {
      ink = getComputedStyle(canvas).color;
      if (reducedMotion) still();
      else now();
    });

    if (reducedMotion) {
      still();
      return stopInk;
    }

    now();
    let stopPainting: (() => void) | null = null;
    if (typeof IntersectionObserver === "undefined") {
      stopPainting = startPainting(paint);
      return () => {
        stopPainting?.();
        stopInk();
      };
    }
    // Hors de l'écran, l'orbe ne coûte rien.
    const visibility = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) stopPainting ??= startPainting(paint);
      else {
        stopPainting?.();
        stopPainting = null;
      }
    });
    visibility.observe(canvas);

    return () => {
      visibility.disconnect();
      stopPainting?.();
      stopInk();
    };
  }, [state, pixels, speed, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      data-slot="orb"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("block shrink-0", className)}
      style={{ width: pixels, height: pixels, ...style }}
      {...props}
    />
  );
}
