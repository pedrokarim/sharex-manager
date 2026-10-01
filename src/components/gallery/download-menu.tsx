"use client";

import { useCallback, type ReactNode } from "react";
import { Download, Eraser } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";
import { canBeCleaned, downloadClean, downloadOriginal } from "@/lib/provenance/client";
import { formatBytes } from "@/lib/utils";

/** Les deux téléchargements d'un fichier, à brancher sur n'importe quel bouton ou menu. */
export function useDownloads(file: { name: string; url: string }) {
  const { t } = useTranslation();
  const original = useCallback(() => downloadOriginal(file.url, file.name), [file.url, file.name]);
  const clean = useCallback(async () => {
    try {
      const { savedBytes } = await downloadClean(file.name);
      toast.success(
        savedBytes > 0
          ? t("gallery.download.clean_done", { size: formatBytes(savedBytes) })
          : t("gallery.download.clean_nothing")
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("gallery.download.clean_error"));
    }
  }, [file.name, t]);
  return { original, clean, cleanable: canBeCleaned(file.name) };
}

/**
 * Bouton de téléchargement d'un fichier de la galerie. Pour une image, il
 * ouvre un menu à deux entrées : l'original, ou une version sans métadonnées.
 * Pour tout autre fichier, il télécharge directement.
 */
export function DownloadMenu({
  file,
  children,
  align = "end",
}: {
  file: { name: string; url: string };
  /** Le bouton déclencheur. */
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  const { t } = useTranslation();
  const { original, clean, cleanable } = useDownloads(file);

  if (!cleanable) {
    return (
      <span
        className="contents"
        onClick={(event) => {
          event.stopPropagation();
          original();
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onClick={original}>
          <Download className="mr-2 h-4 w-4" />
          {t("gallery.download.original")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void clean()}>
          <Eraser className="mr-2 h-4 w-4" />
          <span className="flex flex-col">
            {t("gallery.download.clean")}
            <span className="text-[11px] text-muted-foreground">{t("gallery.download.clean_hint")}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
