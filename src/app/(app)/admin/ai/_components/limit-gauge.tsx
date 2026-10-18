"use client";

/**
 * Une limite en jauge, au même dessin que les quotas des comptes connectés :
 * ce qui est consommé sur la limite, la barre (orange à 80 %, rouge à 100 %),
 * le reste, l'échéance et d'où vient le chiffre. Une limite refusée par le
 * service passe en alerte avec le moment de la reprise.
 *
 * Copiée et adaptée de `quota-tab.tsx` plutôt que partagée : l'écran des
 * comptes connectés évolue de son côté.
 */

import { Ban, CircleAlert, CircleCheck, CircleX, Cloud, FileText, HardDrive, RotateCcw, type LucideIcon } from "lucide-react";
import type { AiLimit, AiProviderOverview } from "@/lib/ai-usage/types";
import { BrandLogo } from "@/components/brand-logo";
import { Progress } from "@/components/ui/progress";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import { cn } from "@/lib/utils";
import {
  ACCESS_HINTS,
  ACCESS_LABELS,
  PERIOD_LABELS,
  SOURCE_LABELS,
  formatLimitPart,
  formatNumber,
  formatRemaining,
  formatShare,
  formatUsedOf,
  limitShare,
  limitState,
  type LimitState,
} from "./format";

const STATE_STYLE: Record<LimitState, { label: string; icon: LucideIcon; className: string }> = {
  available: { label: "Disponible", icon: CircleCheck, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  low: { label: "Presque épuisé", icon: CircleAlert, className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  exhausted: { label: "Épuisé", icon: CircleX, className: "bg-destructive/10 text-red-700 dark:text-red-400" },
  blocked: { label: "Refusé", icon: Ban, className: "bg-destructive/10 text-red-700 dark:text-red-400" },
};

/** Couleur de la barre : normale, orange à 80 %, rouge à 100 % ou refusée. */
const BAR_TONE: Record<LimitState, string> = {
  available: "",
  low: "*:data-[slot=progress-indicator]:bg-amber-500",
  exhausted: "*:data-[slot=progress-indicator]:bg-destructive",
  blocked: "*:data-[slot=progress-indicator]:bg-destructive",
};

const SOURCE_ICONS: Record<AiLimit["source"], LucideIcon> = { local: HardDrive, remote: Cloud, plan: FileText };

/** État en pastille : icône et mot, jamais la couleur seule. */
export function LimitStatePill({ state, className }: { state: LimitState; className?: string }) {
  const { label, icon: Icon, className: tone } = STATE_STYLE[state];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** Mini-jauge d'une ligne de tableau : la limite la plus tendue. */
export function MiniGauge({ limit, className }: { limit: AiLimit; className?: string }) {
  const share = limitShare(limit);
  const state = limitState(limit);
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)} title={`${limit.label} : ${formatUsedOf(limit.used, limit.limit, limit.unit)}`}>
      <Progress value={share} aria-label={limit.label} className={cn("h-1.5 min-w-0 flex-1 bg-muted", BAR_TONE[state])} />
      <span className={cn("shrink-0 text-[11px] tabular-nums text-muted-foreground", state !== "available" && "font-medium text-foreground")}>{formatShare(share, limit.used)}</span>
    </span>
  );
}

const ACCESS_TONE: Record<AiProviderOverview["access"], string> = {
  key: "bg-emerald-500",
  env: "bg-emerald-500",
  cli: "bg-emerald-500",
  open: "bg-sky-500",
  none: "bg-muted-foreground/40",
};

/** Accès d'un fournisseur : point de couleur et mot, l'explication en infobulle native. */
export function AccessPill({ access, className }: { access: AiProviderOverview["access"]; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs", access === "none" && "text-muted-foreground", className)} title={ACCESS_HINTS[access]}>
      <span className={cn("size-2 shrink-0 rounded-full", ACCESS_TONE[access])} aria-hidden />
      <span className="truncate">{ACCESS_LABELS[access]}</span>
    </span>
  );
}

/**
 * Une limite en ligne. `provider` nomme le fournisseur (« Lu chez DeepL »,
 * « DeepL refuse… ») ; `withProvider` ajoute son logo et son nom sous le
 * libellé, utile dans la liste de toutes les limites, pas dans son tiroir.
 * `stacked` empile les trois colonnes pour un espace étroit comme le tiroir.
 */
export function LimitRow({
  limit,
  provider,
  sharedWith = [],
  withProvider = true,
  stacked = false,
}: {
  limit: AiLimit;
  provider?: Pick<AiProviderOverview, "label" | "brand">;
  /** Autres fournisseurs soumis à la même limite (plafond commun d'un module). */
  sharedWith?: Pick<AiProviderOverview, "label" | "brand">[];
  withProvider?: boolean;
  stacked?: boolean;
}) {
  const share = limitShare(limit);
  const state = limitState(limit);
  const remaining = Math.max(0, limit.limit - limit.used);
  const SourceIcon = SOURCE_ICONS[limit.source];
  const source = SOURCE_LABELS[limit.source];
  return (
    <div
      data-slot="limit-row"
      className={cn("grid min-w-0 grid-cols-1 gap-x-6 gap-y-2.5 px-4 py-3.5", !stacked && "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,1.6fr)] md:items-center")}
    >
      <div className="grid min-w-0 gap-1">
        <span className="min-w-0 truncate text-sm font-medium" title={limit.label}>
          {limit.label}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {provider && withProvider ? (
            <>
              {[provider, ...sharedWith].map((entry) =>
                entry.brand ? <BrandLogo key={entry.label} brand={entry.brand} className="size-3.5 shrink-0" /> : null
              )}
              <span className="min-w-0 truncate font-medium text-foreground/80" title={[provider, ...sharedWith].map((entry) => entry.label).join(", ")}>
                {[provider, ...sharedWith].map((entry) => entry.label).join(", ")}
              </span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span className="shrink-0">{PERIOD_LABELS[limit.period]}</span>
        </span>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm tabular-nums">
          <span className="min-w-0 truncate" title={formatUsedOf(limit.used, limit.limit, limit.unit)}>
            <span className="font-semibold">{formatNumber(limit.used)}</span>
            <span className="text-muted-foreground"> / {formatLimitPart(limit.limit, limit.unit)}</span>
          </span>
          <span className={cn("shrink-0 text-xs text-muted-foreground", state !== "available" && "font-medium text-foreground")}>{formatShare(share, limit.used)}</span>
        </div>
        <Progress
          value={share}
          aria-label={limit.label}
          getValueLabel={() => formatUsedOf(limit.used, limit.limit, limit.unit)}
          className={cn("h-2 bg-muted", BAR_TONE[state])}
        />
        <span className={cn("min-w-0 text-xs text-muted-foreground tabular-nums", remaining === 0 && "font-medium text-destructive")}>
          {remaining === 0 ? "Plus rien de disponible" : formatRemaining(remaining, limit.unit)}
        </span>
      </div>

      <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5", !stacked && "md:grid md:justify-items-start md:gap-1.5")}>
        <LimitStatePill state={state} />
        {limit.resetsAt ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={formatDateTime(limit.resetsAt)} suppressHydrationWarning>
            <RotateCcw className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate" suppressHydrationWarning>
              Remis à zéro {formatRelative(limit.resetsAt)}
            </span>
          </span>
        ) : null}
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={source.hint}>
          <SourceIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{limit.source === "remote" && provider ? `Lu chez ${provider.label}` : source.label}</span>
        </span>
      </div>

      {state === "blocked" && limit.blockedUntil ? (
        <p role="alert" className={cn("flex min-w-0 items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive", !stacked && "md:col-span-3")} suppressHydrationWarning>
          <Ban className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 text-pretty [overflow-wrap:anywhere]" suppressHydrationWarning>
            {provider ? `${provider.label} refuse` : "Le service refuse"} les appels, quota épuisé, jusqu’au {formatDateTime(limit.blockedUntil)} ({formatRelative(limit.blockedUntil)}).
          </span>
        </p>
      ) : null}
      {limit.note ? (
        <p className={cn("min-w-0 text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]", !stacked && "md:col-span-3")}>{limit.note}</p>
      ) : null}
    </div>
  );
}
