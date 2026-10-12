"use client";

import { useState } from "react";
import { ArrowLeft, Crosshair, Repeat2, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatTimecode } from "../engine/timeline";
import type { ShotEffect } from "../engine/types";
import {
  SHOT_FX_MAX_SECONDS,
  SHOT_FX_MIN_SECONDS,
  findSceneEntry,
  sceneDetail,
  secondsText,
  shotEffectFrames,
  shotFxLabel,
} from "../lib/scene-catalog";
import { SceneCatalog } from "./scene-picker";
import { SceneThumbnail } from "./scene-thumbnail";

/** Largeur minimale d'une marque, pour qu'elle reste attrapable quand la timeline est dézoomée. */
const MARKER_MIN_WIDTH = 16;

interface ShotFxEditorProps {
  effect: ShotEffect;
  fps: number;
  /** Dernière image du clip : l'instant ne va pas au-delà. */
  maxFrame: number;
  /** Image de la tête de lecture. */
  playhead: number;
  locked: boolean;
  /** `key` regroupe les réglages successifs d'un même curseur en une étape d'annulation. */
  onChange: (patch: Partial<ShotEffect>, key?: string) => void;
  onRemove: () => void;
}

/**
 * Inspecteur d'un effet de plan : son aperçu, son instant, sa durée, et de
 * quoi le changer ou le retirer. Le catalogue s'ouvre à la place des
 * réglages, dans la même fenêtre.
 */
export function ShotFxEditor({ effect, fps, maxFrame, playhead, locked, onChange, onRemove }: ShotFxEditorProps) {
  const [choosing, setChoosing] = useState(false);
  const [hover, setHover] = useState(false);
  const entry = findSceneEntry("shotfx", effect.kind);
  const label = shotFxLabel(effect.kind);
  const frames = shotEffectFrames(effect, fps);
  const detail = entry ? sceneDetail(entry, "shotfx") : "Identifiant inconnu de ce moteur : l’effet n’est pas joué";
  const at = Math.round(effect.at);
  const lastFrame = Math.max(at, maxFrame);

  if (choosing) {
    return (
      <div className="flex h-[min(30rem,70dvh)] min-h-0 flex-col">
        <div className="flex min-w-0 shrink-0 items-center gap-1 border-b px-2 py-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setChoosing(false)} aria-label="Revenir aux réglages">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-0 truncate text-sm font-medium">Changer d’effet</span>
        </div>
        <div className="min-h-0 flex-1">
          <SceneCatalog
            kind="shotfx"
            value={effect.kind}
            onPick={(kind) => {
              onChange({ kind });
              setChoosing(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3">
      <div
        className="flex min-w-0 items-center gap-2.5"
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <span className="w-20 shrink-0">
          <SceneThumbnail kind="shotfx" id={entry ? effect.kind : null} playing={hover} resolution={[160, 100]} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={label}>
            {label}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground" title={detail}>
            {detail}
          </span>
        </span>
      </div>

      <label className="block space-y-1.5">
        <span className="flex min-w-0 items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Instant</span>
          <span className="shrink-0 font-mono tabular-nums">{formatTimecode(at, fps)}</span>
        </span>
        <Slider
          min={0}
          max={lastFrame}
          step={1}
          value={[at]}
          disabled={locked}
          onValueChange={([value]) => onChange({ at: value }, "at")}
          aria-label="Instant de l’effet"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="flex min-w-0 items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Durée</span>
          <span className="shrink-0 font-mono tabular-nums">{secondsText((frames / fps) * 1000)}</span>
        </span>
        <Slider
          min={Math.max(1, Math.round(SHOT_FX_MIN_SECONDS * fps))}
          max={Math.round(SHOT_FX_MAX_SECONDS * fps)}
          step={1}
          value={[frames]}
          disabled={locked}
          onValueChange={([value]) => onChange({ frames: value }, "frames")}
          aria-label="Durée de l’effet"
        />
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" className="h-8 min-w-0 gap-1.5 px-2 text-xs" disabled={locked} onClick={() => setChoosing(true)}>
          <Repeat2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Changer</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-0 gap-1.5 px-2 text-xs"
          disabled={locked || playhead === at}
          onClick={() => onChange({ at: playhead })}
          title="Placer l’effet à la tête de lecture"
        >
          <Crosshair className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">À la tête de lecture</span>
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={locked}
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Retirer l’effet
      </Button>
      {locked && <p className="text-[11px] leading-4 text-muted-foreground">La piste est verrouillée&nbsp;: déverrouillez-la pour modifier ses effets.</p>}
    </div>
  );
}

interface ShotFxMarkerProps extends ShotFxEditorProps {
  /** Position et largeur sur la piste, en pixels. */
  left: number;
  width: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Glissement de la marque (changement d'instant). */
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  /** Vrai juste après un glissement : le clic qui le termine n'ouvre pas l'inspecteur. */
  consumeDrag: () => boolean;
  /** Clavier : flèches pour décaler, Suppr pour retirer. */
  onNudge: (frames: number) => void;
}

/**
 * Marque d'un effet de plan sur sa piste : une pastille à l'instant de
 * l'effet, prolongée par une bande sur sa durée. Un clic ouvre son
 * inspecteur (fenêtre sur un grand écran, tiroir sur un téléphone), un
 * glissement la déplace, les flèches la décalent d'une image (d'une seconde
 * avec Maj) et Suppr la retire.
 */
export function ShotFxMarker({ left, width, open, onOpenChange, onPointerDown, consumeDrag, onNudge, ...editor }: ShotFxMarkerProps) {
  const mobile = useIsMobile();
  const label = shotFxLabel(editor.effect.kind);
  const frames = shotEffectFrames(editor.effect, editor.fps);
  const known = Boolean(findSceneEntry("shotfx", editor.effect.kind));
  const description = `Effet de plan : ${label}, à ${formatTimecode(Math.round(editor.effect.at), editor.fps)}, ${secondsText((frames / editor.fps) * 1000)}`;

  const marker = (
    <button
      type="button"
      data-shot-fx
      aria-label={description}
      title={description}
      onPointerDown={onPointerDown}
      onClick={(event) => {
        if (consumeDrag()) {
          // Fin d'un glissement : pas d'ouverture.
          event.preventDefault();
          return;
        }
        if (mobile) onOpenChange(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          if (!editor.locked) onNudge((event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? editor.fps : 1));
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          if (!editor.locked) editor.onRemove();
        }
      }}
      className={cn(
        "group/fx absolute top-0 z-[3] flex h-4 items-center rounded-b-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
        editor.locked ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        open && "ring-2 ring-primary ring-offset-1 ring-offset-background"
      )}
      style={{ left, width: Math.max(MARKER_MIN_WIDTH, width) }}
    >
      {/* Bande de la durée, sous la pastille. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-b-md transition-colors",
          known ? "bg-fuchsia-500/30 group-hover/fx:bg-fuchsia-500/45 dark:bg-fuchsia-400/30" : "bg-muted-foreground/30"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-b-md",
          known ? "bg-fuchsia-600 text-white dark:bg-fuchsia-500" : "bg-muted-foreground text-background"
        )}
      >
        <Zap className="h-2.5 w-2.5" />
      </span>
    </button>
  );

  const content = <ShotFxEditor {...editor} />;

  if (mobile) {
    return (
      <>
        {marker}
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[85dvh]">
            <DrawerTitle className="truncate px-4 pt-2 text-sm" title={`Effet de plan · ${label}`}>
              Effet de plan
            </DrawerTitle>
            <DrawerDescription className="sr-only">Régler l’instant et la durée de l’effet, le changer ou le retirer.</DrawerDescription>
            <div className="min-h-0 flex-1 overflow-y-auto">{open && content}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{marker}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={16}
        className="flex max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
