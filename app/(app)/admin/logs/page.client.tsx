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
      queryKey: ["logs", level, action, startDate, endDate],
      queryFn: async ({ pageParam }) => {
        const searchParams = new URLSearchParams();
        searchParams.set(
          "offset",
          String((pageParam as number) * ITEMS_PER_PAGE)
        );
        searchParams.set("limit", String(ITEMS_PER_PAGE));
        if (level !== "all") searchParams.set("level", level);
        if (action !== "all") searchParams.set("action", action);
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
    <div className="p-8">
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <Select
              value={level}
              onValueChange={(value) => setLevel(value as LogLevel | "all")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue
                  placeholder={t("admin.logs.filters.select_level")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("admin.logs.levels.all")}
                </SelectItem>
                <SelectItem value="info">
                  {t("admin.logs.levels.info")}
                </SelectItem>
                <SelectItem value="warning">
                  {t("admin.logs.levels.warning")}
                </SelectItem>
                <SelectItem value="error">
                  {t("admin.logs.levels.error")}
                </SelectItem>
                <SelectItem value="debug">
                  {t("admin.logs.levels.debug")}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={action}
              onValueChange={(value) => setAction(value as LogAction | "all")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue
                  placeholder={t("admin.logs.filters.select_action")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("admin.logs.actions.all")}
                </SelectItem>
                <SelectItem value="auth.login">
                  {t("admin.logs.actions.login")}
                </SelectItem>
                <SelectItem value="auth.logout">
                  {t("admin.logs.actions.logout")}
                </SelectItem>
                <SelectItem value="file.upload">
                  {t("admin.logs.actions.upload")}
                </SelectItem>
                <SelectItem value="file.delete">
                  {t("admin.logs.actions.delete")}
                </SelectItem>
                <SelectItem value="file.update">
                  {t("admin.logs.actions.update")}
                </SelectItem>
                <SelectItem value="file.download">
                  {t("admin.logs.actions.download")}
                </SelectItem>
                <SelectItem value="admin.action">
                  {t("admin.logs.actions.admin")}
                </SelectItem>
                <SelectItem value="user.create">
                  {t("admin.logs.actions.user_create")}
                </SelectItem>
                <SelectItem value="user.update">
                  {t("admin.logs.actions.user_update")}
                </SelectItem>
                <SelectItem value="user.delete">
                  {t("admin.logs.actions.user_delete")}
                </SelectItem>
                <SelectItem value="config.update">
                  {t("admin.logs.actions.config_update")}
                </SelectItem>
                <SelectItem value="api.request">
                  {t("admin.logs.actions.api_request")}
                </SelectItem>
                <SelectItem value="api.error">
                  {t("admin.logs.actions.api_error")}
                </SelectItem>
                <SelectItem value="system.error">
                  {t("admin.logs.actions.system_error")}
                </SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[240px] justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate
                    ? format(new Date(startDate), "P", { locale })
                    : t("admin.logs.start_date")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate ? new Date(startDate) : undefined}
                  onSelect={(date) => setStartDate(date?.toISOString() || null)}
                  initialFocus
                  locale={locale}
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[240px] justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate
                    ? format(new Date(endDate), "P", { locale })
                    : t("admin.logs.end_date")}
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

          <div className="flex items-center gap-4">
            <Select
              value={refreshInterval}
              onValueChange={(value) =>
                setRefreshInterval(value as keyof typeof REFRESH_INTERVALS)
              }
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={t("admin.logs.refresh_interval")} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REFRESH_INTERVALS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="destructive" onClick={handleClearLogs}>
              {t("admin.logs.clear_logs")}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.logs.timestamp")}</TableHead>
              <TableHead>{t("admin.logs.level")}</TableHead>
              <TableHead>{t("admin.logs.action")}</TableHead>
              <TableHead>{t("admin.logs.message")}</TableHead>
              <TableHead>{t("admin.logs.user")}</TableHead>
              <TableHead>{t("admin.logs.details")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.pages[0]?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
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
                    <TableCell>
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={levelColors[log.level]}
                      >
                        {log.level}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>{log.message}</TableCell>
                    <TableCell>
                      {log.userEmail || t("admin.logs.system")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedLog(log)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Info className="h-4 w-4" />
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("admin.logs.details_dialog.title")}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-semibold">{t("admin.logs.timestamp")}</p>
                <p>
                  {selectedLog &&
                    new Date(selectedLog.timestamp).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="font-semibold">{t("admin.logs.level")}</p>
                <p>
                  {selectedLog && (
                    <Badge
                      variant="secondary"
                      className={levelColors[selectedLog.level]}
                    >
                      {selectedLog.level}
                    </Badge>
                  )}
                </p>
              </div>
              <div>
                <p className="font-semibold">{t("admin.logs.action")}</p>
                <p>{selectedLog?.action}</p>
              </div>
              <div>
                <p className="font-semibold">{t("admin.logs.user")}</p>
                <p>{selectedLog?.userEmail || t("admin.logs.system")}</p>
              </div>
              <div className="col-span-2">
                <p className="font-semibold">{t("admin.logs.message")}</p>
                <p>{selectedLog?.message}</p>
              </div>
              {selectedLog?.ip && (
                <div>
                  <p className="font-semibold">{t("admin.logs.ip")}</p>
                  <p>{selectedLog.ip}</p>
                </div>
              )}
              {selectedLog?.userAgent && (
                <div className="col-span-2">
                  <p className="font-semibold">{t("admin.logs.user_agent")}</p>
                  <p className="truncate">{selectedLog.userAgent}</p>
                </div>
              )}
              {selectedLog?.metadata &&
                Object.keys(selectedLog.metadata).length > 0 && (
                  <div className="col-span-2">
                    <p className="font-semibold mb-2">
                      {t("admin.logs.metadata")}
                    </p>
                    <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[300px]">
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
