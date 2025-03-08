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

interface HistoryListProps {
  filters?: URLSearchParams;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const HistoryList = ({ filters }: HistoryListProps) => {
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
        throw new Error("Erreur lors du chargement de l'historique");
      }

      const data = await response.json();
      setEntries(data.items);
      setTotalItems(data.total);
    } catch (error) {
      toast.error("Impossible de charger l'historique");
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
        throw new Error("Erreur lors de la suppression");
      }

      setEntries(entries.filter((entry) => entry.id !== id));
      setTotalItems((prev) => prev - 1);
      toast.success("L'entrée a été supprimée");
    } catch (error) {
      toast.error("Impossible de supprimer l'entrée");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return (
      <ArrowUpDown
        className={`ml-2 h-4 w-4 ${sortOrder === "asc" ? "rotate-180" : ""}`}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("originalFilename")}
                  className="flex items-center hover:bg-transparent"
                >
                  Nom du fichier
                  {renderSortIcon("originalFilename")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("uploadDate")}
                  className="flex items-center hover:bg-transparent"
                >
                  Date d&apos;upload
                  {renderSortIcon("uploadDate")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("fileSize")}
                  className="flex items-center hover:bg-transparent"
                >
                  Taille
                  {renderSortIcon("fileSize")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("uploadMethod")}
                  className="flex items-center hover:bg-transparent"
                >
                  Méthode
                  {renderSortIcon("uploadMethod")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("ipAddress")}
                  className="flex items-center hover:bg-transparent"
                >
                  IP
                  {renderSortIcon("ipAddress")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("userName")}
                  className="flex items-center hover:bg-transparent"
                >
                  Utilisateur
                  {renderSortIcon("userName")}
                </Button>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-gray-500"
                >
                  Aucun fichier dans l&apos;historique
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {entry.originalFilename}
                  </TableCell>
                  <TableCell>
                    {format(new Date(entry.uploadDate), "Pp", { locale })}
                  </TableCell>
                  <TableCell>{formatFileSize(entry.fileSize)}</TableCell>
                  <TableCell>
                    {entry.uploadMethod === "api" && "API"}
                    {entry.uploadMethod === "web" && "Interface Web"}
                    {entry.uploadMethod === "sharex" && "ShareX"}
                  </TableCell>
                  <TableCell>{entry.ipAddress}</TableCell>
                  <TableCell>{entry.userName || "Anonyme"}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Ouvrir le menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => window.open(entry.fileUrl, "_blank")}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Voir le fichier
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
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Télécharger
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash className="mr-2 h-4 w-4" />
                          Supprimer
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

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">Éléments par page</p>
          <Select value={pageSize} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[80px]">
              <SelectValue placeholder="25" />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {totalItems} élément{totalItems > 1 ? "s" : ""} au total
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-sm">Page</span>
            <span className="text-sm font-medium">{currentPage}</span>
            <span className="text-sm">sur</span>
            <span className="text-sm font-medium">{totalPages}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Suivant
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
