"use client";

import { useEffect, useState } from "react";
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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        const response = await fetch("/api/public/catalog?randomImages=100");
        if (response.ok) {
          const data = await response.json();
          const galleryImages: GalleryImage[] = (data.heroImages || []).map((item: any) => ({
            name: item.name,
            url: `/api/files/${encodeURIComponent(item.name)}`,
            addedAt: item.addedAt,
            album: item.albumSlug ? {
              name: item.albumName,
              slug: item.albumSlug,
            } : undefined,
          }));
          setImages(galleryImages);
        }
      } catch (error) {
        console.error("Erreur:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, []);

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

