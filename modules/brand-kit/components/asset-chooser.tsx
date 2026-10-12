"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Type } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { kitAssetUrl, type BrandAsset, type BrandKit } from "../lib/types";

export const CHECKERBOARD =
  "repeating-conic-gradient(color-mix(in oklch, var(--muted-foreground) 14%, transparent) 0% 25%, transparent 0% 50%) 50% / 12px 12px";

/**
 * Choix d'une image de la marque par sa vignette : on reconnaît un logo à
 * son dessin, pas à son libellé. Le déclencheur montre l'image retenue.
 */
export function AssetChooser({
  kit,
  assets,
  value,
  onChange,
  label,
  noneLabel,
  emptyText,
  className,
}: {
  kit: BrandKit;
  assets: BrandAsset[];
  value: string | undefined;
  onChange: (assetId: string | undefined) => void;
  /** Rôle choisi : « Logo principal ». */
  label: string;
  /** Choix « aucune image » et ce qui la remplace : « Le nom de la marque ». */
  noneLabel?: string;
  /** Phrase quand aucune image ne convient. */
  emptyText: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = value ? assets.find((asset) => asset.id === value) : undefined;
  const choose = (id: string | undefined) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label} : ${current?.label ?? noneLabel ?? "aucune"}`}
          className={cn(
            "flex w-full min-w-0 items-center gap-3 rounded-lg border p-1.5 pr-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className
          )}
        >
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border" style={{ background: CHECKERBOARD }}>
            {current ? (
              // eslint-disable-next-line @next/next/no-img-element -- image de la marque, servie par le module
              <img src={kitAssetUrl(kit.id, current.file)} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <Type aria-hidden className="size-5 text-muted-foreground" />
            )}
          </span>
          <span className="grid min-w-0 flex-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="line-clamp-2 text-sm font-medium break-words" title={current?.label ?? noneLabel}>
              {current?.label ?? noneLabel ?? "Aucune image"}
            </span>
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">{label}</p>
        {assets.length === 0 && !noneLabel ? (
          <p className="px-1 pb-1 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div role="listbox" aria-label={label} className="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto p-0.5">
            {noneLabel && (
              <ChoiceTile selected={!current} label={noneLabel} onSelect={() => choose(undefined)}>
                <Type aria-hidden className="size-5 text-muted-foreground" />
              </ChoiceTile>
            )}
            {assets.map((asset) => (
              <ChoiceTile key={asset.id} selected={asset.id === value} label={asset.label} onSelect={() => choose(asset.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- image de la marque, servie par le module */}
                <img src={kitAssetUrl(kit.id, asset.file)} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
              </ChoiceTile>
            ))}
          </div>
        )}
        {assets.length === 0 && noneLabel && <p className="px-1 pt-2 text-xs text-muted-foreground">{emptyText}</p>}
      </PopoverContent>
    </Popover>
  );
}

function ChoiceTile({ selected, label, onSelect, children }: { selected: boolean; label: string; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      title={label}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-md border outline-none transition-colors hover:border-foreground/30 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected && "border-primary ring-2 ring-primary/40"
      )}
      style={{ background: CHECKERBOARD }}
    >
      {children}
      {selected && (
        <span className="absolute top-1 right-1 rounded-full bg-primary p-0.5 text-primary-foreground">
          <Check aria-hidden className="size-3" />
        </span>
      )}
    </button>
  );
}
