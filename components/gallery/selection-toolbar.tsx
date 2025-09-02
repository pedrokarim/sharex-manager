"use client";

import { useState } from "react";
import { 
  X, 
  Star, 
  Lock, 
  Unlock, 
  Trash2, 
  Copy, 
  Download,
  FolderPlus,
  MoreHorizontal,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { FileInfo } from "@/types/files";

interface SelectionToolbarProps {
  selectedFiles: FileInfo[];
  selectedCount: number;
  onClearSelection: () => void;
  onCopyUrls: () => void;
  onDeleteSelected: () => void;
  onToggleStarSelected: () => void;
  onToggleSecuritySelected: () => void;
  onAddToAlbum: () => void;
  onDownloadSelected?: () => void;
  onShowHelp: () => void;
  className?: string;
}

export function SelectionToolbar({
  selectedFiles,
  selectedCount,
  onClearSelection,
  onCopyUrls,
  onDeleteSelected,
  onToggleStarSelected,
  onToggleSecuritySelected,
  onAddToAlbum,
  onDownloadSelected,
  onShowHelp,
  className,
}: SelectionToolbarProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(true);

  if (selectedCount === 0 || !isVisible) {
    return null;
  }

  // Calculer les états pour les actions groupées
  const allStarred = selectedFiles.every(file => file.isStarred);
  const allSecure = selectedFiles.every(file => file.isSecure);
  const hasStarred = selectedFiles.some(file => file.isStarred);
  const hasSecure = selectedFiles.some(file => file.isSecure);

  const starAction = allStarred 
    ? t("gallery.file_actions.removed_from_favorites")
    : hasStarred 
    ? t("multiselect.actions.toggle_favorites")
    : t("gallery.file_actions.added_to_favorites");

  const securityAction = allSecure
    ? t("gallery.file_actions.now_public") 
    : hasSecure
    ? t("multiselect.actions.toggle_security")
    : t("gallery.file_actions.now_private");

  return (
    <div className={cn(
      "fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50",
      "bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg",
      "flex items-center gap-2 p-3 min-w-96",
      "animate-in slide-in-from-bottom-2 fade-in-0",
      className
    )}>
      {/* Compteur et badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-sm font-medium">
          {t("multiselect.selected_count", { count: selectedCount })}
        </Badge>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Actions principales */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddToAlbum}
          className="h-8 px-2"
          title={t("multiselect.add_to_album")}
        >
          <FolderPlus className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">{t("multiselect.add_to_album")}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleStarSelected}
          className="h-8 px-2"
          title={starAction}
        >
          <Star className={cn(
            "h-4 w-4 mr-1",
            allStarred && "fill-yellow-500 text-yellow-500"
          )} />
          <span className="hidden sm:inline">
            {allStarred ? t("gallery.starred") : t("gallery.star")}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSecuritySelected}
          className="h-8 px-2"
          title={securityAction}
        >
          {allSecure ? (
            <Lock className="h-4 w-4 mr-1 text-yellow-500" />
          ) : (
            <Unlock className="h-4 w-4 mr-1" />
          )}
          <span className="hidden sm:inline">
            {allSecure ? t("gallery.file_viewer.secured") : t("gallery.file_viewer.public")}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onCopyUrls}
          className="h-8 px-2"
          title={t("gallery.file_viewer.copy_url")}
        >
          <Copy className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">{t("gallery.file_viewer.copy_url")}</span>
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Actions supplémentaires dans un menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onDownloadSelected && (
            <DropdownMenuItem onClick={onDownloadSelected}>
              <Download className="h-4 w-4 mr-2" />
              {t("multiselect.actions.download_selected")}
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem onClick={onShowHelp}>
            <Keyboard className="h-4 w-4 mr-2" />
            {t("multiselect.keyboard_shortcuts")}
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={onDeleteSelected}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t("multiselect.actions.delete_selected")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6" />

      {/* Bouton fermer */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="h-8 w-8 p-0"
        title={t("gallery.deselect_all")}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
