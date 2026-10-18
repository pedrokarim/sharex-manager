"use client";

/**
 * Quotas d'un compte, un panneau par quota : celui de l'application chez le
 * service (partagé par tous ses comptes, remis à zéro chaque jour) et celui
 * du compte seul, sur une fenêtre glissante. Chaque panneau dit d'abord ce
 * qui compte (son état, sa prochaine échéance), puis détaille chaque
 * compartiment en jauge : consommé sur la limite, reste, part utilisée.
 *
 * Des jauges plutôt qu'un graphique : les compartiments n'ont pas la même
 * unité (100 envois, 10 000 unités), on lit donc chaque valeur exacte et son
 * reste sans passer par une échelle commune en pourcentage, et un libellé
 * long se coupe proprement au lieu d'être rogné sur un axe.
 */

import { useId, type ReactNode } from "react";
import { AppWindow, CircleAlert, CircleCheck, CirclePause, CircleX, Hourglass, RotateCcw, UserRound, type LucideIcon } from "lucide-react";
import type { AccountQuotaUsage, QuotaUsage } from "@/lib/connections/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelRows } from "@/components/connections/panel";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import type { ConnectorView } from "@/components/connections/types";
import { cn } from "@/lib/utils";

type Bucket = QuotaUsage["buckets"][number];
type QuotaState = "available" | "low" | "exhausted";

/** Seuil à partir duquel un compartiment passe à l'orange. */
const LOW_SHARE = 80;

/** « 24 heures », « 7 jours ». */
function windowLabel(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `${days} jours`;
}

const formatCount = (value: number) => value.toLocaleString("fr-FR");

/** Part utilisée, en pourcentage, bornée à 100. */
function shareOf(bucket: Bucket): number {
  if (bucket.limit <= 0) return bucket.used > 0 ? 100 : 0;
  return Math.min(100, (bucket.used / bucket.limit) * 100);
}

function stateOfShare(share: number): QuotaState {
  if (share >= 100) return "exhausted";
  if (share >= LOW_SHARE) return "low";
  return "available";
}

/** État d'un quota entier : le compartiment le plus entamé l'emporte, une suspension le rend épuisé. */
function quotaState(buckets: Bucket[], pausedUntil: number | undefined): QuotaState {
  if (pausedUntil) return "exhausted";
  return stateOfShare(Math.max(0, ...buckets.map(shareOf)));
}

const STATE_STYLE: Record<QuotaState, { label: string; icon: LucideIcon; className: string }> = {
  available: { label: "Disponible", icon: CircleCheck, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  low: { label: "Presque épuisé", icon: CircleAlert, className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  exhausted: { label: "Épuisé", icon: CircleX, className: "bg-destructive/10 text-red-700 dark:text-red-400" },
};

/** Couleur de la barre : normale, orange à 80 %, rouge à 100 %. */
const BAR_TONE: Record<QuotaState, string> = {
  available: "",
  low: "*:data-[slot=progress-indicator]:bg-amber-500",
  exhausted: "*:data-[slot=progress-indicator]:bg-destructive",
};

/** État du quota en pastille : icône et mot, jamais la couleur seule. */
function StatePill({ state }: { state: QuotaState }) {
  const { label, icon: Icon, className } = STATE_STYLE[state];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** Échéance qui compte, relative (« Remise à zéro dans 5 heures »), la date exacte en infobulle. */
function Deadline({ icon: Icon, prefix, at }: { icon: LucideIcon; prefix: string; at: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={formatDateTime(at)} suppressHydrationWarning>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate" suppressHydrationWarning>
        {prefix} {formatRelative(at)}
      </span>
    </span>
  );
}

/** Un compartiment : libellé, consommé sur la limite, jauge, reste et part utilisée. */
function BucketGauge({ bucket }: { bucket: Bucket }) {
  const share = shareOf(bucket);
  const state = stateOfShare(share);
  const remaining = Math.max(0, bucket.limit - bucket.used);
  const percent = bucket.used > 0 && share < 1 ? "< 1" : String(Math.round(share));
  return (
    <div className="grid min-w-0 gap-2 px-4 py-3.5">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium" title={bucket.label}>
          {bucket.label}
        </span>
        <span className="shrink-0 text-sm tabular-nums">
          <span className="font-semibold">{formatCount(bucket.used)}</span>
          <span className="text-muted-foreground"> / {formatCount(bucket.limit)}</span>
        </span>
      </div>
      <Progress
        value={share}
        aria-label={bucket.label}
        getValueLabel={() => `${formatCount(bucket.used)} sur ${formatCount(bucket.limit)}`}
        className={cn("h-2 bg-muted", BAR_TONE[state])}
      />
      <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs text-muted-foreground tabular-nums">
        <span className={cn("min-w-0", remaining === 0 && "font-medium text-destructive")}>
          {remaining === 0 ? "Plus rien de disponible" : `${formatCount(remaining)} disponible${remaining > 1 ? "s" : ""}`}
        </span>
        <span className="shrink-0">{percent}&nbsp;% utilisés</span>
      </div>
    </div>
  );
}

/** Suspension des envois, signalée dans le panneau avec le moment de la reprise. */
function PausedAlert({ until, children }: { until: number; children: ReactNode }) {
  return (
    <PanelBody className="pb-0">
      <Alert className="bg-amber-500/10">
        <CirclePause className="text-amber-600 dark:text-amber-400" />
        <AlertTitle>Envois suspendus</AlertTitle>
        <AlertDescription className="text-pretty text-foreground/80">
          <p suppressHydrationWarning>
            {children} Ils reprendront d’eux-mêmes {formatRelative(until)}, le {formatDateTime(until)}.
          </p>
        </AlertDescription>
      </Alert>
    </PanelBody>
  );
}

function QuotaPanel({
  icon,
  title,
  description,
  state,
  deadline,
  paused,
  buckets,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  state: QuotaState;
  deadline: ReactNode;
  paused: ReactNode;
  buckets: Bucket[];
  footer: ReactNode;
}) {
  const titleId = useId();
  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader
        icon={icon}
        title={title}
        titleId={titleId}
        description={description}
        actions={
          <>
            {deadline}
            <StatePill state={state} />
          </>
        }
      />
      {paused}
      {buckets.length ? (
        <PanelRows className={cn(paused && "pt-1")}>
          {buckets.map((bucket) => (
            <BucketGauge key={bucket.id} bucket={bucket} />
          ))}
        </PanelRows>
      ) : (
        <PanelBody className="text-sm text-muted-foreground">Aucun compartiment n’est déclaré pour ce quota.</PanelBody>
      )}
      <PanelFooter className="mt-auto text-pretty">
        {footer}
      </PanelFooter>
    </Panel>
  );
}

export function QuotaTab({ quota, accountQuota, connector }: { quota: QuotaUsage | null; accountQuota: AccountQuotaUsage | null; connector: ConnectorView }) {
  const both = Boolean(quota && accountQuota);
  return (
    <div className={cn("grid min-w-0 grid-cols-1 items-stretch gap-4", both && "xl:grid-cols-2")}>
      {quota ? (
        <QuotaPanel
          icon={AppWindow}
          title="Quota de l’application"
          description={`Accordé par ${connector.label} à l’application, remis à zéro chaque jour.`}
          state={quotaState(quota.buckets, quota.pausedUntil)}
          deadline={<Deadline icon={RotateCcw} prefix="Remise à zéro" at={quota.resetsAt} />}
          paused={
            quota.pausedUntil ? <PausedAlert until={quota.pausedUntil}>{connector.label} a signalé le quota de l’application épuisé.</PausedAlert> : null
          }
          buckets={quota.buckets}
          footer={
            <span>
              Partagé par tous les comptes {connector.label} de l’instance&nbsp;: chaque envoi, quel que soit le compte, est décompté ici.
            </span>
          }
        />
      ) : null}
      {accountQuota ? (
        <QuotaPanel
          icon={UserRound}
          title="Quota de ce compte"
          description={`Limite propre au compte chez ${connector.label}, sur ${windowLabel(accountQuota.windowMs)} glissantes.`}
          state={quotaState(accountQuota.buckets, accountQuota.pausedUntil)}
          deadline={accountQuota.nextReleaseAt ? <Deadline icon={Hourglass} prefix="Une place se libère" at={accountQuota.nextReleaseAt} /> : null}
          paused={
            accountQuota.pausedUntil ? <PausedAlert until={accountQuota.pausedUntil}>Ce compte a atteint sa limite chez {connector.label}.</PausedAlert> : null
          }
          buckets={accountQuota.buckets}
          footer={
            <span suppressHydrationWarning>
              Chaque publication compte pendant {windowLabel(accountQuota.windowMs)} après son envoi.{" "}
              {accountQuota.nextReleaseAt
                ? `La plus ancienne publication comptée sort de la fenêtre ${formatRelative(accountQuota.nextReleaseAt)}, le ${formatDateTime(accountQuota.nextReleaseAt)}.`
                : "Rien n’est compté en ce moment."}
            </span>
          }
        />
      ) : null}
    </div>
  );
}
