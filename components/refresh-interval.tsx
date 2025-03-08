"use client";

import { usePreferences } from "@/lib/stores/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RefreshInterval() {
  const preferences = usePreferences();

  return (
    <Select
      value={preferences.autoRefreshInterval.toString()}
      onValueChange={(value) =>
        preferences.updatePreferences({
          autoRefreshInterval: parseInt(value),
        })
      }
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Rafraîchissement auto" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="0">Pas de rafraîchissement</SelectItem>
        <SelectItem value="5">5s</SelectItem>
        <SelectItem value="10">10s</SelectItem>
        <SelectItem value="15">15s</SelectItem>
        <SelectItem value="30">30s</SelectItem>
      </SelectContent>
    </Select>
  );
}
