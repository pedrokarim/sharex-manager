"use client";

import type { ComponentType, ReactNode } from "react";
import { Check, Globe, Link2, Lock, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { ALBUM_VISIBILITIES, albumVisibility, type AlbumVisibility } from "@/lib/album-visibility";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Album } from "@/types/albums";

/**
 * Tout ce qui montre ou règle la visibilité d'un album : le choix dans un
 * menu (déroulant ou contextuel), le champ d'un formulaire, la pastille et la
 * petite icône. Un album se croise à beaucoup d'endroits ; ils passent tous
 * par ici pour dire la même chose avec les mêmes mots.
 */

type Flags = Pick<Album, "isPublic" | "inCatalog">;

export const VISIBILITY_ICONS: Record<AlbumVisibility, LucideIcon> = {
  private: Lock,
  link: Link2,
  catalog: Globe,
};

/**
 * Briques d'un menu. Un menu déroulant et un menu contextuel ont les mêmes
 * entrées, mais pas les mêmes composants : on passe ceux du menu hôte.
 */
export interface MenuKit {
  Item: ComponentType<{
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    children?: ReactNode;
  }>;
  Label: ComponentType<{ className?: string; children?: ReactNode }>;
}

const DROPDOWN_KIT: MenuKit = { Item: DropdownMenuItem, Label: DropdownMenuLabel };

interface AlbumVisibilityOptionsProps {
  album: Flags;
  onChange: (visibility: AlbumVisibility) => void;
  disabled?: boolean;
  /** Composants du menu hôte. Par défaut, ceux d'un menu déroulant. */
  kit?: MenuKit;
}

/**
 * Les trois visibilités d'un album, à poser dans un menu. Chacune dit en une
 * ligne ce qu'elle implique ; celle de l'album est cochée.
 */
export function AlbumVisibilityOptions({ album, onChange, disabled, kit = DROPDOWN_KIT }: AlbumVisibilityOptionsProps) {
  const { t } = useTranslation();
  const current = albumVisibility(album);

  return (
    <>
      <kit.Label className="text-xs font-medium text-muted-foreground">{t("albums.visibility.title")}</kit.Label>
      {ALBUM_VISIBILITIES.map((visibility) => {
        const Icon = VISIBILITY_ICONS[visibility];
        const selected = visibility === current;
        return (
          <kit.Item
            key={visibility}
            disabled={disabled}
            onClick={() => {
              if (!selected) onChange(visibility);
            }}
            className="items-start gap-2.5 text-sm"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t(`albums.visibility.${visibility}.label`)}</span>
              <span className="block max-w-56 text-xs text-muted-foreground">{t(`albums.visibility.${visibility}.hint`)}</span>
            </span>
            {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          </kit.Item>
        );
      })}
    </>
  );
}

interface AlbumVisibilityFieldProps {
  value: AlbumVisibility;
  onChange: (visibility: AlbumVisibility) => void;
  disabled?: boolean;
}

/** Le même choix, en champ de formulaire : pour créer ou modifier un album. */
export function AlbumVisibilityField({ value, onChange, disabled }: AlbumVisibilityFieldProps) {
  const { t } = useTranslation();

  return (
    <div role="radiogroup" aria-label={t("albums.visibility.title")} className="grid gap-2 sm:grid-cols-3">
      {ALBUM_VISIBILITIES.map((visibility) => {
        const Icon = VISIBILITY_ICONS[visibility];
        const selected = visibility === value;
        return (
          <button
            key={visibility}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(visibility)}
            className={cn(
              "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
              selected ? "border-primary bg-primary/10" : "border-border/70 bg-muted/20 hover:border-foreground/30",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon className="h-4 w-4 shrink-0" />
              {t(`albums.visibility.${visibility}.label`)}
            </span>
            <span className="text-xs text-muted-foreground">{t(`albums.visibility.${visibility}.hint`)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Pastille de visibilité. Un album privé n'en porte pas : c'est l'état normal. */
export function AlbumVisibilityBadge({ album, className }: { album: Flags; className?: string }) {
  const { t } = useTranslation();
  const visibility = albumVisibility(album);
  if (visibility === "private") return null;
  const Icon = VISIBILITY_ICONS[visibility];

  return (
    <Badge
      variant="default"
      className={cn("w-fit text-xs", visibility === "catalog" ? "bg-green-600" : "bg-sky-600", className)}
    >
      <Icon className="mr-1 h-2.5 w-2.5" />
      {t(`albums.visibility.${visibility}.badge`)}
    </Badge>
  );
}

/**
 * Petite icône de visibilité, à côté d'un nom d'album dans une liste ou un
 * menu : on sait, avant d'y ranger un fichier, si cet album est public.
 */
export function AlbumVisibilityIcon({ album, className }: { album: Flags; className?: string }) {
  const { t } = useTranslation();
  const visibility = albumVisibility(album);
  const Icon = VISIBILITY_ICONS[visibility];
  const label = t(`albums.visibility.${visibility}.label`);

  return (
    <span title={label} className={cn("inline-flex shrink-0", className)}>
      <Icon
        aria-label={label}
        className={cn(
          "h-3.5 w-3.5",
          visibility === "catalog" ? "text-green-600" : visibility === "link" ? "text-sky-600" : "text-muted-foreground",
        )}
      />
    </span>
  );
}
