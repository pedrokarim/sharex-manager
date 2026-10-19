"use client";

/**
 * Ce qui va manquer : toutes les limites de tous les fournisseurs, en jauges
 * alignées, de la plus tendue à la plus large. Une limite refusée par le
 * service passe devant. Au-delà de quelques lignes, la suite se déplie : ce
 * qui compte reste en haut de l'écran.
 */

import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Gauge } from "lucide-react";
import type { AiLimit, AiProviderOverview } from "@/lib/ai-usage/types";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelRows } from "@/components/connections/panel";
import { cn } from "@/lib/utils";
import { compareLimits, isBlocked, limitShare, LOW_SHARE } from "./format";
import { LimitRow, LimitStatePill } from "./limit-gauge";

/** Lignes montrées avant « Afficher les autres » quand rien n'est tendu ; ce qui l'est se montre toujours. */
const VISIBLE_LIMITS = 3;

export interface LimitEntry {
  provider: Pick<AiProviderOverview, "id" | "label" | "brand">;
  /** Autres fournisseurs soumis à la même limite : un plafond commun ne s'affiche qu'une fois. */
  sharedWith: Pick<AiProviderOverview, "id" | "label" | "brand">[];
  limit: AiLimit;
}

/** Toutes les limites, la plus urgente d'abord, chaque limite commune à plusieurs fournisseurs une seule fois. */
export function sortedLimits(providers: AiProviderOverview[], now = Date.now()): LimitEntry[] {
  const byLimit = new Map<string, LimitEntry>();
  for (const provider of providers) {
    for (const limit of provider.limits) {
      const key = `${limit.id}|${limit.used}|${limit.limit}`;
      const entry = byLimit.get(key);
      if (entry) entry.sharedWith.push(provider);
      else byLimit.set(key, { provider, sharedWith: [], limit });
    }
  }
  return [...byLimit.values()].sort((a, b) => compareLimits(a.limit, b.limit, now) || a.provider.label.localeCompare(b.provider.label, "fr"));
}

export function LimitsPanel({ providers, onOpenProvider }: { providers: AiProviderOverview[]; onOpenProvider: (id: AiProviderOverview["id"]) => void }) {
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const entries = useMemo(() => sortedLimits(providers), [providers]);
  const blocked = entries.filter((entry) => isBlocked(entry.limit)).length;
  const exhausted = entries.filter((entry) => !isBlocked(entry.limit) && limitShare(entry.limit) >= 100).length;
  const low = entries.filter((entry) => !isBlocked(entry.limit) && limitShare(entry.limit) >= LOW_SHARE && limitShare(entry.limit) < 100).length;
  const visible = Math.max(VISIBLE_LIMITS, blocked + exhausted + low);
  const shown = expanded ? entries : entries.slice(0, visible);
  const hidden = entries.length - shown.length;

  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader
        icon={Gauge}
        title="Limites"
        titleId={titleId}
        description="Quotas, offres gratuites et plafonds de tous les fournisseurs, du plus entamé au plus large."
        actions={
          entries.length ? (
            <>
              {blocked ? <SummaryCount count={blocked} one="refusée par le service" many="refusées par le service" tone="text-red-700 dark:text-red-400" /> : null}
              {exhausted ? <SummaryCount count={exhausted} one="épuisée" many="épuisées" tone="text-red-700 dark:text-red-400" /> : null}
              {low ? <SummaryCount count={low} one="presque épuisée" many="presque épuisées" tone="text-amber-700 dark:text-amber-400" /> : null}
              {!blocked && !exhausted && !low ? <LimitStatePill state="available" /> : null}
            </>
          ) : null
        }
      />
      {entries.length === 0 ? (
        <PanelBody className="grid justify-items-center gap-1 py-8 text-center">
          <p className="text-sm font-medium">Aucune limite connue</p>
          <p className="max-w-md text-xs text-pretty text-muted-foreground">
            Aucun fournisseur n’annonce de quota ni de plafond pour l’instant. Les appels restent comptés dans le tableau ci-dessous.
          </p>
        </PanelBody>
      ) : (
        <PanelRows>
          <AnimatePresence initial={false}>
            {shown.map((entry) => (
              // Une ligne entière se clique ; une `div` et non un `button`,
              // car la jauge contient des blocs qu'un bouton n'admet pas.
              <motion.div
                key={`${entry.provider.id}:${entry.limit.id}`}
                role="button"
                tabIndex={0}
                layout="position"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                onClick={() => onOpenProvider(entry.provider.id)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onOpenProvider(entry.provider.id);
                }}
                aria-label={`${entry.limit.label}, ${entry.provider.label} : ouvrir le détail`}
                className="block w-full min-w-0 cursor-pointer text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <LimitRow limit={entry.limit} provider={entry.provider} sharedWith={entry.sharedWith} />
              </motion.div>
            ))}
          </AnimatePresence>
        </PanelRows>
      )}
      {entries.length ? (
        <PanelFooter className="justify-between">
          <span className="min-w-0 text-pretty">« Compté ici » ne voit que les appels de l’application ; un solde lu chez le service fait foi.</span>
          {entries.length > visible ? (
            <Button variant="ghost" size="sm" className="-my-1 h-7 gap-1.5" onClick={() => setExpanded((now) => !now)} aria-expanded={expanded}>
              <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
              {expanded ? "Ne montrer que les plus tendues" : `Afficher ${hidden === 1 ? "l’autre limite" : `les ${hidden} autres limites`}`}
            </Button>
          ) : null}
        </PanelFooter>
      ) : null}
    </Panel>
  );
}

function SummaryCount({ count, one, many, tone }: { count: number; one: string; many: string; tone: string }) {
  return (
    <span className={cn("text-xs font-medium whitespace-nowrap tabular-nums", tone)}>
      {count.toLocaleString("fr-FR")} {count > 1 ? many : one}
    </span>
  );
}
