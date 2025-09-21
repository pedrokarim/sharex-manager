"use client";

import { useAtom } from "jotai";
import { useQueryState } from "nuqs";
import { autoRefreshIntervalAtom } from "@/lib/atoms/preferences";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock, RotateCcw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function RefreshInterval() {
  const { t } = useTranslation();
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

  const getDisplayText = (value: string) => {
    const intervals = {
      "0": "Aucun",
      "5": "5s",
      "10": "10s",
      "15": "15s",
      "30": "30s",
    };
    return intervals[value as keyof typeof intervals] || value;
  };

  const getIcon = () => {
    if (autoRefreshInterval === "0") {
      return <Clock className="h-3 w-3 sm:h-4 sm:w-4" />;
    }
    return <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 backdrop-blur-md border border-white/20 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 transition-all duration-200"
          title={t("gallery.refresh.intervals.placeholder")}
        >
          {getIcon()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={() => handleChange("0")}>
          <Clock className="mr-2 h-4 w-4" />
          Aucun
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleChange("5")}>
          <RotateCcw className="mr-2 h-4 w-4" />
          5s
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleChange("10")}>
          <RotateCcw className="mr-2 h-4 w-4" />
          10s
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleChange("15")}>
          <RotateCcw className="mr-2 h-4 w-4" />
          15s
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleChange("30")}>
          <RotateCcw className="mr-2 h-4 w-4" />
          30s
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
