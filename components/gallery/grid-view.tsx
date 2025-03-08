import { FileInfo } from "@/types/files";
import { FileCard } from "@/components/file-card";
import { useAtom } from "jotai";
import { thumbnailSizeAtom } from "@/lib/atoms/preferences";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";

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
  const [defaultThumbnailSize, setDefaultThumbnailSize] =
    useAtom(thumbnailSizeAtom);
  const [thumbnailSize] = useQueryState<"small" | "medium" | "large">("size", {
    defaultValue: defaultThumbnailSize,
    parse: (value): "small" | "medium" | "large" => {
      if (value === "small" || value === "medium" || value === "large") {
        return value;
      }
      return defaultThumbnailSize;
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
        <FileCard
          key={file.url}
          file={file}
          onDelete={() => onDelete(file.name)}
          onCopy={() => onCopy(file.url)}
          onSelect={() => onSelect(file)}
          onToggleSecurity={() => onToggleSecurity(file)}
          onToggleStar={() => onToggleStar(file)}
          isNew={newFileIds.includes(file.name)}
          size={thumbnailSize}
        />
      ))}
    </div>
  );
}
