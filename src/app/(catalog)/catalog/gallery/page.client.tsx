"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Images } from "lucide-react";

import {
  CATALOG_STICKY_OFFSET,
  CatalogToolbar,
  DateChip,
  DensitySwitch,
  MediaGrid,
  MediaGridSkeleton,
  MediaTile,
  MonthHeading,
  type Density,
} from "@/components/catalog/catalog-grid";
import { PublicImageViewer } from "@/components/catalog/public-image-viewer";
import { FRONT_FULL } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { ACCENT, CHIP, CHIP_ACTIVE, CHIP_IDLE } from "@/components/front/styles";
import { Loading } from "@/components/ui/loading";
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

const PAGE_SIZE = 60;

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

  const countLabel =
    typeof total === "number"
      ? `${new Intl.NumberFormat("fr-FR").format(total)} ${videosTotal ? "images et vidéos" : total > 1 ? "images" : "image"}`
      : null;

  return (
    <>
      <PhotoHeader
        photo="glade"
        kicker="Tous albums confondus"
        title="Toutes les images,"
        titleAccent="au fil du temps."
        description="De la plus récente à la plus ancienne. Filtrez par album, réglez la taille des vignettes, ou sautez à une date."
      />

      {images.length > 0 ? (
        <CatalogToolbar>
          <div className="flex min-w-0 flex-1 basis-full gap-2 overflow-x-auto sm:basis-0">
            <button
              type="button"
              onClick={() => setAlbum(null)}
              aria-pressed={album === null}
              className={cn(CHIP, album === null ? CHIP_ACTIVE : CHIP_IDLE)}
            >
              Tous
            </button>
            {albumOptions.map((option) => (
              <button
                key={option.slug}
                type="button"
                onClick={() => setAlbum(option.slug)}
                aria-pressed={album === option.slug}
                className={cn(CHIP, album === option.slug ? CHIP_ACTIVE : CHIP_IDLE)}
              >
                {option.name}
              </button>
            ))}
          </div>

          {countLabel ? <span className="hidden text-sm text-muted-foreground lg:block">{countLabel}</span> : null}
          {canPickDate ? (
            <DateChip
              onClick={() => {
                setPickerKey(null);
                setPickerOpen(true);
              }}
            />
          ) : null}
          <DensitySwitch value={density} onChange={setDensity} />
        </CatalogToolbar>
      ) : null}

      <div ref={galleryRef} className={cn(FRONT_FULL, "pt-6 pb-24 [overflow-anchor:none]")}>
        {/* Après un saut à une date, ce qui précède se recharge en remontant. */}
        {firstPage > 1 ? (
          <div ref={topRef} className="flex h-10 items-center justify-center">
            {loadingPrevious ? <Loading variant="spinner" size="sm" /> : null}
          </div>
        ) : null}

        {loading ? (
          <div className="pt-16">
            <MediaGridSkeleton density={density} />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-24 text-center">
            <Images className={cn("mx-auto size-9", ACCENT)} strokeWidth={1.5} />
            <h2 className={cn(DISPLAY, "mt-5 text-3xl")}>{album ? "Aucune image dans ce filtre" : "Galerie vide"}</h2>
            <p className="mt-2 text-muted-foreground">
              {album ? "Choisissez un autre album, ou revenez à « Tous »." : "Aucune image n'est disponible pour le moment."}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={`${group.key}-${group.start}`}
              className="mt-12 first:mt-4"
              {...timelineGroupProps(group.key, group.start, group.items.length)}
            >
              <MonthHeading
                label={monthLabel(group.key)}
                onPick={
                  canPickDate
                    ? () => {
                        setPickerKey(group.key);
                        setPickerOpen(true);
                      }
                    : undefined
                }
              />
              <MediaGrid density={density}>
                {group.items.map((image, indexInGroup) => (
                  <MediaTile
                    key={image.name}
                    name={image.name}
                    durationMs={image.durationMs}
                    caption={image.album?.name}
                    onOpen={() => openViewer(group.offset + indexInGroup)}
                  />
                ))}
              </MediaGrid>
            </section>
          ))
        )}

        {images.length > 0 ? <div ref={sentinelRef} className="h-10 w-full" aria-hidden /> : null}

        {loadingMore ? (
          <div className="pt-2">
            <MediaGridSkeleton density={density} count={14} />
          </div>
        ) : null}

        {!loadingMore && images.length > 0 && atEnd ? (
          <p className="pt-16 text-center text-sm text-muted-foreground">
            {countLabel ? `${countLabel} – fin de la galerie` : "Fin de la galerie"}
          </p>
        ) : null}
      </div>

      <TimelineNavigator
        months={timelineMonths}
        containerRef={galleryRef}
        topOffset={CATALOG_STICKY_OFFSET}
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
