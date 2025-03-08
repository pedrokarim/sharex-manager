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

export function ViewSelector() {
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
        <Button variant="outline" size="icon">
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
          Grille
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewChange("list")}>
          <List className="mr-2 h-4 w-4" />
          Liste
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewChange("details")}>
          <LayoutList className="mr-2 h-4 w-4" />
          Détails
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
