"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronsUpDown, GalleryHorizontalEnd, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import useMediaQuery from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  SCENE_KIND_LABELS,
  SCENE_NONE_LABELS,
  favoriteSceneEntries,
  findSceneEntry,
  groupSceneEntries,
  isKnownScene,
  sceneDetail,
  sceneEntries,
  sceneFavoritesKey,
  sceneLabel,
  searchSceneEntries,
  type SceneEntry,
  type SceneKind,
} from "../lib/scene-catalog";
import { useMotionFavorites } from "./motion-picker";
import { SceneThumbnail } from "./scene-thumbnail";

/** Favoris d'une famille (transitions, caméra, effets), gardés dans le navigateur. */
export function useSceneFavorites(kind: SceneKind) {
  return useMotionFavorites(sceneFavoritesKey(kind));
}

/** Identifiant affiché d'une valeur : « none » pour rien, sinon l'identifiant. */
const currentOf = (kind: SceneKind, value: string | undefined | null) =>
  !value || value === "none" ? (SCENE_NONE_LABELS[kind] ? "none" : "") : value;

type Scope = "all" | "favorites" | string;

const rowValue = (group: string, id: string) => `${group}::${id}`;
const idOfRow = (value: string) => value.slice(value.indexOf("::") + 2);

interface SceneCatalogProps {
  kind: SceneKind;
  value: string | undefined | null;
  onPick: (id: string) => void;
}

/**
 * Catalogue d'une famille : recherche, filtres par catégorie, vignettes qui
 * jouent au survol ou au clavier, favoris. Partagé par l'inspecteur, la
 * fenêtre ouverte depuis la timeline et le tiroir du téléphone.
 */
export function SceneCatalog({ kind, value, onPick }: SceneCatalogProps) {
  const { favorites, toggle } = useSceneFavorites(kind);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [engaged, setEngaged] = useState(false);
  // Sans survol (écran tactile), un premier toucher montre l'aperçu, le second choisit.
  const touchOnly = useMediaQuery("(hover: none)") === true;
  const listRef = useRef<HTMLDivElement>(null);
  const texts = SCENE_KIND_LABELS[kind];
  const noneLabel = SCENE_NONE_LABELS[kind];

  const entries = useMemo(() => sceneEntries(kind), [kind]);
  const groups = useMemo(() => groupSceneEntries(entries), [entries]);
  const favoriteList = useMemo(() => favoriteSceneEntries(entries, favorites), [entries, favorites]);
  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);
  const current = currentOf(kind, value);
  const [highlight, setHighlight] = useState(() => {
    const entry = entries.find((item) => item.id === current);
    return entry ? rowValue(entry.category, entry.id) : rowValue("none", "none");
  });

  const scoped = useMemo(() => {
    if (scope === "all") return entries;
    if (scope === "favorites") return favoriteList;
    return entries.filter((entry) => entry.category === scope);
  }, [scope, entries, favoriteList]);
  const results = useMemo(() => (query.trim() ? searchSceneEntries(scoped, query) : null), [scoped, query]);

  const highlightedId = engaged && highlight ? idOfRow(highlight) : current;
  const highlighted = findSceneEntry(kind, highlightedId);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[data-current=true]")?.scrollIntoView({ block: "nearest" });
  }, []);

  const select = (row: string, id: string) => {
    if (touchOnly && highlight !== row) {
      setHighlight(row);
      setEngaged(true);
      return;
    }
    onPick(id);
  };

  const card = (entry: SceneEntry | null, group: string) => {
    const id = entry?.id ?? "none";
    const row = rowValue(group, id);
    const label = entry?.label ?? noneLabel ?? "";
    const isCurrent = id === current;
    const isFavorite = entry ? favoriteIds.has(id) : false;
    return (
      <CommandItem
        key={row}
        value={row}
        onSelect={() => select(row, id)}
        data-current={isCurrent}
        className={cn("min-w-0 flex-col items-stretch gap-1 rounded-md p-1.5", isCurrent && "bg-primary/10 data-[selected=true]:bg-primary/15")}
      >
        <span className="relative block min-w-0">
          <SceneThumbnail kind={kind} id={id} playing={engaged && highlight === row} />
          {entry && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={isFavorite ? `Retirer « ${label} » des favoris` : `Ajouter « ${label} » aux favoris`}
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
    { key: "all", label: "Tout", count: entries.length },
    { key: "favorites", label: "Favoris", count: favoriteList.length },
    ...groups.map((group) => ({ key: group.category, label: group.label, count: group.entries.length })),
  ];

  const detail = highlighted
    ? sceneDetail(highlighted, kind)
    : highlightedId === "none" && noneLabel
      ? kind === "transition"
        ? "Le plan arrive sans transition"
        : "L’image reste immobile"
      : current && !isKnownScene(kind, current)
        ? "Identifiant inconnu de ce moteur"
        : "";
  const footerLabel = highlighted?.label ?? (highlightedId === "none" && noneLabel ? noneLabel : sceneLabel(kind, highlightedId));

  return (
    <Command
      shouldFilter={false}
      loop
      value={highlight}
      onValueChange={setHighlight}
      onKeyDown={() => setEngaged(true)}
      className="@container/catalog h-full min-h-0 min-w-0"
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder={texts.search} aria-label={texts.search.replace("…", "")} />

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
          {scope === "favorites" && !query.trim() ? "Pas encore de favori : l’étoile d’une vignette en ajoute un." : texts.empty}
        </CommandEmpty>

        {results ? (
          results.length > 0 && (
            <CommandGroup heading={`${results.length} résultat${results.length > 1 ? "s" : ""}`} className={gridClass}>
              {results.map((entry) => card(entry, "search"))}
            </CommandGroup>
          )
        ) : (
          <>
            {scope === "all" && noneLabel && <CommandGroup className={gridClass}>{card(null, "none")}</CommandGroup>}
            {(scope === "all" || scope === "favorites") && favoriteList.length > 0 && (
              <CommandGroup heading="Favoris" className={gridClass}>
                <AnimatePresence initial={false}>
                  {favoriteList.map((entry) => (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.16 }}
                      className="group/card min-w-0"
                    >
                      {card(entry, "favorites")}
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
                    {group.entries.map((entry) => (
                      <div key={entry.id} className="group/card min-w-0">
                        {card(entry, group.category)}
                      </div>
                    ))}
                  </CommandGroup>
                ))}
          </>
        )}
      </CommandList>

      <div className="flex min-w-0 shrink-0 items-center gap-2 border-t px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium" title={footerLabel}>
            {footerLabel}
          </span>
          {detail && (
            <span className="block truncate text-[11px] text-muted-foreground" title={detail}>
              {detail}
            </span>
          )}
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
        {touchOnly && engaged && (highlighted || (highlightedId === "none" && noneLabel)) && (
          <Button type="button" size="sm" className="h-7 shrink-0 px-3 text-[11px]" onClick={() => onPick(highlightedId)}>
            Choisir
          </Button>
        )}
      </div>
    </Command>
  );
}

// ─── Champ de l'inspecteur ───────────────────────────────────────

interface SceneFieldProps {
  kind: SceneKind;
  value: string | undefined | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/**
 * Champ de l'inspecteur : la transition, le mouvement ou l'effet en cours
 * (nom, vignette qui joue au survol) ; un clic ouvre le catalogue, à côté
 * de l'inspecteur sur un grand écran, dans un tiroir sur un téléphone.
 */
export function SceneField({ kind, value, onChange, disabled }: SceneFieldProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const mobile = useIsMobile();
  const current = currentOf(kind, value);
  const entry = findSceneEntry(kind, current);
  const known = isKnownScene(kind, current);
  const label = sceneLabel(kind, current);
  const detail = entry
    ? sceneDetail(entry, kind)
    : known
      ? kind === "transition"
        ? "Sans transition"
        : "Sans mouvement"
      : "Identifiant inconnu de ce moteur";

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${SCENE_KIND_LABELS[kind].title} : ${label}. Choisir`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={mobile ? () => setOpen(true) : undefined}
      className="flex w-full min-w-0 items-center gap-2 rounded-md border bg-transparent p-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="w-14 shrink-0">
        <SceneThumbnail kind={kind} id={known ? current || "none" : null} playing={hover && !open} resolution={[112, 70]} />
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

  const catalog = <SceneCatalog kind={kind} value={value} onPick={pick} />;

  if (mobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="h-[80dvh]">
            <DrawerTitle className="px-4 pt-2 pb-1 text-sm">{SCENE_KIND_LABELS[kind].title}</DrawerTitle>
            <DrawerDescription className="sr-only">Choisir, avec un aperçu de chacun.</DrawerDescription>
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

// ─── Fenêtre ouverte depuis la timeline ──────────────────────────

interface ScenePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: SceneKind;
  value: string | undefined | null;
  onPick: (id: string) => void;
  /** Titre de la fenêtre ; par défaut, le nom de la famille. */
  title?: string;
}

/** Le catalogue dans une fenêtre, ou un tiroir sur un téléphone. */
export function ScenePickerDialog({ open, onOpenChange, kind, value, onPick, title }: ScenePickerDialogProps) {
  const mobile = useIsMobile();
  const heading = title ?? SCENE_KIND_LABELS[kind].title;
  const pick = (id: string) => {
    onPick(id);
    onOpenChange(false);
  };
  const catalog = <SceneCatalog kind={kind} value={value} onPick={pick} />;

  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[80dvh]">
          <DrawerTitle className="truncate px-4 pt-2 pb-1 text-sm" title={heading}>
            {heading}
          </DrawerTitle>
          <DrawerDescription className="sr-only">Choisir, avec un aperçu de chacun.</DrawerDescription>
          <div className="min-h-0 flex-1">{open && catalog}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(38rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(48rem,calc(100vw-2rem))]">
        <DialogTitle className="shrink-0 truncate border-b px-4 py-3 pr-12 text-sm" title={heading}>
          {heading}
        </DialogTitle>
        <DialogDescription className="sr-only">Choisir, avec un aperçu de chacun.</DialogDescription>
        <div className="min-h-0 flex-1">{open && catalog}</div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sous-menu du clic droit ─────────────────────────────────────

/** Sous-menus bornés à l'écran : une catégorie longue défile au lieu de sortir du cadre. */
const SUB_CONTENT = "w-60 max-w-[calc(100vw-2rem)] max-h-(--radix-context-menu-content-available-height) overflow-y-auto";

interface SceneSubmenuProps {
  kind: SceneKind;
  label: string;
  /** Valeur en cours ; `undefined` pour un ajout (effet de plan). */
  value?: string | null;
  /** Texte à droite du libellé ; par défaut, le nom de la valeur en cours. */
  hint?: string;
  favorites: string[];
  onPick: (id: string) => void;
  /** Ouvre le catalogue complet, avec aperçus (seul choix sur un téléphone). */
  onMore: () => void;
  disabled?: boolean;
}

/**
 * Sous-menu du clic droit de la timeline : le catalogue rangé par catégorie,
 * favoris en tête, et le catalogue à vignettes en dernier. Sur un téléphone,
 * une seule entrée ouvre le catalogue en tiroir.
 */
export function SceneSubmenu({ kind, label, value, hint, favorites, onPick, onMore, disabled }: SceneSubmenuProps) {
  const mobile = useIsMobile();
  const entries = useMemo(() => sceneEntries(kind), [kind]);
  const groups = useMemo(() => groupSceneEntries(entries), [entries]);
  const favoriteList = useMemo(() => favoriteSceneEntries(entries, favorites), [entries, favorites]);
  const adding = value === undefined;
  const current = adding ? "" : currentOf(kind, value);
  const noneLabel = SCENE_NONE_LABELS[kind];
  const right = hint ?? (adding ? "" : sceneLabel(kind, current));

  const entry = (item: SceneEntry) => (
    <ContextMenuItem key={item.id} onClick={() => onPick(item.id)} title={item.label}>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {current === item.id && <span className="shrink-0 text-primary">•</span>}
    </ContextMenuItem>
  );

  if (mobile) {
    return (
      <ContextMenuItem disabled={disabled} onClick={onMore} className="min-w-0 flex-col items-start gap-0">
        <span>{label}</span>
        {right && <span className="max-w-full text-xs text-foreground/70 [overflow-wrap:anywhere]">{right}</span>}
      </ContextMenuItem>
    );
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={disabled} className="min-w-0 gap-2">
        <span className="shrink-0">{label}</span>
        {right && (
          <span className="min-w-0 flex-1 truncate text-right text-xs text-foreground/70" title={right}>
            {right}
          </span>
        )}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className={SUB_CONTENT}>
        {!adding && noneLabel && (
          <>
            <ContextMenuItem onClick={() => onPick("none")}>
              <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
              {current === "none" && <span className="shrink-0 text-primary">•</span>}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {favoriteList.length > 0 && (
          <>
            <ContextMenuLabel className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
              <Star className="h-3 w-3" />
              Favoris
            </ContextMenuLabel>
            {favoriteList.map(entry)}
            <ContextMenuSeparator />
          </>
        )}
        {groups.map((group) => (
          <ContextMenuSub key={group.category}>
            <ContextMenuSubTrigger className="min-w-0 gap-2">
              <span className="min-w-0 flex-1 truncate" title={group.label}>
                {group.label}
              </span>
              {group.entries.some((item) => item.id === current) && <span className="shrink-0 text-primary">•</span>}
              <span className="shrink-0 text-[11px] text-foreground/70 tabular-nums">{group.entries.length}</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className={SUB_CONTENT}>{group.entries.map(entry)}</ContextMenuSubContent>
          </ContextMenuSub>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onMore}>
          <GalleryHorizontalEnd className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate">{SCENE_KIND_LABELS[kind].more}</span>
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
