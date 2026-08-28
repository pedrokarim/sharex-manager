"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Download,
  ExternalLink,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Calendar,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";

interface PublicImageItem {
  name: string;
  url: string;
  addedAt?: string;
  album?: {
    name: string;
    slug: string;
  };
}

interface PublicImageViewerProps {
  items: PublicImageItem[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

/** Vue de l'image : le zoom et le déplacement, exprimés en pixels écran. */
interface View {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
/** Zoom appliqué au double-clic, puis retour à 1 au double-clic suivant. */
const DOUBLE_CLICK_SCALE = 2.5;
const IDENTITY: View = { scale: 1, x: 0, y: 0 };

/** La bande de vignettes a besoin d'aperçus, pas des fichiers d'origine. */
const thumbnailUrl = (name: string) =>
  `/api/thumbnails/${encodeURIComponent(name)}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function PublicImageViewer({
  items,
  index,
  onClose,
  onIndexChange,
}: PublicImageViewerProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>(IDENTITY);
  const [isDragging, setIsDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  /** Pointeurs actifs sur la scène : 1 = déplacement, 2 = pincement. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const isOpen = index !== null;

  /**
   * Bornes réelles du déplacement : on les calcule sur la taille rendue de
   * l'image, pas sur des constantes. Sans ça, une image haute reste hors
   * d'atteinte pendant qu'une petite s'échappe du cadre.
   */
  const clampPan = useCallback((x: number, y: number, scale: number) => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return { x, y };

    const maxX = Math.max(0, (image.offsetWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(
      0,
      (image.offsetHeight * scale - stage.clientHeight) / 2,
    );

    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  }, []);

  /**
   * Zoom ancré : le point visé (curseur, milieu des doigts, centre par défaut)
   * reste sous le pointeur au lieu que l'image parte vers son centre.
   */
  const zoomTo = useCallback(
    (target: number, clientX?: number, clientY?: number) => {
      setView((previous) => {
        const scale = clamp(target, MIN_SCALE, MAX_SCALE);
        if (scale === previous.scale) return previous;
        if (scale === MIN_SCALE) return IDENTITY;

        const stage = stageRef.current;
        if (!stage) return { ...previous, scale };

        const rect = stage.getBoundingClientRect();
        const anchorX =
          clientX === undefined ? 0 : clientX - (rect.left + rect.width / 2);
        const anchorY =
          clientY === undefined ? 0 : clientY - (rect.top + rect.height / 2);
        const ratio = scale / previous.scale;

        return {
          scale,
          ...clampPan(
            anchorX - ratio * (anchorX - previous.x),
            anchorY - ratio * (anchorY - previous.y),
            scale,
          ),
        };
      });
    },
    [clampPan],
  );

  // Chaque image s'ouvre à sa taille d'origine, sans hériter du zoom précédent.
  useEffect(() => {
    setView(IDENTITY);
    pointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    setIsDragging(false);
  }, [index]);

  // La page derrière ne doit pas défiler pendant qu'on regarde une image.
  useEffect(() => {
    if (!isOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  /**
   * React pose ses écouteurs `wheel` en passif : `preventDefault` y est ignoré
   * et la molette zoomait *et* faisait défiler la page. D'où l'écouteur natif.
   */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !isOpen) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-event.deltaY * unit * 0.0015);
      setView((previous) => {
        const scale = clamp(previous.scale * factor, MIN_SCALE, MAX_SCALE);
        if (scale === previous.scale) return previous;
        if (scale === MIN_SCALE) return IDENTITY;

        const rect = stage.getBoundingClientRect();
        const anchorX = event.clientX - (rect.left + rect.width / 2);
        const anchorY = event.clientY - (rect.top + rect.height / 2);
        const ratio = scale / previous.scale;

        return {
          scale,
          ...clampPan(
            anchorX - ratio * (anchorX - previous.x),
            anchorY - ratio * (anchorY - previous.y),
            scale,
          ),
        };
      });
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [isOpen, clampPan]);

  // Un redimensionnement peut laisser l'image hors cadre : on la recadre.
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      setView((previous) => ({
        ...previous,
        ...clampPan(previous.x, previous.y, previous.scale),
      }));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, clampPan]);

  useEffect(() => {
    if (index === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowRight" && index < items.length - 1) {
        onIndexChange(index + 1);
      } else if (event.key === "ArrowLeft" && index > 0) {
        onIndexChange(index - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index, items.length, onClose, onIndexChange]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Les flèches de navigation vivent dans la scène : capturer le pointeur
      // ici leur volerait leur `click`, qui serait réémis sur la scène.
      if ((event.target as HTMLElement).closest("button, a")) return;

      const pointers = pointersRef.current;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        pinchRef.current = { distance: distance(a, b), scale: view.scale };
        dragRef.current = null;
        setIsDragging(false);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      if (pointers.size === 1 && view.scale > 1) {
        dragRef.current = {
          x: event.clientX - view.x,
          y: event.clientY - view.y,
        };
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    [view.scale, view.x, view.y],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current;
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const pinch = pinchRef.current;
      if (pinch && pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const spread = distance(a, b);
        if (pinch.distance > 0) {
          zoomTo(
            (pinch.scale * spread) / pinch.distance,
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
          );
        }
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;

      setView((previous) => ({
        ...previous,
        ...clampPan(
          event.clientX - drag.x,
          event.clientY - drag.y,
          previous.scale,
        ),
      }));
    },
    [clampPan, zoomTo],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current;
      pointers.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (pointers.size < 2) pinchRef.current = null;
      if (pointers.size === 0) {
        dragRef.current = null;
        setIsDragging(false);
      }
    },
    [],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Deux clics rapides sur « suivant » ne doivent pas zoomer au passage.
      if ((event.target as HTMLElement).closest("button, a")) return;

      zoomTo(
        view.scale > 1 ? MIN_SCALE : DOUBLE_CLICK_SCALE,
        event.clientX,
        event.clientY,
      );
    },
    [view.scale, zoomTo],
  );

  if (index === null) return null;

  const currentItem = items[index];
  if (!currentItem) return null;

  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = currentItem.url;
    link.download = currentItem.name;
    link.click();
  };

  const formattedDate = currentItem.addedAt
    ? format(parseISO(currentItem.addedAt), "dd MMMM yyyy à HH:mm", {
        locale: fr,
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Screen reader only */}
      <div className="sr-only">
        <h2>{t("gallery.file_viewer.title", { name: currentItem.name })}</h2>
        <p>
          {t("gallery.file_viewer.description", {
            name: currentItem.name,
            date: formattedDate,
            count: `${index + 1}/${items.length}`,
          })}
        </p>
      </div>

      {/* Header overlay */}
      <div
        className="flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-medium truncate">{currentItem.name}</h2>
          <div className="flex items-center gap-4 mt-1 text-white/80 text-sm">
            {formattedDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formattedDate}</span>
              </div>
            )}
            {currentItem.album && (
              <div className="flex items-center gap-1">
                <Folder className="h-3 w-3" />
                <Link
                  href={`/catalog/albums/${currentItem.album.slug}`}
                  className="hover:underline"
                >
                  {currentItem.album.name}
                </Link>
              </div>
            )}
            <span className="text-white/60">
              {index + 1} / {items.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-black/20 rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom out"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={() => zoomTo(view.scale - 0.5)}
              disabled={view.scale <= MIN_SCALE}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reset zoom"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={() => setView(IDENTITY)}
              disabled={view.scale === 1 && view.x === 0 && view.y === 0}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom in"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={() => zoomTo(view.scale + 0.5)}
              disabled={view.scale >= MAX_SCALE}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Actions */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Download image"
            className="h-10 w-10 text-white hover:bg-white/10"
            onClick={handleDownload}
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open in new tab"
            className="h-10 w-10 text-white hover:bg-white/10"
            asChild
          >
            <a href={currentItem.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-5 w-5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close viewer"
            className="h-10 w-10 text-white hover:bg-white/10"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main image area */}
      <div
        ref={stageRef}
        className="relative flex-1 overflow-hidden w-full touch-none"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{
          cursor: view.scale > 1 ? (isDragging ? "grabbing" : "grab") : "default",
        }}
      >
        {/*
          Le cadre transformé occupe toute la scène : son centre est celui de la
          scène, ce dont dépend l'ancrage du zoom. L'image, elle, garde sa taille
          naturelle au maximum — pas d'agrandissement forcé, pas de débordement.
        */}
        <div
          className="absolute inset-0 flex items-center justify-center p-4"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "center center",
            // Pas de transition pendant le geste : sinon l'image traîne
            // derrière le curseur et le déplacement paraît cassé.
            transition:
              isDragging || pinchRef.current
                ? "none"
                : "transform 150ms ease-out",
            willChange: "transform",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- taille rendue
              nécessaire au calcul des bornes ; l'optimisation d'image est
              désactivée globalement (next.config). */}
          <img
            ref={imageRef}
            src={currentItem.url}
            alt={currentItem.name}
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
          />
        </div>

        {/* Navigation buttons */}
        {hasPrevious && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous image"
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/20 hover:bg-black/40 text-white h-12 w-12 focus-visible:ring-2 focus-visible:ring-white"
            onClick={() => onIndexChange(index - 1)}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        )}
        {hasNext && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next image"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/20 hover:bg-black/40 text-white h-12 w-12 focus-visible:ring-2 focus-visible:ring-white"
            onClick={() => onIndexChange(index + 1)}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        )}
      </div>

      {/* Thumbnail strip - centered on active image */}
      <div
        className="flex-none bg-black/40 border-t border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-16 flex items-center justify-center">
          <div
            className="absolute flex items-center gap-2 transition-transform duration-300 ease-out"
            style={{
              // Each thumbnail is 48px + 8px gap = 56px
              // To center: start at 50%, then move left by (index * 56px + 24px for half thumbnail)
              left: "50%",
              transform: `translateX(calc(-${index} * 56px - 24px))`,
            }}
          >
            {items.map((item, i) => (
              <button
                key={item.name}
                onClick={() => onIndexChange(i)}
                className={cn(
                  "flex-none w-12 h-12 rounded-md overflow-hidden border-2 transition-all duration-200",
                  i === index
                    ? "border-white shadow-lg scale-110"
                    : "border-white/20 hover:border-white/60 opacity-60 hover:opacity-100",
                )}
              >
                <Image
                  src={thumbnailUrl(item.name)}
                  alt={item.name}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer hints */}
      <div
        className="flex-none p-2 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white/60 text-sm bg-black/20 px-3 py-1 rounded-full inline-block">
          Utilisez les flèches ← → pour naviguer • Échap pour fermer • Molette ou
          double-clic pour zoomer • Glissez pour déplacer quand zoomé
        </div>
      </div>
    </div>
  );
}
