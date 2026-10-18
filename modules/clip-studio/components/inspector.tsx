"use client";

import { useState } from "react";
import Link from "next/link";
import { AlignCenter, AlignLeft, AlignRight, AudioLines, Check, FlipHorizontal2, Mic, Palette, X } from "lucide-react";
import { FormStatus, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TEXT_PRESETS, videoSpeedPatch } from "../engine/edit";
import { DEFAULT_DUCK, DUCK_DB_MAX, DUCK_DB_MIN, canDuck, decibelsToDuck, duckToDecibels, voiceWindows } from "../engine/mix";
import { isVoiceItem } from "../engine/revoice";
import { MAX_SPEED, MIN_SPEED, speedOf } from "../engine/timeline";
import type {
  AudioItem,
  ClipItem,
  ClipProject,
  ImageItem,
  ShapeItem,
  TextItem,
  TextStyle,
  VideoItem,
  VisualItem,
} from "../engine/types";
import { FONTS } from "../lib/fonts";
import type { BrandFontChoice, BrandKitChoice } from "../lib/client";
import { cameraPatch, transitionPatch } from "../lib/scene-catalog";
import { AnimationFields } from "./motion-fields";
import { SceneField } from "./scene-picker";

interface InspectorProps {
  project: ClipProject;
  item: ClipItem;
  /** `key` regroupe les réglages successifs d'un même champ en une étape d'annulation. */
  onPatch: (patch: Partial<ClipItem>, key: string) => void;
  onClose: () => void;
  /** Ajoute les sous-titres animés d'une voix. */
  onCaption?: (itemId: string) => void;
  /** Polices importées de la marque du projet, proposées après celles du catalogue. */
  brandFonts?: BrandFontChoice[];
  /** Relit tous les extraits de la piste de cette voix avec une autre voix. */
  onChangeTrackVoice?: (trackId: string) => void;
  /**
   * Règle le creux sous la voix de toute la piste du son (`undefined` le
   * retire). Absent : seul le son sélectionné change.
   */
  onSetTrackDuck?: (trackId: string, duck: number | undefined, key: string) => void;
}

export function Inspector({ project, item, onPatch, onClose, onCaption, brandFonts = [], onChangeTrackVoice, onSetTrackDuck }: InspectorProps) {
  const fps = project.fps;
  const track = project.tracks.find((entry) => entry.items.some((other) => other.id === item.id));
  const title =
    item.type === "text" ? "Texte" : item.type === "image" ? "Image" : item.type === "video" ? "Vidéo" : item.type === "shape" ? "Forme" : "Son";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">{title}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fermer l'inspecteur">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {item.type === "text" && <TextFields item={item} onPatch={onPatch} brandFonts={brandFonts} />}
        {item.type === "image" && <ImageFields item={item} onPatch={onPatch} />}
        {item.type === "video" && <VideoFields item={item} project={project} onPatch={onPatch} />}
        {item.type === "shape" && <ShapeFields item={item} onPatch={onPatch} />}
        {item.type === "audio" && <AudioFields item={item} fps={fps} onPatch={onPatch} />}
        {track && canDuck(item, track.name) && (
          <DuckField
            duck={item.duck}
            trackName={track.name}
            shared={track.items.filter((other) => canDuck(other, track.name)).length > 1}
            hasVoice={voiceWindows(project).length > 0}
            onChange={(duck, key) => (onSetTrackDuck ? onSetTrackDuck(track.id, duck, key) : onPatch({ duck } as Partial<ClipItem>, key))}
          />
        )}
        {item.type === "audio" &&
        item.source.words?.length &&
        !project.tracks.some((track) => track.items.some((other) => other.type === "text" && other.karaoke?.voiceId === item.id)) ? (
          <Section title="Sous-titres">
            <p className="text-xs text-muted-foreground">
              Le texte de cette voix peut s&apos;afficher mot à mot, calé sur la lecture.
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => onCaption?.(item.id)}>
              Ajouter les sous-titres animés
            </Button>
          </Section>
        ) : null}
        {item.type === "text" && item.karaoke && <KaraokeFields item={item} onPatch={onPatch} />}
        {onChangeTrackVoice && isVoiceItem(item) && (
          <Section title="Voix">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => {
                const track = project.tracks.find((entry) => entry.items.some((other) => other.id === item.id));
                if (track) onChangeTrackVoice(track.id);
              }}
            >
              <Mic className="h-4 w-4" />
              Changer la voix de la piste…
            </Button>
          </Section>
        )}

        <Section title="Temps">
          <Slider
            label="Début"
            unit="s"
            min={0}
            max={Math.max(60, (item.start + item.duration) / fps + 10)}
            step={0.1}
            value={item.start / fps}
            onChange={(value) => onPatch({ start: Math.round(value * fps) }, "start")}
          />
          <Slider
            label="Durée"
            unit="s"
            min={0.2}
            max={Math.max(20, (item.duration / fps) * 2)}
            step={0.1}
            value={item.duration / fps}
            onChange={(value) => onPatch({ duration: Math.max(1, Math.round(value * fps)) }, "duration")}
          />
        </Section>

        {item.type !== "audio" && <VisualFields item={item} fps={fps} onPatch={onPatch} />}
      </div>
    </div>
  );
}

// ─── Blocs communs ───────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="min-w-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {Number(value.toFixed(step < 1 ? 2 : 0)).toLocaleString("fr-FR")}
          {unit ? ` ${unit}` : ""}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return (
    <Row label={label}>
      <input
        type="color"
        value={hex}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-10 cursor-pointer rounded border bg-transparent"
        aria-label={label}
      />
    </Row>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <Row label={label}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger size="sm" className="w-48 max-w-full px-2 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(options) as T[]).map((key) => (
            <SelectItem key={key} value={key} className="text-xs">
              {options[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );
}

/** Libellé au-dessus d'un champ qui prend toute la largeur (sélecteur à vignette). */
function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Mouvement de caméra d'une image ou d'une vidéo, choisi dans tout le catalogue du moteur. */
function CameraField({ item, onPatch }: { item: ImageItem | VideoItem; onPatch: InspectorProps["onPatch"] }) {
  return (
    <FieldLabel label="Mouvement de caméra">
      <SceneField
        kind="camera"
        value={item.motion ?? "none"}
        onChange={(id) => onPatch(cameraPatch(item.type, id) as Partial<ClipItem>, "motion")}
      />
    </FieldLabel>
  );
}

// ─── Réglages visuels ────────────────────────────────────────────

function VisualFields({
  item,
  fps,
  onPatch,
}: {
  item: VisualItem;
  fps: number;
  onPatch: InspectorProps["onPatch"];
}) {
  const t = item.transform;
  const setTransform = (patch: Partial<VisualItem["transform"]>, key: string) =>
    onPatch({ transform: { ...t, ...patch } } as Partial<ClipItem>, key);

  return (
    <>
      <Section title="Disposition">
        <Slider label="Opacité" min={0} max={1} step={0.01} value={t.opacity} onChange={(value) => setTransform({ opacity: value }, "opacity")} />
        <Slider label="Rotation" unit="°" min={-180} max={180} step={1} value={t.rotation} onChange={(value) => setTransform({ rotation: value }, "rotation")} />
        <Slider label="Largeur" unit="%" min={2} max={200} step={1} value={t.width * 100} onChange={(value) => setTransform({ width: value / 100 }, "width")} />
        <Slider label="Hauteur" unit="%" min={2} max={200} step={1} value={t.height * 100} onChange={(value) => setTransform({ height: value / 100 }, "height")} />
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: "Plein cadre", patch: { x: 0.5, y: 0.5, width: 1, height: 1 } },
            { label: "Centrer", patch: { x: 0.5, y: 0.5 } },
            { label: "En bas", patch: { y: 0.82 } },
          ].map((preset) => (
            <Button key={preset.label} variant="outline" size="sm" className="h-7 px-1 text-[11px]" onClick={() => setTransform(preset.patch, "layout-preset")}>
              {preset.label}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Transition">
        <FieldLabel label="Depuis le plan précédent">
          <SceneField
            kind="transition"
            value={item.transition?.kind ?? "none"}
            onChange={(kind) => onPatch(transitionPatch(item, kind, fps) as Partial<ClipItem>, "transition")}
          />
        </FieldLabel>
        {item.transition && (
          <Slider label="Durée" unit="s" min={0.2} max={2} step={0.1} value={item.transition.frames / fps}
            onChange={(value) => onPatch({ transition: { ...item.transition!, frames: Math.max(1, Math.round(value * fps)) } } as Partial<ClipItem>, "transition-d")} />
        )}
      </Section>

      <Section title="Animations">
        <AnimationFields item={item} fps={fps} onPatch={onPatch} />
      </Section>
    </>
  );
}

// ─── Par type ────────────────────────────────────────────────────

function TextFields({
  item,
  onPatch,
  brandFonts,
}: {
  item: TextItem;
  onPatch: InspectorProps["onPatch"];
  brandFonts: BrandFontChoice[];
}) {
  const style = item.style;
  const setStyle = (patch: Partial<TextStyle>, key: string) =>
    onPatch({ style: { ...style, ...patch } } as Partial<ClipItem>, key);
  // Une police de marque est un seul fichier, valable pour toutes les graisses : pas de choix de graisse.
  const catalogFont = FONTS.find((entry) => entry.family === style.font);
  const fontOptions: Record<string, string> = {
    ...Object.fromEntries(FONTS.map((entry) => [entry.family, entry.label])),
    ...Object.fromEntries(brandFonts.map((entry) => [entry.family, `${entry.label} · marque`])),
  };
  // Police d'une marque retirée, d'une autre marque ou pas encore listée : elle reste affichée, pour ne pas paraître vide.
  if (!(style.font in fontOptions)) fontOptions[style.font] = style.font.startsWith("bk-") ? "Police de marque" : style.font;

  return (
    <>
      <Section title="Contenu">
        <Textarea
          value={item.text}
          onChange={(event) => onPatch({ text: event.target.value } as Partial<ClipItem>, "text")}
          rows={3}
          className="resize-none text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {TEXT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPatch({ style: structuredClone(preset.style) } as Partial<ClipItem>, "preset")}
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Typographie">
        <Choice
          label="Police"
          value={style.font}
          options={fontOptions}
          onChange={(family) => {
            const next = FONTS.find((entry) => entry.family === family);
            if (!next) {
              setStyle({ font: family }, "font");
              return;
            }
            setStyle({ font: family, weight: next.weights.includes(style.weight) ? style.weight : next.weights.at(-1)! }, "font");
          }}
        />
        {catalogFont && catalogFont.weights.length > 1 && (
          <Choice
            label="Graisse"
            value={String(style.weight)}
            options={Object.fromEntries(catalogFont.weights.map((weight) => [String(weight), String(weight)]))}
            onChange={(weight) => setStyle({ weight: Number(weight) }, "weight")}
          />
        )}
        <Slider label="Taille" min={1} max={20} step={0.1} value={style.size * 100} onChange={(value) => setStyle({ size: value / 100 }, "size")} />
        <Row label="Alignement">
          {(["left", "center", "right"] as const).map((align) => {
            const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
            return (
              <button
                key={align}
                type="button"
                onClick={() => setStyle({ align }, "align")}
                className={cn("flex h-7 w-7 items-center justify-center rounded border", style.align === align ? "border-primary bg-primary/10" : "text-muted-foreground")}
                aria-label={align}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </Row>
        <Row label="Majuscules">
          <Switch checked={style.uppercase} onCheckedChange={(uppercase) => setStyle({ uppercase }, "uppercase")} />
        </Row>
        <ColorField label="Couleur" value={style.color} onChange={(color) => setStyle({ color }, "color")} />
      </Section>

      <Section title="Contour et fond">
        <Row label="Contour">
          <Switch
            checked={Boolean(style.stroke)}
            onCheckedChange={(on) => setStyle({ stroke: on ? { color: "#000000", width: 0.08 } : null }, "stroke")}
          />
        </Row>
        {style.stroke && (
          <>
            <ColorField label="Couleur du contour" value={style.stroke.color} onChange={(color) => setStyle({ stroke: { ...style.stroke!, color } }, "stroke-color")} />
            <Slider label="Épaisseur" min={1} max={20} step={1} value={style.stroke.width * 100} onChange={(value) => setStyle({ stroke: { ...style.stroke!, width: value / 100 } }, "stroke-width")} />
          </>
        )}
        <Row label="Fond">
          <Switch
            checked={Boolean(style.background)}
            onCheckedChange={(on) => setStyle({ background: on ? { color: "#ffffff", padding: 0.35, radius: 0.3 } : null }, "bg")}
          />
        </Row>
        {style.background && (
          <ColorField label="Couleur du fond" value={style.background.color} onChange={(color) => setStyle({ background: { ...style.background!, color } }, "bg-color")} />
        )}
        <Row label="Ombre">
          <Switch
            checked={Boolean(style.shadow)}
            onCheckedChange={(on) => setStyle({ shadow: on ? { color: "rgba(0,0,0,0.55)", blur: 0.25, offsetY: 0.06 } : null }, "shadow")}
          />
        </Row>
      </Section>
    </>
  );
}

function ImageFields({ item, onPatch }: { item: ImageItem; onPatch: InspectorProps["onPatch"] }) {
  return (
    <Section title="Image">
      <Choice label="Cadrage" value={item.fit} options={{ cover: "Remplir", contain: "Contenir" }} onChange={(fit) => onPatch({ fit } as Partial<ClipItem>, "fit")} />
      <CameraField item={item} onPatch={onPatch} />
      <Slider label="Coins arrondis" min={0} max={200} step={1} value={item.radius} onChange={(radius) => onPatch({ radius } as Partial<ClipItem>, "radius")} />
      <MirrorField flipped={Boolean(item.flipX)} onChange={(flipX) => onPatch({ flipX: flipX || undefined } as Partial<ClipItem>, "flip")} />
    </Section>
  );
}

/**
 * Miroir d'une image (une pose de la mascotte tournée vers le contenu…) :
 * l'image se retourne dans son cadre, à l'aperçu comme à l'export
 * (`drawFrame`, le même dessin pour les deux).
 */
export function MirrorField({ flipped, onChange }: { flipped: boolean; onChange: (flipped: boolean) => void }) {
  return (
    <Row label="Miroir">
      <Toggle
        variant="outline"
        size="sm"
        pressed={flipped}
        onPressedChange={onChange}
        title="Retourne l’image de gauche à droite, dans son cadre"
        className="h-7 gap-1.5 px-2 text-[11px] data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
      >
        <FlipHorizontal2 className="size-3.5" />
        Retourner
      </Toggle>
    </Row>
  );
}

/**
 * Creux sous la voix d'une musique (`engine/mix.ts`) : le son baisse pendant
 * qu'une voix off parle, puis remonte entre les répliques. La profondeur se
 * règle en dB sous le volume du son.
 */
export function DuckField({
  duck,
  trackName,
  shared,
  hasVoice,
  onChange,
}: {
  duck: number | undefined;
  trackName: string;
  /** La piste porte d'autres sons, réglés en même temps. */
  shared: boolean;
  hasVoice: boolean;
  onChange: (duck: number | undefined, key: string) => void;
}) {
  const on = duck !== undefined;
  const depth = on ? duckToDecibels(duck) : duckToDecibels(DEFAULT_DUCK);
  return (
    <Section title="Creux sous la voix">
      <Row label="Baisser ce son quand la voix parle">
        <Switch checked={on} onCheckedChange={(next) => onChange(next ? DEFAULT_DUCK : undefined, "duck")} aria-label="Creux sous la voix" />
      </Row>
      {on && (
        <>
          <Slider label="Profondeur" unit="dB" min={DUCK_DB_MIN} max={DUCK_DB_MAX} step={1} value={depth} onChange={(value) => onChange(decibelsToDuck(value), "duck-depth")} />
          <p className="flex gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <AudioLines aria-hidden className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0">
              Le son descend de {Math.round(depth).toLocaleString("fr-FR")}&nbsp;dB pendant que la voix parle, puis remonte entre les répliques.
            </span>
          </p>
          {!hasVoice && (
            <p className="text-[11px] leading-4 text-muted-foreground">
              Aucune voix off dans ce projet pour l’instant&nbsp;: le creux s’entendra dès qu’il y en aura une.
            </p>
          )}
        </>
      )}
      {shared && (
        <p className="text-[11px] leading-4 break-words text-muted-foreground">
          Réglé pour tous les sons de la piste «&nbsp;{trackName}&nbsp;».
        </p>
      )}
    </Section>
  );
}

function VideoFields({ item, project, onPatch }: { item: VideoItem; project: ClipProject; onPatch: InspectorProps["onPatch"] }) {
  const setSpeed = (speed: number) => {
    const patch = videoSpeedPatch(project, item.id, speed);
    if (patch) onPatch(patch as Partial<ClipItem>, "speed");
  };
  return (
    <Section title="Vidéo">
      <Choice label="Cadrage" value={item.fit} options={{ cover: "Remplir", contain: "Contenir" }} onChange={(fit) => onPatch({ fit } as Partial<ClipItem>, "fit")} />
      <CameraField item={item} onPatch={onPatch} />
      <Slider label="Vitesse" unit="×" min={MIN_SPEED} max={MAX_SPEED} step={0.05} value={speedOf(item)} onChange={setSpeed} />
      <div className="grid grid-cols-5 gap-1">
        {[0.5, 1, 1.5, 2, 3].map((speed) => (
          <Button
            key={speed}
            variant={speedOf(item) === speed ? "secondary" : "outline"}
            size="sm"
            className="h-7 px-1 text-[11px] tabular-nums"
            onClick={() => setSpeed(speed)}
          >
            ×{String(speed).replace(".", ",")}
          </Button>
        ))}
      </div>
      <Slider label="Volume" unit="%" min={0} max={200} step={1} value={item.volume * 100} onChange={(value) => onPatch({ volume: value / 100 } as Partial<ClipItem>, "volume")} />
      <Slider label="Coins arrondis" min={0} max={200} step={1} value={item.radius} onChange={(radius) => onPatch({ radius } as Partial<ClipItem>, "radius")} />
    </Section>
  );
}

function ShapeFields({ item, onPatch }: { item: ShapeItem; onPatch: InspectorProps["onPatch"] }) {
  return (
    <Section title="Forme">
      <ColorField label="Remplissage" value={item.fill} onChange={(fill) => onPatch({ fill } as Partial<ClipItem>, "fill")} />
      {item.shape !== "ellipse" && (
        <Slider label="Arrondi" unit="%" min={0} max={50} step={1} value={item.radius * 100} onChange={(value) => onPatch({ radius: value / 100 } as Partial<ClipItem>, "radius")} />
      )}
      {item.shape === "progress" && item.progress && (
        <Row label="Se vide au lieu de se remplir">
          <Switch
            checked={item.progress.reverse}
            onCheckedChange={(reverse) => onPatch({ progress: { ...item.progress!, reverse } } as Partial<ClipItem>, "reverse")}
          />
        </Row>
      )}
    </Section>
  );
}

function KaraokeFields({ item, onPatch }: { item: TextItem; onPatch: InspectorProps["onPatch"] }) {
  const karaoke = item.karaoke!;
  const set = (patch: Partial<typeof karaoke>, key: string) => onPatch({ karaoke: { ...karaoke, ...patch } } as Partial<ClipItem>, key);
  return (
    <Section title="Sous-titres animés">
      <ColorField label="Mot prononcé" value={karaoke.highlight} onChange={(highlight) => set({ highlight }, "karaoke-color")} />
      <Slider label="Mots à la fois" min={1} max={8} step={1} value={karaoke.groupSize} onChange={(groupSize) => set({ groupSize }, "karaoke-group")} />
      <p className="text-[11px] leading-4 text-muted-foreground">
        Le texte suit la voix : pour le corriger, modifiez la voix et régénérez-la.
      </p>
    </Section>
  );
}

function AudioFields({ item, fps, onPatch }: { item: AudioItem; fps: number; onPatch: InspectorProps["onPatch"] }) {
  return (
    <Section title="Son">
      <Slider label="Volume" unit="%" min={0} max={200} step={1} value={item.volume * 100} onChange={(value) => onPatch({ volume: value / 100 } as Partial<ClipItem>, "volume")} />
      <Slider label="Fondu d'entrée" unit="s" min={0} max={5} step={0.1} value={item.fadeIn / fps} onChange={(value) => onPatch({ fadeIn: Math.round(value * fps) } as Partial<ClipItem>, "fade-in")} />
      <Slider label="Fondu de sortie" unit="s" min={0} max={5} step={0.1} value={item.fadeOut / fps} onChange={(value) => onPatch({ fadeOut: Math.round(value * fps) } as Partial<ClipItem>, "fade-out")} />
    </Section>
  );
}

// ─── Sans sélection : le projet ──────────────────────────────────

/** Logo de la marque, s'il y en a un, et pastilles de sa palette. */
export function BrandKitMark({ kit }: { kit: Pick<BrandKitChoice, "logoUrl" | "palette"> }) {
  const { background, accent, accentSecondary, extras } = kit.palette;
  const swatches = [background, accent, ...(accentSecondary ? [accentSecondary] : []), ...extras].slice(0, 4);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {kit.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={kit.logoUrl} alt="" loading="lazy" className="h-5 w-5 rounded object-contain" />
      )}
      <span className="flex -space-x-1">
        {swatches.map((color, index) => (
          <span key={`${color}-${index}`} className="h-3 w-3 rounded-full ring-1 ring-background" style={{ background: color }} />
        ))}
      </span>
    </span>
  );
}

/**
 * Inspecteur quand rien n'est sélectionné : l'image de marque du projet.
 * L'application passe par l'historique de l'éditeur (`onApplyBrand`) : une
 * annulation la défait.
 */
export function ProjectInspector({
  project,
  kits,
  onApplyBrand,
}: {
  project: ClipProject;
  kits: BrandKitChoice[];
  /** Applique une marque, ou la retire (`null`). */
  onApplyBrand: (kitId: string | null) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  // L'échec s'affiche sous la liste des marques, là où le geste a eu lieu.
  const feedback = useFeedback();
  const current = project.brandKitId;
  const known = kits.some((kit) => kit.id === current);

  const apply = async (kitId: string | null) => {
    setPending(kitId ?? "none");
    feedback.clear();
    try {
      await onApplyBrand(kitId);
    } catch (error: any) {
      feedback.error(error?.message ?? "Image de marque impossible à appliquer");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center border-b px-3">
        <span className="text-sm font-semibold">Projet</span>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        <Section title="Image de marque">
          {kits.length === 0 && !current ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Aucune image de marque pour l’instant.{" "}
              <Link href="/m/brand-kit" className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline">
                <Palette className="h-3.5 w-3.5" />
                En créer une
              </Link>
            </p>
          ) : (
            <>
              <p className="text-[11px] leading-4 text-muted-foreground">
                Couleurs, polices, filigrane et carton de fin suivent la marque. Ctrl Z annule.
              </p>
              <div className="space-y-1">
                {kits.map((kit) => {
                  const active = kit.id === current;
                  return (
                    <button
                      key={kit.id}
                      type="button"
                      disabled={pending !== null}
                      onClick={() => !active && void apply(kit.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-default",
                        active ? "border-primary bg-primary/10" : "hover:bg-muted"
                      )}
                    >
                      <BrandKitMark kit={kit} />
                      <span className="min-w-0 flex-1 truncate" title={kit.name}>
                        {kit.name}
                      </span>
                      {pending === kit.id ? (
                        <Spinner className="size-3.5 text-muted-foreground" />
                      ) : (
                        active && <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
              {current && !known && (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  La marque de ce projet est introuvable&nbsp;: elle a peut-être été supprimée.
                </p>
              )}
              {current && (
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-[11px]"
                    loading={pending === current}
                    disabled={!known || pending !== null}
                    onClick={() => void apply(current)}
                    title="Reprend les dernières modifications de la marque"
                  >
                    Actualiser
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-[11px]"
                    loading={pending === "none"}
                    disabled={pending !== null}
                    onClick={() => void apply(null)}
                  >
                    Retirer
                  </Button>
                </div>
              )}
              <FormStatus state={feedback.state} />
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
