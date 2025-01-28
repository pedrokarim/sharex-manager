"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Download, Copy, ExternalLink, ImageOff } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { BreadcrumbNav } from "@/components/breadcrumb";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useQueryState } from "nuqs";

interface FileInfo {
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

interface GroupedFiles {
  [key: string]: FileInfo[];
}

export default function GalleryPage() {
  const { data: session, status } = useSession();
  const [search] = useQueryState("q");
  const [hasMore, setHasMore] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const fetchFiles = async (page: number) => {
    try {
      const res = await fetch(`/api/files?page=${page}&q=${search || ""}`);
      const data = await res.json();
      setHasMore(data.hasMore);
      return data.files;
    } catch (error) {
      console.error("Erreur lors du chargement des fichiers:", error);
      return [];
    }
  };

  const {
    data: files,
    loading,
    ref,
  } = useInfiniteScroll({
    initialData: [],
    fetchMore: fetchFiles,
    hasMore,
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }
  }, [status]);

  // Grouper les fichiers par date
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

  const handleDelete = async (filename: string) => {
    try {
      const response = await fetch(`/api/files/${filename}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Fichier supprimé avec succès");
        fetchFiles(1);
      }
    } catch (error) {
      toast.error("Une erreur est survenue lors de la suppression");
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copiée dans le presse-papier");
  };

  return (
    <>
      <div className="flex flex-1">
        <AppSidebar />
        <SidebarInset>
          <SidebarHeader showSearch={true} />

          <div className="container mx-auto p-8">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-2xl font-bold">Galerie d'images</h1>
              <Button onClick={() => window.location.reload()}>
                Rafraîchir
              </Button>
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
              Object.entries(groupedFiles).map(([date, filesInGroup]) => (
                <div key={date} className="mb-8">
                  <h2 className="mb-4 text-xl font-semibold">{date}</h2>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filesInGroup.map((file) => (
                      <Card key={file.name} className="overflow-hidden">
                        <CardContent className="p-0">
                          <div className="relative aspect-square">
                            <Image
                              src={file.url}
                              alt={file.name}
                              fill
                              className="object-cover"
                            />
                          </div>
                          <div className="p-4">
                            <p className="mb-2 truncate text-sm">{file.name}</p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => copyToClipboard(file.url)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="icon" asChild>
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setSelectedFile(file.name)}
                                className="ml-auto text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            )}

            {/* État de chargement */}
            <div ref={ref} className="h-10 flex items-center justify-center">
              {loading && (
                <div className="text-muted-foreground">Chargement...</div>
              )}
            </div>
          </div>
        </SidebarInset>

        <AlertDialog
          open={!!selectedFile}
          onOpenChange={() => setSelectedFile(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Le fichier sera définitivement
                supprimé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedFile) {
                    handleDelete(selectedFile);
                    setSelectedFile(null);
                  }
                }}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
