import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Lisibilité d'un texte sur un fond : pastille de couleur, rapport WCAG et
 * aperçu du texte posé sur le fond. On juge un contraste là où l'on choisit
 * la couleur, sans aller le chercher dans un autre écran.
 */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Couleur hexadécimale (#abc ou #aabbcc) en composantes 0–255, ou `null`. */
function parseHex(color: string): [number, number, number] | null {
  const match = HEX.exec(color.trim())
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c)
  const value = Number.parseInt(hex, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Rapport de contraste WCAG entre deux couleurs hexadécimales (de 1 à 21 ; 1 si l'une est illisible). */
function contrastRatio(a: string, b: string): number {
  const first = parseHex(a)
  const second = parseHex(b)
  if (!first || !second) return 1
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

type ContrastLevel = "aaa" | "aa" | "large" | "fail"

/** Niveau WCAG atteint par un texte courant : AAA (7), AA (4,5), grand texte seulement (3), insuffisant. */
function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return "aaa"
  if (ratio >= 4.5) return "aa"
  if (ratio >= 3) return "large"
  return "fail"
}

const LEVEL_LABELS: Record<ContrastLevel, string> = {
  aaa: "Très lisible",
  aa: "Lisible",
  large: "Grands textes seulement",
  fail: "Peu lisible",
}

const LEVEL_DOTS: Record<ContrastLevel, string> = {
  aaa: "bg-emerald-500",
  aa: "bg-emerald-500",
  large: "bg-amber-500",
  fail: "bg-red-500",
}

const ratioFormat = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function ContrastIndicator({
  foreground,
  background,
  sample = "Aa",
  showLabel = true,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  /** Couleur du texte. */
  foreground: string
  /** Couleur du fond. */
  background: string
  /** Texte de l'aperçu. */
  sample?: string
  /** Le niveau en toutes lettres à côté du rapport. */
  showLabel?: boolean
}) {
  const ratio = contrastRatio(foreground, background)
  const level = contrastLevel(ratio)
  const value = `${ratioFormat.format(Math.floor(ratio * 10) / 10)} : 1`
  return (
    <div
      data-slot="contrast-indicator"
      data-level={level}
      className={cn("flex min-w-0 items-center gap-2.5", className)}
      {...props}
    >
      <span
        aria-hidden
        data-slot="contrast-sample"
        className="flex h-8 min-w-12 shrink-0 items-center justify-center rounded-md border px-2 text-sm font-semibold"
        style={{ backgroundColor: background, color: foreground }}
      >
        {sample}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", LEVEL_DOTS[level])} />
        <span className="font-medium tabular-nums">{value}</span>
        {showLabel ? (
          <span className="truncate text-muted-foreground">{LEVEL_LABELS[level]}</span>
        ) : (
          <span className="sr-only">{LEVEL_LABELS[level]}</span>
        )}
      </span>
    </div>
  )
}

export { ContrastIndicator, contrastLevel, contrastRatio, parseHex, type ContrastLevel }
