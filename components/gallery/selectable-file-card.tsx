"use client";

import { MouseEvent } from "react";
import { Check } from "lucide-react";
import { FileCard } from "@/components/file-card";
import { FileContextMenuContent } from "@/components/gallery/file-context-menu";
import { MultiSelectContextMenuContent } from "@/components/gallery/multi-select-context-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AlbumIndicator } from "@/components/gallery/album-indicator";
import { cn } from "@/lib/utils";
import type { FileInfo } from "@/types/files";
import type { ThumbnailSize } from "@/lib/atoms/preferences";

interface SelectableFileCardProps {
  file: FileInfo;
  onDelete?: () => void;
  onCopy?: () => void;
  onSelect?: () => void;
  onToggleSecurity?: () => void;
  onToggleStar?: () => void;
  onToggleSelection?: (
    fileName: string,
    ctrlKey: boolean,
    shiftKey: boolean,
  ) => void;
  onAddToAlbum?: () => void;
  onCreateAlbum?: (fileName?: string) => void;
  onAddSingleFileToAlbum?: (fileName: string) => void;
  onAddToSpecificAlbum?: (albumId: number) => void;
  isNew?: boolean;
  size?: ThumbnailSize;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  showSelectionCheckbox?: boolean;
  albums?: Array<{ id: number; name: string }>;
  allSelectedFiles?: FileInfo[];
  selectedCount?: number;
  hasSelection?: boolean;
  onClearSelection?: () => void;
  onCopyUrls?: () => void;
  onDeleteSelected?: () => void;
  onToggleStarSelected?: () => void;
  onToggleSecuritySelected?: () => void;
  onStartSelectionMode?: (fileName: string) => void;
  fileAlbums?: any[];
}

export function SelectableFileCard({
  file,
  onDelete,
  onCopy,
  onSelect,
  onToggleSecurity,
  onToggleStar,
  onToggleSelection,
  onAddToAlbum,
  onCreateAlbum,
  onAddSingleFileToAlbum,
  onAddToSpecificAlbum,
  isNew,
  size = "medium",
  isSelected = false,
  isSelectionMode = false,
  showSelectionCheckbox = false,
  albums = [],
  allSelectedFiles = [],
  selectedCount = 0,
  hasSelection = false,
  onClearSelection,
  onCopyUrls,
  onDeleteSelected,
  onToggleStarSelected,
  onToggleSecuritySelected,
  onStartSelectionMode,
  fileAlbums = [],
}: SelectableFileCardProps) {
  const showSelectionControl =
    isSelectionMode || showSelectionCheckbox || isSelected;

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && !isSelectionMode && onStartSelectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onStartSelectionMode(file.name);
      return;
    }

    if (isSelectionMode && onToggleSelection) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelection(file.name, e.ctrlKey || e.metaKey, e.shiftKey);
    } else {
      onSelect?.();
    }
  };

  const handleSelectionControlClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isSelectionMode) {
      onStartSelectionMode?.(file.name);
      return;
    }

    onToggleSelection?.(file.name, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const cardContent = (
    <div
      className={cn(
        "relative group cursor-pointer transition-all duration-200",
        isSelected && "ring-2 ring-primary ring-offset-2",
      )}
      onClick={handleClick}
    >
      {isSelected && (
        <div className="absolute inset-0 z-10 rounded-lg bg-primary/10 pointer-events-none" />
      )}

      {(onStartSelectionMode || onToggleSelection) && (
        <button
          type="button"
          aria-label={
            isSelected ? "Retirer de la sélection" : "Ajouter à la sélection"
          }
          aria-pressed={isSelected}
          tabIndex={showSelectionControl ? 0 : -1}
          className={cn(
            "absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2",
            showSelectionControl
              ? "pointer-events-auto scale-100 opacity-100"
              : "pointer-events-none scale-90 opacity-0 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100",
            isSelected
              ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
              : "border-white/60 bg-background/85 text-foreground shadow-lg shadow-black/15 hover:border-primary/50 hover:bg-background dark:border-white/15 dark:bg-black/55 dark:text-white",
          )}
          onClick={handleSelectionControlClick}
        >
          {isSelected ? (
            <Check className="h-4 w-4" />
          ) : (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-current/80" />
          )}
        </button>
      )}

      <FileCard
        file={file}
        onDelete={onDelete}
        onCopy={onCopy}
        onSelect={isSelectionMode ? undefined : onSelect}
        onToggleSecurity={onToggleSecurity}
        onToggleStar={onToggleStar}
        isNew={isNew}
        size={size}
        albumIndicator={
          <AlbumIndicator fileName={file.name} albums={fileAlbums} />
        }
      />
    </div>
  );

  // Le menu dépend du mode, mais la racine, elle, ne doit jamais changer :
  // remplacer le composant d'enveloppe démonterait la carte entière — donc la
  // grille entière — au moment où la sélection démarre. Le bouton qui vient
  // d'être cliqué disparaîtrait alors du DOM, et le navigateur replacerait le
  // défilement en haut de la liste.
  const menu = isSelectionMode
    ? selectedCount > 0
      ? "multiple"
      : "aucun"
    : "fichier";

  return (
    <ContextMenu>
      {/* Désactivé plutôt que retiré : le clic droit rend la main au menu natif,
          comme avant, sans démonter la carte. */}
      <ContextMenuTrigger asChild disabled={menu === "aucun"}>
        {cardContent}
      </ContextMenuTrigger>

      {menu === "multiple" && (
        <MultiSelectContextMenuContent
          selectedFiles={allSelectedFiles}
          selectedCount={selectedCount}
          onCopyUrls={onCopyUrls}
          onToggleStarSelected={onToggleStarSelected}
          onToggleSecuritySelected={onToggleSecuritySelected}
          onDeleteSelected={onDeleteSelected}
          onAddToAlbum={
            hasSelection
              ? onAddToAlbum
              : () => onAddSingleFileToAlbum?.(file.name)
          }
          onCreateAlbum={(fileName) => onCreateAlbum?.(fileName)}
          onClearSelection={onClearSelection}
          albums={albums}
          onAddToSpecificAlbum={onAddToSpecificAlbum}
        />
      )}

      {menu === "fichier" && (
        <FileContextMenuContent
          file={file}
          onCopy={onCopy}
          onToggleStar={onToggleStar}
          onToggleSecurity={onToggleSecurity}
          onDelete={onDelete}
          onAddToAlbum={onAddToAlbum}
          onCreateAlbum={onCreateAlbum}
          onAddSingleFileToAlbum={onAddSingleFileToAlbum}
          albums={albums}
          onAddToSpecificAlbum={onAddToSpecificAlbum}
        />
      )}
    </ContextMenu>
  );
}
