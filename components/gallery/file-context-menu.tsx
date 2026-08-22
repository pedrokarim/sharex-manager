"use client";

import {
  Copy,
  Download,
  ExternalLink,
  Star,
  Lock,
  Unlock,
  Trash2,
  FolderPlus,
  Share,
  Info,
} from "lucide-react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import { useTranslation } from "@/lib/i18n";
import type { FileInfo } from "@/types/files";
import { getGalleryImageUrl } from "@/lib/utils/url";

interface FileContextMenuContentProps {
  file: FileInfo;
  onCopy?: () => void;
  onDownload?: () => void;
  onExternalOpen?: () => void;
  onToggleStar?: () => void;
  onToggleSecurity?: () => void;
  onDelete?: () => void;
  onAddToAlbum?: () => void;
  onCreateAlbum?: (fileName?: string) => void;
  onAddSingleFileToAlbum?: (fileName: string) => void;
  onShowInfo?: () => void;
  onShare?: () => void;
  albums?: Array<{ id: number; name: string }>;
  onAddToSpecificAlbum?: (albumId: number) => void;
}

/**
 * Contenu du menu contextuel d'un fichier.
 *
 * N'expose que le contenu, pas la racine : les cartes de la galerie alternent
 * entre ce menu et celui de la sélection multiple, et doivent garder une racine
 * `ContextMenu` stable. Changer de composant d'enveloppe démonterait la carte
 * entière au moment où la sélection démarre.
 */
export function FileContextMenuContent({
  file,
  onCopy,
  onDownload,
  onExternalOpen,
  onToggleStar,
  onToggleSecurity,
  onDelete,
  onAddToAlbum,
  onCreateAlbum,
  onAddSingleFileToAlbum,
  onShowInfo,
  onShare,
  albums = [],
  onAddToSpecificAlbum,
}: FileContextMenuContentProps) {
  const { t } = useTranslation();

  const handleCopy = () => {
    onCopy?.();
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Fallback : téléchargement direct
      const link = document.createElement("a");
      link.href = file.url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExternalOpen = () => {
    if (onExternalOpen) {
      onExternalOpen();
    } else {
      window.open(getGalleryImageUrl(file.name), "_blank");
    }
  };

  const handleAddToAlbum = (albumId?: number) => {
    if (albumId && onAddToSpecificAlbum) {
      onAddToSpecificAlbum(albumId);
    } else {
      onAddToAlbum?.();
    }
  };

  return (
    <ContextMenuContent className="w-56">
      {/* Actions principales */}
      <ContextMenuItem onClick={handleCopy}>
        <Copy className="h-4 w-4 mr-2" />
        {t("gallery.file_viewer.copy_url")}
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuItem onClick={handleDownload}>
        <Download className="h-4 w-4 mr-2" />
        Télécharger
      </ContextMenuItem>

      <ContextMenuItem onClick={handleExternalOpen}>
        <ExternalLink className="h-4 w-4 mr-2" />
        {t("gallery.file_viewer.open")}
      </ContextMenuItem>

      <ContextMenuSeparator />

      {/* Actions de fichier */}
      <ContextMenuItem onClick={onToggleStar}>
        <Star
          className={`h-4 w-4 mr-2 ${
            file.isStarred ? "fill-yellow-500 text-yellow-500" : ""
          }`}
        />
        {file.isStarred
          ? t("gallery.file_actions.removed_from_favorites")
          : t("gallery.file_viewer.star")}
        <ContextMenuShortcut>Ctrl+S</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuItem onClick={onToggleSecurity}>
        {file.isSecure ? (
          <Unlock className="h-4 w-4 mr-2" />
        ) : (
          <Lock className="h-4 w-4 mr-2" />
        )}
        {file.isSecure
          ? t("gallery.file_actions.now_public")
          : t("gallery.file_actions.now_private")}
        <ContextMenuShortcut>Ctrl+L</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      {/* Albums */}
      {albums.length > 0 ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderPlus className="h-4 w-4 mr-2" />
            {t("multiselect.add_to_album")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {albums.slice(0, 10).map((album) => (
              <ContextMenuItem
                key={album.id}
                onClick={() => onAddToSpecificAlbum?.(album.id)}
              >
                {album.name}
              </ContextMenuItem>
            ))}
            {albums.length > 10 && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={onAddToAlbum}>
                  Voir tous les albums...
                </ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onCreateAlbum?.(file.name)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              {t("albums.create")}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : (
        <ContextMenuItem onClick={onAddToAlbum}>
          <FolderPlus className="h-4 w-4 mr-2" />
          {t("multiselect.add_to_album")}
          <ContextMenuShortcut>Ctrl+Shift+A</ContextMenuShortcut>
        </ContextMenuItem>
      )}

      {/* Actions supplémentaires */}
      {onShare && (
        <ContextMenuItem onClick={onShare}>
          <Share className="h-4 w-4 mr-2" />
          Partager
        </ContextMenuItem>
      )}

      {onShowInfo && (
        <ContextMenuItem onClick={onShowInfo}>
          <Info className="h-4 w-4 mr-2" />
          Informations
        </ContextMenuItem>
      )}

      <ContextMenuSeparator />

      {/* Action destructive */}
      <ContextMenuItem
        onClick={onDelete}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        {t("common.delete")}
        <ContextMenuShortcut>Delete</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
