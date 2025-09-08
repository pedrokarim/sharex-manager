"use client";

import { Grid2X2, List, LayoutList } from "lucide-react";
import { useQueryState } from "nuqs";
import { useAtom } from "jotai";
import { galleryViewModeAtom } from "@/lib/atoms/preferences";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";

export function ViewSelector() {
  const { t } = useTranslation();
  const [galleryViewMode, setGalleryViewMode] = useAtom(galleryViewModeAtom);
  const [view, setView] = useQueryState<"grid" | "list" | "details">("view", {
    defaultValue: galleryViewMode,
    parse: (value): "grid" | "list" | "details" => {
      if (value === "grid" || value === "list" || value === "details") {
        return value;
      }
      return galleryViewMode;
    },
  });

  const handleViewChange = (newView: "grid" | "list" | "details") => {
    setView(newView);
    setGalleryViewMode(newView);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="backdrop-blur-md border border-white/20 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 transition-all duration-200"
        >
          {view === "grid" ? (
            <Grid2X2 className="h-4 w-4" />
          ) : view === "list" ? (
            <List className="h-4 w-4" />
          ) : (
            <LayoutList className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleViewChange("grid")}>
          <Grid2X2 className="mr-2 h-4 w-4" />
          {t("gallery.view_modes.grid")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewChange("list")}>
          <List className="mr-2 h-4 w-4" />
          {t("gallery.view_modes.list")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewChange("details")}>
          <LayoutList className="mr-2 h-4 w-4" />
          {t("gallery.view_modes.details")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
