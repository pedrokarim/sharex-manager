"use client";

/**
 * Détail d'un appel : ce qui s'est passé et quoi faire quand il a échoué, le
 * message du service et son détail (réponse, dernières lignes de l'outil),
 * puis la fiche de l'appel (service, usage, modèle, date, durée, essais,
 * quantité). Le même corps sert au tiroir de l'onglet « Derniers appels » et
 * à la vue « Retour » du tiroir d'un service : jamais un tiroir dans un tiroir.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, CircleX, Lightbulb, Settings2, X } from "lucide-react";
import type { AiUsageEvent } from "@/lib/ai-usage/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatRelative } from "@/components/connections/shared";
import { explainFailure, formatDuration, formatFullDate } from "./explain";
import { formatEventAmount, moduleName } from "./format";
import { ProviderMark, type CallsProvider } from "./recent-calls";

/** Un appel à détailler ; le dernier appel d'un service peut ne pas porter sa quantité. */
export type CallRecord = Pick<AiUsageEvent, "provider" | "at" | "ok" | "module" | "feature"> &
  Partial<Pick<AiUsageEvent, "model" | "error" | "errorKind" | "detail" | "durationMs" | "attempts" | "unit" | "amount" | "extra">>;

export function CallDetailBody({ event, provider }: { event: CallRecord; provider: CallsProvider }) {
  const explanation = explainFailure(event, provider);
  const duration = formatDuration(event.durationMs);
  const amount = event.unit && typeof event.amount === "number" ? formatEventAmount({ unit: event.unit, amount: event.amount, extra: event.extra }) : null;

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "Service",
      value: (
        <span className="flex min-w-0 items-center gap-1.5">
          <ProviderMark provider={provider} className="size-4" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{provider.label}</span>
        </span>
      ),
    },
    { label: "Fonctionnalité", value: <span className="[overflow-wrap:anywhere]">{event.feature}</span> },
    { label: "Module", value: moduleName(event.module) },
    { label: "Modèle", value: event.model ? <span className="font-mono text-xs break-all">{event.model}</span> : <span className="text-muted-foreground">Non précisé</span> },
    {
      label: "Date",
      value: (
        <span suppressHydrationWarning>
          {formatFullDate(event.at)} <span className="text-muted-foreground">({formatRelative(event.at)})</span>
        </span>
      ),
    },
    { label: "Durée", value: duration ?? <span className="text-muted-foreground">Non notée</span> },
    {
      label: "Essais",
      value:
        typeof event.attempts === "number" ? (
          `${event.attempts} essai${event.attempts > 1 ? "s" : ""}${event.attempts === 1 ? ", sans nouvel essai" : ""}`
        ) : (
          <span className="text-muted-foreground">Non notés</span>
        ),
    },
    { label: "Quantité", value: amount ? <span className="tabular-nums">{amount}</span> : <span className="text-muted-foreground">Non notée</span> },
    {
      label: "Issue",
      value: event.ok ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          Réussi
        </span>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-red-700 dark:text-red-400">
          <CircleX className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">Échec{explanation ? ` : ${explanation.label.toLocaleLowerCase("fr")}` : ""}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="grid min-w-0 content-start">
      {explanation ? (
        <section className="grid min-w-0 gap-3 border-b px-5 py-4" aria-label="Ce qui s’est passé">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
            <CircleX className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0">{explanation.label}</span>
          </h3>
          <p className="text-sm text-pretty">{explanation.summary}</p>
          <p className="flex min-w-0 items-start gap-2 text-sm text-pretty text-muted-foreground">
            <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">{explanation.advice}</span>
          </p>
          {explanation.settingsHref ? (
            <div>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={explanation.settingsHref}>
                  <Settings2 className="size-4" aria-hidden />
                  Régler {provider.label}
                </Link>
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {!event.ok ? (
        <section className="grid min-w-0 gap-2 border-b px-5 py-4" aria-label="Message du service">
          <h3 className="text-xs font-medium text-muted-foreground">Message du service</h3>
          {event.error ? (
            <p className="text-sm text-pretty text-red-700 [overflow-wrap:anywhere] dark:text-red-400">{event.error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun message n’a été noté pour cet échec.</p>
          )}
          {event.detail ? (
            <pre
              tabIndex={0}
              aria-label="Détail rendu par le service"
              className="max-h-64 min-w-0 overflow-x-hidden overflow-y-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/90 [overflow-wrap:anywhere] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {event.detail}
            </pre>
          ) : null}
        </section>
      ) : null}

      <dl className="divide-y" aria-label="Fiche de l’appel">
        {rows.map((row) => (
          <div key={row.label} className="grid min-w-0 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-baseline gap-3 px-5 py-2.5 text-sm">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Tiroir du détail d'un appel, pour l'onglet « Derniers appels » de l'écran. */
export function CallSheet({ event, provider, onOpenChange }: { event: CallRecord | null; provider: CallsProvider | null; onOpenChange: (open: boolean) => void }) {
  // Le dernier appel ouvert reste dessiné pendant la fermeture du tiroir.
  const [shown, setShown] = useState(event && provider ? { event, provider } : null);
  useEffect(() => {
    if (event && provider) setShown({ event, provider });
  }, [event, provider]);
  const current = event && provider ? { event, provider } : shown;

  return (
    <Sheet open={Boolean(event && provider)} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full max-w-full gap-0 overflow-hidden p-0 sm:max-w-lg">
        {current ? (
          <>
            <SheetHeader className="gap-1 border-b px-5 pt-5 pb-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background">
                    <ProviderMark provider={current.provider} className="size-5" />
                  </span>
                  <div className="grid min-w-0 gap-1">
                    <SheetTitle className="text-lg [overflow-wrap:anywhere]">{current.event.feature}</SheetTitle>
                    <SheetDescription className="text-xs [overflow-wrap:anywhere]">
                      {current.provider.label} · {moduleName(current.event.module)}
                    </SheetDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="-mr-2 size-8 shrink-0" onClick={() => onOpenChange(false)} aria-label="Fermer">
                  <X className="size-4" />
                </Button>
              </div>
            </SheetHeader>
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
              <CallDetailBody event={current.event} provider={current.provider} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Vue du détail dans le tiroir d'un service : un bouton « Retour » au-dessus du même corps. */
export function CallDetailView({ event, provider, onBack }: { event: CallRecord; provider: CallsProvider; onBack: () => void }) {
  return (
    <div className="grid min-w-0 content-start">
      <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onBack} autoFocus>
          <ArrowLeft className="size-4" aria-hidden />
          Retour
        </Button>
        <h3 className="min-w-0 truncate text-sm font-semibold" title={`${event.feature} · ${formatFullDate(event.at)}`}>
          {event.feature}
        </h3>
      </div>
      <CallDetailBody event={event} provider={provider} />
    </div>
  );
}
