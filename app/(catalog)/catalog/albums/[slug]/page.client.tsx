"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, Grid2X2, Images, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loading } from "@/components/ui/loading";
import { PublicImageViewer } from "@/components/catalog/public-image-viewer";
import type { Album } from "@/types/albums";

interface CatalogAlbumDetailPageProps {
  slug: string;
}

interface AlbumImage {
  name: string;
  url: string;
  addedAt: string;
}

export function CatalogAlbumDetailPage({ slug }: CatalogAlbumDetailPageProps) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [files, setFiles] = useState<AlbumImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "masonry">("grid");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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

      // Transformer les fichiers avec leurs métadonnées
      const imageFiles: AlbumImage[] = (data.files || [])
        .filter((entry: any) => /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.fileName))
        .map((entry: any) => ({
          name: entry.fileName,
          url: `/api/files/${encodeURIComponent(entry.fileName)}`,
          addedAt: entry.addedAt,
        }));
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
                  key={file.name}
                  className={
                    viewMode === "grid"
                      ? "aspect-square relative overflow-hidden rounded-lg cursor-pointer group"
                      : "break-inside-avoid relative overflow-hidden rounded-lg cursor-pointer group"
                  }
                  onClick={() => handleImageClick(index)}
                >
                  <Image
                    src={file.url}
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

      {/* Image Viewer */}
      <PublicImageViewer
        items={files.map(file => ({
          ...file,
          album: album ? { name: album.name, slug: album.publicSlug || '' } : undefined,
        }))}
        index={selectedIndex}
        onClose={handleCloseViewer}
        onIndexChange={handleIndexChange}
      />
    </>
  );
}

