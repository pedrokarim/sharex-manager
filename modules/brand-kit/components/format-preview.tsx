"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Download, FileImage, ImageUp, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api, errorMessage, type FormatExport } from "../lib/client";
import { FORMATS, buildFormat, type BuiltFormat, type FormatId, type FormatSpec } from "../lib/formats";
import type { BrandKit } from "../lib/types";
import { drawProject, onImageLoaded, renderFormatPng } from "./format-render";

const CHECKERBOARD =
  "repeating-conic-gradient(color-mix(in oklch, var(--muted-foreground) 18%, transparent) 0% 25%, transparent 0% 50%) 50% / 16px 16px";

type Drawable = Pick<BuiltFormat, "project" | "frame"> & { spec: Pick<FormatSpec, "width" | "height" | "safeArea" | "transparent"> };

/** Largeur affichée d'un élément, suivie au fil des redimensionnements. */
function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Ajuste la définition du canevas à sa taille affichée (deux fois au plus sur un écran dense). */
function fitCanvas(element: HTMLCanvasElement, cssWidth: number, spec: { width: number; height: number }) {
  const ratio = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.min(spec.width, Math.round(cssWidth * ratio)));
  const height = Math.max(1, Math.round((width * spec.height) / spec.width));
  if (element.width !== width || element.height !== height) {
    element.width = width;
    element.height = height;
  }
}

function SafeArea({ spec }: { spec: Drawable["spec"] }) {
  const safe = spec.safeArea;
  if (!safe) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute border-2 border-dashed border-white/85 mix-blend-difference"
      style={{ left: `${safe.x * 100}%`, top: `${safe.y * 100}%`, width: `${safe.width * 100}%`, height: `${safe.height * 100}%` }}
    />
  );
}

/**
 * Un projet d'une image dessiné à la taille où il est affiché (le PNG plein
 * format n'est rendu qu'à l'export). Sert aux formats et aux aperçus de styles.
 */
export function FormatCanvas({
  built,
  fontsVersion,
  ready,
  showSafeArea = false,
  round = false,
  className,
  style,
}: {
  built: Drawable;
  /** Change quand une police finit de charger : il faut redessiner. */
  fontsVersion: number;
  ready: boolean;
  showSafeArea?: boolean;
  round?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cssWidth = useWidth(wrapper);
  const [imageTick, setImageTick] = useState(0);
  const { spec } = built;

  useEffect(() => onImageLoaded(() => setImageTick((tick) => tick + 1)), []);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !ready || cssWidth === 0) return;
    const frame = requestAnimationFrame(() => {
      fitCanvas(element, cssWidth, spec);
      drawProject(element, built.project, built.frame);
    });
    return () => cancelAnimationFrame(frame);
  }, [built, cssWidth, ready, fontsVersion, imageTick, spec]);

  return (
    <div
      ref={wrapper}
      className={cn("relative overflow-hidden", round ? "rounded-full" : "rounded-md", className)}
      style={{ aspectRatio: `${spec.width} / ${spec.height}`, background: spec.transparent ? CHECKERBOARD : undefined, ...style }}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
      {showSafeArea && <SafeArea spec={spec} />}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
          <Loader2 aria-label="Chargement des polices" className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

const secondsFormat = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Pause sur la dernière image avant de rejouer, en secondes. */
const HOLD = 0.8;

/**
 * Carton de fin joué à sa durée réelle, en boucle : on juge le rythme des
 * apparitions sans exporter de vidéo. Arrêté d'emblée quand le système
 * demande moins d'animations.
 */
export function AnimatedFormatCanvas({
  built,
  seconds,
  fontsVersion,
  ready,
  className,
  style,
}: {
  built: Drawable;
  seconds: number;
  fontsVersion: number;
  ready: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduced = useReducedMotion();
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const cssWidth = useWidth(wrapper);
  const [playing, setPlaying] = useState(!reduced);
  const [imageTick, setImageTick] = useState(0);
  const elapsed = useRef(0);
  const { spec, project } = built;
  const fps = project.fps;
  const frames = Math.max(1, Math.round(seconds * fps));

  useEffect(() => onImageLoaded(() => setImageTick((tick) => tick + 1)), []);
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !ready || cssWidth === 0) return;
    fitCanvas(element, cssWidth, spec);
    const paint = () => {
      const time = Math.min(elapsed.current, seconds);
      drawProject(element, project, Math.min(frames - 1, Math.floor(time * fps)));
      if (bar.current) bar.current.style.width = `${(time / seconds) * 100}%`;
      if (clock.current) clock.current.textContent = `${secondsFormat.format(time)} s / ${secondsFormat.format(seconds)} s`;
    };
    if (!playing) {
      // À l'arrêt, la dernière image montrée, ou l'image finale.
      if (elapsed.current === 0) elapsed.current = seconds;
      paint();
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += (now - last) / 1000;
      last = now;
      if (elapsed.current > seconds + HOLD) elapsed.current = 0;
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, ready, cssWidth, spec, project, frames, fps, seconds, fontsVersion, imageTick]);

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)} style={style}>
      <div ref={wrapper} className="relative w-full overflow-hidden rounded-md" style={{ aspectRatio: `${spec.width} / ${spec.height}` }}>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
            <Loader2 aria-label="Chargement des polices" className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={playing ? "Mettre en pause" : "Lire le carton de fin"}
          onClick={() => {
            if (!playing && elapsed.current >= seconds) elapsed.current = 0;
            setPlaying((value) => !value);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Rejouer depuis le début"
          onClick={() => {
            elapsed.current = 0;
            setPlaying(true);
          }}
        >
          <RotateCcw />
        </Button>
        <div className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div ref={bar} className="absolute inset-y-0 left-0 bg-primary" />
        </div>
        <span ref={clock} className="shrink-0 text-xs text-muted-foreground tabular-nums" />
      </div>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function slugOf(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "marque";
}

type ExportState = "waiting" | "running" | "done" | "error";

/**
 * Aperçu des formats d'une chaîne : les vignettes de tous les formats servent
 * d'onglets, le format choisi est agrandi (le carton de fin joué), l'export de
 * tous les formats montre l'avancement de chacun.
 */
export function FormatsPanel({
  kit,
  exports,
  onExportsChange,
  fontsVersion,
  fontsReady,
  beforeExport,
  selected,
  onSelect,
}: {
  kit: BrandKit;
  exports: FormatExport[];
  onExportsChange: (update: (previous: FormatExport[]) => FormatExport[]) => void;
  fontsVersion: number;
  fontsReady: boolean;
  /** Envoie la fiche en attente avant de produire les fichiers. */
  beforeExport: () => Promise<void>;
  selected: FormatId;
  onSelect: (id: FormatId) => void;
}) {
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [coverTitle, setCoverTitle] = useState("");
  const [exporting, setExporting] = useState<FormatId | null>(null);
  const [batch, setBatch] = useState<Partial<Record<FormatId, ExportState>> | null>(null);
  const [sending, setSending] = useState<FormatId | null>(null);

  const built = useMemo(() => {
    const map = new Map<FormatId, BuiltFormat>();
    for (const spec of FORMATS) map.set(spec.id, buildFormat(kit, spec.id, { coverTitle }));
    return map;
  }, [kit, coverTitle]);

  const current = built.get(selected)!;
  const spec = current.spec;
  const exported = exports.find((entry) => entry.format === selected);
  const stale = exported ? exported.updatedAt < kit.updatedAt : false;
  const isEndCard = selected === "endcard-vertical" || selected === "endcard-horizontal";

  const exportOne = async (id: FormatId) => {
    const png = await renderFormatPng(kit, buildFormat(kit, id, { coverTitle }));
    const saved = await api.saveFormatExport(kit.id, id, png);
    onExportsChange((previous) => [...previous.filter((entry) => entry.format !== id), saved]);
  };

  const exportSelected = async () => {
    setExporting(selected);
    try {
      await beforeExport();
      await exportOne(selected);
      toast.success(`${spec.label} exporté en PNG`);
    } catch (error) {
      toast.error(errorMessage(error, "Export impossible."));
    } finally {
      setExporting(null);
    }
  };

  const exportAll = async () => {
    const states: Partial<Record<FormatId, ExportState>> = Object.fromEntries(FORMATS.map((format) => [format.id, "waiting"]));
    setBatch({ ...states });
    const failures: string[] = [];
    try {
      await beforeExport();
      for (const format of FORMATS) {
        setExporting(format.id);
        states[format.id] = "running";
        setBatch({ ...states });
        try {
          await exportOne(format.id);
          states[format.id] = "done";
        } catch (error) {
          states[format.id] = "error";
          failures.push(`${format.label} : ${errorMessage(error, "échec")}`);
        }
        setBatch({ ...states });
      }
      if (failures.length === 0) toast.success("Tous les formats sont exportés");
      else toast.error(failures.join("\n"));
    } catch (error) {
      toast.error(errorMessage(error, "Export impossible."));
    } finally {
      setExporting(null);
      // L'état de chaque format reste lisible un instant après la fin.
      setTimeout(() => setBatch(null), 2500);
    }
  };

  const sendToGallery = async (id: FormatId) => {
    setSending(id);
    try {
      await api.sendFormatToGallery(kit.id, id);
      toast.success("Ajouté à la galerie");
    } catch (error) {
      toast.error(errorMessage(error, "Envoi impossible."));
    } finally {
      setSending(null);
    }
  };

  const busy = exporting !== null || (batch !== null && Object.values(batch).some((state) => state === "waiting" || state === "running"));
  const batchDone = batch ? Object.values(batch).filter((state) => state === "done" || state === "error").length : 0;
  const ratio = spec.width / spec.height;
  // Le grand aperçu tient dans la hauteur visible, quel que soit le rapport du format.
  const largeWidth = selected === "avatar" ? "min(100%, 300px)" : `min(100%, calc(58svh * ${ratio}))`;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold tracking-tight">Aperçu des formats</h2>
        <label data-disabled={spec.safeArea ? undefined : ""} className="flex items-center gap-2 text-sm text-muted-foreground data-[disabled]:opacity-50">
          <Switch checked={showSafeArea} onCheckedChange={setShowSafeArea} disabled={!spec.safeArea} />
          Zone sûre
        </label>
        <Button size="sm" className="ml-auto gap-2" onClick={() => void exportAll()} disabled={busy}>
          {batch && busy ? <Loader2 className="size-4 animate-spin" /> : <FileImage className="size-4" />}
          Tout exporter en PNG
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {batch && (
          <motion.div key="batch" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Progress value={(batchDone / FORMATS.length) * 100} className="h-1.5 flex-1" aria-label="Avancement de l’export" />
              <span className="tabular-nums">
                {batchDone}/{FORMATS.length}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div role="tablist" aria-label="Formats" className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
        {FORMATS.map((format) => (
          <FormatTab
            key={format.id}
            spec={format}
            built={built.get(format.id)!}
            selected={format.id === selected}
            state={batch?.[format.id] ?? (exporting === format.id ? "running" : undefined)}
            exported={exports.find((entry) => entry.format === format.id)}
            kitUpdatedAt={kit.updatedAt}
            fontsVersion={fontsVersion}
            fontsReady={fontsReady}
            onSelect={() => onSelect(format.id)}
          />
        ))}
      </div>

      <div role="tabpanel" aria-label={spec.label} className="flex flex-col gap-3">
        <div className="flex min-h-[200px] items-center justify-center rounded-xl bg-muted/40 p-3">
          <div className="flex w-full flex-wrap items-end justify-center gap-5">
            {isEndCard ? (
              <AnimatedFormatCanvas
                key={selected}
                built={current}
                seconds={kit.endCard.enabled ? kit.endCard.seconds : 2.5}
                fontsVersion={fontsVersion}
                ready={fontsReady}
                style={{ width: largeWidth }}
              />
            ) : (
              <FormatCanvas
                key={selected}
                built={current}
                fontsVersion={fontsVersion}
                ready={fontsReady}
                showSafeArea={showSafeArea}
                className="shadow-md"
                style={{ width: largeWidth }}
                round={selected === "avatar"}
              />
            )}
            {selected === "avatar" && (
              <div className="flex items-end gap-4">
                {[88, 40].map((size) => (
                  <div key={size} className="flex flex-col items-center gap-1.5">
                    <FormatCanvas built={current} fontsVersion={fontsVersion} ready={fontsReady} round style={{ width: size }} />
                    <span className="text-[11px] text-muted-foreground tabular-nums">{size}&nbsp;px</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-sm font-medium">
              {spec.label}{" "}
              <span className="font-normal text-muted-foreground tabular-nums">
                {spec.width}&nbsp;×&nbsp;{spec.height}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {spec.note}
              {isEndCard && !kit.endCard.enabled && " Le carton de fin est désactivé pour les vidéos."}
              {exported && (
                <>
                  {" "}
                  Exporté le {dateFormat.format(exported.updatedAt)}
                  {stale ? ", la marque a changé depuis." : "."}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void exportSelected()} disabled={busy}>
              {exporting === selected && !batch ? <Loader2 className="size-4 animate-spin" /> : <FileImage className="size-4" />}
              {exported ? "Réexporter" : "Exporter"}
            </Button>
            {exported && (
              <>
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <a href={exported.url} download={`${slugOf(kit.name)}-${selected}.png`}>
                    <Download className="size-4" />
                    Télécharger
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => void sendToGallery(selected)} disabled={sending === selected}>
                  {sending === selected ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
                  Vers la galerie
                </Button>
              </>
            )}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {selected === "short-cover" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="grid max-w-md gap-1.5 pt-1">
                <Label htmlFor="brand-kit-cover-title" className="text-xs font-medium">
                  Titre d’exemple
                </Label>
                <Input id="brand-kit-cover-title" value={coverTitle} onChange={(event) => setCoverTitle(event.target.value)} maxLength={80} placeholder="Titre d’exemple" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FormatTab({
  spec,
  built,
  selected,
  state,
  exported,
  kitUpdatedAt,
  fontsVersion,
  fontsReady,
  onSelect,
}: {
  spec: FormatSpec;
  built: BuiltFormat;
  selected: boolean;
  state?: ExportState;
  exported?: FormatExport;
  kitUpdatedAt: number;
  fontsVersion: number;
  fontsReady: boolean;
  onSelect: () => void;
}) {
  const ratio = spec.width / spec.height;
  const stale = exported ? exported.updatedAt < kitUpdatedAt : false;
  const status =
    state === "running"
      ? "export en cours"
      : state === "waiting"
        ? "en attente d’export"
        : state === "error"
          ? "export échoué"
          : exported
            ? stale
              ? "exporté, la marque a changé depuis"
              : "exporté"
            : "pas encore exporté";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-label={`${spec.label}, ${status}`}
      title={`${spec.label} · ${status}`}
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 rounded-lg p-1 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected ? "bg-primary/10" : "hover:bg-muted"
      )}
    >
      <span className="relative flex h-14 items-center justify-center">
        <FormatCanvas
          built={built}
          fontsVersion={fontsVersion}
          ready={fontsReady}
          round={spec.id === "avatar"}
          className="shadow-sm"
          style={ratio >= 1.4 ? { width: "100%" } : { height: "100%" }}
        />
        {(state === "running" || state === "waiting") && (
          <span className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
            {state === "running" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <span className="size-1.5 rounded-full bg-muted-foreground" />}
          </span>
        )}
      </span>
      <span className="flex min-h-7 min-w-0 items-start gap-1 px-0.5">
        <span className="line-clamp-2 min-w-0 flex-1 text-[11px] leading-tight font-medium">{spec.label}</span>
        {state === "error" ? (
          <AlertTriangle aria-hidden className="mt-px size-3 shrink-0 text-destructive" />
        ) : state === "done" || (exported && !state) ? (
          <Check aria-hidden className={cn("mt-px size-3 shrink-0", stale && !state ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")} />
        ) : null}
      </span>
    </button>
  );
}
