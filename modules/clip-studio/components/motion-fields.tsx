"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { suggestedAnimFrames } from "../engine/timeline";
import type { Anim, AnimEmphasis, ClipItem, VisualItem } from "../engine/types";
import { PICKER_PHASE_LABELS, pickPatch, resolvePreset, type PickerPhase } from "../lib/motion-catalog";
import { MotionParamsFields, RangeField } from "./motion-params";
import { MotionField } from "./motion-picker";

type Patch = (patch: Partial<ClipItem>, key: string) => void;

const PHASES: PickerPhase[] = ["in", "out", "emphasis"];

const seconds = (value: number) => `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s`;

function animOf(item: VisualItem, phase: PickerPhase): Anim | AnimEmphasis | undefined {
  return phase === "in" ? item.animIn : phase === "out" ? item.animOut : item.animEmphasis;
}

function hasAnimation(item: VisualItem, phase: PickerPhase): boolean {
  const anim = animOf(item, phase);
  return Boolean(anim && anim.kind !== "none" && resolvePreset(anim.kind, phase));
}

/**
 * Bloc « Animations » de l'inspecteur : un onglet par phase (entrée, sortie,
 * mise en avant), chacun avec son sélecteur, sa durée et les réglages du
 * préréglage choisi.
 */
export function AnimationFields({ item, fps, onPatch }: { item: VisualItem; fps: number; onPatch: Patch }) {
  const [phase, setPhase] = useState<PickerPhase>("in");
  return (
    <Tabs value={phase} onValueChange={(next) => setPhase(next as PickerPhase)} className="min-w-0 gap-3">
      {/* Largeur de chaque onglet selon son nom : « Mise en avant » tient en entier à côté de « Entrée » et « Sortie ». */}
      <TabsList className="flex h-8 w-full">
        {PHASES.map((entry) => (
          <TabsTrigger key={entry} value={entry} className="min-w-0 flex-auto gap-1 px-1.5 text-[11px]" title={PICKER_PHASE_LABELS[entry]}>
            <span className="min-w-0 truncate">{PICKER_PHASE_LABELS[entry]}</span>
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", hasAnimation(item, entry) ? "bg-primary" : "bg-transparent")}
            />
          </TabsTrigger>
        ))}
      </TabsList>
      {PHASES.map((entry) => (
        <TabsContent key={entry} value={entry} className="min-w-0 space-y-3">
          <PhaseFields item={item} phase={entry} fps={fps} onPatch={onPatch} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PhaseFields({ item, phase, fps, onPatch }: { item: VisualItem; phase: PickerPhase; fps: number; onPatch: Patch }) {
  const anim = animOf(item, phase);
  const preset = resolvePreset(anim?.kind, phase);
  const key = phase === "in" ? "animIn" : phase === "out" ? "animOut" : "animEmphasis";
  const update = (next: Partial<AnimEmphasis>, coalesce: string) =>
    onPatch({ [key]: { ...anim!, ...next } } as Partial<ClipItem>, coalesce);

  const frames = anim?.frames ?? 0;
  const suggested = preset && anim ? suggestedAnimFrames(item, anim.kind, phase, fps) : 0;
  const maxSeconds = Math.max(2, Math.min(item.duration / fps, 10), frames / fps);
  const inFrames = hasAnimation(item, "in") ? Math.min(item.animIn.frames, item.duration) : 0;

  return (
    <>
      <MotionField
        phase={phase}
        itemType={item.type}
        value={anim?.kind}
        onChange={(kind) => onPatch(pickPatch(item, phase, kind, fps) as Partial<ClipItem>, `anim-${phase}`)}
      />

      {anim && anim.kind !== "none" && !preset && (
        <p className="text-[11px] leading-4 text-muted-foreground">
          Cette animation n’existe pas dans cette version de Clip Studio&nbsp;: elle n’est pas jouée.
        </p>
      )}

      {anim && preset && (
        <>
          <RangeField
            label={phase === "emphasis" ? "Durée d’un passage" : "Durée"}
            value={frames / fps}
            min={0.1}
            max={maxSeconds}
            step={0.05}
            format={seconds}
            onChange={(value) => update({ frames: Math.max(1, Math.round(value * fps)) }, `anim-${phase}-d`)}
          />
          {suggested > 0 && Math.abs(suggested - frames) > 1 && (
            <button
              type="button"
              onClick={() => update({ frames: Math.min(suggested, Math.max(1, item.duration)) }, `anim-${phase}-d`)}
              className="block max-w-full truncate text-left text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Durée naturelle&nbsp;: {seconds(suggested / fps)}
            </button>
          )}

          {phase === "emphasis" && (
            <EmphasisFields
              emphasis={anim as AnimEmphasis}
              loops={preset.phase === "loop"}
              minStart={inFrames}
              itemFrames={item.duration}
              fps={fps}
              onChange={(next, coalesce) => update(next, coalesce)}
            />
          )}

          <MotionParamsFields
            preset={preset}
            values={anim.params}
            onChange={(params) => update({ params }, `anim-${phase}-p`)}
          />
        </>
      )}
    </>
  );
}

function EmphasisFields({
  emphasis,
  loops,
  minStart,
  itemFrames,
  fps,
  onChange,
}: {
  emphasis: AnimEmphasis;
  loops: boolean;
  minStart: number;
  itemFrames: number;
  fps: number;
  onChange: (next: Partial<AnimEmphasis>, coalesce: string) => void;
}) {
  const repeat = Math.max(0, Math.round(emphasis.repeat ?? 1));
  const start = Math.max(minStart, Math.round(Number(emphasis.at) || 0));
  return (
    <>
      <RangeField
        label="Début, depuis l’apparition"
        value={start / fps}
        min={minStart / fps}
        max={Math.max(minStart + 1, itemFrames - 1) / fps}
        step={0.05}
        format={seconds}
        onChange={(value) => onChange({ at: Math.max(minStart, Math.round(value * fps)) }, "anim-emphasis-at")}
      />
      <label className="flex min-w-0 items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">En boucle jusqu’à la sortie</span>
        <Switch
          checked={repeat === 0}
          onCheckedChange={(on) => onChange({ repeat: on ? 0 : loops ? 3 : 1 }, "anim-emphasis-r")}
        />
      </label>
      {repeat > 0 && (
        <RangeField
          label="Passages"
          value={repeat}
          min={1}
          max={10}
          step={1}
          format={(value) => String(value)}
          onChange={(value) => onChange({ repeat: Math.max(1, Math.round(value)) }, "anim-emphasis-r")}
        />
      )}
    </>
  );
}
