"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CloudOff,
  Film,
  FolderOpen,
  Mic,
  Music,
  Redo2,
  Type,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LoadingState } from "@/components/loading";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  addItem,
  changeAspect,
  createAudioItem,
  createMusicItems,
  captionAllVoices,
  captionForVoice,
  createImageItem,
  createShapeItem,
  createTextItem,
  createVideoItem,
  duplicateItem,
  findItem,
  mainTrackEnd,
  mainTrackId,
  moveItem,
  pruneTracks,
  removeItem,
  splitItem,
  trimItem,
  updateItem,
  updateTrack,
} from "../engine/edit";
import { MediaLibrary, PreviewPlayer } from "../engine/preview";
import { msToFrames, projectDuration } from "../engine/timeline";
import {
  ASPECTS,
  type AspectPreset,
  type ClipItem,
  type ClipProject,
  type MediaSource,
  type ShapeItem,
} from "../engine/types";
import { applyBrandTheme } from "../engine/brand";
import { callModule, fetchBrandTheme, useBrandFonts, useBrandKits } from "../lib/client";
import { brandFontsOf, ensureBrandFonts, ensureProjectFonts } from "../lib/fonts";
import { Inspector, ProjectInspector } from "../components/inspector";
import { MediaPanel } from "../components/media-panel";
import { PreviewStage } from "../components/preview-stage";
import { TextPanel } from "../components/text-panel";
import { VoicePanel } from "../components/voice-panel";
import { MusicPanel } from "../components/music-panel";
import { Timeline } from "../components/timeline";
import { TrackVoiceDialog } from "../components/track-voice-dialog";
import { applyVoiceReplacements } from "../engine/revoice";
import { useProjectHistory, type SaveState } from "../components/use-project-history";

export default function EditorPage() {
  const params = useSearchParams();
  const id = params.get("id");
  const [project, setProject] = useState<ClipProject | null | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      setProject(null);
      return;
    }
    callModule<ClipProject | null>("getProject", id)
      .then(setProject)
      .catch(() => setProject(null));
  }, [id]);

  if (project === undefined) {
    return (
      <LoadingState label="Ouverture du projet…" state="shaping" fill />
    );
  }
  if (project === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <p className="text-sm text-muted-foreground">Ce projet est introuvable.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/m/clip-studio">Retour aux projets</Link>
        </Button>
      </div>
    );
  }
  return (
    <MotionConfig reducedMotion="user">
      <Editor key={project.id} initial={project} />
    </MotionConfig>
  );
}

type Panel = "media" | "text" | "voice" | "music";

function Editor({ initial }: { initial: ClipProject }) {
  const { project, commit, undo, redo, canUndo, canRedo, saveState } = useProjectHistory(initial);
  const projectRef = useRef(project);
  projectRef.current = project;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PreviewPlayer | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>("media");
  // Téléphone : les panneaux et l'inspecteur passent par-dessus l'aperçu au lieu de le pousser hors de l'écran.
  const narrow = useIsMobile();
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setPanel(null);
  }, []);
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  // ─── Lecteur ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const audioContext = new AudioContext();
    const player = new PreviewPlayer(canvas, () => projectRef.current, new MediaLibrary(audioContext), (next, isPlaying) => {
      setFrame(next);
      setPlaying(isPlaying);
    });
    playerRef.current = player;
    player.prefetchAudio();
    player.render();
    return () => {
      player.dispose();
      void audioContext.close();
    };
  }, []);

  // ─── Polices ───────────────────────────────────────────────────
  // Elles arrivent après le premier rendu : on redessine une fois prêtes, et
  // de nouveau quand la marque du projet ou ses polices changent.
  const fontKey = `${project.brandKitId ?? ""}|${brandFontsOf(project)
    .map((font) => font.family)
    .sort()
    .join(",")}`;
  const warnedFonts = useRef(new Set<string>());
  useEffect(() => {
    let alive = true;
    void ensureProjectFonts(projectRef.current).then((missing) => {
      if (!alive) return;
      if (!playerRef.current?.playing) playerRef.current?.render();
      warnMissingFonts(missing, warnedFonts.current);
    });
    return () => {
      alive = false;
    };
  }, [fontKey]);

  const brandKits = useBrandKits();
  const brandFonts = useBrandFonts(project.brandKitId);

  /** Applique, change ou retire la marque, en une étape d'annulation. */
  const applyBrand = useCallback(
    async (kitId: string | null) => {
      const theme = kitId ? await fetchBrandTheme(kitId) : null;
      // Polices chargées avant le changement : le premier rendu de la marque est le bon.
      if (theme) warnMissingFonts(await ensureBrandFonts(theme.fonts), warnedFonts.current);
      commit((current) => applyBrandTheme(current, theme));
    },
    [commit]
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.prefetchAudio();
    if (!player.playing) player.render();
  }, [project]);

  const seek = useCallback((next: number) => playerRef.current?.seek(next), []);
  const togglePlay = useCallback(() => playerRef.current?.toggle(), []);

  // ─── Modifications ─────────────────────────────────────────────
  const addSource = useCallback(
    (source: MediaSource, at?: { trackId: string; frame: number }) => {
      const current = projectRef.current;
      const fps = current.fps;
      let item: ClipItem;
      if (source.kind === "image") item = createImageItem(source, at?.frame ?? mainTrackEnd(current), fps);
      else if (source.kind === "video") item = createVideoItem(source, at?.frame ?? mainTrackEnd(current), fps);
      else item = createAudioItem(source, at?.frame ?? playerRef.current?.frame ?? 0, fps);
      commit((project) => addItem(project, item, at?.trackId ?? (source.kind === "audio" ? undefined : mainTrackId(project))));
      setSelectedId(item.id);
    },
    [commit]
  );

  /** Voix off : à la tête de lecture, sur une piste Voix libre ou nouvelle. */
  const addVoice = useCallback(
    (source: MediaSource, captions: boolean) => {
      const current = projectRef.current;
      // Une voix se lit presque à plein volume et sans fondu, contrairement à
      // une musique ; la marge évite la saturation quand les deux se mêlent.
      const item = { ...createAudioItem(source, playerRef.current?.frame ?? 0, current.fps), volume: 0.9, fadeIn: 0, fadeOut: 0 };
      const voiceTrack = current.tracks.find((track) => track.kind === "audio" && track.name.startsWith("Voix"));
      commit((project) => {
        const next = addItem(project, item, voiceTrack?.id, "Voix");
        const caption = captions ? captionForVoice(next, item) : null;
        return caption ? addItem(next, caption, undefined, "Sous-titres") : next;
      });
      setSelectedId(item.id);
    },
    [commit]
  );

  /**
   * Musique de fond : de la tête de lecture à la fin du clip, bouclée si
   * besoin, sur une piste Musique. En fin de clip, le morceau entier.
   */
  const addMusic = useCallback(
    (source: MediaSource) => {
      const current = projectRef.current;
      const fps = current.fps;
      const start = playerRef.current?.frame ?? 0;
      const end = projectDuration(current);
      const until = end - start >= 2 * fps ? end : start + msToFrames(source.durationMs ?? 30_000, fps);
      const items = createMusicItems(source, start, until, fps);
      commit((project) => items.reduce((next, item) => addItem(next, item, undefined, "Musique"), project));
      setSelectedId(items[0]?.id ?? null);
    },
    [commit]
  );

  const addText = (presetId: string) => {
    const item = createTextItem(presetId, frame, project.fps);
    const textTrack = project.tracks.find((track) => track.kind === "visual" && track.name === "Texte");
    commit((current) => addItem(current, item, textTrack?.id));
    setSelectedId(item.id);
  };

  const addShape = (shape: ShapeItem["shape"]) => {
    const item = createShapeItem(shape, frame, project.fps);
    const textTrack = project.tracks.find((track) => track.kind === "visual" && track.name === "Texte");
    commit((current) => addItem(current, item, textTrack?.id));
    setSelectedId(item.id);
  };

  const deleteSelected = useCallback(
    (itemId: string) => {
      commit((current) => pruneTracks(removeItem(current, itemId)));
      setSelectedId((selected) => (selected === itemId ? null : selected));
    },
    [commit]
  );

  const split = useCallback(
    (itemId: string) => {
      const current = playerRef.current?.frame ?? 0;
      const found = findItem(projectRef.current, itemId);
      if (!found || current <= found.item.start || current >= found.item.start + found.item.duration) {
        toast.info("Placez la tête de lecture sur l'élément pour le scinder");
        return;
      }
      commit((project) => splitItem(project, itemId, current));
    },
    [commit]
  );

  const duplicate = useCallback(
    (itemId: string) => {
      // La copie est calculée ici : l'identifiant doit être connu avant de
      // sélectionner, et React n'exécute la mise à jour que plus tard.
      const result = duplicateItem(projectRef.current, itemId);
      commit(() => result.project);
      setSelectedId(result.id);
    },
    [commit]
  );

  // ─── Clavier ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const current = playerRef.current?.frame ?? 0;
      const fps = projectRef.current.fps;

      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (ctrl && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (ctrl && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (ctrl && event.key.toLowerCase() === "d" && selectedId) {
        event.preventDefault();
        duplicate(selectedId);
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        deleteSelected(selectedId);
      } else if (event.key.toLowerCase() === "s" && !ctrl && selectedId) {
        event.preventDefault();
        split(selectedId);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seek(current - (event.shiftKey ? fps : 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seek(current + (event.shiftKey ? fps : 1));
      } else if (!ctrl && event.key.toLowerCase() === "k") {
        // J, K, L : recul, pause, lecture, comme dans les monteurs vidéo.
        playerRef.current?.pause();
      } else if (!ctrl && event.key.toLowerCase() === "l") {
        if (!playerRef.current?.playing) togglePlay();
      } else if (!ctrl && event.key.toLowerCase() === "j") {
        // La lecture à l'envers n'existe pas : chaque appui recule d'une
        // seconde (cinq avec Maj), lecture arrêtée.
        playerRef.current?.pause();
        seek(current - (event.shiftKey ? 5 : 1) * fps);
      } else if (!ctrl && event.key.toLowerCase() === "m") {
        setPanel((open) => (open === "media" ? null : "media"));
      } else if (event.key === "Home") {
        seek(0);
      } else if (event.key === "End") {
        seek(projectDuration(projectRef.current) - 1);
      } else if (event.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, togglePlay, undo, redo, duplicate, deleteSelected, split, seek]);

  const selected = selectedId ? findItem(project, selectedId)?.item ?? null : null;
  // Sans sélection, l'inspecteur montre le projet, tant que le module des marques est là.
  // Sur un téléphone, il ne s'ouvre pas tout seul : il couvrirait l'aperçu.
  const projectInspector = !selected && Array.isArray(brandKits) && !narrow;
  /** Piste dont on change la voix (fenêtre ouverte), sinon `null`. */
  const [voiceTrackId, setVoiceTrackId] = useState<string | null>(null);

  return (
    <div className="-mx-4 -mb-4 flex h-[calc(100svh-var(--header-height)-1rem)] min-h-[560px] flex-col overflow-hidden border-t">
      {/* ─── En-tête ─────────────────────────────────────────────── */}
      <header className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link href="/m/clip-studio" aria-label="Retour aux projets">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Projets</TooltipContent>
        </Tooltip>
        <Input
          value={project.name}
          onChange={(event) => commit((current) => ({ ...current, name: event.target.value }), "name")}
          className="h-8 w-56 min-w-0 shrink border-transparent bg-transparent px-2 text-sm font-semibold shadow-none hover:border-border focus-visible:border-border"
          aria-label="Nom du clip"
        />
        <Select
          value={project.aspect}
          onValueChange={(aspect) => commit((current) => changeAspect(current, aspect as AspectPreset))}
        >
          <SelectTrigger size="sm" className="h-8 w-auto shrink-0 gap-2 text-xs max-sm:[&_[data-aspect-label]]:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ASPECTS) as AspectPreset[]).map((aspect) => (
              <SelectItem key={aspect} value={aspect} className="text-xs">
                {aspect}
                {/* Sur un téléphone, le bouton ne garde que le rapport : la place va au nom du clip. */}
                <span data-aspect-label>· {ASPECTS[aspect].label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SaveIndicator state={saveState} />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton label="Annuler (Ctrl Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Rétablir (Ctrl Maj Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <Button
            size="sm"
            className="ml-2 h-8 gap-2"
            loading={exporting}
            onClick={async () => {
              // L'écran Exporter relit le projet : il est enregistré d'abord, tel qu'on le voit.
              playerRef.current?.pause();
              setExporting(true);
              try {
                await callModule("saveProject", projectRef.current);
                router.push(`/m/clip-studio/export?project=${encodeURIComponent(projectRef.current.id)}`);
              } catch (error) {
                setExporting(false);
                toast.error(error instanceof Error ? error.message : "Enregistrement impossible avant l’export");
              }
            }}
          >
            <Film className="h-4 w-4" />
            <span className="max-sm:sr-only">Exporter</span>
          </Button>
        </div>
      </header>

      {/* ─── Espace de travail ──────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1">
        <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r py-2" aria-label="Panneaux">
          <RailButton label="Médias" shortcut="M" active={panel === "media"} onClick={() => setPanel(panel === "media" ? null : "media")}>
            <FolderOpen className="h-5 w-5" />
          </RailButton>
          <RailButton label="Texte" active={panel === "text"} onClick={() => setPanel(panel === "text" ? null : "text")}>
            <Type className="h-5 w-5" />
          </RailButton>
          <RailButton label="Voix" active={panel === "voice"} onClick={() => setPanel(panel === "voice" ? null : "voice")}>
            <Mic className="h-5 w-5" />
          </RailButton>
          <RailButton label="Musique" active={panel === "music"} onClick={() => setPanel(panel === "music" ? null : "music")}>
            <Music className="h-5 w-5" />
          </RailButton>
        </nav>

        <AnimatePresence initial={false}>
          {panel && (
            <motion.aside
              key="panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn("shrink-0 overflow-hidden border-r", narrow && "absolute inset-y-0 left-14 z-20 bg-background shadow-lg")}
            >
              <div className="h-full w-[300px] max-w-[calc(100vw-3.5rem)]">
                {panel === "media" && <MediaPanel onAdd={(source) => addSource(source)} />}
                {panel === "text" && <TextPanel onAddText={addText} onAddShape={addShape} />}
                {panel === "music" && <MusicPanel onAdd={addMusic} />}
                {panel === "voice" && (
                  <VoicePanel
                    selectedText={selected?.type === "text" && !selected.karaoke ? selected.text : undefined}
                    onAdd={addVoice}
                    onCaptionAll={() => {
                      const { project: next, count } = captionAllVoices(projectRef.current);
                      if (count) commit(() => next);
                      return count;
                    }}
                  />
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <PreviewStage
          project={project}
          frame={frame}
          selectedId={selectedId}
          onSelect={setSelectedId}
          canvasRef={canvasRef}
          onTransform={(itemId, transform) =>
            commit((current) => updateItem(current, itemId, { transform } as Partial<ClipItem>), `transform-${itemId}`)
          }
        />

        <AnimatePresence initial={false}>
          {(selected || projectInspector) && (
            <motion.aside
              key="inspector"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn("shrink-0 overflow-hidden border-l", narrow && "absolute inset-y-0 right-0 z-20 bg-background shadow-lg")}
            >
              <div className="h-full w-[300px] max-w-[100vw]">
                {selected ? (
                  <Inspector
                    project={project}
                    item={selected}
                    brandFonts={brandFonts}
                    onClose={() => setSelectedId(null)}
                    onCaption={(itemId) => {
                      const found = findItem(projectRef.current, itemId);
                      if (found?.item.type !== "audio") return;
                      const caption = captionForVoice(projectRef.current, found.item);
                      if (!caption) return;
                      commit((current) => addItem(current, caption, undefined, "Sous-titres"));
                      setSelectedId(caption.id);
                    }}
                    onPatch={(patch, key) =>
                      commit((current) => updateItem(current, selected.id, patch), `inspect-${selected.id}-${key}`)
                    }
                    onChangeTrackVoice={setVoiceTrackId}
                  />
                ) : (
                  <ProjectInspector project={project} kits={brandKits ?? []} onApplyBrand={applyBrand} />
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Timeline ───────────────────────────────────────────── */}
      <div className="h-[280px] shrink-0 border-t bg-card/30">
        <Timeline
          project={project}
          frame={frame}
          playing={playing}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={seek}
          onTogglePlay={togglePlay}
          onMove={(itemId, start, trackId) => commit((current) => moveItem(current, itemId, start, trackId))}
          onTrim={(itemId, edge, at) => commit((current) => trimItem(current, itemId, edge, at), `trim-${itemId}-${edge}`)}
          onTrimEnd={() => undefined}
          onSplit={split}
          onDuplicate={duplicate}
          onDelete={deleteSelected}
          onItemPatch={(itemId, patch) => commit((current) => updateItem(current, itemId, patch))}
          onTrackPatch={(trackId, patch, key) => commit((current) => updateTrack(current, trackId, patch), key)}
          onDropMedia={(payload, trackId, at) => {
            try {
              addSource(JSON.parse(payload) as MediaSource, { trackId, frame: at });
            } catch {
              toast.error("Média illisible");
            }
          }}
          onChangeTrackVoice={setVoiceTrackId}
        />
      </div>
      <TrackVoiceDialog
        project={project}
        trackId={voiceTrackId}
        onOpenChange={(open) => !open && setVoiceTrackId(null)}
        onApply={(trackId, replacements) => {
          // Une seule modification du projet : une seule étape d'annulation.
          const { overlaps } = applyVoiceReplacements(projectRef.current, trackId, replacements);
          commit((current) => applyVoiceReplacements(current, trackId, replacements).project);
          return { overlaps };
        }}
      />

    </div>
  );
}

/** Signale, une fois chacune, les polices de marque qui n'ont pas pu être chargées. */
function warnMissingFonts(missing: string[], warned: Set<string>) {
  const fresh = missing.filter((family) => !warned.has(family));
  if (fresh.length === 0) return;
  for (const family of fresh) warned.add(family);
  toast.warning(
    fresh.length > 1 ? `${fresh.length} polices de la marque n’ont pas pu être chargées` : "Une police de la marque n’a pas pu être chargée",
    { description: "Le texte s’affiche avec une police de repli." }
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      {state === "saved" && <Check className="h-3.5 w-3.5 text-emerald-500" />}
      {(state === "saving" || state === "pending") && <Spinner className="size-3.5" aria-hidden />}
      {state === "error" && <CloudOff className="h-3.5 w-3.5 text-destructive" />}
      <span className={cn("max-sm:sr-only", state === "error" && "text-destructive")}>
        {state === "saved" ? "Enregistré" : state === "error" ? "Enregistrement impossible" : "Enregistrement…"}
      </span>
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={disabled} onClick={onClick} aria-label={label}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RailButton({
  label,
  shortcut,
  active,
  onClick,
  children,
}: {
  label: string;
  /** Touche qui ouvre le panneau, rappelée au survol. */
  shortcut?: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : undefined}
      aria-keyshortcuts={shortcut}
      className={cn(
        "relative flex w-12 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {active && (
        <motion.span layoutId="rail-active" className="absolute inset-0 rounded-lg bg-muted" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
      )}
      <span className="relative">{children}</span>
      <span className="relative">{label}</span>
    </button>
  );
}
