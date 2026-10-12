"use client"

import * as React from "react"
import { PipetteIcon } from "lucide-react"
import { HexColorPicker } from "react-colorful"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * Sélecteur de couleur : une pastille qui ouvre un nuancier, la saisie du
 * code hexadécimal, la pipette quand le navigateur la propose, et des teintes
 * proposées d'un clic (la palette d'une marque, par exemple).
 */

/** Code hexadécimal saisi (« fa0 », « #FFAA00 ») ramené à `#rrggbb`, ou `null` s'il est illisible. */
function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "")
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.replace(/./g, (c) => c + c)}`.toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toLowerCase()
  if (/^[0-9a-f]{8}$/i.test(raw)) return `#${raw.slice(0, 6)}`.toLowerCase()
  return null
}

/** Couleur CSS (hexadécimale ou `rgb()`/`rgba()`) ramenée à `#rrggbb` ; noir si elle est illisible. */
function toHex(color: string): string {
  const hex = normalizeHex(color)
  if (hex) return hex
  const match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(color)
  if (!match) return "#000000"
  return `#${match
    .slice(1, 4)
    .map((value) => Math.min(255, Number(value)).toString(16).padStart(2, "0"))
    .join("")}`
}

interface EyeDropperResult {
  sRGBHex: string
}
type EyeDropperConstructor = new () => { open: () => Promise<EyeDropperResult> }

/** La pipette n'existe que dans certains navigateurs (Chrome, Edge) : on ne l'affiche qu'alors. */
function useEyeDropper(): EyeDropperConstructor | null {
  const [dropper, setDropper] = React.useState<EyeDropperConstructor | null>(null)
  React.useEffect(() => {
    const candidate = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper
    if (typeof candidate === "function") setDropper(() => candidate)
  }, [])
  return dropper
}

/** Champ du code hexadécimal : la valeur ne part qu'une fois lisible (Entrée ou sortie du champ). */
function HexInput({
  value,
  onChange,
  label,
  className,
  children,
}: {
  value: string
  onChange: (hex: string) => void
  label: string
  className?: string
  children?: React.ReactNode
}) {
  const [draft, setDraft] = React.useState(value.replace(/^#/, ""))
  React.useEffect(() => setDraft(value.replace(/^#/, "")), [value])

  const commit = (next: string) => {
    const hex = normalizeHex(next)
    if (hex) {
      if (hex !== value) onChange(hex)
      setDraft(hex.slice(1))
    } else {
      setDraft(value.replace(/^#/, ""))
    }
  }

  return (
    <InputGroup className={cn("h-8 w-28", className)}>
      <InputGroupAddon className="pl-2.5 font-mono text-xs">#</InputGroupAddon>
      <InputGroupInput
        aria-label={`${label}, code hexadécimal`}
        value={draft}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit(event.currentTarget.value)
          }
        }}
        className="h-8 pl-0.5 font-mono text-xs uppercase"
      />
      {children}
    </InputGroup>
  )
}

interface ColorPickerProps {
  value: string
  /** Toujours un code `#rrggbb`. */
  onChange: (hex: string) => void
  /** Nom accessible de la pastille : « Couleur du fond ». */
  label: string
  /** Teintes proposées d'un clic sous le nuancier. */
  swatches?: { color: string; label: string }[]
  /** Montre aussi le code hexadécimal à côté de la pastille. */
  showInput?: boolean
  disabled?: boolean
  /** Contenu ajouté sous le nuancier (contraste, conseil…). */
  children?: React.ReactNode
  align?: "start" | "center" | "end"
  className?: string
  triggerClassName?: string
}

function ColorPicker({
  value,
  onChange,
  label,
  swatches,
  showInput = false,
  disabled = false,
  children,
  align = "start",
  className,
  triggerClassName,
}: ColorPickerProps) {
  const hex = toHex(value)
  const EyeDropper = useEyeDropper()
  const [open, setOpen] = React.useState(false)

  const pick = async () => {
    if (!EyeDropper) return
    try {
      const result = await new EyeDropper().open()
      const next = normalizeHex(result.sRGBHex) ?? toHex(result.sRGBHex)
      onChange(next)
    } catch {
      // Pipette abandonnée (Échap) : rien ne change.
    }
  }

  return (
    <div data-slot="color-picker" className={cn("flex min-w-0 items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${label} : ${hex}`}
            title={label}
            data-slot="color-picker-trigger"
            className={cn(
              "size-8 shrink-0 rounded-md border shadow-xs transition-transform outline-none hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
              triggerClassName
            )}
            style={{ backgroundColor: value }}
          />
        </PopoverTrigger>
        <PopoverContent align={align} className="flex w-64 flex-col gap-3 p-3">
          <HexColorPicker
            color={hex}
            onChange={(next) => onChange(next.toLowerCase())}
            className="!h-40 !w-full"
          />
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-8 shrink-0 rounded-md border" style={{ backgroundColor: hex }} />
            <HexInput value={hex} onChange={onChange} label={label} className="min-w-0 flex-1" />
            {EyeDropper && (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Prendre une couleur à l’écran"
                title="Prendre une couleur à l’écran"
                onClick={() => void pick()}
              >
                <PipetteIcon />
              </Button>
            )}
          </div>
          {swatches && swatches.length > 0 && (
            <div role="group" aria-label="Teintes proposées" className="flex flex-wrap gap-1.5">
              {swatches.map((swatch) => {
                const color = toHex(swatch.color)
                return (
                  <button
                    key={`${swatch.label}-${color}`}
                    type="button"
                    title={`${swatch.label} · ${color}`}
                    aria-label={`${swatch.label} : ${color}`}
                    aria-pressed={color === hex}
                    onClick={() => onChange(color)}
                    className="size-6 rounded-md border shadow-xs outline-none transition-transform hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-1 aria-pressed:ring-offset-popover"
                    style={{ backgroundColor: color }}
                  />
                )
              })}
            </div>
          )}
          {children}
        </PopoverContent>
      </Popover>
      {showInput && (
        <HexInput value={hex} onChange={onChange} label={label} className={EyeDropper ? "w-34" : undefined}>
          {EyeDropper && (
            <InputGroupAddon align="inline-end" className="py-0 pr-1 has-[>button]:mr-0">
              <InputGroupButton
                size="icon-xs"
                aria-label="Prendre une couleur à l’écran"
                title="Prendre une couleur à l’écran"
                disabled={disabled}
                onClick={() => void pick()}
              >
                <PipetteIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </HexInput>
      )}
    </div>
  )
}

export { ColorPicker, normalizeHex, toHex }
