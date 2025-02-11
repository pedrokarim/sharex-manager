import { FileInfo } from "@/types/files";
import { ListItemCard } from "./list-item-card";

interface ListViewProps {
  files: FileInfo[];
  onCopy: (url: string) => void;
  onDelete: (name: string) => void;
  onSelect: (file: FileInfo) => void;
  onToggleSecurity: (file: FileInfo) => Promise<void>;
  onToggleStar: (file: FileInfo) => Promise<void>;
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
  detailed,
  newFileIds,
}: ListViewProps) {
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <ListItemCard
          key={file.name}
          file={file}
          onDelete={() => onDelete(file.name)}
          onCopy={() => onCopy(file.url)}
          onSelect={() => onSelect(file)}
          onToggleSecurity={() => onToggleSecurity(file)}
          onToggleStar={() => onToggleStar(file)}
          detailed={detailed}
          isNew={newFileIds.includes(file.name)}
        />
      ))}
    </div>
  );
}
