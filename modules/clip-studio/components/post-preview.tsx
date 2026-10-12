"use client";

/**
 * Aperçu d'une publication à la manière du service (dossier 01 ter, § 3.3) :
 * titre et description sous la vidéo pour une plateforme de vidéos, légende
 * sous le média pour un réseau d'images, texte au-dessus pour un fil de
 * messages ; le premier commentaire suit, posé par le compte. Ce n'est pas
 * une copie de l'interface du service : juste l'ordre dans lequel on lira.
 */

import { CalendarClock, MessageCircle } from "lucide-react";
import { AccountAvatar, ServiceLogo } from "@/components/connections/shared";
import { formatSchedule } from "@/components/connections/date-time-picker";
import type { AccountSummary, ConnectorInfo, PublishField } from "@/lib/connections/types";
import { cn } from "@/lib/utils";

export type PreviewLayout = "video" | "caption-below" | "text-above";

/** Disposition connue des services ; sans elle, déduite des champs. */
const LAYOUTS: Record<string, PreviewLayout> = {
  youtube: "video",
  instagram: "caption-below",
  threads: "text-above",
  facebook: "text-above",
  x: "text-above",
};

export function previewLayout(connector: ConnectorInfo, fields: PublishField[]): PreviewLayout {
  const known = LAYOUTS[connector.id];
  if (known) return known;
  const roles = new Set(fields.map((field) => field.role as string | undefined));
  if (roles.has("title")) return "video";
  return roles.has("caption") ? "caption-below" : "text-above";
}

export function PostPreview({
  connector,
  account,
  layout,
  title,
  text,
  firstComment,
  videoUrl,
  coverUrl,
  ratio,
  schedule,
  privacy,
  className,
}: {
  connector: ConnectorInfo;
  account?: Pick<AccountSummary, "displayName" | "avatarUrl" | "logo" | "handle"> | null;
  layout: PreviewLayout;
  title?: string;
  /** Description ou légende, telle qu'elle partira (hashtags compris). */
  text?: string;
  firstComment?: string;
  videoUrl: string;
  coverUrl?: string | null;
  /** Largeur / hauteur de la vidéo. */
  ratio: number;
  schedule?: number | string | null;
  privacy?: string;
  className?: string;
}) {
  const name = account?.displayName ?? connector.label;
  const handle = account?.handle;
  const media = (
    <div className={cn("flex min-w-0 justify-center overflow-hidden bg-black", layout === "video" ? "rounded-lg" : "rounded-md")}>
      <video
        src={`${videoUrl}#t=0.1`}
        poster={coverUrl ?? undefined}
        muted
        playsInline
        preload="metadata"
        controls
        style={{ aspectRatio: `${ratio}`, ["--ratio" as string]: ratio }}
        className="block max-h-80 w-[min(100%,calc(20rem*var(--ratio)))] max-w-full object-contain"
      />
    </div>
  );
  const header = (
    <div className="flex min-w-0 items-center gap-2">
      <AccountAvatar account={{ displayName: name, avatarUrl: account?.avatarUrl, logo: account?.logo ?? connector.logo }} withService className="size-8" />
      <div className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium" title={name}>
          {name}
        </span>
        {handle ? (
          <span className="truncate text-xs text-muted-foreground" title={handle}>
            {handle}
          </span>
        ) : null}
      </div>
    </div>
  );
  const body = (value: string | undefined, clamp: string) =>
    value ? <p className={cn("text-sm whitespace-pre-line [overflow-wrap:anywhere]", clamp)}>{value}</p> : <p className="text-sm text-muted-foreground italic">Aucun texte</p>;

  return (
    <figure className={cn("grid min-w-0 gap-3", className)} aria-label={`Aperçu chez ${connector.label}`}>
      <figcaption className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <ServiceLogo logo={connector.logo} className="size-3.5" />
        <span className="min-w-0 truncate" title={`À la manière de ${connector.label}`}>
          À la manière de {connector.label}
        </span>
        {schedule ? (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <CalendarClock className="size-3.5" />
            {formatSchedule(schedule)}
          </span>
        ) : privacy ? (
          <span className="ml-auto shrink-0">{privacy}</span>
        ) : null}
      </figcaption>

      <div className="grid min-w-0 gap-3 rounded-lg bg-muted/40 p-3">
        {layout === "video" ? (
          <>
            {media}
            <div className="grid min-w-0 gap-2">
              <p className="line-clamp-2 text-base font-semibold [overflow-wrap:anywhere]">{title || <span className="text-muted-foreground">Sans titre</span>}</p>
              {header}
              {body(text, "line-clamp-4 text-muted-foreground")}
            </div>
          </>
        ) : layout === "caption-below" ? (
          <>
            {header}
            {media}
            {text ? (
              <p className="line-clamp-5 text-sm whitespace-pre-line [overflow-wrap:anywhere]">
                <span className="font-semibold">{name}</span> {text}
              </p>
            ) : (
              body(text, "")
            )}
          </>
        ) : (
          <>
            {header}
            {body(text || title, "line-clamp-6")}
            {media}
          </>
        )}

        {firstComment ? (
          <div className="flex min-w-0 items-start gap-2 border-t pt-3">
            <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="grid min-w-0 gap-0.5">
              <span className="truncate text-xs font-medium" title={name}>
                {name} · premier commentaire
              </span>
              <p className="line-clamp-4 text-sm whitespace-pre-line [overflow-wrap:anywhere]">{firstComment}</p>
            </div>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
