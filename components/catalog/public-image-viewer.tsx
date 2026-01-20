"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
// Removed Dialog imports - using simple backdrop instead
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

export function PublicImageViewer({
  items,
  index,
  onClose,
  onIndexChange,
}: PublicImageViewerProps) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLDivElement>(null);

  const currentItem = index !== null ? items[index] : null;
  const hasPrevious = index !== null && index > 0;
  const hasNext = index !== null && index < items.length - 1;

  // Reset zoom and pan when changing image
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  // Keyboard navigation
  useEffect(() => {
    if (index === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" && hasNext) {
        onIndexChange(index + 1);
      } else if (e.key === "ArrowLeft" && hasPrevious) {
        onIndexChange(index - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index, hasPrevious, hasNext, onClose, onIndexChange]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(4, prev + delta)));
  }, []);

  const handleZoomIn = () => {
    setScale(prev => Math.min(4, prev + 0.5));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.5));
  };

  const handleZoomReset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  // Drag/pan functionality
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return; // Only allow panning when zoomed

    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    });
  }, [scale, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const newPan = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };

    // Limit pan bounds to prevent image from going too far off screen
    const maxPanX = (scale - 1) * 200; // Adjust based on your needs
    const maxPanY = (scale - 1) * 150;

    setPan({
      x: Math.max(-maxPanX, Math.min(maxPanX, newPan.x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, newPan.y)),
    });
  }, [isDragging, dragStart, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch events for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scale <= 1 || e.touches.length !== 1) return;

    e.preventDefault();
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - pan.x,
      y: touch.clientY - pan.y,
    });
  }, [scale, pan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;

    e.preventDefault();
    const touch = e.touches[0];
    const newPan = {
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    };

    const maxPanX = (scale - 1) * 200;
    const maxPanY = (scale - 1) * 150;

    setPan({
      x: Math.max(-maxPanX, Math.min(maxPanX, newPan.x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, newPan.y)),
    });
  }, [isDragging, dragStart, scale]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDownload = () => {
    if (currentItem) {
      const link = document.createElement('a');
      link.href = currentItem.url;
      link.download = currentItem.name;
      link.click();
    }
  };

  if (!currentItem) return null;

  const formattedDate = currentItem.addedAt
    ? format(parseISO(currentItem.addedAt), "dd MMMM yyyy à HH:mm", { locale: fr })
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
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={handleZoomReset}
              disabled={scale === 1}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={handleZoomIn}
              disabled={scale >= 4}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Actions */}
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-white hover:bg-white/10"
            onClick={handleDownload}
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
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
            className="h-10 w-10 text-white hover:bg-white/10"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main image area */}
      <div
        className="relative flex-1 overflow-hidden w-full"
        onClick={(e) => e.stopPropagation()}
      >
          <div
            className="relative flex-1 flex items-center justify-center p-4"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
            }}
          >
            <div
              ref={imageRef}
              className="relative transition-transform duration-200 ease-out"
              style={{
                transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: 'center center',
              }}
            >
              <Image
                src={currentItem.url}
                alt={currentItem.name}
                width={1200}
                height={800}
                className="max-w-full max-h-full object-contain select-none"
                draggable={false}
                priority
              />
            </div>
          </div>

          {/* Navigation buttons */}
          {hasPrevious && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/20 hover:bg-black/40 text-white h-12 w-12"
              onClick={() => onIndexChange(index - 1)}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          )}
          {hasNext && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/20 hover:bg-black/40 text-white h-12 w-12"
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
                left: '50%',
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
                      : "border-white/20 hover:border-white/60 opacity-60 hover:opacity-100"
                  )}
                >
                  <Image
                    src={item.url}
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
            Utilisez les flèches ← → pour naviguer • Échap pour fermer • Molette pour zoomer • Drag pour déplacer quand zoomé
          </div>
        </div>
      </div>
  );
}