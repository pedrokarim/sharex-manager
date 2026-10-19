"use client";

/**
 * Aperçu d'un modèle : une image de l'exemple qui le remplit, dessinée par
 * `drawFrame` (la même fonction que l'aperçu et l'export), au format choisi.
 * Rendue une fois par modèle, format et marque pendant la visite.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { drawFrame } from "../engine/render";
import { buildFromTemplate, type TemplateId } from "../engine/templates";
import { projectDuration } from "../engine/timeline";
import type { AspectPreset } from "../engine/types";
import type { BrandTheme } from "../engine/brand";
import { ensureProjectFonts } from "../lib/fonts";
import { SAMPLES } from "./create-options";

const PREVIEW_SIDE = 360;
const rendered = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

async function renderPreview(template: TemplateId, aspect: AspectPreset, theme: BrandTheme | null): Promise<string> {
  const project = buildFromTemplate(template, "Aperçu", aspect, SAMPLES[template], theme);
  await Promise.race([ensureProjectFonts(project), new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => undefined);
  // Un peu après l'ouverture : le premier segment est posé.
  const duration = projectDuration(project);
  const frame = Math.max(0, Math.min(duration - 1, Math.round(duration * 0.3)));
  const full = document.createElement("canvas");
  full.width = project.width;
  full.height = project.height;
  const ctx = full.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canevas indisponible");
  drawFrame(ctx, project, frame, () => null);
  const scale = Math.min(1, PREVIEW_SIDE / Math.max(project.width, project.height));
  const small = document.createElement("canvas");
  small.width = Math.max(16, Math.round(project.width * scale));
  small.height = Math.max(16, Math.round(project.height * scale));
  const smallCtx = small.getContext("2d", { alpha: false });
  if (!smallCtx) throw new Error("Canevas indisponible");
  smallCtx.imageSmoothingQuality = "high";
  smallCtx.drawImage(full, 0, 0, small.width, small.height);
  return small.toDataURL("image/jpeg", 0.8);
}

export function TemplatePreview({
  template,
  aspect,
  theme,
  themeKey,
  className,
}: {
  template: TemplateId;
  aspect: AspectPreset;
  theme: BrandTheme | null;
  /** Identifiant de la marque appliquée, pour garder un aperçu par marque. */
  themeKey: string;
  className?: string;
}) {
  const key = `${template}|${aspect}|${themeKey}`;
  const [src, setSrc] = useState<string | null>(() => rendered.get(key) ?? null);

  useEffect(() => {
    const known = rendered.get(key);
    if (known) {
      setSrc(known);
      return;
    }
    setSrc(null);
    let alive = true;
    // Un rendu à la fois : cinq modèles d'un coup figeraient l'onglet.
    const run = queue.then(() => renderPreview(template, aspect, theme));
    queue = run.catch(() => undefined);
    run
      .then((url) => {
        rendered.set(key, url);
        if (alive) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // `theme` suit `themeKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <span className={cn("flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-[88%] max-w-[92%] rounded-sm object-contain shadow-sm" />
      ) : (
        <span className="h-[88%] animate-pulse rounded-sm bg-muted-foreground/15" style={{ aspectRatio: aspect.replace(":", " / ") }} aria-hidden />
      )}
    </span>
  );
}
