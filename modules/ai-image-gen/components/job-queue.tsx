"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Ban,
  Terminal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { callModule, isJobActive, timeAgo, type Job } from "../lib/client";

interface JobQueueProps {
  jobs: Job[];
  onMutate: () => void;
}

/**
 * La file d'attente est la pièce qui rend le studio utilisable avec un moteur
 * CLI : une génération y prend une minute ou plus, et sans retour visible
 * l'interface paraîtrait figée. On y montre l'étape en cours et, sur demande,
 * le journal brut de l'agent.
 */
export function JobQueue({ jobs, onMutate }: JobQueueProps) {
  const active = jobs.filter(isJobActive);
  const finished = jobs.filter((job) => !isJobActive(job)).slice(0, 8);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          File d&apos;attente
          {active.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {active.length}
            </Badge>
          )}
        </h2>
        {finished.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={async () => {
              await callModule("clearJobs");
              onMutate();
            }}
          >
            Vider
          </Button>
        )}
      </header>

      {active.length === 0 && finished.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          Aucune génération en cours.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {[...active, ...finished].map((job) => (
          <JobRow key={job.id} job={job} onMutate={onMutate} />
        ))}
      </div>
    </section>
  );
}

function JobRow({ job, onMutate }: { job: Job; onMutate: () => void }) {
  const [openLog, setOpenLog] = useState(false);
  const active = isJobActive(job);

  const percent =
    job.progress.total > 0
      ? Math.round((job.progress.current / job.progress.total) * 100)
      : 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-2.5 text-xs",
        job.status === "error" && "border-destructive/40"
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">
          {job.status === "running" && <Spinner className="h-3.5 w-3.5" />}
          {job.status === "queued" && (
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {job.status === "done" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          {job.status === "error" && (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          )}
          {job.status === "canceled" && (
            <Ban className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-2 leading-4" title={job.request.prompt}>
            {job.request.prompt}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{job.modelLabel}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">{job.request.size}</span>
            <span aria-hidden>·</span>
            <span>{job.request.n} image(s)</span>
            <span aria-hidden>·</span>
            <span>{timeAgo(job.createdAt)}</span>
          </p>
        </div>

        {active && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label="Annuler"
            onClick={async () => {
              await callModule("cancelGeneration", job.id);
              toast.info("Génération annulée");
              onMutate();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {active && (
        <div className="mt-2 space-y-1">
          {job.progress.total > 1 && <Progress value={percent} className="h-1" />}
          <p className="truncate text-[10px] text-muted-foreground">
            {job.pipelineStep
              ? `Étape ${job.pipelineStep.index + 1}/${job.pipelineStep.total} · ${job.progress.label}`
              : job.progress.label}
          </p>
        </div>
      )}

      {job.error && (
        <p className="mt-2 rounded bg-destructive/10 px-2 py-1.5 text-[11px] leading-4 text-destructive">
          {job.error}
        </p>
      )}

      {job.log.length > 0 && (
        <Collapsible open={openLog} onOpenChange={setOpenLog} className="mt-1.5">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
            >
              <Terminal className="h-3 w-3" />
              Journal
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  openLog && "rotate-180"
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/60 p-2 text-[10px] leading-4 whitespace-pre-wrap">
              {job.log
                .slice(-40)
                .map((line) => `${line.level === "error" ? "! " : ""}${line.text}`)
                .join("\n")}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
