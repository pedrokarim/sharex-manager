"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { FolderOpen, Image as ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Album } from "@/types/albums";

interface PublicAlbumCardProps {
  album: Album & {
    imageCount: number;
    firstImage: string | null;
  };
}

export function PublicAlbumCard({ album }: PublicAlbumCardProps) {
  const [imageFiles, setImageFiles] = useState<string[]>([]);

  useEffect(() => {
    const loadAlbumImages = async () => {
      if (album.fileCount === 0) {
        setImageFiles([]);
        return;
      }

      try {
        const response = await fetch(`/api/public/albums/${album.publicSlug}`);
        if (!response.ok) return;

        const data = await response.json();
        const files: string[] = data.files || [];

        const images = files.filter((fileName: string) =>
          /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
        );

        setImageFiles(images.slice(0, 4));
      } catch (error) {
        console.error("Erreur lors du chargement des images:", error);
        setImageFiles([]);
      }
    };

    loadAlbumImages();
  }, [album.publicSlug, album.fileCount]);

  const renderThumbnail = () => {
    if (imageFiles.length === 0) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
          <FolderOpen className="h-12 w-12 text-primary/50" />
        </div>
      );
    }

    if (imageFiles.length === 1) {
      return (
        <div className="w-full h-full relative">
          <Image
            src={`/api/files/${encodeURIComponent(imageFiles[0])}`}
            alt={album.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      );
    }

    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
        {[0, 1, 2, 3].map((index) => {
          const imageFile = imageFiles[index];
          if (imageFile) {
            return (
              <div key={index} className="relative w-full h-full">
                <Image
                  src={`/api/files/${encodeURIComponent(imageFile)}`}
                  alt={`${album.name} - Image ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 16.5vw"
                />
              </div>
            );
          } else {
            return (
              <div
                key={index}
                className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5"
              >
                <FolderOpen className="h-6 w-6 text-primary/50" />
              </div>
            );
          }
        })}
      </div>
    );
  };

  return (
    <Link href={`/public/albums/${album.publicSlug}`}>
      <Card className="group hover:shadow-lg transition-all duration-300 hover:scale-[1.02] overflow-hidden border-border/50">
        <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 relative overflow-hidden">
          {renderThumbnail()}
          <div className="absolute top-2 right-2 z-10">
            <Badge
              variant="secondary"
              className="text-xs backdrop-blur-sm bg-background/80"
            >
              {album.imageCount} {album.imageCount === 1 ? "image" : "images"}
            </Badge>
          </div>
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold text-base mb-1 line-clamp-1 group-hover:text-primary transition-colors">
            {album.name}
          </h3>
          {album.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {album.description}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
