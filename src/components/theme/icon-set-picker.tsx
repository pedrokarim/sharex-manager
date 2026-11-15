"use client";

import { useEffect } from "react";
import { SetIcon, useIconTheme } from "@/components/icon-theme";
import { ICON_SETS, type IconConcept, type IconSetData, type IconSetId } from "@/lib/icon-themes/registry";
import { cn } from "@/lib/utils";

/** Les icônes montrées dans chaque choix : les écrans les plus visités. */
const SAMPLE: IconConcept[] = ["gallery", "uploads", "albums", "settings", "overview", "users", "logs", "theme", "system", "modules"];

interface IconSetPickerProps {
  /** Tous les jeux, chargés par la page : le choix s'affiche sans rien télécharger. */
  sets: IconSetData[];
  value: IconSetId;
  onChange: (id: IconSetId) => void;
}

/**
 * Choix du jeu d'icônes de l'interface. Le jeu choisi s'applique aussitôt à
 * toute la page (barre latérale comprise), d'un seul coup ; « Publier »
 * l'enregistre pour tout le monde. Quitter la page sans publier rend le jeu
 * publié.
 */
export function IconSetPicker({ sets, value, onChange }: IconSetPickerProps) {
  const theme = useIconTheme();
  const preview = theme?.preview;
  const publishedId = theme?.published.id;

  // L'aperçu suit le brouillon ; le jeu publié n'a pas besoin d'aperçu.
  useEffect(() => {
    if (!preview) return;
    if (value === publishedId) {
      preview(null);
      return;
    }
    const data = sets.find((set) => set.id === value);
    if (data) preview(data);
  }, [preview, publishedId, sets, value]);

  // En quittant la page, le jeu publié revient.
  useEffect(() => () => preview?.(null), [preview]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Jeu d’icônes">
      {ICON_SETS.map((info) => {
        const data = sets.find((set) => set.id === info.id) ?? { id: info.id, icons: {} };
        const checked = value === info.id;
        return (
          <button
            key={info.id}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(info.id)}
            className={cn(
              "flex min-w-0 flex-col gap-3 rounded-xl border p-4 text-left transition-colors",
              checked ? "border-foreground ring-1 ring-foreground" : "border-foreground/15 hover:border-foreground/40",
            )}
          >
            <span className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="truncate font-medium" title={info.label}>
                {info.label}
              </span>
              <span className="shrink-0 truncate text-xs text-muted-foreground" title={`Licence ${info.license}`}>
                {info.license}
              </span>
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-2 text-foreground">
              {SAMPLE.map((concept) => (
                <SetIcon key={concept} set={data} concept={concept} className="size-5 shrink-0" />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
