import { DragEvent, MouseEvent } from "react";
import { FileInfo } from "@/types/files";
import { Button } from "../ui/button";
import { FileContextMenuContent } from "@/components/gallery/file-context-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AlbumIndicator } from "@/components/gallery/album-indicator";
import {
  Copy,
  ExternalLink,
  Trash2,
  Download,
  Lock,
  Unlock,
  Star,
  Check,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { getGalleryImageUrl } from "@/lib/utils/url";

interface SelectableListItemCardProps {
  file: FileInfo;
  onCopy: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onToggleSecurity: () => Promise<void>;
  onToggleStar: () => Promise<void>;
  onToggleSelection?: (
    fileName: string,
    ctrlKey: boolean,
    shiftKey: boolean,
  ) => void;
  onAddToAlbum?: () => void;
  onCreateAlbum?: (fileName?: string) => void;
  onAddSingleFileToAlbum?: (fileName: string) => void;
  onAddToSpecificAlbum?: (albumId: number) => void;
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
  detailed?: boolean;
  isNew?: boolean;
}

export function SelectableListItemCard({
  file,
  onCopy,
  onDelete,
  onSelect,
  onToggleSecurity,
  onToggleStar,
  onToggleSelection,
  onAddToAlbum,
  onCreateAlbum,
  onAddSingleFileToAlbum,
  onAddToSpecificAlbum,
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
  detailed,
  isNew,
}: SelectableListItemCardProps) {
  const locale = useDateLocale();
  const showSelectionControl =
    isSelectionMode || showSelectionCheckbox || isSelected;
  const preventNativeImageDrag = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    // Si Ctrl + clic gauche et pas en mode sélection, activer le mode sélection
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

  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);

  return (
    // La racine reste la même quel que soit le mode : retirer le menu du DOM
    // démonterait la ligne entière, et le navigateur ramènerait le défilement
    // en haut de la liste au moment où la sélection démarre. Le déclencheur est
    // donc seulement désactivé, ce qui rend la main au menu natif.
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={isSelectionMode}>
        <div
          className={cn(
            "group relative flex items-center gap-4 rounded-lg border p-4 transition-all hover:bg-accent/50 cursor-pointer",
            isNew && "animate-in fade-in-0 zoom-in-95",
            isSelected && "bg-accent border-primary ring-1 ring-primary",
            (isSelectionMode || showSelectionCheckbox) && "cursor-pointer",
          )}
          onClick={handleClick}
        >
          <div className="flex w-7 flex-shrink-0 items-center justify-center">
            <button
              type="button"
              aria-label={
                isSelected ? "Retirer de la sélection" : "Ajouter à la sélection"
              }
              aria-pressed={isSelected}
              tabIndex={showSelectionControl ? 0 : -1}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2",
                showSelectionControl
                  ? "pointer-events-auto scale-100 opacity-100"
                  : "pointer-events-none scale-90 opacity-0 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "border-border/70 bg-background/90 text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
              onClick={handleSelectionControlClick}
            >
              {isSelected ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span className="h-3 w-3 rounded-full border-2 border-current/70" />
              )}
            </button>
          </div>

          {/* Thumbnail */}
          <div className="flex-shrink-0">
            <div
              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-muted"
              onDragStart={preventNativeImageDrag}
            >
              {isImage ? (
                <Image
                  src={file.url}
                  alt={file.name}
                  width={48}
                  height={48}
                  draggable={false}
                  onDragStart={preventNativeImageDrag}
                  className="object-cover w-full h-full"
                />
              ) : (
                <span className="text-xs font-bold text-muted-foreground">
                  {file.name.split(".").pop()?.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* Informations du fichier */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{file.name}</h3>
              {file.isSecure && (
                <Lock className="h-3 w-3 text-yellow-500 flex-shrink-0" />
              )}
              {file.isStarred && (
                <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
              )}
            </div>

            {detailed && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <span>{(file.size / 1024).toFixed(1)} KB</span>
                <span>{format(parseISO(file.createdAt), "PPp", { locale })}</span>
              </div>
            )}
          </div>

          {/* Indicateur d'album */}
          <div className="flex-shrink-0">
            <AlbumIndicator fileName={file.name} />
          </div>

          {/* Actions */}
          <div className="ml-4 flex shrink-0 gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar();
              }}
              className={cn("h-8 w-8", file.isStarred && "text-yellow-500")}
            >
              <Star className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <a href={file.url} download onClick={(e) => e.stopPropagation()}>
                <Download className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <a
                href={getGalleryImageUrl(file.name)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSecurity();
              }}
              className={cn(
                "bg-background/50 hover:bg-yellow-500 hover:text-white",
                file.isSecure && "text-yellow-500",
              )}
            >
              {file.isSecure ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className={cn(
                "bg-background/50 hover:bg-red-500 hover:text-white",
                "text-destructive",
              )}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </ContextMenuTrigger>

      {!isSelectionMode && (
        <FileContextMenuContent
          file={file}
          onCopy={onCopy}
          onToggleStar={onToggleStar}
          onToggleSecurity={onToggleSecurity}
          onDelete={onDelete}
          onAddToAlbum={onAddToAlbum}
          onCreateAlbum={(fileName) => onCreateAlbum?.(fileName)}
          onAddSingleFileToAlbum={onAddSingleFileToAlbum}
          onAddToSpecificAlbum={onAddToSpecificAlbum}
          albums={albums}
        />
      )}
    </ContextMenu>
  );
}
