import { MouseEvent } from "react";
import { FileInfo } from "@/types/files";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { FileContextMenu } from "@/components/gallery/file-context-menu";
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
    shiftKey: boolean
  ) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  showSelectionCheckbox?: boolean;
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
  isSelected = false,
  isSelectionMode = false,
  showSelectionCheckbox = false,
  detailed,
  isNew,
}: SelectableListItemCardProps) {
  const locale = useDateLocale();

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isSelectionMode && onToggleSelection) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelection(file.name, e.ctrlKey || e.metaKey, e.shiftKey);
    } else {
      onSelect?.();
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    if (onToggleSelection) {
      onToggleSelection(file.name, true, false); // Simulate Ctrl+Click pour toggle
    }
  };

  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);

  return (
    <FileContextMenu
      file={file}
      onCopy={onCopy}
      onToggleStar={onToggleStar}
      onToggleSecurity={onToggleSecurity}
      onDelete={onDelete}
      isSelectionMode={isSelectionMode}
      disabled={isSelectionMode}
    >
      <div
        className={cn(
          "flex items-center gap-4 p-4 rounded-lg border transition-all hover:bg-accent/50 cursor-pointer relative",
          isNew && "animate-in fade-in-0 zoom-in-95",
          isSelected && "bg-accent border-primary ring-1 ring-primary",
          (isSelectionMode || showSelectionCheckbox) && "cursor-pointer"
        )}
        onClick={handleClick}
      >
        {/* Checkbox de sélection */}
        {(showSelectionCheckbox || (isSelectionMode && isSelected)) && (
          <div className="flex-shrink-0">
            <div
              className={cn(
                "w-6 h-6 rounded border-2 bg-background",
                "flex items-center justify-center transition-all",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary/50"
              )}
            >
              {isSelected ? (
                <Check className="h-3 w-3" />
              ) : (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={handleCheckboxChange}
                  className="w-4 h-4 border-0 bg-transparent"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>
        )}

        {/* Thumbnail */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
            {isImage ? (
              <Image
                src={file.url}
                alt={file.name}
                width={48}
                height={48}
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
    </FileContextMenu>
  );
}
