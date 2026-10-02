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
  ExternalLink,
  Trash2,
  Calendar,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import type { Album } from "@/types/albums";
import type { AlbumVisibility } from "@/lib/album-visibility";
import {
  AlbumVisibilityBadge,
  AlbumVisibilityOptions,
  type MenuKit,
} from "@/components/albums/album-visibility";

interface AlbumCardProps {
  album: Album;
  viewMode: "grid" | "list";
  onDelete: () => void;
  onEdit: () => void;
}

/** Le menu de l'album existe en deux formes : le bouton « ⋮ » et le clic droit. */
const DROPDOWN: MenuKit & { Separator: typeof DropdownMenuSeparator } = {
  Item: DropdownMenuItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
};
const CONTEXT: MenuKit & { Separator: typeof ContextMenuSeparator } = {
  Item: ContextMenuItem,
  Label: ContextMenuLabel,
  Separator: ContextMenuSeparator,
};

export function AlbumCard({
  album,
  viewMode,
  onDelete,
  onEdit,
}: AlbumCardProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const handleVisibilityChange = async (visibility: AlbumVisibility) => {
    setIsTogglingPublic(true);
    try {
      const response = await fetch(`/api/albums/${album.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visibility }),
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la mise à jour");
      }

      toast.success(t(`albums.visibility.${visibility}.done`));

      // Recharger la page pour mettre à jour l'état
      window.location.reload();
    } catch (error) {
      console.error("Erreur:", error);
      toast.error(t("albums.errors.toggle_visibility"));
    } finally {
      setIsTogglingPublic(false);
    }
  };

  const publicPath = album.isPublic && album.publicSlug ? `/catalog/albums/${album.publicSlug}` : null;

  const handleCopyPublicUrl = async () => {
    if (!publicPath) return;

    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      setCopiedUrl(true);
      toast.success(t("albums.url_copied"));
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (error) {
      console.error("Erreur lors de la copie:", error);
      toast.error("Erreur lors de la copie de l'URL");
    }
  };

  /**
   * Entrées du menu de l'album, les mêmes derrière « ⋮ » et au clic droit :
   * modifier, choisir la visibilité, partager la page publique, supprimer.
   */
  const menuItems = (kit: typeof DROPDOWN | typeof CONTEXT) => (
    <>
      <kit.Item onClick={onEdit} className="text-sm">
        <Edit2 className="mr-2 h-4 w-4" />
        {t("common.edit")}
      </kit.Item>
      <kit.Separator />
      <AlbumVisibilityOptions
        album={album}
        onChange={handleVisibilityChange}
        disabled={isTogglingPublic}
        kit={kit}
      />
      {publicPath ? (
        <>
          <kit.Separator />
          <kit.Item onClick={handleCopyPublicUrl} className="text-sm">
            {copiedUrl ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copiedUrl ? t("albums.url_copied") : t("albums.copy_public_url")}
          </kit.Item>
          <kit.Item onClick={() => window.open(publicPath, "_blank")} className="text-sm">
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("albums.open_new_tab")}
          </kit.Item>
        </>
      ) : null}
      <kit.Separator />
      {/* La confirmation s'ouvre hors du menu : il peut alors se refermer. */}
      <kit.Item onClick={() => setConfirmDelete(true)} className="text-sm text-destructive focus:text-destructive">
        <Trash2 className="mr-2 h-4 w-4" />
        {t("albums.delete_album")}
      </kit.Item>
    </>
  );

  const actionsButton = (className?: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("h-7 w-7 sm:h-8 sm:w-8", className)} aria-label="Album actions">
          <MoreVertical className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{menuItems(DROPDOWN)}</DropdownMenuContent>
    </DropdownMenu>
  );

  const deleteDialog = (
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer l&apos;album ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. L&apos;album « {album.name} » sera supprimé définitivement. Les fichiers
            contenus ne seront pas supprimés.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (viewMode === "list") {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
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
                      <AlbumVisibilityBadge album={album} />
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

                  <div className="flex-shrink-0">{actionsButton()}</div>
                </div>
              </CardContent>
            </Card>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-64">{menuItems(CONTEXT)}</ContextMenuContent>
        </ContextMenu>
        {deleteDialog}
      </>
    );
  }

  // Fonction pour rendre la miniature de l'album
  const renderThumbnail = () => {
    if (imageFiles.length === 0) {
      // Album vide : un aplat neutre et discret. Le dégradé précédent, basé sur
      // --primary, produisait un gros carré gris qu'on pouvait prendre pour un
      // chargement en cours ou une image cassée.
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 border-b bg-muted/40 text-muted-foreground">
          <FolderOpen className="h-7 w-7 opacity-40" />
          <span className="text-xs">Album vide</span>
        </div>
      );
    }

    if (imageFiles.length === 1) {
      // Une seule image : afficher en plein
      return (
        <div className="w-full h-full relative">
          <Image
            src={`/api/thumbnails/${encodeURIComponent(imageFiles[0])}`}
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
                  src={`/api/thumbnails/${encodeURIComponent(imageFile)}`}
                  alt={`${album.name} - Image ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 12.5vw"
                />
              </div>
            );
          } else {
            // Case manquante dans la mosaïque : un simple aplat, sans icône.
            // Répéter le dossier jusqu'à trois fois attirait l'œil sur le vide.
            return <div key={index} className="h-full w-full bg-muted/40" />;
          }
        })}
      </div>
    );
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* py-0 gap-0 : depuis shadcn v4, Card porte py-6 et gap-6 en dur, ce qui
              insérait une bande vide au-dessus de la couverture.
              hover:scale retiré : sur une grille, la carte agrandie chevauchait ses
              voisines. L'ombre suffit à signaler le survol. */}
          <Card className="group gap-0 overflow-hidden py-0 transition-shadow duration-200 hover:shadow-md">
            <CardHeader className="p-0">
              <Link href={`/albums/${album.id}`}>
                <div className="relative aspect-video overflow-hidden bg-muted">
                  {renderThumbnail()}

                  {/* Visibilité et nombre de fichiers */}
                  <div className="absolute top-1 right-1 sm:top-2 sm:right-2 z-10 flex gap-1">
                    <AlbumVisibilityBadge album={album} />
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

                {actionsButton("opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent")}
              </div>
            </CardContent>
          </Card>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-64">{menuItems(CONTEXT)}</ContextMenuContent>
      </ContextMenu>
      {deleteDialog}
    </>
  );
}
