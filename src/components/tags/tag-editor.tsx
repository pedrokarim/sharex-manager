"use client";

/**
 * Champ de pose des tags : les tags choisis, puis un champ qui propose les
 * tags existants pendant la saisie. Un nom inconnu se propose à la création
 * (« Créer « Valorant » ») ; le tag naît côté serveur quand la liste est
 * enregistrée. Un tag se retire par sa croix, ou par Retour arrière sur un
 * champ vide.
 *
 * Un tag est un mot : pas de couleur, seulement son nom.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Plus, XIcon } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { cleanTagName, slugify, TAGS_PER_FILE_MAX, type Tag } from "@/lib/organization/types";
import { slugOfName, useTagList } from "./tags-api";

/** Suggestions montrées au plus. */
const SUGGESTION_LIMIT = 8;

type TagOption = { kind: "tag"; tag: Tag } | { kind: "create"; name: string };

export interface TagEditorProps {
  /** Noms des tags choisis. */
  value: string[];
  onChange: (names: string[]) => void;
  /** Tags connus, pour les suggestions ; chargés depuis `/api/tags` s'ils manquent. */
  tags?: Tag[];
  /** `false` : seuls les tags existants se choisissent (retrait en lot). */
  allowCreate?: boolean;
  /** Nombre de tags au plus. */
  max?: number;
  /** Lien posé sur le nom d'un tag choisi (la galerie filtrée). */
  tagHref?: (name: string) => string | undefined;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

export function fileCountLabel(count: number): string {
  return `${count.toLocaleString("fr-FR")} fichier${count > 1 ? "s" : ""}`;
}

/** Les suggestions d'une saisie : tags qui la contiennent, puis la création d'un nom inconnu. */
export function tagOptions(query: string, known: Tag[], chosenSlugs: Set<string>, allowCreate: boolean): TagOption[] {
  const available = known.filter((tag) => !chosenSlugs.has(tag.slug));
  const trimmed = query.trim();
  if (!trimmed) {
    // Champ vide : les tags les plus posés.
    return [...available]
      .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name, "fr"))
      .slice(0, SUGGESTION_LIMIT)
      .map((tag) => ({ kind: "tag", tag }));
  }
  const needle = slugify(trimmed);
  if (!needle) return [];
  const rank = (tag: Tag) => {
    const slug = slugify(tag.name);
    if (tag.slug === needle || slug === needle) return 0;
    if (slug.startsWith(needle) || tag.slug.startsWith(needle)) return 1;
    return 2;
  };
  const matches = available
    .filter((tag) => slugify(tag.name).includes(needle) || tag.slug.includes(needle))
    .sort((a, b) => rank(a) - rank(b) || b.fileCount - a.fileCount || a.name.localeCompare(b.name, "fr"))
    .slice(0, SUGGESTION_LIMIT);
  const options: TagOption[] = matches.map((tag) => ({ kind: "tag", tag }));
  const name = cleanTagName(trimmed);
  const exists = known.some((tag) => tag.slug === needle || slugify(tag.name) === needle);
  if (allowCreate && name && !exists && !chosenSlugs.has(needle)) options.push({ kind: "create", name });
  return options;
}

export function TagEditor(props: TagEditorProps) {
  // Les tags ne se chargent ici que si l'appelant ne les fournit pas.
  const fetched = useTagList({ enabled: props.tags === undefined });
  return <TagEditorField {...props} tags={props.tags ?? fetched.tags} />;
}

function TagEditorField({
  value,
  onChange,
  tags,
  allowCreate = true,
  max = TAGS_PER_FILE_MAX,
  tagHref,
  placeholder = allowCreate ? "Ajouter un tag" : "Choisir un tag",
  disabled,
  autoFocus,
  id,
  "aria-label": ariaLabel = "Tags",
  className,
}: TagEditorProps & { tags: Tag[] }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const listId = useId();
  const full = value.length >= max;

  const chosenSlugs = useMemo(() => new Set(value.map((name) => slugOfName(name, tags))), [value, tags]);
  const options = useMemo(() => tagOptions(query, tags, chosenSlugs, allowCreate), [query, tags, chosenSlugs, allowCreate]);
  const showEmpty = !allowCreate && query.trim() !== "" && options.length === 0;
  const open = focused && !dismissed && !full && !disabled && (options.length > 0 || showEmpty);
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));

  const add = (name: string) => {
    const slug = slugOfName(name, tags);
    if (!chosenSlugs.has(slug) && !full) onChange([...value, name]);
    setQuery("");
    setActive(0);
  };

  const pick = (option: TagOption) => add(option.kind === "tag" ? option.tag.name : option.name);

  const remove = (index: number) => {
    onChange(value.filter((_, position) => position !== index));
    input.current?.focus();
  };

  /** Entrée ou virgule : la suggestion active, sinon le nom tel quel s'il est permis. */
  const commit = () => {
    if (options.length > 0 && (open || query.trim())) {
      pick(options[activeIndex]);
      return;
    }
    const name = cleanTagName(query);
    if (!name) return;
    const known = tags.find((tag) => tag.slug === slugify(name));
    if (known) add(known.name);
    else if (allowCreate) add(name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setDismissed(false);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + options.length) % options.length);
    } else if (event.key === "Enter" || event.key === ",") {
      if (!query.trim()) return;
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      if (open) {
        // La fenêtre qui contient le champ reste ouverte : seule la liste se ferme.
        event.stopPropagation();
        setDismissed(true);
      }
    } else if (event.key === "Backspace" && !query && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div
          ref={anchor}
          data-slot="tag-editor"
          data-disabled={disabled || undefined}
          onClick={(event) => {
            if (event.target === event.currentTarget) input.current?.focus();
          }}
          className={cn(
            "flex min-h-9 w-full min-w-0 cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-xs transition-[color,box-shadow] dark:bg-input/30",
            "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
            "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
            className,
          )}
        >
          {value.map((name, index) => {
            const href = tagHref?.(name);
            return (
              <span
                key={`${name}-${index}`}
                data-slot="tag-editor-tag"
                className="inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-sm"
              >
                {href ? (
                  <Link href={href} title={`Voir les fichiers tagués « ${name} »`} className="min-w-0 truncate hover:underline">
                    {name}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate" title={name}>
                    {name}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Retirer le tag ${name}`}
                  disabled={disabled}
                  onClick={() => remove(index)}
                  className="shrink-0 rounded-sm p-1 text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            );
          })}
          <input
            ref={input}
            id={id}
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && options.length > 0 ? optionId(activeIndex) : undefined}
            value={query}
            disabled={disabled || full}
            autoFocus={autoFocus}
            autoComplete="off"
            maxLength={60}
            placeholder={full ? `${max} tags au plus` : placeholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setDismissed(false);
            }}
            onFocus={() => {
              setFocused(true);
              setDismissed(false);
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            className="h-7 min-w-28 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed sm:text-sm"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        // Le curseur reste dans le champ : la liste se lit, elle ne prend pas la main.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (anchor.current?.contains(event.target as Node)) event.preventDefault();
        }}
        className="max-h-72 w-(--radix-popover-trigger-width) min-w-56 overflow-y-auto overscroll-contain p-1"
      >
        {showEmpty ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Aucun tag ne porte ce nom.</p>
        ) : (
          <ul id={listId} role="listbox" aria-label="Suggestions de tags">
            {options.map((option, index) => (
              <li
                key={option.kind === "tag" ? `tag-${option.tag.id}` : "create"}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                // Le champ garde le focus : sans ça, le clic le ferait perdre avant d'être lu.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => index !== activeIndex && setActive(index)}
                onClick={() => pick(option)}
                className={cn(
                  "flex min-w-0 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none",
                  index === activeIndex && "bg-accent text-accent-foreground",
                )}
              >
                {option.kind === "tag" ? (
                  <>
                    <span className="min-w-0 flex-1 truncate" title={option.tag.name}>
                      {option.tag.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fileCountLabel(option.tag.fileCount)}</span>
                  </>
                ) : (
                  <>
                    <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate" title={option.name}>
                      Créer « {option.name} »
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
