"use client"

import { Grid2X2, List, TableProperties } from "lucide-react"
import { Button } from "./ui/button"
import { useQueryState } from "nuqs"

type ViewMode = "grid" | "list" | "details"

const viewModeIcons = {
  grid: <Grid2X2 className="h-4 w-4" />,
  list: <List className="h-4 w-4" />,
  details: <TableProperties className="h-4 w-4" />,
}

export function ViewSelector() {
  const [viewMode, setViewMode] = useQueryState<ViewMode>("view", {
    defaultValue: "grid",
    parse: (value): ViewMode => {
      if (value === "grid" || value === "list" || value === "details") {
        return value
      }
      return "grid"
    },
  })

  return (
    <div className="flex gap-1">
      {(Object.keys(viewModeIcons) as ViewMode[]).map((mode) => (
        <Button
          key={mode}
          variant={viewMode === mode ? "default" : "ghost"}
          size="icon"
          onClick={() => setViewMode(mode)}
          className="h-8 w-8"
        >
          {viewModeIcons[mode]}
        </Button>
      ))}
    </div>
  )
} 