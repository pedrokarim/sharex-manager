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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import { useTranslation } from "@/lib/i18n";
import type { FileInfo } from "@/types/files";

interface MultiSelectContextMenuProps {
  children: React.ReactNode;
  selectedFiles: FileInfo[];
  selectedCount: number;
  onCopyUrls?: () => void;
  onDownloadSelected?: () => void;
  onToggleStarSelected?: () => void;
  onToggleSecuritySelected?: () => void;
  onDeleteSelected?: () => void;
  onAddToAlbum?: () => void;
  onClearSelection?: () => void;
  albums?: Array<{ id: number; name: string }>;
  onAddToSpecificAlbum?: (albumId: number) => void;
  enabled?: boolean;
}

export function MultiSelectContextMenu({
  children,
  selectedFiles,
  selectedCount,
  onCopyUrls,
  onDownloadSelected,
  onToggleStarSelected,
  onToggleSecuritySelected,
  onDeleteSelected,
  onAddToAlbum,
  onClearSelection,
  albums = [],
  onAddToSpecificAlbum,
  enabled = true,
}: MultiSelectContextMenuProps) {
  const { t } = useTranslation();

  if (!enabled || selectedCount === 0) {
    return <>{children}</>;
  }

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
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
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
              <ContextMenuItem onClick={() => handleAddToAlbum()}>
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
    </ContextMenu>
  );
}


