"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import {
  FolderOpen,
  MoreVertical,
  Edit2,
  Trash2,
  Calendar,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { Album } from "@/types/albums";

interface AlbumCardProps {
  album: Album;
  viewMode: "grid" | "list";
  onDelete: () => void;
  onEdit: () => void;
}

export function AlbumCard({
  album,
  viewMode,
  onDelete,
  onEdit,
}: AlbumCardProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (error) {
      // L'erreur est gérée par le parent
    } finally {
      setIsDeleting(false);
    }
  };

  if (viewMode === "list") {
    return (
      <Card className="hover:bg-accent/50 transition-colors">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FolderOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                <Link
                  href={`/albums/${album.id}`}
                  className="font-medium hover:underline truncate text-sm sm:text-base"
                >
                  {album.name}
                </Link>
                <Badge variant="secondary" className="text-xs w-fit">
                  {t("albums.files_count", { count: album.fileCount })}
                </Badge>
              </div>

              {album.description && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate mb-1">
                  {album.description}
                </p>
              )}

              <div className="flex items-center text-xs text-muted-foreground gap-2 sm:gap-4">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(parseISO(album.createdAt), "PPP", { locale })}
                </span>
              </div>
            </div>

            <div className="flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8"
                  >
                    <MoreVertical className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit} className="text-sm">
                    <Edit2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive text-sm"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                        {t("albums.delete_album")}
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer l'album ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cette action est irréversible. L'album "{album.name}"
                          sera supprimé définitivement. Les fichiers contenus ne
                          seront pas supprimés.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:shadow-md transition-all duration-200 hover:scale-105">
      <CardHeader className="p-0">
        <Link href={`/albums/${album.id}`}>
          <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 rounded-t-lg flex items-center justify-center relative overflow-hidden">
            {album.thumbnailFile ? (
              // TODO: Afficher la miniature de l'album
              <ImageIcon className="h-8 w-8 sm:h-12 sm:w-12 text-primary/50" />
            ) : (
              <FolderOpen className="h-8 w-8 sm:h-12 sm:w-12 text-primary/50" />
            )}

            {/* Badge du nombre de fichiers */}
            <div className="absolute top-1 right-1 sm:top-2 sm:right-2">
              <Badge variant="secondary" className="text-xs">
                {album.fileCount}
              </Badge>
            </div>
          </div>
        </Link>
      </CardHeader>

      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Link
              href={`/albums/${album.id}`}
              className="font-medium hover:underline truncate block text-sm sm:text-base"
            >
              {album.name}
            </Link>

            {album.description && (
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mt-1">
                {album.description}
              </p>
            )}

            <div className="flex items-center text-xs text-muted-foreground mt-2">
              <Calendar className="h-3 w-3 mr-1" />
              {format(parseISO(album.createdAt), "PPP", { locale })}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 sm:h-8 sm:w-8 opacity-0 group-hover:opacity-100 transition-opacity",
                  "hover:bg-accent"
                )}
              >
                <MoreVertical className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit} className="text-sm">
                <Edit2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive text-sm"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    {t("albums.delete_album")}
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer l'album ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible. L'album "{album.name}" sera
                      supprimé définitivement. Les fichiers contenus ne seront
                      pas supprimés.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
