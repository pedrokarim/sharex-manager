"use client";

import { useEffect, useState } from "react";
import { Diamond, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { BoardPalette } from "../engine/board-palette";
import {
  bendStroke,
  boardShadow,
  createMark,
  DRAW_SECONDS,
  isEditableStroke,
  markColor,
  markWords,
  strokeBend,
  strokeDrawFrames,
  strokeHandles,
  withDrawFrames,
} from "../engine/illustrate";
import { keyFrames, keysByArrival, keySummary, removeKey, setKeyFrames } from "../engine/key-edit";
import { MAX_TEXT_MARKS, type ClipItem, type ShapeItem, type StrokePath, type TextItem, type TextMark, type VisualItem } from "../engine/types";
import { Choice, ColorField, Row, Section, Slider } from "./inspector-parts";

type Patch = (patch: Partial<ClipItem>, key: string) => void;

const seconds = (frames: number, fps: number) => `${(frames / fps).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s`;

// ─── Tracés ──────────────────────────────────────────────────────

const HEAD_OPTIONS = { none: "Aucune", end: "À l’arrivée", start: "Au départ", both: "Aux deux bouts" } as const;
type HeadOption = keyof typeof HEAD_OPTIONS;

/**
 * Tracé : couleur, épaisseur, pointes, courbure (trait à trois points) et
 * dessin progressif à partir du début de l'élément.
 */
export function StrokeFields({ item, fps, frame, size, onPatch }: { item: ShapeItem; fps: number; frame: number; size: { width: number; height: number }; onPatch: Patch }) {
  const stroke = item.stroke!;
  const minSide = Math.min(size.width, size.height);
  // Épaisseur montrée en pixels d'un cadre de 1080 de large, comme la grille de la planche.
  const widthPx = (stroke.width * minSide * 1080) / size.width;
  const head = (stroke.paths[0]?.head ?? "none") as HeadOption;
  const drawFrames = strokeDrawFrames(item);
  const setPaths = (paths: StrokePath[], key: string) => onPatch({ stroke: { ...stroke, paths } } as Partial<ClipItem>, key);
  const handles = strokeHandles(item, frame);
  return (
    <Section title="Tracé">
      <ColorField label="Couleur du trait" value={item.fill} onChange={(fill) => onPatch({ fill } as Partial<ClipItem>, "fill")} />
      <Slider
        label="Épaisseur"
        unit="px"
        min={1}
        max={40}
        step={1}
        value={Math.round(widthPx)}
        onChange={(value) => onPatch({ stroke: { ...stroke, width: (value * size.width) / 1080 / minSide } } as Partial<ClipItem>, "stroke-width")}
      />
      <Choice
        label="Pointe"
        value={head}
        options={HEAD_OPTIONS}
        onChange={(next) => setPaths(stroke.paths.map((path) => ({ ...path, head: next === "none" ? undefined : next })), "stroke-head")}
      />
      {isEditableStroke(item) && handles && (
        <Slider
          label="Courbure"
          unit="%"
          min={-50}
          max={50}
          step={1}
          value={Math.round(strokeBend(handles, size) * 100)}
          onChange={(value) => {
            const patch = bendStroke(item, frame, value / 100, size);
            if (patch) onPatch(patch as Partial<ClipItem>, "stroke-bend");
          }}
        />
      )}
      <Row label="Se dessine à son début">
        <Switch
          checked={drawFrames !== null}
          aria-label="Se dessine à son début"
          onCheckedChange={(on) => setPaths(withDrawFrames(stroke.paths, on ? Math.round(DRAW_SECONDS * fps) : null), "stroke-draw")}
        />
      </Row>
      {drawFrames !== null && (
        <Slider
          label="Durée du dessin"
          unit="s"
          min={0.1}
          max={3}
          step={0.05}
          value={drawFrames / fps}
          onChange={(value) => setPaths(withDrawFrames(stroke.paths, Math.max(1, Math.round(value * fps))), "stroke-draw-d")}
        />
      )}
    </Section>
  );
}

/** Ombre douce sous un aplat rectangulaire, celle des cartes de la planche. */
export function ShadowField({ item, palette, size, onPatch }: { item: ShapeItem; palette: BoardPalette; size: { width: number; height: number }; onPatch: Patch }) {
  return (
    <Row label="Ombre douce">
      <Switch
        checked={Boolean(item.shadow)}
        aria-label="Ombre douce"
        onCheckedChange={(on) => onPatch({ shadow: on ? boardShadow(palette, size) : undefined } as Partial<ClipItem>, "shadow")}
      />
    </Row>
  );
}

// ─── Compteur et unité ───────────────────────────────────────────

/**
 * Compteur (le premier nombre du texte défile jusqu'à sa valeur dès que le
 * texte entre) et unité dans un corps plus petit, collée au dernier mot.
 */
export function CounterFields({ item, fps, palette, onPatch }: { item: TextItem; fps: number; palette: BoardPalette; onPatch: Patch }) {
  const hasNumber = /\d/.test(item.text);
  const count = item.count;
  const singleLine = !item.text.includes("\n");
  if (!hasNumber && !item.tail && !count) return null;
  return (
    <Section title="Compteur">
      {hasNumber && (
        <Row label="Compter jusqu’au nombre">
          <Switch
            checked={Boolean(count)}
            aria-label="Compter jusqu’au nombre"
            onCheckedChange={(on) => onPatch({ count: on ? { from: 0, at: 0, frames: Math.round(1.1 * fps) } : undefined } as Partial<ClipItem>, "count")}
          />
        </Row>
      )}
      {count && (
        <>
          <Row label="Part de">
            <Input
              type="number"
              inputMode="decimal"
              value={String(count.from)}
              aria-label="Valeur de départ du compteur"
              className="h-7 w-24 text-right text-xs tabular-nums"
              onChange={(event) => {
                const from = Number(event.target.value);
                if (Number.isFinite(from)) onPatch({ count: { ...count, from } } as Partial<ClipItem>, "count-from");
              }}
            />
          </Row>
          <Slider label="Durée du défilement" unit="s" min={0.2} max={5} step={0.1} value={count.frames / fps} onChange={(value) => onPatch({ count: { ...count, frames: Math.max(1, Math.round(value * fps)) } } as Partial<ClipItem>, "count-frames")} />
        </>
      )}
      {singleLine && (
        <Row label="Unité">
          <Input
            value={item.tail?.text ?? ""}
            placeholder="vues, réels…"
            aria-label="Unité après le texte"
            className="h-7 w-32 text-xs"
            onChange={(event) => {
              const text = event.target.value;
              onPatch({ tail: text ? { text, scale: item.tail?.scale ?? 0.42, color: item.tail?.color ?? palette.accent } : undefined } as Partial<ClipItem>, "tail");
            }}
          />
        </Row>
      )}
      {item.tail && (
        <ColorField label="Couleur de l’unité" value={item.tail.color ?? item.style.color} onChange={(color) => onPatch({ tail: { ...item.tail!, color } } as Partial<ClipItem>, "tail-color")} />
      )}
    </Section>
  );
}

// ─── Marques sur les mots ────────────────────────────────────────

const MARK_LABELS: Record<TextMark["kind"], string> = {
  pill: "Pavé",
  underline: "Souligné",
  strike: "Barré",
  circle: "Entouré",
  color: "Couleur",
};

type Range = { from: number; to: number };

/** Nouvelle sélection de mots après un clic sur le mot `index`. */
export function nextWordRange(range: Range | null, index: number): Range | null {
  if (!range) return { from: index, to: index + 1 };
  if (index >= range.from && index < range.to) return range.to - range.from === 1 ? null : { from: index, to: index + 1 };
  return { from: Math.min(range.from, index), to: Math.max(range.to, index + 1) };
}

/**
 * Marques sur des mots du texte : on choisit les mots dans la bande, puis la
 * marque et son moment (dès l'apparition, ou tracée à un instant donné).
 */
export function MarksField({ item, fps, frame, palette, onPatch }: { item: TextItem; fps: number; frame: number; palette: BoardPalette; onPatch: Patch }) {
  const words = markWords(item.text);
  const [range, setRange] = useState<Range | null>(null);
  const [kind, setKind] = useState<TextMark["kind"]>("pill");
  const [timing, setTiming] = useState<"now" | "later">("now");
  const playheadOffset = Math.min(Math.max(0, frame - item.start), Math.max(0, item.duration - 1));
  const [offset, setOffset] = useState(playheadOffset);
  const [color, setColor] = useState<string | null>(null);
  // Un autre texte, ou d'autres mots : la sélection repart de zéro.
  useEffect(() => setRange(null), [item.id, item.text]);
  // Passer à « Plus tard » propose l'instant de la tête de lecture.
  useEffect(() => {
    if (timing === "later") setOffset(playheadOffset);
    // La tête de lecture ne déplace pas un réglage en cours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timing, item.id]);
  const marks = item.marks ?? [];
  const marked = (index: number) => marks.some((mark) => index >= (mark.from ?? 0) && index < (mark.to ?? words.length));
  const full = marks.length >= MAX_TEXT_MARKS;
  const shownColor = color ?? markColor(kind, palette);
  const addLabel = range ? `${MARK_LABELS[kind]} sur « ${words.slice(range.from, range.to).join(" ")} »` : "Choisissez un ou plusieurs mots";

  const add = () => {
    if (!range || full) return;
    const mark = createMark(kind, range, palette, fps, timing === "later" ? offset : undefined, shownColor);
    onPatch({ marks: [...marks, mark] } as Partial<ClipItem>, `mark-add-${marks.length}`);
    setRange(null);
  };

  return (
    <Section title="Marques sur les mots">
      {words.length === 0 ? (
        <p className="text-[11px] leading-4 text-muted-foreground">Écrivez d’abord le texte&nbsp;: ses mots s’affichent ici.</p>
      ) : (
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto" role="group" aria-label="Mots du texte">
          {words.map((word, index) => {
            const selected = range !== null && index >= range.from && index < range.to;
            return (
              <button
                key={`${index}-${word}`}
                type="button"
                aria-pressed={selected}
                onClick={() => setRange((current) => nextWordRange(current, index))}
                className={cn(
                  "max-w-full rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-4 break-all transition-colors",
                  selected ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  marked(index) && !selected && "underline decoration-primary/70 underline-offset-2"
                )}
              >
                {word}
              </button>
            );
          })}
        </div>
      )}
      <ToggleGroup type="single" variant="outline" size="sm" value={kind} onValueChange={(value) => value && setKind(value as TextMark["kind"])} className="grid w-full grid-cols-5" aria-label="Marque">
        {(Object.keys(MARK_LABELS) as TextMark["kind"][]).map((entry) => (
          <ToggleGroupItem key={entry} value={entry} className="h-7 min-w-0 px-0 text-[10px]">
            {MARK_LABELS[entry]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ColorField label="Couleur de la marque" value={shownColor} onChange={setColor} />
      <ToggleGroup type="single" variant="outline" size="sm" value={timing} onValueChange={(value) => value && setTiming(value as "now" | "later")} className="grid w-full grid-cols-2" aria-label="Moment de la marque">
        <ToggleGroupItem value="now" className="h-7 min-w-0 text-[11px]">
          Tout de suite
        </ToggleGroupItem>
        <ToggleGroupItem value="later" className="h-7 min-w-0 text-[11px]">
          Au mot
        </ToggleGroupItem>
      </ToggleGroup>
      {timing === "later" && (
        <Slider label="Après le début du texte" unit="s" min={0} max={Math.max(0.1, (item.duration - 1) / fps)} step={0.05} value={offset / fps} onChange={(value) => setOffset(Math.round(value * fps))} />
      )}
      {/* Le libellé redit les mots choisis ; trop long, il se coupe et se lit en entier au survol. */}
      <Button variant="outline" size="sm" className="w-full min-w-0" disabled={!range || full} onClick={add} title={addLabel}>
        <span className="min-w-0 truncate">{addLabel}</span>
      </Button>
      {full && <p className="text-[11px] leading-4 text-muted-foreground">{MAX_TEXT_MARKS} marques au plus sur un texte.</p>}
      {marks.length > 0 && (
        <ul className="divide-y rounded-none" aria-label="Marques du texte">
          {marks.map((mark, index) => (
            <li key={index} className="flex min-w-0 items-center gap-2 py-1.5">
              <span className="size-3 shrink-0 rounded-full border" style={{ background: mark.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs" title={words.slice(mark.from ?? 0, mark.to ?? words.length).join(" ")}>
                {MARK_LABELS[mark.kind]} · {words.slice(mark.from ?? 0, mark.to ?? words.length).join(" ") || "tout le texte"}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{mark.at === undefined ? "dès l’entrée" : seconds(mark.at, fps)}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                aria-label={`Retirer la marque ${MARK_LABELS[mark.kind].toLowerCase()}`}
                onClick={() => onPatch({ marks: marks.length > 1 ? marks.filter((_, rank) => rank !== index) : undefined } as Partial<ClipItem>, `mark-remove-${index}`)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── Images clés ─────────────────────────────────────────────────

/**
 * Images clés de l'élément, dans l'ordre de leur arrivée : l'instant (un
 * clic y place la tête de lecture), ce qu'elles font bouger, la durée du
 * mouvement, et de quoi les retirer.
 */
export function KeysField({ item, fps, animate, onPatch, onSeek }: { item: VisualItem; fps: number; animate: boolean; onPatch: Patch; onSeek: (frame: number) => void }) {
  const entries = keysByArrival(item);
  return (
    <Section title="Mouvement">
      {entries.length === 0 ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {animate
            ? "Placez la tête de lecture plus loin, puis déplacez ou redimensionnez l’élément sur l’aperçu : une image clé s’y pose."
            : "Activez « Animer » au-dessus de l’aperçu pour poser des images clés en déplaçant l’élément."}
        </p>
      ) : (
        <ul className="divide-y" aria-label="Images clés">
          {entries.map(({ key, index, arrival }) => (
            <li key={index} className="space-y-1 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 gap-1.5 px-1.5 font-mono text-[11px] tabular-nums"
                  onClick={() => onSeek(item.start + arrival)}
                  title="Placer la tête de lecture sur cette image clé"
                >
                  <Diamond className="size-3 fill-current" aria-hidden />
                  {seconds(arrival, fps)}
                </Button>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={keySummary(key)}>
                  {keySummary(key)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={`Retirer l’image clé à ${seconds(arrival, fps)}`}
                  onClick={() => onPatch({ keys: removeKey(item.keys, index) } as Partial<ClipItem>, `key-remove-${index}`)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Slider
                label="Durée du mouvement"
                unit="s"
                min={0.05}
                max={Math.max(0.1, Math.min(3, arrival / fps))}
                step={0.05}
                value={keyFrames(key) / fps}
                onChange={(value) => onPatch({ keys: setKeyFrames(item.keys!, index, Math.max(1, Math.round(value * fps))) } as Partial<ClipItem>, `key-frames-${index}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
