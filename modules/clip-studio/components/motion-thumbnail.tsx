"use client";

import { useEffect, useRef, useState } from "react";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { drawFrame } from "../engine/render";
import type { MotionParamValues, MotionPreset } from "../engine/motion/types";
import type { PickerItemType, PickerPhase } from "../lib/motion-catalog";
import { buildPreviewScene, previewFrameAt, type PreviewScene } from "../lib/motion-preview";
import { subscribeTick } from "../lib/motion-ticker";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Vrai si le système demande moins d'animations ; suit le réglage en direct. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(REDUCED_MOTION);
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

const rgbCache = new Map<string, string>();

/**
 * Couleur CSS calculée (souvent en `oklch()` ou `lab()` avec le thème)
 * ramenée en `rgb()` : les pistes de couleur du moteur ne lisent que
 * l'hexadécimal et `rgb()`. Un pixel peint suffit à la convertir.
 */
export function toRgb(color: string): string {
  const fallback = "rgb(128, 128, 128)";
  if (!color) return fallback;
  const cached = rgbCache.get(color);
  if (cached) return cached;
  let result = fallback;
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      result = `rgb(${r}, ${g}, ${b})`;
    }
  } catch {
    // Canevas indisponible : le gris neutre reste lisible dans les deux thèmes.
  }
  rgbCache.set(color, result);
  return result;
}

interface MotionThumbnailProps {
  preset: MotionPreset | undefined;
  phase: PickerPhase;
  itemType: PickerItemType;
  /** Joue l'animation (survol, sélection au clavier) ; sinon, image figée au milieu de l'animation. */
  playing: boolean;
  /** Taille du canevas en pixels réels ; l'affichage suit la largeur de son conteneur. */
  resolution?: [number, number];
  /** Réglages du préréglage ; absents : ses défauts. */
  params?: MotionParamValues;
  /** Texte du témoin (un nombre pour un compteur) ; absent : le mot habituel. */
  text?: string;
  className?: string;
}

/**
 * Vignette d'un préréglage, dessinée par `drawFrame` sur un élément témoin.
 * L'image figée n'est dessinée qu'une fois la vignette visible ; l'animation
 * ne tourne que pendant `playing`, sur l'horloge partagée.
 */
export function MotionThumbnail({ preset, phase, itemType, playing, resolution = [192, 120], params, text, className }: MotionThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{ key: string; scene: PreviewScene } | null>(null);
  const [visible, setVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const [width, height] = resolution;
  const paramsKey = params ? JSON.stringify(params) : "";

  // Dessin à la demande : la vignette n'existe qu'une fois à l'écran.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [visible, preset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !preset || !visible) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // La couleur du témoin est celle du texte de la vignette : elle suit le thème clair ou sombre.
    const color = toRgb(getComputedStyle(canvas).color);
    const key = `${preset.id}|${phase}|${itemType}|${width}x${height}|${color}|${paramsKey}|${text ?? ""}`;
    if (sceneRef.current?.key !== key) {
      sceneRef.current = { key, scene: buildPreviewScene(preset, phase, { width, height, color, itemType, params, text }) };
    }
    const { scene } = sceneRef.current;

    let shown = -1;
    const draw = (frame: number) => {
      if (frame === shown) return;
      shown = frame;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      try {
        drawFrame(ctx, scene.project, frame, () => null);
      } catch {
        // Un préréglage qui échoue ne doit pas casser tout le sélecteur : la vignette reste vide.
      }
    };

    if (!playing || reducedMotion) {
      draw(scene.stillFrame);
      return;
    }
    let startedAt: number | null = null;
    return subscribeTick((now) => {
      startedAt ??= now;
      draw(previewFrameAt(scene, now - startedAt));
    });
    // `params` est lu par sa clé : un objet recréé à chaque rendu ne relance pas le dessin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, phase, itemType, width, height, playing, reducedMotion, visible, paramsKey, text]);

  if (!preset) {
    return (
      <span
        aria-hidden
        className={cn("flex aspect-[8/5] w-full items-center justify-center rounded-md bg-muted/60 text-muted-foreground/70", className)}
      >
        <Ban className="h-1/3 max-h-5 w-auto" />
      </span>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-hidden
      className={cn("block aspect-[8/5] h-auto w-full max-w-full rounded-md bg-muted/60 text-foreground", className)}
    />
  );
}
