"use client";

import { useState } from "react";
import Image from "next/image";
import { Film, Play } from "lucide-react";
import { formatDuration } from "@/lib/media-kind";
import { cn } from "@/lib/utils";

/**
 * Vignette d'une vidéo de la galerie : sa couverture, un repère de lecture et
 * la durée. Sans couverture (ffmpeg pas encore prêt), une icône la remplace.
 */
export function VideoThumbnail({
  name,
  durationMs,
  sizes,
  className,
  showBadge = true,
}: {
  name: string;
  durationMs?: number;
  sizes?: string;
  className?: string;
  showBadge?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const duration = formatDuration(durationMs);

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-muted", className)}>
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
      {showBadge && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur-sm">
          <Play className="h-3 w-3 fill-current" />
          {duration}
        </span>
      )}
    </div>
  );
}
