"use client";

/**
 * Détail d'un fournisseur dans un tiroir : son accès et où le régler, ses
 * limites (et la lecture du solde chez lui quand il le permet), ses trente
 * derniers jours, la répartition par module et ses derniers appels. Le
 * résultat d'une lecture de solde s'affiche dans le tiroir, à côté du bouton.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Cloud, Settings2, Sparkles, X } from "lucide-react";
import type { AiProviderOverview, AiUsageEvent } from "@/lib/ai-usage/types";
import { ActionStatus, useFeedback } from "@/components/feedback";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import { KIND_LABELS, amountIn, formatAmount, moduleName, primaryUnit } from "./format";
import { AccessPill, LimitRow } from "./limit-gauge";
import { RecentCallsTable } from "./recent-calls";
import { UsageChart } from "./usage-chart";

export function ProviderSheet({
  provider,
  recent,
  onOpenChange,
  onReadRemote,
}: {
  provider: AiProviderOverview | null;
  /** Derniers appels, tous fournisseurs : le tiroir garde ceux du sien. */
  recent: AiUsageEvent[];
  onOpenChange: (open: boolean) => void;
  /** Lit le solde chez le fournisseur ; renvoie l'erreur, ou `null` si la lecture a réussi. */
  onReadRemote: (provider: AiProviderOverview) => Promise<string | null>;
}) {
  // Le dernier fournisseur ouvert reste dessiné pendant la fermeture du tiroir.
  const [shown, setShown] = useState(provider);
  useEffect(() => {
    if (provider) setShown(provider);
  }, [provider]);
  const current = provider ?? shown;

  return (
    <Sheet open={Boolean(provider)} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full max-w-full gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {current ? <ProviderDetail key={current.id} provider={current} recent={recent.filter((event) => event.provider === current.id)} onClose={() => onOpenChange(false)} onReadRemote={onReadRemote} /> : null}
      </SheetContent>
    </Sheet>
  );
}

export function ProviderDetail({
  provider,
  recent,
  onClose,
  onReadRemote,
}: {
  provider: AiProviderOverview;
  recent: AiUsageEvent[];
  onClose: () => void;
  onReadRemote: (provider: AiProviderOverview) => Promise<string | null>;
}) {
  const [reading, setReading] = useState(false);
  const feedback = useFeedback({ successDuration: 5000 });
  const unit = primaryUnit(provider);
  const monthAmount = amountIn(provider.month, unit);

  const readRemote = async () => {
    setReading(true);
    feedback.clear();
    const error = await onReadRemote(provider);
    setReading(false);
    if (error) feedback.error(error);
    else feedback.success(`Solde lu chez ${provider.label}`);
  };

  return (
    <>
      <SheetHeader className="gap-3 border-b px-5 pt-5 pb-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background">
              {provider.brand ? <BrandLogo brand={provider.brand} className="size-5" /> : <Sparkles className="size-5 text-muted-foreground" aria-hidden />}
            </span>
            <div className="grid min-w-0 gap-1">
              <SheetTitle className="truncate text-lg" title={provider.label}>
                {provider.label}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs">{KIND_LABELS[provider.kind]}</span>
                  <AccessPill access={provider.access} className="text-foreground" />
                </div>
              </SheetDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {provider.settingsHref ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={provider.settingsHref}>
                  <Settings2 className="size-4" aria-hidden />
                  Régler
                </Link>
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" className="-mr-2 size-8" onClick={onClose} aria-label="Fermer">
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-pretty text-muted-foreground tabular-nums" suppressHydrationWarning>
          Ce mois-ci, {formatAmount(provider.month.calls, "calls")}
          {provider.month.failures ? `, dont ${provider.month.failures.toLocaleString("fr-FR")} en échec` : ""}
          {unit !== "calls" ? `, ${formatAmount(monthAmount, unit)}` : ""}.
          {provider.lastCall ? ` Dernier appel ${formatRelative(provider.lastCall.at)}.` : " Jamais appelé."}
        </p>
      </SheetHeader>

      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-7 overflow-x-hidden overflow-y-auto px-5 py-5">
        <Section
          title="Limites"
          actions={
            provider.remoteReadable ? (
              <>
                <ActionStatus state={feedback.state} className="min-w-0" />
                <Button variant="outline" size="sm" className="gap-1.5" loading={reading} onClick={() => void readRemote()}>
                  <Cloud className="size-4" aria-hidden />
                  Lire le solde chez {provider.label}
                </Button>
              </>
            ) : null
          }
        >
          {provider.limits.length ? (
            <div className="min-w-0 divide-y overflow-hidden rounded-xl border">
              {provider.limits.map((limit) => (
                <LimitRow key={limit.id} limit={limit} provider={provider} withProvider={false} stacked />
              ))}
            </div>
          ) : (
            <p className="text-sm text-pretty text-muted-foreground">
              {provider.remoteReadable ? `Aucune limite connue. Le solde se lit chez ${provider.label} avec le bouton ci-dessus.` : "Aucune limite connue pour ce fournisseur : ses appels sont seulement comptés."}
            </p>
          )}
        </Section>

        <Section title="Trente derniers jours">
          <UsageChart daily={provider.daily} unit={unit} />
        </Section>

        <Section title="Par module et fonctionnalité">
          {provider.byFeature.length ? (
            <div className="min-w-0 overflow-hidden rounded-xl border">
              <Table className="table-fixed" aria-label="Répartition par module et fonctionnalité">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Fonctionnalité</TableHead>
                    <TableHead className="w-24 text-right">Appels</TableHead>
                    <TableHead className="hidden w-36 text-right sm:table-cell">Quantité</TableHead>
                    <TableHead className="hidden w-32 pr-4 sm:table-cell">Dernier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {provider.byFeature.map((entry) => (
                    <TableRow key={`${entry.module}:${entry.feature}`} className="hover:bg-muted/30">
                      <TableCell className="pl-4 whitespace-normal">
                        <div className="grid min-w-0 gap-0.5">
                          <span className="min-w-0 truncate text-sm font-medium" title={entry.feature}>
                            {entry.feature}
                          </span>
                          <span className="min-w-0 truncate text-xs text-muted-foreground">{moduleName(entry.module)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top text-xs tabular-nums">
                        {entry.calls.toLocaleString("fr-FR")}
                        {entry.failures ? <span className="block text-destructive">{entry.failures.toLocaleString("fr-FR")} en échec</span> : null}
                      </TableCell>
                      <TableCell className="hidden text-right align-top text-xs whitespace-normal tabular-nums sm:table-cell">{formatAmount(amountIn(entry, unit), unit)}</TableCell>
                      <TableCell className="hidden pr-4 align-top sm:table-cell">
                        <span className="block truncate text-xs text-muted-foreground" title={formatDateTime(entry.lastAt)} suppressHydrationWarning>
                          {formatRelative(entry.lastAt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun appel ces trente derniers jours.</p>
          )}
          {provider.usedBy.length ? (
            <p className="text-xs text-pretty text-muted-foreground">
              Utilisé par{" "}
              {provider.usedBy.map((id, index) => (
                <span key={id}>
                  {index ? (index === provider.usedBy.length - 1 ? " et " : ", ") : ""}
                  <span className="font-medium text-foreground/80">{moduleName(id)}</span>
                </span>
              ))}
              .
            </p>
          ) : null}
        </Section>

        <Section title="Derniers appels">
          <RecentCallsTable
            events={recent}
            providers={[provider]}
            showProvider={false}
            label={`Derniers appels à ${provider.label}`}
            empty={`Aucun appel récent à ${provider.label}.`}
          />
        </Section>
      </div>
    </>
  );
}

/** Une section du tiroir : un intertitre, des gestes à droite, le contenu. */
function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {actions ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
