"use client";

/**
 * Aperçu en lecture seule d'un projet : le même lecteur que l'éditeur
 * (`PreviewPlayer`, même dessin que l'export), sans sélection ni poignées.
 * L'écran Exporter s'en sert pour revoir le clip et poser l'entrée et la
 * sortie de la plage à rendre.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { MediaLibrary, PreviewPlayer } from "../engine/preview";
import { formatTimecode, projectDuration } from "../engine/timeline";
import type { ClipProject } from "../engine/types";
import { ensureProjectFonts } from "../lib/fonts";
import type { FrameRange } from "../lib/export-screens";

export interface ClipPlayerHandle {
  seek: (frame: number) => void;
  pause: () => void;
}

export function ClipPlayer({
  project,
  range,
  onFrame,
  handleRef,
  className,
}: {
  project: ClipProject;
  /** Plage à rendre, montrée sous la barre de lecture quand elle ne couvre pas tout. */
  range?: FrameRange | null;
  onFrame?: (frame: number) => void;
  handleRef?: React.RefObject<ClipPlayerHandle | null>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PreviewPlayer | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const total = projectDuration(project);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const audioContext = new AudioContext();
    const player = new PreviewPlayer(canvas, () => projectRef.current, new MediaLibrary(audioContext), (next, isPlaying) => {
      setFrame(next);
      setPlaying(isPlaying);
    });
    playerRef.current = player;
    player.prefetchAudio();
    player.render();
    let alive = true;
    // Les polices arrivent après le premier dessin : on redessine une fois prêtes.
    void ensureProjectFonts(projectRef.current).then(() => {
      if (alive && !player.playing) player.render();
    });
    return () => {
      alive = false;
      player.dispose();
      playerRef.current = null;
      void audioContext.close();
    };
  }, []);

  useEffect(() => {
    onFrame?.(frame);
  }, [frame, onFrame]);

  const seek = useCallback((next: number) => playerRef.current?.seek(next), []);
  const pause = useCallback(() => playerRef.current?.pause(), []);
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { seek, pause };
  }, [handleRef, seek, pause]);

  const ratio = project.width / project.height;
  const showRange = range && (range.from > 0 || range.to < total);

  return (
    <figure className={cn("grid min-w-0 gap-2", className)} aria-label="Aperçu du clip">
      <div className="flex min-w-0 justify-center rounded-lg bg-muted/40 p-2">
        <canvas
          ref={canvasRef}
          style={{ aspectRatio: `${ratio}`, ["--ratio" as string]: ratio }}
          className="block h-auto w-[min(100%,calc(36vh*var(--ratio)))] max-w-full rounded-md bg-black shadow-sm lg:w-[min(100%,calc(64vh*var(--ratio)))]"
          onClick={() => playerRef.current?.toggle()}
        />
      </div>
      <figcaption className="flex min-w-0 items-center gap-3">
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => playerRef.current?.toggle()} aria-label={playing ? "Pause" : "Lecture"}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <div className="grid min-w-0 flex-1 gap-1">
          <Slider value={[frame]} min={0} max={Math.max(1, total - 1)} step={1} onValueChange={([value]) => seek(value)} aria-label="Position dans le clip" />
          {showRange ? (
            <div className="relative h-1 rounded-full bg-muted" aria-hidden>
              <div className="absolute inset-y-0 rounded-full bg-primary/60" style={{ left: `${(range.from / total) * 100}%`, width: `${((range.to - range.from) / total) * 100}%` }} />
            </div>
          ) : null}
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {formatTimecode(frame, project.fps)} / {formatTimecode(total, project.fps)}
        </span>
      </figcaption>
    </figure>
  );
}
