"use client";

import { useQueryState } from "nuqs";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { useTranslation } from "@/lib/i18n";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function DateRangeFilter() {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useQueryState("start");
  const [endDate, setEndDate] = useQueryState("end");
  const locale = useDateLocale();

  const hasDateFilter = startDate || endDate;

  const handleReset = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const formatLabel = () => {
    if (startDate && endDate) {
      return `${format(new Date(startDate), "dd/MM/yy", { locale })} - ${format(new Date(endDate), "dd/MM/yy", { locale })}`;
    }
    if (startDate) {
      return `${t("gallery.date_filter.from")} ${format(new Date(startDate), "dd/MM/yy", { locale })}`;
    }
    if (endDate) {
      return `${t("gallery.date_filter.until")} ${format(new Date(endDate), "dd/MM/yy", { locale })}`;
    }
    return null;
  };

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "h-8 w-8 backdrop-blur-md border border-white/20 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 transition-all duration-200",
              hasDateFilter && "w-auto px-2 gap-1.5"
            )}
          >
            <CalendarIcon className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            {hasDateFilter && (
              <span className="text-xs truncate max-w-[120px]">
                {formatLabel()}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("gallery.date_filter.start_date")}
                </span>
                <Calendar
                  mode="single"
                  selected={startDate ? new Date(startDate) : undefined}
                  onSelect={(date) =>
                    setStartDate(date ? date.toISOString() : null)
                  }
                  locale={locale}
                  disabled={(date) =>
                    endDate ? date > new Date(endDate) : false
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("gallery.date_filter.end_date")}
                </span>
                <Calendar
                  mode="single"
                  selected={endDate ? new Date(endDate) : undefined}
                  onSelect={(date) =>
                    setEndDate(date ? date.toISOString() : null)
                  }
                  locale={locale}
                  disabled={(date) =>
                    startDate ? date < new Date(startDate) : false
                  }
                />
              </div>
            </div>
            {hasDateFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="w-full h-7 text-xs"
              >
                <X className="mr-1.5 h-3 w-3" />
                {t("gallery.date_filter.reset")}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
