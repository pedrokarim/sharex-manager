"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Champ de tags en jetons : Entrée ou virgule ajoute, un collage « a, b, c »
 * ajoute tout d'un coup, Retour arrière sur un champ vide retire le dernier,
 * et chaque jeton se retire d'un clic. Les doublons sont ignorés.
 */

interface TagInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue" | "maxLength"> {
  value: string[]
  onChange: (tags: string[]) => void
  /** Nombre de tags au plus. */
  max?: number
  /** Longueur d'un tag au plus. */
  maxTagLength?: number
  /** Affiche « 3/30 » au bout du champ. */
  showCount?: boolean
  /** Nettoyage appliqué à chaque tag avant l'ajout. */
  normalize?: (tag: string) => string
  className?: string
}

const defaultNormalize = (tag: string) => tag.replace(/\s+/g, " ").trim()

function TagInput({
  value,
  onChange,
  max = Infinity,
  maxTagLength,
  showCount = false,
  normalize = defaultNormalize,
  placeholder,
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
  ...props
}: TagInputProps) {
  const [draft, setDraft] = React.useState("")
  const input = React.useRef<HTMLInputElement>(null)
  const full = value.length >= max

  const add = (raw: string) => {
    const known = new Set(value.map((tag) => tag.toLocaleLowerCase()))
    const fresh: string[] = []
    for (const part of raw.split(/[,\n]/)) {
      let tag = normalize(part)
      if (maxTagLength) tag = tag.slice(0, maxTagLength).trim()
      const key = tag.toLocaleLowerCase()
      if (!tag || known.has(key)) continue
      known.add(key)
      fresh.push(tag)
    }
    if (fresh.length > 0) onChange([...value, ...fresh].slice(0, max))
    setDraft("")
  }

  const remove = (index: number) => {
    onChange(value.filter((_, position) => position !== index))
    input.current?.focus()
  }

  return (
    <div
      data-slot="tag-input"
      data-disabled={disabled || undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) input.current?.focus()
      }}
      className={cn(
        "flex min-h-9 w-full min-w-0 cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-xs transition-[color,box-shadow] dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
    >
      {value.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          data-slot="tag-input-tag"
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-2 text-xs animate-in fade-in-0 zoom-in-95"
        >
          <span className="min-w-0 truncate" title={tag}>
            {tag}
          </span>
          <button
            type="button"
            aria-label={`Retirer ${tag}`}
            disabled={disabled}
            onClick={() => remove(index)}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={input}
        id={id}
        data-slot="tag-input-control"
        aria-label={ariaLabel}
        value={draft}
        disabled={disabled || full}
        placeholder={full ? undefined : value.length === 0 ? placeholder : undefined}
        onChange={(event) => {
          const next = event.target.value
          if (/[,\n]/.test(next)) add(next)
          else setDraft(maxTagLength ? next.slice(0, maxTagLength) : next)
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text")
          if (!/[,\n]/.test(text)) return
          event.preventDefault()
          add(draft + text)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            add(draft)
          } else if (event.key === "Backspace" && !draft && value.length > 0) {
            event.preventDefault()
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        className={cn(
          "h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
          full && "hidden"
        )}
        {...props}
      />
      {showCount && Number.isFinite(max) && (
        <span className="ml-auto shrink-0 pl-1 text-xs text-muted-foreground tabular-nums" aria-hidden>
          {value.length}/{max}
        </span>
      )}
    </div>
  )
}

export { TagInput }
