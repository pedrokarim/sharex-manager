"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  StepTimeline,
  StepTimelineContent,
  StepTimelineDescription,
  StepTimelineIndicator,
  StepTimelineItem,
  StepTimelineTitle,
} from "@/components/ui/step-timeline";
import { cn } from "@/lib/utils";
import { editorHref, type KitAssistantJob } from "../lib/client";

const STATUS_LABELS: Record<KitAssistantJob["status"], string> = {
  running: "En cours",
  done: "Terminée",
  error: "Échec",
  canceled: "Annulée",
};

/** « 2 sur 4 » : l'avancement d'une étape qui compte ses visuels. */
function countOf(detail: string | undefined): { done: number; total: number } | null {
  const match = detail ? /(\d+)\s+sur\s+(\d+)/.exec(detail) : null;
  if (!match) return null;
  const total = Number(match[2]);
  return total > 0 ? { done: Number(match[1]), total } : null;
}

/**
 * Le suivi d'une création par l'assistant : la frise de ses étapes, la
 * progression des visuels, puis l'accès direct à la marque produite.
 */
export function AssistantJobProgress({
  job,
  onCancel,
  onDismiss,
  onOpen,
}: {
  job: KitAssistantJob;
  onCancel?: () => void;
  onDismiss?: () => void;
  /** Appelé en ouvrant la marque (pour fermer un tiroir, par exemple). */
  onOpen?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm break-words" title={job.brief}>
            {job.brief}
          </p>
          <p className={cn("mt-0.5 text-xs", job.status === "error" ? "text-destructive" : "text-muted-foreground")}>{STATUS_LABELS[job.status]}</p>
        </div>
        {onDismiss && job.status !== "running" && (
          <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Masquer" onClick={onDismiss}>
            <X className="size-4" />
          </Button>
        )}
      </div>
      <StepTimeline aria-label="Étapes de la création">
        {job.steps.map((step) => {
          const count = step.state === "running" ? countOf(step.detail) : null;
          return (
            <StepTimelineItem key={step.id} state={step.state}>
              <StepTimelineIndicator />
              <StepTimelineContent>
                <StepTimelineTitle state={step.state}>{step.label}</StepTimelineTitle>
                {step.detail && <StepTimelineDescription>{step.detail}</StepTimelineDescription>}
                {count && <Progress value={(count.done / count.total) * 100} className="h-1.5" aria-label={`${step.label} : ${count.done} sur ${count.total}`} />}
              </StepTimelineContent>
            </StepTimelineItem>
          );
        })}
      </StepTimeline>
      {job.status === "error" && job.error && <p className="text-sm break-words text-destructive">{job.error}</p>}
      {(job.kitId || (onCancel && job.status === "running")) && (
        <div className="flex flex-wrap gap-2">
          {job.kitId && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href={editorHref(job.kitId)} onClick={onOpen}>
                Ouvrir la marque
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
          {onCancel && job.status === "running" && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Annuler
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Créations de l'assistant en cours ou récentes, au-dessus de la liste des marques. */
export function AssistantJobs({ jobs, onCancel, onDismiss }: { jobs: KitAssistantJob[]; onCancel: (id: string) => void; onDismiss: (id: string) => void }) {
  return (
    <AnimatePresence initial={false}>
      {jobs.length > 0 && (
        <motion.section
          key="assistant-jobs"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="flex flex-col gap-3 overflow-hidden"
          aria-label="Créations de l’assistant"
        >
          <h2 className="text-sm font-semibold">Créations de l’assistant</h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {jobs.map((job) => (
                <motion.li
                  key={job.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="min-w-0 rounded-xl border p-4"
                >
                  <AssistantJobProgress job={job} onCancel={() => onCancel(job.id)} onDismiss={() => onDismiss(job.id)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
