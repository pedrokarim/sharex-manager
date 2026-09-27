"use client";

import { AlignCenter, AlignLeft, AlignRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TEXT_PRESETS, videoSpeedPatch } from "../engine/edit";
import { MAX_SPEED, MIN_SPEED, speedOf } from "../engine/timeline";
import type {
  AnimKind,
  AudioItem,
  ClipItem,
  ClipProject,
  ImageItem,
  Motion,
  ShapeItem,
  TextItem,
  TextStyle,
  TransitionKind,
  VideoItem,
  VisualItem,
} from "../engine/types";
import { FONTS } from "../lib/fonts";
import { ANIM_LABELS, DEFAULT_TRANSITION_SECONDS, MOTION_LABELS, TRANSITION_LABELS } from "./timeline";

interface InspectorProps {
  project: ClipProject;
  item: ClipItem;
  /** `key` regroupe les réglages successifs d'un même champ en une étape d'annulation. */
  onPatch: (patch: Partial<ClipItem>, key: string) => void;
  onClose: () => void;
  /** Ajoute les sous-titres animés d'une voix. */
  onCaption?: (itemId: string) => void;
}

export function Inspector({ project, item, onPatch, onClose, onCaption }: InspectorProps) {
  const fps = project.fps;
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
        {item.type === "text" && <TextFields item={item} onPatch={onPatch} />}
        {item.type === "image" && <ImageFields item={item} onPatch={onPatch} />}
        {item.type === "video" && <VideoFields item={item} project={project} onPatch={onPatch} />}
        {item.type === "shape" && <ShapeFields item={item} onPatch={onPatch} />}
        {item.type === "audio" && <AudioFields item={item} fps={fps} onPatch={onPatch} />}
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
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
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
        <SelectTrigger size="sm" className="w-40 text-xs">
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
        <Choice
          label="Depuis le plan précédent"
          value={item.transition?.kind ?? "none"}
          options={TRANSITION_LABELS}
          onChange={(kind: TransitionKind | "none") =>
            onPatch(
              {
                transition:
                  kind === "none"
                    ? undefined
                    : { kind, frames: item.transition?.frames ?? Math.round(DEFAULT_TRANSITION_SECONDS * fps) },
              } as Partial<ClipItem>,
              "transition"
            )
          }
        />
        {item.transition && (
          <Slider label="Durée" unit="s" min={0.2} max={2} step={0.1} value={item.transition.frames / fps}
            onChange={(value) => onPatch({ transition: { ...item.transition!, frames: Math.max(1, Math.round(value * fps)) } } as Partial<ClipItem>, "transition-d")} />
        )}
      </Section>

      <Section title="Animations">
        <Choice
          label="Entrée"
          value={item.animIn.kind}
          options={ANIM_LABELS}
          onChange={(kind: AnimKind) => onPatch({ animIn: { ...item.animIn, kind } } as Partial<ClipItem>, "anim-in")}
        />
        {item.animIn.kind !== "none" && (
          <Slider label="Durée d'entrée" unit="s" min={0.1} max={2} step={0.05} value={item.animIn.frames / fps}
            onChange={(value) => onPatch({ animIn: { ...item.animIn, frames: Math.max(1, Math.round(value * fps)) } } as Partial<ClipItem>, "anim-in-d")} />
        )}
        <Choice
          label="Sortie"
          value={item.animOut.kind}
          options={ANIM_LABELS}
          onChange={(kind: AnimKind) => onPatch({ animOut: { ...item.animOut, kind } } as Partial<ClipItem>, "anim-out")}
        />
        {item.animOut.kind !== "none" && (
          <Slider label="Durée de sortie" unit="s" min={0.1} max={2} step={0.05} value={item.animOut.frames / fps}
            onChange={(value) => onPatch({ animOut: { ...item.animOut, frames: Math.max(1, Math.round(value * fps)) } } as Partial<ClipItem>, "anim-out-d")} />
        )}
      </Section>
    </>
  );
}

// ─── Par type ────────────────────────────────────────────────────

function TextFields({ item, onPatch }: { item: TextItem; onPatch: InspectorProps["onPatch"] }) {
  const style = item.style;
  const setStyle = (patch: Partial<TextStyle>, key: string) =>
    onPatch({ style: { ...style, ...patch } } as Partial<ClipItem>, key);
  const font = FONTS.find((entry) => entry.family === style.font) ?? FONTS[0];

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
          options={Object.fromEntries(FONTS.map((entry) => [entry.family, entry.label]))}
          onChange={(family) => {
            const next = FONTS.find((entry) => entry.family === family) ?? FONTS[0];
            setStyle({ font: family, weight: next.weights.includes(style.weight) ? style.weight : next.weights.at(-1)! }, "font");
          }}
        />
        {font.weights.length > 1 && (
          <Choice
            label="Graisse"
            value={String(style.weight)}
            options={Object.fromEntries(font.weights.map((weight) => [String(weight), String(weight)]))}
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
      <Choice label="Mouvement" value={item.motion} options={MOTION_LABELS} onChange={(motion: Motion) => onPatch({ motion } as Partial<ClipItem>, "motion")} />
      <Slider label="Coins arrondis" min={0} max={200} step={1} value={item.radius} onChange={(radius) => onPatch({ radius } as Partial<ClipItem>, "radius")} />
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
