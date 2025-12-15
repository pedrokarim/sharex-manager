"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, Download, Grid2X2, Images, List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loading } from "@/components/ui/loading";
import type { Album } from "@/types/albums";

interface CatalogAlbumDetailPageProps {
  slug: string;
}

export function CatalogAlbumDetailPage({ slug }: CatalogAlbumDetailPageProps) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "masonry">("grid");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const fetchAlbumData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/public/albums/${slug}`);

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Album introuvable");
          return;
        }
        throw new Error("Erreur lors du chargement");
      }

      const data = await response.json();
      setAlbum(data);

      // Filtrer uniquement les images
      const imageFiles = (data.files || []).filter((fileName: string) =>
        /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
      );
      setFiles(imageFiles);
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement de l'album");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchAlbumData();
  }, [fetchAlbumData]);

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!selectedImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedImage(null);
      } else if (e.key === "ArrowRight") {
        const currentIndex = files.indexOf(selectedImage);
        if (currentIndex < files.length - 1) {
          setSelectedImage(files[currentIndex + 1]);
        }
      } else if (e.key === "ArrowLeft") {
        const currentIndex = files.indexOf(selectedImage);
        if (currentIndex > 0) {
          setSelectedImage(files[currentIndex - 1]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedImage, files]);

  if (loading) {
    return (
      <div className="pt-24">
        <Loading fullHeight />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center py-16">
          <Images className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Album introuvable</h1>
          <p className="text-muted-foreground mt-2">
            Cet album n'existe pas ou n'est plus accessible.
          </p>
          <Link href="/catalog/albums" className="mt-6 inline-block">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Retour aux albums
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/catalog/albums"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour aux albums
            </Link>

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  {album.name}
                </h1>
                {album.description && (
                  <p className="text-muted-foreground mt-2 max-w-2xl">
                    {album.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-4">
                  <Badge variant="secondary" className="gap-1">
                    <Images className="h-3 w-3" />
                    {files.length} {files.length === 1 ? "image" : "images"}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      {viewMode === "grid" ? (
                        <Grid2X2 className="h-4 w-4" />
                      ) : (
                        <List className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setViewMode("grid")}>
                      <Grid2X2 className="mr-2 h-4 w-4" />
                      Grille
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setViewMode("masonry")}>
                      <List className="mr-2 h-4 w-4" />
                      Masonry
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Gallery */}
          {files.length === 0 ? (
            <div className="text-center py-16">
              <Images className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">Album vide</h3>
              <p className="text-muted-foreground mt-1">
                Cet album ne contient aucune image
              </p>
            </div>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
                  : "columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 sm:gap-4 space-y-3 sm:space-y-4"
              }
            >
              {files.map((file, index) => (
                <div
                  key={file}
                  className={
                    viewMode === "grid"
                      ? "aspect-square relative overflow-hidden rounded-lg cursor-pointer group"
                      : "break-inside-avoid relative overflow-hidden rounded-lg cursor-pointer group"
                  }
                  onClick={() => setSelectedImage(file)}
                >
                  <Image
                    src={`/api/files/${encodeURIComponent(file)}`}
                    alt={`Image ${index + 1}`}
                    fill={viewMode === "grid"}
                    width={viewMode === "masonry" ? 400 : undefined}
                    height={viewMode === "masonry" ? 300 : undefined}
                    className={
                      viewMode === "grid"
                        ? "object-cover transition-transform duration-300 group-hover:scale-105"
                        : "w-full h-auto transition-transform duration-300 group-hover:scale-[1.02]"
                    }
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

