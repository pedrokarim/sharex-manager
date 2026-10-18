"use client";

/**
 * Pièces communes des onglets de l'écran Sécurité : état d'un point de
 * contrôle, ligne de réglage, curseur à paliers, pied d'enregistrement,
 * erreur et squelettes dans un panneau, pagination, avatar d'un compte.
 */

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Info, OctagonAlert, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { FormStatus, type Feedback } from "@/components/feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SliderWithStops } from "@/components/ui/slider-with-stops";
import { Switch } from "@/components/ui/switch";
import { PanelBody, PanelFooter } from "@/components/connections/panel";
import type { CheckStatus } from "@/lib/security/checks";
import { cn } from "@/lib/utils";

// ─── État d'un point de contrôle ──────────────────────────────────

export const CHECK_STATUS: Record<CheckStatus, { label: string; icon: LucideIcon; mark: string; text: string }> = {
  problem: { label: "Problème", icon: OctagonAlert, mark: "bg-destructive/10 text-red-700 dark:text-red-400", text: "text-red-700 dark:text-red-400" },
  warning: { label: "À revoir", icon: TriangleAlert, mark: "bg-amber-500/10 text-amber-700 dark:text-amber-400", text: "text-amber-700 dark:text-amber-400" },
  info: { label: "Information", icon: Info, mark: "bg-muted text-muted-foreground", text: "text-muted-foreground" },
  ok: { label: "En ordre", icon: CircleCheck, mark: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", text: "text-emerald-700 dark:text-emerald-400" },
};

/** Icône d'état dans un carré teinté ; le mot est lu par les lecteurs d'écran. */
export function StatusMark({ status, className }: { status: CheckStatus; className?: string }) {
  const { icon: Icon, label, mark } = CHECK_STATUS[status];
  return (
    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", mark, className)}>
      <Icon aria-hidden className="size-4" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

// ─── Comptes ──────────────────────────────────────────────────────

export function initials(name: string): string {
  const parts = name
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** « demo@local.sharex-manager » (adresse synthétique des comptes locaux) devient « demo ». */
export function displayAccount(value: string | null | undefined): string {
  if (!value) return "Compte inconnu";
  return value.endsWith("@local.sharex-manager") ? value.slice(0, -"@local.sharex-manager".length) : value;
}

export function UserAvatar({ name, admin, className }: { name: string; admin?: boolean; className?: string }) {
  return (
    <Avatar size="sm" className={cn("size-7", className)}>
      <AvatarFallback className={cn("text-[10px] font-semibold", admin ? "bg-primary/10 text-primary" : "bg-muted text-foreground/75")}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

// ─── Lignes de réglage ────────────────────────────────────────────

/**
 * Une ligne de réglage : nom et valeur retenue sur la même ligne, une phrase
 * d'aide, puis le contrôle. Une erreur de saisie s'affiche sous le contrôle.
 */
export function SettingRow({
  id,
  label,
  description,
  value,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  /** Valeur retenue, en clair (« 7 jours »), alignée à droite du nom. */
  value?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="group" aria-labelledby={`${id}-label`} className={cn("grid min-w-0 gap-3 px-4 py-4", className)}>
      <div className="grid min-w-0 gap-0.5">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <span id={`${id}-label`} className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
            {label}
          </span>
          {value !== undefined ? <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span> : null}
        </div>
        {description ? <p className="text-xs text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {children}
      {error ? (
        <p role="alert" className="flex min-w-0 items-start gap-1.5 text-xs text-red-700 dark:text-red-400">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 text-pretty">{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Un réglage tout ou rien : nom et phrase à gauche, interrupteur à droite ; toute la ligne se clique. */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className={cn("grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 px-4 py-3.5 transition-colors hover:bg-muted/30", disabled && "cursor-not-allowed")}>
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm font-medium [overflow-wrap:anywhere]">{label}</span>
        <span className="text-xs text-pretty text-muted-foreground">{description}</span>
      </span>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}

/** Indice du palier le plus proche d'une valeur (une valeur hors paliers se place au plus près). */
export function nearestStop(stops: readonly number[], value: number): number {
  let best = 0;
  for (let index = 1; index < stops.length; index += 1) {
    if (Math.abs(stops[index] - value) < Math.abs(stops[best] - value)) best = index;
  }
  return best;
}

/**
 * Curseur à paliers régulièrement espacés, quelle que soit leur valeur
 * (1, 7, 14, 30 jours) : le curseur porte l'indice du palier, la valeur
 * retenue est celle du palier.
 */
export function StopsSlider({
  stops,
  value,
  onChange,
  format,
  label,
  disabled,
}: {
  stops: readonly number[];
  value: number;
  onChange: (value: number) => void;
  /** Libellé court d'un palier (« 7 j »). */
  format: (value: number) => string;
  label: string;
  disabled?: boolean;
}) {
  const index = nearestStop(stops, value);
  return (
    <div className="px-1">
      <SliderWithStops
        min={0}
        max={stops.length - 1}
        step={1}
        stops={stops.map((_, position) => position)}
        formatStop={(position) => format(stops[position])}
        value={[index]}
        onValueChange={([position]) => onChange(stops[position])}
        aria-label={label}
        valueText={format(value)}
        disabled={disabled}
      />
    </div>
  );
}

/** Pied d'un panneau de réglages : le retour de l'enregistrement au-dessus, la note et les boutons dans le pied. */
export function SettingsFooter({
  form,
  note,
  blocked,
}: {
  form: { dirty: boolean; saving: boolean; feedback: Feedback; reset: () => void; save: () => Promise<void> };
  note?: ReactNode;
  /** Saisie incohérente : enregistrer est impossible tant qu'elle n'est pas corrigée. */
  blocked?: boolean;
}) {
  return (
    <>
      <FormStatus state={form.feedback.state} className="px-4 pb-3" />
      <PanelFooter className="mt-auto justify-between">
        <span className="min-w-0 flex-1 basis-40 text-pretty">{note}</span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {form.dirty ? (
            <Button variant="ghost" size="sm" className="h-8" disabled={form.saving} onClick={form.reset}>
              Annuler
            </Button>
          ) : null}
          <Button size="sm" className="h-8" loading={form.saving} disabled={!form.dirty || blocked} onClick={() => void form.save()}>
            Enregistrer
          </Button>
        </div>
      </PanelFooter>
    </>
  );
}

// ─── Chargement et erreur dans un panneau ─────────────────────────

export function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PanelBody>
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Lecture impossible</AlertTitle>
        <AlertDescription>
          <p className="break-words">{message}</p>
          <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={onRetry}>
            <RefreshCw />
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    </PanelBody>
  );
}

/** Lignes en attente, à la forme d'une ligne de panneau : icône, deux lignes de texte, un geste. */
export function RowsSkeleton({ rows = 4, action = true }: { rows?: number; action?: boolean }) {
  return (
    <div className="divide-y" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex min-w-0 items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-7 shrink-0 rounded-md" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          {action ? <Skeleton className="hidden h-7 w-20 shrink-0 rounded-md sm:block" /> : null}
        </div>
      ))}
    </div>
  );
}

/** Lignes de réglage en attente. */
export function SettingsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="divide-y" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid gap-3 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────

export const PAGE_SIZE = 20;

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total === 0) return null;
  return (
    <PanelFooter className="justify-between">
      <span className="tabular-nums">
        {(page * PAGE_SIZE + 1).toLocaleString("fr-FR")}–{Math.min(total, (page + 1) * PAGE_SIZE).toLocaleString("fr-FR")} sur {total.toLocaleString("fr-FR")}
      </span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-7" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Page précédente">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-12 text-center tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button variant="outline" size="icon" className="size-7" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} aria-label="Page suivante">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </PanelFooter>
  );
}

/** Nombre de pages pour `total` lignes, et la page courante ramenée dans les bornes. */
export function clampPage(page: number, total: number): number {
  return Math.min(page, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
}

// ─── Durées ───────────────────────────────────────────────────────

export function daysLabel(days: number): string {
  if (days === 365) return "1 an";
  return `${days.toLocaleString("fr-FR")} jour${days > 1 ? "s" : ""}`;
}

export function shortDays(days: number): string {
  return days === 365 ? "1 an" : `${days} j`;
}

export function hoursLabel(hours: number): string {
  if (hours % 24 === 0 && hours >= 48) return `${hours / 24} jours`;
  return `${hours} heure${hours > 1 ? "s" : ""}`;
}

export function minutesLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} heure${hours > 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}
