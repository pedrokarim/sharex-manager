"use client";

import { Search, X } from "lucide-react";
import { Label } from "../ui/label";
import { SidebarInput } from "../ui/sidebar";
import { useQueryState } from "nuqs";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "../ui/button";
import { useTranslation } from "@/lib/i18n";

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
  const [search, setSearch] = useQueryState("q");
  const debouncedSearch = useDebounce(search, 300);
  const { t } = useTranslation();

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleClear = () => {
    setSearch(null);
  };

  return (
    <form {...props} onSubmit={(e) => e.preventDefault()}>
      <div className="relative">
        <Label htmlFor="search" className="sr-only">
          {t("sidebar.search")}
        </Label>
        <SidebarInput
          id="search"
          value={search || ""}
          onChange={handleSearch}
          placeholder={t("sidebar.search_placeholder")}
          className="h-8 pl-7 pr-8"
        />
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 opacity-60 hover:opacity-100"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
