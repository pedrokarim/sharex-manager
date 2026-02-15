"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Plus,
  Globe,
  GlobeLock,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GridView } from "@/components/gallery/grid-view";
import { ListView } from "@/components/gallery/list-view";
import { FileViewer } from "@/components/gallery/file-viewer";
import { ViewSelector } from "@/components/view-selector";
import { useTranslation } from "@/lib/i18n";
import { Loading } from "@/components/ui/loading";
import { useQueryState } from "nuqs";
import type { Album } from "@/types/albums";
import type { FileInfo } from "@/types/files";

interface AlbumViewClientProps {
  albumId: number;
}

export function AlbumViewClient({ albumId }: AlbumViewClientProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const [album, setAlbum] = useState<Album | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [viewMode] = useQueryState<"grid" | "list" | "details">("view", {
    defaultValue: "grid",
    parse: (value): "grid" | "list" | "details" => {
      if (value === "grid" || value === "list" || value === "details") {
        return value;
      }
      return "grid";
    },
  });

  const fetchAlbumData = useCallback(async () => {
    try {
      setLoading(true);

      // Récupérer les données de l'album
      const albumResponse = await fetch(`/api/albums/${albumId}`);
      if (!albumResponse.ok) {
        const errorData = await albumResponse.json().catch(() => ({}));
        const errorMessage =
          errorData.error || t("albums.errors.loading");

        if (albumResponse.status === 404) {
          toast.error(t("albums.errors.not_found"));
          router.push("/albums");
          return;
        }

        if (albumResponse.status === 401) {
          router.push("/login");
          return;
        }

        if (albumResponse.status === 403) {
          toast.error(t("albums.errors.forbidden"));
          router.push("/albums");
          return;
        }

        toast.error(errorMessage);
        return;
      }

      const albumData = await albumResponse.json();
      setAlbum(albumData);

      // Récupérer les fichiers avec les détails complets
      const filesResponse = await fetch(
        `/api/albums/${albumId}/files?details=true`
      );
      if (!filesResponse.ok) {
        const errorData = await filesResponse.json().catch(() => ({}));
        toast.error(errorData.error || t("albums.errors.loading_files"));
        return;
      }

      const filesData = await filesResponse.json();
      setFiles(filesData.files);
    } catch (error) {
      console.error("Erreur lors du chargement de l'album:", error);
      toast.error(t("albums.errors.loading"));
    } finally {
      setLoading(false);
    }
  }, [albumId, router, t]);

  useEffect(() => {
    fetchAlbumData();
  }, [fetchAlbumData]);

  const handleRemoveFromAlbum = async (fileName: string) => {
    try {
      const response = await fetch(`/api/albums/${albumId}/files`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileNames: [fileName] }),
      });

      if (!response.ok) {
        throw new Error();
      }

      setFiles((prev) => prev.filter((file) => file.name !== fileName));
      toast.success(t("albums.file_removed"));
    } catch {
      toast.error(t("albums.errors.remove_file"));
    }
  };

  const handleDeleteAlbum = async () => {
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error();
      }

      toast.success(t("albums.deleted"));
      router.push("/albums");
    } catch {
      toast.error(t("albums.errors.delete"));
    }
  };

  const handleTogglePublic = async () => {
    setIsTogglingPublic(true);
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPublic: !album?.isPublic,
        }),
      });

      if (!response.ok) {
        throw new Error();
      }

      const updatedAlbum = await response.json();
      setAlbum(updatedAlbum);
      toast.success(
        updatedAlbum.isPublic
          ? t("albums.now_public")
          : t("albums.now_private")
      );
    } catch {
      toast.error(t("albums.errors.toggle_visibility"));
    } finally {
      setIsTogglingPublic(false);
    }
  };

  const handleCopyPublicUrl = async () => {
    if (!album?.publicSlug) return;

    const publicUrl = `${window.location.origin}/public/albums/${album.publicSlug}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedUrl(true);
      toast.success(t("albums.url_copied"));
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      toast.error(t("albums.errors.copy_url"));
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("gallery.file_actions.copy_url"));
    } catch {
      toast.error(t("gallery.file_actions.copy_error"));
    }
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

      if (!response.ok) throw new Error();

      const data = await response.json();
      setFiles((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, isSecure: data.isSecure } : f
        )
      );

      toast.success(
        file.isSecure
          ? t("gallery.file_actions.now_public")
          : t("gallery.file_actions.now_private")
      );
    } catch {
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  };

  const handleToggleStar = async (file: FileInfo) => {
    try {
      const formData = new FormData();
      formData.append("isStarred", (!file.isStarred).toString());

      const response = await fetch(
        `/api/files/${encodeURIComponent(file.name)}/star`,
        {
          method: "PUT",
          body: formData,
        }
      );

      if (!response.ok) throw new Error();

      const data = await response.json();
      setFiles((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, isStarred: data.isStarred } : f
        )
      );

      toast.success(
        file.isStarred
          ? t("gallery.file_actions.removed_from_favorites")
          : t("gallery.file_actions.added_to_favorites")
      );
    } catch {
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  };

  // Navigation dans le FileViewer
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

  const handleDeleteFile = async (filename: string) => {
    await handleRemoveFromAlbum(filename);
    setSelectedFile(null);
  };

  if (loading) {
    return <Loading fullHeight />;
  }

  if (!album) {
    return null;
  }

  return (
    <div>
      {/* En-tête de l'album */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="h-8 w-8 sm:h-9 sm:w-9"
          >
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h1 className="text-lg sm:text-2xl font-bold truncate">
                {album.name}
              </h1>
              {album.isPublic && (
                <Badge
                  variant="default"
                  className="text-xs sm:text-sm w-fit bg-green-600"
                >
                  <Globe className="h-2.5 w-2.5 mr-1" />
                  Public
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs sm:text-sm w-fit">
                {t("albums.files_count", { count: files.length })}
              </Badge>
            </div>
            {album.description && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                {album.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          <ViewSelector />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9"
              >
                {album.isPublic ? (
                  <Globe className="h-3 w-3 sm:h-4 sm:w-4" />
                ) : (
                  <GlobeLock className="h-3 w-3 sm:h-4 sm:w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleTogglePublic}
                disabled={isTogglingPublic}
                className="text-sm"
              >
                {album.isPublic ? (
                  <>
                    <GlobeLock className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    {t("albums.make_private")}
                  </>
                ) : (
                  <>
                    <Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    {t("albums.make_public")}
                  </>
                )}
              </DropdownMenuItem>
              {album.isPublic && album.publicSlug && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleCopyPublicUrl}
                    className="text-sm"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                        {t("albums.url_copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                        {t("albums.copy_public_url")}
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      window.open(
                        `/public/albums/${album.publicSlug}`,
                        "_blank"
                      );
                    }}
                    className="text-sm"
                  >
                    <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    {t("albums.open_new_tab")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            onClick={handleDeleteAlbum}
            className="h-8 w-8 sm:h-9 sm:w-9 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>

      {/* Section de configuration publique */}
      {album.isPublic && album.publicSlug && (
        <Card className="mb-6 sm:mb-8">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Globe className="h-4 w-4 sm:h-5 sm:w-5" />
              {t("albums.public_album")}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {t("albums.public_album_description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="public-url" className="text-xs sm:text-sm">
                  {t("albums.public_url")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="public-url"
                    readOnly
                    value={
                      typeof window !== "undefined"
                        ? `${window.location.origin}/public/albums/${album.publicSlug}`
                        : `/public/albums/${album.publicSlug}`
                    }
                    className="text-xs sm:text-sm font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyPublicUrl}
                    className="flex-shrink-0"
                  >
                    {copiedUrl ? (
                      <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                    ) : (
                      <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      window.open(
                        `/public/albums/${album.publicSlug}`,
                        "_blank"
                      );
                    }}
                    className="flex-shrink-0"
                  >
                    <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contenu de l'album */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-24 text-center px-4">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-primary/10 flex items-center justify-center mb-3 sm:mb-4">
            <Plus className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-semibold">
              {t("albums.empty_album")}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
              {t("albums.empty_album_description")}
            </p>
          </div>
        </div>
      ) : (
        <div>
          {!viewMode || viewMode === "grid" ? (
            <GridView
              files={files}
              onCopy={copyToClipboard}
              onDelete={handleRemoveFromAlbum}
              onSelect={setSelectedFile}
              onToggleSecurity={handleToggleSecurity}
              onToggleStar={handleToggleStar}
              newFileIds={[]}
            />
          ) : (
            <ListView
              files={files}
              onCopy={copyToClipboard}
              onDelete={handleRemoveFromAlbum}
              onSelect={setSelectedFile}
              onToggleSecurity={handleToggleSecurity}
              onToggleStar={handleToggleStar}
              detailed={viewMode === "details"}
              newFileIds={[]}
            />
          )}
        </div>
      )}

      {/* Visionneuse de fichiers */}
      <FileViewer
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDelete={handleDeleteFile}
        onCopy={copyToClipboard}
        onToggleSecurity={handleToggleSecurity}
        onToggleStar={handleToggleStar}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={findCurrentFileIndex() > 0}
        hasNext={findCurrentFileIndex() < files.length - 1}
      />
    </div>
  );
}
