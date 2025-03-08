import { FileInfo } from "@/types/files";
import { Button } from "../ui/button";
import {
  Copy,
  ExternalLink,
  Trash2,
  Download,
  Lock,
  Unlock,
  Star,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ListItemCardProps {
  file: FileInfo;
  onCopy: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onToggleSecurity: () => Promise<void>;
  onToggleStar: () => Promise<void>;
  detailed?: boolean;
  isNew?: boolean;
}

export function ListItemCard({
  file,
  onCopy,
  onDelete,
  onSelect,
  onToggleSecurity,
  onToggleStar,
  detailed,
  isNew,
}: ListItemCardProps) {
  const locale = useDateLocale();

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-all duration-500",
        isNew && "animate-in fade-in-0 slide-in-from-left-5"
      )}
      onClick={onSelect}
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
                locale,
              })}
            </p>
            <span className="mx-2">•</span>
            <p>{(file.size / 1024).toFixed(2)} Ko</p>
          </div>
        )}
      </div>

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
            href={file.url}
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
            file.isSecure && "text-yellow-500"
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
            "text-destructive"
          )}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
