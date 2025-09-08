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

  return (
    <Select value={autoRefreshInterval} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px] backdrop-blur-md border border-white/20 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 transition-all duration-200">
        <SelectValue placeholder={t("gallery.refresh.intervals.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="0">{t("gallery.refresh.intervals.none")}</SelectItem>
        <SelectItem value="5">{t("gallery.refresh.intervals.5s")}</SelectItem>
        <SelectItem value="10">{t("gallery.refresh.intervals.10s")}</SelectItem>
        <SelectItem value="15">{t("gallery.refresh.intervals.15s")}</SelectItem>
        <SelectItem value="30">{t("gallery.refresh.intervals.30s")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
