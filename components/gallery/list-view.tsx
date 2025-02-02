import { FileInfo } from "@/types";
import { Button } from "../ui/button";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ListViewProps {
  files: FileInfo[];
  onCopy: (url: string) => void;
  onDelete: (name: string) => void;
  onSelect: (file: FileInfo) => void;
  detailed?: boolean;
  newFileIds?: string[];
}

export function ListView({
  files,
  onCopy,
  onDelete,
  onSelect,
  detailed,
  newFileIds = [],
}: ListViewProps) {
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div
          key={file.name}
          className={cn(
            "flex cursor-pointer items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-all duration-500",
            newFileIds.includes(file.name) &&
              "animate-in fade-in-0 slide-in-from-left-5"
          )}
          onClick={() => onSelect(file)}
        >
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
            <Image
              src={file.url}
              alt={file.name}
              fill
              className="object-cover"
              sizes="64px"
            />
          </div>

          <div className="min-w-0 flex-1 px-4">
            <p className="truncate text-sm font-medium">{file.name}</p>
            {detailed && (
              <div className="mt-1 flex text-xs text-muted-foreground">
                <p>
                  {format(parseISO(file.createdAt), "dd MMMM yyyy à HH:mm", {
                    locale: fr,
                  })}
                </p>
                <span className="mx-2">•</span>
                <p>{(file.size / 1024).toFixed(2)} Ko</p>
              </div>
            )}
          </div>

          <div className="ml-4 flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onCopy(file.url)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a href={file.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDelete(file.name)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
