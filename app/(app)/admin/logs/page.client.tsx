"use client";

import { useState, useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import type { LogLevel, LogAction, Log } from "@/lib/types/logs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryState } from "nuqs";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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
import { CalendarIcon, RefreshCw, Info } from "lucide-react";
import { format } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { Loading } from "@/components/ui/loading";
import { useTranslation } from "@/lib/i18n";

const ITEMS_PER_PAGE = 50;

const levelColors = {
  info: "bg-blue-500",
  warning: "bg-yellow-500",
  error: "bg-red-500",
  debug: "bg-gray-500",
} as const;

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
  const { ref, inView } = useInView();
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const { data, fetchNextPage, hasNextPage, isLoading, isError, refetch } =
    useInfiniteQuery({
      queryKey: ["logs", level, action, search, startDate, endDate],
      queryFn: async ({ pageParam }) => {
        const searchParams = new URLSearchParams();
        searchParams.set(
          "offset",
          String((pageParam as number) * ITEMS_PER_PAGE)
        );
        searchParams.set("limit", String(ITEMS_PER_PAGE));
        if (level !== "all") searchParams.set("level", level);
        if (action !== "all") searchParams.set("action", action);
        if (search) searchParams.set("search", search);
        if (startDate) searchParams.set("startDate", startDate);
        if (endDate) searchParams.set("endDate", endDate);

        const response = await fetch(
          `/api/admin/logs?${searchParams.toString()}`
        );
        if (!response.ok) throw new Error(t("admin.logs.error"));
        return response.json() as Promise<Log[]>;
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage: Log[], allPages: Log[][]) => {
        return lastPage.length === ITEMS_PER_PAGE ? allPages.length : undefined;
      },
      refetchInterval:
        refreshInterval === "0" ? false : parseInt(refreshInterval) * 1000,
    });

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

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
    <div>
      <div className="mb-6 sm:mb-8 space-y-4">
        <div className="flex flex-col gap-4">
          {/* Filtres principaux */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Select
              value={level}
              onValueChange={(value) => setLevel(value as LogLevel | "all")}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue
                  placeholder={t("admin.logs.filters.select_level")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">
                  {t("admin.logs.levels.all")}
                </SelectItem>
                <SelectItem value="info" className="text-sm">
                  {t("admin.logs.levels.info")}
                </SelectItem>
                <SelectItem value="warning" className="text-sm">
                  {t("admin.logs.levels.warning")}
                </SelectItem>
                <SelectItem value="error" className="text-sm">
                  {t("admin.logs.levels.error")}
                </SelectItem>
                <SelectItem value="debug" className="text-sm">
                  {t("admin.logs.levels.debug")}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={action}
              onValueChange={(value) => setAction(value as LogAction | "all")}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue
                  placeholder={t("admin.logs.filters.select_action")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">
                  {t("admin.logs.actions.all")}
                </SelectItem>
                <SelectItem value="auth.login" className="text-sm">
                  {t("admin.logs.actions.login")}
                </SelectItem>
                <SelectItem value="auth.logout" className="text-sm">
                  {t("admin.logs.actions.logout")}
                </SelectItem>
                <SelectItem value="file.upload" className="text-sm">
                  {t("admin.logs.actions.upload")}
                </SelectItem>
                <SelectItem value="file.delete" className="text-sm">
                  {t("admin.logs.actions.delete")}
                </SelectItem>
                <SelectItem value="file.update" className="text-sm">
                  {t("admin.logs.actions.update")}
                </SelectItem>
                <SelectItem value="file.download" className="text-sm">
                  {t("admin.logs.actions.download")}
                </SelectItem>
                <SelectItem value="admin.action" className="text-sm">
                  {t("admin.logs.actions.admin")}
                </SelectItem>
                <SelectItem value="user.create" className="text-sm">
                  {t("admin.logs.actions.user_create")}
                </SelectItem>
                <SelectItem value="user.update" className="text-sm">
                  {t("admin.logs.actions.user_update")}
                </SelectItem>
                <SelectItem value="user.delete" className="text-sm">
                  {t("admin.logs.actions.user_delete")}
                </SelectItem>
                <SelectItem value="config.update" className="text-sm">
                  {t("admin.logs.actions.config_update")}
                </SelectItem>
                <SelectItem value="api.request" className="text-sm">
                  {t("admin.logs.actions.api_request")}
                </SelectItem>
                <SelectItem value="api.error" className="text-sm">
                  {t("admin.logs.actions.api_error")}
                </SelectItem>
                <SelectItem value="system.error" className="text-sm">
                  {t("admin.logs.actions.system_error")}
                </SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder={t("admin.logs.filters.search_placeholder")}
              value={search || ""}
              onChange={(e) => setSearch(e.target.value || null)}
              className="w-full text-sm"
            />

            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left font-normal text-sm"
                  >
                    <CalendarIcon className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">
                      {startDate
                        ? format(new Date(startDate), "P", { locale })
                        : t("admin.logs.start_date")}
                    </span>
                    <span className="sm:hidden">
                      {startDate
                        ? format(new Date(startDate), "dd/MM", { locale })
                        : "Début"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate ? new Date(startDate) : undefined}
                    onSelect={(date) =>
                      setStartDate(date?.toISOString() || null)
                    }
                    initialFocus
                    locale={locale}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left font-normal text-sm"
                  >
                    <CalendarIcon className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">
                      {endDate
                        ? format(new Date(endDate), "P", { locale })
                        : t("admin.logs.end_date")}
                    </span>
                    <span className="sm:hidden">
                      {endDate
                        ? format(new Date(endDate), "dd/MM", { locale })
                        : "Fin"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate ? new Date(endDate) : undefined}
                    onSelect={(date) => setEndDate(date?.toISOString() || null)}
                    initialFocus
                    locale={locale}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Contrôles secondaires */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <Select
              value={refreshInterval}
              onValueChange={(value) =>
                setRefreshInterval(value as keyof typeof REFRESH_INTERVALS)
              }
            >
              <SelectTrigger className="w-full sm:w-[220px] text-sm">
                <SelectValue placeholder={t("admin.logs.refresh_interval")} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REFRESH_INTERVALS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-sm">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4" />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="destructive"
              onClick={handleClearLogs}
              className="w-full sm:w-auto text-sm"
            >
              {t("admin.logs.clear_logs")}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
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
              <TableHead className="text-xs sm:text-sm">
                {t("admin.logs.details")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.pages[0]?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-20 sm:h-24 text-center text-sm"
                >
                  {t("admin.logs.no_logs")}
                </TableCell>
              </TableRow>
            ) : (
              data?.pages.map((page) =>
                page.map((log) => (
                  <TableRow
                    key={`${log.id}-${log.timestamp}`}
                    className="group"
                  >
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
                        className={`${levelColors[log.level]} text-xs`}
                      >
                        {log.level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">
                      {log.action}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm truncate max-w-[150px] sm:max-w-none">
                      {log.message}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">
                      {log.userEmail || t("admin.logs.system")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedLog(log)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 sm:h-8 sm:w-8"
                      >
                        <Info className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog pour afficher les détails du log */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="w-[95vw] max-w-3xl mx-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">
              {t("admin.logs.details_dialog.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="font-semibold text-sm">
                  {t("admin.logs.timestamp")}
                </p>
                <p className="text-sm">
                  {selectedLog &&
                    new Date(selectedLog.timestamp).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm">{t("admin.logs.level")}</p>
                <p>
                  {selectedLog && (
                    <Badge
                      variant="secondary"
                      className={`${levelColors[selectedLog.level]} text-xs`}
                    >
                      {selectedLog.level}
                    </Badge>
                  )}
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm">
                  {t("admin.logs.action")}
                </p>
                <p className="text-sm break-all">{selectedLog?.action}</p>
              </div>
              <div>
                <p className="font-semibold text-sm">{t("admin.logs.user")}</p>
                <p className="text-sm break-all">
                  {selectedLog?.userEmail || t("admin.logs.system")}
                </p>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <p className="font-semibold text-sm">
                  {t("admin.logs.message")}
                </p>
                <p className="text-sm break-all">{selectedLog?.message}</p>
              </div>
              {selectedLog?.ip && (
                <div>
                  <p className="font-semibold text-sm">{t("admin.logs.ip")}</p>
                  <p className="text-sm break-all">{selectedLog.ip}</p>
                </div>
              )}
              {selectedLog?.userAgent && (
                <div className="col-span-1 sm:col-span-2">
                  <p className="font-semibold text-sm">
                    {t("admin.logs.user_agent")}
                  </p>
                  <p className="text-sm break-all">{selectedLog.userAgent}</p>
                </div>
              )}
              {selectedLog?.metadata &&
                Object.keys(selectedLog.metadata).length > 0 && (
                  <div className="col-span-1 sm:col-span-2">
                    <p className="font-semibold mb-2 text-sm">
                      {t("admin.logs.metadata")}
                    </p>
                    <pre className="bg-muted p-3 sm:p-4 rounded-lg overflow-auto max-h-[200px] sm:max-h-[300px] text-xs">
                      <code>
                        {JSON.stringify(selectedLog.metadata, null, 2)}
                      </code>
                    </pre>
                  </div>
                )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading && (
        <div className="mt-4 flex justify-center">
          <Loading
            variant="minimal"
            size="sm"
            showMessage={true}
            className="text-xs"
          />
        </div>
      )}

      <div ref={ref} className="h-10 flex items-center justify-center">
        {hasNextPage && (
          <Loading
            variant="minimal"
            size="sm"
            showMessage={true}
            className="text-xs"
          />
        )}
      </div>
    </div>
  );
}
