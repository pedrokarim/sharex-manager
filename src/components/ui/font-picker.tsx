"use client"

import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * Choix d'une police dans une palette : chaque police est écrite dans sa
 * propre fonte, avec une phrase d'exemple, et se cherche au clavier. On
 * choisit une police en la voyant, pas sur son nom.
 */

interface FontOption {
  /** Valeur enregistrée : la famille CSS, le plus souvent. */
  value: string
  label: string
  /** Famille CSS qui dessine l'aperçu. */
  family: string
  /** Mention discrète : « Importée », graisses disponibles… */
  hint?: string
}

interface FontPickerProps {
  value: string
  onValueChange: (value: string) => void
  groups: { label: string; fonts: FontOption[] }[]
  /** Phrase d'exemple écrite sous le nom de chaque police. */
  sample?: string
  /** Nom accessible du bouton. */
  label: string
  disabled?: boolean
  className?: string
}

const fontStack = (family: string) => `"${family}", system-ui, sans-serif`

function FontPicker({ value, onValueChange, groups, sample, label, disabled, className }: FontPickerProps) {
  const [open, setOpen] = React.useState(false)
  const current = groups.flatMap((group) => group.fonts).find((font) => font.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`${label} : ${current?.label ?? value}`}
          disabled={disabled}
          data-slot="font-picker-trigger"
          className={cn("w-full min-w-0 justify-between gap-2 px-3 font-normal", className)}
        >
          <span className="min-w-0 truncate text-base" style={{ fontFamily: fontStack(current?.family ?? value) }}>
            {current?.label ?? value}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command
          filter={(itemValue, search) => (itemValue.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")) ? 1 : 0)}
        >
          <CommandInput placeholder="Chercher une police…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Aucune police de ce nom.</CommandEmpty>
            {groups
              .filter((group) => group.fonts.length > 0)
              .map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.fonts.map((font) => (
                    <CommandItem
                      key={font.value}
                      value={`${font.label} ${font.value}`}
                      onSelect={() => {
                        onValueChange(font.value)
                        setOpen(false)
                      }}
                      className="items-start gap-2 py-2"
                    >
                      <CheckIcon className={cn("mt-1 size-4", font.value === value ? "opacity-100" : "opacity-0")} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="min-w-0 truncate text-lg leading-tight" style={{ fontFamily: fontStack(font.family) }}>
                            {font.label}
                          </span>
                          {font.hint && <span className="shrink-0 text-[11px] text-muted-foreground">{font.hint}</span>}
                        </span>
                        {sample && (
                          <span className="truncate text-sm text-muted-foreground" style={{ fontFamily: fontStack(font.family) }}>
                            {sample}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { FontPicker, type FontOption }
