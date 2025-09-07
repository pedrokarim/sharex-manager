"use client";

import { useState, useEffect } from "react";
import { Folder, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";

interface Album {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  fileCount: number;
}

interface FileAlbumsSectionProps {
  fileName: string;
  onAddToAlbum?: () => void;
  onCreateAlbum?: () => void;
}

export function FileAlbumsSection({
  fileName,
  onAddToAlbum,
  onCreateAlbum,
}: FileAlbumsSectionProps) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/files/${encodeURIComponent(fileName)}/albums`
        );
        if (response.ok) {
          const data = await response.json();
          setAlbums(data.albums || []);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des albums:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlbums();
  }, [fileName]);

  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Folder className="h-4 w-4" />
          {t("albums.title")}
        </h3>
        <div className="text-sm text-muted-foreground">
          {t("common.loading")}...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          {albums.length === 0 ? (
            <Folder className="h-4 w-4" />
          ) : (
            <FolderOpen className="h-4 w-4" />
          )}
          {t("albums.title")}
        </h3>
        <div className="flex gap-1">
          {onAddToAlbum && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAddToAlbum}
              className="h-7 px-2 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              {t("albums.add_to_album")}
            </Button>
          )}
          {onCreateAlbum && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCreateAlbum}
              className="h-7 px-2 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              {t("albums.create")}
            </Button>
          )}
        </div>
      </div>

      {albums.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {t("albums.not_in_any_album")}
        </div>
      ) : (
        <div className="space-y-2">
          {albums.map((album) => (
            <div
              key={album.id}
              className="flex items-center justify-between p-2 rounded-md bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">{album.name}</span>
                {album.description && (
                  <span className="text-xs text-muted-foreground">
                    - {album.description}
                  </span>
                )}
              </div>
              <Badge variant="secondary" className="text-xs rounded-sm">
                {t("albums.files_count", { count: album.fileCount })}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
