"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Sélecteur de position sur un cadre : on clique l'endroit de l'image où
 * poser un élément (filigrane, logo) au lieu de choisir « en haut à droite »
 * dans une liste. Quatre coins ou neuf zones ; le cadre prend le rapport de
 * l'image (9:16, 16:9…) et peut montrer, en dessous, l'aperçu du résultat.
 */

type FramePosition =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"

const GRID: FramePosition[][] = [
  ["top-left", "top", "top-right"],
  ["left", "center", "right"],
  ["bottom-left", "bottom", "bottom-right"],
]

const CORNERS: FramePosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"]
const ALL: FramePosition[] = GRID.flat()

const POSITION_LABELS: Record<FramePosition, string> = {
  "top-left": "En haut à gauche",
  top: "En haut au centre",
  "top-right": "En haut à droite",
  left: "Au milieu à gauche",
  center: "Au centre",
  right: "Au milieu à droite",
  "bottom-left": "En bas à gauche",
  bottom: "En bas au centre",
  "bottom-right": "En bas à droite",
}

/** Ligne et colonne d'une position dans la grille de trois sur trois. */
function cellOf(position: FramePosition): [number, number] {
  const row = GRID.findIndex((line) => line.includes(position))
  return [row, GRID[row].indexOf(position)]
}

/** Position voisine dans une direction, parmi celles proposées ; la même si aucune. */
function neighbour(position: FramePosition, available: FramePosition[], dRow: number, dCol: number): FramePosition {
  let [row, col] = cellOf(position)
  for (let step = 0; step < 3; step++) {
    row += dRow
    col += dCol
    if (row < 0 || row > 2 || col < 0 || col > 2) return position
    const candidate = GRID[row][col]
    if (available.includes(candidate)) return candidate
  }
  return position
}

interface PositionPickerProps<T extends FramePosition> extends Omit<React.ComponentProps<"div">, "onChange" | "defaultValue"> {
  value: T
  onValueChange: (position: T) => void
  /** Quatre coins, neuf zones, ou une liste choisie. */
  positions?: "corners" | "grid" | T[]
  /** Rapport du cadre, largeur sur hauteur : `9 / 16` pour un short. */
  ratio?: number
  /** Nom accessible du groupe. */
  label: string
  /** Libellés propres à l'usage, à la place de « En haut à gauche »… */
  labels?: Partial<Record<T, string>>
  /**
   * Repère de la zone choisie ; inutile quand l'aperçu montre déjà l'élément.
   * Les autres zones gardent un repère discret : on voit où cliquer.
   */
  showMarker?: boolean
  disabled?: boolean
  /** Ce que montre le cadre sous les zones : image, aperçu de l'élément posé… */
  children?: React.ReactNode
}

function PositionPicker<T extends FramePosition>({
  value,
  onValueChange,
  positions = "grid",
  ratio = 16 / 9,
  label,
  labels,
  showMarker = true,
  disabled = false,
  children,
  className,
  style,
  ...props
}: PositionPickerProps<T>) {
  const available = (positions === "corners" ? CORNERS : positions === "grid" ? ALL : positions) as T[]
  const corners = positions === "corners"
  const refs = React.useRef(new Map<T, HTMLButtonElement>())

  const move = (event: React.KeyboardEvent, from: T) => {
    const directions: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    // Avec quatre coins, une flèche saute directement au coin opposé.
    const next = neighbour(from, available, corners ? direction[0] * 2 : direction[0], corners ? direction[1] * 2 : direction[1]) as T
    if (next !== from) {
      onValueChange(next)
      refs.current.get(next)?.focus()
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-slot="position-picker"
      className={cn(
        "relative w-full overflow-hidden rounded-md border bg-muted/40 select-none aria-disabled:pointer-events-none aria-disabled:opacity-50",
        className
      )}
      style={{ aspectRatio: String(ratio), ...style }}
      {...props}
    >
      {children && <div className="pointer-events-none absolute inset-0">{children}</div>}
      <div className={cn("absolute inset-0 grid", corners ? "grid-cols-2 grid-rows-2" : "grid-cols-3 grid-rows-3")}>
        {(corners ? CORNERS : ALL).map((position) => {
          const enabled = available.includes(position as T)
          const selected = position === value
          const [row, col] = cellOf(position)
          const name = labels?.[position as T] ?? POSITION_LABELS[position]
          if (!enabled) return <span key={position} aria-hidden />
          return (
            <button
              key={position}
              ref={(node) => {
                if (node) refs.current.set(position as T, node)
                else refs.current.delete(position as T)
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name}
              title={name}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              data-slot="position-picker-zone"
              data-position={position}
              onClick={() => onValueChange(position as T)}
              onKeyDown={(event) => move(event, position as T)}
              className={cn(
                "group/zone relative flex p-[6%] outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                row === 0 ? "items-start" : row === 1 && !corners ? "items-center" : "items-end",
                col === 0 ? "justify-start" : col === 1 && !corners ? "justify-center" : "justify-end",
                selected && "bg-primary/10 hover:bg-primary/10"
              )}
            >
              {(showMarker || !selected) && (
                <span
                  aria-hidden
                  className={cn(
                    "size-3 rounded-full border-2 transition-all",
                    selected
                      ? "scale-110 border-primary bg-primary shadow-sm"
                      : // Blanc cerclé d'ombre : lisible sur un fond clair comme sombre (le cadre montre souvent une image).
                        "border-white/90 bg-black/20 shadow-sm group-hover/zone:bg-black/40"
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { PositionPicker, POSITION_LABELS, type FramePosition }
