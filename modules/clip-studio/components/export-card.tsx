"use client";

/**
 * Carte d'un export : vignette (couverture, sinon la vidéo qui se lit au
 * survol), nom, durée, poids et, quand on les connaît, les services où il a
 * été publié. Un clic ouvre sa fiche ; le menu contextuel garde les gestes
 * rapides. Ces gestes n'ont pas d'autre endroit où répondre : leurs échecs
 * passent par un toast ; une suppression réussie se voit (la carte part).
 */

import Link from "next/link";
import { CalendarClock, Download, FileVideo, ImageUp, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ServiceLogo } from "@/components/connections/shared";
import { errorMessage } from "@/components/feedback";
import type { ConnectorInfo, PublishJobSummary } from "@/lib/connections/types";
import type { ClipExport } from "../engine/types";
import { callModule, exportUrl, formatMegabytes, sendExportToGallery } from "../lib/client";

export const exportHref = (id: string) => `/m/clip-studio/exports?id=${encodeURIComponent(id)}`;
export const publishHref = (id: string) => `/m/clip-studio/publish?export=${encodeURIComponent(id)}`;

/** Où en sont les publications d'un export : services publiés, programmés. */
export function publicationSummary(jobs: PublishJobSummary[] | undefined) {
  const published = new Set<string>();
  const scheduled = new Set<string>();
  for (const job of jobs ?? []) {
    if (job.result || job.state === "done") published.add(job.connector);
    else if (job.state === "queued" && job.publishAt) scheduled.add(job.connector);
  }
  return { published: [...published], scheduled: [...scheduled].filter((id) => !published.has(id)) };
}

export function ExportCard({
  entry,
  jobs,
  connectors,
  canPublish,
  onChanged,
}: {
  entry: ClipExport;
  /** Publications de l'export ; absentes : inconnues (non administrateur). */
  jobs?: PublishJobSummary[];
  connectors?: ConnectorInfo[];
  canPublish?: boolean;
  onChanged: () => void;
}) {
  const url = exportUrl(entry.file);
  const href = exportHref(entry.id);
  const summary = publicationSummary(jobs);
  const logoOf = (id: string) => connectors?.find((connector) => connector.id === id);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link href={href} aria-label={`Ouvrir la fiche de ${entry.projectName}`} className="group flex w-full min-w-0 flex-col gap-1.5 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            {entry.cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- couverture du module, déjà réduite
              <img src={exportUrl(entry.cover.file)} alt="" className="size-full object-contain" />
            ) : (
              <video
                src={url}
                muted
                loop
                playsInline
                preload="metadata"
                onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
                onMouseLeave={(event) => {
                  event.currentTarget.pause();
                  event.currentTarget.currentTime = 0;
                }}
                className="size-full object-contain"
              />
            )}
            {summary.published.length > 0 || summary.scheduled.length > 0 ? (
              <span className="absolute top-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-full bg-background/90 px-1.5 py-0.5 backdrop-blur">
                {summary.published.map((id) => {
                  const connector = logoOf(id);
                  return connector ? <ServiceLogo key={id} logo={connector.logo} className="size-3.5" /> : null;
                })}
                {summary.scheduled.length > 0 ? <CalendarClock className="size-3.5 text-muted-foreground" aria-label="Programmé" /> : null}
              </span>
            ) : null}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="truncate px-0.5 text-xs font-medium group-hover:underline">{entry.projectName}</p>
            </TooltipTrigger>
            <TooltipContent className="max-w-80 [overflow-wrap:anywhere]">{entry.projectName}</TooltipContent>
          </Tooltip>
          <p className="truncate px-0.5 text-[11px] text-muted-foreground tabular-nums">
            {Math.round(entry.durationMs / 1000)}&nbsp;s · {formatMegabytes(entry.sizeBytes)} · {new Date(entry.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </p>
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem asChild>
          <Link href={href}>
            <FileVideo className="mr-2 size-4" />
            Ouvrir la fiche
          </Link>
        </ContextMenuItem>
        {canPublish ? (
          <ContextMenuItem asChild>
            <Link href={publishHref(entry.id)}>
              <Send className="mr-2 size-4" />
              Publier
            </Link>
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem asChild>
          <a href={url} download={`${entry.projectName}.mp4`}>
            <Download className="mr-2 size-4" />
            Télécharger
          </a>
        </ContextMenuItem>
        <ContextMenuItem asChild>
          <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(entry.projectId)}`}>Ouvrir le projet</Link>
        </ContextMenuItem>
        {entry.galleryFile ? (
          <ContextMenuItem asChild>
            <Link href="/gallery">
              <ImageUp className="mr-2 size-4" />
              Voir dans la galerie
            </Link>
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            onClick={async () => {
              try {
                await sendExportToGallery(entry.id);
                toast.success("Clip ajouté à la galerie.");
                onChanged();
              } catch (error) {
                toast.error(errorMessage(error, "L’envoi dans la galerie a échoué. Réessayez."));
              }
            }}
          >
            <ImageUp className="mr-2 size-4" />
            Envoyer dans la galerie
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={async () => {
            try {
              await callModule("deleteExport", entry.id);
              onChanged();
            } catch (error) {
              toast.error(errorMessage(error, "L’export n’a pas pu être supprimé. Réessayez."));
            }
          }}
        >
          <Trash2 className="mr-2 size-4" />
          Supprimer l’export
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
