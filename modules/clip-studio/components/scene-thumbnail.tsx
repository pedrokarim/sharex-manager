"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { drawFrame } from "../engine/render";
import type { SceneKind } from "../lib/scene-catalog";
import { buildScenePreview, scenePreviewFrameAt, WITNESS_REFS, type ScenePreview } from "../lib/scene-preview";
import { subscribeTick } from "../lib/motion-ticker";
import { usePrefersReducedMotion } from "./motion-thumbnail";

const WITNESS_SIZE = { width: 640, height: 400 };
const witnessCache = new Map<string, HTMLCanvasElement>();

/** Aplat d'une transition : une couleur franche, une lettre et un cercle pour lire le mouvement. */
function drawPlate(ctx: CanvasRenderingContext2D, letter: string, background: string, ink: string) {
  const { width: W, height: H } = WITNESS_SIZE;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.arc(W * 0.8, H * 0.22, H * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.font = `800 ${Math.round(H * 0.56)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, W / 2, H * 0.54);
}

/** Paysage témoin de la caméra : ciel, soleil, montagnes et collines, assez riche pour lire un cadrage. */
function drawLandscape(ctx: CanvasRenderingContext2D) {
  const { width: W, height: H } = WITNESS_SIZE;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#38bdf8");
  sky.addColorStop(0.65, "#bae6fd");
  sky.addColorStop(1, "#e0f2fe");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.arc(W * 0.74, H * 0.26, H * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#64748b";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.72);
  ctx.lineTo(W * 0.18, H * 0.38);
  ctx.lineTo(W * 0.32, H * 0.58);
  ctx.lineTo(W * 0.5, H * 0.3);
  ctx.lineTo(W * 0.7, H * 0.62);
  ctx.lineTo(W * 0.86, H * 0.44);
  ctx.lineTo(W, H * 0.66);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
  ctx.fillStyle = "#f8fafc";
  for (const [x, y] of [
    [0.18, 0.38],
    [0.5, 0.3],
  ]) {
    ctx.beginPath();
    ctx.moveTo(W * x, H * y);
    ctx.lineTo(W * (x - 0.05), H * (y + 0.09));
    ctx.lineTo(W * (x + 0.05), H * (y + 0.09));
    ctx.fill();
  }
  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.82);
  ctx.quadraticCurveTo(W * 0.3, H * 0.64, W * 0.58, H * 0.8);
  ctx.quadraticCurveTo(W * 0.8, H * 0.9, W, H * 0.74);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
  ctx.fillStyle = "#14532d";
  for (const x of [0.12, 0.2, 0.66, 0.9]) {
    ctx.beginPath();
    ctx.moveTo(W * x, H * 0.66);
    ctx.lineTo(W * (x - 0.025), H * 0.8);
    ctx.lineTo(W * (x + 0.025), H * 0.8);
    ctx.fill();
  }
}

/** Image témoin d'une référence, dessinée une fois puis gardée (aussi lue par l'aperçu de la galerie). */
export function witness(ref: string): HTMLCanvasElement | null {
  const cached = witnessCache.get(ref);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = WITNESS_SIZE.width;
  canvas.height = WITNESS_SIZE.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (ref === WITNESS_REFS.plateA) drawPlate(ctx, "A", "#4f46e5", "#ffffff");
  else if (ref === WITNESS_REFS.plateB) drawPlate(ctx, "B", "#f59e0b", "#1c1917");
  else drawLandscape(ctx);
  witnessCache.set(ref, canvas);
  return canvas;
}

interface SceneThumbnailProps {
  kind: SceneKind;
  /** Identifiant ; « none » montre la coupe franche ou l'image fixe ; `null` : un identifiant inconnu. */
  id: string | null;
  /** Joue l'aperçu (survol, sélection au clavier) ; sinon, une image figée. */
  playing: boolean;
  resolution?: [number, number];
  className?: string;
}

/**
 * Vignette d'une transition, d'un mouvement de caméra ou d'un effet de plan,
 * dessinée par `drawFrame`. Elle n'est dessinée qu'une fois visible, et ne
 * s'anime que pendant `playing`, sur l'horloge partagée des vignettes.
 */
export function SceneThumbnail({ kind, id, playing, resolution = [192, 120], className }: SceneThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<{ key: string; preview: ScenePreview } | null>(null);
  const [visible, setVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const [width, height] = resolution;
  const drawable = id !== null && !(kind === "shotfx" && id === "none");

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
  }, [visible, drawable]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !drawable || !visible || id === null) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const key = `${kind}|${id}|${width}x${height}`;
    if (previewRef.current?.key !== key) previewRef.current = { key, preview: buildScenePreview(kind, id, width, height) };
    const { preview } = previewRef.current;

    let shown = -1;
    const draw = (frame: number) => {
      if (frame === shown) return;
      shown = frame;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      try {
        drawFrame(ctx, preview.project, frame, (item) => witness(item.source.ref));
      } catch {
        // Un préréglage qui échoue ne casse pas le sélecteur : la vignette reste vide.
      }
    };

    if (!playing || reducedMotion) {
      draw(preview.stillFrame);
      return;
    }
    let startedAt: number | null = null;
    return subscribeTick((now) => {
      startedAt ??= now;
      draw(scenePreviewFrameAt(preview, now - startedAt));
    });
  }, [kind, id, drawable, width, height, playing, reducedMotion, visible]);

  if (!drawable) {
    const Icon = id === null ? CircleHelp : Ban;
    return (
      <span
        aria-hidden
        className={cn("flex aspect-[8/5] w-full items-center justify-center rounded-md bg-muted/60 text-muted-foreground/70", className)}
      >
        <Icon className="h-1/3 max-h-5 w-auto" />
      </span>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-hidden
      className={cn("block aspect-[8/5] h-auto w-full max-w-full rounded-md bg-muted/60", className)}
    />
  );
}
