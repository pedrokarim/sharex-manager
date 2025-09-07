"use client";

import { MouseEvent } from "react";
import { Check } from "lucide-react";
import { FileCard } from "@/components/file-card";
import { Checkbox } from "@/components/ui/checkbox";
import { FileContextMenu } from "@/components/gallery/file-context-menu";
import { MultiSelectContextMenu } from "@/components/gallery/multi-select-context-menu";
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
    shiftKey: boolean
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
}: SelectableFileCardProps) {
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    console.log("Click debug:", {
      fileName: file.name,
      isSelectionMode,
      isSelected,
      hasOnToggleSelection: !!onToggleSelection,
      hasOnSelect: !!onSelect,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    });

    // Si Ctrl + clic gauche et pas en mode sélection, activer le mode sélection
    if ((e.ctrlKey || e.metaKey) && !isSelectionMode && onStartSelectionMode) {
      e.preventDefault();
      e.stopPropagation();
      console.log("Starting selection mode for:", file.name);
      onStartSelectionMode(file.name);
      return;
    }

    if (isSelectionMode && onToggleSelection) {
      e.preventDefault();
      e.stopPropagation();
      console.log("Calling toggle for:", file.name);
      onToggleSelection(file.name, e.ctrlKey || e.metaKey, e.shiftKey);
    } else {
      console.log("Calling onSelect");
      onSelect?.();
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    if (onToggleSelection) {
      onToggleSelection(file.name, true, false); // Simulate Ctrl+Click pour toggle
    }
  };

  // Choisir le bon context menu en fonction du mode
  if (isSelectionMode && selectedCount > 0) {
    return (
      <MultiSelectContextMenu
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
        enabled={true}
      >
        <div
          className={cn(
            "relative group transition-all duration-200",
            isSelected && "ring-2 ring-primary ring-offset-2",
            (isSelectionMode || showSelectionCheckbox) && "cursor-pointer"
          )}
          onClick={handleClick}
        >
          {/* Overlay de sélection */}
          {isSelected && (
            <div className="absolute inset-0 bg-primary/10 rounded-lg z-10 pointer-events-none" />
          )}

          {/* Checkbox de sélection */}
          {(showSelectionCheckbox || (isSelectionMode && isSelected)) && (
            <div className="absolute top-2 left-2 z-20">
              <div
                className={cn(
                  "w-6 h-6 rounded border-2 bg-background/90 backdrop-blur-sm",
                  "flex items-center justify-center transition-all",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:border-primary/50"
                )}
              >
                {isSelected ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={handleCheckboxChange}
                    className="w-4 h-4 border-0 bg-transparent"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            </div>
          )}

          {/* Badge de sélection dans le coin */}
          {isSelected && !showSelectionCheckbox && (
            <div className="absolute top-2 right-2 z-20">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Check className="h-3 w-3" />
              </div>
            </div>
          )}

          {/* FileCard original */}
          <FileCard
            file={file}
            onDelete={onDelete}
            onCopy={onCopy}
            onSelect={isSelectionMode ? undefined : onSelect} // Désactiver le select original en mode sélection
            onToggleSecurity={onToggleSecurity}
            onToggleStar={onToggleStar}
            isNew={isNew}
            size={size}
          />
        </div>
      </MultiSelectContextMenu>
    );
  }

  return (
    <FileContextMenu
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
      isSelectionMode={isSelectionMode}
      disabled={isSelectionMode}
    >
      <div
        className={cn(
          "relative group transition-all duration-200",
          isSelected && "ring-2 ring-primary ring-offset-2",
          (isSelectionMode || showSelectionCheckbox) && "cursor-pointer"
        )}
        onClick={handleClick}
      >
        {/* Overlay de sélection */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/10 rounded-lg z-10 pointer-events-none" />
        )}

        {/* Checkbox de sélection */}
        {(showSelectionCheckbox || (isSelectionMode && isSelected)) && (
          <div className="absolute top-2 left-2 z-20">
            <div
              className={cn(
                "w-6 h-6 rounded border-2 bg-background/90 backdrop-blur-sm",
                "flex items-center justify-center transition-all",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary/50"
              )}
            >
              {isSelected ? (
                <Check className="h-3 w-3" />
              ) : (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={handleCheckboxChange}
                  className="w-4 h-4 border-0 bg-transparent"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>
        )}

        {/* Badge de sélection dans le coin */}
        {isSelected && !showSelectionCheckbox && (
          <div className="absolute top-2 right-2 z-20">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              <Check className="h-3 w-3" />
            </div>
          </div>
        )}

        {/* FileCard original */}
        <FileCard
          file={file}
          onDelete={onDelete}
          onCopy={onCopy}
          onSelect={isSelectionMode ? undefined : onSelect} // Désactiver le select original en mode sélection
          onToggleSecurity={onToggleSecurity}
          onToggleStar={onToggleStar}
          isNew={isNew}
          size={size}
        />
      </div>
    </FileContextMenu>
  );
}
