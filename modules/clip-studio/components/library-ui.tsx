"use client";

/**
 * Pièces communes à l'accueil, aux projets et aux exports : logos des
 * services où un export est publié (quatre au plus, puis « +2 »), affiche
 * d'un export, puce de format, marque, tri d'une colonne et pagination.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarClock, ChevronLeft, ChevronRight, ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ServiceLogo, formatRelative } from "@/components/connections/shared";
import { cn } from "@/lib/utils";
import type { ClipExport } from "../engine/types";
import { exportUrl, type BrandKitChoice, type PublicationAccount } from "../lib/client";
import { ASPECT_LABELS, CHANNEL_STATE_LABELS, aspectOf, type ChannelState, type PublicationRow } from "../lib/library";

// ─── Formats ─────────────────────────────────────────────────────

/** « 0:42 », « 12:05 » ; une heure et plus : « 1:02:03 ». */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function formatShortDate(at: number): string {
  return new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: new Date(at).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** Nombre court : « 1 234 », « 12,5 k ». */
export function formatCount(value: number | undefined): string {
  if (value === undefined) return "–";
  return value.toLocaleString("fr-FR", { notation: value >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 });
}

export { formatRelative };

/** Puce du format d'un clip : « 9:16 », lisible sur une vignette. */
export function AspectChip({ width, height, className }: { width: number; height: number; className?: string }) {
  const aspect = aspectOf(width, height);
  return (
    <span
      title={aspect ? ASPECT_LABELS[aspect] : `${width} × ${height}`}
      className={cn("inline-flex shrink-0 items-center rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground tabular-nums backdrop-blur", className)}
    >
      {aspect ?? `${width}×${height}`}
    </span>
  );
}

// ─── Marque ──────────────────────────────────────────────────────

/** Marque d'un projet ou d'un export : son logo (sinon sa couleur) et son nom. */
export function BrandName({ kit, id, compact = false, className }: { kit?: BrandKitChoice | null; id?: string; compact?: boolean; className?: string }) {
  if (!id) return null;
  const name = kit?.name ?? "Marque introuvable";
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)} title={name}>
      {kit?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo de la marque, déjà petit
        <img src={kit.logoUrl} alt="" loading="lazy" className="size-4 shrink-0 rounded-sm object-contain" />
      ) : (
        <span className="size-3 shrink-0 rounded-full ring-1 ring-border" style={{ background: kit?.palette.accent ?? "var(--muted-foreground)" }} aria-hidden />
      )}
      {compact ? <span className="sr-only">{name}</span> : <span className="min-w-0 truncate">{name}</span>}
    </span>
  );
}

// ─── Services où l'export est publié ─────────────────────────────

export interface ConnectorBadge {
  id: string;
  label: string;
  logo: string;
}

const STATE_DOT: Partial<Record<ChannelState, string>> = {
  failed: "bg-destructive",
  pending: "bg-amber-500 animate-pulse",
};

/**
 * Logos des comptes où un export est parti : quatre au plus, puis « +2 ».
 * Un envoi programmé porte une horloge, un échec un point rouge, un envoi en
 * cours un point ambré ; le détail est dans l'infobulle.
 */
export function ChannelLogos({
  rows,
  connectors,
  accounts,
  max = 4,
  className,
}: {
  rows: PublicationRow[];
  connectors: ConnectorBadge[];
  accounts?: PublicationAccount[];
  max?: number;
  className?: string;
}) {
  const shown = rows.filter((row) => row.state !== "cancelled");
  if (shown.length === 0) return null;
  const visible = shown.slice(0, max);
  const rest = shown.length - visible.length;
  const connectorOf = (id: string) => connectors.find((entry) => entry.id === id);
  const label = (row: PublicationRow) => {
    const account = accounts?.find((entry) => entry.id === row.accountId);
    const service = connectorOf(row.connector)?.label ?? row.connector;
    return `${service}${account ? ` · ${account.displayName}` : ""} – ${CHANNEL_STATE_LABELS[row.state].toLowerCase()}${row.state === "scheduled" && row.publishAt ? ` pour le ${formatShortDate(row.publishAt)}` : ""}`;
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex min-w-0 shrink-0 items-center gap-1", className)} aria-label={shown.map(label).join(" ; ")}>
          {visible.map((row) => {
            const connector = connectorOf(row.connector);
            return (
              <span key={row.accountId} className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
                {connector ? <ServiceLogo logo={connector.logo} className="size-3.5" /> : <span className="size-2 rounded-full bg-muted-foreground" />}
                {row.state === "scheduled" ? (
                  <CalendarClock className="absolute -right-1 -bottom-1 size-3 rounded-full bg-background text-primary" aria-hidden />
                ) : STATE_DOT[row.state] ? (
                  <span className={cn("absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background", STATE_DOT[row.state])} aria-hidden />
                ) : null}
              </span>
            );
          })}
          {rest > 0 ? <span className="text-[11px] font-medium text-muted-foreground tabular-nums">+{rest}</span> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        <ul className="grid gap-0.5 text-xs [overflow-wrap:anywhere]">
          {shown.map((row) => (
            <li key={row.accountId}>{label(row)}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Affiche d'un export ─────────────────────────────────────────

/**
 * Affiche d'un export : sa couverture, sinon la première image de la vidéo,
 * qui se lit sans le son au survol.
 */
export function ExportPoster({ entry, className, playOnHover = true }: { entry: Pick<ClipExport, "file" | "cover">; className?: string; playOnHover?: boolean }) {
  if (entry.cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- couverture du module, déjà réduite
      <img src={exportUrl(entry.cover.file)} alt="" loading="lazy" className={cn("size-full object-contain", className)} />
    );
  }
  return (
    <video
      src={`${exportUrl(entry.file)}#t=0.5`}
      muted
      loop
      playsInline
      preload="metadata"
      onMouseEnter={playOnHover ? (event) => void event.currentTarget.play().catch(() => undefined) : undefined}
      onMouseLeave={
        playOnHover
          ? (event) => {
              event.currentTarget.pause();
              event.currentTarget.currentTime = 0.5;
            }
          : undefined
      }
      className={cn("size-full object-contain", className)}
    />
  );
}

// ─── Tableau ─────────────────────────────────────────────────────

export function SortButton({ label, active, desc, onClick, align }: { label: string; active: boolean; desc: boolean; onClick: () => void; align?: "right" }) {
  const Icon = desc ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground", align === "right" && "flex-row-reverse")}
    >
      {label}
      <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-0")} aria-hidden />
    </button>
  );
}

/** Pagination : « 25–48 sur 130 », page précédente et suivante, chaque page étant une adresse. */
export function Pager({ page, pageCount, total, pageSize, hrefFor, onPage, noun }: { page: number; pageCount: number; total: number; pageSize: number; hrefFor: (page: number) => string; onPage?: () => void; noun: string }) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const pages = pageWindow(page, pageCount);
  return (
    <nav aria-label={`Pages des ${noun}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground tabular-nums">
        {first.toLocaleString("fr-FR")}–{last.toLocaleString("fr-FR")} sur {total.toLocaleString("fr-FR")} {noun}
      </span>
      {pageCount > 1 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <PageLink href={hrefFor(page - 1)} disabled={page <= 1} label="Page précédente" onPage={onPage}>
            <ChevronLeft className="size-4" />
          </PageLink>
          {pages.map((entry, index) =>
            entry === null ? (
              <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <Button key={entry} asChild variant={entry === page ? "secondary" : "ghost"} size="sm" className="h-8 min-w-8 px-2 tabular-nums">
                <Link href={hrefFor(entry)} scroll={false} onClick={onPage} aria-current={entry === page ? "page" : undefined} aria-label={`Page ${entry}`}>
                  {entry}
                </Link>
              </Button>
            )
          )}
          <PageLink href={hrefFor(page + 1)} disabled={page >= pageCount} label="Page suivante" onPage={onPage}>
            <ChevronRight className="size-4" />
          </PageLink>
        </div>
      ) : null}
    </nav>
  );
}

function PageLink({ href, disabled, label, children, onPage }: { href: string; disabled: boolean; label: string; children: React.ReactNode; onPage?: () => void }) {
  if (disabled) {
    return (
      <Button variant="outline" size="icon" className="size-8" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="icon" className="size-8">
      <Link href={href} scroll={false} onClick={onPage} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}

/** Pages montrées : la première, la dernière, et deux de chaque côté de la page en cours ; `null` marque un saut. */
export function pageWindow(page: number, pageCount: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let entry = 1; entry <= pageCount; entry++) {
    if (entry === 1 || entry === pageCount || Math.abs(entry - page) <= 1) out.push(entry);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

// ─── Filtres ─────────────────────────────────────────────────────

/**
 * Rangée de filtres : en ligne sur un écran large ; sur un téléphone, un
 * bouton « Filtres » (avec le nombre de filtres posés) ouvre un tiroir où
 * ils s'empilent sur toute la largeur, au lieu de six listes l'une sous
 * l'autre avant le premier élément.
 */
export function FiltersBar({ children, activeCount, onClear }: { children: ReactNode; activeCount: number; onClear?: () => void }) {
  const [open, setOpen] = useState(false);
  const clear = onClear ? (
    <Button variant="ghost" size="sm" className="gap-1.5" onClick={onClear}>
      <X className="size-3.5" />
      Retirer les filtres
    </Button>
  ) : null;
  return (
    <>
      <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">
        {children}
        {clear}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 md:hidden">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <ListFilter className="size-3.5" />
          Filtres{activeCount > 0 ? <span className="tabular-nums"> ({activeCount})</span> : null}
        </Button>
        {clear}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filtres</SheetTitle>
            <SheetDescription>Chaque filtre s’applique aussitôt ; l’adresse les garde.</SheetDescription>
          </SheetHeader>
          <div className="grid min-w-0 gap-2 px-4 pb-6 [&_[data-slot=select-trigger]]:w-full">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
