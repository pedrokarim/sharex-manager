"use client"

import type { CSSProperties, ComponentProps } from "react"

import { useTranslation } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Indicateur d'attente court : une matrice de 4 × 4 points qui s'allument tour
 * à tour (motif « Matrix dot loader » de transitions.dev). Il remplace l'icône
 * d'un bouton ou se glisse dans une ligne de texte ; il prend la couleur du
 * texte et la taille de sa classe (`size-4` par défaut).
 *
 * Variantes :
 * - `orbit` : les points du bord tournent, le cœur reste fixe (par défaut) ;
 * - `scan` : une vague balaie les colonnes de gauche à droite ;
 * - `twinkle` : les points scintillent dans le désordre ;
 * - `pulse` : le cœur s'allume, puis le reste.
 *
 * Pour une attente longue ou un travail de fond, préférer `Orb`.
 */

export type SpinnerVariant = "orbit" | "scan" | "twinkle" | "pulse"

/** Durée d'un cycle, en millisecondes – reprise dans `.sxm-matrix`. */
const CYCLE = 1200
const CORNERS = [0, 3, 12, 15]

/** Retard de chaque point dans le cycle ; `null` : point éteint, fixe. */
function delaysFor(variant: SpinnerVariant): (number | null)[] {
  const delays: (number | null)[] = Array(16).fill(null)
  switch (variant) {
    case "scan":
      return delays.map((_, index) => (index % 4) * (CYCLE / 10))
    case "twinkle":
      ;[7, 2, 11, 5, 14, 9, 0, 12, 3, 15, 6, 10, 13, 1, 8, 4].forEach(
        (dot, order) => (delays[dot] = order * (CYCLE / 16))
      )
      return delays
    case "orbit":
      ;[1, 2, 7, 11, 14, 13, 8, 4].forEach(
        (dot, order) => (delays[dot] = order * (CYCLE / 8))
      )
      return delays
    case "pulse":
      return delays.map((_, index) =>
        [5, 6, 9, 10].includes(index) ? 0 : CYCLE * 0.16
      )
  }
}

const DELAYS: Record<SpinnerVariant, (number | null)[]> = {
  orbit: delaysFor("orbit"),
  scan: delaysFor("scan"),
  twinkle: delaysFor("twinkle"),
  pulse: delaysFor("pulse"),
}

/** Une taille déjà donnée (`size-3`, `h-4 w-4`) remplace celle par défaut. */
const SIZED = /(^|\s)(size|h|w)-/

interface SpinnerProps extends Omit<ComponentProps<"span">, "children"> {
  variant?: SpinnerVariant
  /** Nom lu par les lecteurs d'écran ; « Chargement… » par défaut. */
  label?: string
}

function Spinner({ className, variant = "orbit", label, ...props }: SpinnerProps) {
  const { t } = useTranslation()
  const delays = DELAYS[variant]
  // `orbit` arrondit la matrice : les coins ne s'affichent pas.
  const rounded = variant === "orbit"

  return (
    <span
      role="status"
      aria-label={label ?? t("common.loading")}
      data-slot="spinner"
      className={cn("sxm-matrix", !SIZED.test(className ?? "") && "size-4", className)}
      {...props}
    >
      <span>
        {delays.map((delay, index) => (
          <i
            key={index}
            data-gap={rounded && CORNERS.includes(index) ? "" : undefined}
            data-still={delay === null ? "" : undefined}
            style={delay === null ? undefined : ({ "--d": delay } as CSSProperties)}
          />
        ))}
      </span>
    </span>
  )
}

export { Spinner }
