"use client";

import { ArrowLeftToLine, ArrowRightToLine, ClipboardPaste, Copy, CopyPlus, Trash2 } from "lucide-react";
import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut } from "@/components/ui/dropdown-menu";

/** Actions d'une zone, communes au clic droit et au bouton « … ». */
export interface RegionActions {
  duplicate: (regionId: string) => void;
  /** `-1` : plus tôt dans l'ordre de lecture ; `1` : plus tard. */
  shift: (regionId: string, delta: -1 | 1) => void;
  copyStyle: (regionId: string) => void;
  pasteStyle: (regionId: string) => void;
  remove: (regionId: string) => void;
  /** Un style a été copié, sur cette page ou une autre. */
  canPasteStyle: boolean;
}

interface RegionMenuItemsProps {
  /** Le même contenu sert aux deux menus : seul l'habillage change. */
  variant: "context" | "dropdown";
  regionId: string;
  /** Rang de la zone et nombre de zones, pour griser les déplacements impossibles. */
  index: number;
  count: number;
  actions: RegionActions;
}

export function RegionMenuItems({ variant, regionId, index, count, actions }: RegionMenuItemsProps) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator = variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const Shortcut = variant === "context" ? ContextMenuShortcut : DropdownMenuShortcut;

  return (
    <>
      <Item onSelect={() => actions.duplicate(regionId)}>
        <CopyPlus />
        Dupliquer
        <Shortcut>Ctrl D</Shortcut>
      </Item>
      <Separator />
      <Item disabled={index <= 0} onSelect={() => actions.shift(regionId, -1)}>
        <ArrowLeftToLine />
        Lire plus tôt
      </Item>
      <Item disabled={index >= count - 1} onSelect={() => actions.shift(regionId, 1)}>
        <ArrowRightToLine />
        Lire plus tard
      </Item>
      <Separator />
      <Item onSelect={() => actions.copyStyle(regionId)}>
        <Copy />
        Copier le style
      </Item>
      <Item disabled={!actions.canPasteStyle} onSelect={() => actions.pasteStyle(regionId)}>
        <ClipboardPaste />
        Coller le style
      </Item>
      <Separator />
      <Item variant="destructive" onSelect={() => actions.remove(regionId)}>
        <Trash2 />
        Supprimer
        <Shortcut>Suppr</Shortcut>
      </Item>
    </>
  );
}
