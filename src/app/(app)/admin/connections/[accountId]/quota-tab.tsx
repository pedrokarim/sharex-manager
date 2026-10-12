"use client";

/**
 * Quotas d'un compte : celui de l'application chez le service (partagé par
 * tous ses comptes, remis à zéro chaque jour) et celui du compte seul, sur
 * une fenêtre glissante. On voit d'un coup d'œil ce qui reste, et quand ça
 * se libère.
 */

import { CircleAlert } from "lucide-react";
import type { AccountQuotaUsage, QuotaUsage } from "@/lib/connections/types";
import { QuotaChart } from "@/components/connections/quota-chart";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import type { ConnectorView } from "@/components/connections/types";

/** « 24 heures », « 7 jours ». */
function windowLabel(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `${days} jours`;
}

export function QuotaTab({ quota, accountQuota, connector }: { quota: QuotaUsage | null; accountQuota: AccountQuotaUsage | null; connector: ConnectorView }) {
  return (
    <div className="grid min-w-0 max-w-3xl gap-10">
      {quota ? (
        <section className="grid min-w-0 gap-3">
          <div className="grid gap-1">
            <h2 className="text-sm font-semibold">Application, aujourd’hui</h2>
            <p className="text-xs text-pretty text-muted-foreground" suppressHydrationWarning>
              Partagé par tous les comptes {connector.label} de l’instance (le quota appartient à l’application). Remise à zéro {formatRelative(quota.resetsAt)}, le{" "}
              {formatDateTime(quota.resetsAt)}.
            </p>
          </div>
          <QuotaChart buckets={quota.buckets} label={`Quota de l’application ${connector.label}`} />
          {quota.pausedUntil ? (
            <p className="flex items-start gap-2 text-sm text-pretty text-amber-700 dark:text-amber-400">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              Quota épuisé d’après {connector.label} : les envois reprendront d’eux-mêmes le {formatDateTime(quota.pausedUntil)}.
            </p>
          ) : null}
        </section>
      ) : null}
      {accountQuota ? (
        <section className="grid min-w-0 gap-3">
          <div className="grid gap-1">
            <h2 className="text-sm font-semibold">Ce compte, sur {windowLabel(accountQuota.windowMs)} glissantes</h2>
            <p className="text-xs text-pretty text-muted-foreground" suppressHydrationWarning>
              Limite propre au compte chez {connector.label}.{" "}
              {accountQuota.nextReleaseAt ? `La plus ancienne publication comptée sort de la fenêtre ${formatRelative(accountQuota.nextReleaseAt)}.` : "Rien n’est compté en ce moment."}
            </p>
          </div>
          <QuotaChart buckets={accountQuota.buckets} label="Quota du compte" />
          {accountQuota.pausedUntil ? (
            <p className="flex items-start gap-2 text-sm text-pretty text-amber-700 dark:text-amber-400">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              Limite atteinte pour ce compte : ses envois reprendront d’eux-mêmes le {formatDateTime(accountQuota.pausedUntil)}.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
