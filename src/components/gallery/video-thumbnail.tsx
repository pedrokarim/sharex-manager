"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Film, Play } from "lucide-react";
import { formatDuration } from "@/lib/media-kind";
import { cn } from "@/lib/utils";

/** Délai de survol avant l'aperçu : parcourir la grille ne lance aucune vidéo. */
const PREVIEW_DELAY_MS = 400;

/**
 * Vignette d'une vidéo de la galerie : sa couverture, un repère de lecture et
 * la durée. Sans couverture (ffmpeg pas encore prêt), une icône la remplace.
 *
 * Au survol prolongé, la vidéo se lit sans le son à la place de la couverture.
 * Elle n'est chargée qu'à ce moment-là, et retirée dès que le pointeur part.
 */
export function VideoThumbnail({
  name,
  durationMs,
  sizes,
  className,
  showBadge = true,
  preview = true,
}: {
  name: string;
  durationMs?: number;
  sizes?: string;
  className?: string;
  showBadge?: boolean;
  /** Lecture muette au survol ; inutile dans une vignette de 48 px. */
  preview?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duration = formatDuration(durationMs);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div
      className={cn("relative h-full w-full overflow-hidden bg-muted", className)}
      onPointerEnter={(event) => {
        // Sur écran tactile, l'aperçu gênerait le toucher qui ouvre la vidéo.
        if (!preview || event.pointerType !== "mouse") return;
        timer.current = setTimeout(() => setPlaying(true), PREVIEW_DELAY_MS);
      }}
      onPointerLeave={stop}
    >
      {failed ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Film className="h-8 w-8" />
        </div>
      ) : (
        <Image
          src={`/api/thumbnails/${encodeURIComponent(name)}`}
          alt={name}
          fill
          draggable={false}
          unoptimized
          loading="lazy"
          onError={() => setFailed(true)}
          className="object-cover"
          sizes={sizes ?? "(max-width: 768px) 50vw, 25vw"}
        />
      )}
      <AnimatePresence>
        {playing && (
          <motion.video
            key="preview"
            src={`/api/files/${encodeURIComponent(name)}`}
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            disablePictureInPicture
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        )}
      </AnimatePresence>
      {showBadge && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur-sm">
          <Play className="h-3 w-3 fill-current" />
          {duration}
        </span>
      )}
    </div>
  );
}
