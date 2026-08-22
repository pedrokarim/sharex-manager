"use client";

import {
  Copy,
  Download,
  Star,
  Lock,
  Unlock,
  Trash2,
  FolderPlus,
  CheckSquare,
} from "lucide-react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuShortcut,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import { useTranslation } from "@/lib/i18n";
import type { FileInfo } from "@/types/files";

interface MultiSelectContextMenuContentProps {
  selectedFiles: FileInfo[];
  selectedCount: number;
  onCopyUrls?: () => void;
  onDownloadSelected?: () => void;
  onToggleStarSelected?: () => void;
  onToggleSecuritySelected?: () => void;
  onDeleteSelected?: () => void;
  onAddToAlbum?: () => void;
  onCreateAlbum?: (fileName?: string) => void;
  onClearSelection?: () => void;
  albums?: Array<{ id: number; name: string }>;
  onAddToSpecificAlbum?: (albumId: number) => void;
}

/**
 * Contenu du menu contextuel de la sélection multiple.
 *
 * Comme pour le menu de fichier, seule la partie contenu est exposée : la carte
 * compose sa propre racine et la conserve d'un mode à l'autre.
 */
export function MultiSelectContextMenuContent({
  selectedFiles,
  selectedCount,
  onCopyUrls,
  onDownloadSelected,
  onToggleStarSelected,
  onToggleSecuritySelected,
  onDeleteSelected,
  onAddToAlbum,
  onCreateAlbum,
  onClearSelection,
  albums = [],
  onAddToSpecificAlbum,
}: MultiSelectContextMenuContentProps) {
  const { t } = useTranslation();

  // Calculer les états pour les actions groupées
  const allStarred = selectedFiles.every((file) => file.isStarred);
  const allSecure = selectedFiles.every((file) => file.isSecure);
  const hasStarred = selectedFiles.some((file) => file.isStarred);
  const hasSecure = selectedFiles.some((file) => file.isSecure);

  const starActionText = allStarred
    ? t("gallery.file_actions.removed_from_favorites")
    : hasStarred
    ? t("multiselect.actions.toggle_favorites")
    : t("gallery.file_actions.added_to_favorites");

  const securityActionText = allSecure
    ? t("gallery.file_actions.now_public")
    : hasSecure
    ? t("multiselect.actions.toggle_security")
    : t("gallery.file_actions.now_private");

  const handleAddToAlbum = (albumId?: number) => {
    if (albumId && onAddToSpecificAlbum) {
      onAddToSpecificAlbum(albumId);
    } else {
      onAddToAlbum?.();
    }
  };

  return (
    <ContextMenuContent className="w-64">
      {/* En-tête de la sélection */}
      <ContextMenuLabel className="flex items-center gap-2">
        <CheckSquare className="h-4 w-4" />
        {t("gallery.selected_count", { count: selectedCount })}
      </ContextMenuLabel>

      <ContextMenuSeparator />

      {/* Actions principales */}
      <ContextMenuItem onClick={onCopyUrls}>
        <Copy className="h-4 w-4 mr-2" />
        {t("multiselect.shortcuts.copy_urls")}
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>

      {onDownloadSelected && (
        <ContextMenuItem onClick={onDownloadSelected}>
          <Download className="h-4 w-4 mr-2" />
          {t("multiselect.actions.download_selected")}
        </ContextMenuItem>
      )}

      <ContextMenuSeparator />

      {/* Actions de fichier groupées */}
      <ContextMenuItem onClick={onToggleStarSelected}>
        <Star
          className={`h-4 w-4 mr-2 ${
            allStarred ? "fill-yellow-500 text-yellow-500" : ""
          }`}
        />
        {starActionText}
        <ContextMenuShortcut>Ctrl+S</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuItem onClick={onToggleSecuritySelected}>
        {allSecure ? (
          <Unlock className="h-4 w-4 mr-2" />
        ) : (
          <Lock className="h-4 w-4 mr-2" />
        )}
        {securityActionText}
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
                onClick={() => handleAddToAlbum(album.id)}
              >
                {album.name}
              </ContextMenuItem>
            ))}
            {albums.length > 10 && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleAddToAlbum()}>
                  Voir tous les albums...
                </ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onCreateAlbum?.()}>
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

      <ContextMenuSeparator />

      {/* Actions de sélection */}
      <ContextMenuItem onClick={onClearSelection}>
        <CheckSquare className="h-4 w-4 mr-2" />
        {t("gallery.deselect_all")}
        <ContextMenuShortcut>Esc</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      {/* Action destructive */}
      <ContextMenuItem
        onClick={onDeleteSelected}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        {t("multiselect.actions.delete_selected")}
        <ContextMenuShortcut>Delete</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
