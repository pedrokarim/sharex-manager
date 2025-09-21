"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useQueryState } from "nuqs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Download,
  Trash,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { HistoryEntry } from "@/lib/types/history";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { useTranslation } from "@/lib/i18n";

interface HistoryListProps {
  filters?: URLSearchParams;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const HistoryList = ({ filters }: HistoryListProps) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useQueryState("page", { defaultValue: "1" });
  const [pageSize, setPageSize] = useQueryState("size", { defaultValue: "25" });
  const [sortField, setSortField] = useQueryState("sort", {
    defaultValue: "uploadDate",
  });
  const [sortOrder, setSortOrder] = useQueryState("order", {
    defaultValue: "desc",
  });
  const [totalItems, setTotalItems] = useState(0);
  const locale = useDateLocale();

  const loadHistory = async (searchParams?: URLSearchParams) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams(searchParams);
      params.set("page", page);
      params.set("pageSize", pageSize);
      params.set("sortField", sortField);
      params.set("sortOrder", sortOrder);

      const url = `/api/history?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(t("uploads.history.list.error"));
      }

      const data = await response.json();
      setEntries(data.items);
      setTotalItems(data.total);
    } catch (error) {
      toast.error(t("uploads.history.list.error"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(filters);
  }, [filters, page, pageSize, sortField, sortOrder]);

  const totalPages = Math.ceil(totalItems / Number(pageSize));
  const currentPage = Number(page);

  const handlePageChange = (newPage: number) => {
    setPage(newPage.toString());
  };

  const handlePageSizeChange = (newSize: string) => {
    setPageSize(newSize);
    setPage("1"); // Reset to first page when changing page size
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const formatFileSize = (bytes: number) => {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/history/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(t("uploads.history.list.actions.delete_error"));
      }

      setEntries(entries.filter((entry) => entry.id !== id));
      setTotalItems((prev) => prev - 1);
      toast.success(t("uploads.history.list.actions.delete_success"));
    } catch (error) {
      toast.error(t("uploads.history.list.actions.delete_error"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6 sm:p-8">
        <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const renderSortIcon = (field: string) => {
    if (sortField !== field)
      return <ArrowUpDown className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />;
    return (
      <ArrowUpDown
        className={`ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4 ${
          sortOrder === "asc" ? "rotate-180" : ""
        }`}
      />
    );
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs sm:text-sm">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("originalFilename")}
                  className="flex items-center hover:bg-transparent text-xs sm:text-sm h-6 sm:h-8"
                >
                  {t("uploads.history.list.columns.filename")}
                  {renderSortIcon("originalFilename")}
                </Button>
              </TableHead>
              <TableHead className="text-xs sm:text-sm hidden sm:table-cell">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("uploadDate")}
                  className="flex items-center hover:bg-transparent text-xs sm:text-sm h-6 sm:h-8"
                >
                  {t("uploads.history.list.columns.date")}
                  {renderSortIcon("uploadDate")}
                </Button>
              </TableHead>
              <TableHead className="text-xs sm:text-sm hidden lg:table-cell">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("fileSize")}
                  className="flex items-center hover:bg-transparent text-xs sm:text-sm h-6 sm:h-8"
                >
                  {t("uploads.history.list.columns.size")}
                  {renderSortIcon("fileSize")}
                </Button>
              </TableHead>
              <TableHead className="text-xs sm:text-sm hidden md:table-cell">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("uploadMethod")}
                  className="flex items-center hover:bg-transparent text-xs sm:text-sm h-6 sm:h-8"
                >
                  {t("uploads.history.list.columns.method")}
                  {renderSortIcon("uploadMethod")}
                </Button>
              </TableHead>
              <TableHead className="text-xs sm:text-sm hidden xl:table-cell">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("ipAddress")}
                  className="flex items-center hover:bg-transparent text-xs sm:text-sm h-6 sm:h-8"
                >
                  IP
                  {renderSortIcon("ipAddress")}
                </Button>
              </TableHead>
              <TableHead className="text-xs sm:text-sm hidden lg:table-cell">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("userName")}
                  className="flex items-center hover:bg-transparent text-xs sm:text-sm h-6 sm:h-8"
                >
                  {t("admin.users.table.username")}
                  {renderSortIcon("userName")}
                </Button>
              </TableHead>
              <TableHead className="text-right text-xs sm:text-sm">
                {t("uploads.history.list.columns.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-6 sm:py-8 text-gray-500 text-sm"
                >
                  {t("uploads.history.list.no_results")}
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium text-xs sm:text-sm truncate max-w-[150px] sm:max-w-none">
                    {entry.originalFilename}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm hidden sm:table-cell">
                    <span className="hidden sm:inline">
                      {format(new Date(entry.uploadDate), "Pp", { locale })}
                    </span>
                    <span className="sm:hidden">
                      {format(new Date(entry.uploadDate), "dd/MM HH:mm", {
                        locale,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm hidden lg:table-cell">
                    {formatFileSize(entry.fileSize)}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm hidden md:table-cell">
                    {entry.uploadMethod === "api" &&
                      t("uploads.stats.labels.api")}
                    {entry.uploadMethod === "web" &&
                      t("uploads.stats.labels.web")}
                    {entry.uploadMethod === "sharex" &&
                      t("uploads.stats.labels.sharex")}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm hidden xl:table-cell">
                    {entry.ipAddress}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm hidden lg:table-cell truncate max-w-[100px]">
                    {entry.userName || t("uploads.history.list.anonymous")}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-6 w-6 sm:h-8 sm:w-8 p-0"
                        >
                          <span className="sr-only">
                            {t("uploads.history.list.open_menu")}
                          </span>
                          <MoreHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => window.open(entry.fileUrl, "_blank")}
                          className="text-xs sm:text-sm"
                        >
                          <ExternalLink className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                          {t("uploads.history.list.actions.view")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = entry.fileUrl;
                            a.download = entry.originalFilename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          }}
                          className="text-xs sm:text-sm"
                        >
                          <Download className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                          {t("uploads.history.list.actions.download")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 text-xs sm:text-sm"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                          {t("uploads.history.list.actions.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0 px-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="text-xs sm:text-sm text-muted-foreground">
            {t("uploads.history.list.items_per_page")}
          </p>
          <Select value={pageSize} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[70px] sm:w-[80px] text-xs sm:text-sm h-7 sm:h-8">
              <SelectValue placeholder="25" />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem
                  key={size}
                  value={size.toString()}
                  className="text-xs sm:text-sm"
                >
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {t("uploads.history.list.total_items", { count: totalItems })}
          </p>
        </div>

        <div className="flex items-center justify-center sm:justify-end gap-1 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
          >
            <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">
              {t("uploads.history.list.pagination.previous")}
            </span>
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-xs sm:text-sm">
              {t("uploads.history.list.pagination.page")}
            </span>
            <span className="text-xs sm:text-sm font-medium">
              {currentPage}
            </span>
            <span className="text-xs sm:text-sm">
              {t("uploads.history.list.pagination.of")}
            </span>
            <span className="text-xs sm:text-sm font-medium">{totalPages}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
          >
            <span className="hidden sm:inline">
              {t("uploads.history.list.pagination.next")}
            </span>
            <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
