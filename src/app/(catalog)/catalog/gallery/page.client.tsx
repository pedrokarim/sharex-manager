"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CalendarSearch, ChevronDown, Images } from "lucide-react";

import { Loading } from "@/components/ui/loading";
import { PublicImageViewer } from "@/components/catalog/public-image-viewer";
import { VideoThumbnail } from "@/components/gallery/video-thumbnail";
import { isVideoFile } from "@/lib/media-kind";
import { TimelineNavigator, timelineGroupProps } from "@/components/timeline/timeline-navigator";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { formatMonthKey, monthKeyOf, type TimelineMonth } from "@/lib/timeline";
import { cn } from "@/lib/utils";

interface GalleryImage {
  name: string;
  url: string;
  addedAt?: string;
  album?: { name: string; slug: string };
  durationMs?: number;
}

type Density = "dense" | "normal" | "large";

const DENSITY: Record<Density, string> = {
  dense: "grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 gap-1",
  normal: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-1.5",
  large: "grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2",
};

const PAGE_SIZE = 60;

/** La grille affiche des miniatures ; la visionneuse sert la pleine résolution. */
const thumb = (name: string) => `/api/thumbnails/${encodeURIComponent(name)}`;

/** Hauteur de la barre du site, qui recouvre le haut de la page. */
const STICKY_OFFSET = 100;

const monthKey = (iso?: string) => {
  if (!iso) return "0000-00";
  const date = new Date(iso);
  return monthKeyOf(date, Number.isNaN(date.getTime()) ? 0 : date.getTimezoneOffset());
};

const monthLabel = (key: string) => (key === "0000-00" ? "Sans date" : formatMonthKey(key, "long", "fr-FR"));

const scrollingElement = () => (document.scrollingElement as HTMLElement | null) ?? document.documentElement;

export function CatalogGalleryPage() {
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const [videosTotal, setVideosTotal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [density, setDensity] = useState<Density>("normal");
  const [album, setAlbum] = useState<string | null>(null);
  const [months, setMonths] = useState<TimelineMonth[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const mapPage = (raw: any[]): GalleryImage[] =>
    raw.map((item) => ({
      name: item.name,
      url: `/api/files/${encodeURIComponent(item.name)}`,
      addedAt: item.addedAt,
      durationMs: item.durationMs,
      album: item.albumSlug
        ? { name: item.albumName, slug: item.albumSlug }
        : undefined,
    }));

  /** Une page de la galerie : les pages sont numérotées à partir de 1. */
  const fetchPage = useCallback(async (page: number) => {
    const offset = (page - 1) * PAGE_SIZE;
    const response = await fetch(
      `/api/public/catalog?images=true&imagesLimit=${PAGE_SIZE}&imagesOffset=${offset}`,
    );
    if (!response.ok) throw new Error("Impossible de charger la galerie");
    const data = await response.json();
    setTotal(typeof data.imagesTotal === "number" ? data.imagesTotal : null);
    setVideosTotal(typeof data.videosTotal === "number" ? data.videosTotal : 0);
    return { data: mapPage(data.images || []), hasMore: Boolean(data.imagesHasMore) };
  }, []);

  const {
    data: images,
    loading: loadingMore,
    loadingPrevious,
    ref: sentinelRef,
    topRef,
    firstPage,
    resetAt,
  } = useInfiniteScroll<GalleryImage>({
    initialData: [],
    initialHasMore: false,
    fetchMore: fetchPage,
    rootMargin: "800px 0px",
    getScrollElement: scrollingElement,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await fetchPage(1);
        if (!cancelled) resetAt(first.data, first.hasMore, 1);
      } catch (error) {
        console.error("Erreur:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    fetch(`/api/public/catalog?images=true&timeline=1&tz=${new Date().getTimezoneOffset()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.months) setMonths(data.months);
      })
      .catch((error) => console.error("Erreur:", error));
    return () => {
      cancelled = true;
    };
  }, [fetchPage, resetAt]);

  /** Saut à une date : la galerie repart de la page qui contient ce rang. */
  const loadAt = useCallback(
    async (index: number) => {
      const page = Math.floor(index / PAGE_SIZE) + 1;
      const next = await fetchPage(page);
      resetAt(next.data, next.hasMore, page);
    },
    [fetchPage, resetAt],
  );

  /** Albums présents parmi les images déjà chargées. */
  const albumOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const image of images) {
      if (image.album?.slug) seen.set(image.album.slug, image.album.name);
    }
    return Array.from(seen, ([slug, name]) => ({ slug, name }));
  }, [images]);

  const visible = useMemo(
    () => (album ? images.filter((i) => i.album?.slug === album) : images),
    [images, album],
  );

  /** Mois consécutifs de la liste affichée, avec leur rang dans la galerie entière. */
  const groups = useMemo(() => {
    const windowStart = (firstPage - 1) * PAGE_SIZE;
    const result: { key: string; start: number; offset: number; items: GalleryImage[] }[] = [];
    visible.forEach((image, index) => {
      const key = monthKey(image.addedAt);
      const last = result[result.length - 1];
      if (last?.key === key) last.items.push(image);
      else result.push({ key, start: windowStart + index, offset: index, items: [image] });
    });
    return result;
  }, [visible, firstPage]);

  /** La frise compte toute la galerie : elle n'a pas de sens sous un filtre d'album. */
  const timelineMonths = album ? [] : months;
  /** La dernière image chargée est aussi la dernière de la galerie. */
  const atEnd = typeof total === "number" && (firstPage - 1) * PAGE_SIZE + images.length >= total;
  const canPickDate = timelineMonths.length > 1;

  /**
   * La visionneuse navigue dans la liste affichée : sans ça, les flèches
   * sauteraient vers des images masquées par le filtre actif.
   */
  const openViewer = (indexInVisible: number) => setSelectedIndex(indexInVisible);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center pt-24">
        <Loading />
      </div>
    );
  }

  return (
    <>
      <div className="pb-16 pt-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <header>
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Tous albums confondus
            </span>
            <h1 className="mt-4 max-w-[18ch] text-3xl font-bold tracking-tighter text-balance sm:text-4xl lg:text-5xl">
              {total
                ? `${total} ${videosTotal ? "images et vidéos" : "images"}, de la plus récente à la plus ancienne.`
                : "Galerie"}
            </h1>
            <p className="mt-3 max-w-[54ch] text-base leading-relaxed text-muted-foreground">
              Filtrez par album, ajustez la densité. Les images se chargent au
              fil du défilement.
            </p>
          </header>
        </div>

        {images.length > 0 ? (
          <div className="sticky top-0 z-20 mt-8 border-y bg-background/85 backdrop-blur">
            <div className="container mx-auto flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex flex-1 gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setAlbum(null)}
                  aria-pressed={album === null}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 font-mono text-xs transition-colors",
                    album === null
                      ? "border-foreground bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Tous
                </button>
                {albumOptions.map((option) => (
                  <button
                    key={option.slug}
                    type="button"
                    onClick={() => setAlbum(option.slug)}
                    aria-pressed={album === option.slug}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 font-mono text-xs transition-colors",
                      album === option.slug
                        ? "border-foreground bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.name}
                  </button>
                ))}
              </div>

              {canPickDate ? (
                <button
                  type="button"
                  onClick={() => {
                    setPickerKey(null);
                    setPickerOpen(true);
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <CalendarSearch className="h-3.5 w-3.5" />
                  Aller à une date
                </button>
              ) : null}

              <div className="flex overflow-hidden rounded-md border">
                {(["dense", "normal", "large"] as Density[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDensity(mode)}
                    aria-pressed={density === mode}
                    className={cn(
                      "px-3 py-1.5 font-mono text-xs capitalize transition-colors",
                      density === mode
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode === "large" ? "grand" : mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div ref={galleryRef} className="container mx-auto px-4 pt-6 [overflow-anchor:none] sm:px-6 lg:px-8">
          {/* Après un saut à une date, ce qui précède se recharge en remontant. */}
          {firstPage > 1 ? (
            <div ref={topRef} className="flex h-10 items-center justify-center">
              {loadingPrevious ? <Loading /> : null}
            </div>
          ) : null}

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed py-20 text-center">
              <Images className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <h3 className="font-semibold">
                {album ? "Aucune image dans ce filtre" : "Galerie vide"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {album
                  ? "Choisissez un autre album, ou revenez à « Tous »."
                  : "Aucune image n'est disponible pour le moment."}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <section
                key={`${group.key}-${group.start}`}
                className="mt-6 first:mt-0"
                {...timelineGroupProps(group.key, group.start, group.items.length)}
              >
                <div className="mb-2 flex items-baseline gap-3 border-b pb-2">
                  {canPickDate ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPickerKey(group.key);
                        setPickerOpen(true);
                      }}
                      title="Aller à une date"
                      className="group/month inline-flex items-center gap-1 font-mono text-xs font-medium capitalize transition-colors hover:text-primary"
                    >
                      {monthLabel(group.key)}
                      <ChevronDown className="h-3 w-3 opacity-0 transition-opacity group-hover/month:opacity-100 group-focus-visible/month:opacity-100" />
                    </button>
                  ) : (
                    <span className="font-mono text-xs font-medium capitalize">{monthLabel(group.key)}</span>
                  )}
                </div>
                <div className={cn("grid", DENSITY[density])}>
                  {group.items.map((image, indexInGroup) => (
                    <button
                      key={image.name}
                      type="button"
                      onClick={() => openViewer(group.offset + indexInGroup)}
                      className="group relative aspect-square overflow-hidden rounded-sm bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Ouvrir ${image.name}`}
                    >
                      {isVideoFile(image.name) ? (
                        <VideoThumbnail name={image.name} durationMs={image.durationMs} sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw" />
                      ) : (
                        <Image
                          src={thumb(image.name)}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                        />
                      )}
                      {image.album ? (
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-2 pb-1 pt-5 text-left font-mono text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                          {image.album.name}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}

          {images.length > 0 ? <div ref={sentinelRef} className="h-10 w-full" aria-hidden /> : null}

          {loadingMore ? (
            <div className="flex justify-center py-10">
              <Loading />
            </div>
          ) : null}

          {!loadingMore && images.length > 0 && atEnd ? (
            <p className="py-10 text-center font-mono text-xs text-muted-foreground">
              {typeof total === "number" ? `${total} – fin de la galerie` : "Fin de la galerie"}
            </p>
          ) : null}
        </div>
      </div>

      <TimelineNavigator
        months={timelineMonths}
        containerRef={galleryRef}
        topOffset={STICKY_OFFSET}
        loadAt={loadAt}
        pickerOpen={pickerOpen}
        onPickerOpenChange={setPickerOpen}
        pickerKey={pickerKey}
        locale="fr-FR"
      />

      <PublicImageViewer
        items={visible}
        index={selectedIndex}
        onClose={() => setSelectedIndex(null)}
        onIndexChange={setSelectedIndex}
      />
    </>
  );
}
