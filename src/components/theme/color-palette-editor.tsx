"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import type { ThemeColorKey } from "@/types/theme-runtime";
import type { ThemeStyleProps } from "@/types/theme";

/**
 * Éditeur de palette : des couleurs, rien d'autre. Ni police, ni rayon, ni
 * espacement – ces valeurs du thème ne passent même pas par ici.
 */

interface ColorGroup {
  title: string;
  colors: { key: ThemeColorKey; label: string }[];
}

const GROUPS: ColorGroup[] = [
  {
    title: "Fond et texte",
    colors: [
      { key: "background", label: "Fond" },
      { key: "foreground", label: "Texte" },
      { key: "muted", label: "Fond atténué" },
      { key: "muted-foreground", label: "Texte atténué" },
    ],
  },
  {
    title: "Couleur principale",
    colors: [
      { key: "primary", label: "Principale" },
      { key: "primary-foreground", label: "Texte sur principale" },
      { key: "secondary", label: "Secondaire" },
      { key: "secondary-foreground", label: "Texte sur secondaire" },
      { key: "accent", label: "Survol" },
      { key: "accent-foreground", label: "Texte au survol" },
      { key: "destructive", label: "Danger" },
      { key: "destructive-foreground", label: "Texte sur danger" },
    ],
  },
  {
    title: "Cartes et fenêtres",
    colors: [
      { key: "card", label: "Carte" },
      { key: "card-foreground", label: "Texte de carte" },
      { key: "popover", label: "Menu et fenêtre" },
      { key: "popover-foreground", label: "Texte de menu" },
    ],
  },
  {
    title: "Traits et champs",
    colors: [
      { key: "border", label: "Bordure" },
      { key: "input", label: "Champ" },
      { key: "ring", label: "Contour de focus" },
    ],
  },
  {
    title: "Barre latérale",
    colors: [
      { key: "sidebar", label: "Fond" },
      { key: "sidebar-foreground", label: "Texte" },
      { key: "sidebar-primary", label: "Principale" },
      { key: "sidebar-primary-foreground", label: "Texte sur principale" },
      { key: "sidebar-accent", label: "Survol" },
      { key: "sidebar-accent-foreground", label: "Texte au survol" },
      { key: "sidebar-border", label: "Bordure" },
      { key: "sidebar-ring", label: "Contour de focus" },
    ],
  },
  {
    title: "Graphiques",
    colors: [
      { key: "chart-1", label: "Série 1" },
      { key: "chart-2", label: "Série 2" },
      { key: "chart-3", label: "Série 3" },
      { key: "chart-4", label: "Série 4" },
      { key: "chart-5", label: "Série 5" },
    ],
  },
];

const isColor = (value: string) => typeof CSS !== "undefined" && CSS.supports("color", value);

/**
 * Traduit n'importe quelle couleur CSS (`oklch(…)`, `hsl(…)`, nom…) en
 * hexadécimal, pour le sélecteur du navigateur, en gardant sa transparence à
 * part. Le canevas fait la conversion : aucune table de couleurs à embarquer.
 */
function toHex(value: string): { hex: string; alpha: number } | null {
  if (typeof document === "undefined" || !isColor(value)) return null;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  context.fillStyle = value;
  const computed = context.fillStyle;
  if (computed.startsWith("#")) return { hex: computed, alpha: 1 };
  const channels = computed.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) return null;
  const hex = `#${channels
    .slice(0, 3)
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
  return { hex, alpha: channels[3] ?? 1 };
}

/** La couleur choisie, avec la transparence qu'avait l'ancienne. */
function fromHex(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${red} ${green} ${blue} / ${Math.round(alpha * 100)}%)`;
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  // La conversion a besoin du navigateur : rien avant le montage.
  const [parsed, setParsed] = useState<{ hex: string; alpha: number } | null>(null);

  useEffect(() => {
    setDraft(value);
    setParsed(toHex(value));
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value && isColor(next)) onChange(next);
    else setDraft(value);
  };

  return (
    <label className="flex items-center gap-3">
      <span className="relative size-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-foreground/25" style={{ backgroundColor: value }}>
        <input
          type="color"
          value={parsed?.hex ?? "#000000"}
          onChange={(event) => onChange(fromHex(event.target.value, parsed?.alpha ?? 1))}
          aria-label={label}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          spellCheck={false}
          aria-label={`${label} : valeur`}
          className="mt-1 h-7 px-2 font-mono text-xs text-muted-foreground"
        />
      </span>
    </label>
  );
}

interface ColorPaletteEditorProps {
  /** Les valeurs d'un mode du thème, clair ou sombre. */
  palette: ThemeStyleProps;
  onChange: (key: ThemeColorKey, value: string) => void;
}

export function ColorPaletteEditor({ palette, onChange }: ColorPaletteEditorProps) {
  return (
    <div className="space-y-8">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="text-sm font-semibold tracking-tight">{group.title}</h3>
          <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {group.colors.map((color) => (
              <ColorRow
                key={color.key}
                label={color.label}
                value={palette[color.key]}
                onChange={(value) => onChange(color.key, value)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Aperçu d'une palette. Les variables sont posées sur ce bloc seulement : il
 * montre le mode en cours d'édition, quel que soit celui de la page autour.
 */
export function ColorPalettePreview({ palette }: { palette: ThemeStyleProps }) {
  const variables = Object.fromEntries(
    GROUPS.flatMap((group) => group.colors).map((color) => [`--${color.key}`, palette[color.key]]),
  ) as React.CSSProperties;

  return (
    <div style={variables} className="flex overflow-hidden rounded-2xl border border-border bg-background text-foreground">
      <div className="flex w-28 shrink-0 flex-col gap-1.5 border-r border-sidebar-border bg-sidebar p-3 text-xs text-sidebar-foreground">
        <span className="rounded-md bg-sidebar-primary px-2 py-1.5 font-medium text-sidebar-primary-foreground">Galerie</span>
        <span className="rounded-md bg-sidebar-accent px-2 py-1.5 text-sidebar-accent-foreground">Uploads</span>
        <span className="px-2 py-1.5">Albums</span>
        <span className="px-2 py-1.5">Réglages</span>
      </div>
      <div className="min-w-0 flex-1 space-y-4 p-4">
        <div>
          <p className="text-base font-semibold">Aperçu</p>
          <p className="text-sm text-muted-foreground">Un texte courant, et sa version atténuée.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-card-foreground">
          <p className="text-sm font-medium">Une carte</p>
          <div className="mt-2 h-8 rounded-md border border-input bg-background px-2 text-xs leading-8 text-muted-foreground">
            Un champ de saisie
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">Principal</span>
            <span className="rounded-md bg-secondary px-3 py-1.5 text-secondary-foreground">Secondaire</span>
            <span className="rounded-md bg-accent px-3 py-1.5 text-accent-foreground">Survol</span>
            {/* Cette couleur de texte n'a pas de classe utilitaire dans le thème. */}
            <span className="rounded-md bg-destructive px-3 py-1.5" style={{ color: palette["destructive-foreground"] }}>
              Danger
            </span>
          </div>
        </div>
        <div className="flex h-16 items-end gap-1.5 rounded-xl bg-muted p-2">
          {(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const).map((key, index) => (
            <span key={key} className="flex-1 rounded-sm" style={{ backgroundColor: palette[key], height: `${40 + ((index * 37) % 60)}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
