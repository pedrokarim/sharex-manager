"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import {
  FolderOpen,
  MoreVertical,
  Edit2,
  Trash2,
  Calendar,
  Image as ImageIcon,
  Globe,
  GlobeLock,
  Copy,
  Check,
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
import { toast } from "sonner";
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
  const [imageFiles, setImageFiles] = useState<string[]>([]);
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Charger les fichiers de l'album et filtrer les images
  useEffect(() => {
    const loadAlbumImages = async () => {
      if (album.fileCount === 0) {
        setImageFiles([]);
        return;
      }

      try {
        const response = await fetch(`/api/albums/${album.id}/files`);
        if (!response.ok) return;

        const data = await response.json();
        const files: string[] = data.files || [];

        // Filtrer uniquement les images
        const images = files.filter((fileName: string) =>
          /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
        );

        // Prendre les 4 premières images
        setImageFiles(images.slice(0, 4));
      } catch (error) {
        console.error(
          "Erreur lors du chargement des images de l'album:",
          error
        );
        setImageFiles([]);
      }
    };

    loadAlbumImages();
  }, [album.id, album.fileCount]);

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

  const handleTogglePublic = async () => {
    setIsTogglingPublic(true);
    try {
      const response = await fetch(`/api/albums/${album.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPublic: !album.isPublic,
        }),
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la mise à jour");
      }

      const updatedAlbum = await response.json();
      toast.success(
        updatedAlbum.isPublic
          ? "Album rendu public avec succès"
          : "Album rendu privé avec succès"
      );

      // Recharger la page pour mettre à jour l'état
      window.location.reload();
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la mise à jour de la visibilité");
    } finally {
      setIsTogglingPublic(false);
    }
  };

  const handleCopyPublicUrl = async () => {
    if (!album.publicSlug) return;

    const publicUrl = `${window.location.origin}/public/albums/${album.publicSlug}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedUrl(true);
      toast.success("URL publique copiée dans le presse-papiers");
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (error) {
      console.error("Erreur lors de la copie:", error);
      toast.error("Erreur lors de la copie de l'URL");
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
                  <DropdownMenuItem
                    onClick={handleTogglePublic}
                    disabled={isTogglingPublic}
                    className="text-sm"
                  >
                    {album.isPublic ? (
                      <>
                        <GlobeLock className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                        Rendre privé
                      </>
                    ) : (
                      <>
                        <Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                        Rendre public
                      </>
                    )}
                  </DropdownMenuItem>
                  {album.isPublic && album.publicSlug && (
                    <DropdownMenuItem
                      onClick={handleCopyPublicUrl}
                      className="text-sm"
                    >
                      {copiedUrl ? (
                        <>
                          <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                          URL copiée
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                          Copier l'URL publique
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
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

  // Fonction pour rendre la miniature de l'album
  const renderThumbnail = () => {
    if (imageFiles.length === 0) {
      // Aucune image : afficher l'icône de dossier
      return (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
          <FolderOpen className="h-8 w-8 sm:h-12 sm:w-12 text-primary/50" />
        </div>
      );
    }

    if (imageFiles.length === 1) {
      // Une seule image : afficher en plein
      return (
        <div className="w-full h-full relative">
          <Image
            src={`/api/files/${encodeURIComponent(imageFiles[0])}`}
            alt={album.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
          />
        </div>
      );
    }

    // 2, 3 ou 4 images : grille de 2x2
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
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 12.5vw"
                />
              </div>
            );
          } else {
            // Case vide : afficher l'icône de dossier
            return (
              <div
                key={index}
                className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5"
              >
                <FolderOpen className="h-4 w-4 sm:h-6 sm:w-6 text-primary/50" />
              </div>
            );
          }
        })}
      </div>
    );
  };

  return (
    <Card className="group hover:shadow-md transition-all duration-200 hover:scale-105">
      <CardHeader className="p-0">
        <Link href={`/albums/${album.id}`}>
          <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 rounded-t-lg relative overflow-hidden">
            {renderThumbnail()}

            {/* Badge du nombre de fichiers */}
            <div className="absolute top-1 right-1 sm:top-2 sm:right-2 z-10 flex gap-1">
              {album.isPublic && (
                <Badge variant="default" className="text-xs bg-green-600">
                  <Globe className="h-2.5 w-2.5 mr-1" />
                  Public
                </Badge>
              )}
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
              <DropdownMenuItem
                onClick={handleTogglePublic}
                disabled={isTogglingPublic}
                className="text-sm"
              >
                {album.isPublic ? (
                  <>
                    <GlobeLock className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    Rendre privé
                  </>
                ) : (
                  <>
                    <Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    Rendre public
                  </>
                )}
              </DropdownMenuItem>
              {album.isPublic && album.publicSlug && (
                <DropdownMenuItem
                  onClick={handleCopyPublicUrl}
                  className="text-sm"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                      URL copiée
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                      Copier l'URL publique
                    </>
                  )}
                </DropdownMenuItem>
              )}
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
