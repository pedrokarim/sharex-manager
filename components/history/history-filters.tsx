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
import { CalendarIcon, X } from "lucide-react";

export const HistoryFilters = () => {
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
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Filtres</h2>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-8 px-2 lg:px-3"
            >
              <X className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Rechercher</label>
            <Input
              placeholder="Rechercher un fichier..."
              onChange={(e) => handleSearch(e.target.value)}
              value={searchQuery || ""}
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Méthode d&apos;upload</label>
            <Select
              value={uploadMethod || "all"}
              onValueChange={handleMethodChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Toutes les méthodes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les méthodes</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="web">Interface Web</SelectItem>
                <SelectItem value="sharex">ShareX</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Date de début</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-start text-left font-normal"
                >
                  {startDate ? (
                    format(new Date(startDate), "P", { locale })
                  ) : (
                    <span>Choisir une date</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
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
            <label className="text-sm font-medium">Date de fin</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-start text-left font-normal"
                >
                  {endDate ? (
                    format(new Date(endDate), "P", { locale })
                  ) : (
                    <span>Choisir une date</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
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
