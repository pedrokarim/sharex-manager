"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ImageOff, RefreshCcw } from "lucide-react";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useQueryState } from "nuqs";
import { ViewSelector } from "@/components/view-selector";
import { GridView } from "@/components/gallery/grid-view";
import { ListView } from "@/components/gallery/list-view";
import { FileViewer } from "@/components/gallery/file-viewer";
import { UploadZone } from "@/components/gallery/upload-zone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { capitalize, cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

interface FileInfo {
  name: string;
  url: string;
  size: number;
  createdAt: string;
  isSecure?: boolean;
}

interface GroupedFiles {
  [key: string]: FileInfo[];
}

interface GalleryClientProps {
  initialFiles: FileInfo[];
  initialHasMore: boolean;
  initialView?: "grid" | "list" | "details";
  initialSearch?: string;
  initialPage: number;
  secureOnly?: boolean;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  isSecure?: boolean;
  onSecureChange?: (isSecure: boolean) => void;
}

function UploadModal({
  isOpen,
  onClose,
  onUpload,
  isSecure,
  onSecureChange,
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsUploading(true);
      await onUpload(file);
      onClose();
    } catch (error) {
      console.error("Erreur lors de l'upload:", error);
      toast.error("Erreur lors de l'upload");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Uploader un fichier</DialogTitle>
          <DialogDescription>
            Sélectionnez un fichier à uploader sur le serveur.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Fichier</Label>
            <Input type="file" onChange={handleFileChange} />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="secure"
              checked={isSecure}
              onCheckedChange={(checked) =>
                onSecureChange?.(checked as boolean)
              }
            />
            <Label htmlFor="secure">Fichier privé</Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="submit"
            onClick={handleUpload}
            disabled={!file || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Upload en cours...
              </>
            ) : (
              "Uploader"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GalleryClient({
  initialFiles,
  initialHasMore,
  initialView = "grid",
  initialSearch = "",
  initialPage,
  secureOnly = false,
}: GalleryClientProps) {
  const { data: session, status } = useSession();
  const [search] = useQueryState("q");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [page, setPage] = useState(initialPage);
  const [viewMode] = useQueryState<"grid" | "list" | "details">("view", {
    defaultValue: initialView,
    parse: (value): "grid" | "list" | "details" => {
      if (value === "grid" || value === "list" || value === "details") {
        return value;
      }
      return "grid";
    },
  });
  const [refreshInterval, setRefreshInterval] = useState<string>("0");
  const [newFileIds, setNewFileIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSecureUpload, setIsSecureUpload] = useState(false);

  const fetchFiles = useCallback(
    async (page: number) => {
      try {
        const searchParams = new URLSearchParams();
        searchParams.set("page", page.toString());
        if (search) searchParams.set("q", search);
        if (secureOnly) searchParams.set("secure", "true");

        const res = await fetch(`/api/files?${searchParams.toString()}`);
        const data = await res.json();
        return {
          files: data.files,
          hasMore: data.hasMore,
        };
      } catch (error) {
        console.error("Erreur lors du chargement des fichiers:", error);
        return {
          files: [],
          hasMore: false,
        };
      }
    },
    [search, secureOnly]
  );

  const {
    data: files,
    loading,
    ref,
    reset,
  } = useInfiniteScroll<FileInfo>({
    initialData: initialFiles,
    fetchMore: useCallback(
      async (page) => {
        const { files, hasMore } = await fetchFiles(page);
        setHasMore(hasMore);
        return files;
      },
      [fetchFiles]
    ),
    hasMore,
  });

  const handleFinishUpload = useCallback(async () => {
    const { files: newFiles, hasMore: newHasMore } = await fetchFiles(1);
    setHasMore(newHasMore);
    reset(newFiles);
  }, [fetchFiles, reset]);

  const resetSearch = useCallback(() => {
    setPage(1);
    fetchFiles(1).then(({ files, hasMore }) => {
      setHasMore(hasMore);
      // reset(files);
    });
  }, [fetchFiles]);

  useEffect(() => {
    if (search !== initialSearch && search !== undefined) {
      resetSearch();
    }
  }, [search, initialSearch, resetSearch]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { files: newFiles, hasMore: newHasMore } = await fetchFiles(1);
      setPage(1);
      setHasMore(newHasMore);
    } catch (error) {
      console.error("Erreur lors du rafraîchissement:", error);
      toast.error("Erreur lors du rafraîchissement de la galerie");
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchFiles]);

  useEffect(() => {
    const interval = Number.parseInt(refreshInterval);
    if (interval === 0) return;

    const timer = setInterval(() => {
      handleRefresh();
    }, interval * 1000);
    return () => clearInterval(timer);
  }, [refreshInterval, handleRefresh]);

  useEffect(() => {
    const handleFilesUploaded = (event: Event) => {
      const customEvent = event as CustomEvent<{ files: FileInfo[] }>;
      const newIds = customEvent.detail.files.map((file) => file.name);
      setNewFileIds(newIds);
      handleRefresh();

      setTimeout(() => {
        setNewFileIds([]);
      }, 2000);
    };

    window.addEventListener("filesUploaded", handleFilesUploaded);
    return () => {
      window.removeEventListener("filesUploaded", handleFilesUploaded);
    };
  }, [handleRefresh]);

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }
  }, [status]);

  const groupedFiles = useMemo(() => {
    return files.reduce((acc: GroupedFiles, file) => {
      const date = format(parseISO(file.createdAt), "MMMM yyyy", {
        locale: fr,
      });
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(file);
      return acc;
    }, {});
  }, [files]);

  const findCurrentFileIndex = () => {
    if (!selectedFile) return -1;
    return files.findIndex((f) => f.name === selectedFile.name);
  };

  const handlePrevious = () => {
    const currentIndex = findCurrentFileIndex();
    if (currentIndex > 0) {
      setSelectedFile(files[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    const currentIndex = findCurrentFileIndex();
    if (currentIndex < files.length - 1) {
      setSelectedFile(files[currentIndex + 1]);
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      const response = await fetch(`/api/files/${filename}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Fichier supprimé avec succès");
        setSelectedFile(null);
        handleRefresh();
      }
    } catch (error) {
      toast.error("Une erreur est survenue lors de la suppression");
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(url);
        toast.success("URL copiée dans le presse-papier");
      } else {
        // Fallback pour les navigateurs qui ne supportent pas l'API Clipboard
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand("copy");
          toast.success("URL copiée dans le presse-papier");
        } catch (err) {
          toast.error("Impossible de copier l'URL");
          console.error("Erreur lors de la copie:", err);
        }

        document.body.removeChild(textArea);
      }
    } catch (error) {
      toast.error("Impossible de copier l'URL");
      console.error("Erreur lors de la copie:", error);
    }
  };

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      `/api/files${isSecureUpload ? "/secure" : ""}`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error("Erreur lors de l'upload");
    }

    await fetchFiles(1).then(({ files }) => {
      reset(files);
      setSelectedFile(files[0]);
    });
  };

  const handleToggleSecurity = async (file: FileInfo) => {
    try {
      const formData = new FormData();
      formData.append("isSecure", (!file.isSecure).toString());

      const response = await fetch(
        `/api/files?filename=${encodeURIComponent(file.name)}`,
        {
          method: "PUT",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Erreur lors de la modification de la sécurité");
      }

      const data = await response.json();

      // Mettre à jour le fichier dans la liste
      const updatedFiles = files.map((f) =>
        f.name === file.name ? { ...f, isSecure: data.isSecure } : f
      );
      reset(updatedFiles);

      toast.success(
        file.isSecure
          ? "Le fichier est maintenant public"
          : "Le fichier est maintenant privé"
      );
    } catch (error) {
      console.error("Erreur lors de la modification de la sécurité:", error);
      toast.error("Une erreur est survenue");
    }
  };

  return (
    <>
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {secureOnly ? "Fichiers Sécurisés" : "Galerie d'images"}
          </h1>
          <div className="flex items-center gap-4">
            <ViewSelector />

            <Select value={refreshInterval} onValueChange={setRefreshInterval}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Rafraîchissement auto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Pas de rafraîchissement</SelectItem>
                <SelectItem value="5">5s</SelectItem>
                <SelectItem value="10">10s</SelectItem>
                <SelectItem value="15">15s</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              className={cn(
                "shrink-0 transition-all duration-200",
                isRefreshing && "animate-spin text-primary"
              )}
              disabled={isRefreshing}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>

            <Button onClick={() => setIsUploadModalOpen(true)}>Upload</Button>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-24 text-center">
            <ImageOff className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Aucune image</h3>
              <p className="text-sm text-muted-foreground">
                Commencez à uploader des images avec ShareX
              </p>
            </div>
          </div>
        ) : (
          <>
            {Object.entries(groupedFiles).map(([date, filesInGroup]) => (
              <div key={date} className="mb-8">
                <h2 className="mb-4 text-xl font-semibold text-muted-foreground">
                  {capitalize(date)}
                </h2>
                {!viewMode || viewMode === "grid" ? (
                  <GridView
                    files={filesInGroup}
                    onCopy={copyToClipboard}
                    onDelete={(name) => {
                      // setSelectedFile(
                      //   files.find((f) => f.name === name) || null
                      // );
                      console.log(files);
                      reset(files.filter((f) => f.name !== name));
                    }}
                    onSelect={setSelectedFile}
                    onToggleSecurity={handleToggleSecurity}
                    newFileIds={newFileIds}
                  />
                ) : (
                  <ListView
                    files={filesInGroup}
                    onCopy={copyToClipboard}
                    onDelete={(name) => {
                      // setSelectedFile(
                      //   files.find((f) => f.name === name) || null
                      // );
                      reset(files.filter((f) => f.name !== name));
                    }}
                    onSelect={setSelectedFile}
                    onToggleSecurity={handleToggleSecurity}
                    detailed={viewMode === "details"}
                    newFileIds={newFileIds}
                  />
                )}
              </div>
            ))}
            <div ref={ref} className="h-10 flex items-center justify-center">
              {loading && (
                <div className="text-muted-foreground">Chargement...</div>
              )}
            </div>
          </>
        )}
      </div>

      <UploadZone onFinishUpload={handleFinishUpload}>
        <div className="h-1 w-1" />
      </UploadZone>

      <FileViewer
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDelete={handleDelete}
        onCopy={copyToClipboard}
        onToggleSecurity={handleToggleSecurity}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={findCurrentFileIndex() > 0}
        hasNext={findCurrentFileIndex() < files.length - 1}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setIsSecureUpload(false);
        }}
        onUpload={handleUpload}
        isSecure={isSecureUpload}
        onSecureChange={setIsSecureUpload}
      />
    </>
  );
}
