"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  BadgeCheck,
  Check,
  CloudUpload,
  ExternalLink,
  Film,
  Globe,
  HardDrive,
  ImageOff,
  Library,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Telescope,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionStatus, FormStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import {
  assetToSource,
  callModule,
  fetchGalleryImages,
  fetchStudioImages,
  importLocalFile,
  type BrowsableMedia,
} from "../lib/client";
import type { ClipAsset, MediaSource } from "../engine/types";
import type { FoundImage, ImportedImage } from "../lib/image-search-types";
import { MEDIA_DRAG_TYPE } from "./timeline";

type Tab = "mine" | "find" | "gallery" | "studio";

const TABS: { id: Tab; label: string; icon: typeof HardDrive }[] = [
  { id: "mine", label: "Mes médias", icon: HardDrive },
  { id: "find", label: "Trouver", icon: Telescope },
  { id: "gallery", label: "Galerie", icon: CloudUpload },
  { id: "studio", label: "Studio IA", icon: Sparkles },
];

/** Médias importés, gardés entre deux ouvertures du panneau. */
let assetsSnapshot: ClipAsset[] | null = null;

export function MediaPanel({ onAdd }: { onAdd: (source: MediaSource) => void }) {
  const [tab, setTab] = useState<Tab>("mine");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Quatre onglets dans 300 px : seul l'onglet ouvert montre son nom, les autres le disent au survol. */}
      <div className="flex shrink-0 gap-1 border-b p-2" role="tablist" aria-label="Sources des médias">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.id;
          const button = (
            <motion.button
              layout
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={entry.label}
              onClick={() => setTab(entry.id)}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className={cn(
                "relative flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                active ? "flex-1 text-foreground" : "shrink-0 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {active && (
                <motion.span layoutId="media-tab" className="absolute inset-0 rounded-md bg-muted" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
              )}
              <Icon className="relative h-3.5 w-3.5 shrink-0" />
              {active && <span className="relative min-w-0 truncate">{entry.label}</span>}
            </motion.button>
          );
          // Même arbre ouvert ou fermé : le bouton n'est pas recréé et sa largeur s'anime.
          return (
            <Tooltip key={entry.id}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              {!active && <TooltipContent side="bottom">{entry.label}</TooltipContent>}
            </Tooltip>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "mine" && <MyMedia onAdd={onAdd} />}
        {tab === "find" && <FindMedia onAdd={onAdd} />}
        {tab === "gallery" && <GalleryMedia onAdd={onAdd} />}
        {tab === "studio" && <StudioMedia onAdd={onAdd} />}
      </div>
    </div>
  );
}

function dragPayload(event: React.DragEvent, source: MediaSource) {
  event.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(source));
  event.dataTransfer.effectAllowed = "copy";
}

function formatDuration(ms?: number) {
  if (!ms) return null;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// ─── Mes médias ──────────────────────────────────────────────────

function MyMedia({ onAdd }: { onAdd: (source: MediaSource) => void }) {
  const [assets, setAssets] = useState<ClipAsset[] | null>(assetsSnapshot);
  const [uploads, setUploads] = useState<{ id: string; name: string; ratio: number }[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Un import refusé se dit sous la zone d'import, là où l'on vient de déposer.
  const feedback = useFeedback();

  const refresh = useCallback(async () => {
    const list = await callModule<ClipAsset[]>("listAssets");
    assetsSnapshot = list;
    setAssets(list);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setAssets([]));
  }, [refresh]);

  const importFiles = async (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => /^(image|video|audio)\//.test(file.type));
    feedback.clear();
    if (accepted.length === 0) {
      feedback.error("Seuls les images, vidéos et sons sont acceptés. Choisissez un autre fichier.");
      return;
    }
    for (const file of accepted) {
      const id = `${file.name}-${Date.now()}`;
      setUploads((current) => [...current, { id, name: file.name, ratio: 0 }]);
      try {
        await importLocalFile(file, (ratio) =>
          setUploads((current) => current.map((entry) => (entry.id === id ? { ...entry, ratio } : entry)))
        );
      } catch (error) {
        feedback.error(`${file.name} : ${errorMessage(error, "l’import a échoué. Réessayez.")}`);
      } finally {
        setUploads((current) => current.filter((entry) => entry.id !== id));
      }
    }
    await refresh();
  };

  return (
    <div
      className="flex flex-col gap-3 p-3"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setOver(false);
        void importFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) void importFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          "flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors",
          over ? "border-primary bg-primary/5" : "hover:border-foreground/30 hover:bg-muted/40"
        )}
      >
        <Upload className="h-5 w-5 text-primary" />
        <span className="text-xs font-medium">Importer des vidéos, images ou sons</span>
        <span className="text-[11px] text-muted-foreground">ou glissez-les ici, 500 Mo maximum</span>
      </button>
      <FormStatus state={feedback.state} />

      <AnimatePresence initial={false}>
        {uploads.map((upload) => (
          <motion.div
            key={upload.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-md border px-2.5 py-2">
              <p className="truncate text-xs">{upload.name}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${upload.ratio * 100}%` }} />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {assets === null ? (
        <SkeletonGrid />
      ) : assets.length === 0 && uploads.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Aucun média importé pour l&apos;instant.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {assets.map((asset) => {
            const source = assetToSource(asset);
            return (
              <ContextMenu key={asset.file}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => dragPayload(event, source)}
                    onClick={() => onAdd(source)}
                    title={asset.originalName}
                    className="group relative aspect-video overflow-hidden rounded-md border bg-muted text-left"
                  >
                    {asset.kind === "image" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={source.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                    {asset.kind === "video" && (
                      <video src={`${source.url}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />
                    )}
                    {asset.kind === "audio" && (
                      <span className="flex h-full w-full items-center justify-center bg-emerald-500/10">
                        <AudioLines className="h-6 w-6 text-emerald-500" />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-[10px] text-white">
                      {asset.kind === "video" && <Film className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{asset.originalName}</span>
                      {formatDuration(asset.durationMs) && (
                        <span className="ml-auto shrink-0 tabular-nums">{formatDuration(asset.durationMs)}</span>
                      )}
                    </span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem onClick={() => onAdd(source)}>Ajouter au clip</ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    onClick={async () => {
                      await callModule("deleteAsset", asset.file);
                      await refresh();
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer le média
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Galerie et studio ───────────────────────────────────────────

function MediaGrid({
  items,
  loading,
  onAdd,
  empty,
}: {
  items: BrowsableMedia[];
  loading: boolean;
  onAdd: (source: MediaSource) => void;
  empty: string;
}) {
  if (!loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
        <ImageOff className="h-6 w-6 opacity-40" />
        {empty}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((media) => (
        <button
          key={media.key}
          type="button"
          draggable
          onDragStart={(event) => dragPayload(event, media.source)}
          onClick={() => onAdd(media.source)}
          title={media.caption}
          className="aspect-square overflow-hidden rounded-md bg-muted transition-transform hover:scale-[1.03]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media.thumbnail}
            alt=""
            loading="lazy"
            onError={(event) => {
              const image = event.currentTarget;
              if (image.dataset.fallback) return;
              image.dataset.fallback = "1";
              image.src = media.source.url;
            }}
            className="h-full w-full object-cover"
          />
        </button>
      ))}
      {loading && Array.from({ length: 9 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-md" />)}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="aspect-video rounded-md" />
      ))}
    </div>
  );
}

function GalleryMedia({ onAdd }: { onAdd: (source: MediaSource) => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BrowsableMedia[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinel = useRef<HTMLDivElement>(null);
  // Un état local plutôt que `useFeedback` : `load` doit garder la même
  // identité, sinon l'effet qui l'appelle relancerait le chargement en boucle.
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (target: number, search: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchGalleryImages(target, search);
      setItems((current) => (target === 1 ? result.items : [...current, ...result.items]));
      setHasMore(result.hasMore);
      setPage(target);
    } catch (error) {
      setLoadError(errorMessage(error, "La galerie n’a pas pu être chargée. Réessayez dans un instant."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(1, query), 250);
    return () => clearTimeout(timer);
  }, [query, load]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load(page + 1, query);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, page, query, load]);

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher" className="h-8 pl-8 text-xs" />
      </div>
      <FormStatus state={loadError ? { tone: "error", message: loadError, id: 0 } : null} />
      <MediaGrid items={items} loading={loading} onAdd={onAdd} empty="Aucune image dans la galerie." />
      <div ref={sentinel} className="h-1" />
    </div>
  );
}

function StudioMedia({ onAdd }: { onAdd: (source: MediaSource) => void }) {
  const [items, setItems] = useState<BrowsableMedia[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchStudioImages()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = (items ?? []).filter((item) =>
    words.every((word) => item.caption.toLowerCase().includes(word))
  );

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans les prompts" className="h-8 pl-8 text-xs" />
      </div>
      <MediaGrid
        items={filtered}
        loading={items === null}
        onAdd={onAdd}
        empty="Aucun rendu d'AI Image Gen."
      />
    </div>
  );
}

// ─── Trouver : des images qui existent ───────────────────────────

/** Où chercher : la banque libre (Openverse), le web par Codex, ou l'icône officielle d'un sujet. */
type FindSource = "openverse" | "web" | "icon";

const FIND_SOURCES: { id: FindSource; label: string; hint: string; icon: typeof Library }[] = [
  { id: "openverse", label: "Libre", hint: "Banque libre Openverse : CC0, CC BY et domaine public, licence vérifiée.", icon: Library },
  { id: "web", label: "Web", hint: "Le web par Codex, de 20 à 60 secondes : visuels officiels, droits à vérifier avant de publier.", icon: Globe },
  { id: "icon", label: "Icône", hint: "Icône ou logo officiel d'un jeu, d'une appli, d'une marque…, par Codex : droits à vérifier.", icon: BadgeCheck },
];

/** Openverse ne sert pas plus de dix pages à un visiteur anonyme. */
const OPENVERSE_MAX_PAGE = 10;

/** Dernière recherche, gardée entre deux ouvertures de l'onglet. */
let findSnapshot: { query: string; source: FindSource; page: number; results: FoundImage[]; hasMore: boolean } | null = null;

/** Média du projet tiré d'une image importée : la mention et l'état des droits la suivent jusqu'à la publication. */
function importedToSource(image: ImportedImage): MediaSource {
  return {
    url: image.url,
    ref: image.ref,
    name: image.name,
    kind: "image",
    width: image.width,
    height: image.height,
    credit: image.credit || undefined,
    rights: image.rights,
  };
}

function FindMedia({ onAdd }: { onAdd: (source: MediaSource) => void }) {
  const [query, setQuery] = useState(findSnapshot?.query ?? "");
  const [source, setSource] = useState<FindSource>(findSnapshot?.source ?? "openverse");
  const [results, setResults] = useState<FoundImage[]>(findSnapshot?.results ?? []);
  const [page, setPage] = useState(findSnapshot?.page ?? 0);
  const [hasMore, setHasMore] = useState(findSnapshot?.hasMore ?? false);
  const [searched, setSearched] = useState(findSnapshot !== null);
  const [loading, setLoading] = useState<"search" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Import en cours ou fait, par candidate : l'image importée sert aux clics suivants. */
  const [imports, setImports] = useState<Record<string, "pending" | ImportedImage>>({});
  /** Import échoué, par candidate : le message s'affiche sur sa carte. */
  const [importErrors, setImportErrors] = useState<Record<string, FeedbackState>>({});
  const searchId = useRef(0);
  const errorId = useRef(0);

  const run = async (target: number) => {
    const text = query.replace(/\s+/g, " ").trim();
    if (text.length < 2) {
      setError("Tapez au moins deux lettres.");
      return;
    }
    const id = ++searchId.current;
    setLoading(target > 1 ? "more" : "search");
    setError(null);
    try {
      const found = await callModule<FoundImage[]>("searchImages", {
        query: text,
        provider: source === "openverse" ? "openverse" : "web",
        page: target,
        ...(source === "icon" ? { kind: "icon" } : {}),
      });
      if (id !== searchId.current) return;
      const next = target > 1 ? [...results, ...found.filter((entry) => !results.some((known) => known.id === entry.id))] : found;
      const more = source === "openverse" && found.length > 0 && target < OPENVERSE_MAX_PAGE;
      setResults(next);
      setPage(target);
      setHasMore(more);
      setSearched(true);
      findSnapshot = { query: text, source, page: target, results: next, hasMore: more };
    } catch (failure: any) {
      if (id !== searchId.current) return;
      setError(failure?.message ?? "Recherche impossible");
    } finally {
      if (id === searchId.current) setLoading(null);
    }
  };

  const importOne = async (image: FoundImage, add: boolean) => {
    const known = imports[image.id];
    if (known === "pending") return;
    if (known) {
      if (add) onAdd(importedToSource(known));
      return;
    }
    setImports((current) => ({ ...current, [image.id]: "pending" }));
    setImportErrors(({ [image.id]: _cleared, ...rest }) => rest);
    try {
      const imported = await callModule<ImportedImage>("importFoundImage", { id: image.id });
      setImports((current) => ({ ...current, [image.id]: imported }));
      // « Mes médias » relira la liste à sa prochaine ouverture.
      assetsSnapshot = null;
      // La coche sur la carte et l'image dans le clip suffisent ; la pastille de
      // licence de la carte rappelle déjà les droits à vérifier.
      if (add) onAdd(importedToSource(imported));
    } catch (failure) {
      setImports((current) => {
        const { [image.id]: _removed, ...rest } = current;
        return rest;
      });
      errorId.current += 1;
      const message = errorMessage(failure, "L’import de cette image a échoué. Réessayez ou choisissez-en une autre.");
      setImportErrors((current) => ({ ...current, [image.id]: { tone: "error", message, id: errorId.current } }));
    }
  };

  const current = FIND_SOURCES.find((entry) => entry.id === source)!;
  const icons = source === "icon";
  const slow = source !== "openverse";

  return (
    <div className="flex min-w-0 flex-col gap-2 p-3">
      <form
        className="flex min-w-0 gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void run(1);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={icons ? "Nom exact du jeu, de l'appli…" : "Mont Fuji, Zelda, panda roux…"}
            maxLength={100}
            aria-label="Image à chercher"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button type="submit" size="sm" className="h-8 shrink-0 px-2.5 text-xs" disabled={loading === "search"}>
          {loading === "search" ? <Spinner className="size-3.5" aria-label="Recherche en cours" /> : "Chercher"}
        </Button>
      </form>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={source}
        onValueChange={(value) => {
          if (!value || value === source) return;
          setSource(value as FindSource);
          setResults([]);
          setHasMore(false);
          setSearched(false);
          setError(null);
          searchId.current++;
          setLoading(null);
        }}
        className="w-full"
        aria-label="Où chercher"
      >
        {FIND_SOURCES.map((entry) => {
          const Icon = entry.icon;
          return (
            <ToggleGroupItem key={entry.id} value={entry.id} className="h-7 min-w-0 flex-1 gap-1 px-1.5 text-xs" aria-label={entry.label}>
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{entry.label}</span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      <p className={cn("flex min-w-0 items-start gap-1.5 text-[11px] leading-snug", slow ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
        {slow ? <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" /> : <BadgeCheck className="mt-px h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 break-words">{current.hint}</span>
      </p>

      {error && <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-[11px] break-words text-destructive">{error}</p>}

      {loading === "search" && slow && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Spinner className="size-3.5" aria-label="Recherche en cours" />
          Codex cherche sur le web…
        </p>
      )}

      {loading === "search" ? (
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
          {Array.from({ length: slow ? 3 : 6 }, (_, index) => (
            <div key={index} className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className={cn("w-full rounded-md", icons ? "aspect-square" : "aspect-video")} />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-xs text-muted-foreground">
          {searched ? <ImageOff className="h-6 w-6 opacity-40" /> : <Telescope className="h-6 w-6 opacity-40" />}
          <span className="break-words">
            {searched
              ? icons
                ? "Aucune icône officielle trouvée. Essayez le nom exact, en anglais."
                : "Aucune image trouvée. Essayez d'autres mots, en anglais de préférence."
              : "Cherchez une image qui existe : un lieu, une espèce, un jeu, un film… Un clic l'ajoute au clip, avec sa mention."}
          </span>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
          <AnimatePresence initial={false}>
            {results.map((image, index) => (
              <FoundCard
                key={image.id}
                image={image}
                index={index}
                icon={icons || image.kind === "icon"}
                state={imports[image.id]}
                error={importErrors[image.id] ?? null}
                onAdd={() => void importOne(image, true)}
                onImport={() => void importOne(image, false)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {hasMore && loading !== "search" && results.length > 0 && (
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={loading === "more"} onClick={() => void run(page + 1)}>
          {loading === "more" ? <Spinner className="size-3.5" aria-label="Chargement" /> : <Plus className="h-3.5 w-3.5" />}
          Plus de résultats
        </Button>
      )}
    </div>
  );
}

function FoundCard({
  image,
  index,
  icon,
  state,
  error,
  onAdd,
  onImport,
}: {
  image: FoundImage;
  index: number;
  icon: boolean;
  state: "pending" | ImportedImage | undefined;
  error: FeedbackState | null;
  onAdd: () => void;
  onImport: () => void;
}) {
  const pending = state === "pending";
  const imported = Boolean(state && state !== "pending");
  const unverified = image.rights === "unverified";
  const size = image.width && image.height ? `${image.width} × ${image.height}` : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: Math.min(index, 12) * 0.03 } }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex min-w-0 flex-col gap-1"
    >
      <div className="group relative min-w-0">
        <button
          type="button"
          onClick={onAdd}
          disabled={pending}
          aria-label={`Ajouter au clip : ${image.title}`}
          className={cn(
            "relative block w-full overflow-hidden rounded-md border bg-muted transition-transform hover:scale-[1.02] disabled:hover:scale-100",
            icon ? "aspect-square" : "aspect-video"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className={cn("h-full w-full max-w-full", icon ? "object-contain p-2" : "object-cover")}
          />
          {pending && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Spinner className="size-5" aria-label="Import en cours" />
            </span>
          )}
          {imported && (
            <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-3 w-3" />
            </span>
          )}
        </button>
        {!imported && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                disabled={pending}
                onClick={onImport}
                aria-label="Importer dans Mes médias sans l'ajouter au clip"
                className="absolute top-1 right-1 opacity-90 shadow-sm group-hover:opacity-100"
              >
                <Upload />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Importer dans Mes médias</TooltipContent>
          </Tooltip>
        )}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <p className="min-w-0 truncate text-[11px] font-medium">{image.title}</p>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 break-words">
          {image.title}
          {image.creator ? ` – ${image.creator}` : ""}
          {size ? ` (${size})` : ""}
        </TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-0.5 rounded px-1 py-px font-medium",
            unverified ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          )}
        >
          {unverified ? <ShieldAlert className="h-2.5 w-2.5 shrink-0" /> : <BadgeCheck className="h-2.5 w-2.5 shrink-0" />}
          <span className="truncate">{image.license}</span>
        </span>
        {image.sourcePage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={image.sourcePage}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ouvrir la page source"
                className="ml-auto inline-flex shrink-0 items-center rounded p-0.5 hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 break-all">
              {image.sourcePage}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {image.creator && <p className="min-w-0 truncate text-[10px] text-muted-foreground" title={image.creator}>{image.creator}</p>}
      <ActionStatus state={error} className="text-[10px] empty:hidden" />
    </motion.div>
  );
}
