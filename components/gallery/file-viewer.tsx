"use client"

import { FileInfo } from "@/types"
import { Dialog, DialogContent } from "../ui/dialog"
import { Button } from "../ui/button"
import { Copy, ExternalLink, Trash2, X, ChevronRight, ChevronLeft, Info } from "lucide-react"
import Image from "next/image"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface FileViewerProps {
  file: FileInfo | null
  onClose: () => void
  onDelete: (name: string) => void
  onCopy: (url: string) => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

export function FileViewer({
  file,
  onClose,
  onDelete,
  onCopy,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: FileViewerProps) {
  const [showDetails, setShowDetails] = useState(false)

  if (!file) return null

  return (
    <Dialog open={!!file} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-7xl border-none bg-background/80 p-0 backdrop-blur-xl">
        <div className="relative flex h-[80vh] overflow-hidden">
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
                className="absolute left-4 top-1/2 -translate-y-1/2"
                onClick={onPrevious}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
            )}
            {hasNext && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2"
                onClick={onNext}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            )}
          </div>

          {/* Panneau latéral */}
          <div
            className={cn(
              "h-full w-[400px] border-l bg-background p-6 shadow-lg transition-all",
              !showDetails && "w-[80px]"
            )}
          >
            <div className="mb-6 flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDetails(!showDetails)}
              >
                <Info className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div
              className={cn(
                "space-y-6 opacity-100 transition-all",
                !showDetails && "invisible opacity-0"
              )}
            >
              <div>
                <h3 className="text-lg font-semibold">Informations</h3>
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Nom du fichier</p>
                    <p className="mt-1 text-sm">{file.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date d'ajout</p>
                    <p className="mt-1 text-sm">
                      {format(parseISO(file.createdAt), "dd MMMM yyyy à HH:mm", {
                        locale: fr,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Taille</p>
                    <p className="mt-1 text-sm">
                      {(file.size / 1024).toFixed(2)} Ko
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold">Actions</h3>
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => onCopy(file.url)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copier le lien
                  </Button>
                  <Button variant="outline" className="justify-start" asChild>
                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Ouvrir dans un nouvel onglet
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start text-destructive"
                    onClick={() => onDelete(file.name)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 