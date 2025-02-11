import { FileInfo } from "@/types/files";
import { FileCard } from "@/components/file-card";

interface GridViewProps {
  files: FileInfo[];
  onCopy: (url: string) => void;
  onDelete: (name: string) => void;
  onSelect: (file: FileInfo) => void;
  onToggleSecurity: (file: FileInfo) => Promise<void>;
  onToggleStar: (file: FileInfo) => Promise<void>;
  newFileIds: string[];
}

export function GridView({
  files,
  onCopy,
  onDelete,
  onSelect,
  onToggleSecurity,
  onToggleStar,
  newFileIds,
}: GridViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {files.map((file) => (
        <FileCard
          key={file.url}
          file={file}
          onDelete={() => onDelete(file.name)}
          onCopy={() => onCopy(file.url)}
          onSelect={() => onSelect(file)}
          onToggleSecurity={() => onToggleSecurity(file)}
          onToggleStar={() => onToggleStar(file)}
          isNew={newFileIds.includes(file.name)}
        />
      ))}
    </div>
  );
}
