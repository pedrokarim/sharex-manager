"use client";

import { useAtom } from "jotai";
import { sortByAtom, sortOrderAtom } from "@/lib/atoms/preferences";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  Calendar,
  CalendarDays,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function SortSelector() {
  const { t } = useTranslation();
  const [defaultSortBy, setDefaultSortBy] = useAtom(sortByAtom);
  const [defaultSortOrder, setDefaultSortOrder] = useAtom(sortOrderAtom);

  const [sortBy, setSortBy] = useQueryState<"name" | "date" | "size">("sort", {
    defaultValue: defaultSortBy,
    parse: (value): "name" | "date" | "size" => {
      if (value === "name" || value === "date" || value === "size") {
        return value;
      }
      return defaultSortBy;
    },
  });

  const [sortOrder, setSortOrder] = useQueryState<"asc" | "desc">("order", {
    defaultValue: defaultSortOrder,
    parse: (value): "asc" | "desc" => {
      if (value === "asc" || value === "desc") {
        return value;
      }
      return defaultSortOrder;
    },
  });

  const sortIcons = {
    name: sortOrder === "asc" ? ArrowDownAZ : ArrowUpAZ,
    date: sortOrder === "asc" ? CalendarDays : Calendar,
    size: sortOrder === "asc" ? ArrowDownWideNarrow : ArrowUpWideNarrow,
  };

  const Icon = sortIcons[sortBy];

  const handleSortChange = async (newSortBy: "name" | "date" | "size") => {
    if (newSortBy === sortBy) {
      const newOrder = sortOrder === "asc" ? "desc" : "asc";
      await setSortOrder(newOrder);
      setDefaultSortOrder(newOrder);
    } else {
      await setSortBy(newSortBy);
      await setSortOrder("asc");
      setDefaultSortBy(newSortBy);
      setDefaultSortOrder("asc");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 backdrop-blur-md border border-white/20 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 transition-all duration-200"
        >
          <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleSortChange("name")}>
          {sortOrder === "asc" ? (
            <ArrowDownAZ className="mr-2 h-4 w-4" />
          ) : (
            <ArrowUpAZ className="mr-2 h-4 w-4" />
          )}
          {t("gallery.sort.name")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSortChange("date")}>
          {sortOrder === "asc" ? (
            <CalendarDays className="mr-2 h-4 w-4" />
          ) : (
            <Calendar className="mr-2 h-4 w-4" />
          )}
          {t("gallery.sort.date")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSortChange("size")}>
          {sortOrder === "asc" ? (
            <ArrowDownWideNarrow className="mr-2 h-4 w-4" />
          ) : (
            <ArrowUpWideNarrow className="mr-2 h-4 w-4" />
          )}
          {t("gallery.sort.size")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
