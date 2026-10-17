"use client";

/**
 * Réglages d'un service, dans un tiroir : son application (marche à suivre,
 * adresse de retour, état de chaque variable), son budget mensuel quand il
 * est payant à l'usage, et l'avertissement « instance non joignable » quand
 * il va chercher les fichiers lui-même.
 */

import { useEffect, useState } from "react";
import { CircleAlert, X } from "lucide-react";
import { ActionStatus, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatCost } from "@/lib/connections/limits";
import { setMonthlyBudgetAction } from "@/app/(app)/admin/connections/actions";
import type { BillingStatus, ConnectionsOverview, ConnectorView } from "./types";
import { AppConfigForm } from "./app-config-form";
import { ServiceLogo, countLabel } from "./shared";

const KIND_LABELS: Record<string, string> = { video: "vidéo", image: "image", text: "message", carousel: "carrousel" };

/** « Mois d'octobre 2026 ». */
function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  if (!year || !index) return month;
  return new Date(year, index - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function BudgetSection({ connector, billing, onChange }: { connector: ConnectorView; billing: BillingStatus; onChange: (billing: BillingStatus) => void }) {
  const [draft, setDraft] = useState(billing.budget === null ? "" : String(billing.budget).replace(".", ","));
  const [busy, setBusy] = useState(false);
  // Réussite comme échec, à côté du bouton « Enregistrer » du budget.
  const feedback = useFeedback();
  useEffect(() => setDraft(billing.budget === null ? "" : String(billing.budget).replace(".", ",")), [billing.budget]);
  const pricing = connector.pricing;
  const ratio = billing.budget ? Math.min(100, (billing.spent / billing.budget) * 100) : 0;
  const parsed = draft.trim() === "" ? null : Number(draft.replace(",", ".").replace(/\s/g, ""));
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0);
  const unchanged = (parsed ?? null) === billing.budget;

  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <h3 className="text-sm font-semibold">Budget mensuel</h3>
      <p className="text-sm text-pretty text-muted-foreground">
        {connector.label} facture chaque publication
        {pricing
          ? ` (${Object.entries(pricing.perPublish)
              .map(([kind, amount]) => `${formatCost(amount ?? 0, pricing.currency)} par ${KIND_LABELS[kind] ?? kind}`)
              .join(", ")}${pricing.linkSurcharge ? `, ${formatCost(pricing.linkSurcharge, pricing.currency)} de plus avec une adresse web` : ""} ; tarif relevé le ${new Date(pricing.asOf).toLocaleDateString("fr-FR")})`
          : ""}
        . La file refuse une publication qui dépasserait le budget.
      </p>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>Dépensé en {monthLabel(billing.month)}</span>
          <span className="tabular-nums">
            {formatCost(billing.spent, billing.currency)}
            {billing.budget !== null ? <span className="text-muted-foreground"> sur {formatCost(billing.budget, billing.currency)}</span> : null}
          </span>
        </div>
        {billing.budget !== null ? (
          <Progress value={ratio} className={cn("h-1.5", ratio >= 90 && "[&>*]:bg-amber-500", ratio >= 100 && "[&>*]:bg-destructive")} aria-label="Part du budget dépensée" />
        ) : null}
      </div>
      {billing.creditsExhausted ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Crédits épuisés chez {connector.label} : {billing.creditsExhausted.message} Rechargez-les, puis reprenez les envois depuis la file des comptes.
        </p>
      ) : null}
      {billing.budgetSource === "env" ? (
        <p className="text-xs text-muted-foreground">Budget fixé par l’environnement du serveur ({connector.app?.envNames.clientId.replace(/_CLIENT_ID$/, "")}_MONTHLY_BUDGET).</p>
      ) : (
        <form
          className="flex min-w-0 flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (invalid || unchanged) return;
            setBusy(true);
            feedback.clear();
            const result = await setMonthlyBudgetAction(connector.id, parsed);
            setBusy(false);
            if (!result.ok) return void feedback.error(result.error);
            if (result.data) onChange(result.data);
            feedback.success(parsed === null ? "Budget retiré" : "Budget enregistré");
          }}
          // Modifier le montant retire un message d'erreur devenu caduc.
          onChange={feedback.state?.tone === "error" ? feedback.clear : undefined}
        >
          <div className="grid min-w-0 flex-1 basis-48 gap-1.5">
            <Label htmlFor={`${connector.id}-budget`}>Budget par mois</Label>
            <InputGroup>
              <InputGroupInput
                id={`${connector.id}-budget`}
                inputMode="decimal"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Aucun"
                aria-invalid={invalid || undefined}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{billing.currency}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </div>
          <Button type="submit" variant="outline" loading={busy} disabled={invalid || unchanged} className="gap-2">
            Enregistrer
          </Button>
          <ActionStatus state={feedback.state} className="h-9" />
        </form>
      )}
      {invalid ? <p className="text-xs text-destructive">Un montant positif, ou vide pour aucun budget.</p> : null}
    </section>
  );
}

export function ServiceSettingsSheet({
  connector,
  overview,
  onOpenChange,
  onOverviewChange,
}: {
  connector: ConnectorView | null;
  overview: ConnectionsOverview;
  onOpenChange: (open: boolean) => void;
  onOverviewChange: (overview: ConnectionsOverview) => void;
}) {
  const billing = connector ? overview.billing[connector.id] : undefined;
  const accounts = connector ? overview.accounts.filter((account) => account.connector === connector.id) : [];
  return (
    <Sheet open={Boolean(connector)} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl">
        {connector ? (
          <>
            <SheetHeader className="gap-1 border-b px-5 pt-5 pb-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="flex min-w-0 items-center gap-2 text-lg">
                    <ServiceLogo logo={connector.logo} className="size-5" />
                    <span className="truncate">Réglages {connector.label}</span>
                  </SheetTitle>
                  <SheetDescription className="text-pretty">
                    {connector.app?.configured ? "Application configurée" : "Application à configurer"}
                    {accounts.length > 0 ? `, utilisée par ${countLabel(accounts.length, connector.accountNoun)}.` : "."}
                  </SheetDescription>
                </div>
                <Button variant="ghost" size="icon" className="-mr-2 size-8 shrink-0" onClick={() => onOpenChange(false)} aria-label="Fermer">
                  <X className="size-4" />
                </Button>
              </div>
            </SheetHeader>
            <div className="grid min-h-0 flex-1 content-start gap-8 overflow-y-auto px-5 py-5">
              {connector.publicMedia && !overview.publicMedia.reachable ? (
                <p className="flex items-start gap-2 text-sm text-pretty text-amber-700 dark:text-amber-400">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {connector.label} va chercher les fichiers sur cette instance, qui doit donc être joignable depuis Internet. {overview.publicMedia.reason}
                  </span>
                </p>
              ) : null}
              {connector.app?.source === "file" && connector.app.updatedAt ? (
                <p className="-mb-4 text-xs text-muted-foreground">Enregistrée le {new Date(connector.app.updatedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}.</p>
              ) : null}
              <AppConfigForm connector={connector} submitLabel="Enregistrer" allowClear onSaved={onOverviewChange} />
              {billing ? (
                <BudgetSection
                  connector={connector}
                  billing={billing}
                  onChange={(next) => onOverviewChange({ ...overview, billing: { ...overview.billing, [connector.id]: next } })}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
