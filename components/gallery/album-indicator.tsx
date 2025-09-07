"use client";

import { useState, useEffect } from "react";
import { Folder, FolderOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";

interface Album {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  fileCount: number;
}

interface AlbumIndicatorProps {
  fileName: string;
  className?: string;
  albums?: Album[];
}

export function AlbumIndicator({
  fileName,
  className = "",
  albums = [],
}: AlbumIndicatorProps) {
  const { t } = useTranslation();

  if (albums.length === 0) {
    return null; // Pas d'indicateur si pas d'albums
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1 ${className}`}>
            {albums.length > 0 && (
              <span className="text-muted-foreground">•</span>
            )}
            {albums.length === 1 ? (
              <Folder className="h-4 w-4 text-blue-500" />
            ) : (
              <FolderOpen className="h-4 w-4 text-blue-500" />
            )}
            <Badge
              variant="secondary"
              className="text-xs px-1 py-0 h-5 min-w-5 rounded-sm"
            >
              {albums.length}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-medium text-sm">
              {albums.length === 1
                ? t("albums.in_one_album")
                : t("albums.in_albums", { count: albums.length })}
            </div>
            <div className="space-y-1">
              {albums.map((album) => (
                <div key={album.id} className="text-xs text-muted-foreground">
                  • {album.name}
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
