"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAGE_STATUS_LABELS, countLabel } from "../../lib/library-helpers";
import type { PageSummary } from "../../lib/types";

interface PagePickerProps {
  /** Pages du chapitre, dans l'ordre de lecture, avec leur rang. */
  pages: { page: PageSummary; number: number }[];
  selected: ReadonlySet<string>;
  onChange: (selected: Set<string>) => void;
  /** Ce que l'on s'apprête à faire des pages cochées : « à analyser », « à traduire ». */
  purpose: string;
  disabled?: boolean;
}

/**
 * Choix des pages d'un traitement : une vignette par page, cochée ou non. Les
 * pages décochées ne sont pas touchées. Toutes sont cochées au départ, sauf
 * celles qu'on a laissées telles quelles.
 */
export function PagePicker({ pages, selected, onChange, purpose, disabled }: PagePickerProps) {
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium tabular-nums" aria-live="polite">
          {countLabel(selected.size, "page", "pages")} {purpose}
          <span className="font-normal text-muted-foreground"> sur {pages.length}</span>
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={disabled || selected.size === pages.length} onClick={() => onChange(new Set(pages.map((entry) => entry.page.id)))}>
            Tout cocher
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={disabled || selected.size === 0} onClick={() => onChange(new Set())}>
            Tout décocher
          </Button>
        </div>
      </div>
      <ul className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 overflow-y-auto rounded-md border p-2" aria-label="Pages du traitement">
        {pages.map(({ page, number }) => {
          const checked = selected.has(page.id);
          return (
            <li key={page.id} className="list-none">
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={`Page ${number}, ${PAGE_STATUS_LABELS[page.status]}`}
                title={`Page ${number} · ${PAGE_STATUS_LABELS[page.status]}`}
                disabled={disabled}
                onClick={() => toggle(page.id)}
                className={cn(
                  "relative block aspect-[3/4] w-full overflow-hidden rounded-md border bg-muted transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  !checked && "opacity-45"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- vignette servie par le module, avec la session */}
                <img src={page.thumbUrl} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover object-top" />
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1 top-1 flex size-4 items-center justify-center rounded-[4px] border",
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/90"
                  )}
                >
                  {checked && <Check className="size-3" />}
                </span>
                <span className="absolute inset-x-0 bottom-0 bg-background/85 py-0.5 text-center text-[10px] font-medium tabular-nums">{number}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
