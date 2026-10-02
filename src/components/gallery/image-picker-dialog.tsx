"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { HardDrive, ImageOff, Images, Link2, Search, Upload, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n";
import { isImageFile } from "@/lib/media-kind";
import { moduleIcon } from "@/lib/modules/file-actions";
import { cn } from "@/lib/utils";
import type { FileInfo } from "@/types/files";
import type { GallerySourceItem, GallerySourcePage } from "@/types/modules";

/**
 * Une image choisie, d'où qu'elle vienne. Un fichier de la galerie est désigné
 * par son nom : le serveur l'a déjà, inutile de le lui renvoyer.
 */
export type PickedImage =
  | { kind: "gallery"; name: string }
  | { kind: "file"; file: File }
  | { kind: "url"; url: string };

interface ModuleSource {
  module: string;
  id: string;
  label: string;
  description?: string;
  icon?: string;
  list: string;
  kinds?: string[];
}

interface ImagePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (image: PickedImage) => void;
  /** À quoi servira l'image : « Image à rechercher »… */
  title?: string;
  description?: string;
}

const PAGE_SIZE = 48;

/**
 * Sélecteur d'image commun à toute l'application : la galerie, les modules
 * activés qui détiennent des images, l'ordinateur ou un lien. C'est le
 * pendant, pour **choisir** une image, de la fenêtre « Ajouter » de la
 * galerie ; les modules s'y branchent par la même déclaration `gallerySources`.
 */
export function ImagePickerDialog({ open, onOpenChange, onPick, title, description }: ImagePickerDialogProps) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<ModuleSource[]>([]);
  const [active, setActive] = useState("gallery");

  useEffect(() => {
    if (!open) return;
    setActive("gallery");
    let cancelled = false;
    fetch("/api/modules/gallery-sources")
      .then((response) => (response.ok ? response.json() : { sources: [] }))
      .then((data) => {
        if (cancelled || !Array.isArray(data.sources)) return;
        // Une source qui ne déclare rien est supposée contenir des images.
        setSources(data.sources.filter((source: ModuleSource) => !source.kinds || source.kinds.includes("image")));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const entries = useMemo(() => {
    const list: { key: string; label: string; hint: string; icon: LucideIcon; source?: ModuleSource }[] = [
      { key: "gallery", label: t("gallery.picker.gallery"), hint: t("gallery.picker.gallery_hint"), icon: Images },
    ];
    for (const source of sources) {
      list.push({ key: `${source.module}:${source.id}`, label: source.label, hint: source.description ?? "", icon: moduleIcon(source.icon), source });
    }
    list.push(
      { key: "device", label: t("gallery.add.device"), hint: t("gallery.add.device_hint"), icon: HardDrive },
      { key: "link", label: t("gallery.add.link"), hint: t("gallery.add.link_hint"), icon: Link2 }
    );
    return list;
  }, [sources, t]);

  const current = entries.find((entry) => entry.key === active) ?? entries[0];

  const pick = useCallback(
    (image: PickedImage) => {
      onPick(image);
      onOpenChange(false);
    },
    [onPick, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(760px,calc(100svh-2rem))] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        showCloseButton={false}
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label={t("gallery.add.sources")}
            className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-col md:border-r md:border-b-0 md:p-3"
          >
            <div className="hidden px-2 pt-1 pb-3 md:block">
              <DialogTitle className="text-base">{title ?? t("gallery.picker.title")}</DialogTitle>
              <DialogDescription className="text-xs">{description ?? t("gallery.picker.description")}</DialogDescription>
            </div>
            {entries.map((entry) => {
              const Icon = entry.icon;
              const selected = entry.key === current.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setActive(entry.key)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", selected && "text-primary")} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{entry.label}</span>
                    {entry.hint && <span className="hidden truncate text-[11px] text-muted-foreground md:block">{entry.hint}</span>}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("gallery.add.close")}
              onClick={() => onOpenChange(false)}
              className="absolute top-2 right-2 z-10 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>

            {current.key === "gallery" && <GalleryPane onPick={pick} />}
            {current.source && <ModulePane key={current.key} source={current.source} onPick={pick} />}
            {current.key === "device" && <DevicePane onPick={pick} />}
            {current.key === "link" && <LinkPane onPick={pick} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Grille commune à la galerie et aux modules ──────────────────

interface Tile {
  id: string;
  name: string;
  thumbnail: string;
  caption?: string;
}

function TileBrowser({
  placeholder,
  load,
  onChoose,
  emptyMessage,
}: {
  placeholder: string;
  /** Charge une page ; `offset` est le nombre d'éléments déjà demandés. */
  load: (search: string, offset: number) => Promise<{ tiles: Tile[]; hasMore: boolean; consumed: number }>;
  onChoose: (tile: Tile) => Promise<void> | void;
  emptyMessage: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const offset = useRef(0);
  const ticket = useRef(0);
  // `load` change d'identité à chaque rendu du parent : on lit la version courante.
  const loadRef = useRef(load);
  loadRef.current = load;

  const fetchPage = useCallback(async (search: string, from: number) => {
    const current = ++ticket.current;
    setLoading(true);
    setError(null);
    try {
      const page = await loadRef.current(search, from);
      if (ticket.current !== current) return;
      offset.current = from + page.consumed;
      setTiles((previous) => (from === 0 ? page.tiles : [...previous, ...page.tiles]));
      setHasMore(page.hasMore);
    } catch (reason) {
      if (ticket.current === current) setError(reason instanceof Error ? reason.message : "Source indisponible.");
    } finally {
      if (ticket.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void fetchPage(query.trim(), 0), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, fetchPage]);

  const choose = async (tile: Tile) => {
    setChoosing(tile.id);
    try {
      await onChoose(tile);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Image illisible.");
    } finally {
      setChoosing(null);
    }
  };

  return (
    <>
      <div className="border-b py-2 pr-12 pl-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="h-9 pl-8" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : tiles.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ImageOff className="h-8 w-8" />
            <p className="text-sm">{query ? t("gallery.add.no_match") : emptyMessage}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {tiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                disabled={choosing !== null}
                onClick={() => void choose(tile)}
                title={tile.caption ?? tile.name}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted transition-shadow hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- vignette de même origine */}
                <img src={tile.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                {choosing === tile.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Spinner className="h-5 w-5 text-white" />
                  </span>
                )}
              </button>
            ))}
            {loading && Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}
          </div>
        )}
        {hasMore && !loading && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={() => void fetchPage(query.trim(), offset.current)}>
              {t("gallery.add.more")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Galerie ─────────────────────────────────────────────────────

function GalleryPane({ onPick }: { onPick: (image: PickedImage) => void }) {
  const { t } = useTranslation();
  return (
    <TileBrowser
      placeholder={t("gallery.picker.search_gallery")}
      emptyMessage={t("gallery.picker.empty_gallery")}
      load={async (search, offset) => {
        const params = new URLSearchParams({ page: String(Math.floor(offset / PAGE_SIZE) + 1), limit: String(PAGE_SIZE), sort: "date", order: "desc" });
        if (search) params.set("q", search);
        const response = await fetch(`/api/files?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { files: FileInfo[]; hasMore: boolean };
        return {
          // Une page peut contenir des vidéos ou des archives : elles sont écartées, mais comptées.
          tiles: data.files
            .filter((file) => isImageFile(file.name))
            .map((file) => ({ id: file.name, name: file.name, thumbnail: `/api/thumbnails/${encodeURIComponent(file.name)}` })),
          hasMore: data.hasMore,
          consumed: PAGE_SIZE,
        };
      }}
      onChoose={(tile) => onPick({ kind: "gallery", name: tile.name })}
    />
  );
}

// ─── Source d'un module ──────────────────────────────────────────

function ModulePane({ source, onPick }: { source: ModuleSource; onPick: (image: PickedImage) => void }) {
  const { t } = useTranslation();
  return (
    <TileBrowser
      placeholder={t("gallery.add.search", { source: source.label })}
      emptyMessage={t("gallery.picker.empty_source")}
      load={async (search, offset) => {
        const response = await fetch("/api/modules/call-function", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moduleName: source.module, functionName: source.list, args: [{ search, offset, limit: PAGE_SIZE }] }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.success === false) throw new Error(payload?.error || t("gallery.add.source_error"));
        const page = payload.data as GallerySourcePage;
        return {
          tiles: page.items
            .filter((item: GallerySourceItem) => item.kind === "image")
            .map((item) => ({ id: item.id, name: item.name, thumbnail: item.thumbnail, caption: item.caption })),
          hasMore: page.hasMore,
          consumed: page.items.length,
        };
      }}
      onChoose={async (tile) => {
        // La vignette d'une source est une adresse de même origine : on y lit l'image elle-même.
        const response = await fetch(tile.thumbnail);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        onPick({ kind: "file", file: new File([blob], tile.name, { type: blob.type || "image/png" }) });
      }}
    />
  );
}

// ─── Ordinateur ──────────────────────────────────────────────────

function DevicePane({ onPick }: { onPick: (image: PickedImage) => void }) {
  const { t } = useTranslation();
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    multiple: false,
    accept: { "image/*": [] },
    onDrop: (files) => {
      if (files[0]) onPick({ kind: "file", file: files[0] });
    },
  });
  return (
    <div className="flex flex-1 p-4 md:p-6">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 text-center transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-border"
        )}
      >
        <input {...getInputProps()} />
        <Upload className={cn("h-10 w-10 text-muted-foreground", isDragActive && "text-primary")} />
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("gallery.picker.drop_title")}</h3>
          <p className="max-w-sm text-xs text-muted-foreground">{t("gallery.picker.drop_description")}</p>
        </div>
        <Button onClick={open} className="gap-2">
          <HardDrive className="h-4 w-4" />
          {t("gallery.add.browse")}
        </Button>
      </div>
    </div>
  );
}

// ─── Lien ────────────────────────────────────────────────────────

function LinkPane({ onPick }: { onPick: (image: PickedImage) => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  return (
    <form
      className="flex flex-1 flex-col justify-center gap-4 p-6 md:px-12"
      onSubmit={(event) => {
        event.preventDefault();
        if (url.trim()) onPick({ kind: "url", url: url.trim() });
      }}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t("gallery.picker.link_title")}</h3>
        <p className="text-xs text-muted-foreground">{t("gallery.picker.link_description")}</p>
      </div>
      <div className="flex gap-2">
        <Input
          autoFocus
          type="url"
          inputMode="url"
          placeholder="https://exemple.com/image.png"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="h-10"
        />
        <Button type="submit" className="h-10 gap-2" disabled={!url.trim()}>
          <Link2 className="h-4 w-4" />
          {t("gallery.picker.use_link")}
        </Button>
      </div>
    </form>
  );
}
