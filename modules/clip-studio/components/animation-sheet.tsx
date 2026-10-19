"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FolderOpen, Repeat, RotateCcw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { drawFrame } from "../engine/render";
import { MOTION_CATEGORY_LABELS, type MotionParamValues } from "../engine/motion/types";
import type { PickerItemType } from "../lib/motion-catalog";
import {
  SPLIT_LABELS,
  appliesTo,
  durationText,
  easeText,
  editorPath,
  itemTypesText,
  phasesText,
  type GalleryEntry,
} from "../lib/motion-gallery";
import { buildPreviewScene, PREVIEW_FPS, type PreviewScene } from "../lib/motion-preview";
import { buildScenePreview } from "../lib/scene-preview";
import { subscribeTick } from "../lib/motion-ticker";
import { MotionParamsFields } from "./motion-params";
import { toRgb, usePrefersReducedMotion } from "./motion-thumbnail";
import { witness } from "./scene-thumbnail";

/** Titre du témoin de texte dans l'aperçu : deux mots, pour voir aussi un découpage par mot ou par ligne. */
const SHEET_SAMPLE_TEXT = "Votre titre";

const SPEEDS = ["0.5", "1", "2"] as const;
type Speed = (typeof SPEEDS)[number];
const SPEED_LABELS: Record<Speed, string> = { "0.5": "×0,5", "1": "×1", "2": "×2" };

const PREVIEW_SIZE: [number, number] = [640, 400];

// ─── Aperçu ──────────────────────────────────────────────────────

interface AnimationPreviewProps {
  entry: GalleryEntry;
  itemType: PickerItemType;
  params: MotionParamValues | undefined;
  speed: number;
  loop: boolean;
  /** Change à chaque « Rejouer » : l'aperçu repart du début. */
  replay: number;
}

/**
 * Grand aperçu de la fiche, dessiné par `drawFrame` comme l'export. Il joue
 * en boucle ou une fois, à la vitesse choisie, sur l'horloge partagée des
 * vignettes. Si le système réduit les animations, il reste sur une image
 * figée jusqu'à ce que l'on demande « Rejouer ».
 */
export function AnimationPreview({ entry, itemType, params, speed, loop, replay }: AnimationPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [width, height] = PREVIEW_SIZE;
  const paramsKey = params ? JSON.stringify(params) : "";

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let scene: PreviewScene;
    let resolve: Parameters<typeof drawFrame>[3];
    if (entry.source === "scene") {
      scene = buildScenePreview(entry.kind, entry.id, width, height);
      resolve = (item) => witness(item.source.ref);
    } else {
      const color = toRgb(getComputedStyle(canvas).color);
      const text = entry.sampleText ?? (itemType === "text" ? SHEET_SAMPLE_TEXT : undefined);
      scene = buildPreviewScene(entry.preset, entry.pickerPhase, { width, height, color, itemType, params, text });
      resolve = () => null;
    }

    let shown = -1;
    const draw = (frame: number) => {
      if (frame === shown) return;
      shown = frame;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      try {
        drawFrame(ctx, scene.project, frame, resolve);
      } catch {
        // Un préréglage qui échoue laisse l'aperçu vide plutôt que de fermer la fiche.
      }
    };

    // Animations réduites : image figée, sauf si l'on a demandé « Rejouer » (une seule fois alors).
    if (reducedMotion && replay === 0) {
      draw(scene.stillFrame);
      return;
    }
    const once = !loop || reducedMotion;
    let startedAt: number | null = null;
    let unsubscribe: (() => void) | null = null;
    unsubscribe = subscribeTick((now) => {
      startedAt ??= now;
      const frame = Math.floor((((now - startedAt) * speed) / 1000) * PREVIEW_FPS);
      if (once && frame >= scene.loopFrames - 1) {
        draw(scene.loopFrames - 1);
        unsubscribe?.();
        unsubscribe = null;
        return;
      }
      draw(frame % scene.loopFrames);
    });
    return () => unsubscribe?.();
    // `params` est lu par sa clé : un objet recréé à chaque rendu ne relance pas l'aperçu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, itemType, paramsKey, speed, loop, replay, reducedMotion, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-hidden
      data-gallery-preview={entry.key}
      className="block aspect-[8/5] h-auto w-full max-w-full rounded-lg bg-muted/60 text-foreground"
    />
  );
}

// ─── Fiche ───────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function SheetSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 space-y-2", className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

const SCENE_FAMILY: Record<string, string> = {
  transition: "Transition entre deux plans",
  camera: "Mouvement de caméra d’une image ou d’une vidéo",
  shotfx: "Effet posé sur une piste, à un instant",
};

interface AnimationSheetProps {
  entry: GalleryEntry | null;
  onOpenChange: (open: boolean) => void;
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
  /** Animation précédente et suivante dans la liste montrée. */
  onPrevious?: () => void;
  onNext?: () => void;
  /** Position dans la liste montrée, pour « 3 sur 60 ». */
  position?: { index: number; total: number };
}

/**
 * Fiche d'une animation, en tiroir sur le côté : grand aperçu (rejouer,
 * boucle, vitesse), réglages déclarés appliqués en direct, détails, et le
 * chemin exact pour la poser dans l'éditeur.
 */
export function AnimationSheet({ entry, onOpenChange, favorite, onToggleFavorite, onPrevious, onNext, position }: AnimationSheetProps) {
  return (
    <Sheet open={entry !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl">
        {entry ? (
          <SheetBody
            key={entry.key}
            entry={entry}
            favorite={favorite}
            onToggleFavorite={onToggleFavorite}
            onPrevious={onPrevious}
            onNext={onNext}
            position={position}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ entry, favorite, onToggleFavorite, onPrevious, onNext, position }: Omit<AnimationSheetProps, "entry" | "onOpenChange"> & { entry: GalleryEntry }) {
  const [params, setParams] = useState<MotionParamValues | undefined>(undefined);
  const [speed, setSpeed] = useState<Speed>("1");
  const [loop, setLoop] = useState(true);
  const [replay, setReplay] = useState(0);
  const preset = entry.source === "motion" ? entry.preset : null;
  // Une animation « tout élément » se montre sur une forme ou sur un texte, au choix.
  const canSwitchSubject = preset !== null && preset.target === "any" && entry.source === "motion" && entry.itemType !== "text";
  const [itemType, setItemType] = useState<PickerItemType>(entry.source === "motion" ? entry.itemType : "image");
  const path = useMemo(() => editorPath(entry), [entry]);
  const detail = durationText(entry);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SheetHeader className="shrink-0 gap-1 border-b p-4 pr-12">
        <SheetTitle className="text-lg leading-snug [overflow-wrap:anywhere]">{entry.label}</SheetTitle>
        <SheetDescription className="[overflow-wrap:anywhere]">
          {entry.sectionLabel} · {detail}
        </SheetDescription>
      </SheetHeader>

      {/* Seul le corps défile : l’en-tête et les gestes du bas restent en place. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain p-4">
        <section className="min-w-0 space-y-3" aria-label="Aperçu">
          <AnimationPreview entry={entry} itemType={itemType} params={params} speed={Number(speed)} loop={loop} replay={replay} />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setReplay((value) => value + 1)}>
              <RotateCcw className="size-3.5" />
              Rejouer
            </Button>
            <Toggle variant="outline" size="sm" pressed={loop} onPressedChange={setLoop} aria-label="Lire en boucle" className="gap-1.5 px-2.5">
              <Repeat className="size-3.5" />
              En boucle
            </Toggle>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={speed}
              onValueChange={(next) => next && setSpeed(next as Speed)}
              aria-label="Vitesse de l’aperçu"
            >
              {SPEEDS.map((value) => (
                <ToggleGroupItem key={value} value={value} aria-label={`Vitesse ${SPEED_LABELS[value]}`} className="px-2.5 text-xs tabular-nums">
                  {SPEED_LABELS[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {canSwitchSubject ? (
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={itemType === "text" ? "text" : "shape"}
                onValueChange={(next) => next && setItemType(next === "text" ? "text" : entry.itemType)}
                aria-label="Témoin de l’aperçu"
              >
                <ToggleGroupItem value="shape" className="px-2.5 text-xs">
                  Forme
                </ToggleGroupItem>
                <ToggleGroupItem value="text" className="px-2.5 text-xs">
                  Texte
                </ToggleGroupItem>
              </ToggleGroup>
            ) : null}
          </div>
        </section>

        {preset && preset.params && preset.params.length > 0 ? (
          <SheetSection title="Réglages">
            <div className="rounded-lg border p-3">
              <MotionParamsFields preset={preset} values={params} onChange={setParams} />
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              Ils ne changent que l’aperçu. Dans l’éditeur, ils se règlent dans l’inspecteur, sous l’animation choisie.
            </p>
          </SheetSection>
        ) : null}

        <SheetSection title="Détails">
          <dl className="divide-y rounded-lg border">
            {preset ? (
              <>
                <DetailRow label="Phases">{phasesText(preset)}</DetailRow>
                <DetailRow label="Durée">{durationText(entry)}</DetailRow>
                <DetailRow label="Courbe">{easeText(preset.ease, preset)}</DetailRow>
                <DetailRow label="Catégorie">{MOTION_CATEGORY_LABELS[preset.category] ?? preset.category}</DetailRow>
                {preset.split ? <DetailRow label="Découpage">{SPLIT_LABELS[preset.split]}</DetailRow> : null}
                {preset.grid ? (
                  <DetailRow label="Grille">
                    {preset.grid.columns}&nbsp;×&nbsp;{preset.grid.rows} carreaux
                  </DetailRow>
                ) : null}
                <DetailRow label="S’applique à">{itemTypesText(appliesTo(preset))}</DetailRow>
              </>
            ) : entry.source === "scene" ? (
              <>
                <DetailRow label="Famille">{SCENE_FAMILY[entry.kind]}</DetailRow>
                <DetailRow label="Durée">{durationText(entry)}</DetailRow>
                <DetailRow label="Catégorie">{entry.sectionLabel}</DetailRow>
              </>
            ) : null}
          </dl>
        </SheetSection>

        <SheetSection title="Où la trouver dans l’éditeur">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm marker:text-muted-foreground">
            {path.steps.map((step) => (
              <li key={step} className="pl-1 text-pretty">
                {step}
              </li>
            ))}
          </ol>
          <p className="text-sm text-pretty text-muted-foreground">
            <span className="font-medium text-foreground">Plus court{" "}:</span> {path.shortcut}
          </p>
        </SheetSection>
      </div>

      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t bg-background p-3">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" aria-pressed={favorite} onClick={() => onToggleFavorite(entry.id)}>
          <Star className={cn("size-3.5", favorite && "fill-amber-400 text-amber-500")} />
          {favorite ? "Dans les favoris" : "Ajouter aux favoris"}
        </Button>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/m/clip-studio/projects">
            <FolderOpen className="size-3.5" />
            Mes projets
          </Link>
        </Button>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {position ? (
            <span className="px-1 text-xs text-muted-foreground tabular-nums">
              {position.index + 1} sur {position.total}
            </span>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={!onPrevious} onClick={onPrevious} aria-label="Animation précédente">
                <ChevronLeft className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Animation précédente</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={!onNext} onClick={onNext} aria-label="Animation suivante">
                <ChevronRight className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Animation suivante</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
