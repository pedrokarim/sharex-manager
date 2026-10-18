"use client";

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pièces communes du banc : la grille de cases, la case (le visuel, puis le
 * nom du composant et les propriétés employées), le cadre réduit d'un écran
 * entier et le bouton qui rejoue une animation à un coup.
 */

/** Grille de cases : colonnes de 14 rem au moins, jamais plus larges que le panneau. */
export function BenchGrid({ className, wide = false, children }: { className?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-3",
        wide
          ? "grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]"
          : "grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))]",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Une case : le visuel en direct, centré, puis sa légende. `props` reprend
 * les propriétés passées, telles qu'on les écrit dans le code.
 */
export function BenchCell({
  name,
  props,
  note,
  stageClassName,
  className,
  children,
}: {
  name: string;
  props?: string;
  note?: ReactNode;
  stageClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-3 rounded-lg bg-muted/40 p-3", className)}>
      <div className={cn("flex min-h-20 min-w-0 flex-1 items-center justify-center", stageClassName)}>{children}</div>
      <figcaption className="grid min-w-0 gap-0.5">
        <code className="font-mono text-xs font-medium [overflow-wrap:anywhere]">{name}</code>
        {props ? <code className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{props}</code> : null}
        {note ? <p className="text-xs text-pretty text-muted-foreground">{note}</p> : null}
      </figcaption>
    </figure>
  );
}

/**
 * Écran entier montré au quart de sa surface : le contenu est rendu sur le
 * double de la largeur du cadre, puis réduit de moitié. Les points de rupture
 * (`sm:`, `xl:`…) restent ceux de la fenêtre, pas ceux du cadre.
 */
export function PreviewFrame({
  title,
  detail,
  className,
  children,
}: {
  /** En général la route concernée. */
  title: string;
  detail?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={cn("grid min-w-0 content-start gap-2", className)}>
      <figcaption className="grid min-w-0 gap-0.5">
        <code className="font-mono text-xs font-medium [overflow-wrap:anywhere]">{title}</code>
        {detail ? <span className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{detail}</span> : null}
      </figcaption>
      <div className="relative h-56 min-w-0 overflow-hidden rounded-lg border bg-background" inert>
        <div className="absolute top-0 left-0 flex w-[200%] origin-top-left scale-50 flex-col p-6">{children}</div>
      </div>
    </figure>
  );
}

/** Rejoue les animations à un coup d'un panneau (fondu d'arrivée, coche, secousse). */
export function ReplayButton({ onReplay }: { onReplay: () => void }) {
  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={onReplay}>
      <RotateCcw className="size-3.5" />
      Relancer
    </Button>
  );
}
