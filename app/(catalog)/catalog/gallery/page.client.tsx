"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Images } from "lucide-react";

import { Loading } from "@/components/ui/loading";
import { PublicImageViewer } from "@/components/catalog/public-image-viewer";
import { cn } from "@/lib/utils";

interface GalleryImage {
  name: string;
  url: string;
  addedAt?: string;
  album?: { name: string; slug: string };
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

const monthLabel = (iso?: string) => {
  if (!iso) return "Sans date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sans date";
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(d);
};

export function CatalogGalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [density, setDensity] = useState<Density>("normal");
  const [album, setAlbum] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const mapPage = (raw: any[]): GalleryImage[] =>
    raw.map((item) => ({
      name: item.name,
      url: `/api/files/${encodeURIComponent(item.name)}`,
      addedAt: item.addedAt,
      album: item.albumSlug
        ? { name: item.albumName, slug: item.albumSlug }
        : undefined,
    }));

  const dedupe = (items: GalleryImage[]) => {
    const map = new Map<string, GalleryImage>();
    for (const item of items) if (!map.has(item.name)) map.set(item.name, item);
    return Array.from(map.values());
  };

  const fetchPage = useCallback(async (offset: number) => {
    const response = await fetch(
      `/api/public/catalog?images=true&imagesLimit=${PAGE_SIZE}&imagesOffset=${offset}`,
    );
    if (!response.ok) throw new Error("Impossible de charger la galerie");
    return response.json();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPage(0);
        if (cancelled) return;
        const page = mapPage(data.images || []);
        setImages(dedupe(page));
        setHasMore(Boolean(data.imagesHasMore));
        setNextOffset(
          typeof data.imagesNextOffset === "number"
            ? data.imagesNextOffset
            : page.length,
        );
        setTotal(typeof data.imagesTotal === "number" ? data.imagesTotal : null);
      } catch (error) {
        console.error("Erreur:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loading || loadingMore || !hasMore) return;

        setLoadingMore(true);
        try {
          const data = await fetchPage(nextOffset);
          const page = mapPage(data.images || []);
          setImages((prev) => dedupe([...prev, ...page]));
          setHasMore(Boolean(data.imagesHasMore));
          setNextOffset(
            typeof data.imagesNextOffset === "number"
              ? data.imagesNextOffset
              : nextOffset + page.length,
          );
        } catch (error) {
          console.error("Erreur:", error);
          setHasMore(false);
        } finally {
          setLoadingMore(false);
        }
      },
      { root: null, rootMargin: "800px 0px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, loading, loadingMore, nextOffset]);

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
                ? `${total} images, de la plus récente à la plus ancienne.`
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

        <div className="container mx-auto px-4 pt-6 sm:px-6 lg:px-8">
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
            <div className={cn("grid", DENSITY[density])}>
              {visible.map((image, index) => {
                const previous = visible[index - 1];
                const showMonth =
                  index === 0 ||
                  monthLabel(previous?.addedAt) !== monthLabel(image.addedAt);

                return (
                  <div key={image.name} className="contents">
                    {showMonth ? (
                      <div className="col-span-full mb-1 mt-6 flex items-baseline gap-3 border-b pb-2 first:mt-0">
                        <span className="font-mono text-xs font-medium capitalize">
                          {monthLabel(image.addedAt)}
                        </span>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openViewer(index)}
                      className="group relative aspect-square overflow-hidden rounded-sm bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Ouvrir ${image.name}`}
                    >
                      <Image
                        src={thumb(image.name)}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                      {image.album ? (
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-2 pb-1 pt-5 text-left font-mono text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                          {image.album.name}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {images.length > 0 && hasMore ? (
            <div ref={sentinelRef} className="h-10 w-full" aria-hidden />
          ) : null}

          {loadingMore ? (
            <div className="flex justify-center py-10">
              <Loading />
            </div>
          ) : null}

          {!loadingMore && images.length > 0 && !hasMore ? (
            <p className="py-10 text-center font-mono text-xs text-muted-foreground">
              {typeof total === "number"
                ? `${images.length} / ${total} — fin de la galerie`
                : "Fin de la galerie"}
            </p>
          ) : null}
        </div>
      </div>

      <PublicImageViewer
        items={visible}
        index={selectedIndex}
        onClose={() => setSelectedIndex(null)}
        onIndexChange={setSelectedIndex}
      />
    </>
  );
}
