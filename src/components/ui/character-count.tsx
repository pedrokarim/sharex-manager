import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Compteur « 37/100 » d'un champ limité : on voit la limite avant que le
 * serveur ou la plateforme ne refuse le texte. Il passe à l'orange à 90 %, au
 * rouge au-delà. En octets (`unit="bytes"`) pour les limites qui les comptent,
 * comme une description YouTube.
 */

const encoder = typeof TextEncoder === "undefined" ? null : new TextEncoder()

/** Longueur comptée comme la compte la limite : caractères ou octets UTF-8. */
function measureText(value: string, unit: "chars" | "bytes" = "chars"): number {
  if (unit === "bytes") return encoder ? encoder.encode(value).length : value.length
  return value.length
}

const numberFormat = new Intl.NumberFormat("fr-FR")

function CharacterCount({
  value,
  max,
  unit = "chars",
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  value: string
  max: number
  unit?: "chars" | "bytes"
}) {
  const length = measureText(value, unit)
  const state = length > max ? "over" : length >= max * 0.9 ? "near" : "ok"
  return (
    <span
      data-slot="character-count"
      data-state={state}
      className={cn(
        "shrink-0 text-xs text-muted-foreground tabular-nums data-[state=near]:text-amber-700 data-[state=over]:font-medium data-[state=over]:text-destructive dark:data-[state=near]:text-amber-400",
        className
      )}
      {...props}
    >
      {numberFormat.format(length)}/{numberFormat.format(max)}
      {unit === "bytes" && <span className="sr-only"> octets</span>}
      {state === "over" && <span className="sr-only">, trop long</span>}
    </span>
  )
}

export { CharacterCount, measureText }
