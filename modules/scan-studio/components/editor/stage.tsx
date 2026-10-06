"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { nearestWeight } from "../../lib/fonts";
import {
  RESIZE_HANDLES,
  boxCorners,
  clampPoint,
  distance,
  handlePosition,
  hitBoxHandle,
  nearestEdgeIndex,
  nearestVertexIndex,
  normalizeAngle,
  pointInBox,
  pointInPolygon,
  rectFromCorners,
  rectToPolygon,
  resizeBox,
  rotationToward,
  snapAngle,
  translatePoints,
  type ResizeHandle,
} from "../../lib/geometry";
import { renderPage, type InpaintPatch } from "../../lib/render";
import type { TextLayout } from "../../lib/text-layout";
import { boundsOf, type BrushStroke, type ChapterSettings, type Point, type ScanRegion, type TextBox } from "../../lib/types";
import { TOOLS, type Tool, type ViewMode } from "./tools";

export interface StageHandle {
  /** Cadre la page entière dans la fenêtre. */
  fit: () => void;
  /** Zoome autour du centre de la scène. */
  zoomBy: (factor: number) => void;
  /** Ferme le polygone en cours de tracé ; rend `false` s'il n'y en a pas. */
  closeDraft: () => boolean;
  cancelDraft: () => boolean;
}

interface StageProps {
  ref?: React.Ref<StageHandle>;
  page: { width: number; height: number };
  /** `null` tant que l'image charge : la page est dessinée en blanc. */
  image: HTMLImageElement | null;
  regions: ScanRegion[];
  settings: ChapterSettings;
  view: ViewMode;
  tool: Tool;
  /** Barre d'espace tenue : la main prend le pas sur l'outil. */
  panning: boolean;
  selectedId: string | null;
  showMasks: boolean;
  showTexts: boolean;
  /** Largeur du pinceau, en pixels de la page. */
  brushWidth: number;
  /** Mises en lignes partagées avec l'inspecteur ; remplacé quand les polices arrivent, ce qui redessine la scène. */
  layoutCache: WeakMap<ScanRegion, TextLayout>;
  /** Fond reconstruit d'une zone, s'il est prêt ; la fonction change quand un fond arrive, ce qui redessine la scène. */
  resolveInpaint?: (region: ScanRegion) => InpaintPatch | null;
  onSelect: (regionId: string | null) => void;
  /** `key` regroupe tout un geste en une seule étape d'annulation. */
  onPatchRegion: (regionId: string, update: (region: ScanRegion) => ScanRegion, key: string) => void;
  /** `sfx` : la zone tracée est une onomatopée, posée sur le dessin. */
  onCreateRegion: (outline: Point[], kind?: "sfx") => void;
  onPickColor: (point: Point) => void;
  /** Double-clic sur un texte : on veut le modifier. */
  onEditText: (regionId: string) => void;
  onZoomChange: (scale: number) => void;
  /** Contenu du menu contextuel de la zone sélectionnée. */
  menu: React.ReactNode;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

type Gesture = { pane: number; moved: boolean } & (
  | { kind: "pan"; startView: View; pointer: Point }
  | { kind: "pinch"; startView: View; startDistance: number; startMiddle: Point }
  | { kind: "move-text"; id: string; key: string; start: TextBox; origin: Point }
  | { kind: "resize"; id: string; key: string; start: TextBox; handle: ResizeHandle }
  // `offset` : écart entre la rotation de la boîte et la direction du pointeur à la prise de la poignée.
  | { kind: "rotate"; id: string; key: string; start: TextBox; offset: number }
  | { kind: "move-outline"; id: string; key: string; start: Point[]; origin: Point }
  | { kind: "vertex"; id: string; key: string; index: number }
  | { kind: "rect"; origin: Point; current: Point; sfx: boolean }
  | { kind: "brush"; id: string; key: string; stroke: BrushStroke }
);

const MIN_SCALE = 0.02;
const MAX_SCALE = 16;
/** Marge laissée autour de la page au cadrage, en pixels d'écran. */
const FIT_MARGIN = 32;
/** Rayon de prise des poignées et des sommets, en pixels d'écran. */
const HIT_RADIUS = 9;
/** Distance entre le bord haut de la boîte et sa poignée de rotation, à l'écran. */
const ROTATE_OFFSET = 26;
/** En deçà, un appui n'est pas un glissement : la zone ne bouge pas. */
const DRAG_THRESHOLD = 3;
const DOUBLE_CLICK_MS = 350;
/** Plafonds de l'enregistrement d'une page (voir `sanitize-page.ts`). */
const MAX_STROKES = 200;
const MAX_STROKE_POINTS = 2000;

const RESIZE_CURSORS: Record<ResizeHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function panesOf(view: ViewMode): ("original" | "translated")[] {
  return view === "side" ? ["original", "translated"] : [view];
}

/**
 * Scène de l'atelier : la page, dessinée sur un canevas à la taille de la
 * fenêtre, et la manipulation directe des zones.
 *
 * La page est rendue par `renderPage`, la même fonction que l'export, sous la
 * transformation de la vue (zoom, décalage). Les repères de sélection
 * (contour, cadre du texte, poignées) sont tracés par-dessus, à l'échelle de
 * l'écran. En vue côte à côte, le canevas est partagé en deux volets qui
 * suivent le même cadrage ; on peut travailler dans l'un comme dans l'autre.
 *
 * La vue, le geste en cours et le tracé provisoire vivent dans des références :
 * un déplacement de souris redessine le canevas sans repasser par React.
 */
export function Stage(props: StageProps) {
  const { ref, page, view, tool, panning, regions, selectedId } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const sizeRef = useRef({ width: 0, height: 0 });
  /** Tant que l'utilisateur n'a ni zoomé ni déplacé, la page suit la taille de la fenêtre. */
  const autoFitRef = useRef(true);
  const gestureRef = useRef<Gesture | null>(null);
  const draftRef = useRef<Point[]>([]);
  const hoverRef = useRef<{ pane: number; point: Point } | null>(null);
  const touchesRef = useRef(new Map<number, Point>());
  const lastClickRef = useRef({ at: 0, x: 0, y: 0 });
  const gestureCount = useRef(0);
  const frameRef = useRef(0);
  const [cursor, setCursor] = useState("default");

  const paneCount = view === "side" ? 2 : 1;

  // ─── Dessin ────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const { width, height } = sizeRef.current;
    if (!canvas || !ctx || width === 0 || height === 0) return;

    const current = propsRef.current;
    const { scale, x, y } = viewRef.current;
    const panes = panesOf(current.view);
    const paneWidth = width / panes.length;
    const ratio = window.devicePixelRatio || 1;
    const styles = getComputedStyle(canvas);
    const accent = styles.getPropertyValue("--primary").trim() || "#2563eb";
    const onAccent = styles.getPropertyValue("--primary-foreground").trim() || "#ffffff";
    const selected = current.regions.find((region) => region.id === current.selectedId) ?? null;
    const gesture = gestureRef.current;
    const hover = hoverRef.current;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    /** Trace un chemin en pixels de la page, converti à l'écran, cerné de blanc pour rester lisible sur le noir. */
    const strokePath = (points: Point[], options: { closed: boolean; dash?: number[]; alpha?: number }) => {
      if (points.length < 2) return;
      ctx.beginPath();
      points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x * scale, point.y * scale) : ctx.lineTo(point.x * scale, point.y * scale)));
      if (options.closed) ctx.closePath();
      ctx.globalAlpha = (options.alpha ?? 1) * 0.7;
      ctx.setLineDash([]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.globalAlpha = options.alpha ?? 1;
      ctx.setLineDash(options.dash ?? []);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = accent;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };

    const drawKnob = (point: Point, shape: "round" | "square", radius = 4.5) => {
      const cx = point.x * scale;
      const cy = point.y * scale;
      ctx.beginPath();
      if (shape === "round") ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      else ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = accent;
      ctx.stroke();
    };

    panes.forEach((kind, paneIndex) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(paneIndex * paneWidth, 0, paneWidth, height);
      ctx.clip();
      ctx.translate(paneIndex * paneWidth + x, y);

      // La page, par la même fonction que l'export.
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, current.page.width * scale, current.page.height * scale);
      ctx.restore();
      ctx.save();
      ctx.scale(scale, scale);
      ctx.imageSmoothingQuality = "high";
      renderPage(ctx, current.page, current.image, current.regions, current.settings, {
        view: kind,
        showMasks: current.showMasks,
        showTexts: current.showTexts,
        resolveWeight: nearestWeight,
        layoutCache: current.layoutCache,
        resolveInpaint: current.resolveInpaint,
      });
      ctx.restore();

      // Contours : tous dans l'original ; dans la traduction, seulement la zone
      // sélectionnée et celles qui attendent encore leur texte.
      current.regions.forEach((region, index) => {
        const isSelected = region.id === current.selectedId;
        const pending = !region.translation.text.trim();
        if (!isSelected && kind === "translated" && !pending) return;
        strokePath(region.outline, {
          closed: true,
          alpha: isSelected ? 1 : 0.6,
          dash: kind === "translated" ? [5, 4] : undefined,
        });

        // Rang de la zone dans l'ordre de lecture, au coin de son contour.
        const bounds = boundsOf(region.outline);
        const label = String(index + 1);
        ctx.font = "600 11px sans-serif";
        const labelWidth = Math.max(18, ctx.measureText(label).width + 10);
        const labelX = bounds.x * scale;
        const labelY = bounds.y * scale - 20;
        ctx.globalAlpha = isSelected ? 1 : 0.75;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelWidth, 17, 4);
        ctx.fill();
        ctx.fillStyle = onAccent;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, labelX + labelWidth / 2, labelY + 9);
        ctx.globalAlpha = 1;
      });

      if (selected) {
        selected.outline.forEach((vertex) => drawKnob(vertex, "square", 3.5));
        if (kind === "translated" && current.showTexts) {
          const box = selected.text.box;
          strokePath(boxCorners(box), { closed: true });
          strokePath([handlePosition(box, "n"), handlePosition(box, "rotate", ROTATE_OFFSET / scale)], { closed: false });
          RESIZE_HANDLES.forEach((handle) => drawKnob(handlePosition(box, handle), "round"));
          drawKnob(handlePosition(box, "rotate", ROTATE_OFFSET / scale), "round", 5.5);
        }
      }

      // Tracés provisoires : rectangle en cours, polygone en cours, pinceau.
      if (gesture?.kind === "rect") {
        strokePath(rectToPolygon(rectFromCorners(gesture.origin, gesture.current)), { closed: true, dash: [5, 4] });
      }
      const draft = draftRef.current;
      if (draft.length > 0) {
        strokePath(hover ? [...draft, hover.point] : draft, { closed: false });
        draft.forEach((point, index) => drawKnob(point, index === 0 ? "round" : "square", index === 0 ? 5 : 3.5));
      }
      if (current.tool === "brush" && !current.panning && hover?.pane === paneIndex) {
        ctx.beginPath();
        ctx.arc(hover.point.x * scale, hover.point.y * scale, Math.max(2, (current.brushWidth / 2) * scale), 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = accent;
        ctx.stroke();
      }
      ctx.restore();
    });

    // Séparation des deux volets de la vue côte à côte.
    if (panes.length > 1) {
      ctx.fillStyle = styles.getPropertyValue("--border").trim() || "rgba(128, 128, 128, 0.4)";
      ctx.fillRect(Math.round(paneWidth) - 0.5, 0, 1, height);
    }
  }, []);

  const requestDraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }, [draw]);

  // ─── Vue ───────────────────────────────────────────────────────

  const setView = useCallback(
    (next: View, byUser: boolean) => {
      if (byUser) autoFitRef.current = false;
      const changed = next.scale !== viewRef.current.scale;
      viewRef.current = next;
      if (changed) propsRef.current.onZoomChange(next.scale);
      requestDraw();
    },
    [requestDraw],
  );

  const fit = useCallback(() => {
    const { width, height } = sizeRef.current;
    const current = propsRef.current;
    if (width === 0 || height === 0) return;
    const paneWidth = width / panesOf(current.view).length;
    const scale = clamp(
      Math.min((paneWidth - 2 * FIT_MARGIN) / current.page.width, (height - 2 * FIT_MARGIN) / current.page.height),
      MIN_SCALE,
      MAX_SCALE,
    );
    autoFitRef.current = true;
    setView({ scale, x: (paneWidth - current.page.width * scale) / 2, y: (height - current.page.height * scale) / 2 }, false);
  }, [setView]);

  /** Zoome en gardant sous le pointeur le même point de la page. */
  const zoomAt = useCallback(
    (anchor: Point, factor: number) => {
      const current = viewRef.current;
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      const pageX = (anchor.x - current.x) / current.scale;
      const pageY = (anchor.y - current.y) / current.scale;
      setView({ scale, x: anchor.x - pageX * scale, y: anchor.y - pageY * scale }, true);
    },
    [setView],
  );

  // Le canevas suit la taille de son conteneur, à la densité de l'écran.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;
      sizeRef.current = { width, height };
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      if (autoFitRef.current) fit();
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw, fit]);

  // Changer de vue change la largeur d'un volet : on recadre.
  useEffect(() => {
    fit();
  }, [fit, paneCount, page.width, page.height]);

  useEffect(() => {
    requestDraw();
  }, [requestDraw, regions, selectedId, view, tool, panning, props.image, props.settings, props.showMasks, props.showTexts, props.brushWidth, props.layoutCache, props.resolveInpaint]);

  // L'image annulée doit aussi être oubliée : sinon `requestDraw` croit qu'un
  // dessin est encore prévu et n'en programme plus jamais (le double montage de
  // React en développement suffit à le déclencher).
  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    },
    [],
  );

  // Le polygone en cours ne survit pas au changement d'outil.
  useEffect(() => {
    if (tool !== "polygon" && draftRef.current.length > 0) {
      draftRef.current = [];
      requestDraw();
    }
  }, [tool, requestDraw]);

  // ─── Repérage ──────────────────────────────────────────────────

  /** Volet, position à l'écran dans ce volet et point de la page sous un événement. */
  const locate = (event: { clientX: number; clientY: number }, forcedPane?: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const paneWidth = rect.width / paneCount;
    const pane = forcedPane ?? clamp(Math.floor((event.clientX - rect.left) / paneWidth), 0, paneCount - 1);
    const screen = { x: event.clientX - rect.left - pane * paneWidth, y: event.clientY - rect.top };
    const { scale, x, y } = viewRef.current;
    return { pane, screen, point: { x: (screen.x - x) / scale, y: (screen.y - y) / scale } };
  };

  const selectedRegion = () => propsRef.current.regions.find((region) => region.id === propsRef.current.selectedId) ?? null;

  /**
   * Zone sous le pointeur, et ce qu'on en a saisi. La zone sélectionnée passe
   * d'abord, puis les autres, de la dernière dessinée à la première. Dans la
   * traduction le bloc de texte l'emporte sur le contour, sauf demande inverse.
   */
  const pickRegion = (point: Point, kind: "original" | "translated", preferOutline: boolean) => {
    const current = propsRef.current;
    const tolerance = HIT_RADIUS / viewRef.current.scale;
    const ordered = [...current.regions].reverse().sort((a, b) => Number(b.id === current.selectedId) - Number(a.id === current.selectedId));
    for (const region of ordered) {
      const onText = kind === "translated" && current.showTexts && pointInBox(point, region.text.box);
      const onOutline = pointInPolygon(point, region.outline) || nearestEdgeIndex(point, region.outline, tolerance) >= 0;
      if (preferOutline && onOutline) return { region, part: "outline" as const };
      if (onText) return { region, part: "text" as const };
      if (onOutline) return { region, part: "outline" as const };
    }
    return null;
  };

  /** Ce que l'outil de sélection saisirait ici sur la zone sélectionnée : poignée, sommet, ou rien. */
  const pickHandle = (point: Point, kind: "original" | "translated", preferOutline: boolean) => {
    const region = selectedRegion();
    if (!region) return null;
    const tolerance = HIT_RADIUS / viewRef.current.scale;
    const vertex = () => {
      const index = nearestVertexIndex(point, region.outline, tolerance);
      return index >= 0 ? ({ type: "vertex", region, index } as const) : null;
    };
    const boxHandle = () => {
      if (kind !== "translated" || !propsRef.current.showTexts) return null;
      const handle = hitBoxHandle(point, region.text.box, tolerance, ROTATE_OFFSET / viewRef.current.scale);
      return handle ? ({ type: "box", region, handle } as const) : null;
    };
    return preferOutline ? vertex() ?? boxHandle() : boxHandle() ?? vertex();
  };

  const nextKey = () => `drag:${++gestureCount.current}`;

  const closeDraft = useCallback(() => {
    const draft = draftRef.current;
    if (draft.length === 0) return false;
    draftRef.current = [];
    requestDraw();
    if (draft.length >= 3) propsRef.current.onCreateRegion(draft);
    else toast.info("Un contour demande au moins trois points");
    return true;
  }, [requestDraw]);

  const cancelDraft = useCallback(() => {
    if (draftRef.current.length === 0) return false;
    draftRef.current = [];
    requestDraw();
    return true;
  }, [requestDraw]);

  useImperativeHandle(
    ref,
    () => ({
      fit,
      zoomBy: (factor) => {
        const { width, height } = sizeRef.current;
        zoomAt({ x: width / panesOf(propsRef.current.view).length / 2, y: height / 2 }, factor);
      },
      closeDraft,
      cancelDraft,
    }),
    [fit, zoomAt, closeDraft, cancelDraft],
  );

  // ─── Molette ───────────────────────────────────────────────────

  // Écouteur posé à la main : React attache `wheel` en passif, et le zoom doit
  // empêcher la page de défiler.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const paneWidth = rect.width / panesOf(propsRef.current.view).length;
      const anchor = { x: (event.clientX - rect.left) % paneWidth, y: event.clientY - rect.top };
      // Le pincement d'un pavé tactile arrive en molette avec Ctrl, par petits pas.
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(anchor, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ─── Gestes ────────────────────────────────────────────────────

  const startPinch = () => {
    const [first, second] = [...touchesRef.current.values()];
    const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const located = locate({ clientX: middle.x, clientY: middle.y });
    gestureRef.current = {
      kind: "pinch",
      pane: located.pane,
      moved: true,
      startView: viewRef.current,
      startDistance: Math.max(1, distance(first, second)),
      startMiddle: located.screen,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = propsRef.current;
    const canvas = event.currentTarget;
    const located = locate(event);
    const { pane, screen, point } = located;
    const kind = panesOf(current.view)[pane];
    const scale = viewRef.current.scale;
    const tolerance = HIT_RADIUS / scale;
    const inPage = clampPoint(point, current.page.width, current.page.height);

    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2) {
        canvas.setPointerCapture(event.pointerId);
        startPinch();
        return;
      }
    }
    if (event.button !== 0 && event.button !== 1) return;
    canvas.setPointerCapture(event.pointerId);
    // Un clic sur la scène rend le clavier aux raccourcis. Fait ici, et non par
    // le navigateur (voir `onMouseDown`), pour qu'un geste puisse ensuite
    // donner le curseur au champ de traduction sans le reperdre aussitôt.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    // Double-clic : repéré ici, `pointerdown` ne le dit pas partout.
    const now = performance.now();
    const last = lastClickRef.current;
    const isDouble = now - last.at < DOUBLE_CLICK_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 6;
    lastClickRef.current = { at: isDouble ? 0 : now, x: event.clientX, y: event.clientY };

    if (event.button === 1 || current.tool === "hand" || current.panning) {
      event.preventDefault();
      gestureRef.current = { kind: "pan", pane, moved: false, startView: viewRef.current, pointer: screen };
      setCursor("grabbing");
      return;
    }

    if (current.tool === "rect" || current.tool === "sfx") {
      gestureRef.current = { kind: "rect", pane, moved: false, origin: inPage, current: inPage, sfx: current.tool === "sfx" };
      return;
    }

    if (current.tool === "polygon") {
      const draft = draftRef.current;
      const closes = draft.length >= 3 && (isDouble || distance(point, draft[0]) <= tolerance);
      if (closes) closeDraft();
      else if (!isDouble) draftRef.current = [...draft, inPage];
      requestDraw();
      return;
    }

    if (current.tool === "eyedropper") {
      // Hors de la page il n'y a pas de couleur à prendre : on ne prélève pas celle du bord à la place.
      const inside = point.x >= 0 && point.y >= 0 && point.x < current.page.width && point.y < current.page.height;
      if (inside) current.onPickColor(point);
      else toast.info("Cliquez dans la page pour y prélever une couleur");
      return;
    }

    if (current.tool === "brush") {
      const region = selectedRegion() ?? pickRegion(point, kind, true)?.region ?? null;
      if (!region) {
        toast.info("Sélectionnez d’abord la zone à retoucher");
        return;
      }
      if (region.id !== current.selectedId) current.onSelect(region.id);
      if (region.mask.kind === "none") {
        toast.info("Cette zone n’a pas de masque : choisissez un aplat ou un fond reconstruit dans l’inspecteur pour peindre");
        return;
      }
      if (region.mask.strokes.length >= MAX_STROKES) {
        toast.info("Cette zone a atteint le nombre maximal de retouches");
        return;
      }
      const stroke: BrushStroke = { points: [inPage], width: Math.max(1, current.brushWidth), color: region.mask.color };
      const key = nextKey();
      gestureRef.current = { kind: "brush", pane, moved: true, id: region.id, key, stroke };
      current.onPatchRegion(region.id, (target) => ({ ...target, mask: { ...target.mask, strokes: [...target.mask.strokes, stroke] } }), key);
      return;
    }

    // Outil de sélection. Alt, ou le volet d'origine, vise le contour plutôt que le texte.
    const preferOutline = event.altKey || kind === "original";
    const selected = selectedRegion();

    if (isDouble && selected) {
      if (preferOutline) {
        const vertex = nearestVertexIndex(point, selected.outline, tolerance);
        const edge = nearestEdgeIndex(point, selected.outline, tolerance);
        if (vertex >= 0 && selected.outline.length > 3) {
          // Double-clic sur un sommet : il disparaît.
          current.onPatchRegion(selected.id, (region) => ({ ...region, outline: region.outline.filter((_, index) => index !== vertex) }), nextKey());
          return;
        }
        if (vertex < 0 && edge >= 0) {
          // Double-clic sur un côté : un sommet de plus, à cet endroit.
          current.onPatchRegion(
            selected.id,
            (region) => ({ ...region, outline: [...region.outline.slice(0, edge + 1), inPage, ...region.outline.slice(edge + 1)] }),
            nextKey(),
          );
          return;
        }
      } else if (pickRegion(point, kind, false)?.region.id === selected.id) {
        current.onEditText(selected.id);
        return;
      }
    }

    const handle = pickHandle(point, kind, preferOutline);
    if (handle?.type === "box") {
      const start = handle.region.text.box;
      gestureRef.current =
        handle.handle === "rotate"
          ? // La poignée est saisie à quelques pixels de son centre : sans cet écart, la boîte sauterait au premier mouvement.
            { kind: "rotate", pane, moved: false, id: handle.region.id, key: nextKey(), start, offset: normalizeAngle(start.rotation - rotationToward(start, point)) }
          : { kind: "resize", pane, moved: false, id: handle.region.id, key: nextKey(), start, handle: handle.handle };
      return;
    }
    if (handle?.type === "vertex") {
      gestureRef.current = { kind: "vertex", pane, moved: false, id: handle.region.id, key: nextKey(), index: handle.index };
      return;
    }

    const hit = pickRegion(point, kind, preferOutline);
    if (!hit) {
      current.onSelect(null);
      return;
    }
    if (hit.region.id !== current.selectedId) current.onSelect(hit.region.id);
    gestureRef.current =
      hit.part === "text"
        ? { kind: "move-text", pane, moved: false, id: hit.region.id, key: nextKey(), start: hit.region.text.box, origin: point }
        : { kind: "move-outline", pane, moved: false, id: hit.region.id, key: nextKey(), start: hit.region.outline, origin: point };
  };

  /** Curseur de l'outil au repos, selon ce qui se trouve sous le pointeur. */
  const updateCursor = (point: Point, kind: "original" | "translated", altKey: boolean) => {
    const current = propsRef.current;
    if (current.tool === "hand" || current.panning) return setCursor("grab");
    if (current.tool !== "select") return setCursor("crosshair");
    const preferOutline = altKey || kind === "original";
    const handle = pickHandle(point, kind, preferOutline);
    if (handle?.type === "vertex") return setCursor("crosshair");
    if (handle?.type === "box") return setCursor(handle.handle === "rotate" ? "grab" : RESIZE_CURSORS[handle.handle]);
    setCursor(pickRegion(point, kind, preferOutline) ? "move" : "default");
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = propsRef.current;
    const gesture = gestureRef.current;

    if (event.pointerType === "touch" && touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (gesture?.kind === "pinch") {
      const [first, second] = [...touchesRef.current.values()];
      if (!first || !second) return;
      const middle = locate({ clientX: (first.x + second.x) / 2, clientY: (first.y + second.y) / 2 }, gesture.pane).screen;
      const start = gesture.startView;
      const scale = clamp((start.scale * distance(first, second)) / gesture.startDistance, MIN_SCALE, MAX_SCALE);
      // Le point de la page pris entre les doigts au départ y reste.
      const pageX = (gesture.startMiddle.x - start.x) / start.scale;
      const pageY = (gesture.startMiddle.y - start.y) / start.scale;
      setView({ scale, x: middle.x - pageX * scale, y: middle.y - pageY * scale }, true);
      return;
    }

    if (!gesture) {
      const { pane, point } = locate(event);
      hoverRef.current = { pane, point };
      updateCursor(point, panesOf(current.view)[pane], event.altKey);
      if (current.tool === "brush" || draftRef.current.length > 0) requestDraw();
      return;
    }

    const { screen, point } = locate(event, gesture.pane);
    hoverRef.current = { pane: gesture.pane, point };
    const scale = viewRef.current.scale;
    const inPage = clampPoint(point, current.page.width, current.page.height);

    if (gesture.kind === "pan") {
      setView({ ...gesture.startView, x: gesture.startView.x + screen.x - gesture.pointer.x, y: gesture.startView.y + screen.y - gesture.pointer.y }, true);
      return;
    }
    if (gesture.kind === "rect") {
      gesture.current = inPage;
      requestDraw();
      return;
    }
    if (gesture.kind === "brush") {
      const points = gesture.stroke.points;
      if (points.length >= MAX_STROKE_POINTS || distance(points[points.length - 1], inPage) < 2 / scale) return;
      const stroke = { ...gesture.stroke, points: [...points, inPage] };
      gesture.stroke = stroke;
      current.onPatchRegion(gesture.id, (region) => ({ ...region, mask: { ...region.mask, strokes: [...region.mask.strokes.slice(0, -1), stroke] } }), gesture.key);
      return;
    }
    if (gesture.kind === "vertex") {
      const { index } = gesture;
      current.onPatchRegion(gesture.id, (region) => ({ ...region, outline: region.outline.map((vertex, at) => (at === index ? inPage : vertex)) }), gesture.key);
      return;
    }
    if (gesture.kind === "resize") {
      const box = resizeBox(gesture.start, gesture.handle, point, Math.max(4, 12 / scale));
      current.onPatchRegion(gesture.id, (region) => ({ ...region, text: { ...region.text, box } }), gesture.key);
      return;
    }
    if (gesture.kind === "rotate") {
      // Maj : par crans de 15° ; sinon la boîte s'aimante seulement à l'horizontale et à la verticale.
      const raw = normalizeAngle(rotationToward(gesture.start, point) + gesture.offset);
      const rotation = Math.round((event.shiftKey ? snapAngle(raw, 15, 7.5) : snapAngle(raw, 90, 2)) * 10) / 10;
      const box = { ...gesture.start, rotation };
      current.onPatchRegion(gesture.id, (region) => ({ ...region, text: { ...region.text, box } }), gesture.key);
      return;
    }

    // Déplacements : rien ne bouge tant que le pointeur n'a pas vraiment glissé.
    const dx = point.x - gesture.origin.x;
    const dy = point.y - gesture.origin.y;
    if (!gesture.moved && Math.hypot(dx, dy) * scale < DRAG_THRESHOLD) return;
    gesture.moved = true;
    if (gesture.kind === "move-text") {
      const box = { ...gesture.start, x: gesture.start.x + dx, y: gesture.start.y + dy };
      current.onPatchRegion(gesture.id, (region) => ({ ...region, text: { ...region.text, box } }), gesture.key);
    } else {
      // Le contour reste entier dans la page : on borne le déplacement, pas chaque point.
      const bounds = boundsOf(gesture.start);
      const boundedX = clamp(dx, -bounds.x, current.page.width - bounds.x - bounds.width);
      const boundedY = clamp(dy, -bounds.y, current.page.height - bounds.y - bounds.height);
      const outline = translatePoints(gesture.start, boundedX, boundedY);
      current.onPatchRegion(gesture.id, (region) => ({ ...region, outline }), gesture.key);
    }
  };

  const endGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    touchesRef.current.delete(event.pointerId);
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (gesture.kind === "rect" && event.type !== "pointercancel") {
      const rect = rectFromCorners(gesture.origin, gesture.current);
      const scale = viewRef.current.scale;
      if (rect.width * scale >= 6 && rect.height * scale >= 6) propsRef.current.onCreateRegion(rectToPolygon(rect), gesture.sfx ? "sfx" : undefined);
    }
    if (gesture.kind === "pan") setCursor(propsRef.current.tool === "hand" || propsRef.current.panning ? "grab" : "default");
    requestDraw();
  };

  const onContextMenu = (event: React.MouseEvent) => {
    const current = propsRef.current;
    const { pane, point } = locate(event);
    const hit = pickRegion(point, panesOf(current.view)[pane], false);
    // Hors d'une zone il n'y a rien à proposer : ni notre menu, ni celui du navigateur.
    if (!hit) {
      event.preventDefault();
      return;
    }
    if (hit.region.id !== current.selectedId) current.onSelect(hit.region.id);
  };

  const activeTool = TOOLS.find((entry) => entry.id === tool);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={onContextMenu}>
        <div
          ref={containerRef}
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[repeating-conic-gradient(color-mix(in_oklch,var(--foreground)_4%,transparent)_0_25%,transparent_0_50%)] bg-[length:24px_24px]"
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block h-full w-full touch-none select-none"
            style={{ cursor: panning && cursor !== "grabbing" ? "grab" : cursor }}
            aria-label="Page en cours de lettrage"
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onPointerLeave={() => {
              if (gestureRef.current) return;
              hoverRef.current = null;
              requestDraw();
            }}
          />
          {activeTool && (
            <p className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit max-w-[calc(100%-2rem)] truncate rounded-md bg-background/85 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
              {activeTool.hint}
            </p>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">{props.menu}</ContextMenuContent>
    </ContextMenu>
  );
}
