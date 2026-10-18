"use client";

/**
 * Onglet État : les points de contrôle de l'instance, rangés par domaine
 * (accès, fichiers, clés API, serveur), le plus grave en tête de chaque
 * domaine ; à côté, les alertes non vues ; dessous, replié, ce qui est fixé
 * dans le code et ne se règle pas ici.
 */

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  ChevronDown,
  FileCheck2,
  FileLock2,
  Globe,
  HardDrive,
  KeyRound,
  ListChecks,
  Lock,
  LockKeyhole,
  MapPin,
  Server,
  ShieldBan,
  ShieldX,
  TerminalSquare,
  UserLock,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";
import { ActionStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Panel, PanelFooter, PanelHeader, PanelRows } from "@/components/connections/panel";
import { RelativeTime } from "@/components/connections/shared";
import type { CheckGroup, SecurityCheck, SecurityTabId } from "@/lib/security/checks";
import { cn } from "@/lib/utils";
import { requestJson, type AlertEntry } from "./api";
import { useAlerts, useChecks } from "./data";
import { CHECK_STATUS, PanelError, RowsSkeleton, StatusMark, displayAccount } from "./shared";

const GROUPS: { id: CheckGroup; label: string; icon: LucideIcon }[] = [
  { id: "access", label: "Accès", icon: UserLock },
  { id: "files", label: "Fichiers", icon: HardDrive },
  { id: "keys", label: "Clés API", icon: KeyRound },
  { id: "server", label: "Serveur", icon: Server },
];

const STATUS_ORDER = { problem: 0, warning: 1, info: 2, ok: 3 } as const;

const toReview = (check: SecurityCheck) => check.status === "problem" || check.status === "warning";

/** « 2 points à revoir, dont 1 problème » ; « Tout est en ordre ». */
export function checksSummary(checks: SecurityCheck[]): string {
  const problems = checks.filter((check) => check.status === "problem").length;
  const review = checks.filter(toReview).length;
  if (review === 0) return "Tout est en ordre.";
  const head = `${review} point${review > 1 ? "s" : ""} à revoir`;
  if (problems === 0) return `${head}.`;
  if (problems === review) return `${head}, ${problems > 1 ? "tous des problèmes" : "un problème"}.`;
  return `${head}, dont ${problems} problème${problems > 1 ? "s" : ""}.`;
}

/** Points à revoir, pour la pastille de l'onglet. */
export function reviewCount(checks: SecurityCheck[]): number {
  return checks.filter(toReview).length;
}

export function OverviewTab({ onOpenTab }: { onOpenTab: (tab: SecurityTabId) => void }) {
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start">
      <div className="grid min-w-0 gap-6">
        <ChecksPanel onOpenTab={onOpenTab} />
        <FixedInCodePanel />
      </div>
      <AlertsPanel onOpenTab={onOpenTab} />
    </div>
  );
}

// ─── Points de contrôle ───────────────────────────────────────────

function ChecksPanel({ onOpenTab }: { onOpenTab: (tab: SecurityTabId) => void }) {
  const titleId = useId();
  const checks = useChecks();
  const [filter, setFilter] = useState<"all" | "review">("all");
  const list = checks.state.status === "ready" ? checks.state.data.checks : [];
  const review = reviewCount(list);
  const shown = filter === "review" ? list.filter(toReview) : list;

  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader
        icon={ListChecks}
        title="Points de contrôle"
        titleId={titleId}
        description={
          checks.state.status === "ready" ? (
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
              <span className={cn(review > 0 && "font-medium text-foreground")}>{checksSummary(list)}</span>
              <RelativeTime value={checks.state.data.checkedAt} prefix="Vérifié " />
            </span>
          ) : (
            "Ce que l’instance fait bien, ce qui est à revoir."
          )
        }
        actions={
          review > 0 ? (
            <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(next) => setFilter((next || "all") as "all" | "review")} aria-label="Filtrer les points">
              <ToggleGroupItem value="all" className="gap-1.5 px-2.5">
                Tous
                <span className="tabular-nums text-foreground/65">{list.length}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="review" className="gap-1.5 px-2.5">
                À revoir
                <span className="tabular-nums text-foreground/65">{review}</span>
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null
        }
      />
      {checks.state.status === "loading" ? (
        <RowsSkeleton rows={6} />
      ) : checks.state.status === "error" ? (
        <PanelError message={checks.state.error} onRetry={() => void checks.reload()} />
      ) : (
        <PanelRows>
          {GROUPS.map((group) => {
            const rows = shown.filter((check) => check.group === group.id).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
            if (rows.length === 0) return null;
            const groupReview = rows.filter(toReview).length;
            return (
              <section key={group.id} aria-label={group.label} className="min-w-0">
                <h4 className="flex min-w-0 items-center gap-2 bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  <group.icon aria-hidden className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  {groupReview ? <span className="shrink-0 tabular-nums text-amber-700 dark:text-amber-400">{groupReview} à revoir</span> : null}
                </h4>
                <div className="divide-y border-t">
                  {rows.map((check) => (
                    <CheckRow key={check.id} check={check} onOpenTab={onOpenTab} />
                  ))}
                </div>
              </section>
            );
          })}
        </PanelRows>
      )}
      <PanelFooter>
        <span className="min-w-0 text-pretty">Relus à chaque ouverture de l’écran et avec « Revérifier ». Aucune valeur secrète n’est affichée.</span>
      </PanelFooter>
    </Panel>
  );
}

function CheckRow({ check, onOpenTab }: { check: SecurityCheck; onOpenTab: (tab: SecurityTabId) => void }) {
  const style = CHECK_STATUS[check.status];
  const action = check.action;
  const actionClass = "h-7 gap-1 px-2 text-xs";
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <StatusMark status={check.status} className="mt-0.5 sm:mt-0" />
      <div className="grid min-w-0 gap-0.5">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{check.title}</span>
          {toReview(check) ? <span className={cn("text-xs font-medium", style.text)}>{style.label}</span> : null}
        </p>
        <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{check.detail}</p>
      </div>
      {action ? (
        <div className="col-start-2 flex min-w-0 sm:col-start-3 sm:justify-end">
          {action.tab ? (
            <Button variant="ghost" size="sm" className={actionClass} onClick={() => onOpenTab(action.tab!)}>
              {action.label}
              <ArrowRight aria-hidden className="size-3.5" />
            </Button>
          ) : action.href ? (
            <Button asChild variant="ghost" size="sm" className={actionClass}>
              <Link href={action.href}>
                {action.label}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Fixé dans le code ────────────────────────────────────────────

const FIXED: { icon: LucideIcon; title: string; reason: string }[] = [
  { icon: UserRoundX, title: "Inscription fermée", reason: "Aucune page d’inscription publique : seul un administrateur crée des comptes." },
  {
    icon: ShieldBan,
    title: "En-têtes de sécurité et CSP",
    reason: "Posés sur chaque réponse par la configuration du serveur ; les assouplir d’ici ouvrirait la porte aux injections.",
  },
  {
    icon: TerminalSquare,
    title: "Bac à sable de Codex",
    reason: "Ne se lève que par une variable d’environnement du serveur, jamais depuis le navigateur.",
  },
  {
    icon: LockKeyhole,
    title: "Chiffrement des jetons et des secrets",
    reason: "AES-256-GCM avec une clé tirée de l’environnement ; ni l’algorithme ni la clé ne se choisissent ici.",
  },
  {
    icon: FileCheck2,
    title: "Contrôle des fichiers envoyés",
    reason: "Extensions admises par la configuration des envois, vidéos vérifiées à leur contenu, fichiers servis sans deviner leur type.",
  },
  {
    icon: Globe,
    title: "Protection contre le SSRF",
    reason: "Les imports par adresse refusent les réseaux privés et locaux, à chaque redirection.",
  },
];

function FixedInCodePanel() {
  return (
    <Panel>
      <Accordion type="single" collapsible>
        <AccordionItem value="fixed" className="border-b-0">
          <AccordionTrigger className="items-center gap-3 px-4 py-3 hover:no-underline focus-visible:ring-inset">
            <span className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Lock aria-hidden className="size-4" />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm leading-6 font-semibold">Fixé dans le code</span>
                <span className="text-xs font-normal text-pretty text-muted-foreground">Ce qui ne se règle pas ici, volontairement, et pourquoi.</span>
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="border-t pb-0">
            <ul className="divide-y">
              {FIXED.map((item) => (
                <li key={item.title} className="flex min-w-0 items-start gap-3 px-4 py-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <item.icon aria-hidden className="size-3.5" />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-pretty text-muted-foreground">{item.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Panel>
  );
}

// ─── Alertes ──────────────────────────────────────────────────────

const VISIBLE_ALERTS = 8;

const ALERT_STYLE: Record<AlertEntry["kind"], { title: string; icon: LucideIcon; tone: string }> = {
  failedSignIns: { title: "Connexion bloquée", icon: ShieldX, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  adminNewIp: { title: "Administrateur, nouvelle adresse", icon: MapPin, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  newApiKey: { title: "Nouvelle clé API", icon: KeyRound, tone: "bg-muted text-muted-foreground" },
  fileMadePublic: { title: "Fichier rendu public", icon: FileLock2, tone: "bg-muted text-muted-foreground" },
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** La phrase d'une alerte, construite depuis ses détails. */
export function describeAlert(alert: Pick<AlertEntry, "kind" | "details">): string {
  const d = alert.details;
  const who = text(d.userEmail) ? displayAccount(text(d.userEmail)) : null;
  switch (alert.kind) {
    case "failedSignIns": {
      const target = text(d.identifier);
      const attempts = typeof d.maxAttempts === "number" ? d.maxAttempts : null;
      const minutes = typeof d.lockMinutes === "number" ? d.lockMinutes : null;
      return [
        target ? `Connexions à « ${target} » bloquées` : "Connexions bloquées",
        attempts ? ` après ${attempts} échecs` : " après des échecs répétés",
        text(d.ip) ? ` depuis ${d.ip}` : "",
        minutes ? `, pour ${minutes} minute${minutes > 1 ? "s" : ""}.` : ".",
      ].join("");
    }
    case "newApiKey":
      return `${text(d.keyName) ? `Clé « ${d.keyName} »` : "Une clé"} créée${who ? ` par ${who}` : ""}.`;
    case "adminNewIp":
      return `${who ?? "Un administrateur"} s’est connecté depuis ${text(d.ip) ?? "une adresse jamais vue"}${text(d.ip) ? ", une adresse jamais vue pour ce compte" : ""}.`;
    case "fileMadePublic":
      return `${text(d.fileName) ? `« ${d.fileName} »` : "Un fichier"} est passé de privé à public${who ? ` (${who})` : ""}.`;
    default:
      return "Événement de sécurité.";
  }
}

function AlertsPanel({ onOpenTab }: { onOpenTab: (tab: SecurityTabId) => void }) {
  const titleId = useId();
  const alerts = useAlerts();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const rowFeedback = useFeedback();
  const [rowFeedbackId, setRowFeedbackId] = useState<number | null>(null);
  const allFeedback = useFeedback();

  const data = alerts.state.status === "ready" ? alerts.state.data : null;
  const list = data?.alerts.filter((alert) => !alert.acknowledgedAt) ?? [];
  const count = data ? Math.max(data.unacknowledged, list.length) : 0;
  const shown = expanded ? list : list.slice(0, VISIBLE_ALERTS);
  const hidden = list.length - shown.length;

  const acknowledge = async (id: number) => {
    setBusy(id);
    setRowFeedbackId(id);
    rowFeedback.clear();
    try {
      await requestJson("/api/admin/security/alerts", { method: "POST", json: { id } });
      alerts.mutate((current) => ({ alerts: current.alerts.filter((alert) => alert.id !== id), unacknowledged: Math.max(0, current.unacknowledged - 1) }));
    } catch (error) {
      rowFeedback.error(errorMessage(error, "L’alerte n’a pas pu être marquée comme vue."));
    } finally {
      setBusy(null);
    }
  };

  const acknowledgeAll = async () => {
    setBusy("all");
    allFeedback.clear();
    try {
      await requestJson("/api/admin/security/alerts", { method: "POST", json: { all: true } });
      alerts.mutate(() => ({ alerts: [], unacknowledged: 0 }));
      allFeedback.success("Toutes vues");
    } catch (error) {
      allFeedback.error(errorMessage(error, "Les alertes n’ont pas pu être marquées comme vues."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader
        icon={BellRing}
        title="Alertes"
        titleId={titleId}
        description={data ? (count ? `${count} non vue${count > 1 ? "s" : ""}, de la plus récente à la plus ancienne.` : "Aucune alerte non vue.") : "Événements qui méritent un coup d’œil."}
        actions={
          <>
            <ActionStatus state={allFeedback.state} />
            {list.length > 1 ? (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" loading={busy === "all"} disabled={busy !== null} onClick={() => void acknowledgeAll()}>
                <CheckCheck aria-hidden className="size-3.5" />
                Tout marquer comme vu
              </Button>
            ) : null}
          </>
        }
      />
      {alerts.state.status === "loading" ? (
        <RowsSkeleton rows={3} action={false} />
      ) : alerts.state.status === "error" ? (
        <PanelError message={alerts.state.error} onRetry={() => void alerts.reload()} />
      ) : list.length === 0 ? (
        <Empty className="gap-4 p-6 md:p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellOff />
            </EmptyMedia>
            <EmptyTitle className="text-base">Rien à signaler</EmptyTitle>
            <EmptyDescription className="text-xs">
              Échecs de connexion répétés, nouvelles clés API, administrateur venu d’une nouvelle adresse, fichier rendu public : chaque alerte active s’affiche ici.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => onOpenTab("rules")}>
              Choisir les alertes
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <PanelRows>
          <AnimatePresence initial={false}>
            {shown.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                busy={busy === alert.id}
                disabled={busy !== null}
                status={rowFeedbackId === alert.id ? rowFeedback.state : null}
                onAcknowledge={() => void acknowledge(alert.id)}
              />
            ))}
          </AnimatePresence>
        </PanelRows>
      )}
      {hidden > 0 || expanded ? (
        <PanelFooter className="justify-end">
          <Button variant="ghost" size="sm" className="-my-1 h-7 gap-1.5" onClick={() => setExpanded((now) => !now)} aria-expanded={expanded}>
            <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Ne montrer que les plus récentes" : `Afficher ${hidden === 1 ? "l’autre alerte" : `les ${hidden} autres alertes`}`}
          </Button>
        </PanelFooter>
      ) : null}
    </Panel>
  );
}

function AlertRow({
  alert,
  busy,
  disabled,
  status,
  onAcknowledge,
}: {
  alert: AlertEntry;
  busy: boolean;
  disabled: boolean;
  status: FeedbackState | null;
  onAcknowledge: () => void;
}) {
  const style = ALERT_STYLE[alert.kind] ?? { title: "Alerte", icon: BellRing, tone: "bg-muted text-muted-foreground" };
  const Icon = style.icon;
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="min-w-0 overflow-hidden"
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", style.tone)}>
          <Icon aria-hidden className="size-3.5" />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <span className="text-sm font-medium [overflow-wrap:anywhere]">{style.title}</span>
          <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{describeAlert(alert)}</p>
          <RelativeTime value={alert.createdAt} className="text-xs text-muted-foreground" />
          {status ? <ActionStatus state={status} /> : null}
        </div>
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" loading={busy} disabled={disabled && !busy} onClick={onAcknowledge} aria-label={`Marquer comme vue : ${style.title}`}>
          <Check aria-hidden className="size-3.5" />
          Vu
        </Button>
      </div>
    </motion.div>
  );
}
