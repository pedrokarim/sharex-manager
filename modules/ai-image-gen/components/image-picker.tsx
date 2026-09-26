"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import {
  CalendarDays,
  Check,
  CloudUpload,
  HardDrive,
  ImageOff,
  Link2,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  callModule,
  imageUrl,
  readFileAsBase64,
  remoteImageToBase64,
  sameOriginImageToBase64,
  type HistoryItem,
} from "../lib/client";

/** Image prête à être jointe : base64 nu, type et aperçu. */
export interface PickedImage {
  b64: string;
  mimeType: string;
  dataUrl: string;
  name: string;
}

export type PickerSource = "uploads" | "studio" | "device" | "link";

interface ImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nombre d'images que le compositeur peut encore recevoir. */
  maxSelection: number;
  initialSource?: PickerSource;
  onPick: (images: PickedImage[]) => void;
}

const SOURCES: {
  id: PickerSource;
  label: string;
  hint: string;
  icon: typeof HardDrive;
}[] = [
  { id: "uploads", label: "Uploads", hint: "Vos captures ShareX", icon: CloudUpload },
  { id: "studio", label: "Studio", hint: "Rendus déjà générés", icon: Sparkles },
  { id: "device", label: "Ordinateur", hint: "Fichier local", icon: HardDrive },
  { id: "link", label: "Lien", hint: "Image d'un autre site", icon: Link2 },
];

/** Une vignette sélectionnable, quelle que soit sa source. */
interface Tile {
  key: string;
  thumbnail: string;
  /** URL de même origine d'où lire l'image en pleine taille. */
  source: string;
  name: string;
  caption: string;
  createdAt: number;
}

/**
 * Sélecteur d'images de départ.
 *
 * Il réunit tout ce qui peut nourrir une génération : les captures déjà
 * envoyées sur ShareX Manager, les rendus du studio, un fichier local ou un
 * lien. Les deux premières sources se parcourent comme une photothèque, avec
 * recherche et filtre par date, parce qu'on cherche rarement une capture par
 * son nom de fichier aléatoire mais souvent par « celle d'hier soir ».
 */
export function ImagePicker({
  open,
  onOpenChange,
  maxSelection,
  initialSource = "uploads",
  onPick,
}: ImagePickerProps) {
  const [source, setSource] = useState<PickerSource>(initialSource);
  const [selected, setSelected] = useState<Tile[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) {
      setSource(initialSource);
      setSelected([]);
    }
  }, [open, initialSource]);

  const toggle = useCallback(
    (tile: Tile) => {
      setSelected((current) => {
        if (current.some((entry) => entry.key === tile.key)) {
          return current.filter((entry) => entry.key !== tile.key);
        }
        if (maxSelection <= 1) return [tile];
        if (current.length >= maxSelection) {
          toast.info(`${maxSelection} image(s) au maximum pour ce moteur`);
          return current;
        }
        return [...current, tile];
      });
    },
    [maxSelection]
  );

  const finish = useCallback(
    (images: PickedImage[]) => {
      if (!images.length) return;
      onPick(images.slice(0, maxSelection));
      onOpenChange(false);
    },
    [maxSelection, onOpenChange, onPick]
  );

  const confirmTiles = async () => {
    setImporting(true);
    try {
      const images = await Promise.all(
        selected.map(async (tile) => ({
          ...(await sameOriginImageToBase64(tile.source)),
          name: tile.name,
        }))
      );
      finish(images);
    } catch (error: any) {
      toast.error(error?.message ?? "Import de l'image impossible");
    } finally {
      setImporting(false);
    }
  };

  const browsing = source === "uploads" || source === "studio";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(760px,calc(100svh-2rem))] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        showCloseButton={false}
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* ─── Sources ───────────────────────────── */}
          <nav
            aria-label="Provenance de l'image"
            className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-52 md:flex-col md:border-r md:border-b-0 md:p-3"
          >
            <div className="hidden px-2 pt-1 pb-3 md:block">
              <DialogTitle className="text-base">Image de départ</DialogTitle>
              <DialogDescription className="text-xs">
                {maxSelection > 1
                  ? `Jusqu'à ${maxSelection} images`
                  : "Une image"}
              </DialogDescription>
            </div>
            {SOURCES.map((entry) => {
              const Icon = entry.icon;
              const active = entry.id === source;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSource(entry.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4 shrink-0", active && "text-primary")}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{entry.label}</span>
                    <span className="hidden text-[11px] text-muted-foreground md:block">
                      {entry.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* ─── Contenu ───────────────────────────── */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 px-4 pt-3 md:hidden">
              <DialogTitle className="text-base">Image de départ</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fermer"
              onClick={() => onOpenChange(false)}
              className="absolute top-2 right-2 z-10 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>

            {source === "uploads" && (
              <UploadsBrowser selected={selected} onToggle={toggle} />
            )}
            {source === "studio" && (
              <StudioBrowser selected={selected} onToggle={toggle} />
            )}
            {source === "device" && (
              <DevicePane maxSelection={maxSelection} onPick={finish} />
            )}
            {source === "link" && <LinkPane onPick={finish} />}
          </div>
        </div>

        {browsing && (
          <footer className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {selected.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Cliquez sur une image pour la sélectionner.
                </span>
              ) : (
                <>
                  <div className="flex -space-x-2">
                    {selected.map((tile) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={tile.key}
                        src={tile.thumbnail}
                        alt=""
                        className="h-8 w-8 rounded-md border-2 border-background object-cover"
                      />
                    ))}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {selected.length} sur {maxSelection}
                  </span>
                </>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button
                size="sm"
                disabled={!selected.length || importing}
                onClick={confirmTiles}
                className="gap-2"
              >
                {importing ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Joindre
              </Button>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Filtres ─────────────────────────────────────────────────────

type DatePreset = "all" | "today" | "week" | "month" | "custom";

interface BrowserFilters {
  query: string;
  preset: DatePreset;
  range?: DateRange;
}

/** Bornes ISO d'un filtre de date, `undefined` quand il n'y en a pas. */
function boundsOf(filters: BrowserFilters): { start?: Date; end?: Date } {
  const now = new Date();
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  switch (filters.preset) {
    case "today":
      return { start: startOfDay(now) };
    case "week": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 6);
      return { start };
    }
    case "month": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 29);
      return { start };
    }
    case "custom":
      return {
        start: filters.range?.from ? startOfDay(filters.range.from) : undefined,
        end: filters.range?.to
          ? endOfDay(filters.range.to)
          : filters.range?.from
            ? endOfDay(filters.range.from)
            : undefined,
      };
    default:
      return {};
  }
}

const PRESET_LABELS: { id: Exclude<DatePreset, "custom">; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "today", label: "Aujourd'hui" },
  { id: "week", label: "7 jours" },
  { id: "month", label: "30 jours" },
];

function FilterBar({
  filters,
  onChange,
  placeholder,
}: {
  filters: BrowserFilters;
  onChange: (next: BrowserFilters) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(filters.query);

  // La recherche part après une courte pause de frappe, pas à chaque touche.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== filters.query) onChange({ ...filters, query: draft });
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, filters, onChange]);

  const customLabel =
    filters.preset === "custom" && filters.range?.from
      ? formatRange(filters.range)
      : "Période…";

  return (
    <div className="flex flex-col gap-2 border-b px-4 pt-3 pb-3 md:pt-4 md:pr-14">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          className="h-9 pl-9"
          aria-label="Rechercher"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESET_LABELS.map((preset) => (
          <FilterChip
            key={preset.id}
            active={filters.preset === preset.id}
            onClick={() => onChange({ ...filters, preset: preset.id, range: undefined })}
          >
            {preset.label}
          </FilterChip>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <FilterChip active={filters.preset === "custom"}>
              <CalendarDays className="h-3 w-3" />
              {customLabel}
            </FilterChip>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={filters.range}
              onSelect={(range) =>
                onChange({
                  ...filters,
                  preset: range?.from ? "custom" : "all",
                  range,
                })
              }
              disabled={{ after: new Date() }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  children,
  ...props
}: React.ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "text-muted-foreground hover:border-foreground/20 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function formatRange(range: DateRange): string {
  const format = (date: Date) =>
    date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  if (!range.from) return "Période…";
  if (!range.to || range.to.getTime() === range.from.getTime()) {
    return format(range.from);
  }
  return `${format(range.from)} – ${format(range.to)}`;
}

// ─── Parcours des uploads ────────────────────────────────────────

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif)$/i;
const UPLOADS_PAGE_SIZE = 36;

interface UploadedFile {
  name: string;
  url: string;
  createdAt: string;
}

function UploadsBrowser({
  selected,
  onToggle,
}: {
  selected: Tile[];
  onToggle: (tile: Tile) => void;
}) {
  const [filters, setFilters] = useState<BrowserFilters>({ query: "", preset: "all" });
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const request = useRef(0);

  const load = useCallback(
    async (targetPage: number) => {
      const ticket = ++request.current;
      setLoading(true);
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(UPLOADS_PAGE_SIZE),
        sort: "date",
        order: "desc",
      });
      if (filters.query) params.set("q", filters.query);
      const { start, end } = boundsOf(filters);
      if (start) params.set("start", start.toISOString());
      if (end) params.set("end", end.toISOString());

      try {
        const response = await fetch(`/api/files?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error();
        const payload = (await response.json()) as {
          files: UploadedFile[];
          hasMore: boolean;
          total: number;
        };
        if (ticket !== request.current) return;
        // L'API liste tous les fichiers envoyés : on ne garde que les images
        // qu'un moteur sait lire.
        const next = payload.files
          .filter((file) => IMAGE_EXTENSION.test(file.name))
          .map<Tile>((file) => ({
            key: `upload:${file.name}`,
            thumbnail: `/api/thumbnails/${encodeURIComponent(file.name)}`,
            source: file.url,
            name: file.name,
            caption: file.name,
            createdAt: new Date(file.createdAt).getTime(),
          }));
        setTiles((current) => (targetPage === 1 ? next : [...current, ...next]));
        setHasMore(payload.hasMore);
        setTotal(payload.total);
        setPage(targetPage);
      } catch {
        if (ticket === request.current) toast.error("Chargement des uploads impossible");
      } finally {
        if (ticket === request.current) setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  return (
    <>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        placeholder="Rechercher par nom de fichier"
      />
      <TileGrid
        tiles={tiles}
        selected={selected}
        onToggle={onToggle}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={() => load(page + 1)}
        summary={loading && page === 1 ? null : `${total} fichier(s)`}
        emptyLabel="Aucune image ne correspond à ces critères."
      />
    </>
  );
}

// ─── Parcours du studio ──────────────────────────────────────────

function StudioBrowser({
  selected,
  onToggle,
}: {
  selected: Tile[];
  onToggle: (tile: Tile) => void;
}) {
  const [filters, setFilters] = useState<BrowserFilters>({ query: "", preset: "all" });
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [visible, setVisible] = useState(48);

  useEffect(() => {
    callModule<HistoryItem[]>("getHistory", 1000)
      .then(setHistory)
      .catch(() => {
        setHistory([]);
        toast.error("Chargement des rendus impossible");
      });
  }, []);

  useEffect(() => setVisible(48), [filters]);

  const tiles = useMemo(() => {
    if (!history) return [];
    const { start, end } = boundsOf(filters);
    const words = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
    return history
      .filter((item) => {
        if (start && item.createdAt < start.getTime()) return false;
        if (end && item.createdAt > end.getTime()) return false;
        const haystack = item.prompt.toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .flatMap((item) =>
        item.imageFiles.map<Tile>((file) => ({
          key: `studio:${file}`,
          thumbnail: imageUrl(file),
          source: imageUrl(file),
          name: file,
          caption: item.prompt,
          createdAt: item.createdAt,
        }))
      );
  }, [history, filters]);

  return (
    <>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        placeholder="Rechercher dans les prompts"
      />
      <TileGrid
        tiles={tiles.slice(0, visible)}
        selected={selected}
        onToggle={onToggle}
        loading={history === null}
        hasMore={tiles.length > visible}
        onLoadMore={() => setVisible((count) => count + 48)}
        summary={history === null ? null : `${tiles.length} rendu(s)`}
        emptyLabel="Aucun rendu ne correspond à ces critères."
      />
    </>
  );
}

// ─── Grille commune ──────────────────────────────────────────────

function TileGrid({
  tiles,
  selected,
  onToggle,
  loading,
  hasMore,
  onLoadMore,
  summary,
  emptyLabel,
}: {
  tiles: Tile[];
  selected: Tile[];
  onToggle: (tile: Tile) => void;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  summary: string | null;
  emptyLabel: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);

  // Chargement au défilement : la sentinelle en bas de grille déclenche la
  // page suivante dès qu'elle approche de la zone visible.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "240px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  const groups = useMemo(() => groupByDay(tiles), [tiles]);

  if (!loading && tiles.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <ImageOff className="h-8 w-8 opacity-40" />
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      {summary && (
        <p className="pt-3 text-[11px] text-muted-foreground tabular-nums">{summary}</p>
      )}
      {/* Les jours s'enchaînent sur la même ligne, chacun sous sa petite
          étiquette : un jour d'une seule capture ne réserve pas toute une
          rangée. */}
      <div className="flex flex-wrap items-start gap-x-5 gap-y-4 pt-3">
      {groups.map((group) => (
        <section key={group.label} className="flex max-w-full flex-col gap-1.5">
          <h3 className="px-0.5 text-[11px] font-medium text-muted-foreground first-letter:uppercase">
            {group.label}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {group.tiles.map((tile) => {
              const position = selected.findIndex((entry) => entry.key === tile.key);
              const isSelected = position !== -1;
              return (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => onToggle(tile)}
                  aria-pressed={isSelected}
                  title={tile.caption}
                  className={cn(
                    "group relative h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-muted outline-none sm:h-32 sm:w-32",
                    "ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected && "ring-2 ring-primary"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tile.thumbnail}
                    alt=""
                    loading="lazy"
                    // Miniature indisponible (format exotique, sharp absent) :
                    // on retombe une fois sur l'image d'origine.
                    onError={(event) => {
                      const image = event.currentTarget;
                      if (image.dataset.fallback) return;
                      image.dataset.fallback = "1";
                      image.src = tile.source;
                    }}
                    className={cn(
                      "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105",
                      isSelected && "scale-95 rounded-md"
                    )}
                  />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 text-left text-[10px] leading-3 text-white transition-transform group-hover:translate-y-0">
                    <span className="line-clamp-2">{tile.caption}</span>
                    <span className="mt-0.5 block opacity-70">
                      {new Date(tile.createdAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold transition-all",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/70 bg-black/20 opacity-0 group-hover:opacity-100"
                    )}
                  >
                    {isSelected ? position + 1 : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      </div>

      {loading && (
        <div className="flex flex-wrap gap-1.5 pt-4">
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="h-28 w-28 rounded-lg sm:h-32 sm:w-32" />
          ))}
        </div>
      )}
      <div ref={sentinel} className="h-1" />
    </div>
  );
}

function groupByDay(tiles: Tile[]) {
  const groups: { label: string; tiles: Tile[] }[] = [];
  for (const tile of tiles) {
    const date = new Date(tile.createdAt);
    const label = date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });
    const last = groups[groups.length - 1];
    if (last?.label === label) last.tiles.push(tile);
    else groups.push({ label, tiles: [tile] });
  }
  return groups;
}

// ─── Ordinateur ──────────────────────────────────────────────────

function DevicePane({
  maxSelection,
  onPick,
}: {
  maxSelection: number;
  onPick: (images: PickedImage[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const read = async (files: FileList | File[] | null) => {
    const images = Array.from(files ?? []).filter((file) =>
      file.type.startsWith("image/")
    );
    if (!images.length) {
      toast.error("Aucune image dans la sélection");
      return;
    }
    try {
      onPick(
        await Promise.all(
          images.slice(0, maxSelection).map(async (file) => ({
            ...(await readFileAsBase64(file)),
            name: file.name,
          }))
        )
      );
    } catch {
      toast.error("Lecture du fichier impossible");
    }
  };

  return (
    <div className="flex flex-1 p-4 md:p-6">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={maxSelection > 1}
        hidden
        onChange={(event) => {
          void read(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOver(false);
          void read(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          over ? "border-primary bg-primary/5" : "hover:border-foreground/30 hover:bg-muted/40"
        )}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Upload className="h-6 w-6" />
        </span>
        <span>
          <span className="block text-sm font-medium">
            Déposez une image ici ou cliquez pour parcourir
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            PNG, JPEG, WebP. Vous pouvez aussi coller une image
            (Ctrl + V) directement dans le studio.
          </span>
        </span>
      </button>
    </div>
  );
}

// ─── Lien ────────────────────────────────────────────────────────

function LinkPane({ onPick }: { onPick: (images: PickedImage[]) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const image = await remoteImageToBase64(url.trim());
      onPick([image]);
    } catch (reason: any) {
      setError(reason?.message ?? "Import impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="flex flex-1 flex-col justify-center gap-4 p-6 md:px-12"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Importer depuis un lien</h3>
        <p className="text-xs text-muted-foreground">
          Collez l&apos;adresse d&apos;une image publique. Le serveur la
          télécharge pour vous, dans la limite de 20 Mo.
        </p>
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
        <Button type="submit" className="h-10 gap-2" disabled={!url.trim() || loading}>
          {loading ? <Spinner className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          Importer
        </Button>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
