"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Images } from "lucide-react";
import { Loading } from "@/components/ui/loading";
import { PublicImageViewer } from "@/components/catalog/public-image-viewer";

interface GalleryImage {
  name: string;
  url: string;
  addedAt?: string;
  album?: {
    name: string;
    slug: string;
  };
}

export function CatalogGalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const dedupeByName = (items: GalleryImage[]) => {
    const map = new Map<string, GalleryImage>();
    for (const item of items) {
      if (!map.has(item.name)) map.set(item.name, item);
    }
    return Array.from(map.values());
  };

  const fetchPage = async (offset: number) => {
    const response = await fetch(
      `/api/public/catalog?images=true&imagesLimit=60&imagesOffset=${offset}`,
    );
    if (!response.ok) throw new Error("Impossible de charger la galerie");
    return response.json();
  };

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        const data = await fetchPage(0);
        const pageImages: GalleryImage[] = (data.images || []).map((item: any) => ({
          name: item.name,
          url: `/api/files/${encodeURIComponent(item.name)}`,
          addedAt: item.addedAt,
          album: item.albumSlug
            ? {
                name: item.albumName,
                slug: item.albumSlug,
              }
            : undefined,
        }));
        setImages(dedupeByName(pageImages));
        setHasMore(Boolean(data.imagesHasMore));
        setNextOffset(typeof data.imagesNextOffset === "number" ? data.imagesNextOffset : pageImages.length);
        setTotal(typeof data.imagesTotal === "number" ? data.imagesTotal : null);
      } catch (error) {
        console.error("Erreur:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;
    if (!hasMore) return;

    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      async (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loading || loadingMore || !hasMore) return;

        setLoadingMore(true);
        try {
          const data = await fetchPage(nextOffset);
          const pageImages: GalleryImage[] = (data.images || []).map((item: any) => ({
            name: item.name,
            url: `/api/files/${encodeURIComponent(item.name)}`,
            addedAt: item.addedAt,
            album: item.albumSlug
              ? {
                  name: item.albumName,
                  slug: item.albumSlug,
                }
              : undefined,
          }));

          setImages((prev) => dedupeByName([...prev, ...pageImages]));
          setHasMore(Boolean(data.imagesHasMore));
          setNextOffset(typeof data.imagesNextOffset === "number" ? data.imagesNextOffset : nextOffset + pageImages.length);
          setTotal(typeof data.imagesTotal === "number" ? data.imagesTotal : total);
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
  }, [hasMore, loading, loadingMore, nextOffset, total]);

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
  };

  const handleCloseViewer = () => {
    setSelectedIndex(null);
  };

  const handleIndexChange = (newIndex: number) => {
    setSelectedIndex(newIndex);
  };

  if (loading) {
    return (
      <div className="pt-24 min-h-[calc(100vh-6rem)] flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <>
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Galerie
            </h1>
            <p className="text-muted-foreground mt-3 max-w-2xl text-lg">
              Toutes les images des albums publics en un seul endroit
            </p>
          </div>

          {/* Gallery */}
          {images.length === 0 ? (
            <div className="text-center py-16">
              <Images className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">Galerie vide</h3>
              <p className="text-muted-foreground mt-1">
                Aucune image n'est disponible pour le moment
              </p>
            </div>
          ) : (
            <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 sm:gap-4 space-y-3 sm:space-y-4">
              {images.map((image, index) => (
                <div
                  key={image.name}
                  className="break-inside-avoid relative overflow-hidden rounded-lg cursor-pointer group"
                  onClick={() => handleImageClick(index)}
                >
                  <Image
                    src={image.url}
                    alt={`Image ${index + 1}`}
                    width={400}
                    height={300}
                    className="w-full h-auto transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </div>
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {images.length > 0 && hasMore ? (
            <div className="pt-10 flex justify-center">
              <div ref={sentinelRef} className="h-10 w-full" aria-hidden />
            </div>
          ) : null}

          {loadingMore ? (
            <div className="py-10 flex items-center justify-center">
              <Loading />
            </div>
          ) : null}

          {!loading && !loadingMore && images.length > 0 && !hasMore ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Fin de la galerie
              {typeof total === "number" ? ` — ${images.length}/${total} images chargées` : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Image Viewer */}
      <PublicImageViewer
        items={images}
        index={selectedIndex}
        onClose={handleCloseViewer}
        onIndexChange={handleIndexChange}
      />
    </>
  );
}

