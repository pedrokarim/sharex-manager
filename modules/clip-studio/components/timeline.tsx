"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AudioLines,
  Copy,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Lock,
  Minus,
  Pause,
  Play,
  Plus,
  Scissors,
  Shapes,
  Trash2,
  Type,
  Unlock,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatTimecode, projectDuration } from "../engine/timeline";
import type { AnimKind, ClipItem, ClipProject, Motion, Track } from "../engine/types";

export const MEDIA_DRAG_TYPE = "application/x-clip-media";

const HEADER_WIDTH = 148;
const RULER_HEIGHT = 28;
const ROW_HEIGHT: Record<Track["kind"], number> = { visual: 52, audio: 40 };
/** Distance d'aimantation, en pixels à l'écran. */
const SNAP_PX = 8;

export const ANIM_LABELS: Record<AnimKind, string> = {
  none: "Aucune",
  fade: "Fondu",
  "slide-up": "Glisser vers le haut",
  "slide-down": "Glisser vers le bas",
  "slide-left": "Glisser vers la gauche",
  "slide-right": "Glisser vers la droite",
  pop: "Apparition",
  zoom: "Zoom",
  typewriter: "Machine à écrire",
  wipe: "Balayage",
};

export const MOTION_LABELS: Record<Motion, string> = {
  none: "Fixe",
  "zoom-in": "Zoom avant",
  "zoom-out": "Zoom arrière",
  "pan-left": "Panoramique vers la gauche",
  "pan-right": "Panoramique vers la droite",
  "pan-up": "Panoramique vers le haut",
  "pan-down": "Panoramique vers le bas",
};

interface TimelineProps {
  project: ClipProject;
  frame: number;
  playing: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (frame: number) => void;
  onTogglePlay: () => void;
  onMove: (itemId: string, start: number, trackId: string) => void;
  onTrim: (itemId: string, edge: "start" | "end", frame: number) => void;
  onTrimEnd: () => void;
  onSplit: (itemId: string) => void;
  onDuplicate: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onItemPatch: (itemId: string, patch: Partial<ClipItem>) => void;
  onTrackPatch: (trackId: string, patch: Partial<Track>) => void;
  onDropMedia: (payload: string, trackId: string, frame: number) => void;
}

type Drag =
  | { kind: "move"; itemId: string; offsetFrames: number; start: number; trackId: string; valid: boolean }
  | { kind: "trim"; itemId: string; edge: "start" | "end" }
  | { kind: "scrub" };

/**
 * Timeline multipiste.
 *
 * Les en-têtes de piste et la règle sont collants dans le même conteneur de
 * défilement que les pistes : ils restent alignés quel que soit le défilement.
 */
export function Timeline(props: TimelineProps) {
  const { project, frame, playing, selectedId } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [ppf, setPpfState] = useState(4); // pixels par image
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Tant que l'utilisateur n'a pas zoomé lui-même, la timeline suit la durée du clip. */
  const userZoomed = useRef(false);
  const setPpf = (value: number | ((current: number) => number)) => {
    userZoomed.current = true;
    setPpfState(value);
  };

  const duration = projectDuration(project);
  const contentFrames = duration + project.fps * 6;
  const contentWidth = contentFrames * ppf;

  const fit = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const available = node.clientWidth - HEADER_WIDTH - 24;
    setPpfState(Math.min(20, Math.max(0.3, available / (duration + project.fps))));
  }, [duration, project.fps]);

  useLayoutEffect(() => {
    if (!userZoomed.current) fit();
  }, [fit]);

  // La tête de lecture reste visible pendant la lecture.
  useEffect(() => {
    const node = scroller.current;
    if (!node || !playing) return;
    const x = HEADER_WIDTH + frame * ppf;
    if (x > node.scrollLeft + node.clientWidth - 40) node.scrollLeft = x - HEADER_WIDTH - 40;
  }, [frame, playing, ppf]);

  // ─── Aimantation ───────────────────────────────────────────────
  const snapPoints = useMemo(() => {
    const points = new Set<number>([0, frame]);
    for (const track of project.tracks) {
      for (const item of track.items) {
        if (item.id === (drag && "itemId" in drag ? drag.itemId : null)) continue;
        points.add(item.start);
        points.add(item.start + item.duration);
      }
    }
    return [...points];
  }, [project.tracks, frame, drag]);

  const snap = (value: number, extra: number[] = []) => {
    const threshold = SNAP_PX / ppf;
    let best = value;
    let distance = threshold;
    for (const point of [...snapPoints, ...extra]) {
      const d = Math.abs(point - value);
      if (d < distance) {
        distance = d;
        best = point;
      }
    }
    return best;
  };

  const frameAtClientX = (clientX: number) => {
    const node = scroller.current!;
    const rect = node.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + node.scrollLeft - HEADER_WIDTH) / ppf);
  };

  const laneAt = (clientX: number, clientY: number) => {
    for (const element of document.elementsFromPoint(clientX, clientY)) {
      const id = (element as HTMLElement).dataset?.laneId;
      if (id) return id;
    }
    return null;
  };

  const trackOf = (itemId: string) =>
    project.tracks.find((track) => track.items.some((item) => item.id === itemId));

  const overlaps = (trackId: string, itemId: string, start: number, length: number) =>
    project.tracks
      .find((track) => track.id === trackId)
      ?.items.some((item) => item.id !== itemId && start < item.start + item.duration && item.start < start + length) ??
    true;

  // ─── Gestes ────────────────────────────────────────────────────
  const onItemPointerDown = (event: React.PointerEvent, item: ClipItem, track: Track) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    props.onSelect(item.id);
    if (track.locked) return;
    const edge = (event.target as HTMLElement).dataset.edge as "start" | "end" | undefined;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (edge) {
      setDrag({ kind: "trim", itemId: item.id, edge });
      return;
    }
    setDrag({
      kind: "move",
      itemId: item.id,
      offsetFrames: frameAtClientX(event.clientX) - item.start,
      start: item.start,
      trackId: track.id,
      valid: true,
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    const pointerFrame = frameAtClientX(event.clientX);
    if (drag.kind === "scrub") {
      props.onSeek(Math.round(pointerFrame));
      return;
    }
    if (drag.kind === "trim") {
      props.onTrim(drag.itemId, drag.edge, Math.round(snap(pointerFrame)));
      return;
    }
    const item = trackOf(drag.itemId)?.items.find((entry) => entry.id === drag.itemId);
    if (!item) return;
    const kind = item.type === "audio" ? "audio" : "visual";
    const lane = laneAt(event.clientX, event.clientY);
    const laneTrack = project.tracks.find((track) => track.id === lane);
    const trackId = laneTrack && laneTrack.kind === kind && !laneTrack.locked ? laneTrack.id : drag.trackId;

    // On aimante le début ou la fin, selon ce qui est le plus proche d'un repère.
    const raw = pointerFrame - drag.offsetFrames;
    const snappedStart = snap(raw);
    const snappedEnd = snap(raw + item.duration) - item.duration;
    const start = Math.max(
      0,
      Math.round(Math.abs(snappedStart - raw) <= Math.abs(snappedEnd - raw) ? snappedStart : snappedEnd)
    );
    setDrag({ ...drag, start, trackId, valid: !overlaps(trackId, item.id, start, item.duration) });
  };

  const onPointerUp = () => {
    if (drag?.kind === "move" && drag.valid) props.onMove(drag.itemId, drag.start, drag.trackId);
    if (drag?.kind === "trim") props.onTrimEnd();
    setDrag(null);
  };

  // ─── Règle ─────────────────────────────────────────────────────
  const ticks = useMemo(() => {
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60];
    const step = steps.find((seconds) => seconds * project.fps * ppf >= 64) ?? 120;
    const result: { frame: number; label: string }[] = [];
    for (let seconds = 0; seconds * project.fps <= contentFrames; seconds += step) {
      const minutes = Math.floor(seconds / 60);
      const rest = seconds % 60;
      // Sous la seconde, on garde la décimale : sinon deux repères portent le même libellé.
      const label = `${minutes}:${String(Math.floor(rest)).padStart(2, "0")}${step < 1 ? `,${Math.round((rest % 1) * 10)}` : ""}`;
      result.push({ frame: Math.round(seconds * project.fps), label });
    }
    return result;
  }, [project.fps, ppf, contentFrames]);

  const selectedItem = selectedId
    ? project.tracks.flatMap((track) => track.items).find((item) => item.id === selectedId)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ─── Barre d'outils ────────────────────────────────────── */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={props.onTogglePlay} aria-label={playing ? "Pause" : "Lecture"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="min-w-36 px-1 font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">{formatTimecode(frame, project.fps)}</span> / {formatTimecode(duration, project.fps)}
        </span>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Scinder à la tête de lecture (S)" disabled={!selectedItem} onClick={() => selectedItem && props.onSplit(selectedItem.id)}>
          <Scissors className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Dupliquer (Ctrl D)" disabled={!selectedItem} onClick={() => selectedItem && props.onDuplicate(selectedItem.id)}>
          <Copy className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Supprimer (Suppr)" disabled={!selectedItem} onClick={() => selectedItem && props.onDelete(selectedItem.id)}>
          <Trash2 className="h-4 w-4" />
        </ToolButton>
        <div className="ml-auto flex items-center gap-1">
          <ToolButton label="Dézoomer" onClick={() => setPpf((value) => Math.max(0.3, value / 1.4))}>
            <Minus className="h-4 w-4" />
          </ToolButton>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((Math.log(ppf / 0.3) / Math.log(20 / 0.3)) * 100)}
            onChange={(event) => setPpf(0.3 * Math.pow(20 / 0.3, Number(event.target.value) / 100))}
            className="w-28 accent-primary"
            aria-label="Zoom de la timeline"
          />
          <ToolButton label="Zoomer" onClick={() => setPpf((value) => Math.min(20, value * 1.4))}>
            <Plus className="h-4 w-4" />
          </ToolButton>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              userZoomed.current = false;
              fit();
            }}
          >
            Ajuster
          </Button>
        </div>
      </div>

      {/* ─── Pistes ────────────────────────────────────────────── */}
      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-auto"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="relative" style={{ width: HEADER_WIDTH + contentWidth }}>
          {/* Règle */}
          <div className="sticky top-0 z-20 flex" style={{ height: RULER_HEIGHT }}>
            <div className="sticky left-0 z-10 shrink-0 border-r border-b bg-background" style={{ width: HEADER_WIDTH }} />
            <div
              className="relative flex-1 cursor-pointer border-b bg-background/95 backdrop-blur"
              onPointerDown={(event) => {
                (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                props.onSeek(Math.round(frameAtClientX(event.clientX)));
                setDrag({ kind: "scrub" });
              }}
            >
              {ticks.map((tick) => (
                <div key={tick.frame} className="absolute top-0 flex h-full items-end" style={{ left: tick.frame * ppf }}>
                  <div className="h-2 w-px bg-border" />
                  <span className="mb-1 ml-1 font-mono text-[10px] text-muted-foreground tabular-nums">{tick.label}</span>
                </div>
              ))}
            </div>
          </div>

          {project.tracks.map((track) => (
            <div key={track.id} className="flex border-b" style={{ height: ROW_HEIGHT[track.kind] }}>
              <TrackHeader track={track} onPatch={(patch) => props.onTrackPatch(track.id, patch)} />
              <div
                data-lane-id={track.id}
                className={cn("relative flex-1", track.kind === "audio" ? "bg-emerald-500/[0.03]" : "bg-transparent")}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) {
                    props.onSelect(null);
                    props.onSeek(Math.round(frameAtClientX(event.clientX)));
                  }
                }}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDrop={(event) => {
                  const payload = event.dataTransfer.getData(MEDIA_DRAG_TYPE);
                  if (!payload) return;
                  event.preventDefault();
                  props.onDropMedia(payload, track.id, Math.round(snap(frameAtClientX(event.clientX))));
                }}
              >
                {track.items.map((item) => {
                  const ghost = drag?.kind === "move" && drag.itemId === item.id ? drag : null;
                  return (
                    <TimelineItem
                      key={item.id}
                      item={item}
                      track={track}
                      ppf={ppf}
                      selected={item.id === selectedId}
                      dimmed={Boolean(ghost)}
                      onPointerDown={(event) => onItemPointerDown(event, item, track)}
                      {...props}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {/* Fantôme de l'élément déplacé */}
          {drag?.kind === "move" && (() => {
            const item = trackOf(drag.itemId)?.items.find((entry) => entry.id === drag.itemId);
            const rowIndex = project.tracks.findIndex((track) => track.id === drag.trackId);
            if (!item || rowIndex === -1) return null;
            const top =
              RULER_HEIGHT +
              project.tracks.slice(0, rowIndex).reduce((sum, track) => sum + ROW_HEIGHT[track.kind] + 1, 0);
            return (
              <div
                className={cn(
                  "pointer-events-none absolute z-10 rounded-md border-2 border-dashed",
                  drag.valid ? "border-primary bg-primary/15" : "border-destructive bg-destructive/15"
                )}
                style={{
                  left: HEADER_WIDTH + drag.start * ppf,
                  width: item.duration * ppf,
                  top: top + 4,
                  height: ROW_HEIGHT[project.tracks[rowIndex].kind] - 8,
                }}
              />
            );
          })()}

          {/* Tête de lecture */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-rose-500"
            style={{ left: HEADER_WIDTH + frame * ppf }}
          >
            <div className="absolute -top-0 -left-[5px] h-3 w-[11px] rounded-b-sm bg-rose-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={disabled} onClick={onClick} aria-label={label}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TrackHeader({ track, onPatch }: { track: Track; onPatch: (patch: Partial<Track>) => void }) {
  return (
    <div
      className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r bg-background px-2"
      style={{ width: HEADER_WIDTH }}
    >
      {track.kind === "audio" ? (
        <AudioLines className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      ) : (
        <Film className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{track.name}</span>
      {track.kind === "visual" ? (
        <HeaderToggle label={track.hidden ? "Afficher la piste" : "Masquer la piste"} active={Boolean(track.hidden)} onClick={() => onPatch({ hidden: !track.hidden })}>
          {track.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </HeaderToggle>
      ) : (
        <HeaderToggle label={track.muted ? "Rétablir le son" : "Couper le son"} active={Boolean(track.muted)} onClick={() => onPatch({ muted: !track.muted })}>
          {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </HeaderToggle>
      )}
      <HeaderToggle label={track.locked ? "Déverrouiller" : "Verrouiller"} active={Boolean(track.locked)} onClick={() => onPatch({ locked: !track.locked })}>
        {track.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </HeaderToggle>
    </div>
  );
}

function HeaderToggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-muted",
        active ? "text-foreground" : "text-muted-foreground/60"
      )}
    >
      {children}
    </button>
  );
}

const ITEM_STYLE: Record<ClipItem["type"], string> = {
  image: "border-sky-500/50 bg-sky-500/15",
  video: "border-violet-500/50 bg-violet-500/15",
  text: "border-amber-500/50 bg-amber-500/15",
  shape: "border-teal-500/50 bg-teal-500/15",
  audio: "border-emerald-500/50 bg-emerald-500/15",
};

const ITEM_ICON: Record<ClipItem["type"], typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  text: Type,
  shape: Shapes,
  audio: AudioLines,
};

function itemLabel(item: ClipItem) {
  if (item.label) return item.label;
  if (item.type === "text") return item.text;
  if (item.type === "shape") return item.shape === "progress" ? "Barre de progression" : "Forme";
  return item.source.name;
}

function TimelineItem({
  item,
  track,
  ppf,
  selected,
  dimmed,
  onPointerDown,
  ...props
}: {
  item: ClipItem;
  track: Track;
  ppf: number;
  selected: boolean;
  dimmed: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
} & TimelineProps) {
  const Icon = ITEM_ICON[item.type];
  const width = Math.max(4, item.duration * ppf);
  const thumbnail = item.type === "image" ? item.source.url : null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          layout="position"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          onPointerDown={onPointerDown}
          className={cn(
            "group absolute top-1 bottom-1 flex cursor-grab items-center gap-1.5 overflow-hidden rounded-md border px-2 text-xs select-none active:cursor-grabbing",
            ITEM_STYLE[item.type],
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
            dimmed && "opacity-40",
            track.locked && "cursor-not-allowed opacity-70"
          )}
          style={{ left: item.start * ppf, width }}
        >
          {thumbnail && (
            <div
              aria-hidden
              className="absolute inset-0 opacity-35"
              style={{ backgroundImage: `url("${thumbnail}")`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" }}
            />
          )}
          <Icon className="relative h-3.5 w-3.5 shrink-0" />
          <span className="relative truncate font-medium">{itemLabel(item)}</span>
          {!track.locked && (
            <>
              <span data-edge="start" className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-foreground/0 transition-colors hover:bg-foreground/25" />
              <span data-edge="end" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-foreground/0 transition-colors hover:bg-foreground/25" />
            </>
          )}
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuItem onClick={() => props.onSplit(item.id)}>
          <Scissors className="mr-2 h-4 w-4" />
          Scinder à la tête de lecture
        </ContextMenuItem>
        <ContextMenuItem onClick={() => props.onDuplicate(item.id)}>
          <Copy className="mr-2 h-4 w-4" />
          Dupliquer
        </ContextMenuItem>
        {item.type !== "audio" && (
          <>
            <ContextMenuSeparator />
            <AnimSubmenu label="Animation d'entrée" value={item.animIn.kind} onPick={(kind) => props.onItemPatch(item.id, { animIn: { ...item.animIn, kind } } as Partial<ClipItem>)} />
            <AnimSubmenu label="Animation de sortie" value={item.animOut.kind} onPick={(kind) => props.onItemPatch(item.id, { animOut: { ...item.animOut, kind } } as Partial<ClipItem>)} />
          </>
        )}
        {item.type === "image" && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Mouvement de caméra</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {(Object.keys(MOTION_LABELS) as Motion[]).map((motionKind) => (
                <ContextMenuItem key={motionKind} onClick={() => props.onItemPatch(item.id, { motion: motionKind } as Partial<ClipItem>)}>
                  <span className="flex-1">{MOTION_LABELS[motionKind]}</span>
                  {item.motion === motionKind && <span className="text-primary">•</span>}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => props.onDelete(item.id)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function AnimSubmenu({
  label,
  value,
  onPick,
}: {
  label: string;
  value: AnimKind;
  onPick: (kind: AnimKind) => void;
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>{label}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-56">
        <ContextMenuLabel className="text-[11px] font-normal text-muted-foreground">{label}</ContextMenuLabel>
        {(Object.keys(ANIM_LABELS) as AnimKind[]).map((kind) => (
          <ContextMenuItem key={kind} onClick={() => onPick(kind)}>
            <span className="flex-1">{ANIM_LABELS[kind]}</span>
            {value === kind && <span className="text-primary">•</span>}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
