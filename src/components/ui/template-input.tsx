"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { CharacterCount, measureText } from "@/components/ui/character-count"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group"

/**
 * Champ de modèle à variables : les variables s'insèrent d'un clic à
 * l'endroit du curseur (rien à retenir ni à taper), et l'aperçu rempli avec
 * des valeurs d'exemple s'affiche juste en dessous, avec la limite que le
 * texte final doit tenir.
 */

interface TemplateVariable {
  /** Nom entre accolades : `title` pour `{title}`. */
  name: string
  /** Ce que la variable contient : « Titre du clip ». */
  label: string
  /** Valeur d'exemple de l'aperçu. */
  sample: string
}

/** Remplace chaque `{nom}` connu par sa valeur ; une variable inconnue reste telle quelle. */
function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z][\w-]*)\}/g, (match, name: string) => (name in values ? values[name] : match))
}

interface TemplateInputProps {
  value: string
  onChange: (value: string) => void
  variables: TemplateVariable[]
  /** Zone de texte sur plusieurs lignes plutôt qu'un champ d'une ligne. */
  multiline?: boolean
  rows?: number
  /** Longueur du modèle lui-même, au plus. */
  maxLength?: number
  /** Limite du texte rempli (celle de la plateforme). */
  limit?: { max: number; unit?: "chars" | "bytes" }
  /** Montre l'aperçu rempli sous le champ. */
  preview?: boolean
  /**
   * Remplissage de l'aperçu, quand l'application a le sien (dates, mots-dièse,
   * nettoyage des blancs) ; sinon chaque variable prend sa valeur d'exemple.
   */
  render?: (template: string) => string
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  "aria-describedby"?: string
}

function TemplateInput({
  value,
  onChange,
  variables,
  multiline = false,
  rows = 4,
  maxLength,
  limit,
  preview = true,
  render,
  id,
  placeholder,
  disabled,
  className,
  "aria-describedby": describedBy,
}: TemplateInputProps) {
  const control = React.useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const previewId = React.useId()
  const filled = React.useMemo(
    () => (render ? render(value) : fillTemplate(value, Object.fromEntries(variables.map((variable) => [variable.name, variable.sample])))),
    [value, variables, render]
  )

  const insert = (name: string) => {
    const element = control.current
    const token = `{${name}}`
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    if (maxLength && next.length > maxLength) return
    onChange(next)
    // Le curseur se place juste après la variable insérée.
    requestAnimationFrame(() => {
      if (!element) return
      element.focus()
      const caret = start + token.length
      element.setSelectionRange(caret, caret)
    })
  }

  const shared = {
    id,
    value,
    placeholder,
    disabled,
    maxLength,
    spellCheck: true,
    "aria-describedby": [describedBy, preview ? previewId : null].filter(Boolean).join(" ") || undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  }

  return (
    <div data-slot="template-input" className={cn("grid min-w-0 gap-2", className)}>
      <InputGroup>
        {multiline ? (
          <InputGroupTextarea ref={control} rows={rows} className="min-h-0 text-sm" {...shared} />
        ) : (
          <InputGroupInput ref={control} className="text-sm" {...shared} />
        )}
        <InputGroupAddon align="block-end" className="flex-wrap gap-1.5 border-t pt-2 pb-2">
          <span className="text-xs font-normal">Insérer</span>
          {variables.map((variable) => (
            <InputGroupButton
              key={variable.name}
              size="xs"
              variant="secondary"
              disabled={disabled}
              title={`${variable.label} (ex. ${variable.sample})`}
              aria-label={`Insérer ${variable.label.toLocaleLowerCase("fr")}`}
              // Le champ garde le focus et la sélection : la variable va là où était le curseur.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(variable.name)}
              className="font-mono"
            >
              {`{${variable.name}}`}
            </InputGroupButton>
          ))}
          {maxLength && <CharacterCount value={value} max={maxLength} className="ml-auto" />}
        </InputGroupAddon>
      </InputGroup>
      {preview && (
        <div id={previewId} data-slot="template-input-preview" className="grid min-w-0 gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Aperçu avec des valeurs d’exemple</span>
            {limit && <CharacterCount value={filled} max={limit.max} unit={limit.unit} />}
          </div>
          <p
            className={cn(
              "max-h-40 min-h-9 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 text-sm break-words whitespace-pre-wrap",
              !filled.trim() && "text-muted-foreground italic",
              limit && measureText(filled, limit.unit) > limit.max && "ring-1 ring-destructive/40"
            )}
          >
            {filled.trim() ? filled : "Vide"}
          </p>
        </div>
      )}
    </div>
  )
}

export { TemplateInput, fillTemplate, type TemplateVariable }
