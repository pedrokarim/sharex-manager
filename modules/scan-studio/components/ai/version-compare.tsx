"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "../../lib/client";
import { boundsOf, type AiPageVersion, type ScanRegion } from "../../lib/types";
import { ProviderName } from "./ai-controls";

/** Dessine la page composée par l'atelier sur un canevas, à la largeur demandée. */
export type ManualRenderer = (canvas: HTMLCanvasElement, width: number) => void;

/** Largeur de travail des deux volets : assez pour juger, sans redessiner la page à sa taille réelle. */
const COMPARE_WIDTH = 900;
/** Écart de luminance au-delà duquel un pixel est tenu pour redessiné. */
const DIFFERENCE_THRESHOLD = 46;

interface VersionCompareProps {
  version: AiPageVersion;
  providerLabel: string;
  page: { width: number; height: number };
  image: HTMLImageElement | null;
  regions: ScanRegion[];
  renderManual: ManualRenderer;
  onClose: () => void;
}

/**
 * Une version de la page traduite par IA, à côté de la page composée par
 * l'atelier. La vue des écarts colore ce que le moteur a redessiné hors des
 * zones de texte : un moteur d'image retouche toujours un peu le dessin, et il
 * faut le voir avant de s'en servir (§ 6.8 du dossier).
 */
export function VersionCompare({ version, providerLabel, page, image, regions, renderManual, onClose }: VersionCompareProps) {
  const manualRef = useRef<HTMLCanvasElement>(null);
  const aiRef = useRef<HTMLCanvasElement>(null);
  const [showDifferences, setShowDifferences] = useState(false);
  const [rendered, setRendered] = useState<HTMLImageElement | null>(null);
  const [share, setShare] = useState<number | null>(null);

  // La version rendue par le moteur : servie avec la session, comme les autres images du module.
  useEffect(() => {
    if (!version.url) return;
    let cancelled = false;
    const element = new Image();
    element.src = version.url;
    element
      .decode()
      .then(() => {
        if (!cancelled) setRendered(element);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [version.url]);

  useEffect(() => {
    const manual = manualRef.current;
    if (manual) renderManual(manual, COMPARE_WIDTH);
  }, [renderManual]);

  useEffect(() => {
    const canvas = aiRef.current;
    if (!canvas || !rendered) return;
    const width = COMPARE_WIDTH;
    const height = Math.max(1, Math.round((width * page.height) / page.width));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    // La version est ramenée aux proportions de la page : c'est ainsi qu'elle se compare.
    ctx.drawImage(rendered, 0, 0, width, height);
    if (!showDifferences || !image) {
      setShare(null);
      return;
    }

    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const original = scratch.getContext("2d", { willReadFrequently: true });
    if (!original) return;
    original.drawImage(image, 0, 0, width, height);
    const before = original.getImageData(0, 0, width, height).data;
    const after = ctx.getImageData(0, 0, width, height);
    const scale = width / page.width;
    // Les zones de texte sont censées changer : elles ne comptent pas parmi les écarts.
    const zones = regions.map((region) => {
      const bounds = boundsOf(region.outline);
      const margin = Math.max(6, Math.max(0, region.mask.grow)) + 6;
      return { left: bounds.x - margin, top: bounds.y - margin, right: bounds.x + bounds.width + margin, bottom: bounds.y + bounds.height + margin };
    });
    let changed = 0;
    let counted = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const point = { x: x / scale, y: y / scale };
        const inZone = zones.some((zone) => point.x >= zone.left && point.x <= zone.right && point.y >= zone.top && point.y <= zone.bottom);
        if (inZone) continue;
        counted++;
        const offset = (y * width + x) * 4;
        const luminance = (data: Uint8ClampedArray) => 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
        if (Math.abs(luminance(before) - luminance(after.data)) < DIFFERENCE_THRESHOLD) continue;
        changed++;
        after.data[offset] = 255;
        after.data[offset + 1] = Math.round(after.data[offset + 1] * 0.25);
        after.data[offset + 2] = 160;
      }
    }
    ctx.putImageData(after, 0, 0);
    setShare(counted > 0 ? changed / counted : 0);
  }, [rendered, showDifferences, image, page.width, page.height, regions]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92svh] w-[min(96vw,1500px)] max-w-none flex-col gap-4 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Page de l’atelier et version traduite par IA</DialogTitle>
          <DialogDescription>
            Version rendue par <ProviderName provider={version.trace.provider} label={providerLabel} /> ({version.trace.model}) le {formatDate(version.trace.at)}, à
            partir de la page entière. Elle ne remplace rien : vos zones et votre export restent ceux de l’atelier.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showDifferences} onCheckedChange={setShowDifferences} disabled={!image || !rendered} />
          Colorer ce que le moteur a redessiné hors des zones de texte
          {share !== null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              ({(share * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % de la page, à comparer à l’original)
            </span>
          )}
        </label>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto">
          <figure className="flex flex-col gap-2">
            <figcaption className="text-xs font-medium text-muted-foreground">Composée dans l’atelier</figcaption>
            <canvas ref={manualRef} className="h-auto w-full rounded-md bg-muted" aria-label="Page composée dans l’atelier" />
          </figure>
          <figure className="flex flex-col gap-2">
            <figcaption className="text-xs font-medium text-muted-foreground">
              Traduite par IA · {version.width} × {version.height} px
            </figcaption>
            <canvas ref={aiRef} className="h-auto w-full rounded-md bg-muted" aria-label="Page traduite par IA" />
          </figure>
        </div>
      </DialogContent>
    </Dialog>
  );
}
