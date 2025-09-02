import { FileInfo } from "@/types/files";
import { SelectableFileCard } from "@/components/gallery/selectable-file-card";
import { useAtom } from "jotai";
import { thumbnailSizeAtom } from "@/lib/atoms/preferences";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import { getGalleryImageUrl } from "@/lib/utils/url";

interface GridViewProps {
  files: FileInfo[];
  onCopy: (url: string) => void;
  onDelete: (name: string) => void;
  onSelect: (file: FileInfo) => void;
  onToggleSecurity: (file: FileInfo) => Promise<void>;
  onToggleStar: (file: FileInfo) => Promise<void>;
  onToggleSelection?: (
    fileName: string,
    ctrlKey: boolean,
    shiftKey: boolean
  ) => void;
  onAddToAlbum?: () => void;
  onAddToSpecificAlbum?: (albumId: number) => void;
  isSelected?: (fileName: string) => boolean;
  isSelectionMode?: boolean;
  showSelectionCheckbox?: boolean;
  albums?: Array<{ id: number; name: string }>;
  allSelectedFiles?: FileInfo[];
  selectedCount?: number;
  onClearSelection?: () => void;
  onCopyUrls?: () => void;
  onDeleteSelected?: () => void;
  onToggleStarSelected?: () => void;
  onToggleSecuritySelected?: () => void;
  newFileIds: string[];
}

export function GridView({
  files,
  onCopy,
  onDelete,
  onSelect,
  onToggleSecurity,
  onToggleStar,
  onToggleSelection,
  onAddToAlbum,
  onAddToSpecificAlbum,
  isSelected,
  isSelectionMode = false,
  showSelectionCheckbox = false,
  albums = [],
  allSelectedFiles = [],
  selectedCount = 0,
  onClearSelection,
  onCopyUrls,
  onDeleteSelected,
  onToggleStarSelected,
  onToggleSecuritySelected,
  newFileIds,
}: GridViewProps) {
  const [defaultThumbnailSize, setDefaultThumbnailSize] =
    useAtom(thumbnailSizeAtom);
  const [thumbnailSize] = useQueryState<"small" | "medium" | "large">("size", {
    defaultValue: defaultThumbnailSize as "small" | "medium" | "large",
    parse: (value): "small" | "medium" | "large" => {
      if (value === "small" || value === "medium" || value === "large") {
        return value;
      }
      return defaultThumbnailSize as "small" | "medium" | "large";
    },
  });

  const gridSizeClasses = {
    small:
      "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8",
    medium: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    large: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3",
  };

  return (
    <div className={cn("grid gap-4", gridSizeClasses[thumbnailSize])}>
      {files.map((file) => (
        <SelectableFileCard
          key={file.url}
          file={file}
          onDelete={() => onDelete(file.name)}
          onCopy={() => onCopy(getGalleryImageUrl(file.name))}
          onSelect={() => onSelect(file)}
          onToggleSecurity={() => onToggleSecurity(file)}
          onToggleStar={() => onToggleStar(file)}
          onToggleSelection={onToggleSelection}
          onAddToAlbum={onAddToAlbum}
          onAddToSpecificAlbum={onAddToSpecificAlbum}
          isSelected={isSelected?.(file.name) || false}
          isSelectionMode={isSelectionMode}
          showSelectionCheckbox={showSelectionCheckbox}
          albums={albums}
          allSelectedFiles={allSelectedFiles}
          selectedCount={selectedCount}
          onClearSelection={onClearSelection}
          onCopyUrls={onCopyUrls}
          onDeleteSelected={onDeleteSelected}
          onToggleStarSelected={onToggleStarSelected}
          onToggleSecuritySelected={onToggleSecuritySelected}
          isNew={newFileIds.includes(file.name)}
          size={thumbnailSize}
        />
      ))}
    </div>
  );
}
