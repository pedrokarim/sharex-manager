"use client";

import { useMemo } from "react";
import { GalleryHorizontalEnd, Star } from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import type { MotionPreset } from "../engine/motion/types";
import type { AnimKind } from "../engine/types";
import {
  NO_ANIMATION_LABEL,
  favoritePresets,
  groupByCategory,
  presetLabel,
  presetsFor,
  type PickerItemType,
  type PickerPhase,
} from "../lib/motion-catalog";

/** Sous-menus bornés à l'écran : une catégorie longue défile au lieu de sortir du cadre. */
const SUB_CONTENT = "w-60 max-w-[calc(100vw-2rem)] max-h-(--radix-context-menu-content-available-height) overflow-y-auto";

/**
 * Sous-menu « Animation » du clic droit dans la timeline : le même catalogue
 * que l'inspecteur, rangé par catégorie, avec les favoris en tête et un accès
 * au sélecteur à vignettes.
 */
export function MotionSubmenu({
  label,
  phase,
  itemType,
  value,
  favorites,
  onPick,
  onMore,
}: {
  label: string;
  phase: PickerPhase;
  itemType: PickerItemType;
  value: AnimKind | undefined;
  favorites: string[];
  onPick: (kind: AnimKind) => void;
  /** Ouvre le sélecteur complet, avec aperçus. */
  onMore: () => void;
}) {
  const presets = useMemo(() => presetsFor(phase, itemType), [phase, itemType]);
  const groups = useMemo(() => groupByCategory(presets), [presets]);
  const favoriteList = useMemo(() => favoritePresets(presets, favorites), [presets, favorites]);
  const current = value && value !== "none" ? value : "none";
  const currentLabel = presetLabel(value, phase);
  // Téléphone : trois niveaux de sous-menus ne tiennent pas côte à côte ; le sélecteur s'ouvre en tiroir.
  const mobile = useIsMobile();

  const entry = (preset: MotionPreset) => (
    <ContextMenuItem key={preset.id} onClick={() => onPick(preset.id)} title={preset.label}>
      <span className="min-w-0 flex-1 truncate">{preset.label}</span>
      {current === preset.id && <span className="shrink-0 text-primary">•</span>}
    </ContextMenuItem>
  );

  if (mobile) {
    return (
      <ContextMenuItem onClick={onMore} className="min-w-0 flex-col items-start gap-0">
        <span>{label}</span>
        <span className="max-w-full text-xs text-foreground/70 [overflow-wrap:anywhere]">{currentLabel}</span>
      </ContextMenuItem>
    );
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="min-w-0 gap-2">
        <span className="shrink-0">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-foreground/70" title={currentLabel}>
          {currentLabel}
        </span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className={SUB_CONTENT}>
        <ContextMenuItem onClick={() => onPick("none")}>
          <span className="min-w-0 flex-1 truncate">{NO_ANIMATION_LABEL}</span>
          {current === "none" && <span className="shrink-0 text-primary">•</span>}
        </ContextMenuItem>
        {favoriteList.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
              <Star className="h-3 w-3" />
              Favoris
            </ContextMenuLabel>
            {favoriteList.map(entry)}
          </>
        )}
        <ContextMenuSeparator />
        {groups.map((group) => (
          <ContextMenuSub key={group.category}>
            <ContextMenuSubTrigger className="min-w-0 gap-2">
              <span className="min-w-0 flex-1 truncate">{group.label}</span>
              {group.presets.some((preset) => preset.id === current) && <span className="shrink-0 text-primary">•</span>}
              <span className="shrink-0 text-[11px] text-foreground/70 tabular-nums">{group.presets.length}</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className={SUB_CONTENT}>{group.presets.map(entry)}</ContextMenuSubContent>
          </ContextMenuSub>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onMore}>
          <GalleryHorizontalEnd className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate">Plus d’animations…</span>
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
