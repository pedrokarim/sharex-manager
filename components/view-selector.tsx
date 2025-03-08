"use client";

import { Grid2X2, List, LayoutList } from "lucide-react";
import { useQueryState } from "nuqs";
import { usePreferences } from "@/lib/stores/preferences";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ViewSelector() {
  const preferences = usePreferences();
  const [view, setView] = useQueryState<"grid" | "list" | "details">("view", {
    defaultValue: preferences.galleryViewMode,
    parse: (value): "grid" | "list" | "details" => {
      if (value === "grid" || value === "list" || value === "details") {
        return value;
      }
      return preferences.galleryViewMode;
    },
  });

  const handleViewChange = (newView: "grid" | "list" | "details") => {
    setView(newView);
    preferences.updatePreferences({ galleryViewMode: newView });
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
