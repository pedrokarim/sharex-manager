"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FilterBar, FilterDateRange, FilterSearch, FilterSelect } from "@/components/filters/filter-bar";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useQueryState } from "nuqs";
import { format } from "date-fns";
import type { Log, LogAction, LogLevel } from "@/lib/types/logs";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { RowsSkeleton } from "@/components/skeletons/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarIcon,
  Info,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
} from "lucide-react";

const ITEMS_PER_PAGE = 50;

const levelColors = {
  info: "bg-blue-500",
  warning: "bg-yellow-500",
  error: "bg-red-500",
  debug: "bg-gray-500",
} as const;

/** Actions proposées au filtre, avec la clé de leur libellé. */
const ACTION_OPTIONS: { value: LogAction | "all"; label: string }[] = [
  { value: "all", label: "admin.logs.actions.all" },
  { value: "auth.login", label: "admin.logs.actions.login" },
  { value: "auth.logout", label: "admin.logs.actions.logout" },
  { value: "file.upload", label: "admin.logs.actions.upload" },
  { value: "file.delete", label: "admin.logs.actions.delete" },
  { value: "file.update", label: "admin.logs.actions.update" },
  { value: "file.download", label: "admin.logs.actions.download" },
  { value: "admin.action", label: "admin.logs.actions.admin" },
  { value: "user.create", label: "admin.logs.actions.user_create" },
  { value: "user.update", label: "admin.logs.actions.user_update" },
  { value: "user.delete", label: "admin.logs.actions.user_delete" },
  { value: "config.update", label: "admin.logs.actions.config_update" },
  { value: "api.request", label: "admin.logs.actions.api_request" },
  { value: "api.error", label: "admin.logs.actions.api_error" },
  { value: "system.error", label: "admin.logs.actions.system_error" },
];

export default function LogsPage() {
  const { t } = useTranslation();
  const locale = useDateLocale();

  const REFRESH_INTERVALS = {
    "0": t("admin.logs.refresh_intervals.none"),
    "5": t("admin.logs.refresh_intervals.5s"),
    "10": t("admin.logs.refresh_intervals.10s"),
    "15": t("admin.logs.refresh_intervals.15s"),
  } as const;

  const [level, setLevel] = useQueryState<LogLevel | "all">("level", {
    defaultValue: "all",
    parse: (value) => value as LogLevel | "all",
  });
  const [action, setAction] = useQueryState<LogAction | "all">("action", {
    defaultValue: "all",
    parse: (value) => value as LogAction | "all",
  });
  const [search, setSearch] = useQueryState<string | null>("search", {
    defaultValue: null,
    parse: (value) => value || null,
  });
  const [startDate, setStartDate] = useQueryState<string | null>("startDate", {
    defaultValue: null,
    parse: (value) => value || null,
  });
  const [endDate, setEndDate] = useQueryState<string | null>("endDate", {
    defaultValue: null,
    parse: (value) => value || null,
  });
  const [refreshInterval, setRefreshInterval] =
    useState<keyof typeof REFRESH_INTERVALS>("0");
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const { ref, inView } = useInView();

  const { data, fetchNextPage, hasNextPage, isLoading, isError, refetch } =
    useInfiniteQuery({
      queryKey: ["logs", level, action, search, startDate, endDate],
      queryFn: async ({ pageParam }) => {
        const searchParams = new URLSearchParams();
        searchParams.set(
          "offset",
          String((pageParam as number) * ITEMS_PER_PAGE),
        );
        searchParams.set("limit", String(ITEMS_PER_PAGE));
        if (level !== "all") searchParams.set("level", level);
        if (action !== "all") searchParams.set("action", action);
        if (search) searchParams.set("search", search);
        if (startDate) searchParams.set("startDate", startDate);
        if (endDate) searchParams.set("endDate", endDate);

        const response = await fetch(
          `/api/admin/logs?${searchParams.toString()}`,
        );
        if (!response.ok) {
          throw new Error(t("admin.logs.error"));
        }
        return response.json() as Promise<Log[]>;
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage: Log[], allPages: Log[][]) =>
        lastPage.length === ITEMS_PER_PAGE ? allPages.length : undefined,
      refetchInterval:
        refreshInterval === "0" ? false : parseInt(refreshInterval, 10) * 1000,
    });

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  const hasFilters = level !== "all" || action !== "all" || Boolean(search || startDate || endDate);
  const resetFilters = () => {
    setLevel("all");
    setAction("all");
    setSearch(null);
    setStartDate(null);
    setEndDate(null);
  };

  const handleClearLogs = async () => {
    try {
      const response = await fetch("/api/admin/logs", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(t("admin.logs.clear_error"));
      }

      toast.success(t("admin.logs.clear_success"));
      refetch();
    } catch (error) {
      toast.error(t("admin.logs.clear_error"));
    }
  };


  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">{t("admin.logs.error")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={ScrollText}
        title={t("admin.sections.logs.title")}
        description={t("admin.sections.logs.description")}
      />

      <FilterBar
        onReset={hasFilters ? resetFilters : null}
        actions={
          <>
            <FilterSelect
              value={refreshInterval}
              onChange={setRefreshInterval}
              neutral="0"
              label={t("admin.logs.refresh_interval")}
              icon={RefreshCw}
              options={(Object.keys(REFRESH_INTERVALS) as (keyof typeof REFRESH_INTERVALS)[]).map((value) => ({
                value,
                label: REFRESH_INTERVALS[value],
              }))}
            />
            <Button variant="ghost" size="sm" onClick={handleClearLogs} className="h-8 gap-1.5 rounded-lg px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="size-3.5" />
              {t("admin.logs.clear_logs")}
            </Button>
          </>
        }
      >
        <FilterSearch value={search ?? ""} onChange={(value) => setSearch(value || null)} placeholder={t("admin.logs.filters.search_placeholder")} />
        <FilterSelect
          value={level}
          onChange={setLevel}
          label={t("admin.logs.filters.select_level")}
          options={(["all", "info", "warning", "error", "debug"] as const).map((value) => ({
            value,
            label: t(`admin.logs.levels.${value}`),
          }))}
        />
        <FilterSelect value={action} onChange={setAction} label={t("admin.logs.filters.select_action")} options={ACTION_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))} />
        <FilterDateRange
          start={startDate}
          end={endDate}
          onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
      </FilterBar>

      <Card className="gap-0 rounded-2xl border-border/70 py-0 shadow-sm">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">
                    {t("admin.logs.timestamp")}
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm">
                    {t("admin.logs.level")}
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm">
                    {t("admin.logs.action")}
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm">
                    {t("admin.logs.message")}
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm">
                    {t("admin.logs.user")}
                  </TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">
                    {t("admin.logs.details")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.pages[0]?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      {t("admin.logs.no_logs")}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.pages.map((page) =>
                    page.map((log) => (
                      <TableRow key={`${log.id}-${log.timestamp}`}>
                        <TableCell className="text-xs sm:text-sm">
                          <span className="hidden sm:inline">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                          <span className="sm:hidden">
                            {new Date(log.timestamp).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`${levelColors[log.level]} text-xs text-white`}
                          >
                            {log.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs sm:text-sm">
                          {log.action}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs sm:text-sm">
                          {log.message}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs sm:text-sm">
                          {log.userEmail || t("admin.logs.system")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedLog(log)}
                            className="h-8 w-8"
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )),
                  )
                )}
              </TableBody>
            </Table>
          </div>

          {isLoading && <RowsSkeleton rows={6} />}

          <div ref={ref} className="flex h-10 items-center justify-center">
            {hasNextPage && <Skeleton className="h-2 w-40 rounded-full" />}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-3xl overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
            <DialogTitle className="text-lg sm:text-xl">
              {t("admin.logs.details_dialog.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 px-5 py-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t("admin.logs.timestamp")}
                </p>
                <p className="mt-2 text-sm">
                  {selectedLog &&
                    new Date(selectedLog.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t("admin.logs.level")}
                </p>
                <div className="mt-2">
                  {selectedLog && (
                    <Badge
                      variant="secondary"
                      className={`${levelColors[selectedLog.level]} text-xs text-white`}
                    >
                      {selectedLog.level}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t("admin.logs.action")}
                </p>
                <p className="mt-2 break-all text-sm">{selectedLog?.action}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t("admin.logs.user")}
                </p>
                <p className="mt-2 break-all text-sm">
                  {selectedLog?.userEmail || t("admin.logs.system")}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t("admin.logs.message")}
              </p>
              <p className="mt-2 break-all text-sm">{selectedLog?.message}</p>
            </div>

            {(selectedLog?.ip || selectedLog?.userAgent) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {selectedLog?.ip && (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {t("admin.logs.ip")}
                    </p>
                    <p className="mt-2 break-all text-sm">{selectedLog.ip}</p>
                  </div>
                )}
                {selectedLog?.userAgent && (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {t("admin.logs.user_agent")}
                    </p>
                    <p className="mt-2 break-all text-sm">
                      {selectedLog.userAgent}
                    </p>
                  </div>
                )}
              </div>
            )}

            {selectedLog?.metadata &&
              Object.keys(selectedLog.metadata).length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {t("admin.logs.metadata")}
                  </p>
                  <pre className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-border/60 bg-background p-4 text-xs">
                    <code>{JSON.stringify(selectedLog.metadata, null, 2)}</code>
                  </pre>
                </div>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
