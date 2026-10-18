"use client";

/**
 * Les fournisseurs en tableau de données, au dessin des publications d'un
 * compte : recherche, filtres à compteurs, puis une ligne par fournisseur
 * (logo et nom, accès, consommation du mois avec sa jauge, appels, dernière
 * utilisation, modules). Un clic sur une ligne ouvre son détail. Les colonnes
 * secondaires se replient sous le nom sur un écran étroit.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, CircleX, Search, Sparkles, X } from "lucide-react";
import type { AiProviderOverview } from "@/lib/ai-usage/types";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import { ACCESS_LABELS, KIND_LABELS, amountIn, formatAmount, moduleName, needsWatch, primaryUnit } from "./format";
import { AccessPill, MiniGauge } from "./limit-gauge";

export type ProviderFilter = "all" | "used" | "watch" | "unconfigured";

const FILTERS: { value: ProviderFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "used", label: "Utilisés ce mois" },
  { value: "watch", label: "À surveiller" },
  { value: "unconfigured", label: "Non configurés" },
];

export function matchesFilter(provider: AiProviderOverview, filter: ProviderFilter, now = Date.now()): boolean {
  if (filter === "used") return provider.month.calls > 0;
  if (filter === "watch") return provider.limits.some((limit) => needsWatch(limit, now));
  if (filter === "unconfigured") return provider.access === "none";
  return true;
}

const MotionRow = motion.create(TableRow);

export function ProvidersTable({ providers, onOpen }: { providers: AiProviderOverview[]; onOpen: (id: AiProviderOverview["id"]) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProviderFilter>("all");

  const counts = useMemo(() => {
    const now = Date.now();
    return Object.fromEntries(FILTERS.map(({ value }) => [value, providers.filter((provider) => matchesFilter(provider, value, now)).length])) as Record<ProviderFilter, number>;
  }, [providers]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    const now = Date.now();
    return providers
      .filter((provider) => {
        if (!matchesFilter(provider, filter, now)) return false;
        if (!needle) return true;
        const haystack = `${provider.label} ${provider.id} ${KIND_LABELS[provider.kind]} ${ACCESS_LABELS[provider.access]} ${provider.usedBy.map(moduleName).join(" ")}`;
        return haystack.toLocaleLowerCase("fr").includes(needle);
      })
      .sort((a, b) => b.month.calls - a.month.calls || (b.lastCall?.at ?? 0) - (a.lastCall?.at ?? 0) || a.label.localeCompare(b.label, "fr"));
  }, [providers, query, filter]);

  return (
    <section className="grid min-w-0 gap-3" aria-label="Fournisseurs">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <InputGroup className="w-full min-w-0 sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Fournisseur, module" aria-label="Chercher un fournisseur" />
          {query ? (
            <InputGroupAddon align="inline-end">
              <Button variant="ghost" size="icon" className="size-6" aria-label="Effacer la recherche" onClick={() => setQuery("")}>
                <X className="size-3.5" />
              </Button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(next) => setFilter((next || "all") as ProviderFilter)} aria-label="Filtrer les fournisseurs" className="flex-wrap">
          {FILTERS.map(({ value, label }) => (
            <ToggleGroupItem key={value} value={value} className="gap-1.5 px-2.5" disabled={value !== "all" && value !== filter && counts[value] === 0}>
              {value === "watch" ? <span className="size-2 rounded-full bg-amber-500" aria-hidden /> : null}
              {label}
              <span className="tabular-nums text-foreground/65">{counts[value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Fournisseur</TableHead>
              <TableHead className="hidden w-48 md:table-cell">Accès</TableHead>
              <TableHead className="hidden w-52 sm:table-cell">Ce mois-ci</TableHead>
              <TableHead className="hidden w-28 text-right lg:table-cell">Appels</TableHead>
              <TableHead className="hidden w-36 lg:table-cell">Dernier appel</TableHead>
              <TableHead className="hidden w-56 xl:table-cell">Modules</TableHead>
              <TableHead className="w-10 pr-3">
                <span className="sr-only">Détail</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                  {providers.length === 0 ? "Aucun fournisseur n’est suivi." : "Aucun fournisseur ne correspond."}
                </TableCell>
              </TableRow>
            ) : null}
            <AnimatePresence initial={false}>
              {visible.map((provider) => (
                <ProviderRow key={provider.id} provider={provider} onOpen={() => onOpen(provider.id)} />
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function ProviderRow({ provider, onOpen }: { provider: AiProviderOverview; onOpen: () => void }) {
  const unit = primaryUnit(provider);
  const amount = amountIn(provider.month, unit);
  const tightest = provider.limits[0];
  const modules = provider.usedBy.map(moduleName);
  const consumption = (
    <div className="grid min-w-0 gap-1">
      <span className="min-w-0 truncate text-sm tabular-nums" title={formatAmount(amount, unit)}>
        {formatAmount(amount, unit)}
      </span>
      {tightest ? <MiniGauge limit={tightest} className="max-w-40" /> : null}
    </div>
  );

  return (
    <MotionRow
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onClick={onOpen}
      className="cursor-pointer"
    >
      <TableCell className="pl-4 whitespace-normal">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background">
            {provider.brand ? <BrandLogo brand={provider.brand} /> : <Sparkles className="size-4 text-muted-foreground" aria-hidden />}
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            {/* Le nom est le vrai bouton : la ligne entière se clique, le clavier passe par lui. */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              className="min-w-0 truncate text-left text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none"
              title={provider.label}
            >
              {provider.label}
            </button>
            <span className="min-w-0 truncate text-xs text-muted-foreground" title={KIND_LABELS[provider.kind]}>
              {KIND_LABELS[provider.kind]}
            </span>
            {/* Ce que les colonnes masquées ne montrent plus, sous le nom. */}
            <div className="grid min-w-0 gap-1.5 pt-1 xl:hidden">
              <AccessPill access={provider.access} className="md:hidden" />
              <div className="sm:hidden">{consumption}</div>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground lg:hidden">
                {/* Les appels sont déjà la consommation affichée au-dessus quand c'est l'unité du fournisseur. */}
                {unit !== "calls" ? <span className="tabular-nums">{formatAmount(provider.month.calls, "calls")}</span> : null}
                {provider.month.failures ? <span className="text-destructive tabular-nums">{provider.month.failures.toLocaleString("fr-FR")} en échec</span> : null}
                {provider.lastCall ? (
                  <span title={formatDateTime(provider.lastCall.at)} suppressHydrationWarning>
                    {formatRelative(provider.lastCall.at)}
                  </span>
                ) : null}
              </span>
              {modules.length ? (
                <span className="min-w-0 truncate text-xs text-muted-foreground" title={modules.join(", ")}>
                  {modules.join(", ")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden align-top md:table-cell">
        <AccessPill access={provider.access} className="mt-1" />
      </TableCell>
      <TableCell className="hidden align-top sm:table-cell">{consumption}</TableCell>
      <TableCell className="hidden text-right align-top lg:table-cell">
        <span className="block text-sm tabular-nums">{provider.month.calls.toLocaleString("fr-FR")}</span>
        {provider.month.failures ? <span className="block text-xs text-destructive tabular-nums">{provider.month.failures.toLocaleString("fr-FR")} en échec</span> : null}
      </TableCell>
      <TableCell className="hidden align-top lg:table-cell">
        {provider.lastCall ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs" title={`${formatDateTime(provider.lastCall.at)}${provider.lastCall.ok ? "" : ` : ${provider.lastCall.error ?? "échec"}`}`} suppressHydrationWarning>
            {provider.lastCall.ok ? null : <CircleX className="size-3.5 shrink-0 text-destructive" aria-label="En échec" />}
            <span className="min-w-0 truncate" suppressHydrationWarning>
              {formatRelative(provider.lastCall.at)}
            </span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Jamais</span>
        )}
      </TableCell>
      <TableCell className="hidden align-top xl:table-cell">
        {modules.length ? (
          <span className="flex min-w-0 flex-wrap gap-1" title={modules.join(", ")}>
            {modules.slice(0, 3).map((name) => (
              <span key={name} className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[11px]">
                {name}
              </span>
            ))}
            {modules.length > 3 ? <span className="text-[11px] text-muted-foreground">+{modules.length - 3}</span> : null}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">–</span>
        )}
      </TableCell>
      <TableCell className="pr-3 align-top">
        <ChevronRight className="mt-1.5 size-4 text-muted-foreground" aria-hidden />
      </TableCell>
    </MotionRow>
  );
}
