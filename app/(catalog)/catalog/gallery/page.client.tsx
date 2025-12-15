"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Download, Images, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";

export function CatalogGalleryPage() {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        const response = await fetch("/api/public/catalog?randomImages=100");
        if (response.ok) {
          const data = await response.json();
          setImages(data.heroImages || []);
        }
      } catch (error) {
        console.error("Erreur:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, []);

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!selectedImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedImage(null);
      } else if (e.key === "ArrowRight") {
        const currentIndex = images.indexOf(selectedImage);
        if (currentIndex < images.length - 1) {
          setSelectedImage(images[currentIndex + 1]);
        }
      } else if (e.key === "ArrowLeft") {
        const currentIndex = images.indexOf(selectedImage);
        if (currentIndex > 0) {
          setSelectedImage(images[currentIndex - 1]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedImage, images]);

  if (loading) {
    return (
      <div className="pt-24">
        <Loading fullHeight />
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
              {images.map((file, index) => (
                <div
                  key={file}
                  className="break-inside-avoid relative overflow-hidden rounded-lg cursor-pointer group"
                  onClick={() => setSelectedImage(file)}
                >
                  <Image
                    src={`/api/files/${encodeURIComponent(file)}`}
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

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setSelectedImage(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/10"
            onClick={() => setSelectedImage(null)}
          >
            <X className="h-6 w-6" />
          </Button>

          <a
            href={`/api/files/${encodeURIComponent(selectedImage)}`}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-16"
          >
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
            >
              <Download className="h-5 w-5" />
            </Button>
          </a>

          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={`/api/files/${encodeURIComponent(selectedImage)}`}
              alt=""
              width={1200}
              height={800}
              className="max-w-full max-h-[90vh] object-contain"
            />
          </div>

          {/* Navigation hints */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            Utilisez les flèches ← → pour naviguer • Échap pour fermer
          </div>
        </div>
      )}
    </>
  );
}

