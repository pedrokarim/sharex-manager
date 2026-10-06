"use client";

import { Fragment } from "react";
import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Une entrée de menu d'un objet de la bibliothèque. */
export interface MenuEntry {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  /** Lien interne ; avec `newTab`, adresse ouverte dans un nouvel onglet. */
  href?: string;
  newTab?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

/** Le menu existe en deux formes, le bouton « … » et le clic droit : mêmes entrées. */
const DROPDOWN = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator };
const CONTEXT = { Item: ContextMenuItem, Separator: ContextMenuSeparator };

function renderEntries(kit: typeof DROPDOWN | typeof CONTEXT, entries: MenuEntry[]) {
  return entries.map((entry) => {
    const Icon = entry.icon;
    const content = (
      <>
        {Icon && <Icon aria-hidden />}
        {entry.label}
      </>
    );
    return (
      <Fragment key={entry.key}>
        {entry.separatorBefore && <kit.Separator />}
        {entry.href ? (
          <kit.Item asChild disabled={entry.disabled}>
            {entry.newTab ? (
              <a href={entry.href} target="_blank" rel="noreferrer">
                {content}
              </a>
            ) : (
              <Link href={entry.href}>{content}</Link>
            )}
          </kit.Item>
        ) : (
          <kit.Item variant={entry.destructive ? "destructive" : "default"} disabled={entry.disabled} onClick={entry.onSelect}>
            {content}
          </kit.Item>
        )}
      </Fragment>
    );
  });
}

/** Le bouton « … » d'un objet. */
export function ObjectMenuButton({ entries, label, className }: { entries: MenuEntry[]; label: string; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("h-7 w-7 shrink-0", className)} aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {renderEntries(DROPDOWN, entries)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Le clic droit sur un objet : `children` est l'élément qui le reçoit. */
export function ObjectContextMenu({ entries, children }: { entries: MenuEntry[]; children: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">{renderEntries(CONTEXT, entries)}</ContextMenuContent>
    </ContextMenu>
  );
}
