"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SOURCES_PATH, SOURCE_ERROR_LEADS, countLabel, languageLabel, sourceErrorDetail, sourceErrorKindOf } from "../../lib/library-helpers";
import type { LinkPreview, SourceErrorKind } from "../../lib/types";
import { SourceName } from "./source-logo";

/** Ce qu'un lien désigne : le site, puis la série, le chapitre, la langue, le crédit et le nombre de pages. */
export function LinkPreviewSummary({ preview, className }: { preview: LinkPreview; className?: string }) {
  const chapter = [preview.chapterNumber ? `Chapitre ${preview.chapterNumber}` : null, preview.chapterTitle ? `« ${preview.chapterTitle} »` : null].filter(Boolean).join(" · ");
  const rows: [string, string | undefined][] = [
    ["Série", preview.series],
    ["Chapitre", chapter || undefined],
    ["Langue", preview.language ? languageLabel(preview.language) : undefined],
    ["Crédit", preview.credit],
    ["Pages", countLabel(preview.pageCount, "page", "pages")],
  ];
  return (
    <div className={cn("flex flex-col gap-2 text-sm", className)}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <SourceName source={preview.source} />
        <span className="text-muted-foreground">reconnaît ce lien.</span>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words tabular-nums">{value}</dd>
            </div>
          ) : null
        )}
      </dl>
    </div>
  );
}

/** L'aperçu avant son arrivée : même gabarit que `LinkPreviewSummary`. */
export function LinkPreviewSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Lecture du lien en cours">
      <Skeleton className="h-4 w-48" />
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {[40, 56, 24, 32, 16].map((width, index) => (
          <div key={index} className="contents">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ce qu'on peut faire de chaque cas, dit une fois, à côté de ce que le serveur explique. */
const ADVICE: Record<SourceErrorKind, string> = {
  unsupported: "Seuls les sites qui ont un adaptateur peuvent être importés par leur lien.",
  "not-a-chapter": "Ouvrez le chapitre sur le site, puis copiez l’adresse de sa page de lecture.",
  disabled: "Tant qu’elle l’est, aucun lien de ce site n’est lu.",
  "not-found": "Vérifiez le lien : le chapitre a pu être retiré du site.",
  unavailable: "Rien n’est tenté pour passer outre. Si vous avez les pages en fichiers, importez-les depuis l’ordinateur.",
  "rate-limited": "Rien n’est relancé tout seul : réessayez plus tard, à la main.",
  "site-error": "Réessayez dans quelques minutes. Si l’erreur revient, le site est peut-être en panne.",
  "adapter-outdated": "Le site a changé sa façon de répondre : l’import par lien reprendra après une mise à jour de l’adaptateur.",
};

interface SourceErrorNoticeProps {
  /** Le message rendu par le serveur. */
  message: string;
  /** Le cas, quand il est connu ; sinon il se lit dans le message. */
  kind?: SourceErrorKind;
  /** `false` sur la page « Sources » elle-même. */
  linkToSources?: boolean;
  className?: string;
}

/** Pourquoi un lien n'a pas pu être traité : le cas, le détail, et quoi faire. */
export function SourceErrorNotice({ message, kind, linkToSources = true, className }: SourceErrorNoticeProps) {
  const resolved = kind ?? sourceErrorKindOf(message);
  if (!resolved) {
    return (
      <p role="alert" className={cn("flex items-start gap-2 text-sm text-destructive", className)}>
        <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </p>
    );
  }
  // Un échec survenu sur ce serveur porte un cas, mais pas la phrase du cas : son message se suffit.
  const hasLead = sourceErrorKindOf(message) === resolved;
  const detail = hasLead ? sourceErrorDetail(message) : message;
  const pointsToSources = linkToSources && (resolved === "unsupported" || resolved === "disabled");
  return (
    <div role="alert" className={cn("flex items-start gap-2 text-sm", className)}>
      <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-col gap-1">
        {hasLead && <p className="font-medium text-destructive">{SOURCE_ERROR_LEADS[resolved]}</p>}
        {detail && <p className={cn("break-words", !hasLead && "text-destructive")}>{detail}</p>}
        <p className="text-muted-foreground">
          {ADVICE[resolved]}
          {pointsToSources && (
            <>
              {" "}
              <Link href={SOURCES_PATH} className="font-medium text-foreground underline underline-offset-2">
                Voir les sites gérés
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
