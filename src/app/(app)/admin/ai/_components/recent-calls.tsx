"use client";

/**
 * Journal des derniers appels en tableau compact : moment, fournisseur,
 * module et fonctionnalité, modèle, quantité, issue. Une erreur se lit en
 * entier sous l'usage, jamais rognée. Les appels qui arrivent glissent en
 * tête sans rejouer les autres lignes.
 */

import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleX } from "lucide-react";
import type { AiProviderOverview, AiUsageEvent } from "@/lib/ai-usage/types";
import { BrandLogo } from "@/components/brand-logo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import { cn } from "@/lib/utils";
import { eventKeys, formatEventAmount, moduleName } from "./format";

const MotionRow = motion.create(TableRow);

export function RecentCallsTable({
  events,
  providers,
  showProvider = true,
  empty = "Aucun appel noté pour l’instant.",
  label = "Derniers appels",
}: {
  events: AiUsageEvent[];
  providers: Pick<AiProviderOverview, "id" | "label" | "brand">[];
  /** Colonne du fournisseur : inutile dans le tiroir d'un seul fournisseur. */
  showProvider?: boolean;
  empty?: string;
  label?: string;
}) {
  const keys = eventKeys(events);
  const providerOf = (id: AiUsageEvent["provider"]) => providers.find((entry) => entry.id === id);
  const columns = showProvider ? 6 : 5;

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border">
      <Table className="table-fixed" aria-label={label}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-28 pl-4 sm:w-36">Moment</TableHead>
            {showProvider ? <TableHead className="hidden w-44 sm:table-cell">Fournisseur</TableHead> : null}
            <TableHead>Usage</TableHead>
            <TableHead className={cn("hidden w-40", showProvider ? "xl:table-cell" : "2xl:table-cell")}>Modèle</TableHead>
            <TableHead className={cn("hidden w-36 text-right", showProvider ? "md:table-cell" : "lg:table-cell")}>Quantité</TableHead>
            <TableHead className="w-24 pr-4 text-right sm:w-28">Issue</TableHead>
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
            {events.map((event, index) => {
              const provider = providerOf(event.provider);
              return (
                <MotionRow
                  key={keys[index]}
                  layout="position"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="hover:bg-muted/30"
                >
                  <TableCell className="pl-4 align-top">
                    <span className="block truncate text-xs tabular-nums" title={formatDateTime(event.at)} suppressHydrationWarning>
                      {formatRelative(event.at)}
                    </span>
                  </TableCell>
                  {showProvider ? (
                    <TableCell className="hidden align-top sm:table-cell">
                      <ProviderName provider={provider} fallback={event.provider} />
                    </TableCell>
                  ) : null}
                  <TableCell className="align-top whitespace-normal">
                    <div className="grid min-w-0 gap-0.5">
                      <span className="min-w-0 truncate text-sm" title={`${moduleName(event.module)} · ${event.feature}`}>
                        <span className="font-medium">{event.feature}</span>
                        <span className="text-muted-foreground"> · {moduleName(event.module)}</span>
                      </span>
                      {/* Ce que les colonnes masquées ne montrent plus. */}
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {showProvider ? <ProviderName provider={provider} fallback={event.provider} className="sm:hidden" /> : null}
                        <span className={cn("tabular-nums", showProvider ? "md:hidden" : "lg:hidden")}>{formatEventAmount(event)}</span>
                        {event.model ? (
                          <span className={cn("min-w-0 truncate font-mono text-[11px]", showProvider ? "xl:hidden" : "2xl:hidden")} title={event.model}>
                            {event.model}
                          </span>
                        ) : null}
                      </span>
                      {!event.ok && event.error ? <p className="min-w-0 text-xs text-pretty text-destructive [overflow-wrap:anywhere]">{event.error}</p> : null}
                    </div>
                  </TableCell>
                  <TableCell className={cn("hidden align-top", showProvider ? "xl:table-cell" : "2xl:table-cell")}>
                    <span className="block truncate font-mono text-xs text-muted-foreground" title={event.model}>
                      {event.model ?? "–"}
                    </span>
                  </TableCell>
                  <TableCell className={cn("hidden text-right align-top text-xs whitespace-normal tabular-nums [overflow-wrap:anywhere]", showProvider ? "md:table-cell" : "lg:table-cell")}>
                    {formatEventAmount(event)}
                  </TableCell>
                  <TableCell className="pr-4 text-right align-top">
                    {event.ok ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                        <CircleCheck className="size-3.5 shrink-0" aria-hidden />
                        Réussi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <CircleX className="size-3.5 shrink-0" aria-hidden />
                        Échec
                      </span>
                    )}
                  </TableCell>
                </MotionRow>
              );
            })}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}

function ProviderName({ provider, fallback, className }: { provider?: Pick<AiProviderOverview, "label" | "brand">; fallback: string; className?: string }) {
  const label = provider?.label ?? fallback;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs", className)}>
      {provider?.brand ? <BrandLogo brand={provider.brand} className="size-3.5" /> : null}
      <span className="min-w-0 truncate" title={label}>
        {label}
      </span>
    </span>
  );
}
