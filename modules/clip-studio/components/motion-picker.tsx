"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronsUpDown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import useMediaQuery from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { MotionCategory, MotionPreset } from "../engine/motion/types";
import type { AnimKind } from "../engine/types";
import {
  FAVORITES_STORAGE_KEY,
  NO_ANIMATION_LABEL,
  PICKER_PHASE_LABELS,
  favoritePresets,
  groupByCategory,
  presetDetail,
  presetLabel,
  presetsFor,
  readFavorites,
  resolvePreset,
  searchPresets,
  toggleFavorite,
  writeFavorites,
  type PickerItemType,
  type PickerPhase,
} from "../lib/motion-catalog";
import { MotionThumbnail } from "./motion-thumbnail";

// ─── Favoris ─────────────────────────────────────────────────────

/** Prévient les autres sélecteurs ouverts (inspecteur, timeline) qu'un favori a changé. */
const FAVORITES_EVENT = "clip-studio:motion-favorites-change";

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Favoris d'animation, gardés dans le navigateur. Les lectures et écritures
 * passent par `readFavorites` / `writeFavorites`, qui ne lèvent jamais :
 * un stockage bloqué laisse des favoris valables pour la session.
 */
export function useMotionFavorites(storageKey: string = FAVORITES_STORAGE_KEY) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const current = useRef<string[]>([]);
  // Une liste par clé : animations, transitions, caméra et effets de plan ont chacun leurs favoris.
  const eventName = `${FAVORITES_EVENT}:${storageKey}`;

  useEffect(() => {
    const sync = () => {
      const next = readFavorites(browserStorage(), storageKey);
      current.current = next;
      setFavorites(next);
    };
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === storageKey) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(eventName, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(eventName, sync);
    };
  }, [storageKey, eventName]);

  const toggle = useCallback(
    (id: string) => {
      const next = toggleFavorite(current.current, id);
      current.current = next;
      setFavorites(next);
      // Si le stockage refuse, l'événement n'est pas envoyé : les autres sélecteurs reliraient l'ancienne liste.
      if (writeFavorites(browserStorage(), next, storageKey)) window.dispatchEvent(new Event(eventName));
    },
    [storageKey, eventName]
  );

  return { favorites, toggle };
}

// ─── Catalogue ───────────────────────────────────────────────────

type Scope = "all" | "favorites" | MotionCategory;

interface MotionCatalogProps {
  phase: PickerPhase;
  itemType: PickerItemType;
  value: AnimKind | undefined;
  onPick: (kind: AnimKind) => void;
}

const itemValue = (group: string, id: string) => `${group}::${id}`;
const idOfValue = (value: string) => value.slice(value.indexOf("::") + 2);

/**
 * Contenu du sélecteur : recherche, filtres par catégorie, vignettes qui
 * jouent au survol ou à la sélection au clavier, favoris. Partagé par la
 * fenêtre flottante de l'inspecteur, le tiroir mobile et la fenêtre ouverte
 * depuis la timeline.
 */
export function MotionCatalog({ phase, itemType, value, onPick }: MotionCatalogProps) {
  const { favorites, toggle } = useMotionFavorites();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  /** Vrai quand le pointeur est sur la liste ou que le clavier la parcourt : seule la vignette en cours joue alors. */
  const [engaged, setEngaged] = useState(false);
  // Sans survol (écran tactile), un premier toucher montre l'animation, le second la choisit.
  const touchOnly = useMediaQuery("(hover: none)") === true;
  const listRef = useRef<HTMLDivElement>(null);

  const presets = useMemo(() => presetsFor(phase, itemType), [phase, itemType]);
  const groups = useMemo(() => groupByCategory(presets), [presets]);
  const favoriteList = useMemo(() => favoritePresets(presets, favorites), [presets, favorites]);
  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);
  const current = value && value !== "none" ? value : "none";
  // La surbrillance part de l'animation en cours : le clavier reprend de là.
  const [highlight, setHighlight] = useState(() => {
    const preset = presets.find((entry) => entry.id === current);
    return preset ? itemValue(preset.category, preset.id) : itemValue("none", "none");
  });

  const scoped = useMemo(() => {
    if (scope === "all") return presets;
    if (scope === "favorites") return favoriteList;
    return presets.filter((preset) => preset.category === scope);
  }, [scope, presets, favoriteList]);
  const results = useMemo(() => (query.trim() ? searchPresets(scoped, query) : null), [scoped, query]);

  // Le pied de la fenêtre décrit la vignette parcourue, sinon l'animation en cours.
  const highlightedId = engaged && highlight ? idOfValue(highlight) : current;
  const highlighted =
    highlightedId !== "none" ? (presets.find((preset) => preset.id === highlightedId) ?? resolvePreset(highlightedId, phase)) : undefined;

  // À l'ouverture, l'animation en cours est sous les yeux.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>("[data-current=true]");
    node?.scrollIntoView({ block: "nearest" });
  }, []);

  const select = (rowValue: string, id: string) => {
    if (touchOnly && highlight !== rowValue) {
      setHighlight(rowValue);
      setEngaged(true);
      return;
    }
    onPick(id);
  };

  const card = (preset: MotionPreset | null, group: string) => {
    const id = preset?.id ?? "none";
    const rowValue = itemValue(group, id);
    const label = preset?.label ?? NO_ANIMATION_LABEL;
    const isCurrent = id === current;
    const isFavorite = preset ? favoriteIds.has(id) : false;
    return (
      <CommandItem
        key={rowValue}
        value={rowValue}
        onSelect={() => select(rowValue, id)}
        data-current={isCurrent}
        className={cn(
          "min-w-0 flex-col items-stretch gap-1 rounded-md p-1.5",
          isCurrent && "bg-primary/10 data-[selected=true]:bg-primary/15"
        )}
      >
        <span className="relative block min-w-0">
          <MotionThumbnail preset={preset ?? undefined} phase={phase} itemType={itemType} playing={engaged && highlight === rowValue} />
          {preset && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={isFavorite ? `Retirer « ${label} » des favoris` : `Ajouter « ${label} » aux favoris`}
              aria-pressed={isFavorite}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                toggle(id);
              }}
              className={cn(
                "absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-md bg-background/80 backdrop-blur transition-opacity hover:bg-background",
                isFavorite ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [[data-selected=true]_&]:opacity-100"
              )}
            >
              <Star className={cn("h-3.5 w-3.5", isFavorite ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
            </button>
          )}
          {isCurrent && (
            <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-3 w-3 text-primary-foreground" />
            </span>
          )}
        </span>
        <span className="block min-w-0 truncate px-0.5 text-xs" title={label}>
          {label}
        </span>
      </CommandItem>
    );
  };

  const gridClass =
    "[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-[repeat(auto-fill,minmax(min(100%,7.25rem),1fr))] [&_[cmdk-group-items]]:gap-1";

  const scopes: { key: Scope; label: string; count: number }[] = [
    { key: "all", label: "Tout", count: presets.length },
    { key: "favorites", label: "Favoris", count: favoriteList.length },
    ...groups.map((group) => ({ key: group.category, label: group.label, count: group.presets.length })),
  ];

  return (
    <Command
      shouldFilter={false}
      loop
      value={highlight}
      onValueChange={setHighlight}
      onKeyDown={() => setEngaged(true)}
      className="@container/catalog h-full min-h-0 min-w-0"
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder="Rechercher une animation…" aria-label="Rechercher une animation" />

      {/* Étroit (tiroir mobile) : les catégories défilent, le fondu à droite dit qu'il y en a d'autres ; large : elles passent à la ligne. */}
      <div
        className="flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5 [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] [scrollbar-width:thin] @lg/catalog:flex-wrap @lg/catalog:overflow-visible @lg/catalog:[mask-image:none]"
        role="toolbar"
        aria-label="Catégories"
      >
        {scopes.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={scope === entry.key}
            onClick={() => setScope(entry.key)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] whitespace-nowrap transition-colors",
              scope === entry.key ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            )}
          >
            {entry.key === "favorites" && <Star className="h-3 w-3" />}
            {entry.label}
            <span className="font-normal tabular-nums">{entry.count}</span>
          </button>
        ))}
      </div>

      <CommandList
        ref={listRef}
        className="max-h-none min-h-0 flex-1 overscroll-contain px-1 pb-1"
        onPointerMove={() => setEngaged(true)}
        onPointerLeave={() => setEngaged(false)}
      >
        <CommandEmpty>
          {scope === "favorites" && !query.trim()
            ? "Pas encore de favori : l’étoile d’une vignette en ajoute un."
            : "Aucune animation ne correspond."}
        </CommandEmpty>

        {results ? (
          results.length > 0 && (
            <CommandGroup heading={`${results.length} résultat${results.length > 1 ? "s" : ""}`} className={gridClass}>
              {results.map((preset) => card(preset, "search"))}
            </CommandGroup>
          )
        ) : (
          <>
            {scope === "all" && (
              <CommandGroup className={gridClass}>{card(null, "none")}</CommandGroup>
            )}
            {(scope === "all" || scope === "favorites") && favoriteList.length > 0 && (
              <CommandGroup heading="Favoris" className={gridClass}>
                <AnimatePresence initial={false}>
                  {favoriteList.map((preset) => (
                    <motion.div
                      key={preset.id}
                      layout
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.16 }}
                      className="group/card min-w-0"
                    >
                      {card(preset, "favorites")}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </CommandGroup>
            )}
            {scope !== "favorites" &&
              groups
                .filter((group) => scope === "all" || group.category === scope)
                .map((group) => (
                  <CommandGroup key={group.category} heading={group.label} className={gridClass}>
                    {group.presets.map((preset) => (
                      <div key={preset.id} className="group/card min-w-0">
                        {card(preset, group.category)}
                      </div>
                    ))}
                  </CommandGroup>
                ))}
          </>
        )}
      </CommandList>

      <div className="flex min-w-0 shrink-0 items-center gap-2 border-t px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium" title={highlighted?.label ?? NO_ANIMATION_LABEL}>
            {highlighted?.label ?? NO_ANIMATION_LABEL}
          </span>
          {(() => {
            const detail = highlighted
              ? `${presetDetail(highlighted)} · ${(highlighted.durationMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s`
              : `${PICKER_PHASE_LABELS[phase]} sans animation`;
            return (
              <span className="block truncate text-[11px] text-muted-foreground" title={detail}>
                {detail}
              </span>
            );
          })()}
        </span>
        {highlighted && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-[11px]"
            aria-pressed={favoriteIds.has(highlighted.id)}
            onClick={() => toggle(highlighted.id)}
          >
            <Star className={cn("h-3.5 w-3.5", favoriteIds.has(highlighted.id) && "fill-amber-400 text-amber-500")} />
            {favoriteIds.has(highlighted.id) ? "Favori" : "Ajouter aux favoris"}
          </Button>
        )}
        {touchOnly && engaged && (
          <Button type="button" size="sm" className="h-7 shrink-0 px-3 text-[11px]" onClick={() => onPick(highlightedId)}>
            Choisir
          </Button>
        )}
      </div>
    </Command>
  );
}

// ─── Déclencheur et fenêtres ─────────────────────────────────────

interface MotionFieldProps {
  phase: PickerPhase;
  itemType: PickerItemType;
  value: AnimKind | undefined;
  onChange: (kind: AnimKind) => void;
}

/**
 * Champ « Animation » de l'inspecteur : l'animation en cours (nom, vignette
 * qui joue au survol) ; un clic ouvre le catalogue, à côté de l'inspecteur
 * sur un grand écran, dans un tiroir en bas sur un téléphone.
 */
export function MotionField({ phase, itemType, value, onChange }: MotionFieldProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const mobile = useIsMobile();
  const preset = resolvePreset(value, phase);
  const label = presetLabel(value, phase);
  const detail = preset ? presetDetail(preset) : `${PICKER_PHASE_LABELS[phase]} sans animation`;

  const pick = (kind: AnimKind) => {
    onChange(kind);
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      aria-label={`${PICKER_PHASE_LABELS[phase]} : ${label}. Choisir une animation`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={mobile ? () => setOpen(true) : undefined}
      className="flex w-full min-w-0 items-center gap-2 rounded-md border bg-transparent p-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="w-14 shrink-0">
        <MotionThumbnail preset={preset} phase={phase} itemType={itemType} playing={hover && !open} resolution={[112, 70]} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium" title={label}>
          {label}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground" title={detail}>
          {detail}
        </span>
      </span>
      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );

  const catalog = <MotionCatalog phase={phase} itemType={itemType} value={value} onPick={pick} />;

  if (mobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="h-[80dvh]">
            <DrawerTitle className="sr-only">Animation · {PICKER_PHASE_LABELS[phase]}</DrawerTitle>
            <DrawerDescription className="sr-only">Choisir une animation, avec un aperçu de chacune.</DrawerDescription>
            <div className="min-h-0 flex-1">{open && catalog}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={12}
        collisionPadding={16}
        className="flex h-[34rem] max-h-(--radix-popover-content-available-height) w-[min(40rem,calc(100vw-2rem),var(--radix-popover-content-available-width))] flex-col overflow-hidden p-0"
      >
        {catalog}
      </PopoverContent>
    </Popover>
  );
}

interface MotionPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: PickerPhase;
  itemType: PickerItemType;
  value: AnimKind | undefined;
  onPick: (kind: AnimKind) => void;
}

/** Le catalogue dans une fenêtre (ou un tiroir sur un téléphone), pour l'ouvrir depuis la timeline. */
export function MotionPickerDialog({ open, onOpenChange, phase, itemType, value, onPick }: MotionPickerDialogProps) {
  const mobile = useIsMobile();
  const title = `Animation · ${PICKER_PHASE_LABELS[phase]}`;
  const pick = (kind: AnimKind) => {
    onPick(kind);
    onOpenChange(false);
  };
  const catalog = <MotionCatalog phase={phase} itemType={itemType} value={value} onPick={pick} />;

  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[80dvh]">
          <DrawerTitle className="px-4 pt-2 pb-1 text-sm">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">Choisir une animation, avec un aperçu de chacune.</DrawerDescription>
          <div className="min-h-0 flex-1">{open && catalog}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(38rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(48rem,calc(100vw-2rem))]">
        <DialogTitle className="shrink-0 border-b px-4 py-3 pr-12 text-sm">{title}</DialogTitle>
        <DialogDescription className="sr-only">Choisir une animation, avec un aperçu de chacune.</DialogDescription>
        <div className="min-h-0 flex-1">{open && catalog}</div>
      </DialogContent>
    </Dialog>
  );
}
