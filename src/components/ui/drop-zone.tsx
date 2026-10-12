"use client"

import * as React from "react"
import { UploadIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Zone qui accepte des fichiers glissés depuis l'ordinateur : elle s'éclaire
 * pendant le survol et dit ce qu'elle fera du dépôt. On dépose un fichier
 * directement là où il servira. C'est un raccourci : un bouton d'ajout reste
 * nécessaire à côté.
 */

const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files")

function DropZone({
  onFiles,
  accept,
  disabled = false,
  label = "Déposer ici",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "onDrop"> & {
  onFiles: (files: File[]) => void
  /** Filtre des fichiers acceptés ; les autres sont ignorés. */
  accept?: (file: File) => boolean
  disabled?: boolean
  /** Ce que fera le dépôt : « Déposer pour ajouter à la marque ». */
  label?: string
}) {
  const [active, setActive] = React.useState(false)
  const depth = React.useRef(0)

  return (
    <div
      data-slot="drop-zone"
      data-active={active || undefined}
      className={cn("relative min-w-0", className)}
      onDragEnter={(event) => {
        if (disabled || !hasFiles(event)) return
        event.preventDefault()
        depth.current += 1
        setActive(true)
      }}
      onDragOver={(event) => {
        if (disabled || !hasFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
      }}
      onDragLeave={(event) => {
        if (disabled || !hasFiles(event)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setActive(false)
      }}
      onDrop={(event) => {
        if (disabled || !hasFiles(event)) return
        event.preventDefault()
        depth.current = 0
        setActive(false)
        const files = Array.from(event.dataTransfer.files).filter((file) => (accept ? accept(file) : true))
        if (files.length > 0) onFiles(files)
      }}
      {...props}
    >
      {children}
      {active && (
        <div
          aria-hidden
          data-slot="drop-zone-overlay"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-background/80 backdrop-blur-[2px] animate-in fade-in-0"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-primary">
            <UploadIcon className="size-4" />
            {label}
          </span>
        </div>
      )}
    </div>
  )
}

export { DropZone }
