"use client";

import { useAtom } from "jotai";
import { useQueryState } from "nuqs";
import { autoRefreshIntervalAtom } from "@/lib/atoms/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RefreshInterval() {
  const [defaultAutoRefreshInterval, setDefaultAutoRefreshInterval] = useAtom(
    autoRefreshIntervalAtom
  );

  const [autoRefreshInterval, setAutoRefreshInterval] = useQueryState(
    "refresh",
    {
      defaultValue: defaultAutoRefreshInterval.toString(),
      parse: (value): string => {
        const parsed = parseInt(value);
        if (!isNaN(parsed) && [0, 5, 10, 15, 30].includes(parsed)) {
          return value;
        }
        return defaultAutoRefreshInterval.toString();
      },
    }
  );

  const handleChange = async (value: string) => {
    await setAutoRefreshInterval(value);
    setDefaultAutoRefreshInterval(parseInt(value));
  };

  return (
    <Select value={autoRefreshInterval} onValueChange={handleChange}>
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
