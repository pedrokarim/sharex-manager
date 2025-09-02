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
  isSelected?: (fileName: string) => boolean;
  isSelectionMode?: boolean;
  showSelectionCheckbox?: boolean;
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
  isSelected,
  isSelectionMode = false,
  showSelectionCheckbox = false,
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
          isSelected={isSelected?.(file.name) || false}
          isSelectionMode={isSelectionMode}
          showSelectionCheckbox={showSelectionCheckbox}
          detailed={detailed}
          isNew={newFileIds.includes(file.name)}
        />
      ))}
    </div>
  );
}
