"use client";

/**
 * File des envois d'un compte, en frise : en cours (avec progression), à
 * venir (programmés par la file ou en attente d'un quota), en erreur, puis
 * terminés. Chaque étape porte son geste : Reprendre, Annuler, voir la
 * publication.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, ExternalLink, Hourglass, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  StepTimeline,
  StepTimelineContent,
  StepTimelineDescription,
  StepTimelineIndicator,
  StepTimelineItem,
  StepTimelineTitle,
  type StepState,
} from "@/components/ui/step-timeline";
import { formatCost } from "@/lib/connections/limits";
import type { PublishJobSummary } from "@/lib/connections/types";
import { formatBytes, formatDateTime, formatRelative } from "@/components/connections/shared";
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

function stepState(job: PublishJobSummary): StepState {
  switch (job.state) {
    case "uploading":
    case "processing":
      return "running";
    case "done":
      return "done";
    case "failed":
      return "error";
    case "cancelled":
      return "skipped";
    default:
      return "pending";
  }
}

/** Ordre de la frise : ce qui bouge, ce qui vient (par date prévue), ce qui coince, puis l'historique. */
function rank(job: PublishJobSummary): number {
  if (job.state === "uploading" || job.state === "processing") return 0;
  if (job.state === "queued") return 1;
  if (job.state === "waiting-quota" || job.state === "waiting-credits") return 2;
  if (job.state === "failed") return 3;
  return 4;
}

/** Au-delà, l'historique se replie. */
const HISTORY_SHOWN = 8;

export function QueueTab({ jobs, connector, onChanged }: { jobs: PublishJobSummary[]; connector: ConnectorView; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const act = async (id: string, action: typeof retryJobAction, done: string) => {
    setBusy(id);
    const result = await action(id);
    setBusy(null);
    if (!result.ok) toast.error(result.error);
    else toast.success(done);
    onChanged();
  };

  if (jobs.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun envoi pour ce compte. Les publications lancées depuis Clip Studio apparaissent ici, avec leur progression.</p>;
  }

  const sorted = [...jobs].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? (a.publishAt ?? a.createdAt) - (b.publishAt ?? b.createdAt) : b.updatedAt - a.updatedAt));
  const open = sorted.filter(isOpenJob);
  const history = sorted.filter((job) => !isOpenJob(job));
  const shownHistory = showAll ? history : history.slice(0, HISTORY_SHOWN);

  return (
    <div className="grid min-w-0 max-w-3xl gap-8">
      {open.length > 0 ? (
        <section className="grid min-w-0 gap-3">
          <h2 className="text-sm font-semibold">En cours et à venir</h2>
          <JobTimeline jobs={open} connector={connector} busy={busy} act={act} />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Rien en cours.</p>
      )}
      {history.length > 0 ? (
        <section className="grid min-w-0 gap-3">
          <h2 className="text-sm font-semibold">Terminés</h2>
          <JobTimeline jobs={shownHistory} connector={connector} busy={busy} act={act} />
          {history.length > HISTORY_SHOWN ? (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Replier" : `Voir les ${history.length - HISTORY_SHOWN} plus anciens`}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function JobTimeline({
  jobs,
  connector,
  busy,
  act,
}: {
  jobs: PublishJobSummary[];
  connector: ConnectorView;
  busy: string | null;
  act: (id: string, action: typeof retryJobAction, done: string) => void;
}) {
  return (
    <StepTimeline>
      <AnimatePresence initial={false}>
        {jobs.map((job) => {
          const total = job.source.bytes;
          const percent = total > 0 ? Math.min(100, Math.round((job.bytesSent / total) * 100)) : 0;
          const canRetry = ["failed", "cancelled", "waiting-quota", "waiting-credits"].includes(job.state) && !job.result;
          // En traitement sans résultat : pas encore publié chez le service, donc encore annulable.
          const waitingService = job.state === "processing" && !job.result;
          const canCancel = ["queued", "uploading", "waiting-quota", "waiting-credits", "failed"].includes(job.state) || waitingService;
          const scheduled = job.state === "queued" && job.publishAt && job.publishAt > Date.now();
          const details = [
            scheduled ? `programmé pour le ${formatDateTime(job.publishAt)}` : jobStateText(job).toLowerCase(),
            job.state === "processing" && job.checkAt ? `prochain passage ${formatRelative(job.checkAt)}` : null,
            job.state === "waiting-quota" && job.retryAt ? `reprise prévue ${formatRelative(job.retryAt)}` : null,
            `ajouté ${formatRelative(job.createdAt)}`,
            job.cost ? `coût ${formatCost(job.cost.amount, job.cost.currency)}` : null,
          ].filter(Boolean);
          return (
            <motion.div key={job.id} layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <StepTimelineItem state={stepState(job)}>
                <StepTimelineIndicator>
                  {scheduled ? <CalendarClock aria-hidden className="text-muted-foreground" /> : job.state.startsWith("waiting") ? <Hourglass aria-hidden className="text-amber-600 dark:text-amber-400" /> : undefined}
                </StepTimelineIndicator>
                <StepTimelineContent>
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                    <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
                      <StepTimelineTitle state={stepState(job)} className="[overflow-wrap:anywhere]">
                        {job.title || job.source.name || job.source.id}
                      </StepTimelineTitle>
                      <StepTimelineDescription className="first-letter:uppercase" suppressHydrationWarning>
                        {details.join(" · ")}
                      </StepTimelineDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {job.result ? (
                        <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2">
                          <a href={job.result.url} target="_blank" rel="noreferrer noopener">
                            <ExternalLink className="size-3.5" />
                            Voir sur {connector.label}
                          </a>
                        </Button>
                      ) : null}
                      {canRetry ? (
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2" disabled={busy === job.id} onClick={() => act(job.id, retryJobAction, "Envoi relancé")}>
                          {busy === job.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                          Reprendre
                        </Button>
                      ) : null}
                      {canCancel ? (
                        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" disabled={busy === job.id} onClick={() => act(job.id, cancelJobAction, "Envoi annulé")}>
                          <X className="size-3.5" />
                          Annuler
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {job.state === "uploading" ? (
                    <div className="flex min-w-0 items-center gap-3 pt-1">
                      <Progress value={percent} className="h-1.5 min-w-0 flex-1" aria-label="Progression de l’envoi" />
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {percent} % · {formatBytes(job.bytesSent)} sur {formatBytes(total)}
                      </span>
                    </div>
                  ) : job.state === "processing" ? (
                    <Progress value={100} className="h-1.5 animate-pulse" aria-label="Traitement chez le service" />
                  ) : null}
                  {waitingService && job.note ? <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{job.note}</p> : null}
                  {job.error && job.state !== "done" ? (
                    <StepTimelineDescription className="text-destructive">
                      {job.error}
                      {job.state === "failed" && job.processingSince && !/sans republier/.test(job.error) ? " « Reprendre » repart du même envoi chez le service, sans republier." : ""}
                    </StepTimelineDescription>
                  ) : null}
                  {job.warning ? <p className="text-xs text-pretty text-amber-700 dark:text-amber-400">{job.warning}</p> : null}
                </StepTimelineContent>
              </StepTimelineItem>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </StepTimeline>
  );
}
