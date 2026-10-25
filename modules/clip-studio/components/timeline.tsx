"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AudioLines,
  Copy,
  Diamond,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Link2,
  Lock,
  Mic,
  Minus,
  Pause,
  Play,
  Plus,
  Scissors,
  Shapes,
  Trash2,
  Type,
  Unlink2,
  Unlock,
  Volume1,
  Volume2,
  VolumeOff,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { canMoveItem, linkedItem } from "../engine/edit";
import { formatTimecode, projectDuration } from "../engine/timeline";
import { Waveform } from "./waveform";
import { MotionPickerDialog, useMotionFavorites } from "./motion-picker";
import { MotionSubmenu } from "./motion-menu";
import { pickPatch, presetLabel, resolvePreset, type PickerPhase } from "../lib/motion-catalog";
import {
  acceptsShotEffects,
  addShotEffect,
  cameraPatch,
  removeShotEffect,
  shotEffectFrames,
  transitionLabel,
  transitionPatch,
  updateShotEffect,
} from "../lib/scene-catalog";
import { ScenePickerDialog, SceneSubmenu, useSceneFavorites } from "./scene-picker";
import { ShotFxMarker } from "./scene-fx";
import type { ClipItem, ClipProject, ShotEffect, Track, VisualItem } from "../engine/types";
import { isVoiceItem } from "../engine/revoice";
import { keyFrames, keysByArrival, keySummary, moveKeyTo, removeKey } from "../engine/key-edit";

export const MEDIA_DRAG_TYPE = "application/x-clip-media";

const HEADER_WIDTH = 148;
const RULER_HEIGHT = 28;
const ROW_HEIGHT: Record<Track["kind"], number> = { visual: 52, audio: 40 };
/** Distance d'aimantation, en pixels à l'écran. */
const SNAP_PX = 8;

/**
 * Transitions, mouvements de caméra et effets de plan : le catalogue complet
 * du moteur, rangé par catégorie (`lib/scene-catalog.ts`), proposé au clic
 * droit et dans l'inspecteur (`components/scene-picker.tsx`).
 */

/** Ce que la fenêtre du catalogue ouverte depuis la timeline va modifier. */
type SceneTarget =
  | { kind: "transition" | "camera"; itemId: string }
  | { kind: "shotfx"; trackId: string; frame: number };

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
  /** `key` regroupe les réglages successifs (curseur d'un effet de plan) en une étape d'annulation. */
  onTrackPatch: (trackId: string, patch: Partial<Track>, key?: string) => void;
  onDropMedia: (payload: string, trackId: string, frame: number) => void;
  /** Relit tous les extraits d'une piste de voix avec une autre voix. */
  onChangeTrackVoice?: (trackId: string) => void;
  /** Détache le son d'une vidéo sur une piste audio. */
  onDetachAudio?: (videoId: string) => void;
  /** Rattache un son détaché à sa vidéo (depuis l'un ou l'autre). */
  onReattachAudio?: (itemId: string) => void;
}

type Drag =
  | { kind: "move"; itemId: string; offsetFrames: number; start: number; trackId: string; valid: boolean }
  | { kind: "trim"; itemId: string; edge: "start" | "end" }
  | { kind: "anim"; itemId: string; phase: "in" | "out"; frames: number }
  | { kind: "fx"; trackId: string; index: number; at: number; offsetFrames: number; startX: number; moved: boolean }
  | { kind: "key"; itemId: string; index: number; arrival: number; offsetFrames: number; startX: number; moved: boolean }
  | { kind: "scrub" };

/** Durée d'une phase en cours de réglage, montrée sur le bloc avant d'être enregistrée. */
type AnimOverride = { phase: "in" | "out"; frames: number };

/**
 * Étendue des phases d'un élément sur la timeline, en images : entrée au
 * début, sortie à la fin, mise en avant entre les deux. Mêmes bornes que le
 * moteur (`activePhaseAt`) : l'entrée passe d'abord, la sortie prend ce
 * qui reste.
 */
function phaseSpans(item: VisualItem, override?: AnimOverride | null) {
  const framesOf = (phase: "in" | "out") => {
    const anim = phase === "in" ? item.animIn : item.animOut;
    if (!resolvePreset(anim.kind, phase)) return 0;
    return override?.phase === phase ? override.frames : anim.frames;
  };
  const inFrames = Math.min(Math.max(0, framesOf("in")), item.duration);
  const outFrames = Math.min(Math.max(0, framesOf("out")), item.duration - inFrames);
  let emphasis: { start: number; end: number } | null = null;
  const anim = item.animEmphasis;
  if (anim && resolvePreset(anim.kind, "emphasis") && anim.frames > 0) {
    const start = Math.max(inFrames, Math.round(Number(anim.at) || 0));
    const stop = item.duration - outFrames;
    const repeat = Math.max(0, Math.round(anim.repeat ?? 1));
    const end = repeat === 0 ? stop : Math.min(stop, start + repeat * Math.max(1, Math.round(anim.frames)));
    if (end > start) emphasis = { start, end };
  }
  return { inFrames, outFrames, emphasis };
}

const secondsLabel = (frames: number, fps: number) =>
  `${(frames / fps).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}\u00a0s`;

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
  /** Élément et phase dont le sélecteur complet est ouvert depuis le clic droit. */
  const [pickerTarget, setPickerTarget] = useState<{ itemId: string; phase: PickerPhase } | null>(null);
  const { favorites } = useMotionFavorites();
  /** Transition, mouvement ou effet de plan dont le catalogue complet est ouvert depuis la timeline. */
  const [sceneTarget, setSceneTarget] = useState<SceneTarget | null>(null);
  /** Effet de plan dont l'inspecteur est ouvert. */
  const [openFx, setOpenFx] = useState<{ trackId: string; index: number } | null>(null);
  /** Image sous le pointeur au dernier clic droit : là où « ici » pose un effet. */
  const [contextFrame, setContextFrame] = useState(0);
  /** Vrai quand un glissement de marque vient de finir : le clic qui suit n'ouvre rien. */
  const fxDragged = useRef(false);
  const transitionFavorites = useSceneFavorites("transition").favorites;
  const cameraFavorites = useSceneFavorites("camera").favorites;
  const shotFxFavorites = useSceneFavorites("shotfx").favorites;
  /** Tant que l'utilisateur n'a pas zoomé lui-même, la timeline suit la durée du clip. */
  const userZoomed = useRef(false);
  const setPpf = (value: number | ((current: number) => number)) => {
    userZoomed.current = true;
    setPpfState(value);
  };

  // + et - zooment la timeline, hors des champs de saisie.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        userZoomed.current = true;
        setPpfState((value) => Math.min(20, value * 1.4));
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        userZoomed.current = true;
        setPpfState((value) => Math.max(0.3, value / 1.4));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // ─── Gestes ────────────────────────────────────────────────────
  const onItemPointerDown = (event: React.PointerEvent, item: ClipItem, track: Track) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    props.onSelect(item.id);
    if (track.locked) return;
    const edge = (event.target as HTMLElement).dataset.edge as "start" | "end" | undefined;
    const animEdge = (event.target as HTMLElement).dataset.animEdge as "in" | "out" | undefined;
    const keyIndex = (event.target as HTMLElement).dataset.keyIndex;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (keyIndex !== undefined && item.type !== "audio") {
      // Une image clé se tire dans le temps ; un simple clic y place la tête de lecture.
      const index = Number(keyIndex);
      const arrival = keysByArrival(item).find((entry) => entry.index === index)?.arrival;
      if (arrival !== undefined) {
        setDrag({ kind: "key", itemId: item.id, index, arrival, offsetFrames: frameAtClientX(event.clientX) - (item.start + arrival), startX: event.clientX, moved: false });
        return;
      }
    }
    if (animEdge && item.type !== "audio") {
      const spans = phaseSpans(item);
      setDrag({ kind: "anim", itemId: item.id, phase: animEdge, frames: animEdge === "in" ? spans.inFrames : spans.outFrames });
      return;
    }
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
    if (drag.kind === "fx") {
      // Un effet se cale sur les bords des plans et la tête de lecture, comme un élément.
      const moved = drag.moved || Math.abs(event.clientX - drag.startX) > 3;
      const at = Math.max(0, Math.round(snap(pointerFrame - drag.offsetFrames)));
      if (moved !== drag.moved || at !== drag.at) setDrag({ ...drag, moved, at });
      return;
    }
    const item = trackOf(drag.itemId)?.items.find((entry) => entry.id === drag.itemId);
    if (!item) return;
    if (drag.kind === "key") {
      // L'arrivée de la clé se cale sur la tête de lecture et les bords des plans, dans l'élément.
      const moved = drag.moved || Math.abs(event.clientX - drag.startX) > 3;
      const arrival = Math.min(item.duration, Math.max(1, Math.round(snap(pointerFrame - drag.offsetFrames) - item.start)));
      if (moved !== drag.moved || arrival !== drag.arrival) setDrag({ ...drag, moved, arrival });
      return;
    }
    if (drag.kind === "anim") {
      if (item.type === "audio") return;
      // L'entrée et la sortie se partagent l'élément : chacune garde au moins une image, sans empiéter sur l'autre.
      const spans = phaseSpans(item);
      const other = drag.phase === "in" ? spans.outFrames : spans.inFrames;
      const raw = drag.phase === "in" ? pointerFrame - item.start : item.start + item.duration - pointerFrame;
      const frames = Math.min(Math.max(1, item.duration - other), Math.max(1, Math.round(raw)));
      if (frames !== drag.frames) setDrag({ ...drag, frames });
      return;
    }
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
    // Mêmes règles que le moteur : le son détaché d'une vidéo ne doit rien chevaucher non plus.
    setDrag({ ...drag, start, trackId, valid: canMoveItem(project, item.id, start, trackId) });
  };

  const onPointerUp = () => {
    if (drag?.kind === "fx" && drag.moved) {
      // Une seule modification au lâcher : une seule étape d'annulation.
      fxDragged.current = true;
      const track = project.tracks.find((entry) => entry.id === drag.trackId);
      if (track && Math.round(track.effects?.[drag.index]?.at ?? -1) !== drag.at) {
        props.onTrackPatch(track.id, { effects: updateShotEffect(track.effects, drag.index, { at: drag.at }, project.fps) });
      }
    }
    if (drag?.kind === "key") {
      const item = trackOf(drag.itemId)?.items.find((entry) => entry.id === drag.itemId);
      if (item && item.type !== "audio" && item.keys) {
        // Une seule modification au lâcher : une seule étape d'annulation.
        if (drag.moved) props.onItemPatch(item.id, { keys: moveKeyTo(item.keys, drag.index, drag.arrival, item.duration) } as Partial<ClipItem>);
        else props.onSeek(item.start + drag.arrival);
      }
    }
    if (drag?.kind === "move" && drag.valid) props.onMove(drag.itemId, drag.start, drag.trackId);
    if (drag?.kind === "trim") props.onTrimEnd();
    if (drag?.kind === "anim") {
      // Une seule modification au lâcher : une seule étape d'annulation.
      const item = trackOf(drag.itemId)?.items.find((entry) => entry.id === drag.itemId);
      if (item && item.type !== "audio") {
        const key = drag.phase === "in" ? "animIn" : "animOut";
        if (item[key].frames !== drag.frames) {
          props.onItemPatch(item.id, { [key]: { ...item[key], frames: drag.frames } } as Partial<ClipItem>);
        }
      }
    }
    setDrag(null);
  };

  const pickerItem = pickerTarget
    ? project.tracks.flatMap((track) => track.items).find((item) => item.id === pickerTarget.itemId)
    : undefined;

  // ─── Effets de plan ────────────────────────────────────────────
  const trackById = (trackId: string) => project.tracks.find((track) => track.id === trackId);

  /** Pose un effet sur une piste à l'image `at`, puis ouvre son inspecteur pour le régler. */
  const addEffect = (trackId: string, kind: string, at: number) => {
    const track = trackById(trackId);
    if (!track || !acceptsShotEffects(track)) return;
    const { effects, index } = addShotEffect(track.effects, kind, at, project.fps);
    props.onTrackPatch(trackId, { effects });
    // Le menu se ferme d'abord : sinon le focus qui lui revient refermerait aussitôt l'inspecteur.
    window.setTimeout(() => setOpenFx({ trackId, index }), 0);
  };

  const patchEffect = (trackId: string, index: number, patch: Partial<ShotEffect>, key?: string) => {
    const track = trackById(trackId);
    if (!track || track.locked) return;
    props.onTrackPatch(
      trackId,
      { effects: updateShotEffect(track.effects, index, patch, project.fps) },
      key ? `shot-fx-${trackId}-${index}-${key}` : undefined
    );
  };

  const removeEffect = (trackId: string, index: number) => {
    const track = trackById(trackId);
    if (!track || track.locked) return;
    setOpenFx(null);
    props.onTrackPatch(trackId, { effects: removeShotEffect(track.effects, index) });
  };

  // Un effet ouvert qui disparaît (annulation, piste retirée) referme son inspecteur.
  const openFxExists = openFx ? Boolean(trackById(openFx.trackId)?.effects?.[openFx.index]) : true;
  useEffect(() => {
    if (!openFxExists) setOpenFx(null);
  }, [openFxExists]);

  const sceneItem =
    sceneTarget && sceneTarget.kind !== "shotfx"
      ? project.tracks.flatMap((track) => track.items).find((item) => item.id === sceneTarget.itemId)
      : undefined;
  const sceneFavorites = { transition: transitionFavorites, camera: cameraFavorites, shotfx: shotFxFavorites };

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

  // Son tout juste détaché : sa piste s'ajoute en bas, souvent hors de vue. On
  // fait défiler les pistes jusqu'à lui, sans toucher au reste de la page.
  const linkedAudioId = selectedItem?.type === "video" ? selectedItem.audioLinkId : undefined;
  useEffect(() => {
    const box = scroller.current;
    if (!linkedAudioId || !box) return;
    const block = box.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(linkedAudioId)}"]`);
    if (!block) return;
    const view = box.getBoundingClientRect();
    const rect = block.getBoundingClientRect();
    const top = view.top + RULER_HEIGHT;
    const bottom = view.top + box.clientHeight;
    if (rect.bottom > bottom) box.scrollTop += rect.bottom - bottom + 4;
    else if (rect.top < top) box.scrollTop -= top - rect.top + 4;
  }, [linkedAudioId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ─── Barre d'outils ────────────────────────────────────── */}
      <div className="flex h-11 min-w-0 shrink-0 items-center gap-1 border-b px-2">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={props.onTogglePlay} aria-label={playing ? "Pause" : "Lecture"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="shrink-0 px-1 font-mono text-xs tabular-nums text-muted-foreground sm:min-w-36">
          <span className="text-foreground">{formatTimecode(frame, project.fps)}</span> / {formatTimecode(duration, project.fps)}
        </span>
        <span aria-hidden className="mx-1 h-5 w-px bg-border max-sm:hidden" />
        <ToolButton label="Scinder à la tête de lecture (S)" disabled={!selectedItem} onClick={() => selectedItem && props.onSplit(selectedItem.id)}>
          <Scissors className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Dupliquer (Ctrl D)" disabled={!selectedItem} onClick={() => selectedItem && props.onDuplicate(selectedItem.id)}>
          <Copy className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Supprimer (Suppr)" disabled={!selectedItem} onClick={() => selectedItem && props.onDelete(selectedItem.id)}>
          <Trash2 className="h-4 w-4" />
        </ToolButton>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* Téléphone : pas la place pour la glissière ; « Ajuster » cadre toute la timeline. */}
          <span className="flex items-center gap-1 max-sm:hidden">
            <ToolButton label="Dézoomer (-)" onClick={() => setPpf((value) => Math.max(0.3, value / 1.4))}>
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
            <ToolButton label="Zoomer (+)" onClick={() => setPpf((value) => Math.min(20, value * 1.4))}>
              <Plus className="h-4 w-4" />
            </ToolButton>
          </span>
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
              <ContextMenu>
                <ContextMenuTrigger asChild disabled={track.kind !== "visual"}>
                  <div
                    data-lane-id={track.id}
                    className={cn("relative flex-1", track.kind === "audio" ? "bg-emerald-500/[0.03]" : "bg-transparent")}
                    // Le clic droit (ou l'appui long) retient l'instant visé, que l'on soit sur la piste ou sur un plan.
                    onContextMenu={(event) => setContextFrame(Math.round(frameAtClientX(event.clientX)))}
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
                          animOverride={drag?.kind === "anim" && drag.itemId === item.id ? drag : null}
                          keyOverride={drag?.kind === "key" && drag.itemId === item.id ? drag : null}
                          favorites={favorites}
                          sceneFavorites={sceneFavorites}
                          contextFrame={contextFrame}
                          onOpenPicker={(phase) => setPickerTarget({ itemId: item.id, phase })}
                          onOpenScene={(target) => window.setTimeout(() => setSceneTarget(target), 0)}
                          onAddEffect={(kind, at) => addEffect(track.id, kind, at)}
                          onPointerDown={(event) => onItemPointerDown(event, item, track)}
                          {...props}
                        />
                      );
                    })}
                    {track.kind === "visual" &&
                      track.effects?.map((effect, index) => {
                        const dragging = drag?.kind === "fx" && drag.trackId === track.id && drag.index === index ? drag : null;
                        const at = dragging ? dragging.at : Math.round(effect.at);
                        return (
                          <ShotFxMarker
                            key={index}
                            effect={dragging ? { ...effect, at } : effect}
                            fps={project.fps}
                            maxFrame={Math.max(duration - 1, 0)}
                            playhead={frame}
                            locked={Boolean(track.locked)}
                            left={at * ppf}
                            width={shotEffectFrames(effect, project.fps) * ppf}
                            open={!dragging && openFx?.trackId === track.id && openFx.index === index}
                            onOpenChange={(open) => setOpenFx(open ? { trackId: track.id, index } : null)}
                            onPointerDown={(event) => {
                              if (event.button !== 0) return;
                              event.stopPropagation();
                              fxDragged.current = false;
                              if (track.locked) return;
                              event.currentTarget.setPointerCapture(event.pointerId);
                              setDrag({
                                kind: "fx",
                                trackId: track.id,
                                index,
                                at,
                                offsetFrames: frameAtClientX(event.clientX) - at,
                                startX: event.clientX,
                                moved: false,
                              });
                            }}
                            consumeDrag={() => {
                              const dragged = fxDragged.current;
                              fxDragged.current = false;
                              return dragged;
                            }}
                            onNudge={(delta) => patchEffect(track.id, index, { at: at + delta }, "nudge")}
                            onChange={(patch, key) => patchEffect(track.id, index, patch, key)}
                            onRemove={() => removeEffect(track.id, index)}
                          />
                        );
                      })}
                  </div>
                </ContextMenuTrigger>
                {track.kind === "visual" && (
                  <ContextMenuContent className="w-72">
                    <ContextMenuLabel className="truncate text-[11px] font-normal text-muted-foreground" title={track.name}>
                      {track.name} · {formatTimecode(contextFrame, project.fps)}
                    </ContextMenuLabel>
                    <SceneSubmenu
                      kind="shotfx"
                      label="Ajouter un effet de plan ici"
                      hint=""
                      disabled={!acceptsShotEffects(track)}
                      favorites={shotFxFavorites}
                      onPick={(kind) => addEffect(track.id, kind, contextFrame)}
                      onMore={() => window.setTimeout(() => setSceneTarget({ kind: "shotfx", trackId: track.id, frame: contextFrame }), 0)}
                    />
                    {track.locked && (
                      <p className="px-2 py-1 text-[11px] leading-4 text-muted-foreground">Piste verrouillée&nbsp;: déverrouillez-la pour y poser un effet.</p>
                    )}
                  </ContextMenuContent>
                )}
              </ContextMenu>
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

      {sceneTarget?.kind === "shotfx" && (
        <ScenePickerDialog
          open
          onOpenChange={(open) => !open && setSceneTarget(null)}
          kind="shotfx"
          title={`Effet de plan à ${formatTimecode(sceneTarget.frame, project.fps)}`}
          value={undefined}
          onPick={(kind) => addEffect(sceneTarget.trackId, kind, sceneTarget.frame)}
        />
      )}
      {sceneTarget && sceneTarget.kind !== "shotfx" && sceneItem && sceneItem.type !== "audio" && (
        <ScenePickerDialog
          open
          onOpenChange={(open) => !open && setSceneTarget(null)}
          kind={sceneTarget.kind}
          value={sceneTarget.kind === "transition" ? sceneItem.transition?.kind : "motion" in sceneItem ? sceneItem.motion : undefined}
          onPick={(id) => {
            if (sceneTarget.kind === "transition") {
              props.onItemPatch(sceneItem.id, transitionPatch(sceneItem, id, project.fps) as Partial<ClipItem>);
            } else if (sceneItem.type === "image" || sceneItem.type === "video") {
              props.onItemPatch(sceneItem.id, cameraPatch(sceneItem.type, id) as Partial<ClipItem>);
            }
          }}
        />
      )}

      {pickerTarget && pickerItem && pickerItem.type !== "audio" && (
        <MotionPickerDialog
          open
          onOpenChange={(open) => !open && setPickerTarget(null)}
          phase={pickerTarget.phase}
          itemType={pickerItem.type}
          value={
            pickerTarget.phase === "in"
              ? pickerItem.animIn.kind
              : pickerTarget.phase === "out"
                ? pickerItem.animOut.kind
                : pickerItem.animEmphasis?.kind
          }
          onPick={(kind) => props.onItemPatch(pickerItem.id, pickPatch(pickerItem, pickerTarget.phase, kind, project.fps) as Partial<ClipItem>)}
        />
      )}
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
      <span className="min-w-0 flex-1 truncate text-xs font-medium" title={track.name}>
        {track.name}
      </span>
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

/**
 * Pictogrammes du son d'un bloc : vidéo sans son, son coupé, effacé sous la
 * voix, détaché (ou, sur un son, lié à sa vidéo).
 */
function SoundBadges({ item, linked }: { item: ClipItem; linked: boolean }) {
  const badges: { key: string; label: string; Icon: typeof Link2 }[] = [];
  if (item.type === "audio") {
    if (linked) badges.push({ key: "link", label: "Son d’une vidéo, lié à elle", Icon: Link2 });
  } else if (item.type === "video") {
    if (item.source.hasAudio === false) badges.push({ key: "none", label: "Sans son", Icon: VolumeOff });
    else if (item.audioLinkId) badges.push({ key: "link", label: "Son détaché sur une piste audio", Icon: Link2 });
    else {
      if (item.muted) badges.push({ key: "muted", label: "Son coupé", Icon: VolumeX });
      if (item.duck !== undefined && item.duck < 1) badges.push({ key: "duck", label: "S’efface sous la voix", Icon: Volume1 });
    }
  }
  if (badges.length === 0) return null;
  return (
    <span className="relative ml-auto flex shrink-0 items-center gap-0.5 opacity-80">
      {badges.map(({ key, label, Icon }) => (
        <span key={key} role="img" aria-label={label} title={label} className="flex">
          <Icon aria-hidden className="h-3 w-3" />
        </span>
      ))}
    </span>
  );
}

function itemLabel(item: ClipItem) {
  if (item.label) return item.label;
  if (item.type === "text") return item.text;
  if (item.type === "shape") return item.shape === "progress" ? "Barre de progression" : item.shape === "stroke" ? "Tracé" : "Forme";
  return item.source.name;
}

function TimelineItem({
  item,
  track,
  ppf,
  selected,
  dimmed,
  animOverride,
  keyOverride,
  favorites,
  sceneFavorites,
  contextFrame,
  onOpenPicker,
  onOpenScene,
  onAddEffect,
  onPointerDown,
  ...props
}: {
  item: ClipItem;
  track: Track;
  ppf: number;
  selected: boolean;
  dimmed: boolean;
  /** Durée d'entrée ou de sortie en cours de réglage au bord du bloc. */
  animOverride: AnimOverride | null;
  /** Image clé en cours de déplacement : son rang et son arrivée. */
  keyOverride: { index: number; arrival: number } | null;
  favorites: string[];
  sceneFavorites: Record<"transition" | "camera" | "shotfx", string[]>;
  /** Image visée par le dernier clic droit. */
  contextFrame: number;
  onOpenPicker: (phase: PickerPhase) => void;
  onOpenScene: (target: SceneTarget) => void;
  onAddEffect: (kind: string, at: number) => void;
  onPointerDown: (event: React.PointerEvent) => void;
} & TimelineProps) {
  const Icon = ITEM_ICON[item.type];
  const width = Math.max(4, item.duration * ppf);
  const thumbnail = item.type === "image" ? item.source.url : null;
  const fps = props.project.fps;
  const spans = item.type === "audio" ? null : phaseSpans(item, animOverride);
  const inWidth = spans ? Math.min(width, spans.inFrames * ppf) : 0;
  const outWidth = spans ? Math.min(width - inWidth, spans.outFrames * ppf) : 0;
  // Les poignées de durée ne paraissent que sur l'élément sélectionné, assez large pour les distinguer des bords.
  const showAnimHandles = selected && !track.locked && width >= 48;
  /** Poignée tenue loin des bords de l'élément, que gardent les poignées de rognage. */
  const handleLeft = (x: number) => Math.min(width - 12, Math.max(12, x));
  const pickAnim = (phase: PickerPhase) => (kind: string) => {
    if (item.type === "audio") return;
    props.onItemPatch(item.id, pickPatch(item, phase, kind, fps) as Partial<ClipItem>);
  };
  // Le menu se ferme avant que la fenêtre s'ouvre : sinon le focus rendu au menu la referme aussitôt.
  const openPicker = (phase: PickerPhase) => () => window.setTimeout(() => onOpenPicker(phase), 0);
  // Vidéo et son détaché : même teinte, et l'un se signale quand l'autre est sélectionné.
  const partner = item.type === "video" || item.type === "audio" ? linkedItem(props.project, item) : null;
  const linkedAudio = item.type === "audio" && partner !== null;
  const videoSound = item.type === "video" && item.source.hasAudio !== false && !item.audioLinkId;
  // Images clés : un losange à l'instant où chacune arrive, un trait fin pour son mouvement.
  const keys = item.type !== "audio" && width >= 24 ? keysByArrival(item) : [];
  /** Image clé visée par le dernier clic droit, pour la retirer depuis le menu. */
  const [menuKey, setMenuKey] = useState<number | null>(null);
  const menuEntry = menuKey !== null ? keys.find((entry) => entry.index === menuKey) : undefined;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          layout="position"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          onPointerDown={onPointerDown}
          onContextMenu={(event) => {
            const index = (event.target as HTMLElement).dataset.keyIndex;
            setMenuKey(index === undefined ? null : Number(index));
          }}
          data-item-id={item.id}
          className={cn(
            "group absolute top-1 bottom-1 flex cursor-grab items-center gap-1.5 overflow-hidden rounded-md border px-2 text-xs select-none active:cursor-grabbing",
            ITEM_STYLE[linkedAudio ? "video" : item.type],
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
            !selected && partner && partner.item.id === props.selectedId && "ring-1 ring-primary/60",
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
          {item.type === "audio" && <Waveform item={item} fps={props.project.fps} />}
          {/* Son d'une vidéo : son onde dans la moitié basse du bloc, pâlie quand il est coupé. */}
          {item.type === "video" && videoSound && (
            <Waveform item={item} fps={props.project.fps} className={cn("top-1/2 h-1/2", item.muted ? "opacity-15" : "opacity-30")} />
          )}
          {item.type !== "audio" && item.transition && (
            // Étendue de la transition d'entrée, au début du plan.
            <span
              aria-hidden
              title={`Transition : ${transitionLabel(item.transition.kind)}`}
              className="absolute inset-y-0 left-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.28),transparent)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.22),transparent)]"
              style={{ width: Math.min(width, item.transition.frames * ppf) }}
            />
          )}
          {item.type !== "audio" && spans && (
            <>
              {/* Phases d'animation : zones légèrement teintées aux bords, mise en avant soulignée. */}
              {inWidth > 0 && (
                <span
                  title={`Entrée : ${presetLabel(item.animIn.kind, "in")} · ${secondsLabel(spans.inFrames, fps)}`}
                  className="absolute inset-y-0 left-0 bg-foreground/[0.09] dark:bg-foreground/[0.11]"
                  style={{ width: inWidth }}
                />
              )}
              {outWidth > 0 && (
                <span
                  title={`Sortie : ${presetLabel(item.animOut.kind, "out")} · ${secondsLabel(spans.outFrames, fps)}`}
                  className="absolute inset-y-0 right-0 bg-foreground/[0.09] dark:bg-foreground/[0.11]"
                  style={{ width: outWidth }}
                />
              )}
              {spans.emphasis && (
                <span
                  title={`Mise en avant : ${presetLabel(item.animEmphasis?.kind, "emphasis")}`}
                  className="absolute bottom-0.5 h-0.5 rounded-full bg-foreground/35"
                  style={{
                    left: Math.min(width, spans.emphasis.start * ppf),
                    width: Math.max(2, Math.min(width, spans.emphasis.end * ppf) - Math.min(width, spans.emphasis.start * ppf)),
                  }}
                />
              )}
            </>
          )}
          <Icon className="relative h-3.5 w-3.5 shrink-0" />
          <span className="relative min-w-0 truncate font-medium" title={itemLabel(item)}>
            {itemLabel(item)}
          </span>
          {(item.type === "video" || linkedAudio) && <SoundBadges item={item} linked={partner !== null} />}
          {showAnimHandles && inWidth > 0 && (
            <span
              data-anim-edge="in"
              title="Durée de l’entrée : tirer pour la régler"
              className="absolute inset-y-1.5 z-[1] w-1.5 -translate-x-1/2 cursor-col-resize rounded-full bg-foreground/30 transition-colors hover:bg-foreground/60"
              style={{ left: handleLeft(inWidth) }}
            />
          )}
          {showAnimHandles && outWidth > 0 && (
            <span
              data-anim-edge="out"
              title="Durée de la sortie : tirer pour la régler"
              className="absolute inset-y-1.5 z-[1] w-1.5 -translate-x-1/2 cursor-col-resize rounded-full bg-foreground/30 transition-colors hover:bg-foreground/60"
              style={{ left: handleLeft(width - outWidth) }}
            />
          )}
          {!track.locked && (
            <>
              <span data-edge="start" className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-foreground/0 transition-colors hover:bg-foreground/25" />
              <span data-edge="end" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-foreground/0 transition-colors hover:bg-foreground/25" />
            </>
          )}
          {keys.map(({ key, index, arrival }) => {
            const shown = keyOverride?.index === index ? keyOverride.arrival : arrival;
            if (shown < 0 || shown > item.duration) return null;
            // Le losange reste entier dans le bloc, même sur une clé qui arrive à son tout dernier instant.
            const x = Math.min(width - 6, Math.max(6, shown * ppf));
            const span = Math.min(x, keyFrames(key) * ppf);
            const label = `Image clé à ${secondsLabel(shown, fps)} · ${keySummary(key)}`;
            return (
              <span key={index} className="contents">
                <span aria-hidden className="pointer-events-none absolute bottom-[6.5px] h-px bg-foreground/40" style={{ left: x - span, width: span }} />
                <span
                  data-key-index={index}
                  role="img"
                  aria-label={label}
                  title={`${label} : tirer pour la déplacer, cliquer pour y aller`}
                  className={cn(
                    "absolute bottom-[2px] z-[2] size-2.5 -translate-x-1/2 rotate-45 rounded-[1px] border border-background bg-foreground shadow-sm",
                    track.locked ? "cursor-not-allowed" : "cursor-ew-resize",
                    keyOverride?.index === index && "bg-primary"
                  )}
                  style={{ left: x }}
                />
              </span>
            );
          })}
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-72">
        {menuEntry && item.type !== "audio" && (
          <>
            <ContextMenuItem variant="destructive" disabled={track.locked} onClick={() => props.onItemPatch(item.id, { keys: removeKey(item.keys, menuEntry.index) } as Partial<ClipItem>)}>
              <Diamond className="mr-2 h-4 w-4" />
              Retirer l’image clé à {secondsLabel(menuEntry.arrival, fps)}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
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
            <MotionSubmenu
              label="Animation d’entrée"
              phase="in"
              itemType={item.type}
              value={item.animIn.kind}
              favorites={favorites}
              onPick={pickAnim("in")}
              onMore={openPicker("in")}
            />
            <MotionSubmenu
              label="Animation de sortie"
              phase="out"
              itemType={item.type}
              value={item.animOut.kind}
              favorites={favorites}
              onPick={pickAnim("out")}
              onMore={openPicker("out")}
            />
            <MotionSubmenu
              label="Mise en avant"
              phase="emphasis"
              itemType={item.type}
              value={item.animEmphasis?.kind}
              favorites={favorites}
              onPick={pickAnim("emphasis")}
              onMore={openPicker("emphasis")}
            />
            <SceneSubmenu
              kind="transition"
              label="Transition d’entrée"
              value={item.transition?.kind ?? "none"}
              favorites={sceneFavorites.transition}
              onPick={(kind) => props.onItemPatch(item.id, transitionPatch(item, kind, fps) as Partial<ClipItem>)}
              onMore={() => onOpenScene({ kind: "transition", itemId: item.id })}
            />
          </>
        )}
        {(item.type === "image" || item.type === "video") && (
          <SceneSubmenu
            kind="camera"
            label="Mouvement de caméra"
            value={item.motion ?? "none"}
            favorites={sceneFavorites.camera}
            onPick={(id) => props.onItemPatch(item.id, cameraPatch(item.type as "image" | "video", id) as Partial<ClipItem>)}
            onMore={() => onOpenScene({ kind: "camera", itemId: item.id })}
          />
        )}
        {track.kind === "visual" && (
          <SceneSubmenu
            kind="shotfx"
            label="Effet de plan ici"
            hint={formatTimecode(contextFrame, fps)}
            disabled={!acceptsShotEffects(track)}
            favorites={sceneFavorites.shotfx}
            onPick={(kind) => onAddEffect(kind, contextFrame)}
            onMore={() => onOpenScene({ kind: "shotfx", trackId: track.id, frame: contextFrame })}
          />
        )}
        {props.onChangeTrackVoice && isVoiceItem(item) && (
          <>
            <ContextMenuSeparator />
            {/* Le menu se ferme avant que la fenêtre s'ouvre, comme pour les animations. */}
            <ContextMenuItem onClick={() => window.setTimeout(() => props.onChangeTrackVoice?.(track.id), 0)}>
              <Mic className="mr-2 h-4 w-4" />
              Changer la voix de la piste…
            </ContextMenuItem>
          </>
        )}
        {item.type === "video" && videoSound && props.onDetachAudio && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => props.onDetachAudio?.(item.id)}>
              <Unlink2 className="mr-2 h-4 w-4" />
              Détacher le son
            </ContextMenuItem>
          </>
        )}
        {partner && props.onReattachAudio && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => props.onReattachAudio?.(item.id)}>
              <Link2 className="mr-2 h-4 w-4" />
              {item.type === "audio" ? "Rattacher à la vidéo" : "Rattacher le son"}
            </ContextMenuItem>
          </>
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
