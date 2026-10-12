import * as React from "react"
import { CheckIcon, Loader2Icon, MinusIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Frise d'un travail en plusieurs étapes (création par l'assistant, file
 * d'envois…) : chaque étape a son état, un détail, et peut porter une barre
 * de progression ou des actions. On suit un travail long sans le relancer
 * ni deviner où il en est.
 *
 * À ne pas confondre avec `src/components/timeline/`, le rail des mois de la
 * galerie.
 */

type StepState = "pending" | "running" | "done" | "error" | "skipped"

const STATE_LABELS: Record<StepState, string> = {
  pending: "à venir",
  running: "en cours",
  done: "terminée",
  error: "en erreur",
  skipped: "passée",
}

function StepTimeline({ className, ...props }: React.ComponentProps<"ol">) {
  return <ol data-slot="step-timeline" className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)]", className)} {...props} />
}

function StepTimelineItem({
  state = "pending",
  className,
  children,
  ...props
}: React.ComponentProps<"li"> & { state?: StepState }) {
  return (
    <li
      data-slot="step-timeline-item"
      data-state={state}
      className={cn(
        // Le trait qui relie chaque étape à la suivante, sous la pastille.
        "group/step relative flex min-w-0 gap-3 pb-4 last:pb-0",
        "before:absolute before:top-6 before:bottom-0 before:left-[11px] before:w-0.5 before:rounded-full before:bg-border last:before:hidden",
        "data-[state=done]:before:bg-emerald-500/50",
        className
      )}
      {...props}
    >
      {children}
    </li>
  )
}

/** Pastille de l'étape : l'icône de son état, sauf si l'on en donne une. */
function StepTimelineIndicator({ className, children, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="step-timeline-indicator"
      className={cn(
        "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground [&_svg]:size-3.5",
        "group-data-[state=running]/step:border-primary group-data-[state=running]/step:text-primary",
        "group-data-[state=done]/step:border-emerald-500 group-data-[state=done]/step:bg-emerald-500 group-data-[state=done]/step:text-white",
        "group-data-[state=error]/step:border-destructive group-data-[state=error]/step:bg-destructive group-data-[state=error]/step:text-white",
        "group-data-[state=skipped]/step:border-dashed",
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          <Loader2Icon aria-hidden className="hidden animate-spin group-data-[state=running]/step:block" />
          <CheckIcon aria-hidden className="hidden group-data-[state=done]/step:block" />
          <XIcon aria-hidden className="hidden group-data-[state=error]/step:block" />
          <MinusIcon aria-hidden className="hidden group-data-[state=skipped]/step:block" />
          <span aria-hidden className="hidden size-1.5 rounded-full bg-muted-foreground/50 group-data-[state=pending]/step:block" />
        </>
      )}
    </span>
  )
}

function StepTimelineContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="step-timeline-content" className={cn("grid min-w-0 flex-1 gap-1 pt-0.5", className)} {...props} />
}

function StepTimelineTitle({
  className,
  children,
  state,
  ...props
}: React.ComponentProps<"div"> & {
  /** L'état est lu aux lecteurs d'écran avec le titre. */
  state?: StepState
}) {
  return (
    <div
      data-slot="step-timeline-title"
      className={cn(
        "min-w-0 text-sm leading-snug break-words",
        "group-data-[state=pending]/step:text-muted-foreground group-data-[state=running]/step:font-medium group-data-[state=skipped]/step:text-muted-foreground group-data-[state=skipped]/step:line-through",
        className
      )}
      {...props}
    >
      {children}
      {state && <span className="sr-only">, {STATE_LABELS[state]}</span>}
    </div>
  )
}

function StepTimelineDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="step-timeline-description"
      className={cn("min-w-0 text-xs break-words text-muted-foreground group-data-[state=error]/step:text-destructive", className)}
      {...props}
    />
  )
}

export {
  StepTimeline,
  StepTimelineItem,
  StepTimelineIndicator,
  StepTimelineContent,
  StepTimelineTitle,
  StepTimelineDescription,
  type StepState,
}
