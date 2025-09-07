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
  onCreateAlbum?: (fileName?: string) => void;
  onAddSingleFileToAlbum?: (fileName: string) => void;
  onAddToSpecificAlbum?: (fileName: string, albumId: number) => void;
  isSelected?: (fileName: string) => boolean;
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
  fileAlbumsCache?: Record<string, any[]>;
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
  onCreateAlbum,
  onAddSingleFileToAlbum,
  onAddToSpecificAlbum,
  isSelected,
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
  fileAlbumsCache = {},
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
          onCreateAlbum={(fileName) => onCreateAlbum?.(fileName)}
          onAddSingleFileToAlbum={onAddSingleFileToAlbum}
          onAddToSpecificAlbum={(albumId) =>
            onAddToSpecificAlbum?.(file.name, albumId)
          }
          isSelected={isSelected?.(file.name) || false}
          isSelectionMode={isSelectionMode}
          showSelectionCheckbox={showSelectionCheckbox}
          albums={albums}
          allSelectedFiles={allSelectedFiles}
          selectedCount={selectedCount}
          hasSelection={hasSelection}
          onClearSelection={onClearSelection}
          onCopyUrls={onCopyUrls}
          onDeleteSelected={onDeleteSelected}
          onToggleStarSelected={onToggleStarSelected}
          onToggleSecuritySelected={onToggleSecuritySelected}
          onStartSelectionMode={onStartSelectionMode}
          fileAlbums={fileAlbumsCache[file.name] || []}
          isNew={newFileIds.includes(file.name)}
          size={thumbnailSize}
        />
      ))}
    </div>
  );
}
