"use client";

/**
 * Options d'une idée, au format de la page de création : type, durée,
 * séquences (« Auto » ou un nombre), format, et la vidéo source quand l'idée
 * se monte par-dessus une vidéo. Des puces discrètes, pas des tuiles.
 */

import type { ReactNode } from "react";
import { Clock, Film, Layers, RectangleVertical, Shapes } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Idea, IdeaTemplate } from "../lib/idea-types";

export const IDEA_TEMPLATE_LABELS: Record<IdeaTemplate, string> = { free: "Libre", quiz: "Quiz", top: "Classement", slideshow: "Diaporama" };

const COUNT_UNITS: Record<IdeaTemplate, string> = { free: "séquences", quiz: "questions", top: "éléments", slideshow: "diapositives" };

/** « 5 questions » ou « Découpage auto ». */
export function ideaCountLabel(template: IdeaTemplate, count: number | undefined): string {
  return count === undefined ? "Découpage auto" : `${count} ${COUNT_UNITS[template]}`;
}

function Chip({ icon: Icon, children, title }: { icon: typeof Clock; children: ReactNode; title?: string }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/70" title={title}>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function IdeaOptionChips({ idea, className }: { idea: Pick<Idea, "template" | "count" | "targetSeconds" | "aspect" | "sourceVideoHint">; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)} aria-label="Options de création">
      <Chip icon={Shapes} title="Forme du clip">
        {IDEA_TEMPLATE_LABELS[idea.template]}
      </Chip>
      <Chip icon={Clock} title="Durée visée">
        <span className="tabular-nums">{idea.targetSeconds}&nbsp;s</span>
      </Chip>
      <Chip icon={Layers} title={idea.count === undefined ? "Le script choisit le nombre de séquences selon la durée" : "Nombre de séquences"}>
        {ideaCountLabel(idea.template, idea.count)}
      </Chip>
      <Chip icon={RectangleVertical} title="Format">
        <span className="tabular-nums">{idea.aspect}</span>
      </Chip>
      {idea.sourceVideoHint ? (
        <Chip icon={Film} title={`Vidéo source : ${idea.sourceVideoHint}`}>
          Sur une vidéo
        </Chip>
      ) : null}
    </div>
  );
}
