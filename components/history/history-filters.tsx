"use client";

import { useQueryState } from "nuqs";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { useTranslation } from "@/lib/i18n";
import { CalendarIcon, X } from "lucide-react";

export const HistoryFilters = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useQueryState("q");
  const [uploadMethod, setUploadMethod] = useQueryState("method");
  const [startDate, setStartDate] = useQueryState("start");
  const [endDate, setEndDate] = useQueryState("end");
  const locale = useDateLocale();

  const handleSearch = (value: string) => {
    setSearchQuery(value || null);
  };

  const handleMethodChange = (value: string) => {
    setUploadMethod(value === "all" ? null : value);
  };

  const handleDateChange = (type: "start" | "end", date: Date | null) => {
    if (type === "start") {
      setStartDate(date ? date.toISOString() : null);
    } else {
      setEndDate(date ? date.toISOString() : null);
    }
  };

  const resetFilters = () => {
    setSearchQuery(null);
    setUploadMethod(null);
    setStartDate(null);
    setEndDate(null);
  };

  const hasActiveFilters = searchQuery || uploadMethod || startDate || endDate;

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
          <h2 className="text-base sm:text-lg font-medium">
            {t("uploads.history.filters.title")}
          </h2>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-7 sm:h-8 px-2 lg:px-3 text-xs sm:text-sm w-full sm:w-auto"
            >
              <X className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              {t("common.reset")}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs sm:text-sm font-medium">
              {t("uploads.history.filters.search")}
            </label>
            <Input
              placeholder={t("uploads.history.filters.search_placeholder")}
              onChange={(e) => handleSearch(e.target.value)}
              value={searchQuery || ""}
              className="w-full text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs sm:text-sm font-medium">
              {t("uploads.history.filters.upload_method")}
            </label>
            <Select
              value={uploadMethod || "all"}
              onValueChange={handleMethodChange}
            >
              <SelectTrigger className="text-sm">
                <SelectValue
                  placeholder={t("uploads.history.filters.all_methods")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">
                  {t("uploads.history.filters.all_methods")}
                </SelectItem>
                <SelectItem value="api" className="text-sm">
                  {t("uploads.stats.labels.api")}
                </SelectItem>
                <SelectItem value="web" className="text-sm">
                  {t("uploads.stats.labels.web")}
                </SelectItem>
                <SelectItem value="sharex" className="text-sm">
                  {t("uploads.stats.labels.sharex")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs sm:text-sm font-medium">
              {t("uploads.history.filters.start_date")}
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-start text-left font-normal text-sm h-8 sm:h-9"
                >
                  {startDate ? (
                    <span className="hidden sm:inline">
                      {format(new Date(startDate), "P", { locale })}
                    </span>
                  ) : (
                    <span className="hidden sm:inline">
                      {t("uploads.history.filters.choose_date")}
                    </span>
                  )}
                  {startDate ? (
                    <span className="sm:hidden">
                      {format(new Date(startDate), "dd/MM", { locale })}
                    </span>
                  ) : (
                    <span className="sm:hidden">
                      {t("uploads.history.filters.choose_date")}
                    </span>
                  )}
                  <CalendarIcon className="ml-auto h-3 w-3 sm:h-4 sm:w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate ? new Date(startDate) : undefined}
                  onSelect={(date) => handleDateChange("start", date || null)}
                  locale={locale}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs sm:text-sm font-medium">
              {t("uploads.history.filters.end_date")}
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-start text-left font-normal text-sm h-8 sm:h-9"
                >
                  {endDate ? (
                    <span className="hidden sm:inline">
                      {format(new Date(endDate), "P", { locale })}
                    </span>
                  ) : (
                    <span className="hidden sm:inline">
                      {t("uploads.history.filters.choose_date")}
                    </span>
                  )}
                  {endDate ? (
                    <span className="sm:hidden">
                      {format(new Date(endDate), "dd/MM", { locale })}
                    </span>
                  ) : (
                    <span className="sm:hidden">
                      {t("uploads.history.filters.choose_date")}
                    </span>
                  )}
                  <CalendarIcon className="ml-auto h-3 w-3 sm:h-4 sm:w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate ? new Date(endDate) : undefined}
                  onSelect={(date) => handleDateChange("end", date || null)}
                  locale={locale}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  );
};
