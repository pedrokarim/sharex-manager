import { FileInfo } from "@/types/files";
import { SelectableListItemCard } from "./selectable-list-item-card";
import { getGalleryImageUrl } from "@/lib/utils/url";

interface ListViewProps {
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
  detailed?: boolean;
  newFileIds: string[];
}

export function ListView({
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
  albums,
  allSelectedFiles,
  selectedCount,
  hasSelection,
  onClearSelection,
  onCopyUrls,
  onDeleteSelected,
  onToggleStarSelected,
  onToggleSecuritySelected,
  onStartSelectionMode,
  detailed,
  newFileIds,
}: ListViewProps) {
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <SelectableListItemCard
          key={file.name}
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
          detailed={detailed}
          isNew={newFileIds.includes(file.name)}
        />
      ))}
    </div>
  );
}
