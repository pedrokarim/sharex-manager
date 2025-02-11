"use client";

import { FileInfo } from "@/types/files";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  Copy,
  ExternalLink,
  Trash2,
  X,
  ChevronRight,
  ChevronLeft,
  Info,
  Lock,
  Unlock,
} from "lucide-react";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Separator } from "../ui/separator";
import { VisuallyHidden } from "../ui/visually-hidden";

interface FileViewerProps {
  file: FileInfo | null;
  onClose: () => void;
  onDelete: (filename: string) => Promise<void>;
  onCopy: (url: string) => void;
  onToggleSecurity: (file: FileInfo) => Promise<void>;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function FileViewer({
  file,
  onClose,
  onDelete,
  onCopy,
  onToggleSecurity,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: FileViewerProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (!file) return null;

  return (
    <Dialog open={!!file} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-7xl border-none bg-background/95 p-0 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between p-4">
            <span>{file.name}</span>
            {/* <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onToggleSecurity(file)}
              >
                {file.isSecure ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Unlock className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCopy(file.url)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(file.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div> */}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          <VisuallyHidden>
            Image ajoutée le{" "}
            {format(parseISO(file.createdAt), "dd MMMM yyyy", { locale: fr })}.
            Taille du fichier : {(file.size / 1024).toFixed(2)} Ko.
            {hasPrevious &&
              "Utilisez le bouton précédent pour voir l'image précédente."}
            {hasNext &&
              "Utilisez le bouton suivant pour voir l'image suivante."}
          </VisuallyHidden>
        </DialogDescription>
        <div className="relative flex h-[85vh] overflow-hidden rounded-lg">
          {/* Zone principale */}
          <div className="relative flex-1">
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Image
                src={file.url}
                alt={file.name}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 60vw"
                priority
              />
            </div>

            {/* Boutons de navigation */}
            {hasPrevious && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/50 hover:bg-background/80"
                onClick={onPrevious}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
            )}
            {hasNext && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/50 hover:bg-background/80"
                onClick={onNext}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            )}

            {/* Barre d'actions flottante en bas */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-4 bg-gradient-to-t from-background/80 to-transparent p-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-blue-600 hover:text-white text-blue-600"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  <Info className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-background/80"
                  onClick={() => onCopy(file.url)}
                >
                  <Copy className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-background/80"
                  asChild
                >
                  <a href={file.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-5 w-5" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "rounded-full bg-background/50",
                    file.isSecure &&
                      "text-yellow-500 hover:bg-yellow-500 hover:text-white"
                  )}
                  onClick={() => onToggleSecurity(file)}
                >
                  {file.isSecure ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Unlock className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-red-600 hover:text-white text-red-600"
                  onClick={() => onDelete(file.name)}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-background/80"
                  onClick={onClose}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Panneau latéral */}
          <div
            className={cn(
              "h-full w-[400px] bg-background p-6 shadow-lg transition-all duration-300",
              !showDetails && "w-0 p-0 opacity-0"
            )}
          >
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Informations</h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Nom du fichier
                    </p>
                    <p className="mt-1 font-medium">{file.name}</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Date d'ajout
                    </p>
                    <p className="mt-1 font-medium">
                      {format(
                        parseISO(file.createdAt),
                        "dd MMMM yyyy à HH:mm",
                        {
                          locale: fr,
                        }
                      )}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Taille</p>
                    <p className="mt-1 font-medium">
                      {(file.size / 1024).toFixed(2)} Ko
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
