"use client";

/**
 * File des envois d'un compte, en tableau de données comme les
 * publications : filtres avec compteurs, état en pastille, progression ou
 * échéance, date d'ajout, coût, et les gestes de chaque envoi (voir la
 * publication, Reprendre, Annuler) sur sa ligne. Ce qui bouge d'abord, puis
 * ce qui vient, ce qui coince et l'historique.
 */

import { useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  ExternalLink,
  Hourglass,
  Inbox,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { ActionStatus, useFeedback, type FeedbackState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCost } from "@/lib/connections/limits";
import type { PublishJobSummary } from "@/lib/connections/types";
import { RelativeTime, formatBytes, formatDateTime, formatRelative } from "@/components/connections/shared";
import type { ConnectorView } from "@/components/connections/types";
import { cancelJobAction, retryJobAction } from "../actions";

const FINISHED = new Set<PublishJobSummary["state"]>(["done", "cancelled"]);

export const isActiveJob = (job: PublishJobSummary) => job.state === "uploading" || job.state === "processing" || (job.state === "queued" && !job.publishAt);
export const isOpenJob = (job: PublishJobSummary) => !FINISHED.has(job.state);

export const JOB_STATE_LABELS: Record<PublishJobSummary["state"], string> = {
  queued: "En attente",
  uploading: "Envoi en cours",
  processing: "Traitement chez le service",
  done: "Publié",
  failed: "En erreur",
  cancelled: "Annulé",
  "waiting-quota": "En attente du quota",
  "waiting-credits": "En attente de crédits",
};

/** « Publié, traitement en cours » (adresse connue, plus annulable) ou « pas encore publié » (attente chez le service). */
export function jobStateText(job: PublishJobSummary): string {
  if (job.state === "processing") return job.result ? "Publié, traitement en cours" : "En traitement chez le service, pas encore publié";
  return JOB_STATE_LABELS[job.state];
}

/** Publication différée tenue par la file, encore à venir. */
const isScheduled = (job: PublishJobSummary) => job.state === "queued" && Boolean(job.publishAt) && job.publishAt! > Date.now();

/** Ordre du tableau : ce qui bouge, ce qui vient (par date prévue), ce qui coince, puis l'historique. */
function rank(job: PublishJobSummary): number {
  if (job.state === "uploading" || job.state === "processing") return 0;
  if (job.state === "queued") return 1;
  if (job.state === "waiting-quota" || job.state === "waiting-credits") return 2;
  if (job.state === "failed") return 3;
  return 4;
}

const byRank = (a: PublishJobSummary, b: PublishJobSummary) =>
  rank(a) - rank(b) || (rank(a) === 1 ? (a.publishAt ?? a.createdAt) - (b.publishAt ?? b.createdAt) : b.updatedAt - a.updatedAt);

type Filter = "all" | "running" | "upcoming" | "waiting" | "failed" | "finished";

const FILTERS: [Filter, string][] = [
  ["all", "Tous"],
  ["running", "En cours"],
  ["upcoming", "À venir"],
  ["waiting", "En attente"],
  ["failed", "En erreur"],
  ["finished", "Terminés"],
];

function filterOf(job: PublishJobSummary): Exclude<Filter, "all"> {
  if (FINISHED.has(job.state)) return "finished";
  if (job.state === "failed") return "failed";
  if (job.state === "waiting-quota" || job.state === "waiting-credits") return "waiting";
  if (isScheduled(job)) return "upcoming";
  return "running";
}

const PAGE_SIZE = 20;

const canRetryJob = (job: PublishJobSummary) => ["failed", "cancelled", "waiting-quota", "waiting-credits"].includes(job.state) && !job.result;
/** En traitement sans résultat : pas encore publié chez le service, donc encore annulable. */
const isWaitingService = (job: PublishJobSummary) => job.state === "processing" && !job.result;
const canCancelJob = (job: PublishJobSummary) => ["queued", "uploading", "waiting-quota", "waiting-credits", "failed"].includes(job.state) || isWaitingService(job);

const uploadPercent = (job: PublishJobSummary) => (job.source.bytes > 0 ? Math.min(100, Math.round((job.bytesSent / job.source.bytes) * 100)) : 0);

/** Fichier source et taille, en secondaire sous le titre. */
function sourceText(job: PublishJobSummary): string {
  const { source } = job;
  const name = source.kind === "text" ? "Message texte" : source.kind === "carousel" ? `Carrousel de ${source.items.length} éléments` : source.file;
  return source.bytes > 0 ? `${name} · ${formatBytes(source.bytes)}` : name;
}

export function QueueTab({ jobs, connector, onChanged }: { jobs: PublishJobSummary[]; connector: ConnectorView; onChanged: () => void | Promise<unknown> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);

  // Une reprise ou une annulation réussie se voit à l'état de l'envoi ; un
  // échec s'affiche sur la ligne de l'envoi concerné.
  const feedback = useFeedback();
  const [feedbackJobId, setFeedbackJobId] = useState<string | null>(null);

  const act = async (id: string, action: typeof retryJobAction) => {
    setBusy(id);
    setFeedbackJobId(id);
    feedback.clear();
    const result = await action(id);
    setBusy(null);
    if (!result.ok) feedback.error(result.error);
    void onChanged();
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onChanged();
    } finally {
      setRefreshing(false);
    }
  };

  const refreshButton = (
    <Button variant="outline" size="sm" className="gap-2" loading={refreshing} onClick={() => void refresh()}>
      <RefreshCw className="size-4" />
      Actualiser
    </Button>
  );

  if (jobs.length === 0) {
    return (
      <div className="min-w-0 rounded-xl border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>Aucun envoi pour ce compte</EmptyTitle>
            <EmptyDescription>
              Les publications lancées depuis Clip Studio vers {connector.label} apparaissent ici, avec leur progression, leur échéance et leur résultat.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{refreshButton}</EmptyContent>
        </Empty>
      </div>
    );
  }

  const counts: Record<Filter, number> = { all: jobs.length, running: 0, upcoming: 0, waiting: 0, failed: 0, finished: 0 };
  for (const job of jobs) counts[filterOf(job)] += 1;

  const filtered = jobs.filter((job) => filter === "all" || filterOf(job) === filter).sort(byRank);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const shown = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const hasCost = jobs.some((job) => job.cost);
  // La colonne des gestes s'élargit seulement quand « Reprendre » s'affiche en toutes lettres.
  const wideActions = shown.some(canRetryJob);

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setPage(0);
  };

  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(next) => changeFilter((next || "all") as Filter)} aria-label="Filtrer par état" className="flex-wrap">
          {FILTERS.filter(([value]) => value === "all" || value === filter || counts[value] > 0).map(([value, label]) => (
            <ToggleGroupItem key={value} value={value} className="gap-1.5 px-2.5">
              {label}
              <span className="tabular-nums text-foreground/65">{counts[value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex min-w-0 items-center gap-2 sm:ml-auto">{refreshButton}</div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border">
        <TooltipProvider delayDuration={150}>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Publication</TableHead>
                <TableHead className="hidden w-40 sm:table-cell">État</TableHead>
                <TableHead className="hidden w-44 md:table-cell">Progression</TableHead>
                <TableHead className="hidden w-32 xl:table-cell">Ajouté</TableHead>
                {hasCost ? <TableHead className="hidden w-24 text-right xl:table-cell">Coût</TableHead> : null}
                <TableHead className={cn("pr-3", wideActions ? "w-24 sm:w-40" : "w-20")}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            {/* Une autre page ou un autre filtre remplace le corps sans animer chaque ligne. */}
            <TableBody key={`${filter}-${current}`}>
              {shown.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                    Aucun envoi dans ce filtre.{" "}
                    <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => changeFilter("all")}>
                      Tout afficher
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence initial={false}>
                  {shown.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      connector={connector}
                      hasCost={hasCost}
                      busy={busy === job.id}
                      status={feedbackJobId === job.id ? feedback.state : null}
                      onRetry={() => void act(job.id, retryJobAction)}
                      onCancel={() => void act(job.id, cancelJobAction)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      {filtered.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {(current * PAGE_SIZE + 1).toLocaleString("fr-FR")}–{Math.min(filtered.length, (current + 1) * PAGE_SIZE).toLocaleString("fr-FR")} sur {filtered.length.toLocaleString("fr-FR")}
          </span>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="size-8" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Page précédente">
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">
                {current + 1} / {pageCount}
              </span>
              <Button variant="outline" size="icon" className="size-8" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Page suivante">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ─── Pastille d'état ──────────────────────────────────────────────

type Tone = "neutral" | "info" | "running" | "warning" | "error" | "success";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-foreground/70",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  running: "bg-primary/10 text-primary",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "bg-destructive/10 text-red-700 dark:text-red-400",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

/** Libellé court de la pastille ; le texte complet de l'état passe en infobulle. */
function stateBadge(job: PublishJobSummary): { label: string; tone: Tone; icon: ComponentType<{ className?: string }>; spin?: boolean } {
  switch (job.state) {
    case "queued":
      return isScheduled(job) ? { label: "Programmé", tone: "info", icon: CalendarClock } : { label: "En file", tone: "neutral", icon: Clock };
    case "uploading":
      return { label: "Envoi en cours", tone: "running", icon: LoaderCircle, spin: true };
    case "processing":
      return { label: job.result ? "En traitement" : "Pas encore publié", tone: "running", icon: LoaderCircle, spin: true };
    case "waiting-quota":
      return { label: "Attente du quota", tone: "warning", icon: Hourglass };
    case "waiting-credits":
      return { label: "Attente de crédits", tone: "warning", icon: Hourglass };
    case "failed":
      return { label: "En erreur", tone: "error", icon: CircleAlert };
    case "done":
      return { label: "Publié", tone: "success", icon: CircleCheck };
    case "cancelled":
      return { label: "Annulé", tone: "neutral", icon: Ban };
  }
}

function StateBadge({ job, className }: { job: PublishJobSummary; className?: string }) {
  const { label, tone, icon: Icon, spin } = stateBadge(job);
  return (
    // La clé suit l'état : quand l'envoi change d'état, l'ancienne pastille
    // s'efface et la nouvelle apparaît en fondu.
    <AnimatePresence initial={false} mode="wait">
      <motion.span
        key={`${job.state}-${label}`}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.15 }}
        title={isScheduled(job) ? `Programmé pour le ${formatDateTime(job.publishAt)}` : jobStateText(job)}
        className={cn("inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone], className)}
      >
        <Icon className={cn("size-3.5 shrink-0", spin && "animate-spin")} />
        <span className="truncate">{label}</span>
      </motion.span>
    </AnimatePresence>
  );
}

// ─── Progression et échéance ──────────────────────────────────────

function JobTiming({ job }: { job: PublishJobSummary }) {
  if (job.state === "uploading") {
    const percent = uploadPercent(job);
    return (
      <div className="flex min-w-0 items-center gap-2" title={`${formatBytes(job.bytesSent)} sur ${formatBytes(job.source.bytes)}`}>
        <Progress value={percent} className="h-1.5 min-w-0 flex-1" aria-label="Progression de l’envoi" />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{`${percent} %`}</span>
      </div>
    );
  }
  if (job.state === "processing") {
    return job.checkAt ? (
      <span className="block truncate text-xs text-muted-foreground" title={formatDateTime(job.checkAt)} suppressHydrationWarning>
        Prochain passage {formatRelative(job.checkAt)}
      </span>
    ) : (
      <Progress value={100} className="h-1.5 animate-pulse" aria-label="Traitement chez le service" />
    );
  }
  if (isScheduled(job)) {
    return (
      <span className="grid min-w-0 text-xs">
        <span className="truncate" title={`Programmé le ${formatDateTime(job.publishAt)}`}>
          Le {formatDateTime(job.publishAt)}
        </span>
        <span className="truncate text-muted-foreground" suppressHydrationWarning>
          {formatRelative(job.publishAt)}
        </span>
      </span>
    );
  }
  if (job.state === "waiting-quota" && job.retryAt) {
    return (
      <span className="block truncate text-xs text-muted-foreground" title={formatDateTime(job.retryAt)} suppressHydrationWarning>
        Reprise {formatRelative(job.retryAt)}
      </span>
    );
  }
  if (job.state === "waiting-credits") {
    return <span className="block truncate text-xs text-muted-foreground">Reprise à la main</span>;
  }
  return null;
}

// ─── Ligne d'un envoi ─────────────────────────────────────────────

function JobRow({
  job,
  connector,
  hasCost,
  busy,
  status,
  onRetry,
  onCancel,
}: {
  job: PublishJobSummary;
  connector: ConnectorView;
  hasCost: boolean;
  busy: boolean;
  /** Échec de la dernière action sur cet envoi. */
  status: FeedbackState | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const title = job.title || job.source.name || job.source.id;
  const canRetry = canRetryJob(job);
  const canCancel = canCancelJob(job);
  const hasTiming = ["uploading", "processing", "waiting-credits"].includes(job.state) || isScheduled(job) || (job.state === "waiting-quota" && Boolean(job.retryAt));
  const source = sourceText(job);

  return (
    <motion.tr
      data-slot="table-row"
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="border-b transition-colors hover:bg-muted/50"
    >
      <TableCell className="py-3 pl-4 align-top whitespace-normal">
        <div className="grid min-w-0 gap-1">
          <div className="grid min-w-0 gap-0.5">
            {job.result?.url ? (
              <a href={job.result.url} target="_blank" rel="noreferrer noopener" className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere] hover:underline" title={title}>
                {title}
              </a>
            ) : (
              <span className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]" title={title}>
                {title}
              </span>
            )}
            <span className="block truncate text-xs text-muted-foreground" title={source}>
              {source}
            </span>
          </div>

          {/* Ce que les colonnes masquées ne montrent plus, sous le titre. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground xl:hidden">
            <StateBadge job={job} className="sm:hidden" />
            <RelativeTime value={job.createdAt} prefix="Ajouté " />
          </div>
          {hasTiming ? (
            <div className="min-w-0 md:hidden">
              <JobTiming job={job} />
            </div>
          ) : null}

          {(isWaitingService(job) || job.state === "done") && job.note ? <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{job.note}</p> : null}
          {job.error && job.state !== "done" ? (
            <p className="text-xs text-pretty text-destructive [overflow-wrap:anywhere]">
              {job.error}
              {job.state === "failed" && job.processingSince && !/sans republier/.test(job.error) ? " « Reprendre » repart du même envoi chez le service, sans republier." : ""}
            </p>
          ) : null}
          {job.warning ? <p className="text-xs text-pretty text-amber-700 [overflow-wrap:anywhere] dark:text-amber-400">{job.warning}</p> : null}
          {/* Rendu seulement s'il y a un message : vide, il ajouterait un écart. */}
          {status ? <ActionStatus state={status} /> : null}
        </div>
      </TableCell>
      <TableCell className="hidden py-3 align-top sm:table-cell">
        <StateBadge job={job} />
      </TableCell>
      <TableCell className="hidden py-3.5 align-top md:table-cell">
        <JobTiming job={job} />
      </TableCell>
      <TableCell className="hidden py-3.5 align-top xl:table-cell">
        <RelativeTime value={job.createdAt} className="block truncate text-xs text-muted-foreground" />
      </TableCell>
      {hasCost ? (
        <TableCell className="hidden py-3.5 text-right align-top text-xs tabular-nums xl:table-cell">
          {job.cost ? formatCost(job.cost.amount, job.cost.currency) : <span className="text-muted-foreground">–</span>}
        </TableCell>
      ) : null}
      <TableCell className="py-2.5 pr-3 align-top">
        <div className="flex min-w-0 items-center justify-end gap-1">
          {job.result?.url ? (
            <IconAction label={`Voir sur ${connector.label}`}>
              <Button asChild variant="ghost" size="icon" className="size-7">
                <a href={job.result.url} target="_blank" rel="noreferrer noopener" aria-label={`Voir sur ${connector.label}`}>
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </IconAction>
          ) : null}
          {canRetry ? (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" loading={busy} onClick={onRetry} aria-label="Reprendre">
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">Reprendre</span>
            </Button>
          ) : null}
          {canCancel ? (
            <IconAction label="Annuler l’envoi">
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" disabled={busy} onClick={onCancel} aria-label="Annuler l’envoi">
                <X className="size-3.5" />
              </Button>
            </IconAction>
          ) : null}
        </div>
      </TableCell>
    </motion.tr>
  );
}

/** Bouton d'icône avec son nom en infobulle. */
function IconAction({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
