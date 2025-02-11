"use client";

import { useState } from "react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Lock,
  Unlock,
  Trash2,
  Download,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { FileInfo } from "@/types/files";
import { toast } from "sonner";

interface FileCardProps {
  file: FileInfo;
  onDelete?: () => void;
  onCopy?: () => void;
  onSelect?: () => void;
  onToggleSecurity?: () => void;
  isNew?: boolean;
}

export function FileCard({
  file,
  onDelete,
  onCopy,
  onSelect,
  onToggleSecurity,
  isNew,
}: FileCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const response = await fetch(
        `/api/files?id=${encodeURIComponent(file.name)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Erreur lors de la suppression");
      }

      toast.success("Le fichier a été supprimé avec succès");
      onDelete?.();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      toast.error("Une erreur est survenue lors de la suppression du fichier");
    } finally {
      setIsDeleting(false);
    }
  };

  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-500",
        isNew && "animate-in fade-in-0 zoom-in-95"
      )}
    >
      <CardHeader className="p-0">
        <div
          className="relative aspect-video w-full bg-muted cursor-pointer"
          onClick={onSelect}
        >
          {isImage ? (
            <Image
              src={file.url}
              alt={file.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-2xl font-bold">
                {file.name.split(".").pop()?.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="line-clamp-1 font-medium" title={file.name}>
              {file.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatBytes(file.size)}
            </p>
          </div>
          {onToggleSecurity && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSecurity}
              className="h-8 w-8"
            >
              {file.isSecure ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Unlock className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
      <CardFooter className="grid grid-cols-4 gap-2 p-4 pt-0">
        <Button variant="secondary" className="w-full" asChild>
          <a href={file.url} download>
            <Download className="mr-2 h-4 w-4" />
          </a>
        </Button>
        {onCopy && (
          <Button variant="secondary" className="w-full" onClick={onCopy}>
            <Copy className="h-4 w-4" />
          </Button>
        )}
        <Button variant="secondary" className="w-full" asChild>
          <a href={file.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              className="w-full"
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
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
              <AlertDialogAction onClick={handleDelete}>
                Continuer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
