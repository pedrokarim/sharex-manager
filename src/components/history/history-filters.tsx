"use client";

import { useQueryState } from "nuqs";

import { FilterBar, FilterDateRange, FilterSearch, FilterSelect } from "@/components/filters/filter-bar";
import { useTranslation } from "@/lib/i18n";

export const HistoryFilters = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useQueryState("q");
  const [uploadMethod, setUploadMethod] = useQueryState("method");
  const [startDate, setStartDate] = useQueryState("start");
  const [endDate, setEndDate] = useQueryState("end");

  const resetFilters = () => {
    setSearchQuery(null);
    setUploadMethod(null);
    setStartDate(null);
    setEndDate(null);
  };

  const hasActiveFilters = Boolean(searchQuery || uploadMethod || startDate || endDate);

  return (
    <FilterBar onReset={hasActiveFilters ? resetFilters : null}>
      <FilterSearch
        value={searchQuery ?? ""}
        onChange={(value) => setSearchQuery(value || null)}
        placeholder={t("uploads.history.filters.search_placeholder")}
      />
      <FilterSelect
        value={uploadMethod ?? "all"}
        onChange={(value) => setUploadMethod(value === "all" ? null : value)}
        label={t("uploads.history.filters.upload_method")}
        options={[
          { value: "all", label: t("uploads.history.filters.all_methods") },
          { value: "api", label: t("uploads.stats.labels.api") },
          { value: "web", label: t("uploads.stats.labels.web") },
          { value: "sharex", label: t("uploads.stats.labels.sharex") },
        ]}
      />
      <FilterDateRange
        start={startDate}
        end={endDate}
        onChange={(start, end) => {
          setStartDate(start);
          setEndDate(end);
        }}
      />
    </FilterBar>
  );
};
