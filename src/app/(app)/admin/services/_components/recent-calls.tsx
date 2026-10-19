"use client";

/**
 * Journal des derniers appels, commun à l'onglet de l'écran et au tiroir d'un
 * service : un filtre « Tous / Échecs » (et la fonctionnalité choisie dans le
 * tiroir), puis un tableau compact dont aucune colonne ne s'écrase. Chaque
 * cellule tient sur une ligne et se tronque, le texte entier en infobulle ;
 * les colonnes secondaires (modèle, durée, quantité, service) s'effacent
 * d'elles-mêmes quand la place manque, selon la largeur du tableau et non de
 * l'écran. Le message d'erreur n'est plus dans la ligne : une ligne se clique
 * (ou se choisit au clavier) et ouvre le détail de l'appel, qui l'explique.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, CircleCheck, CircleX, Sparkles, X } from "lucide-react";
import type { AiProviderOverview, AiUsageEvent } from "@/lib/ai-usage/types";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime } from "@/components/connections/shared";
import { cn } from "@/lib/utils";
import { ERROR_KIND_LABELS, errorKindOf, formatDuration, formatFullDate, formatRelativeShort } from "./explain";
import { eventKeys, formatEventAmount, moduleName } from "./format";

export type CallsProvider = Pick<AiProviderOverview, "id" | "label" | "brand" | "kind" | "settingsHref">;

export type CallsFilter = "all" | "failures";

/** Une fonctionnalité choisie dans le tiroir d'un service : le journal ne garde que ses appels. */
export interface FeatureFilter {
  module: string;
  feature: string;
}

const MotionRow = motion.create(TableRow);

/** Clé stable d'un appel, la même pour le tableau et pour l'appel ouvert en détail. */
export function callKey(event: AiUsageEvent): string {
  return `${event.at}:${event.provider}:${event.module}:${event.feature}:${event.amount}`;
}

/** Filtre du journal, sans rendu : testé seul. */
export function filterCalls(events: AiUsageEvent[], filter: CallsFilter, feature?: FeatureFilter | null): AiUsageEvent[] {
  return events.filter((event) => (filter === "all" || !event.ok) && (!feature || (event.module === feature.module && event.feature === feature.feature)));
}

/**
 * Le journal complet : filtre, compteurs, tableau. `onSelect` reçoit l'appel
 * cliqué ; `selected` le surligne tant que son détail est ouvert.
 */
export function RecentCalls({
  events,
  providers,
  showProvider = true,
  label = "Derniers appels",
  hint,
  emptyAll = "Aucun appel noté pour l’instant.",
  feature,
  onClearFeature,
  selected,
  onSelect,
}: {
  events: AiUsageEvent[];
  providers: CallsProvider[];
  /** Colonne du service : inutile dans le tiroir d'un seul service. */
  showProvider?: boolean;
  label?: string;
  /** Phrase à droite des filtres. */
  hint?: string;
  emptyAll?: string;
  feature?: FeatureFilter | null;
  onClearFeature?: () => void;
  selected?: AiUsageEvent | null;
  onSelect: (event: AiUsageEvent) => void;
}) {
  const [filter, setFilter] = useState<CallsFilter>("all");
  const scoped = useMemo(() => filterCalls(events, "all", feature), [events, feature]);
  const failures = scoped.filter((event) => !event.ok).length;
  const visible = useMemo(() => filterCalls(scoped, filter), [scoped, filter]);
  const empty = filter === "failures" ? "Aucun échec parmi ces appels." : feature ? "Aucun appel récent pour cette fonctionnalité." : emptyAll;

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(next) => setFilter((next || "all") as CallsFilter)} aria-label="Filtrer les appels">
            <ToggleGroupItem value="all" className="gap-1.5 px-2.5">
              Tous
              <span className="tabular-nums text-foreground/65">{scoped.length}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="failures" className="gap-1.5 px-2.5" disabled={failures === 0 && filter !== "failures"}>
              Échecs
              <span className="tabular-nums text-foreground/65">{failures}</span>
            </ToggleGroupItem>
          </ToggleGroup>
          {feature ? (
            <span className="flex h-8 max-w-full min-w-0 items-center gap-1 rounded-md bg-muted pr-1 pl-2.5 text-xs">
              <span className="min-w-0 truncate" title={`${feature.feature} · ${moduleName(feature.module)}`}>
                {feature.feature}
              </span>
              {onClearFeature ? (
                <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClearFeature} aria-label="Montrer toutes les fonctionnalités">
                  <X className="size-3.5" />
                </Button>
              ) : null}
            </span>
          ) : null}
        </div>
        {hint ? <span className="min-w-0 text-xs text-pretty text-muted-foreground">{hint}</span> : null}
      </div>
      <RecentCallsTable events={visible} providers={providers} showProvider={showProvider} label={label} empty={empty} selected={selected} onSelect={onSelect} />
    </div>
  );
}

export function RecentCallsTable({
  events,
  providers,
  showProvider = true,
  empty = "Aucun appel noté pour l’instant.",
  label = "Derniers appels",
  selected,
  onSelect,
}: {
  events: AiUsageEvent[];
  providers: CallsProvider[];
  showProvider?: boolean;
  empty?: string;
  label?: string;
  selected?: AiUsageEvent | null;
  onSelect: (event: AiUsageEvent) => void;
}) {
  const keys = eventKeys(events);
  const selectedKey = selected ? callKey(selected) : null;
  const providerOf = (id: AiUsageEvent["provider"]) => providers.find((entry) => entry.id === id);
  const columns = showProvider ? 8 : 7;

  return (
    // Le tableau se règle sur sa propre largeur : le tiroir est étroit même sur un grand écran.
    <div className="@container min-w-0 overflow-hidden rounded-xl border">
      <Table className="table-fixed" aria-label={label}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-24 pl-4 @lg:w-28">Moment</TableHead>
            {showProvider ? <TableHead className="hidden w-40 @3xl:table-cell">Service</TableHead> : null}
            <TableHead>Usage</TableHead>
            <TableHead className="hidden w-36 @5xl:table-cell">Modèle</TableHead>
            <TableHead className="hidden w-32 text-right @lg:table-cell @5xl:w-40">Quantité</TableHead>
            <TableHead className="hidden w-20 text-right @xl:table-cell">Durée</TableHead>
            <TableHead className="w-32 @md:w-36">Issue</TableHead>
            <TableHead className="hidden w-8 pr-3 @sm:table-cell">
              <span className="sr-only">Détail</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : null}
          <AnimatePresence initial={false}>
            {events.map((event, index) => (
              <CallRow
                key={keys[index]}
                event={event}
                provider={providerOf(event.provider)}
                showProvider={showProvider}
                selected={selectedKey === callKey(event)}
                onSelect={() => onSelect(event)}
              />
            ))}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}

function CallRow({
  event,
  provider,
  showProvider,
  selected,
  onSelect,
}: {
  event: AiUsageEvent;
  provider?: CallsProvider;
  showProvider: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const kind = errorKindOf(event);
  const reason = kind ? ERROR_KIND_LABELS[kind] : null;
  const providerLabel = provider?.label ?? event.provider;
  const usage = `${event.feature} · ${moduleName(event.module)}`;
  const amount = formatEventAmount(event);
  const duration = formatDuration(event.durationMs);
  const outcome = event.ok ? "réussi" : `échec, ${reason?.toLocaleLowerCase("fr")}`;

  return (
    <MotionRow
      layout="position"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      data-state={selected ? "selected" : undefined}
      onClick={onSelect}
      className="cursor-pointer hover:bg-muted/40 has-[button:focus-visible]:bg-muted/50 has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-ring"
    >
      <TableCell className="pl-4">
        <span className="block truncate text-xs tabular-nums" title={formatFullDate(event.at)} suppressHydrationWarning>
          {formatRelativeShort(event.at)}
        </span>
      </TableCell>
      {showProvider ? (
        <TableCell className="hidden @3xl:table-cell">
          <span className="flex min-w-0 items-center gap-1.5 text-xs">
            <ProviderMark provider={provider} />
            <span className="min-w-0 truncate" title={providerLabel}>
              {providerLabel}
            </span>
          </span>
        </TableCell>
      ) : null}
      <TableCell>
        {/* Le vrai bouton de la ligne : la souris clique n'importe où, le clavier passe par lui. */}
        <button
          type="button"
          onClick={(click) => {
            click.stopPropagation();
            onSelect();
          }}
          aria-label={`Détail de l’appel : ${event.feature}, ${moduleName(event.module)}${showProvider ? `, ${providerLabel}` : ""}, ${formatDateTime(event.at)}, ${outcome}`}
          aria-haspopup="dialog"
          className="flex w-full min-w-0 items-center gap-1.5 text-left text-sm outline-none"
          title={showProvider ? `${providerLabel} · ${usage}` : usage}
        >
          {showProvider ? <ProviderMark provider={provider} className="@3xl:hidden" /> : null}
          <span className="min-w-0 truncate">
            <span className="font-medium">{event.feature}</span>
            <span className="text-muted-foreground"> · {moduleName(event.module)}</span>
          </span>
        </button>
      </TableCell>
      <TableCell className="hidden @5xl:table-cell">
        <span className="block truncate font-mono text-xs text-muted-foreground" title={event.model}>
          {event.model ?? "–"}
        </span>
      </TableCell>
      <TableCell className="hidden text-right @lg:table-cell">
        <span className="block truncate text-xs tabular-nums" title={amount}>
          {amount}
        </span>
      </TableCell>
      <TableCell className="hidden text-right @xl:table-cell">
        <span className="block truncate text-xs text-muted-foreground tabular-nums">{duration ?? "–"}</span>
      </TableCell>
      <TableCell>
        {event.ok ? (
          <span className="flex min-w-0 items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Réussi</span>
          </span>
        ) : (
          <span className="grid min-w-0 text-xs text-red-700 dark:text-red-400" title={`Échec : ${reason}`}>
            <span className="flex min-w-0 items-center gap-1 font-medium">
              <CircleX className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">Échec</span>
            </span>
            <span className="truncate pl-[1.125rem]">{reason}</span>
          </span>
        )}
      </TableCell>
      <TableCell className="hidden pr-3 @sm:table-cell">
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </TableCell>
    </MotionRow>
  );
}

/** Logo officiel du service, ou une marque neutre s'il n'en a pas. */
export function ProviderMark({ provider, className }: { provider?: Pick<CallsProvider, "label" | "brand">; className?: string }) {
  return provider?.brand ? (
    <BrandLogo brand={provider.brand} className={cn("size-3.5 shrink-0", className)} />
  ) : (
    <Sparkles className={cn("size-3.5 shrink-0 text-muted-foreground", className)} aria-hidden />
  );
}
