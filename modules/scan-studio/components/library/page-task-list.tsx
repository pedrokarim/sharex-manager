"use client";

import { motion } from "framer-motion";
import { Check, Clock3, Loader2, Minus, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type PageTaskState = "waiting" | "running" | "done" | "skipped" | "error";

export interface PageTask {
  id: string;
  /** « Page 4 ». */
  label: string;
  state: PageTaskState;
  /** Ce qui se passe, ou ce qui s'est passé : « Traduction… », « 6 zones traduites ». */
  detail?: string;
  /** Avancement de la page, de 0 à 1, quand le travail sait le dire. */
  progress?: number;
}

const STATE_LABELS: Record<PageTaskState, string> = {
  waiting: "En attente",
  running: "En cours",
  done: "Terminée",
  skipped: "Passée",
  error: "Échec",
};

function StateIcon({ state }: { state: PageTaskState }) {
  const className = "h-3.5 w-3.5 shrink-0";
  if (state === "running") return <Loader2 aria-hidden className={cn(className, "animate-spin text-primary")} />;
  if (state === "done") return <Check aria-hidden className={cn(className, "text-emerald-600 dark:text-emerald-400")} />;
  if (state === "error") return <TriangleAlert aria-hidden className={cn(className, "text-destructive")} />;
  if (state === "skipped") return <Minus aria-hidden className={cn(className, "text-muted-foreground/60")} />;
  return <Clock3 aria-hidden className={cn(className, "text-muted-foreground/60")} />;
}

/** Un travail page par page : chaque ligne dit où elle en est. */
export function PageTaskList({ tasks, label }: { tasks: PageTask[]; label: string }) {
  return (
    <ul aria-label={label} className="flex max-h-64 flex-col overflow-y-auto pr-1">
      {tasks.map((task) => (
        <motion.li
          key={task.id}
          layout="position"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: task.state === "waiting" ? 0.6 : 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="flex min-w-0 items-center gap-2 py-1 text-sm"
        >
          <StateIcon state={task.state} />
          <span className="sr-only">{STATE_LABELS[task.state]}</span>
          <span className="shrink-0 font-medium tabular-nums">{task.label}</span>
          {task.detail && (
            <span className={cn("min-w-0 truncate text-xs tabular-nums", task.state === "error" ? "text-destructive" : "text-muted-foreground")} title={task.detail}>
              {task.detail}
            </span>
          )}
          {task.state === "running" && task.progress !== undefined && (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{Math.round(task.progress * 100)} %</span>
          )}
        </motion.li>
      ))}
    </ul>
  );
}
