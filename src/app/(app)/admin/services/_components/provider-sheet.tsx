"use client";

/**
 * Détail d'un service dans un tiroir : son accès et où le régler, ses
 * limites (et la lecture du solde chez lui quand il le permet), ses trente
 * derniers jours, la répartition par module et ses derniers appels. Le
 * résultat d'une lecture de solde s'affiche dans le tiroir, à côté du bouton.
 *
 * Un appel cliqué (dans le journal, ou le « dernier appel » de l'en-tête)
 * s'ouvre à la place du corps, avec « Retour » : jamais un tiroir dans un
 * tiroir. Une ligne de la répartition filtre le journal sur sa fonctionnalité.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { ChevronRight, Cloud, Settings2, Sparkles, X } from "lucide-react";
import type { AiProviderOverview, AiUsageEvent } from "@/lib/ai-usage/types";
import { ActionStatus, useFeedback } from "@/components/feedback";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import { cn } from "@/lib/utils";
import { CallDetailView, type CallRecord } from "./call-detail";
import { ERROR_KIND_LABELS, errorKindOf } from "./explain";
import { KIND_LABELS, amountIn, formatAmount, moduleName, primaryUnit } from "./format";
import { AccessPill, LimitRow } from "./limit-gauge";
import { RecentCalls, type FeatureFilter } from "./recent-calls";
import { UsageChart } from "./usage-chart";

export function ProviderSheet({
  provider,
  recent,
  onOpenChange,
  onReadRemote,
}: {
  provider: AiProviderOverview | null;
  /** Derniers appels, tous fournisseurs : le tiroir garde ceux du sien. */
  recent: AiUsageEvent[];
  onOpenChange: (open: boolean) => void;
  /** Lit le solde chez le fournisseur ; renvoie l'erreur, ou `null` si la lecture a réussi. */
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
  // Appel ouvert à la place du corps, et fonctionnalité qui filtre le journal.
  const [selected, setSelected] = useState<CallRecord | null>(null);
  const [feature, setFeature] = useState<FeatureFilter | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recentRef = useRef<HTMLElement>(null);
  const savedScroll = useRef(0);
  const unit = primaryUnit(provider);
  const monthAmount = amountIn(provider.month, unit);
  const lastKind = provider.lastCall ? errorKindOf(provider.lastCall) : null;

  const open = (call: CallRecord) => {
    savedScroll.current = bodyRef.current?.scrollTop ?? 0;
    setSelected(call);
  };

  // Au retour, le corps reprend là où il était ; à l'ouverture d'un appel, il repart du haut.
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = selected ? 0 : savedScroll.current;
  }, [selected]);

  const showFeature = (entry: FeatureFilter) => {
    setFeature({ module: entry.module, feature: entry.feature });
    requestAnimationFrame(() => recentRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  const recentCount = (entry: FeatureFilter) => recent.filter((event) => event.module === entry.module && event.feature === entry.feature).length;

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
          {provider.lastCall ? (
            <>
              {" "}Dernier appel{" "}
              <button
                type="button"
                onClick={() => open({ ...provider.lastCall!, provider: provider.id })}
                className={cn(
                  "rounded-sm underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  lastKind && "text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                )}
                title={`Voir le détail du dernier appel (${formatDateTime(provider.lastCall.at)})`}
              >
                {formatRelative(provider.lastCall.at)}
                {lastKind ? `, en échec (${ERROR_KIND_LABELS[lastKind].toLocaleLowerCase("fr")})` : ""}
              </button>
              .
            </>
          ) : (
            " Jamais appelé."
          )}
        </p>
      </SheetHeader>

      <div ref={bodyRef} className={cn("grid min-h-0 min-w-0 flex-1 content-start overflow-x-hidden overflow-y-auto", !selected && "gap-7 px-5 py-5")}>
        {selected ? (
          <CallDetailView event={selected} provider={provider} onBack={() => setSelected(null)} />
        ) : (
          <>
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
                      {provider.byFeature.map((entry) => {
                        // Une ligne ne se clique que si le journal a des appels à montrer pour elle.
                        const count = recentCount(entry);
                        const active = feature?.module === entry.module && feature.feature === entry.feature;
                        return (
                          <TableRow
                            key={`${entry.module}:${entry.feature}`}
                            data-state={active ? "selected" : undefined}
                            onClick={count ? () => showFeature(entry) : undefined}
                            className={cn(
                              "hover:bg-muted/30",
                              count > 0 && "cursor-pointer has-[button:focus-visible]:bg-muted/50 has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-ring"
                            )}
                          >
                            <TableCell className="pl-4 whitespace-normal">
                              <div className="grid min-w-0 gap-0.5">
                                {count ? (
                                  <button
                                    type="button"
                                    onClick={(click) => {
                                      click.stopPropagation();
                                      showFeature(entry);
                                    }}
                                    aria-label={`${entry.feature}, ${moduleName(entry.module)} : voir ses derniers appels (${count})`}
                                    className="flex min-w-0 items-center gap-1 text-left text-sm font-medium outline-none"
                                    title={`${entry.feature} · voir ${count > 1 ? `ses ${count} derniers appels` : "son dernier appel"}`}
                                  >
                                    <span className="min-w-0 truncate">{entry.feature}</span>
                                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                  </button>
                                ) : (
                                  <span className="min-w-0 truncate text-sm font-medium" title={entry.feature}>
                                    {entry.feature}
                                  </span>
                                )}
                                <span className="min-w-0 truncate text-xs text-muted-foreground">{moduleName(entry.module)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right align-top text-xs tabular-nums">
                              {entry.calls.toLocaleString("fr-FR")}
                              {entry.failures ? <span className="block text-red-700 dark:text-red-400">{entry.failures.toLocaleString("fr-FR")} en échec</span> : null}
                            </TableCell>
                            <TableCell className="hidden text-right align-top text-xs whitespace-normal tabular-nums sm:table-cell">{formatAmount(amountIn(entry, unit), unit)}</TableCell>
                            <TableCell className="hidden pr-4 align-top sm:table-cell">
                              <span className="block truncate text-xs text-muted-foreground" title={formatDateTime(entry.lastAt)} suppressHydrationWarning>
                                {formatRelative(entry.lastAt)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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

            <Section title="Derniers appels" ref={recentRef}>
              <RecentCalls
                events={recent}
                providers={[provider]}
                showProvider={false}
                label={`Derniers appels à ${provider.label}`}
                emptyAll={`Aucun appel récent à ${provider.label}.`}
                hint="Un appel se clique pour lire ce qui s’est passé."
                feature={feature}
                onClearFeature={() => setFeature(null)}
                onSelect={open}
              />
            </Section>
          </>
        )}
      </div>
    </>
  );
}

/** Une section du tiroir : un intertitre, des gestes à droite, le contenu. */
function Section({ title, actions, children, ref }: { title: string; actions?: ReactNode; children: ReactNode; ref?: Ref<HTMLElement> }) {
  return (
    <section ref={ref} className="grid min-w-0 scroll-mt-4 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {actions ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
