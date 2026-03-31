"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useQueryState } from "nuqs";
import { format } from "date-fns";
import type { Log, LogAction, LogLevel } from "@/lib/types/logs";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { Loading } from "@/components/ui/loading";
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
} from "lucide-react";

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

  const hasDateFilter = Boolean(startDate || endDate);

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">{t("admin.logs.error")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <ScrollText className="h-3.5 w-3.5" />
            Journal d’exploitation
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("admin.sections.logs.title")}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              Explorez les événements importants avec des filtres regroupés,
              lisibles et suffisamment d’espace pour parcourir les détails.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Niveau
              </p>
              <p className="mt-1 text-sm">
                {level === "all" ? "Tous les niveaux" : level}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Fenêtre
              </p>
              <p className="mt-1 text-sm">
                {hasDateFilter ? "Filtre de dates actif" : "Période complète"}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Actualisation
              </p>
              <p className="mt-1 text-sm">
                {REFRESH_INTERVALS[refreshInterval]}
              </p>
            </div>
          </div>
        </div>
      </section>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 p-5 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            Filtres de consultation
          </CardTitle>
          <CardDescription className="text-sm">
            Affinez le journal avant d’ouvrir un événement particulier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 xl:grid-cols-4">
            <Select
              value={level}
              onValueChange={(value) => setLevel(value as LogLevel | "all")}
            >
              <SelectTrigger className="text-sm">
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
              <SelectTrigger className="text-sm">
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

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.logs.filters.search_placeholder")}
                value={search || ""}
                onChange={(e) => setSearch(e.target.value || null)}
                className="pl-9 text-sm"
              />
            </div>

            <Select
              value={refreshInterval}
              onValueChange={(value) =>
                setRefreshInterval(value as keyof typeof REFRESH_INTERVALS)
              }
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder={t("admin.logs.refresh_interval")} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REFRESH_INTERVALS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-sm">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-start text-left text-sm font-normal"
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
                  className="justify-start text-left text-sm font-normal"
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

            <Button
              variant="destructive"
              onClick={handleClearLogs}
              className="text-sm"
            >
              {t("admin.logs.clear_logs")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 p-5 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            Flux des événements
          </CardTitle>
          <CardDescription className="text-sm">
            Parcourez les lignes du journal et ouvrez un événement pour voir son
            contexte complet.
          </CardDescription>
        </CardHeader>
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

          {isLoading && (
            <div className="flex justify-center">
              <Loading variant="minimal" size="sm" showMessage={true} />
            </div>
          )}

          <div ref={ref} className="flex h-10 items-center justify-center">
            {hasNextPage && (
              <Loading variant="minimal" size="sm" showMessage={true} />
            )}
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
