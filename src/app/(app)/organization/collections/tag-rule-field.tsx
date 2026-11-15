"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Tag } from "@/lib/organization/types";
import { cn } from "@/lib/utils";

/**
 * Une règle de tags (« avec tous ces tags », « au moins un », « sans ») :
 * les tags retenus en mots, chacun retirable, et un sélecteur parmi les tags
 * de l'instance. Un tag déjà pris par une autre règle n'est pas proposé : il
 * ne peut pas être à la fois exigé et exclu.
 */
export function TagRuleField({
  id,
  label,
  hint,
  value,
  onChange,
  tags,
  taken,
}: {
  id: string;
  label: string;
  hint: string;
  /** Slugs retenus. */
  value: string[];
  onChange: (slugs: string[]) => void;
  tags: Tag[];
  /** Slugs déjà utilisés par les autres règles de tags. */
  taken: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const bySlug = new Map(tags.map((tag) => [tag.slug, tag]));
  const available = tags.filter((tag) => !taken.has(tag.slug));

  const toggle = (slug: string) => {
    onChange(value.includes(slug) ? value.filter((item) => item !== slug) : [...value, slug]);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5" role="group" aria-labelledby={`${id}-label`}>
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={hint}>
          {hint}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {value.map((slug) => {
          const name = bySlug.get(slug)?.name ?? slug;
          return (
            <span
              key={slug}
              className="inline-flex h-8 max-w-full min-w-0 items-center gap-1 rounded-md border bg-background pr-1 pl-2.5 text-sm"
            >
              <span className="min-w-0 truncate" title={name}>
                {name}
              </span>
              <button
                type="button"
                onClick={() => toggle(slug)}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-label={`Retirer ${name}`}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          );
        })}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8" disabled={tags.length === 0}>
              <Plus aria-hidden />
              {value.length ? "Ajouter" : "Choisir des tags"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] p-0">
            <Command>
              <CommandInput placeholder="Chercher un tag…" />
              <CommandList className="max-h-[min(16rem,50vh)]">
                <CommandEmpty>Aucun tag ne correspond.</CommandEmpty>
                <CommandGroup>
                  {available.map((tag) => {
                    const selected = value.includes(tag.slug);
                    return (
                      <CommandItem
                        key={tag.slug}
                        value={`${tag.name} ${tag.slug}`}
                        onSelect={() => toggle(tag.slug)}
                        className="min-w-0"
                      >
                        <Check aria-hidden className={cn("size-4", selected ? "opacity-100" : "opacity-0")} />
                        <span className="min-w-0 flex-1 truncate" title={tag.name}>
                          {tag.name}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {tag.fileCount.toLocaleString("fr-FR")}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
