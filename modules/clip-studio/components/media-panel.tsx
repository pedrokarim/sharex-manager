"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  CloudUpload,
  Film,
  HardDrive,
  ImageOff,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { MEDIA_DRAG_TYPE } from "./timeline";

type Tab = "mine" | "gallery" | "studio";

const TABS: { id: Tab; label: string; icon: typeof HardDrive }[] = [
  { id: "mine", label: "Mes médias", icon: HardDrive },
  { id: "gallery", label: "Galerie", icon: CloudUpload },
  { id: "studio", label: "Studio IA", icon: Sparkles },
];

/** Médias importés, gardés entre deux ouvertures du panneau. */
let assetsSnapshot: ClipAsset[] | null = null;

export function MediaPanel({ onAdd }: { onAdd: (source: MediaSource) => void }) {
  const [tab, setTab] = useState<Tab>("mine");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 border-b p-2">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.span layoutId="media-tab" className="absolute inset-0 rounded-md bg-muted" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
              )}
              <Icon className="relative h-3.5 w-3.5" />
              <span className="relative">{entry.label}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "mine" && <MyMedia onAdd={onAdd} />}
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
    if (accepted.length === 0) {
      toast.error("Seuls les images, vidéos et sons sont acceptés");
      return;
    }
    for (const file of accepted) {
      const id = `${file.name}-${Date.now()}`;
      setUploads((current) => [...current, { id, name: file.name, ratio: 0 }]);
      try {
        await importLocalFile(file, (ratio) =>
          setUploads((current) => current.map((entry) => (entry.id === id ? { ...entry, ratio } : entry)))
        );
      } catch (error: any) {
        toast.error(`${file.name} : ${error?.message ?? "import impossible"}`);
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
        <span className="text-[11px] text-muted-foreground">ou glissez-les ici, 95 Mo maximum</span>
      </button>

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

  const load = useCallback(async (target: number, search: string) => {
    setLoading(true);
    try {
      const result = await fetchGalleryImages(target, search);
      setItems((current) => (target === 1 ? result.items : [...current, ...result.items]));
      setHasMore(result.hasMore);
      setPage(target);
    } catch (error: any) {
      toast.error(error?.message ?? "Chargement impossible");
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
